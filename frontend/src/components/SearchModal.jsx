import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'

const BADGE_COLORS = {
  'Inbox': '#0e7490',
  'New': '#6b7280',
  'Interested': '#2563eb',
  'Showing Requested': '#d97706',
  'Visited': '#7c3aed',
  'Passed': '#dc2626',
  'Offer Made': '#16a34a',
  'Sold': '#475569',
  'Listing Withdrawn': '#78716c',
}

function fmtPrice(p) {
  return p != null ? '$' + Number(p).toLocaleString('en-CA', { maximumFractionDigits: 0 }) : null
}

function extractCity(listing) {
  const title = listing.title || ''
  const i = title.lastIndexOf(',')
  if (i === -1) return null
  const city = title.slice(i + 1).trim()
  if (!city) return null
  if ((listing.address || '').toLowerCase().includes(city.toLowerCase())) return null
  return city
}

export default function SearchModal({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const search = useCallback(async (q) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const data = await api.searchListings(q)
      setResults(data)
      setActiveIdx(0)
    } catch (_) {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 250)
  }

  const handleKey = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter' && results[activeIdx]) { pick(results[activeIdx]); return }
  }

  const pick = (listing) => {
    onSelect(listing.id)
    onClose()
  }

  return (
    <div className="search-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-box" role="dialog" aria-modal="true" aria-label="Search listings">
        <div className="search-input-row">
          <span className="search-icon">⌕</span>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Search by address or MLS#…"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKey}
          />
          {loading && <span className="search-spinner" />}
          <button className="search-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {results.length > 0 && (
          <ul className="search-results">
            {results.map((l, i) => (
              <li
                key={l.id}
                className={`search-result${i === activeIdx ? ' search-result--active' : ''}`}
                onClick={() => pick(l)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span className="search-result-address">
                  {l.address || l.title || '—'}
                  {extractCity(l) && <span className="search-result-city">{extractCity(l)}</span>}
                </span>
                <span className="search-result-meta">
                  {fmtPrice(l.price) && <span className="search-result-price">{fmtPrice(l.price)}</span>}
                  {l.listing_id && <span className="search-result-mls">MLS# {l.listing_id}</span>}
                  <span
                    className="search-result-badge"
                    style={{ background: BADGE_COLORS[l.category] ?? '#6b7280' }}
                  >
                    {l.property_type} · {l.category}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {query.trim().length >= 2 && !loading && results.length === 0 && (
          <p className="search-empty">No listings found for "{query}"</p>
        )}
      </div>
    </div>
  )
}
