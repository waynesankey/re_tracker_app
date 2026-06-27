import re
import time
import requests
from datetime import date

APIKEY_KID = "1"
APIKEY_HASH = "d46db3ef736c3c38700ef7f3fe0170dde1d2cbc25e6a296481b1ef75a1459b53"
CLIENT_VER = "23409"
VP_BASE = "https://www.viewpoint.ca"

# Halifax Regional Municipality bounding box.
# Used when the viewpoint.ca API returns lat/lng per listing (primary filter).
# Coordinates are approximate — HRM is a large municipality stretching far east/west.
HRM_LAT_MIN = 44.5849
HRM_LAT_MAX = 44.7746
HRM_LNG_MIN = -63.6900
HRM_LNG_MAX = -63.2819

# City-name fallback for when the API doesn't include coordinates.
# Add entries here if you notice HRM listings being missed.
HRM_CITIES = {
    "Halifax", "Dartmouth", "Bedford",
    "Lower Sackville", "Upper Sackville", "Middle Sackville", "Sackville",
    "Cole Harbour", "Eastern Passage", "Cow Bay",
    "Porters Lake", "East Porters Lake", "West Porters Lake", "Middle Porters Lake",
    "Lake Echo", "Lawrencetown", "Westphal", "Mineville",
    "Fall River", "Waverley", "Hammonds Plains", "Timberlea",
    "Tantallon", "Head of St. Margarets Bay", "St. Margarets Bay",
    "Beechville", "Lucasville", "Fletchers Lake", "Windsor Junction",
    "Musquodoboit Harbour", "Prospect", "Terence Bay",
    "Whites Lake", "Harrietsfield", "Herring Cove", "Spryfield",
    "Sambro", "Seaforth", "West Chezzetcook", "East Chezzetcook",
    "Grand Desert", "Shearwater", "Burnside", "Woodside",
    "Portland Hills", "Portland Estates",
    "Three Fathom Harbour", "Bisset Lake",
    "Head of Jeddore", "West Jeddore", "East Jeddore",
    "Lake Charlotte", "Ship Harbour",
    "Enfield", "Elmsdale",
    "Stillwater Lake", "Hatchet Lake", "Brookside",
    "Lakeside", "Beaver Bank", "Middle Musquodoboit",
}

# Price buckets sized to stay under viewpoint.ca's "too many results" limit (~200).
# Results at exact boundary prices may appear in adjacent buckets; deduped by listing_id+class_id.
HOUSE_PRICE_BUCKETS = [
    (600_000,    800_000),
    (800_000,  1_100_000),
    (1_100_000, 1_500_000),
]

LAND_PRICE_BUCKETS = [
    (75_000,   150_000),
    (150_000,  250_000),
    (250_000,  400_000),
    (400_000,  900_000),
]


def _make_session():
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "X-Requested-With": "XMLHttpRequest",
        "Referer": f"{VP_BASE}/map",
    })
    sess.get(f"{VP_BASE}/map", timeout=15)
    return sess


def _nonce(sess):
    resp = sess.post(
        f"{VP_BASE}/api/v2/api/nonce",
        data={"kid": APIKEY_KID, "hash": APIKEY_HASH, "CLIENT_VER": CLIENT_VER},
        timeout=10,
    )
    return resp.json().get("nonce")


def _search_bucket(sess, property_type_param, min_price, max_price):
    params = {
        "parameters[status]": "A",
        "parameters[property_type]": property_type_param,
        "parameters[min_price]": min_price,
        "parameters[max_price]": max_price,
        "nonce": _nonce(sess),
        "CLIENT_VER": CLIENT_VER,
    }
    try:
        resp = sess.get(
            f"{VP_BASE}/api/v2/listing/search",
            params=params,
            timeout=25,
        )
        data = resp.json()
        if isinstance(data, dict) and "error" in data:
            return []
        return data.get("listings", []) if isinstance(data, dict) else []
    except Exception:
        return []


def _in_hrm(item: dict) -> bool:
    """Return True if the listing is within Halifax Regional Municipality.

    Uses coordinates if the API provides them (more accurate), otherwise falls
    back to city-name lookup.
    """
    lat = item.get("lat") or item.get("latitude") or item.get("map_lat")
    lng = item.get("lng") or item.get("longitude") or item.get("map_lng")
    if lat is not None and lng is not None:
        try:
            return (
                HRM_LAT_MIN <= float(lat) <= HRM_LAT_MAX
                and HRM_LNG_MIN <= float(lng) <= HRM_LNG_MAX
            )
        except (TypeError, ValueError):
            pass
    return item.get("city", "") in HRM_CITIES


def fetch_new_hrm_listings(cutoff_date: date) -> list:
    """
    Fetch all active HRM listings with list_dt >= cutoff_date.
    Returns list of dicts: listing_id, class_id, url, address, city,
    price, list_dt, property_type ('House' or 'Land').
    """
    sess = _make_session()
    seen: set = set()
    results = []

    def sweep(vp_type_param, our_type, buckets):
        for min_p, max_p in buckets:
            for item in _search_bucket(sess, vp_type_param, min_p, max_p):
                lid = str(item.get("listing_id") or "")
                cid = str(item.get("class_id") or "")
                if not lid or not cid or lid == "None":
                    continue
                key = (lid, cid)
                if key in seen:
                    continue

                if not _in_hrm(item):
                    continue

                raw_dt = (item.get("list_dt") or "")[:10]
                try:
                    if date.fromisoformat(raw_dt) < cutoff_date:
                        continue
                except ValueError:
                    continue

                seen.add(key)
                raw_url = item.get("url") or f"/cutsheet/{lid}/{cid}"
                url = raw_url if raw_url.startswith("http") else VP_BASE + raw_url
                image_url = f"{VP_BASE}/property/cutimageh/{lid}/{cid}/1.jpg?sd=summary"

                results.append({
                    "listing_id": lid,
                    "class_id": cid,
                    "url": url,
                    "image_url": image_url,
                    "address": item.get("address") or "",
                    "city": item.get("city", ""),
                    "price": float(item["list_price"]) if item.get("list_price") else None,
                    "list_dt": raw_dt,
                    "property_type": our_type,
                })
            time.sleep(0.25)

    sweep("1", "House", HOUSE_PRICE_BUCKETS)
    sweep("land", "Land", LAND_PRICE_BUCKETS)
    return results


def extract_ids_from_url(url: str):
    """Extract (listing_id, class_id) from a viewpoint.ca cutsheet URL, or (None, None)."""
    m = re.search(r"/cutsheet/(\d+)/(\d+)", url or "")
    if m:
        return m.group(1), m.group(2)
    return None, None
