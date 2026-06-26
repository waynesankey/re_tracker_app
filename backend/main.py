import os
from datetime import datetime
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import (
    ListingCreate, ListingDB, ListingResponse, ListingUpdate,
    StatusHistoryDB, StatusHistoryResponse,
    PriceHistoryDB, PriceHistoryResponse,
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
    try:
        _conn.execute(text("ALTER TABLE listings ADD COLUMN property_type TEXT"))
        _conn.commit()
    except Exception:
        pass  # column already exists

app = FastAPI(title="Real Estate Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/listings", response_model=List[ListingResponse])
def get_listings(
    category: Optional[str] = None,
    property_type: Optional[str] = None,
    sort: Optional[str] = "date_added",
    price_changed: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    q = db.query(ListingDB)
    if property_type:
        q = q.filter(ListingDB.property_type == property_type)
    if category:
        q = q.filter(ListingDB.category == category)
    if price_changed:
        # Listings that have at least one recorded price change (old_price not null)
        changed_ids = (
            db.query(PriceHistoryDB.listing_id)
            .filter(PriceHistoryDB.old_price.isnot(None))
            .distinct()
            .subquery()
        )
        q = q.filter(ListingDB.id.in_(changed_ids))
    if sort == "price":
        q = q.order_by(ListingDB.price.asc().nullslast())
    else:
        q = q.order_by(ListingDB.date_added.desc())
    return q.all()


@app.post("/api/listings", response_model=ListingResponse)
def create_listing(body: ListingCreate, db: Session = Depends(get_db)):
    meta = scrape_listing(body.url)
    now = datetime.utcnow()
    listing = ListingDB(
        url=body.url,
        source_domain=meta.get("source_domain"),
        image_url=meta.get("image_url"),
        title=meta.get("title"),
        price=meta.get("price"),
        address=meta.get("address"),
        category="New",
        property_type=meta.get("property_type"),
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
    import re
    listings = db.query(ListingDB).filter(ListingDB.category != "Sold").all()
    checked = 0
    updated = 0
    skipped = 0
    changes = []
    results = []   # full per-listing report
    now = datetime.utcnow()

    def row(listing, status, old_price=None, new_price=None):
        return {
            "id": listing.id,
            "address": listing.address,
            "title": listing.title,
            "status": status,          # "changed" | "unchanged" | "skipped"
            "old_price": old_price,
            "new_price": new_price,
            "current_price": float(listing.price) if listing.price is not None else None,
        }

    for listing in listings:
        if not listing.url or "viewpoint.ca" not in listing.url:
            continue
        if not re.search(r"/cutsheet/\d+/\d+", listing.url):
            continue

        checked += 1
        try:
            meta = scrape_listing(listing.url)
        except Exception:
            skipped += 1
            results.append(row(listing, "skipped"))
            continue

        new_price = meta.get("price")
        if new_price is None:
            skipped += 1
            results.append(row(listing, "skipped"))
            continue

        old_price = float(listing.price) if listing.price is not None else None
        if old_price == new_price:
            results.append(row(listing, "unchanged"))
            continue

        db.add(PriceHistoryDB(
            listing_id=listing.id,
            old_price=old_price,
            new_price=new_price,
            recorded_at=now,
        ))
        listing.price = new_price
        listing.date_updated = now
        updated += 1
        results.append(row(listing, "changed", old_price, new_price))
        changes.append({
            "id": listing.id,
            "address": listing.address,
            "title": listing.title,
            "old_price": old_price,
            "new_price": new_price,
        })

    db.commit()
    return {
        "checked": checked, "updated": updated, "skipped": skipped,
        "changes": changes, "results": results,
    }


@app.put("/api/listings/{listing_id}", response_model=ListingResponse)
def update_listing(listing_id: int, body: ListingUpdate, db: Session = Depends(get_db)):
    listing = db.get(ListingDB, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")

    updates = body.model_dump(exclude_unset=True)
    old_category = listing.category
    old_price = float(listing.price) if listing.price is not None else None

    for field, value in updates.items():
        setattr(listing, field, value)
    listing.date_updated = datetime.utcnow()

    new_category = updates.get("category")
    if new_category and new_category != old_category:
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


@app.delete("/api/listings/{listing_id}")
def delete_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.get(ListingDB, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(listing)
    db.commit()
    return {"ok": True}


# Serve built React frontend
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")

if os.path.exists(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
