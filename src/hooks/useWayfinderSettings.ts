import { useState, useEffect } from 'preact/hooks'
import { wayfinderService } from '../services/wayfinder'
import { logger } from '../utils/logger'

interface WayfinderSettings {
  enableWayfinder: boolean // Combined data routing and verification
  enableGraphQL: boolean
}

interface UseWayfinderSettingsResult {
  settings: WayfinderSettings
  updateSettings: (newSettings: Partial<WayfinderSettings>) => void
  isLoading: boolean
}

/**
 * Hook for managing Wayfinder settings with persistence
 */
export function useWayfinderSettings(): UseWayfinderSettingsResult {
  const [settings, setSettings] = useState<WayfinderSettings>({
    enableWayfinder: true, // Combined data routing and verification, on by default
    enableGraphQL: false // Off by default as requested
  })
  const [isLoading, setIsLoading] = useState(true)

  // Load settings on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        const config = wayfinderService.getConfig()
        setSettings({
          enableWayfinder: config.enableWayfinder, // This controls both data routing and verification
          enableGraphQL: false // Not implemented yet
        })
      } catch (error) {
        logger.warn('Failed to load Wayfinder settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  const updateSettings = (newSettings: Partial<WayfinderSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
    
    // Update the service configuration
    const serviceConfig: any = {}
    if ('enableWayfinder' in newSettings) {
      serviceConfig.enableWayfinder = newSettings.enableWayfinder
      serviceConfig.enableVerification = newSettings.enableWayfinder // Same setting controls both
    }
    // GraphQL will be handled when implemented
    
    wayfinderService.updateConfig(serviceConfig)
    
    logger.info('Wayfinder settings updated:', newSettings)
  }

  return {
    settings,
    updateSettings,
    isLoading
  }
}