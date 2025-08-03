import { useEffect } from 'preact/hooks'
import { logger } from '../utils/logger'

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

      // Don't trigger shortcuts when modifier keys are pressed (for copy/paste etc)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      // Only prevent default for navigation keys and escape
      const navigationKeys = [' ', 'Enter', 'Backspace', 'ArrowLeft', 'ArrowRight', 'Escape']
      
      if (navigationKeys.includes(event.key)) {
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
          // Show help
          logger.info('🎮 Roam Keyboard Shortcuts:\n\nNavigation:\n  Space/Enter/→  Next content\n  Backspace/←    Previous content\n  \nActions:  \n  S              Share current content\n  D              Download current content\n  C              Open channels/filters\n  P              Toggle privacy screen\n  F              Fullscreen mode\n  T              Session statistics\n  \nGeneral:\n  Escape         Close overlays\n  ?              Show this help')
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress)
    }
  }, [config])
}