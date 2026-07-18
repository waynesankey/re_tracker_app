import json
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from database import Base, engine, get_db, SessionLocal
from photos import PHOTOS_DIR, cache_photo
from models import (
    ListingCreate, ListingDB, ListingResponse, ListingUpdate,
    StatusHistoryDB, StatusHistoryResponse,
    PriceHistoryDB, PriceHistoryResponse,
    ProposalLogDB, ProposalLogResponse,
    IngestLogDB, IngestLogResponse, IngestRequest,
    ProposeRequest, AgreeRequest, WithdrawRequest, RejectRequest,
    ReorderRequest, MarkViewedRequest,
)
from scraper import scrape_listing

Base.metadata.create_all(bind=engine)

# Backfill initial status history for listings that don't have one yet.
with engine.connect() as _conn:
    _conn.execute(text("""
        INSERT INTO status_history (listing_id, from_category, to_category, changed_at)
        SELECT id, NULL, category, date_added
        FROM listings
        WHERE id NOT IN (SELECT DISTINCT listing_id FROM status_history)
    """))
    # Backfill initial price history ("Listed at $X") for listings with a price
    # that have no price history record yet.
    _conn.execute(text("""
        INSERT INTO price_history (listing_id, old_price, new_price, recorded_at)
        SELECT id, NULL, price, date_added
        FROM listings
        WHERE price IS NOT NULL
        AND id NOT IN (SELECT DISTINCT listing_id FROM price_history)
    """))
    for col in (
        "property_type TEXT", "listing_id TEXT", "class_id TEXT",
        "proposed_category TEXT", "proposed_by TEXT", "proposed_at DATETIME",
        "rank INTEGER", "listing_status TEXT", "waterfront BOOLEAN",
        "lat REAL", "lng REAL",
    ):
        try:
            _conn.execute(text(f"ALTER TABLE listings ADD COLUMN {col}"))
            _conn.commit()
        except Exception:
            pass  # column already exists

    try:
        _conn.execute(text("ALTER TABLE status_history ADD COLUMN changed_by TEXT"))
        _conn.commit()
    except Exception:
        pass

    _conn.execute(text("""
        CREATE TABLE IF NOT EXISTS proposal_log (
            id INTEGER PRIMARY KEY,
            listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
            from_category TEXT NOT NULL,
            to_category TEXT NOT NULL,
            proposed_by TEXT NOT NULL,
            proposed_at DATETIME NOT NULL,
            action TEXT NOT NULL,
            action_by TEXT NOT NULL,
            action_at DATETIME NOT NULL,
            note TEXT
        )
    """))
    _conn.commit()

    _conn.execute(text(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)"
    ))
    _conn.commit()

    _conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ingest_log (
            id INTEGER PRIMARY KEY,
            run_at DATETIME NOT NULL,
            run_by TEXT,
            viewpoint_total INTEGER,
            price_lot_filtered INTEGER,
            already_tracked INTEGER,
            waterfront_skipped INTEGER,
            resurrected INTEGER,
            added INTEGER
        )
    """))
    _conn.commit()

    # Enforce rank uniqueness within each {property_type, category} group.
    _conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rank_type_cat
        ON listings(rank, property_type, category)
        WHERE rank IS NOT NULL
    """))
    _conn.commit()

    _conn.execute(text("""
        CREATE TABLE IF NOT EXISTS sold_views (
            user TEXT PRIMARY KEY,
            last_viewed_at TEXT NOT NULL
        )
    """))
    # Pre-populate known users so existing Sold listings don't appear as unseen
    _seed_ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')
    for _u in ("Wayne", "Christina"):
        _conn.execute(
            text("INSERT OR IGNORE INTO sold_views (user, last_viewed_at) VALUES (:u, :t)"),
            {"u": _u, "t": _seed_ts},
        )
    _conn.commit()

    # Backfill listing_id / class_id from URL for existing viewpoint listings
    import re as _re
    _vp_rows = _conn.execute(text(
        "SELECT id, url FROM listings WHERE url LIKE '%/cutsheet/%'"
        " AND (listing_id IS NULL OR class_id IS NULL)"
    )).fetchall()
    for _rid, _rurl in _vp_rows:
        _m = _re.search(r"/cutsheet/(\d+)/(\d+)", _rurl or "")
        if _m:
            _conn.execute(
                text("UPDATE listings SET listing_id=:lid, class_id=:cid WHERE id=:id"),
                {"lid": _m.group(1), "cid": _m.group(2), "id": _rid},
            )
    _conn.commit()


def _migrate_photos_background():
    """Download and cache photos for all listings that still have remote image URLs."""
    try:
        db = SessionLocal()
        to_cache = [
            (l.id, l.image_url) for l in
            db.query(ListingDB)
              .filter(ListingDB.image_url.isnot(None))
              .filter(~ListingDB.image_url.like("/photos/%"))
              .all()
        ]
        db.close()

        if not to_cache:
            return

        def _download(item):
            db_id, remote_url = item
            local_url = cache_photo(db_id, remote_url)
            if local_url:
                sess = SessionLocal()
                try:
                    listing = sess.get(ListingDB, db_id)
                    if listing:
                        listing.image_url = local_url
                        sess.commit()
                finally:
                    sess.close()

        with ThreadPoolExecutor(max_workers=8) as _ex:
            list(_ex.map(_download, to_cache))
    except Exception:
        pass


threading.Thread(target=_migrate_photos_background, daemon=True).start()

app = FastAPI(title="Real Estate Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


RANKED_CATEGORIES = {"Interested", "Showing Requested", "Visited"}

# Categories that bypass the two-vote proposal flow and move immediately.
DIRECT_MOVE_CATEGORIES = {"Sold", "Listing Withdrawn"}



def _next_rank(db: Session, property_type: str, category: str, exclude_id: int) -> int:
    max_rank = db.query(func.max(ListingDB.rank)).filter(
        ListingDB.property_type == property_type,
        ListingDB.category == category,
        ListingDB.id != exclude_id,
    ).scalar()
    return (max_rank or 0) + 1


def _compact_ranks(db: Session, property_type: str, category: str, removed_rank: int):
    """After a listing leaves a ranked group, close the gap: shift all listings
    ranked below it (higher number) down by 1.  Uses a two-phase null→assign
    approach to avoid unique-constraint violations during the shift."""
    affected = (
        db.query(ListingDB)
        .filter(
            ListingDB.property_type == property_type,
            ListingDB.category == category,
            ListingDB.rank > removed_rank,
        )
        .all()
    )
    if not affected:
        return
    new_ranks = {l.id: l.rank - 1 for l in affected}
    for l in affected:
        l.rank = None
    db.flush()
    for l in affected:
        l.rank = new_ranks[l.id]


@app.get("/api/listings", response_model=List[ListingResponse])
def get_listings(
    category: Optional[str] = None,
    property_type: Optional[str] = None,
    sort: Optional[str] = "date_added",
    price_changed: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    q = db.query(ListingDB).filter(ListingDB.proposed_category.is_(None))
    if property_type:
        q = q.filter(ListingDB.property_type == property_type)
    if category:
        q = q.filter(ListingDB.category == category)
    if price_changed:
        # Join to the most-recent price change per listing; sort by that date desc
        latest_change = (
            db.query(
                PriceHistoryDB.listing_id,
                func.max(PriceHistoryDB.recorded_at).label("last_change"),
            )
            .filter(PriceHistoryDB.old_price.isnot(None))
            .group_by(PriceHistoryDB.listing_id)
            .subquery()
        )
        q = q.join(latest_change, ListingDB.id == latest_change.c.listing_id)
        q = q.order_by(latest_change.c.last_change.desc())
    elif sort == "rank":
        q = q.order_by(ListingDB.rank.asc().nullslast(), ListingDB.property_type.asc(), ListingDB.date_added.desc())
    elif sort == "price":
        q = q.order_by(ListingDB.price.asc().nullslast())
    else:
        q = q.order_by(ListingDB.date_added.desc())
    return q.all()


_MLS_RE = re.compile(r'^(?:mls[#:\s]*)?\s*(\d{8,9})\s*$', re.IGNORECASE)
_VP_BASE = "https://www.viewpoint.ca"

def _resolve_mls(mls_id: str):
    """Try Viewpoint class_ids in order; return (url, meta) for the first live listing."""
    for cid in ("1", "5", "2", "3", "4", "6"):
        candidate = f"{_VP_BASE}/cutsheet/{mls_id}/{cid}"
        try:
            m = scrape_listing(candidate)
            if m.get("price") is not None or m.get("address"):
                return candidate, m, cid
        except Exception:
            pass
    return None, None, None


@app.post("/api/listings", response_model=ListingResponse)
def create_listing(body: ListingCreate, db: Session = Depends(get_db)):
    raw = body.url.strip()
    resolved_listing_id = None
    resolved_class_id = None

    mls_match = _MLS_RE.match(raw)
    if mls_match:
        mls_id = mls_match.group(1)
        url, meta, resolved_class_id = _resolve_mls(mls_id)
        if not url:
            raise HTTPException(status_code=404, detail=f"MLS# {mls_id} not found on Viewpoint")
        resolved_listing_id = mls_id
    else:
        url = raw
        meta = scrape_listing(url)
        # Extract MLS ids from viewpoint cutsheet URLs that were pasted directly
        from viewpoint_ingest import extract_ids_from_url
        resolved_listing_id, resolved_class_id = extract_ids_from_url(url)

    # Duplicate check by address — more reliable than listing_id since a property
    # can be re-listed with a new MLS number but the address never changes.
    scraped_address = (meta.get("address") or "").strip()
    if scraped_address:
        existing = db.query(ListingDB).filter(
            func.lower(ListingDB.address) == scraped_address.lower()
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail={"id": existing.id, "message": f"Already tracking: {existing.address} ({existing.property_type} · {existing.category})"},
            )

    # Geocode the address so the map view can plot this listing.
    # Best source: lat/lng from Viewpoint API (in meta for MLS lookups).
    # Fallback: Nominatim on the scraped address.
    lat = meta.get("lat")
    lng = meta.get("lng")
    if (lat is None or lng is None) and scraped_address:
        from geocode import geocode as _geocode
        lat, lng = _geocode(scraped_address)

    now = datetime.utcnow()
    listing = ListingDB(
        url=url,
        source_domain=meta.get("source_domain"),
        image_url=meta.get("image_url"),
        title=meta.get("title"),
        price=meta.get("price"),
        address=scraped_address or None,
        category="New",
        property_type=meta.get("property_type"),
        listing_status=meta.get("listing_status"),
        waterfront=meta.get("waterfront"),
        lat=lat,
        lng=lng,
        listing_id=resolved_listing_id,
        class_id=resolved_class_id,
        date_added=now,
        date_updated=now,
    )
    db.add(listing)
    db.flush()  # get listing.id before adding history
    db.add(StatusHistoryDB(
        listing_id=listing.id,
        from_category=None,
        to_category="New",
        changed_at=now,
    ))
    if listing.price is not None:
        db.add(PriceHistoryDB(
            listing_id=listing.id,
            old_price=None,
            new_price=float(listing.price),
            recorded_at=now,
        ))
    db.commit()
    db.refresh(listing)
    return listing


@app.get("/api/listings/count")
def get_listing_count(db: Session = Depends(get_db)):
    return {"count": db.query(ListingDB).count()}


@app.get("/api/listings/version")
def get_listings_version(db: Session = Depends(get_db)):
    """Lightweight endpoint — returns the latest date_updated across all listings.
    Clients poll this and only refetch the full list when the value changes."""
    result = db.execute(text("SELECT MAX(date_updated) FROM listings")).scalar()
    return {"version": result or ""}


@app.get("/api/listings/search", response_model=List[ListingResponse])
def search_listings(q: str = "", db: Session = Depends(get_db)):
    q = q.strip()
    if len(q) < 2:
        return []
    mls_match = _MLS_RE.match(q)
    if mls_match:
        return (
            db.query(ListingDB)
            .filter(ListingDB.listing_id == mls_match.group(1))
            .all()
        )
    pattern = f"%{q.lower()}%"
    return (
        db.query(ListingDB)
        .filter(or_(
            func.lower(ListingDB.address).like(pattern),
            func.lower(ListingDB.title).like(pattern),
        ))
        .order_by(ListingDB.address.asc())
        .limit(10)
        .all()
    )


@app.get("/api/listings/{listing_id}", response_model=ListingResponse)
def get_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.get(ListingDB, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")
    return listing


@app.get("/api/listings/{listing_id}/history", response_model=List[StatusHistoryResponse])
def get_listing_history(listing_id: int, db: Session = Depends(get_db)):
    if not db.get(ListingDB, listing_id):
        raise HTTPException(status_code=404, detail="Not found")
    return (
        db.query(StatusHistoryDB)
        .filter(StatusHistoryDB.listing_id == listing_id)
        .order_by(StatusHistoryDB.changed_at.asc())
        .all()
    )


@app.get("/api/listings/{listing_id}/price-history", response_model=List[PriceHistoryResponse])
def get_price_history(listing_id: int, db: Session = Depends(get_db)):
    if not db.get(ListingDB, listing_id):
        raise HTTPException(status_code=404, detail="Not found")
    return (
        db.query(PriceHistoryDB)
        .filter(PriceHistoryDB.listing_id == listing_id)
        .order_by(PriceHistoryDB.recorded_at.asc())
        .all()
    )


@app.post("/api/listings/refresh-prices")
def refresh_prices(db: Session = Depends(get_db)):
    listings = db.query(ListingDB).filter(
        ListingDB.category.notin_(["Sold", "Listing Withdrawn"])
    ).all()
    to_check = [
        l for l in listings
        if l.url and "viewpoint.ca" in l.url and re.search(r"/cutsheet/\d+/\d+", l.url)
    ]
    total = len(to_check)

    def generate():
        results = []
        changes = []
        now = datetime.utcnow()
        id_to_listing = {l.id: l for l in to_check}
        scrape_results = {}  # listing_id -> meta dict, or None on failure

        # Scrape all listings in parallel, stream a progress event as each finishes.
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_id = {executor.submit(scrape_listing, l.url): l.id for l in to_check}
            completed = 0
            for future in as_completed(future_to_id):
                lid = future_to_id[future]
                listing = id_to_listing[lid]
                completed += 1
                label = listing.address or listing.title or ""
                yield f"data: {json.dumps({'type': 'progress', 'current': completed, 'total': total, 'address': label})}\n\n"
                try:
                    scrape_results[lid] = future.result()
                except Exception:
                    scrape_results[lid] = None

        # Apply DB changes single-threaded after all scrapes are done.
        for listing in to_check:
            meta = scrape_results.get(listing.id)
            old_price = float(listing.price) if listing.price is not None else None

            base = {
                "id": listing.id, "address": listing.address, "title": listing.title,
                "property_type": listing.property_type, "category": listing.category,
            }

            if meta is None:
                # Scraper threw an exception (timeout / network error) — transient, don't auto-withdraw
                results.append({**base, "status": "skipped", "old_price": None, "new_price": None, "current_price": old_price})
                continue

            if meta.get("viewpoint_map_redirect"):
                # Viewpoint redirected the cutsheet to their map — URL changed but listing may still be active.
                # Treat as skipped (could not fetch) rather than withdrawn.
                results.append({**base, "status": "skipped", "old_price": None, "new_price": None, "current_price": old_price})
                continue

            if "listing_status" in meta:
                new_status = meta["listing_status"]
                if new_status != listing.listing_status:
                    listing.listing_status = new_status
                    listing.date_updated = now

            new_price = meta.get("price")
            if new_price is None:
                # Listing page loaded but returned no price → listing no longer available on Viewpoint.
                # Sold and Listing Withdrawn are already excluded from to_check, so auto-withdraw all others.
                old_category = listing.category
                old_rank = listing.rank
                listing.category = "Listing Withdrawn"
                listing.rank = None
                listing.date_updated = now
                db.add(StatusHistoryDB(
                    listing_id=listing.id,
                    from_category=old_category,
                    to_category="Listing Withdrawn",
                    changed_at=now,
                ))
                db.flush()
                if old_category in RANKED_CATEGORIES and old_rank is not None:
                    _compact_ranks(db, listing.property_type, old_category, old_rank)
                results.append({**base, "category": old_category, "status": "withdrawn",
                                "old_price": None, "new_price": None, "current_price": old_price})
                continue

            # Always keep waterfront in sync regardless of price change
            wf = meta.get("waterfront")
            if wf is not None and wf != listing.waterfront:
                listing.waterfront = wf
                listing.date_updated = now

            if old_price == new_price:
                results.append({**base, "status": "unchanged", "old_price": None, "new_price": None, "current_price": old_price})
                continue

            db.add(PriceHistoryDB(
                listing_id=listing.id,
                old_price=old_price,
                new_price=new_price,
                recorded_at=now,
            ))
            listing.price = new_price
            listing.date_updated = now
            results.append({**base, "status": "changed", "old_price": old_price, "new_price": new_price, "current_price": new_price})
            changes.append({
                "id": listing.id, "address": listing.address, "title": listing.title,
                "old_price": old_price, "new_price": new_price,
            })

        db.commit()
        yield f"data: {json.dumps({'type': 'done', 'results': results, 'changes': changes})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/listings/reorder")
def reorder_listings(body: ReorderRequest, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    # Null out ranks first so the unique-per-{type,category} index is never
    # violated mid-flush when two listings need to swap rank values.
    listings_map = {}
    for item in body.items:
        listing = db.get(ListingDB, item.id)
        if listing:
            listings_map[item.id] = (listing, item.rank)
            listing.rank = None
    db.flush()
    for listing, new_rank in listings_map.values():
        listing.rank = new_rank
        listing.date_updated = now
    db.commit()
    return {"ok": True}


@app.put("/api/listings/{listing_id}", response_model=ListingResponse)
def update_listing(listing_id: int, body: ListingUpdate, db: Session = Depends(get_db)):
    listing = db.get(ListingDB, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")

    updates = body.model_dump(exclude_unset=True)
    old_category = listing.category
    old_rank = listing.rank
    old_property_type = listing.property_type
    old_price = float(listing.price) if listing.price is not None else None

    for field, value in updates.items():
        setattr(listing, field, value)
    listing.date_updated = datetime.utcnow()

    new_category = updates.get("category")
    if new_category and new_category != old_category:
        if new_category in RANKED_CATEGORIES:
            listing.rank = _next_rank(db, listing.property_type, new_category, listing_id)
        else:
            listing.rank = None
        db.flush()
        if old_category in RANKED_CATEGORIES and old_rank is not None:
            _compact_ranks(db, old_property_type, old_category, old_rank)
        db.add(StatusHistoryDB(
            listing_id=listing_id,
            from_category=old_category,
            to_category=new_category,
            changed_at=listing.date_updated,
        ))

    if "price" in updates:
        new_price = float(listing.price) if listing.price is not None else None
        if new_price != old_price:
            db.add(PriceHistoryDB(
                listing_id=listing_id,
                old_price=old_price,
                new_price=new_price,
                recorded_at=listing.date_updated,
            ))

    db.commit()
    db.refresh(listing)
    return listing


@app.post("/api/ingest")
def ingest_listings(body: IngestRequest = IngestRequest(), db: Session = Depends(get_db)):
    from viewpoint_ingest import fetch_new_hrm_listings
    from datetime import date as date_cls

    fetch_result = fetch_new_hrm_listings()
    new_listings = fetch_result["listings"]
    viewpoint_total = fetch_result["viewpoint_total"]
    price_lot_filtered = fetch_result["price_lot_filtered"]

    existing_keys = {
        (r[0], r[1])
        for r in db.execute(text(
            "SELECT listing_id, class_id FROM listings"
            " WHERE listing_id IS NOT NULL AND class_id IS NOT NULL"
        )).fetchall()
    }

    inactive = db.query(ListingDB).filter(
        ListingDB.category.in_(["Sold", "Listing Withdrawn"])
    ).all()
    inactive_by_address = {
        l.address.lower().strip(): l
        for l in inactive
        if l.address
    }

    added = 0
    resurrected = 0
    already_tracked = 0
    waterfront_skipped = 0
    now = datetime.utcnow()

    for item in new_listings:
        key = (item["listing_id"], item["class_id"])
        if key in existing_keys:
            already_tracked += 1
            continue

        try:
            meta = scrape_listing(item["url"])
        except Exception:
            meta = {}
        image_url = meta.get("image_url") or item.get("image_url")
        title = meta.get("title") or None

        scraped_address = (meta.get("address") or "").lower().strip()
        api_address = (item.get("address") or "").lower().strip()
        existing_inactive = (
            inactive_by_address.get(scraped_address) or
            inactive_by_address.get(api_address)
        )

        if existing_inactive:
            old_category = existing_inactive.category
            old_price = float(existing_inactive.price) if existing_inactive.price is not None else None
            new_price = item.get("price")
            existing_inactive.listing_id = item["listing_id"]
            existing_inactive.class_id = item["class_id"]
            existing_inactive.url = item["url"]
            existing_inactive.property_type = item["property_type"]
            existing_inactive.category = "Inbox"
            existing_inactive.rank = None
            existing_inactive.listing_status = meta.get("listing_status")
            if meta.get("waterfront") is not None:
                existing_inactive.waterfront = meta.get("waterfront")
            if item.get("lat") is not None:
                existing_inactive.lat = item["lat"]
                existing_inactive.lng = item["lng"]
            existing_inactive.date_updated = now
            if title:
                existing_inactive.title = title
            local_url = cache_photo(existing_inactive.id, image_url)
            existing_inactive.image_url = local_url or image_url
            db.add(StatusHistoryDB(
                listing_id=existing_inactive.id,
                from_category=old_category,
                to_category="Inbox",
                changed_at=now,
            ))
            if new_price is not None and float(new_price) != old_price:
                existing_inactive.price = new_price
                db.add(PriceHistoryDB(
                    listing_id=existing_inactive.id,
                    old_price=old_price,
                    new_price=float(new_price),
                    recorded_at=now,
                ))
            inactive_by_address.pop(scraped_address, None)
            inactive_by_address.pop(api_address, None)
            existing_keys.add(key)
            resurrected += 1
            continue

        # Only auto-ingest waterfront properties.
        if meta.get("waterfront") is not True:
            waterfront_skipped += 1
            continue

        listing = ListingDB(
            url=item["url"],
            source_domain="viewpoint.ca",
            image_url=image_url,
            title=title,
            listing_id=item["listing_id"],
            class_id=item["class_id"],
            address=item.get("address") or None,
            price=item.get("price"),
            category="Inbox",
            property_type=item["property_type"],
            listing_status=meta.get("listing_status"),
            waterfront=meta.get("waterfront"),
            lat=item.get("lat"),
            lng=item.get("lng"),
            date_added=now,
            date_updated=now,
        )
        db.add(listing)
        db.flush()
        local_url = cache_photo(listing.id, image_url)
        if local_url:
            listing.image_url = local_url
        db.add(StatusHistoryDB(
            listing_id=listing.id,
            from_category=None,
            to_category="Inbox",
            changed_at=now,
        ))
        if listing.price is not None:
            db.add(PriceHistoryDB(
                listing_id=listing.id,
                old_price=None,
                new_price=float(listing.price),
                recorded_at=now,
            ))
        existing_keys.add(key)
        added += 1

    db.add(IngestLogDB(
        run_at=now,
        run_by=body.run_by,
        viewpoint_total=viewpoint_total,
        price_lot_filtered=price_lot_filtered,
        already_tracked=already_tracked,
        waterfront_skipped=waterfront_skipped,
        resurrected=resurrected,
        added=added,
    ))
    db.execute(
        text("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_ingest_date', :v)"),
        {"v": date_cls.today().isoformat()},
    )
    db.commit()
    return {
        "added": added,
        "resurrected": resurrected,
        "fetched": price_lot_filtered,
        "viewpoint_total": viewpoint_total,
        "price_lot_filtered": price_lot_filtered,
        "already_tracked": already_tracked,
        "waterfront_skipped": waterfront_skipped,
        "run_at": now.isoformat(),
        "run_by": body.run_by,
    }


@app.get("/api/ingest/history", response_model=List[IngestLogResponse])
def get_ingest_history(db: Session = Depends(get_db)):
    return (
        db.query(IngestLogDB)
        .order_by(IngestLogDB.run_at.desc())
        .limit(50)
        .all()
    )


@app.get("/api/proposals", response_model=List[ListingResponse])
def get_proposals(db: Session = Depends(get_db)):
    return (
        db.query(ListingDB)
        .filter(ListingDB.proposed_category.isnot(None))
        .order_by(ListingDB.proposed_at.asc())
        .all()
    )


@app.post("/api/listings/{listing_id}/propose", response_model=ListingResponse)
def propose_change(listing_id: int, body: ProposeRequest, db: Session = Depends(get_db)):
    listing = db.get(ListingDB, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")
    if listing.proposed_category:
        raise HTTPException(status_code=409, detail="A proposal is already pending")
    now = datetime.utcnow()

    # Sold and Listing Withdrawn are direct, immediate changes — no second vote needed
    if body.new_category in DIRECT_MOVE_CATEGORIES:
        old_category = listing.category
        old_rank = listing.rank
        old_property_type = listing.property_type
        listing.category = body.new_category
        listing.rank = None
        listing.date_updated = now
        db.add(StatusHistoryDB(
            listing_id=listing_id,
            from_category=old_category,
            to_category=body.new_category,
            changed_at=now,
            changed_by=body.proposed_by,
        ))
        db.flush()
        if old_category in RANKED_CATEGORIES and old_rank is not None:
            _compact_ranks(db, old_property_type, old_category, old_rank)
        db.commit()
        db.refresh(listing)
        return listing

    # All other categories go through the two-vote proposal flow
    listing.proposed_category = body.new_category
    listing.proposed_by = body.proposed_by
    listing.proposed_at = now
    db.add(ProposalLogDB(
        listing_id=listing_id,
        from_category=listing.category,
        to_category=body.new_category,
        proposed_by=body.proposed_by,
        proposed_at=now,
        action="proposed",
        action_by=body.proposed_by,
        action_at=now,
    ))
    db.commit()
    db.refresh(listing)
    return listing


@app.get("/api/sold/unseen")
def get_sold_unseen(user: str, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT last_viewed_at FROM sold_views WHERE user = :u"),
        {"u": user},
    ).fetchone()
    last_viewed = row[0] if row else None

    if last_viewed is None:
        count = db.query(ListingDB).filter(ListingDB.category == "Sold").count()
    else:
        count = db.execute(text("""
            SELECT COUNT(*) FROM (
                SELECT listing_id, MAX(changed_at) AS sold_at
                FROM status_history
                WHERE to_category = 'Sold'
                GROUP BY listing_id
            ) sold_times
            JOIN listings l ON l.id = sold_times.listing_id
            WHERE l.category = 'Sold'
            AND sold_times.sold_at > :last_viewed
        """), {"last_viewed": last_viewed}).scalar()

    return {"count": count}


@app.post("/api/sold/mark-viewed")
def mark_sold_viewed(body: MarkViewedRequest, db: Session = Depends(get_db)):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')
    db.execute(
        text("INSERT OR REPLACE INTO sold_views (user, last_viewed_at) VALUES (:u, :t)"),
        {"u": body.user, "t": ts},
    )
    db.commit()
    return {"ok": True}


@app.post("/api/listings/{listing_id}/agree", response_model=ListingResponse)
def agree_change(listing_id: int, body: AgreeRequest, db: Session = Depends(get_db)):
    listing = db.get(ListingDB, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")
    if not listing.proposed_category:
        raise HTTPException(status_code=409, detail="No proposal pending")
    if body.agreed_by == listing.proposed_by:
        raise HTTPException(status_code=403, detail="Cannot agree to your own proposal")
    now = datetime.utcnow()
    old_category = listing.category
    old_rank = listing.rank
    old_property_type = listing.property_type
    new_category = listing.proposed_category
    db.add(StatusHistoryDB(
        listing_id=listing_id,
        from_category=old_category,
        to_category=new_category,
        changed_at=now,
        changed_by=body.agreed_by,
    ))
    db.add(ProposalLogDB(
        listing_id=listing_id,
        from_category=old_category,
        to_category=new_category,
        proposed_by=listing.proposed_by,
        proposed_at=listing.proposed_at,
        action="agreed",
        action_by=body.agreed_by,
        action_at=now,
    ))
    listing.category = new_category
    listing.proposed_category = None
    listing.proposed_by = None
    listing.proposed_at = None
    listing.rank = _next_rank(db, listing.property_type, new_category, listing_id) if new_category in RANKED_CATEGORIES else None
    listing.date_updated = now
    db.flush()
    if old_category in RANKED_CATEGORIES and old_rank is not None:
        _compact_ranks(db, old_property_type, old_category, old_rank)
    db.commit()
    db.refresh(listing)
    return listing


@app.post("/api/listings/{listing_id}/withdraw", response_model=ListingResponse)
def withdraw_proposal(listing_id: int, body: WithdrawRequest, db: Session = Depends(get_db)):
    listing = db.get(ListingDB, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")
    if not listing.proposed_category:
        raise HTTPException(status_code=409, detail="No proposal pending")
    if body.withdrawn_by != listing.proposed_by:
        raise HTTPException(status_code=403, detail="Only the proposer can withdraw")
    now = datetime.utcnow()
    db.add(ProposalLogDB(
        listing_id=listing_id,
        from_category=listing.category,
        to_category=listing.proposed_category,
        proposed_by=listing.proposed_by,
        proposed_at=listing.proposed_at,
        action="withdrawn",
        action_by=body.withdrawn_by,
        action_at=now,
    ))
    listing.proposed_category = None
    listing.proposed_by = None
    listing.proposed_at = None
    db.commit()
    db.refresh(listing)
    return listing


@app.post("/api/listings/{listing_id}/reject", response_model=ListingResponse)
def reject_proposal(listing_id: int, body: RejectRequest, db: Session = Depends(get_db)):
    listing = db.get(ListingDB, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")
    if not listing.proposed_category:
        raise HTTPException(status_code=409, detail="No proposal pending")
    if body.rejected_by == listing.proposed_by:
        raise HTTPException(status_code=403, detail="Cannot reject your own proposal")
    now = datetime.utcnow()
    db.add(ProposalLogDB(
        listing_id=listing_id,
        from_category=listing.category,
        to_category=listing.proposed_category,
        proposed_by=listing.proposed_by,
        proposed_at=listing.proposed_at,
        action="rejected",
        action_by=body.rejected_by,
        action_at=now,
        note=body.note,
    ))
    listing.proposed_category = None
    listing.proposed_by = None
    listing.proposed_at = None
    db.commit()
    db.refresh(listing)
    return listing


@app.get("/api/listings/{listing_id}/proposal-log", response_model=List[ProposalLogResponse])
def get_proposal_log(listing_id: int, db: Session = Depends(get_db)):
    if not db.get(ListingDB, listing_id):
        raise HTTPException(status_code=404, detail="Not found")
    return (
        db.query(ProposalLogDB)
        .filter(ProposalLogDB.listing_id == listing_id)
        .order_by(ProposalLogDB.action_at.asc())
        .all()
    )


@app.delete("/api/listings/{listing_id}")
def delete_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.get(ListingDB, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")
    old_category = listing.category
    old_rank = listing.rank
    old_property_type = listing.property_type
    db.delete(listing)
    db.flush()
    if old_category in RANKED_CATEGORIES and old_rank is not None:
        _compact_ranks(db, old_property_type, old_category, old_rank)
    db.commit()
    return {"ok": True}


# Serve built React frontend
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")

app.mount("/photos", StaticFiles(directory=PHOTOS_DIR), name="photos")

if os.path.exists(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
