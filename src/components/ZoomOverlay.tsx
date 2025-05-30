// src/components/ZoomOverlay.tsx
import { useState } from 'preact/hooks'
import { Icons } from './Icons'
import '../styles/zoom-overlay.css';

export function ZoomOverlay({ src, onClose }: { src: string; onClose(): void }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 })

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const newScale = Math.max(0.5, Math.min(5, scale + (e.deltaY > 0 ? -0.1 : 0.1)))
    setScale(newScale)
  }

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setLastPointer({ x: e.clientX, y: e.clientY })
      e.preventDefault()
    }
  }

  const handlePointerMove = (e: PointerEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - lastPointer.x
      const deltaY = e.clientY - lastPointer.y
      setPosition(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }))
      setLastPointer({ x: e.clientX, y: e.clientY })
      e.preventDefault()
    }
  }

  const handlePointerUp = () => {
    setIsDragging(false)
  }

  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    } else {
      setScale(2)
    }
  }

  return (
    <div className="zoom-overlay">
      <button className="zoom-close-btn" onClick={onClose} aria-label="Close zoom view">
        <Icons.Close />
      </button>
      <div 
        className="zoom-scroll-container"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDblClick={handleDoubleClick}
        style={{ cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in' }}
      >
        <img 
          src={src} 
          alt="Zoomed media" 
          className="zoomed-img"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease'
          }}
          draggable={false}
        />
      </div>
      {scale > 1 && (
        <div className="zoom-hint">
          Pinch, scroll, or drag to explore • Double-click to reset
        </div>
      )}
    </div>
  );
}

