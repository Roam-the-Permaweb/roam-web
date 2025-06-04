import { useEffect } from 'preact/hooks'

interface KeyboardShortcutsConfig {
  onNext: () => void
  onPrevious: () => void
  onShare: () => void
  onDownload: () => void
  onOpenChannels: () => void
  onCloseOverlays: () => void
  onTogglePrivacy: () => void
  onFullscreen?: () => void
  onSessionStats?: () => void
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when user is typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target as HTMLElement)?.contentEditable === 'true'
      ) {
        return
      }

      // Prevent default for our handled keys
      const handledKeys = [
        ' ', 'Enter', 'Backspace', 'ArrowLeft', 'ArrowRight', 
        's', 'd', 'f', 'c', 'Escape', 'p', 't', '?'
      ]
      
      if (handledKeys.includes(event.key) || handledKeys.includes(event.code)) {
        event.preventDefault()
      }

      switch (event.key) {
        case ' ': // Space
        case 'Enter':
        case 'ArrowRight':
          config.onNext()
          break
          
        case 'Backspace':
        case 'ArrowLeft':
          config.onPrevious()
          break
          
        case 's':
        case 'S':
          config.onShare()
          break
          
        case 'd':
        case 'D':
          config.onDownload()
          break
          
        case 'c':
        case 'C':
          config.onOpenChannels()
          break
          
        case 'p':
        case 'P':
          config.onTogglePrivacy()
          break
          
        case 'f':
        case 'F':
          if (config.onFullscreen) {
            config.onFullscreen()
          }
          break
          
        case 't':
        case 'T':
          if (config.onSessionStats) {
            config.onSessionStats()
          }
          break
          
        case 'Escape':
          config.onCloseOverlays()
          break
          
        case '?':
          // Show help - we can implement this later
          console.log(`
🎮 Roam Keyboard Shortcuts:

Navigation:
  Space/Enter/→  Next content
  Backspace/←    Previous content
  
Actions:  
  S              Share current content
  D              Download current content
  C              Open channels/filters
  P              Toggle privacy screen
  F              Fullscreen mode
  T              Session statistics
  
General:
  Escape         Close overlays
  ?              Show this help
          `)
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress)
    }
  }, [config])
}