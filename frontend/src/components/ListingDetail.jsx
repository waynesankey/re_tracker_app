import { useState, useEffect, useRef, useCallback } from 'react'

const BADGE_COLORS = {
  'Inbox': '#0e7490',
  'New': '#6b7280',
  'Interested': '#2563eb',
  'Showing Requested': '#d97706',
  'Visited': '#7c3aed',
  'Passed': '#dc2626',
  'Offer Made': '#16a34a',
  'Sold': '#475569',
}

export default function ListingDetail({ listing, categoriesByType, allCategories, onUpdate, onDelete, onClose }) {
  const [form, setForm] = useState({ ...listing })
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState([])
  const [priceHistory, setPriceHistory] = useState([])
  const bannerTimerRef = useRef(null)

  const fetchHistory = useCallback(() => {
    fetch(`/api/listings/${listing.id}/history`)
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => {})
    fetch(`/api/listings/${listing.id}/price-history`)
      .then((r) => r.json())
      .then(setPriceHistory)
      .catch(() => {})
  }, [listing.id])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  useEffect(() => {
    setForm({ ...listing })
    setConfirmDelete(false)
  }, [listing.id])

  // Auto-dismiss the saved banner after 3.5 s
  useEffect(() => {
    if (!savedAt) return
    clearTimeout(bannerTimerRef.current)
    bannerTimerRef.current = setTimeout(() => setSavedAt(null), 3500)
    return () => clearTimeout(bannerTimerRef.current)
  }, [savedAt])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const set = (field) => (e) => {
    setSavedAt(null)
    setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  const setPropertyType = (e) => {
    const newType = e.target.value || null
    setSavedAt(null)
    setForm((f) => {
      const validCats = newType ? (categoriesByType[newType] || allCategories) : allCategories
      return {
        ...f,
        property_type: newType,
        category: validCats.includes(f.category) ? f.category : validCats[0],
      }
    })
  }

  const availableCategories = form.property_type
    ? (categoriesByType[form.property_type] || allCategories)
    : allCategories

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onUpdate(listing.id, {
        title: form.title || null,
        address: form.address || null,
        price: form.price !== '' && form.price != null ? parseFloat(form.price) : null,
        category: form.category,
        property_type: form.property_type || null,
        notes: form.notes || null,
        image_url: form.image_url || null,
        url: form.url,
      })
      setSavedAt(Date.now())
      fetchHistory()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const dateAdded = new Date(listing.date_added).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  const showSaved = Boolean(savedAt)

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Saved banner — lives outside modal-body so it spans the full width */}
        {showSaved && (
          <div className="saved-banner" role="status">
            Changes saved ✓
          </div>
        )}
        {saveError && (
          <div className="error-banner" role="alert">
            Save failed: {saveError}
          </div>
        )}

        <div className="modal-photo">
          {form.image_url ? (
            <img src={form.image_url} alt="" />
          ) : (
            <span className="modal-no-photo">No photo</span>
          )}
        </div>

        <div className="modal-body">
          {!listing.title && !listing.image_url && (
            <p className="extraction-notice">
              Metadata could not be fetched automatically — fill in the fields below manually.
            </p>
          )}

          <Field label="Property Type">
            <select value={form.property_type ?? ''} onChange={setPropertyType}>
              <option value="">— Not set —</option>
              <option value="House">House</option>
              <option value="Land">Land</option>
            </select>
          </Field>

          <Field label="Category">
            <select value={form.category} onChange={set('category')}>
              {availableCategories.map((c) => (
                <option key={c} value={c} style={{ background: BADGE_COLORS[c] + '22' }}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Title">
            <input value={form.title ?? ''} onChange={set('title')} />
          </Field>

          <Field label="Address">
            <input value={form.address ?? ''} onChange={set('address')} placeholder="Enter address…" />
          </Field>

          <Field label="Price ($)">
            <input
              type="number"
              value={form.price ?? ''}
              onChange={set('price')}
              placeholder="e.g. 549000"
              min="0"
              step="1"
            />
          </Field>

          <Field label="Photo URL">
            <input
              value={form.image_url ?? ''}
              onChange={set('image_url')}
              placeholder="https://…"
            />
          </Field>

          <Field label="Listing URL">
            <input value={form.url ?? ''} onChange={set('url')} />
          </Field>

          <Field label="Notes">
            <textarea
              rows={5}
              value={form.notes ?? ''}
              onChange={set('notes')}
              placeholder="Add notes…"
            />
          </Field>

          {history.length > 0 && (
            <div className="history">
              <p className="field-label">Category history</p>
              <ul className="history-list">
                {history.map((h) => (
                  <li key={h.id} className="history-entry">
                    <span className="history-arrow">
                      {h.from_category ? `${h.from_category} → ${h.to_category}` : `Added as ${h.to_category}`}
                    </span>
                    <span className="history-date">
                      {new Date(h.changed_at + 'Z').toLocaleDateString('en-CA', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {priceHistory.length > 0 && (
            <div className="history">
              <p className="field-label">Price history</p>
              <ul className="history-list">
                {priceHistory.map((h) => (
                  <li key={h.id} className="history-entry">
                    <span className="history-arrow">
                      {h.old_price != null
                        ? `$${Number(h.old_price).toLocaleString('en-CA', { maximumFractionDigits: 0 })} → $${Number(h.new_price).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
                        : `Listed at $${Number(h.new_price).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
                      }
                    </span>
                    <span className="history-date">
                      {new Date(h.recorded_at + 'Z').toLocaleDateString('en-CA', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="modal-meta">
            <span>Added {dateAdded}</span>
            {listing.source_domain && <span>{listing.source_domain}</span>}
          </div>

          <div className="modal-actions">
            <a
              className="view-link"
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Listing ↗
            </a>

            <div className="modal-btns">
              {confirmDelete ? (
                <>
                  <span className="confirm-msg">Delete this listing?</span>
                  <button className="btn btn-danger" onClick={() => onDelete(listing.id)}>
                    Yes, delete
                  </button>
                  <button className="btn" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-danger-outline"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={save}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}
