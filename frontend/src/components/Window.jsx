import { useState, useRef, useCallback } from 'react'

// Shared z-index counter — clicking any window brings it to front.
let _z = 200

export default function Window({ title, onClose, children, width = 600, initialX, initialY }) {
  const startX = typeof initialX === 'number' ? initialX : Math.max(20, (window.innerWidth - width) / 2)
  const startY = typeof initialY === 'number' ? initialY : 80

  const [pos, setPos] = useState({ x: startX, y: startY })
  const [z, setZ]     = useState(() => ++_z)
  const posRef        = useRef(pos)
  posRef.current      = pos

  const bringToFront = useCallback(() => setZ(++_z), [])

  const onTitleMouseDown = useCallback((e) => {
    if (e.button !== 0 || e.target.tagName === 'BUTTON') return
    e.preventDefault()
    bringToFront()
    const mx0 = e.clientX, my0 = e.clientY
    const px0 = posRef.current.x, py0 = posRef.current.y
    const onMove = (ev) => setPos({ x: px0 + (ev.clientX - mx0), y: Math.max(0, py0 + (ev.clientY - my0)) })
    const onUp   = ()   => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [bringToFront])

  return (
    <div
      className="win"
      style={{ left: pos.x, top: pos.y, zIndex: z, width }}
      onMouseDown={bringToFront}
    >
      <div className="win-titlebar" onMouseDown={onTitleMouseDown}>
        <span className="win-title">{title}</span>
        <button className="win-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="win-body">
        {children}
      </div>
    </div>
  )
}
