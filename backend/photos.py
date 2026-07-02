import os
import requests

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
PHOTOS_DIR = os.path.join(DATA_DIR, "photos")
os.makedirs(PHOTOS_DIR, exist_ok=True)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}


def local_photo_url(db_id: int) -> str:
    return f"/photos/{db_id}.jpg"


def _local_path(db_id: int) -> str:
    return os.path.join(PHOTOS_DIR, f"{db_id}.jpg")


def cache_photo(db_id: int, remote_url: str) -> str | None:
    """Download remote_url and save locally. Returns local URL on success, None on failure.
    Returns the local URL immediately if already cached. No-op for already-local URLs."""
    if not remote_url or remote_url.startswith("/photos/"):
        return remote_url or None
    path = _local_path(db_id)
    if os.path.exists(path):
        return local_photo_url(db_id)
    try:
        resp = requests.get(remote_url, headers=_HEADERS, timeout=15)
        resp.raise_for_status()
        with open(path, "wb") as f:
            f.write(resp.content)
        return local_photo_url(db_id)
    except Exception:
        return None
