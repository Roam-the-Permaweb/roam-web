import { useState, useEffect } from 'preact/hooks'

const STORAGE_KEY = 'roam-block-height-mode'

export function useBlockHeightMode() {
  const [isBlockMode, setIsBlockMode] = useState(() => {
    // Default to date mode (false)
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'true'
  })

  // Persist to localStorage when changed
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, isBlockMode.toString())
  }, [isBlockMode])

  const toggleMode = () => setIsBlockMode(!isBlockMode)

  return {
    isBlockMode,
    setIsBlockMode,
    toggleMode
  }
}