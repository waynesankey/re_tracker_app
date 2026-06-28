import { useState } from 'react'

const CATEGORY_COLORS = {
  'Inbox': '#0e7490',
  'New': '#6b7280',
  'Interested': '#2563eb',
  'Showing Requested': '#d97706',
  'Visited': '#7c3aed',
  'Passed': '#dc2626',
  'Offer Made': '#16a34a',
  'Sold': '#475569',
}

export default function TopBar({
  propertyType, categories, category, priceChangedFilter, sort,
  adding, error, refreshing, ingesting, ingestMsg, theme,
  onPropertyTypeChange, onCategoryChange, onPriceChangedFilter,
  onSortChange, onAdd, onRefresh, onIngest, onToggleTheme,
}) {
  const [input, setInput] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const url = input.trim()
    if (!url) return
    onAdd(url)
    setInput('')
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="logo">Listings</span>
        <nav className="filter-tabs">
          {/* Type tabs — one always active, independent of category selection */}
          <button
            className={`tab${!propertyType ? ' active' : ''}`}
            onClick={() => { onPropertyTypeChange(''); onCategoryChange('') }}
          >
            All
          </button>
          <button
            className={`tab${propertyType === 'House' ? ' active' : ''}`}
            onClick={() => onPropertyTypeChange('House')}
          >
            Houses
          </button>
          <button
            className={`tab${propertyType === 'Land' ? ' active' : ''}`}
            onClick={() => onPropertyTypeChange('Land')}
          >
            Land
          </button>

          <span className="tab-sep" aria-hidden="true" />

          {/* Category tabs */}
          {categories.map((c) => (
            <button
              key={c}
              className={`tab tab--cat${category === c && !priceChangedFilter ? ' active' : ''}`}
              style={{ '--cat-color': CATEGORY_COLORS[c] ?? '#6b7280' }}
              onClick={() => onCategoryChange(category === c ? '' : c)}
            >
              {c}
            </button>
          ))}

          <button
            className={`tab tab--price-changed${priceChangedFilter ? ' active' : ''}`}
            onClick={onPriceChangedFilter}
            title="Listings with at least one recorded price change"
          >
            Price Changes
          </button>
        </nav>
      </div>

      <div className="topbar-right">
        <button className="theme-toggle" onClick={onToggleTheme} title="Toggle light/dark mode">
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>

        <select
          className="sort-select"
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
        >
          <option value="date_added">Date Added</option>
          <option value="price">Price ↑</option>
        </select>

        <button
          className="ingest-btn"
          onClick={onIngest}
          disabled={ingesting}
          title="Fetch new HRM listings from viewpoint.ca since last run"
        >
          {ingesting ? 'Fetching…' : 'Fetch New'}
        </button>
        {ingestMsg && (
          <span className={`ingest-msg${ingestMsg.error ? ' ingest-msg--err' : ''}`}>
            {ingestMsg.error
              ? `Error: ${ingestMsg.error}`
              : `${ingestMsg.added} new · ${ingestMsg.fetched} checked`}
          </span>
        )}

        <button
          className="refresh-btn"
          onClick={onRefresh}
          disabled={refreshing}
          title="Re-fetch prices from viewpoint.ca for all listings"
        >
          {refreshing ? 'Refreshing…' : 'Refresh Prices'}
        </button>

        <form className="add-form" onSubmit={submit}>
          <input
            className="add-input"
            type="url"
            placeholder="Paste listing URL…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={adding}
          />
          <button className="add-btn" type="submit" disabled={adding || !input.trim()}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>

        {error && <p className="topbar-error">{error}</p>}
      </div>
    </header>
  )
}
