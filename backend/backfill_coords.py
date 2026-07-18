"""One-time script: populate lat/lng for existing listings using Nominatim.

Run from the backend/ directory:
    python backfill_coords.py

Skips listings that already have coordinates.
Skips listings with no address.
Respects Nominatim's 1 req/sec rate limit.
"""
import sys, time
sys.path.insert(0, ".")

from database import SessionLocal
from models import ListingDB
from geocode import geocode

db = SessionLocal()

candidates = (
    db.query(ListingDB)
    .filter(ListingDB.lat.is_(None))
    .filter(ListingDB.address.isnot(None))
    .order_by(
        # Active listings first (most useful); withdrawn/sold last
        ListingDB.category.notin_(["Sold", "Listing Withdrawn"]).desc(),
        ListingDB.date_added.desc(),
    )
    .all()
)

print(f"Found {len(candidates)} listings without coordinates.")
ok = skipped = failed = 0

for i, listing in enumerate(candidates, 1):
    lat, lng = geocode(listing.address)
    if lat is not None:
        listing.lat = lat
        listing.lng = lng
        db.commit()
        print(f"  [{i}/{len(candidates)}] ✓  {listing.address}  →  {lat:.5f}, {lng:.5f}")
        ok += 1
    else:
        print(f"  [{i}/{len(candidates)}] ✗  {listing.address}")
        failed += 1
    time.sleep(1.1)  # Nominatim: 1 req/sec

print(f"\nDone. OK={ok}  Failed={failed}  Skipped={skipped}")
db.close()
