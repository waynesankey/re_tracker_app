import { useState } from 'react'

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

function fmtPrice(price) {
  if (price == null) return null
  return '$' + Number(price).toLocaleString('en-CA', { maximumFractionDigits: 0 })
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'Z').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function ProposalCard({ listing, currentUser, onSelect, onAgree, onWithdraw, onReject }) {
  const [showReject, setShowReject] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [busy, setBusy] = useState(false)

  const isProposer = currentUser === listing.proposed_by
  const price = fmtPrice(listing.price)

  const agree = async (e) => {
    e.stopPropagation()
    setBusy(true)
    try { await onAgree(listing.id) } finally { setBusy(false) }
  }

  const withdraw = async (e) => {
    e.stopPropagation()
    setBusy(true)
    try { await onWithdraw(listing.id) } finally { setBusy(false) }
  }

  const confirmReject = async (e) => {
    e.stopPropagation()
    if (!rejectNote.trim()) return
    setBusy(true)
    try { await onReject(listing.id, rejectNote.trim()) } finally { setBusy(false) }
  }

  return (
    <div className="proposal-card" onClick={() => onSelect(listing)}>
      <div className="proposal-card-photo">
        {listing.image_url
          ? <img src={listing.image_url} alt="" />
          : <span className="proposal-card-nophoto">No photo</span>}
        <span
          className="card-badge"
          style={{ background: BADGE_COLORS[listing.category] ?? '#6b7280' }}
        >{listing.category}</span>
        {listing.listing_status && (
          <div className="card-status-bar">{listing.listing_status}</div>
        )}
      </div>

      <div className="proposal-card-body">
        <div className="proposal-card-address">{listing.address || listing.title || '—'}</div>
        {price && <div className="proposal-card-price">{price}</div>}

        <div className="proposal-card-info">
          <span className="proposal-arrow">
            {listing.proposed_by === currentUser ? 'You' : listing.proposed_by}
            {' proposed → '}
            <span
              className="proposal-target-badge"
              style={{ background: BADGE_COLORS[listing.proposed_category] ?? '#6b7280' }}
            >{listing.proposed_category}</span>
          </span>
          <span className="proposal-date">{fmtDate(listing.proposed_at)}</span>
        </div>

        <div className="proposal-card-actions" onClick={(e) => e.stopPropagation()}>
          {isProposer ? (
            <button className="btn btn-sm" onClick={withdraw} disabled={busy}>
              Withdraw
            </button>
          ) : showReject ? (
            <div className="reject-form">
              <textarea
                rows={2}
                placeholder="Reason for rejection…"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="proposal-btns">
                <button
                  className="btn btn-danger btn-sm"
                  onClick={confirmReject}
                  disabled={busy || !rejectNote.trim()}
                >Confirm Reject</button>
                <button
                  className="btn btn-sm"
                  onClick={(e) => { e.stopPropagation(); setShowReject(false); setRejectNote('') }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <div className="proposal-btns">
              <button className="btn btn-primary btn-sm" onClick={agree} disabled={busy}>
                Agree
              </button>
              <button
                className="btn btn-danger-outline btn-sm"
                onClick={(e) => { e.stopPropagation(); setShowReject(true) }}
                disabled={busy}
              >Reject</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProposalsView({ proposals, currentUser, onSelect, onAgree, onWithdraw, onReject }) {
  if (proposals.length === 0) {
    return (
      <div className="proposals-empty">
        No pending proposals.
      </div>
    )
  }

  return (
    <div className="proposals-view">
      <div className="proposals-grid">
        {proposals.map((listing) => (
          <ProposalCard
            key={listing.id}
            listing={listing}
            currentUser={currentUser}
            onSelect={onSelect}
            onAgree={onAgree}
            onWithdraw={onWithdraw}
            onReject={onReject}
          />
        ))}
      </div>
    </div>
  )
}
