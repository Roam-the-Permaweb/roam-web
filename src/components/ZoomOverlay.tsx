// src/components/ZoomOverlay.tsx
import { useState, useRef } from 'preact/hooks'
import { Icons } from './Icons'
import '../styles/zoom-overlay.css';

export function ZoomOverlay({ src, onClose }: { src: string; onClose(): void }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 })
  
  // Touch gesture tracking
  const touchStartDistance = useRef(0)
  const lastTouchCenter = useRef({ x: 0, y: 0 })
  const initialScale = useRef(1)

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const newScale = Math.max(0.5, Math.min(5, scale + (e.deltaY > 0 ? -0.1 : 0.1)))
    setScale(newScale)
  }

  // Calculate distance between two touch points
  const getTouchDistance = (touches: TouchList) => {
    if (touches.length < 2) return 0
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Calculate center point between two touches
  const getTouchCenter = (touches: TouchList) => {
    if (touches.length < 2) return { x: touches[0].clientX, y: touches[0].clientY }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    }
  }

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch gesture start
      e.preventDefault()
      touchStartDistance.current = getTouchDistance(e.touches)
      lastTouchCenter.current = getTouchCenter(e.touches)
      initialScale.current = scale
      setIsDragging(false)
    } else if (e.touches.length === 1) {
      // Single touch for dragging
      setIsDragging(true)
      setLastPointer({ x: e.touches[0].clientX, y: e.touches[0].clientY })
    }
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistance.current > 0) {
      // Pinch zoom
      e.preventDefault()
      const currentDistance = getTouchDistance(e.touches)
      const scaleFactor = currentDistance / touchStartDistance.current
      const newScale = Math.max(0.5, Math.min(5, initialScale.current * scaleFactor))
      
      // Also handle panning during pinch
      const currentCenter = getTouchCenter(e.touches)
      const deltaX = currentCenter.x - lastTouchCenter.current.x
      const deltaY = currentCenter.y - lastTouchCenter.current.y
      
      setScale(newScale)
      setPosition(prev => ({ 
        x: prev.x + deltaX, 
        y: prev.y + deltaY 
      }))
      
      lastTouchCenter.current = currentCenter
    } else if (e.touches.length === 1 && isDragging) {
      // Single touch drag
      const deltaX = e.touches[0].clientX - lastPointer.x
      const deltaY = e.touches[0].clientY - lastPointer.y
      setPosition(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }))
      setLastPointer({ x: e.touches[0].clientX, y: e.touches[0].clientY })
    }
  }

  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) {
      setIsDragging(false)
      touchStartDistance.current = 0
    }
  }

  const handlePointerDown = (e: PointerEvent) => {
    // Only handle mouse events, not touch events
    if (e.pointerType === 'mouse' && e.button === 0) {
      setIsDragging(true)
      setLastPointer({ x: e.clientX, y: e.clientY })
      e.preventDefault()
    }
  }

  const handlePointerMove = (e: PointerEvent) => {
    // Only handle mouse events
    if (e.pointerType === 'mouse' && isDragging) {
      const deltaX = e.clientX - lastPointer.x
      const deltaY = e.clientY - lastPointer.y
      setPosition(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }))
      setLastPointer({ x: e.clientX, y: e.clientY })
      e.preventDefault()
    }
  }

  const handlePointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      setIsDragging(false)
    }
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDblClick={handleDoubleClick}
        style={{ 
          cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in',
          touchAction: 'none' // Prevent default touch behavior
        }}
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
          Pinch, scroll, or drag to explore • Double-tap to reset
        </div>
      )}
    </div>
  );
}

