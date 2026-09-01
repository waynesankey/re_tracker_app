#!/usr/bin/env python3
"""
Import gallery photos into the real estate organizer.

From a folder of manually-saved photos:
    python3 import_webarchive.py --folder <listing_id> <folder_path>

From a Safari .webarchive file:
    python3 import_webarchive.py --list <path_to.webarchive>
    python3 import_webarchive.py <listing_id> <path_to.webarchive> [url_filter]

Examples:
    python3 import_webarchive.py --folder 40 ~/Documents/mtl_house/archive_410_heddas_way/photos
    python3 import_webarchive.py --list ~/Desktop/heddas.webarchive
    python3 import_webarchive.py 40 ~/Desktop/heddas.webarchive 202606449
"""

import os
import plistlib
import shutil
import sqlite3
import sys


PHOTOS_DIR = os.path.join(os.path.dirname(__file__), "data", "photos")
DB_PATH    = os.path.join(os.path.dirname(__file__), "data", "listings.db")
MIN_SIZE   = 50_000  # bytes — smaller than this is a placeholder or icon


def gallery_dir(listing_id: int) -> str:
    return os.path.join(PHOTOS_DIR, str(listing_id), "gallery")


def extract_images(webarchive_path: str) -> list:
    """Return all image resources found in the webarchive as (size, url, data) tuples."""
    with open(webarchive_path, "rb") as f:
        archive = plistlib.load(f)

    images = []

    def collect(resource: dict):
        mime = resource.get("WebResourceMIMEType", "")
        data = resource.get("WebResourceData", b"")
        url  = str(resource.get("WebResourceURL", ""))
        if mime in ("image/jpeg", "image/jpg", "image/png", "image/webp") or \
           url.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp")):
            if isinstance(data, bytes):
                images.append((len(data), url, data))

    for res in archive.get("WebSubresources", []):
        collect(res)
    main = archive.get("WebMainResource", {})
    if main:
        collect(main)

    images.sort(key=lambda x: x[0], reverse=True)
    return images


def main():
    args = sys.argv[1:]

    # --folder mode: import from a plain directory of image files
    if args and args[0] == "--folder":
        if len(args) < 3:
            print("Usage: python3 import_webarchive.py --folder <listing_id> <folder_path>")
            sys.exit(1)
        listing_id  = int(args[1])
        folder_path = os.path.expanduser(args[2])

        if not os.path.isdir(folder_path):
            print(f"Error: directory not found: {folder_path}")
            sys.exit(1)

        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT id, address FROM listings WHERE id = ?", (listing_id,)
        ).fetchone()
        if not row:
            print(f"Error: no listing with id={listing_id} in database")
            sys.exit(1)
        print(f"Listing: [{row[0]}] {row[1]}")

        import re as _re
        exts = ('.jpg', '.jpeg', '.png', '.webp', '.heic')
        files = sorted(
            (f for f in os.listdir(folder_path)
             if f.lower().endswith(exts) and not f.startswith('.')),
            key=lambda f: int(_re.search(r'\d+', f).group()) if _re.search(r'\d+', f) else f
        )
        if not files:
            print(f"No image files found in {folder_path}")
            sys.exit(1)
        print(f"Found {len(files)} image files in {folder_path}")

        gdir = gallery_dir(listing_id)
        if os.path.exists(gdir):
            print(f"Clearing existing gallery at {gdir}")
            shutil.rmtree(gdir)
        os.makedirs(gdir)

        for n, fname in enumerate(files, 1):
            src  = os.path.join(folder_path, fname)
            dest = os.path.join(gdir, f"{n:03d}.jpg")
            shutil.copy2(src, dest)
            print(f"  {n:3d}.jpg  ← {fname}")

        conn.execute(
            "UPDATE listings SET gallery_count = ? WHERE id = ?",
            (len(files), listing_id),
        )
        conn.commit()
        conn.close()
        print(f"\nSaved {len(files)} photos to {gdir}")
        print(f"Updated gallery_count={len(files)} for listing {listing_id}")
        return

    # --list mode: show everything in the archive
    if args and args[0] == "--list":
        if len(args) < 2:
            print("Usage: python3 import_webarchive.py --list <path_to.webarchive>")
            sys.exit(1)
        archive_path = os.path.expanduser(args[1])
        images = extract_images(archive_path)
        print(f"Found {len(images)} image resources:\n")
        for size, url, _ in images:
            flag = "  OK " if size >= MIN_SIZE else " SKIP"
            print(f"{flag}  {size:>9,} bytes  {url}")
        return

    # Import mode
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)

    listing_id   = int(args[0])
    archive_path = os.path.expanduser(args[1])
    url_filter   = args[2] if len(args) >= 3 else None

    if not os.path.exists(archive_path):
        print(f"Error: file not found: {archive_path}")
        sys.exit(1)

    # Verify listing exists
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT id, address, listing_id FROM listings WHERE id = ?", (listing_id,)
    ).fetchone()
    if not row:
        print(f"Error: no listing with id={listing_id} in database")
        sys.exit(1)
    print(f"Listing: [{row[0]}] {row[1]}  (listing_id={row[2]})")

    print(f"Reading {archive_path} …")
    all_images = extract_images(archive_path)
    print(f"Total image resources in archive: {len(all_images)}")

    import re as _re

    def _photo_num(url: str) -> int:
        """Extract the trailing photo number from a Viewpoint image URL."""
        # Match the last /N.jpg before any ? query string
        m = _re.search(r'/(\d+)\.jpg(?:[?&]|$)', url)
        return int(m.group(1)) if m else 0

    # Filter by URL substring
    if url_filter:
        all_images = [(s, u, d) for s, u, d in all_images if url_filter in u]
        print(f"After filtering URLs containing '{url_filter}': {len(all_images)}")

    # Remove tiny images (map tiles, icons, empty placeholders)
    min_sz = 1_000 if url_filter else MIN_SIZE
    all_images = [(s, u, d) for s, u, d in all_images if s >= min_sz]
    print(f"After removing images < {min_sz:,} bytes: {len(all_images)}")

    # Deduplicate: for each photo number keep the largest version.
    # Images with no extractable number (num=0) are dropped.
    best: dict = {}
    for s, u, d in all_images:
        num = _photo_num(u)
        if num == 0:
            continue
        if num not in best or s > best[num][0]:
            best[num] = (s, u, d)

    if not best:
        print("\nNo matching images found.")
        print("Run with --list to see all image URLs in the archive.")
        sys.exit(1)

    sized = [best[k] for k in sorted(best)]
    print(f"After deduplication (one per photo number): {len(sized)}")

    print(f"\nImages to import ({len(sized)} total):")
    for s, u, _ in sized:
        print(f"  {s:>9,} bytes  {u}")

    gdir = gallery_dir(listing_id)
    if os.path.exists(gdir):
        print(f"\nClearing existing gallery at {gdir}")
        shutil.rmtree(gdir)
    os.makedirs(gdir)

    for n, (size, url, data) in enumerate(sized, 1):
        dest = os.path.join(gdir, f"{n:03d}.jpg")
        with open(dest, "wb") as f:
            f.write(data)

    conn.execute(
        "UPDATE listings SET gallery_count = ? WHERE id = ?",
        (len(sized), listing_id),
    )
    conn.commit()
    conn.close()

    print(f"\nSaved {len(sized)} photos to {gdir}")
    print(f"Updated gallery_count={len(sized)} for listing {listing_id}")


if __name__ == "__main__":
    main()
