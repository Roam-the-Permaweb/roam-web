import { useState, useEffect } from 'preact/hooks'
import { wayfinderService } from '../services/wayfinder'
import { logger } from '../utils/logger'
import type { WayfinderConfig } from '../services/wayfinderTypes'

interface WayfinderSettings {
  // Master control (combines routing + verification)
  enableWayfinder: boolean
  
  // Gateway provider configuration  
  gatewayProvider: 'network' | 'static' | 'simple-cache'
  gatewayLimit: number
  staticGateways: string[]
  cacheTimeoutMinutes: number
  
  // Verification configuration
  verificationStrategy: 'hash' | 'none'
  trustedGateways: string[]
  verificationTimeoutMs: number
  
  // Future features
  enableGraphQL: boolean
}

interface UseWayfinderSettingsResult {
  settings: WayfinderSettings
  updateSettings: (newSettings: Partial<WayfinderSettings>) => void
  isLoading: boolean
  resetToDefaults: () => void
  validationErrors: Record<string, string>
  isConnected: boolean
}

/**
 * Hook for managing Wayfinder settings with persistence
 */
export function useWayfinderSettings(): UseWayfinderSettingsResult {
  const [settings, setSettings] = useState<WayfinderSettings>({
    // Master control - disabled by default (experimental)
    enableWayfinder: false,
    
    // Gateway provider configuration
    gatewayProvider: 'network',
    gatewayLimit: 5,
    staticGateways: ['https://vilenarios.com', 'https://permagate.io'],
    cacheTimeoutMinutes: 1,
    
    // Verification configuration
    verificationStrategy: 'hash',
    trustedGateways: ['https://permagate.io', 'https://vilenarios.com'],
    verificationTimeoutMs: 10000,
    
    // Future features
    enableGraphQL: false
  })
  const [isLoading, setIsLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isConnected, setIsConnected] = useState(false)

  // Validate gateway URL format
  const validateGatewayUrl = (url: string): boolean => {
    try {
      const parsedUrl = new URL(url.trim())
      return parsedUrl.protocol === 'https:' && parsedUrl.hostname.length > 0
    } catch {
      return false
    }
  }

  // Validate gateway array
  const validateGateways = (gateways: string[], fieldName: string): string | null => {
    if (!gateways || gateways.length === 0) {
      return `${fieldName} cannot be empty`
    }
    
    const invalidUrls = gateways.filter(url => !validateGatewayUrl(url))
    if (invalidUrls.length > 0) {
      return `Invalid URLs: ${invalidUrls.join(', ')}. URLs must use HTTPS.`
    }
    
    return null
  }

  // Remove unnecessary checkConnection function - Wayfinder initializes lazily

  // Load settings on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        const config = wayfinderService.getConfig()
        setSettings({
          // Master control
          enableWayfinder: config.enableWayfinder,
          
          // Gateway provider configuration
          gatewayProvider: config.gatewayProvider,
          gatewayLimit: config.gatewayLimit,
          staticGateways: config.staticGateways,
          cacheTimeoutMinutes: config.cacheTimeoutMinutes,
          
          // Verification configuration
          verificationStrategy: config.verificationStrategy,
          trustedGateways: config.trustedGateways,
          verificationTimeoutMs: config.verificationTimeoutMs,
          
          // Future features
          enableGraphQL: false // Not implemented yet
        })
        
        // Set initial connection status based on enabled state
        setIsConnected(config.enableWayfinder)
      } catch (error) {
        logger.warn('Failed to load Wayfinder settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  // Update connection status based on enableWayfinder setting
  useEffect(() => {
    // Simply reflect whether Wayfinder is enabled
    // Actual initialization happens lazily on first content request
    setIsConnected(settings.enableWayfinder)
  }, [settings.enableWayfinder])

  const updateSettings = (newSettings: Partial<WayfinderSettings>) => {
    // Validate settings before applying
    const newErrors: Record<string, string> = {}
    const updatedSettings = { ...settings, ...newSettings }
    
    // Validate static gateways if provider is static
    if (updatedSettings.gatewayProvider === 'static' && 'staticGateways' in newSettings) {
      const error = validateGateways(newSettings.staticGateways!, 'Static gateways')
      if (error) newErrors.staticGateways = error
    }
    
    // Validate trusted gateways if verification strategy is hash
    if (updatedSettings.verificationStrategy === 'hash' && 'trustedGateways' in newSettings) {
      const error = validateGateways(newSettings.trustedGateways!, 'Trusted gateways')
      if (error) newErrors.trustedGateways = error
    }
    
    // Update validation errors
    setValidationErrors(newErrors)
    
    // Only proceed if no validation errors
    if (Object.keys(newErrors).length === 0) {
      setSettings(updatedSettings)
      
      // Convert UI settings to service configuration
      const serviceConfig: Partial<WayfinderConfig> = {}
      
      // Map all settings to service config
      if ('enableWayfinder' in newSettings) {
        serviceConfig.enableWayfinder = newSettings.enableWayfinder
      }
      if ('gatewayProvider' in newSettings) serviceConfig.gatewayProvider = newSettings.gatewayProvider
      if ('gatewayLimit' in newSettings) serviceConfig.gatewayLimit = newSettings.gatewayLimit
      if ('staticGateways' in newSettings) serviceConfig.staticGateways = newSettings.staticGateways
      if ('cacheTimeoutMinutes' in newSettings) serviceConfig.cacheTimeoutMinutes = newSettings.cacheTimeoutMinutes
      if ('verificationStrategy' in newSettings) serviceConfig.verificationStrategy = newSettings.verificationStrategy
      if ('trustedGateways' in newSettings) serviceConfig.trustedGateways = newSettings.trustedGateways
      if ('verificationTimeoutMs' in newSettings) serviceConfig.verificationTimeoutMs = newSettings.verificationTimeoutMs
      
      try {
        // Update the wayfinder service
        wayfinderService.updateConfig(serviceConfig)
        
        logger.info('Wayfinder settings updated successfully:', {
          uiSettings: newSettings,
          serviceEnabled: wayfinderService.getConfig().enableWayfinder
        })
      } catch (error) {
        logger.error('Failed to update Wayfinder service:', error)
        // Revert settings on service update failure
        setSettings(settings)
        setValidationErrors({ general: 'Failed to apply settings. Please try again.' })
      }
    } else {
      logger.warn('Validation errors prevented settings update:', newErrors)
    }
  }

  const resetToDefaults = () => {
    const defaultSettings: WayfinderSettings = {
      enableWayfinder: false,
      gatewayProvider: 'network',
      gatewayLimit: 5,
      staticGateways: ['https://vilenarios.com', 'https://permagate.io'],
      cacheTimeoutMinutes: 1,
      verificationStrategy: 'hash',
      trustedGateways: ['https://permagate.io', 'https://vilenarios.com'],
      verificationTimeoutMs: 10000,
      enableGraphQL: false
    }
    
    updateSettings(defaultSettings)
    logger.info('Wayfinder settings reset to defaults')
  }

  return {
    settings,
    updateSettings,
    resetToDefaults,
    isLoading,
    validationErrors,
    isConnected
  }
}