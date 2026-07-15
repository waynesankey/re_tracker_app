import json
import re
from typing import Dict, Optional, Tuple
from urllib.parse import urlparse

# viewpoint.ca status_id → human-readable label (None = normal active, no badge)
VP_STATUS_MAP: Dict[str, Optional[str]] = {
    "5": None,         # For Sale (active) — no badge
    "6": "Pending",    # Accepted offer, pending close
}

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}


def _price_from_jsonld(soup: BeautifulSoup) -> Optional[float]:
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, list):
            data = data[0] if data else {}
        candidates = []
        for key in ("price", "lowPrice", "highPrice"):
            val = data.get(key)
            if val is not None:
                candidates.append(val)
        offers = data.get("offers")
        if isinstance(offers, dict):
            for key in ("price", "lowPrice"):
                val = offers.get(key)
                if val is not None:
                    candidates.append(val)
        for val in candidates:
            try:
                cleaned = str(val).replace(",", "").replace("$", "").replace(" ", "").strip()
                f = float(cleaned)
                if f > 0:
                    return f
            except (ValueError, TypeError):
                continue
    return None


def _waterfront_from_jsonld(soup: BeautifulSoup) -> Optional[bool]:
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, list):
            data = data[0] if data else {}
        for feature in data.get("amenityFeature", []):
            if isinstance(feature, dict) and feature.get("name") == "Waterfront":
                return bool(feature.get("value"))
    return None


def _price_from_text(text: Optional[str]) -> Optional[float]:
    if not text:
        return None
    # English format: $1,234,567 or $1234567
    match = re.search(r"\$\s*([\d,]+(?:\.\d{2})?)", text)
    if match:
        try:
            return float(match.group(1).replace(",", ""))
        except ValueError:
            pass
    # French/Quebec format: 1 234 567 $ (non-breaking or regular spaces)
    match = re.search(r"([\d  ]{4,})\s*\$", text)
    if match:
        try:
            cleaned = re.sub(r"[\s ]", "", match.group(1))
            if cleaned.isdigit():
                return float(cleaned)
        except ValueError:
            pass
    return None


def _viewpoint_rewrite(url: str) -> Tuple[str, Optional[str]]:
    """
    viewpoint.ca cutsheet URLs with a map= param load a JS shell with no data.
    Rewrite to the plain /cutsheet/{id}/{class_id} URL which returns full HTML.
    Also construct the predictable image URL from the listing and class IDs.

    Input:  https://www.viewpoint.ca/cutsheet/202615035/5/78-Edgewater-Close-Dartmouth?map=1
    Output: fetch https://www.viewpoint.ca/cutsheet/202615035/5
            image https://www.viewpoint.ca/property/cutimageh/202615035/5/1.jpg?sd=summary
    """
    parsed = urlparse(url)
    if "viewpoint.ca" not in parsed.netloc:
        return url, None
    m = re.match(r"^/cutsheet/(\d+)/(\d+)(?:/.*)?$", parsed.path)
    if not m:
        return url, None
    lid, cid = m.group(1), m.group(2)
    fetch_url = f"https://www.viewpoint.ca/cutsheet/{lid}/{cid}"
    image_url = f"https://www.viewpoint.ca/property/cutimageh/{lid}/{cid}/1.jpg?sd=summary"
    return fetch_url, image_url


def _viewpoint_extract(soup: BeautifulSoup) -> Dict:
    """Extract address, price, property type, and listing status from viewpoint.ca cutsheet HTML."""
    extras: Dict = {}
    h1 = soup.find("h1", class_="cutsheet-address")
    if h1:
        extras["address"] = h1.get_text(strip=True)
    price_el = soup.find(class_="overlay-price")
    if price_el:
        extras["price"] = _price_from_text(price_el.get_text(strip=True))

    # Status comes from the vp.initCutsheet() JSON embedded in a script tag.
    # The overlay-status span is JS-rendered so requests() sees the default value.
    for script in soup.find_all("script"):
        txt = script.string or ""
        if "initCutsheet" not in txt:
            continue
        start = txt.find("initCutsheet(") + len("initCutsheet(")
        depth = 0
        for i, c in enumerate(txt[start:], start):
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        data = json.loads(txt[start : i + 1])
                        sid = str(data.get("status_id", ""))
                        if sid in VP_STATUS_MAP:
                            extras["listing_status"] = VP_STATUS_MAP[sid]
                    except Exception:
                        pass
                    break
        break

    # Property type: land listings have <span><div>Type</div><div>Land & Acreage</div></span>
    # Residential listings have no such span at all.
    extras["property_type"] = "House"
    for span in soup.find_all("span"):
        divs = span.find_all("div", recursive=False)
        if len(divs) >= 2 and divs[0].get_text(strip=True) == "Type":
            value = divs[1].get_text(strip=True)
            extras["property_type"] = "Land" if "land" in value.lower() else "House"
            break

    return extras


def scrape_listing(url: str) -> Dict:
    parsed = urlparse(url)
    source_domain = parsed.netloc.replace("www.", "")
    result: Dict = {"source_domain": source_domain}

    # Site-specific URL rewriting before fetch
    fetch_url, prefetch_image = _viewpoint_rewrite(url)

    try:
        resp = requests.get(fetch_url, headers=HEADERS, timeout=15, allow_redirects=True)
        resp.raise_for_status()
    except Exception:
        return result

    try:
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception:
        return result

    def og(prop: str) -> Optional[str]:
        tag = soup.find("meta", property=f"og:{prop}")
        return tag.get("content") if tag else None

    title = og("title")
    if not title:
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else None

    description = og("description")
    image_url = og("image") or prefetch_image

    price = _price_from_jsonld(soup)
    if price is None:
        price = _price_from_text(title) or _price_from_text(description)

    result.update({"title": title, "image_url": image_url, "price": price})

    # Site-specific enrichment (address, price override)
    if "viewpoint.ca" in source_domain:
        extras = _viewpoint_extract(soup)
        if extras.get("address"):
            result["address"] = extras["address"]
        if extras.get("price") and not price:
            result["price"] = extras["price"]
        if extras.get("property_type"):
            result["property_type"] = extras["property_type"]
        if "listing_status" in extras:
            result["listing_status"] = extras["listing_status"]
        waterfront = _waterfront_from_jsonld(soup)
        if waterfront is not None:
            result["waterfront"] = waterfront

    return result
