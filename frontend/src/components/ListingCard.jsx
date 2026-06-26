const BADGE_COLORS = {
  'New': '#6b7280',
  'Interested': '#2563eb',
  'Showing Requested': '#d97706',
  'Visited': '#7c3aed',
  'Passed': '#dc2626',
  'Offer Made': '#16a34a',
  'Sold': '#0f172a',
}

function fmtPrice(price) {
  if (price == null) return null
  return '$' + Number(price).toLocaleString('en-CA', { maximumFractionDigits: 0 })
}

export default function ListingCard({ listing, onSelect }) {
  const badgeColor = BADGE_COLORS[listing.category] ?? '#6b7280'
  const price = fmtPrice(listing.price)

  return (
    <article className="card" onClick={() => onSelect(listing)}>
      <div className="card-photo">
        {listing.image_url ? (
          <img src={listing.image_url} alt="" loading="lazy" />
        ) : (
          <span className="card-no-photo">No photo</span>
        )}
        <span className="card-badge" style={{ background: badgeColor }}>
          {listing.category}
        </span>
      </div>
      <div className="card-body">
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
      </div>
    </article>
  )
}
