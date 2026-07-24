import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

const CATEGORY_COLORS = {
  Inbox:               '#6b7280',
  New:                 '#6b7280',
  Interested:          '#0e7490',
  'Showing Requested': '#2563eb',
  Visited:             '#7c3aed',
  Passed:              '#dc2626',
  'Offer Made':        '#d97706',
  Sold:                '#16a34a',
  'Listing Withdrawn': '#9ca3af',
}

function makeIcon(category) {
  const color = CATEGORY_COLORS[category] || '#6b7280'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.27 21.73 0 14 0z"
          fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="white"/>
  </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -36] })
}

export default function ListingMap({ listings, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  // Keep onSelect stable across renders so marker callbacks don't go stale
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  // Track which listing IDs are plotted — only re-fit bounds when the set changes
  const fittedIdsRef = useRef('')

  const withCoords = listings.filter(l => l.lat != null && l.lng != null)

  // Initialise the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = L.map(containerRef.current, {
      center: [44.65, -63.57],
      zoom: 10,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current)

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      fittedIdsRef.current = ''
    }
  }, [])

  // Re-draw markers when the set of listings changes.
  // Dep is a stable string of IDs — avoids re-running on every parent re-render
  // (which would snap the map back via fitBounds every poll cycle).
  const idKey = withCoords.map(l => l.id).sort().join(',')

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (withCoords.length === 0) return

    const bounds = []

    withCoords.forEach(l => {
      const fmtPrice = l.price != null
        ? '$' + Number(l.price).toLocaleString('en-CA', { maximumFractionDigits: 0 })
        : 'Price TBD'
      const label = l.address || l.title || '—'

      const marker = L.marker([l.lat, l.lng], { icon: makeIcon(l.category) })
        .addTo(map)
        .bindPopup(
          `<div class="map-popup">
            <div class="map-popup-address">${label}</div>
            <div class="map-popup-price">${fmtPrice}</div>
            <div class="map-popup-cat">${l.category}</div>
            ${l.waterfront ? '<div class="map-popup-wf">waterfront</div>' : ''}
            <button class="map-popup-btn" data-id="${l.id}">Open listing</button>
          </div>`,
          { minWidth: 180 }
        )

      marker.on('popupopen', () => {
        setTimeout(() => {
          const btn = document.querySelector(`.map-popup-btn[data-id="${l.id}"]`)
          if (btn) btn.addEventListener('click', () => { map.closePopup(); onSelectRef.current(l.id) })
        }, 0)
      })

      markersRef.current.push(marker)
      bounds.push([l.lat, l.lng])
    })

    // Only auto-fit when the displayed listing set changes (filter/category switch),
    // not on every re-render — avoids fighting with the user's zoom and pan.
    if (bounds.length > 0 && idKey !== fittedIdsRef.current) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
      fittedIdsRef.current = idKey
    }
  }, [idKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const noCoords = listings.length - withCoords.length

  return (
    <div className="map-wrapper">
      <div ref={containerRef} className="map-container" />
      {noCoords > 0 && (
        <div className="map-no-coords-notice">
          {noCoords} listing{noCoords !== 1 ? 's' : ''} without coordinates (lot parcels and unusual addresses)
        </div>
      )}
      {listings.length === 0 && (
        <div className="map-empty">No listings to show — try a different filter.</div>
      )}
    </div>
  )
}
