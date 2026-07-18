import requests

_NOMINATIM = "https://nominatim.openstreetmap.org/search"
_HEADERS = {"User-Agent": "RealEstateOrganizer/1.0 (flyinggingernut@gmail.com)"}


def geocode(address: str) -> tuple:
    """Return (lat, lng) floats for address, or (None, None) on failure.

    Appends ', Nova Scotia, Canada' for better accuracy in the HRM context.
    Rate-limit: callers are responsible for the Nominatim 1 req/sec policy.
    """
    if not address:
        return None, None
    query = f"{address}, Nova Scotia, Canada"
    try:
        r = requests.get(
            _NOMINATIM,
            params={"q": query, "format": "json", "limit": 1, "countrycodes": "ca"},
            headers=_HEADERS,
            timeout=10,
        )
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return None, None
