import { useState } from 'react'

function fmt(dt) {
  return new Date(dt + 'Z').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtAssessment(value, year) {
  if (value == null) return null
  const dollars = '$' + Number(value).toLocaleString('en-CA', { maximumFractionDigits: 0 })
  return year ? `${dollars} (${year})` : dollars
}

function InlineText({ value, onSave, placeholder, inputProps = {} }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try { await onSave(draft.trim() || null) }
    finally { setSaving(false); setEditing(false) }
  }
  const cancel = () => { setDraft(value || ''); setEditing(false) }

  if (editing) {
    return (
      <span className="watched-edit-inline">
        <input
          className="watched-input-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          autoFocus
          {...inputProps}
        />
        <button className="watched-save-sm" onClick={save} disabled={saving}>Save</button>
        <button className="watched-cancel-sm" onClick={cancel}>Cancel</button>
      </span>
    )
  }
  return (
    <span className="watched-field-value watched-field-value--clickable" onClick={() => setEditing(true)}>
      {value != null && value !== '' ? value : <span className="watched-empty">{placeholder}</span>}
    </span>
  )
}

function WatchedRow({ wp, onDelete, onSave }) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [editingAssessment, setEditingAssessment] = useState(false)
  const [notes, setNotes] = useState(wp.notes || '')
  const [assessmentVal, setAssessmentVal] = useState(wp.assessment != null ? String(wp.assessment) : '')
  const [assessmentYear, setAssessmentYear] = useState(wp.assessment_year != null ? String(wp.assessment_year) : '')
  const [saving, setSaving] = useState(false)

  const saveAssessment = async () => {
    setSaving(true)
    try {
      await onSave(wp.id, {
        assessment: assessmentVal ? parseFloat(assessmentVal) : null,
        assessment_year: assessmentYear ? parseInt(assessmentYear, 10) : null,
      })
    } finally { setSaving(false); setEditingAssessment(false) }
  }

  const saveNotes = async () => {
    setSaving(true)
    try { await onSave(wp.id, { notes: notes || null }) }
    finally { setSaving(false); setEditingNotes(false) }
  }

  return (
    <div className="watched-row">
      <div className="watched-main">
        <span className="watched-address">{wp.address}</span>
        <span className="watched-date">{fmt(wp.date_added)}</span>
        <button className="watched-delete" onClick={() => onDelete(wp.id)} title="Remove">✕</button>
      </div>

      <div className="watched-meta">
        <span className="watched-field-label">PID</span>
        <InlineText
          value={wp.pid}
          onSave={(v) => onSave(wp.id, { pid: v })}
          placeholder="— click to add"
          inputProps={{ placeholder: 'e.g. 00123456' }}
        />
      </div>

      <div className="watched-meta">
        <span className="watched-field-label">Assessment</span>
        {editingAssessment ? (
          <span className="watched-edit-inline">
            <input
              className="watched-input-sm"
              type="number"
              value={assessmentVal}
              onChange={(e) => setAssessmentVal(e.target.value)}
              placeholder="e.g. 300000"
              style={{ width: 110 }}
              autoFocus
            />
            <input
              className="watched-input-sm"
              type="number"
              value={assessmentYear}
              onChange={(e) => setAssessmentYear(e.target.value)}
              placeholder="Year"
              style={{ width: 70 }}
              onKeyDown={(e) => { if (e.key === 'Enter') saveAssessment(); if (e.key === 'Escape') { setAssessmentVal(wp.assessment != null ? String(wp.assessment) : ''); setAssessmentYear(wp.assessment_year != null ? String(wp.assessment_year) : ''); setEditingAssessment(false) } }}
            />
            <button className="watched-save-sm" onClick={saveAssessment} disabled={saving}>Save</button>
            <button className="watched-cancel-sm" onClick={() => { setAssessmentVal(wp.assessment != null ? String(wp.assessment) : ''); setAssessmentYear(wp.assessment_year != null ? String(wp.assessment_year) : ''); setEditingAssessment(false) }}>Cancel</button>
          </span>
        ) : (
          <span className="watched-field-value watched-field-value--clickable" onClick={() => setEditingAssessment(true)}>
            {fmtAssessment(wp.assessment, wp.assessment_year) || <span className="watched-empty">— click to add</span>}
          </span>
        )}
      </div>

      <div className="watched-meta">
        <span className="watched-field-label">Area</span>
        <InlineText
          value={wp.area_acres != null ? `${wp.area_acres} ac` : null}
          onSave={(v) => {
            const n = v ? parseFloat(v.replace(/[^0-9.]/g, '')) : null
            return onSave(wp.id, { area_acres: isNaN(n) ? null : n })
          }}
          placeholder="— click to add"
          inputProps={{ placeholder: 'e.g. 1.7', type: 'text' }}
        />
      </div>

      <div className="watched-meta">
        <span className="watched-field-label">Notes</span>
        {editingNotes ? (
          <span className="watched-edit-inline watched-edit-inline--notes">
            <textarea
              className="watched-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditingNotes(false) }}
              autoFocus
              rows={3}
            />
            <span className="watched-edit-btns">
              <button className="watched-save-sm" onClick={saveNotes} disabled={saving}>Save</button>
              <button className="watched-cancel-sm" onClick={() => { setNotes(wp.notes || ''); setEditingNotes(false) }}>Cancel</button>
            </span>
          </span>
        ) : (
          <span className="watched-field-value watched-field-value--clickable" onClick={() => setEditingNotes(true)}>
            {wp.notes || <span className="watched-empty">— click to add</span>}
          </span>
        )}
      </div>
    </div>
  )
}

export default function WatchedView({ watched, onAdd, onDelete, onSave }) {
  const [address, setAddress] = useState('')
  const [pid, setPid] = useState('')
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!address.trim()) return
    setAdding(true)
    setError(null)
    try {
      await onAdd({ address: address.trim(), pid: pid.trim() || null, notes: notes.trim() || null })
      setAddress('')
      setPid('')
      setNotes('')
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="watched-view">
      <div className="watched-header">
        <h2 className="watched-title">Watched Properties</h2>
        <p className="watched-subtitle">
          Properties not currently for sale that you want to track. You'll be alerted if one appears as a new MLS listing.
        </p>
      </div>

      <form className="watched-add-form" onSubmit={handleAdd}>
        <input
          className="watched-input watched-input--address"
          placeholder="Address (e.g. 123 Main St, Fall River)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={adding}
        />
        <input
          className="watched-input watched-input--pid"
          placeholder="PID (optional)"
          value={pid}
          onChange={(e) => setPid(e.target.value)}
          disabled={adding}
        />
        <input
          className="watched-input watched-input--notes"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={adding}
        />
        <button className="btn btn-primary" type="submit" disabled={adding || !address.trim()}>
          {adding ? 'Adding…' : 'Add'}
        </button>
        {error && <span className="watched-error">{error}</span>}
      </form>

      {watched.length === 0 ? (
        <p className="watched-empty-state">No watched properties yet. Add one above.</p>
      ) : (
        <div className="watched-list">
          {watched.map((wp) => (
            <WatchedRow key={wp.id} wp={wp} onDelete={onDelete} onSave={onSave} />
          ))}
        </div>
      )}
    </div>
  )
}
