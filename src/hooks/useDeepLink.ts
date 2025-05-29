import { useState, useEffect } from 'preact/hooks'
import { fetchTxMetaById, getCurrentBlockHeight } from '../engine/query'
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'
import { MEDIA_TYPES, type Channel, type MediaType, type TxMeta } from '../constants'

export type DeepLinkOpts = {
  initialTx?: TxMeta
  minBlock?: number
  maxBlock?: number
  channel?: Channel
  ownerAddress?: string
  appName?: string
}

export function useDeepLink() {
  const [deepLinkOpts, setDeepLinkOpts] = useState<DeepLinkOpts | null>(null)
  const [deepLinkParsed, setDeepLinkParsed] = useState(false)
  const [chainTip, setChainTip] = useState(9999999)
  
  useEffect(() => {
    let isMounted = true
    
    const parseUrlParams = async () => {
      const params = new URLSearchParams(window.location.search)
      const opts: DeepLinkOpts = {}
      
      try {
        // Get chain tip
        const tip = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0])
        if (isMounted) setChainTip(tip)
        
        // Parse txid
        if (params.has('txid')) {
          try {
            opts.initialTx = await fetchTxMetaById(params.get('txid')!)
          } catch (error) {
            console.warn('Failed to fetch initial transaction:', error)
          }
        }
        
        // Parse owner address
        if (params.has('ownerAddress')) {
          opts.ownerAddress = params.get('ownerAddress')!
        }
        
        // Parse app name
        if (params.has('appName')) {
          opts.appName = params.get('appName')!
        }
        
        // Parse block range
        if (params.has('minBlock')) {
          const minBlock = Number(params.get('minBlock'))
          if (!isNaN(minBlock)) {
            opts.minBlock = minBlock
          }
        }
        
        if (params.has('maxBlock')) {
          const maxBlock = Number(params.get('maxBlock'))
          if (!isNaN(maxBlock)) {
            opts.maxBlock = maxBlock
          }
        }
        
        // Parse channel/media type
        if (params.has('channel')) {
          const rawMedia = params.get('channel')!
          if (MEDIA_TYPES.includes(rawMedia as MediaType)) {
            opts.channel = {
              media: rawMedia as MediaType,
              recency: 'old', // Default value - fixed bug from original
              ownerAddress: undefined,
              appName: undefined
            }
          } else {
            console.warn('Ignoring invalid channel media:', rawMedia)
          }
        }
        
        if (isMounted) {
          setDeepLinkOpts(opts)
          setDeepLinkParsed(true)
          
          // Clear URL parameters to prevent re-parsing
          window.history.replaceState({}, '', window.location.pathname + window.location.hash)
        }
      } catch (error) {
        console.error('Error parsing URL parameters:', error)
        if (isMounted) {
          setDeepLinkParsed(true) // Still mark as parsed to allow app to continue
        }
      }
    }
    
    parseUrlParams()
    return () => { isMounted = false }
  }, [])
  
  const clearDeepLink = () => setDeepLinkOpts(null)
  
  return { 
    deepLinkOpts, 
    deepLinkParsed, 
    chainTip, 
    setChainTip,
    clearDeepLink 
  }
}