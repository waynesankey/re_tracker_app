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
  totalCount, adding, error, refreshing, refreshProgress, ingesting, ingestMsg, theme,
  currentUser, proposalCount, soldUnseen, showProposals,
  onPropertyTypeChange, onCategoryChange, onPriceChangedFilter,
  onSortChange, onAdd, onRefresh, onIngest, onToggleTheme,
  onUserChange, onShowProposals, onHideProposals,
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
        <span className="logo">Halifax Listings{totalCount != null ? ` (${totalCount})` : ''}</span>

        <div className="user-selector">
          {['Wayne', 'Christina'].map((u) => (
            <button
              key={u}
              className={`user-btn${currentUser === u ? ' active' : ''}`}
              onClick={() => onUserChange(u)}
            >{u}</button>
          ))}
        </div>

        <nav className="filter-tabs">
          <button
            className={`tab tab--proposals${showProposals ? ' active' : ''}`}
            onClick={onShowProposals}
          >
            Proposals{proposalCount > 0 ? ` (${proposalCount})` : ''}
          </button>

          <span className="tab-sep" aria-hidden="true" />

          {/* Type tabs — one always active, independent of category selection */}
          <button
            className={`tab${!propertyType && !showProposals ? ' active' : ''}`}
            onClick={() => { onHideProposals(); onPropertyTypeChange(''); onCategoryChange('') }}
          >
            All
          </button>
          <button
            className={`tab${propertyType === 'House' && !showProposals ? ' active' : ''}`}
            onClick={() => { onHideProposals(); onPropertyTypeChange('House') }}
          >
            Houses
          </button>
          <button
            className={`tab${propertyType === 'Land' && !showProposals ? ' active' : ''}`}
            onClick={() => { onHideProposals(); onPropertyTypeChange('Land') }}
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
              {c === 'Sold' && soldUnseen > 0 ? `Sold (${soldUnseen})` : c}
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
          <option value="rank">Ranking</option>
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
        {refreshing && (
          <div className="refresh-progress">
            <div className="refresh-progress-bar">
              <div
                className="refresh-progress-fill"
                style={{ width: refreshProgress ? `${(refreshProgress.current / refreshProgress.total) * 100}%` : '2%' }}
              />
            </div>
            <span className="refresh-progress-text">
              {refreshProgress
                ? `${refreshProgress.current} / ${refreshProgress.total} · ${(refreshProgress.address || '').slice(0, 28)}`
                : 'Starting…'}
            </span>
          </div>
        )}

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
