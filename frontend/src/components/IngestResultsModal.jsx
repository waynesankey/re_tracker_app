import { useState, useEffect } from 'react'
import { api } from '../api'
import Window from './Window'

function fmt(dt) {
  if (!dt) return '—'
  const d = new Date(dt + (dt.endsWith('Z') ? '' : 'Z'))
  return d.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function interval(from, to) {
  if (!from || !to) return null
  const ms = Math.abs(new Date(to + (to.endsWith('Z') ? '' : 'Z')) - new Date(from + (from.endsWith('Z') ? '' : 'Z')))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function FunnelRow({ label, value, delta, highlight }) {
  const display = value == null ? <span className="ingest-funnel-na">n/a</span> : value
  return (
    <div className={`ingest-funnel-row${highlight ? ' ingest-funnel-row--highlight' : ''}`}>
      <span className="ingest-funnel-label">{label}</span>
      <span className="ingest-funnel-value">
        {delta != null && delta !== 0 && value != null && (
          <span className="ingest-funnel-delta">{delta > 0 ? `+${delta}` : delta}</span>
        )}
        {display}
      </span>
    </div>
  )
}

export default function IngestResultsModal({ result, onClose }) {
  const [history, setHistory] = useState([])

  useEffect(() => {
    api.getIngestHistory().then(setHistory).catch(() => {})
  }, [])

  const priceFiltered = result.viewpoint_total != null && result.price_lot_filtered != null
    ? result.viewpoint_total - result.price_lot_filtered
    : null

  // Previous run = second entry in history (first is the current run)
  const prev = history.length > 1 ? history[1] : null

  return (
    <Window title="Fetch New — Results" onClose={onClose} width={500} initialX={60} initialY={70}>
        <div className="modal-body">
          <h2 className="results-heading">Fetch New — Results</h2>

          {/* Run metadata */}
          <div className="ingest-meta-grid">
            <div className="ingest-meta-item">
              <span className="ingest-meta-label">Run at</span>
              <span className="ingest-meta-value">{fmt(result.run_at)}</span>
            </div>
            {prev && (
              <div className="ingest-meta-item">
                <span className="ingest-meta-label">Previous run</span>
                <span className="ingest-meta-value">{fmt(prev.run_at)}</span>
              </div>
            )}
            {prev && (
              <div className="ingest-meta-item">
                <span className="ingest-meta-label">Interval</span>
                <span className="ingest-meta-value">{interval(prev.run_at, result.run_at)}</span>
              </div>
            )}
            {result.run_by && (
              <div className="ingest-meta-item">
                <span className="ingest-meta-label">Run by</span>
                <span className="ingest-meta-value">{result.run_by}</span>
              </div>
            )}
          </div>

          {/* Filter funnel */}
          <div className="ingest-funnel">
            <FunnelRow label="Viewpoint (this week, HRM)" value={result.viewpoint_total} />
            <FunnelRow label="Failed price / lot filter" value={priceFiltered} delta={priceFiltered != null ? -priceFiltered : null} />
            <FunnelRow label="Passed price filter" value={result.price_lot_filtered} />
            <FunnelRow label="Already tracking (same MLS)" value={result.already_tracked} delta={result.already_tracked ? -result.already_tracked : null} />
            <FunnelRow label="Failed waterfront filter" value={result.waterfront_skipped} delta={result.waterfront_skipped ? -result.waterfront_skipped : null} />
            <FunnelRow label="Re-listed (new MLS, active)" value={result.relisted} delta={result.relisted || null} highlight />
            <FunnelRow label="Re-listed (from Sold/Withdrawn)" value={result.resurrected} delta={result.resurrected || null} highlight />
            <FunnelRow label="Added to Inbox" value={result.added} delta={result.added || null} highlight />
          </div>

          {result.watched_matches && result.watched_matches.length > 0 && (
            <div className="ingest-watched-alert">
              <p className="ingest-watched-alert-title">
                🏠 {result.watched_matches.length} watched {result.watched_matches.length === 1 ? 'property' : 'properties'} now listed!
              </p>
              <ul className="ingest-watched-alert-list">
                {result.watched_matches.map((m) => (
                  <li key={m.watched_id}>
                    <span className="ingest-watched-alert-addr">{m.watched_address}</span>
                    {m.listing_address && m.listing_address !== m.watched_address && (
                      <span className="ingest-watched-alert-match"> → {m.listing_address}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* History table */}
          {history.length > 1 && (
            <>
              <h3 className="ingest-history-heading">History</h3>
              <div className="ingest-history-scroll">
                <table className="ingest-history-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>By</th>
                      <th title="Total from Viewpoint before filters">VP</th>
                      <th title="After price + lot filter">Price</th>
                      <th title="Failed waterfront filter">WF skip</th>
                      <th title="Re-listed from inactive">Re-list</th>
                      <th title="Added to Inbox">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className={h.run_at === result.run_at ? 'ingest-history-row--current' : ''}>
                        <td>{fmt(h.run_at)}</td>
                        <td>{h.run_by || '—'}</td>
                        <td>{h.viewpoint_total ?? '—'}</td>
                        <td>{h.price_lot_filtered ?? '—'}</td>
                        <td>{h.waterfront_skipped ?? '—'}</td>
                        <td>{h.resurrected ?? '—'}</td>
                        <td className={h.added > 0 ? 'ingest-history-added' : ''}>{h.added ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
    </Window>
  )
}
