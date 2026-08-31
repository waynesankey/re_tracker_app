import { useState } from 'react'
import GalleryLightbox from './GalleryLightbox'

export default function InspirationView({ listings, onSelectListing }) {
  const [viewing, setViewing] = useState(null)

  if (listings.length === 0) {
    return (
      <div className="inspiration-empty">
        <p>No archived galleries yet.</p>
        <p>Open any Viewpoint listing and click <strong>Archive all photos</strong> to save its full photo gallery here.</p>
      </div>
    )
  }

  return (
    <div className="inspiration-view">
      <div className="inspiration-header">
        <h2 className="inspiration-title">Inspiration Gallery</h2>
        <p className="inspiration-subtitle">{listings.length} {listings.length === 1 ? 'listing' : 'listings'} with archived photos — click a card to browse, click the address to open the listing.</p>
      </div>

      <div className="inspiration-grid">
        {listings.map((l) => (
          <div key={l.id} className="inspiration-card" onClick={() => setViewing(l)}>
            <div className="inspiration-photo">
              {l.image_url
                ? <img src={l.image_url} alt="" />
                : <span className="inspiration-no-photo">No photo</span>
              }
              <span className="inspiration-count">{l.gallery_count} photos</span>
            </div>
            <div className="inspiration-info">
              <span
                className="inspiration-address"
                onClick={(e) => { e.stopPropagation(); onSelectListing(l.id) }}
                title="Open listing detail"
              >
                {l.address || l.title || '—'}
              </span>
              <span className="inspiration-cat">{l.category}</span>
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <GalleryLightbox listing={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
