function fmt(price) {
  return price != null
    ? '$' + Number(price).toLocaleString('en-CA', { maximumFractionDigits: 0 })
    : '—'
}

function pctDelta(oldP, newP) {
  if (oldP == null || oldP === 0) return null
  const pct = ((newP - oldP) / oldP) * 100
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'
}

const STATUS_ORDER = { changed: 0, withdrawn: 1, unchanged: 2, skipped: 3, restored: 4 }

function LocationPill({ propertyType, category }) {
  if (!propertyType && !category) return null
  return (
    <span className="results-location">
      {propertyType && <span className="results-location-type">{propertyType}</span>}
      {category && <span className="results-location-cat">{category}</span>}
    </span>
  )
}

export default function RefreshResultsModal({ results, runDate, onSelectListing, onRestore, onClose }) {
  const sorted = [...(results || [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  )

  const nChanged   = results ? results.filter((r) => r.status === 'changed').length   : 0
  const nWithdrawn = results ? results.filter((r) => r.status === 'withdrawn').length  : 0
  const nSkipped   = results ? results.filter((r) => r.status === 'skipped').length    : 0
  const total = results ? results.length : 0

  return (
    <div className="overlay">
      <div className="modal modal--narrow" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-body">
          <h2 className="results-heading">
            Price refresh
            <span className="results-date">
              {new Date(runDate).toLocaleDateString('en-CA', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </span>
          </h2>

          {total > 0 && (
            <p className="results-summary">
              {total} checked
              {nChanged   > 0 && <> · <strong>{nChanged} price {nChanged === 1 ? 'change' : 'changes'}</strong></>}
              {nChanged  === 0 && <> · 0 changed</>}
              {nWithdrawn > 0 && <> · <strong>{nWithdrawn} withdrawn</strong></>}
              {nSkipped   > 0 && <> · {nSkipped} could not fetch</>}
            </p>
          )}

          {total === 0 ? (
            <p className="results-empty">No viewpoint.ca listings to check.</p>
          ) : (
            <ul className="results-list">
              {sorted.map((r) => {
                if (r.status === 'changed') {
                  const d = pctDelta(r.old_price, r.new_price)
                  const down = r.new_price < r.old_price
                  return (
                    <li key={r.id} className="results-row results-row--changed" onClick={() => onSelectListing(r.id)}>
                      <span className="results-name">
                        {r.address || r.title || '—'}
                        <LocationPill propertyType={r.property_type} category={r.category} />
                      </span>
                      <span className="results-prices">
                        <span className="results-old">{fmt(r.old_price)}</span>
                        <span className="results-arrow">→</span>
                        <span className="results-new">{fmt(r.new_price)}</span>
                        {d && (
                          <span className={`results-delta ${down ? 'results-delta--down' : 'results-delta--up'}`}>
                            {d}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                }

                if (r.status === 'unchanged') {
                  return (
                    <li key={r.id} className="results-row results-row--unchanged" onClick={() => onSelectListing(r.id)}>
                      <span className="results-name results-name--muted">
                        {r.address || r.title || '—'}
                        <LocationPill propertyType={r.property_type} category={r.category} />
                      </span>
                      <span className="results-prices">
                        <span className="results-current">{fmt(r.current_price)}</span>
                        <span className="results-badge results-badge--ok">No change</span>
                      </span>
                    </li>
                  )
                }

                if (r.status === 'withdrawn') {
                  return (
                    <li key={r.id} className="results-row results-row--withdrawn" onClick={() => onSelectListing(r.id)}>
                      <span className="results-name results-name--muted">
                        {r.address || r.title || '—'}
                        <LocationPill propertyType={r.property_type} category={r.category} />
                      </span>
                      <span className="results-prices">
                        <span className="results-badge results-badge--withdrawn">→ Withdrawn</span>
                        <button
                          className="results-undo"
                          onClick={(e) => { e.stopPropagation(); onRestore(r.id, r.category) }}
                        >
                          Undo
                        </button>
                      </span>
                    </li>
                  )
                }

                if (r.status === 'restored') {
                  return (
                    <li key={r.id} className="results-row results-row--unchanged">
                      <span className="results-name results-name--muted">
                        {r.address || r.title || '—'}
                        <LocationPill propertyType={r.property_type} category={r.category} />
                      </span>
                      <span className="results-prices">
                        <span className="results-badge results-badge--ok">Restored</span>
                      </span>
                    </li>
                  )
                }

                // skipped
                return (
                  <li key={r.id} className="results-row results-row--skipped" onClick={() => onSelectListing(r.id)}>
                    <span className="results-name results-name--muted">
                      {r.address || r.title || '—'}
                      <LocationPill propertyType={r.property_type} category={r.category} />
                    </span>
                    <span className="results-badge results-badge--skip">Could not fetch</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
