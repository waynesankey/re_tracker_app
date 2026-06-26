import ListingCard from './ListingCard'

export default function ListingGrid({ listings, loading, onSelect }) {
  if (loading) {
    return <div className="grid-empty">Loading…</div>
  }
  if (!listings.length) {
    return (
      <div className="grid-empty">
        No listings yet — paste a link above to get started.
      </div>
    )
  }
  return (
    <main className="grid">
      {listings.map((l) => (
        <ListingCard key={l.id} listing={l} onSelect={onSelect} />
      ))}
    </main>
  )
}
