import { useState, useEffect } from 'react'
import ListingCard from './ListingCard'

const isTouchOnly = typeof window !== 'undefined' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches

export default function ListingGrid({ listings, loading, onSelect, isRanked, onReorder }) {
  const [localListings, setLocalListings] = useState(listings)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  useEffect(() => { setLocalListings(listings) }, [listings])

  if (loading) return <div className="grid-empty">Loading…</div>
  if (!localListings.length) {
    return (
      <div className="grid-empty">No listings yet — paste a link above to get started.</div>
    )
  }

  const applyReorder = (reordered) => {
    setLocalListings(reordered)
    onReorder(reordered.map((l, i) => ({ id: l.id, rank: i + 1 })))
  }

  const handleMoveUp = (id) => {
    const idx = localListings.findIndex(l => l.id === id)
    if (idx <= 0) return
    const next = [...localListings]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    applyReorder(next)
  }

  const handleMoveDown = (id) => {
    const idx = localListings.findIndex(l => l.id === id)
    if (idx >= localListings.length - 1) return
    const next = [...localListings]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    applyReorder(next)
  }

  const handleDragStart = (e, id) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, id) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== draggingId) setDragOverId(id)
  }

  const handleDrop = (e, targetId) => {
    e.preventDefault()
    if (draggingId == null || draggingId === targetId) {
      setDraggingId(null)
      setDragOverId(null)
      return
    }
    const fromIdx = localListings.findIndex(l => l.id === draggingId)
    const toIdx = localListings.findIndex(l => l.id === targetId)
    const next = [...localListings]
    const [item] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, item)
    setDraggingId(null)
    setDragOverId(null)
    applyReorder(next)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverId(null)
  }

  const canDrag = isRanked && !isTouchOnly

  return (
    <main className="grid">
      {localListings.map((l, idx) => (
        <ListingCard
          key={l.id}
          listing={l}
          onSelect={onSelect}
          isRanked={isRanked}
          rank={isRanked ? idx + 1 : null}
          isTouchOnly={isTouchOnly}
          isDragging={draggingId === l.id}
          isDragOver={dragOverId === l.id}
          onMoveUp={isRanked && idx > 0 ? () => handleMoveUp(l.id) : null}
          onMoveDown={isRanked && idx < localListings.length - 1 ? () => handleMoveDown(l.id) : null}
          onDragStart={canDrag ? (e) => handleDragStart(e, l.id) : undefined}
          onDragOver={canDrag ? (e) => handleDragOver(e, l.id) : undefined}
          onDrop={canDrag ? (e) => handleDrop(e, l.id) : undefined}
          onDragEnd={canDrag ? handleDragEnd : undefined}
        />
      ))}
    </main>
  )
}
