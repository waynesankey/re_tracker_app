import re
import requests

APIKEY_KID = "1"
APIKEY_HASH = "d46db3ef736c3c38700ef7f3fe0170dde1d2cbc25e6a296481b1ef75a1459b53"
CLIENT_VER = "23409"
VP_BASE = "https://www.viewpoint.ca"

# HRM bounding box passed to the viewpoint search API.
# Format: center_lat, center_lng, zoom, sw_lat, sw_lng, ne_lat, ne_lng
# Wide enough to cover Hammonds Plains/Timberlea/Middle Sackville (W),
# Musquodoboit/Middle Porters Lake (E), Fall River/Enfield (N), Prospect (S).
HRM_SEARCH_AREA = "44.7000, -63.4000, 10, 44.4500, -63.9000, 44.9500, -62.9000"

# Price filters applied server-side.
HOUSE_MIN_PRICE = 600_000
HOUSE_MAX_PRICE = 1_500_000
LAND_MIN_PRICE  = 100_000
LAND_MAX_PRICE  = 500_000

# Minimum lot size in acres — filters out condos, townhouses, tiny urban parcels.
MIN_LOT_ACRES = 0.25


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


def _count_unfiltered(sess, property_type_param):
    """Count all active HRM listings this week for a type, no price/lot filter."""
    params = {
        "parameters[status]": "forsale",
        "parameters[property_type]": property_type_param,
        "parameters[date]": "week",
        "parameters[search_area]": HRM_SEARCH_AREA,
        "parameters[search_area_type]": "map",
        "nonce": _nonce(sess),
        "CLIENT_VER": CLIENT_VER,
    }
    try:
        resp = sess.get(f"{VP_BASE}/api/v2/listing/search", params=params, timeout=25)
        data = resp.json()
        if not isinstance(data, dict) or "errors" in data:
            return None
        return len(data.get("listings", []))
    except Exception:
        return None


def _search(sess, property_type_param, min_price, max_price):
    """Fetch HRM listings for one property type listed in the past week."""
    params = {
        "parameters[status]": "forsale",
        "parameters[property_type]": property_type_param,
        "parameters[date]": "week",
        "parameters[min_price]": min_price,
        "parameters[max_price]": max_price,
        "parameters[min_lotsize]": MIN_LOT_ACRES,
        "parameters[max_lotsize]": 0,
        "parameters[search_area]": HRM_SEARCH_AREA,
        "parameters[search_area_type]": "map",
        "nonce": _nonce(sess),
        "CLIENT_VER": CLIENT_VER,
    }
    try:
        resp = sess.get(f"{VP_BASE}/api/v2/listing/search", params=params, timeout=25)
        data = resp.json()
        if not isinstance(data, dict) or "errors" in data:
            return []
        return data.get("listings", [])
    except Exception:
        return []


def fetch_new_hrm_listings() -> dict:
    """
    Fetch HRM listings from the past week within the configured price ranges.
    Deduplication against existing DB entries is handled by the caller.
    Returns:
      {
        "listings": [...],          # price+lot filtered, ready for processing
        "viewpoint_total": int,     # total new listings this week before any filter
        "price_lot_filtered": int,  # count after price+lot filter
      }
    """
    sess = _make_session()

    # Unfiltered counts (no price/lot constraints) — for reporting only.
    house_total = _count_unfiltered(sess, "1") or 0
    land_total  = _count_unfiltered(sess, "land") or 0

    seen: set = set()
    results = []
    price_lot_filtered = 0

    for vp_type, our_type, min_p, max_p in [
        ("1",    "House", HOUSE_MIN_PRICE, HOUSE_MAX_PRICE),
        ("land", "Land",  LAND_MIN_PRICE,  LAND_MAX_PRICE),
    ]:
        for item in _search(sess, vp_type, min_p, max_p):
            lid = str(item.get("listing_id") or "")
            cid = str(item.get("class_id") or "")
            if not lid or not cid or lid == "None":
                continue
            key = (lid, cid)
            if key in seen:
                continue
            seen.add(key)
            price_lot_filtered += 1

            raw_url = item.get("url") or f"/cutsheet/{lid}/{cid}"
            url = raw_url if raw_url.startswith("http") else VP_BASE + raw_url
            image_url = f"{VP_BASE}/property/cutimageh/{lid}/{cid}/1.jpg?sd=summary"

            lat = item.get("latitude")
            lng = item.get("longitude")
            results.append({
                "listing_id": lid,
                "class_id": cid,
                "url": url,
                "image_url": image_url,
                "address": item.get("address") or "",
                "city": item.get("city", ""),
                "price": float(item["list_price"]) if item.get("list_price") else None,
                "list_dt": (item.get("list_dt") or "")[:10],
                "property_type": our_type,
                "lat": float(lat) if lat else None,
                "lng": float(lng) if lng else None,
            })

    return {
        "listings": results,
        "viewpoint_total": house_total + land_total,
        "price_lot_filtered": price_lot_filtered,
    }


def extract_ids_from_url(url: str):
    """Extract (listing_id, class_id) from a viewpoint.ca cutsheet URL, or (None, None)."""
    m = re.search(r"/cutsheet/(\d+)/(\d+)", url or "")
    if m:
        return m.group(1), m.group(2)
    return None, None
