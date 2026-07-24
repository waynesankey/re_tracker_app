"""Set lat/lng for a listing by ID.

Usage:
    python set_coords.py <listing_id> <lat> <lng>

Example:
    python set_coords.py 119 44.71234 -63.56789
"""
import sys
sys.path.insert(0, ".")
from database import SessionLocal
from models import ListingDB

if len(sys.argv) != 4:
    print("Usage: python set_coords.py <listing_id> <lat> <lng>")
    sys.exit(1)

lid, lat, lng = int(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
db = SessionLocal()
listing = db.get(ListingDB, lid)
if not listing:
    print(f"No listing with id={lid}")
    sys.exit(1)

listing.lat = lat
listing.lng = lng
db.commit()
print(f"Updated id={lid} ({listing.address}): {lat}, {lng}")
db.close()
