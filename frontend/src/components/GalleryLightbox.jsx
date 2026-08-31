import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

export default function GalleryLightbox({ listing, onClose }) {
  const [photos, setPhotos] = useState(null)
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const overlayRef = useRef(null)

  useEffect(() => {
    api.getGallery(listing.id).then((r) => {
      setPhotos(r.photos)
      setLoading(false)
    }).catch(() => { setPhotos([]); setLoading(false) })
  }, [listing.id])

  // Focus overlay so arrow-key / Escape handlers fire immediately
  useEffect(() => { overlayRef.current?.focus() }, [])

  const prev = () => setIdx((i) => Math.max(0, i - 1))
  const next = () => setIdx((i) => Math.min((photos?.length ?? 1) - 1, i + 1))

  const onKey = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    else if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="lightbox-overlay"
      ref={overlayRef}
      onClick={onClose}
      onKeyDown={onKey}
      tabIndex={0}
    >
      <div className="lightbox" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="lightbox-title">{listing.address || listing.title}</span>
          <span className="lightbox-counter">
            {loading ? '…' : `${idx + 1} / ${photos?.length ?? 0}`}
          </span>
          <button className="lightbox-close" onClick={onClose}>✕</button>
        </div>
        <div className="lightbox-body">
          {loading ? (
            <div className="lightbox-loading">Loading…</div>
          ) : photos?.length === 0 ? (
            <div className="lightbox-loading">No photos found</div>
          ) : (
            <img className="lightbox-img" src={photos[idx]} alt={`Photo ${idx + 1}`} />
          )}
        </div>
        {!loading && photos?.length > 0 && (
          <div className="lightbox-nav">
            <button className="lightbox-btn" onClick={prev} disabled={idx === 0}>←</button>
            <div className="lightbox-thumbs">
              {photos.map((p, i) => (
                <img
                  key={i}
                  className={`lightbox-thumb${i === idx ? ' lightbox-thumb--active' : ''}`}
                  src={p}
                  alt=""
                  onClick={() => setIdx(i)}
                />
              ))}
            </div>
            <button className="lightbox-btn" onClick={next} disabled={idx === photos.length - 1}>→</button>
          </div>
        )}
      </div>
    </div>
  )
}
