# Real Estate Tracker

A local web app for tracking property listings while house or land hunting. Runs on your Mac and is accessible from any device on the same WiFi network — phone, tablet, or another computer.

Data is stored locally in a SQLite database. Nothing is sent to any external service.

## Requirements

- Python 3.9+
- Node.js (for the one-time frontend build)

## Starting the app

From the project root:

```bash
./start.sh
```

On first run this creates a Python virtual environment, installs dependencies, and builds the frontend. Subsequent starts are fast. The terminal will print the addresses to connect to:

```
Real Estate Tracker
  Local:   http://localhost:8005
  Network: http://192.168.x.x:8005
```

Press **Ctrl+C** to stop.

## Connecting from other devices

Any device on the same WiFi network can reach the app at:

```
http://macbook-pro.local:8005
```

This works on iPhones, iPads, other Macs, and Windows PCs. The `.local` address is stable across networks — you do not need to know the IP address.

The IP address shown in the terminal at startup also works, but it changes when you switch networks.

## Adding a listing

1. Find the property on [viewpoint.ca](https://viewpoint.ca) — click a pin on the map to open the listing popup, then copy the URL from your browser.
2. Paste the URL into the **Paste listing URL…** box in the top bar and click **Add**.
3. The app fetches the address, price, photo, and property type automatically.
4. The listing opens so you can set a category and add notes, then click **Save**.

> **Note:** viewpoint.ca is the only supported source for automatic data extraction. URLs from other sites (realtor.ca etc.) can be saved but metadata will not be fetched.

## Navigating listings

The top bar has two levels of filtering:

| Level | Tabs | Purpose |
|---|---|---|
| Type | All · Houses · Land | Filter by property type |
| Category | New · Interested · … | Filter by your status for that listing |

One type tab is always active. Clicking a category tab narrows within the selected type. Click the same category tab again to clear it.

**Sort** (top right): switch between *Date Added* and *Price ↑*.

## Categories

Categories reflect where you are in your decision process.

**Houses:** New → Interested → Showing Requested → Visited → Passed → Offer Made → Sold

**Land:** New → Interested → Visited → Passed → Offer Made → Sold

Move a listing between categories by opening it, changing the Category dropdown, and clicking **Save**. Every change is recorded in the status history visible at the bottom of the listing.

## Fetching new listings (Inbox)

Click **Fetch New** in the top bar to pull new listings from viewpoint.ca into the **Inbox** category. The app queries the viewpoint.ca listing API across your target price ranges, filters to HRM by coordinates, and imports anything listed since the last run.

- **Price ranges:** Houses $600K–$1.5M · Land $75K–$900K
- **De-duplication:** listings already in the tracker are skipped
- **Photos and titles** are fetched automatically from each listing page
- **Date overlap:** the last day is always re-fetched to catch listings posted after a prior run
- **First run** looks back 7 days; subsequent runs look back to the day after the previous run

After reviewing Inbox listings, open each one to set a category (e.g. New or Interested) and save.

## Refreshing prices

Click **Refresh Prices** in the top bar to re-scrape current prices from viewpoint.ca for all active (non-Sold) listings. A results panel opens showing every listing checked:

- **Changed** — highlighted in green, showing old price → new price and % change
- **No change** — confirmed checked with current price
- **Could not fetch** — listing may be sold or removed from viewpoint.ca

Click any row in the results to open that listing. Price changes are recorded in the listing's price history.

## Listing detail

Click any card to open the detail view. Fields you can edit:

| Field | Notes |
|---|---|
| Property Type | House or Land — set automatically on import |
| Category | Your current status for this listing |
| Title | Auto-filled from the listing page |
| Address | Auto-filled from viewpoint.ca |
| Price | Auto-filled; edit manually if needed |
| Photo URL | Auto-filled; replace if the image is wrong |
| Listing URL | The source URL |
| Notes | Free text — visible only in this app |

Click **View Listing ↗** to open the original listing in a new tab.

**Status history** and **price history** are shown at the bottom of the detail view and update automatically when you save changes.

## Dark mode

Click the **Dark / Light** button in the top right of the top bar. Your preference is saved and restored on next load.

## Data

All data is stored in `data/listings.db` (SQLite). This directory is excluded from git. Back it up by copying the file — it contains everything.

To move the app to another machine: copy the project folder, run `./start.sh`, and copy `data/listings.db` across.
