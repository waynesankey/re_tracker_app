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

export default function ListingCard({
  listing, onSelect,
  isRankedCategory, isRanked, rank, isTouchOnly,
  isDragging, isDragOver,
  onMoveUp, onMoveDown,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const badgeColor = BADGE_COLORS[listing.category] ?? '#6b7280'
  const price = fmtPrice(listing.price)

  const className = [
    'card',
    isDragging ? 'card--dragging' : '',
    isDragOver ? 'card--drag-over' : '',
  ].filter(Boolean).join(' ')

  return (
    <article
      className={className}
      onClick={() => onSelect(listing)}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="card-photo">
        {listing.image_url ? (
          <img src={listing.image_url} alt="" loading="lazy" />
        ) : (
          <span className="card-no-photo">No photo</span>
        )}
        <span className="card-badge" style={{ background: badgeColor }}>
          {listing.category}
        </span>
        {isRankedCategory && rank != null && (
          <span className="card-rank">#{rank}</span>
        )}
        {listing.listing_status && (
          <div className="card-status-bar">{listing.listing_status}</div>
        )}
      </div>
      <div className="card-body">
        {onDragStart && (
          <div className="drag-handle" title="Drag to reorder">⠿</div>
        )}
        <p className="card-title">{listing.title || listing.url}</p>
        {listing.address && <p className="card-address">{listing.address}</p>}
        {price ? (
          <p className="card-price">{price}</p>
        ) : (
          <p className="card-price card-price--unknown">Price unknown</p>
        )}
        {listing.source_domain && (
          <p className="card-source">{listing.source_domain}</p>
        )}
        {isRanked && (
          <div className="rank-arrows" onClick={(e) => e.stopPropagation()}>
            <button className="rank-btn" onClick={onMoveUp} disabled={!onMoveUp} title="Move up">▲</button>
            <button className="rank-btn" onClick={onMoveDown} disabled={!onMoveDown} title="Move down">▼</button>
          </div>
        )}
      </div>
    </article>
  )
}
