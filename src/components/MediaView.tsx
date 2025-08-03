/**
 * MediaView - Universal Content Renderer
 * 
 * Renders different types of Arweave content with optimized user experience:
 * 
 * Supported Content Types:
 * - Images: Progressive loading with zoom capability
 * - Videos: Native HTML5 player with metadata preload
 * - Audio: Enhanced player with visual wave animation
 * - Text/Markdown: Syntax-highlighted with proper typography
 * - PDFs: Embedded iframe viewer
 * - Websites/HTML: Sandboxed iframe rendering
 * - ArFS Files: Metadata resolution with file type detection
 * 
 * Smart Loading Features:
 * - Manual load buttons for large files (bandwidth consideration)
 * - Progressive enhancement based on file size thresholds
 * - Automatic fallback and error handling for corrupted content
 * - Privacy screen toggle for NSFW content protection
 * 
 * UI/UX Features:
 * - Apple-inspired design with floating action menus
 * - Content-aware sizing (images/videos vs text/websites)
 * - Smooth transitions and loading states
 * - Mobile-optimized touch interactions
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import '../styles/media-view.css';
import '../styles/verification-indicator.css';
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue';
import { logger } from '../utils/logger';
import { objectUrlManager } from '../utils/objectUrlManager';
import { useWayfinderContent } from '../hooks/useWayfinderContent';
import { arnsService } from '../services/arns';
import { getArNSErrorMessage, isRetryableArNSError } from '../services/arns/errors';
import type { TxMeta } from '../constants';
import { 
  IMAGE_LOAD_THRESHOLD, 
  VIDEO_LOAD_THRESHOLD, 
  AUDIO_LOAD_THRESHOLD, 
  TEXT_LOAD_THRESHOLD,
  IFRAME_LOAD_TIMEOUT,
  FADE_IN_DELAY
} from '../constants';
import { Icons, getMediaTypeIcon } from './Icons';

export interface MediaViewProps {
  txMeta: TxMeta;
  onDetails?: () => void;
  privacyOn: boolean;
  onPrivacyToggle: () => void;
  onZoom?: (src: string) => void;
  onCorrupt?: (txMeta: TxMeta) => void;
  loading?: boolean;
  onShare?: () => void;
  onDownload?: () => void;
  onOpenInNewTab?: () => void;
  onGatewayChange?: (gateway: string | null) => void;
  onArnsValidated?: (validatedTxMeta: TxMeta) => void;
  onArnsValidationStateChange?: (isValidating: boolean) => void;
}

export const MediaView = ({
  txMeta,
  onDetails,
  privacyOn,
  onPrivacyToggle,
  onZoom,
  onCorrupt,
  onShare,
  onDownload,
  onOpenInNewTab,
  onGatewayChange,
  onArnsValidated,
  onArnsValidationStateChange
}: MediaViewProps) => {
  const { id, tags } = txMeta;

  const arfsMeta = txMeta.arfsMeta;
  /*const contentType =
    arfsMeta?.contentType ||     // fallback if old style
    tags.find(t => t.name === 'Content-Type')?.value || ''; */
  const size = arfsMeta?.size ?? txMeta.data.size;
  const dataTxId = arfsMeta?.dataTxId || id;
  
  // Determine content type once with proper fallback chain
  const baseContentType = arfsMeta?.contentType || 
                          tags.find(t => t.name === 'Content-Type')?.value || 
                          '';

  // State for forcing content to load even if it exceeds size thresholds
  const [forceLoad, setForceLoad] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [mediaLoadError, setMediaLoadError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  
  // ArNS validation state
  const [arnsValidating, setArnsValidating] = useState(false);
  const [arnsValidated, setArnsValidated] = useState(!txMeta.needsValidation);
  const [arnsValidationError, setArnsValidationError] = useState<string | null>(null);
  const [validatedTxMeta, setValidatedTxMeta] = useState(txMeta);
  
  // Determine if we should initialize Wayfinder
  // For ArNS content, wait until validation is complete to avoid double fetching
  const shouldInitializeWayfinder = !txMeta.needsValidation || arnsValidated;
  
  // Use Wayfinder for content URL with size-aware loading
  const wayfinderContentId = (() => {
    if (!shouldInitializeWayfinder) {
      return null; // Don't initialize until ArNS validation is complete
    }
    
    // Use validated transaction metadata if available
    const currentTxMeta = arnsValidated ? validatedTxMeta : txMeta;
    const txId = currentTxMeta.arfsMeta?.dataTxId || currentTxMeta.id;
    
    return txId;
  })();
  
  const wayfinderResult = useWayfinderContent(
    wayfinderContentId, 
    undefined, 
    forceLoad, 
    baseContentType, 
    size,
    validatedTxMeta.arnsGateway || txMeta.arnsGateway,
    retryCount
  );
  
  // Final content type: prefer Wayfinder's detected type, fallback to base
  const contentType = wayfinderResult.contentType || baseContentType;

  // For manifests and HTML, prefer direct URL to maintain domain context
  // For other content types, prefer verified Blob from Wayfinder for security
  const getContentUrl = () => {
    const isManifestOrHtml = contentType.startsWith('application/x.arweave-manifest') || 
                            contentType.startsWith('text/html') ||
                            contentType === 'application/xhtml+xml';
    
    // Use direct URL for manifests and HTML to preserve domain context for relative paths
    if (isManifestOrHtml && (txMeta.arnsName || validatedTxMeta.arnsName)) {
      return directUrl;
    }
    
    return objectUrl || directUrl;
  };
  
  const directUrl = (() => {
    // Use validated transaction metadata if available
    const currentTxMeta = arnsValidated ? validatedTxMeta : txMeta;
    
    // For ArNS content, use subdomain URL format for proper manifest resolution
    if (currentTxMeta.arnsName && currentTxMeta.arnsGateway) {
      const gatewayUrl = new URL(currentTxMeta.arnsGateway);
      // Check if the gateway URL already includes the ArNS subdomain
      if (gatewayUrl.hostname.startsWith(`${currentTxMeta.arnsName}.`)) {
        // Gateway URL already has the ArNS subdomain, use as-is
        return currentTxMeta.arnsGateway;
      } else {
        // Need to add the ArNS subdomain
        return `https://${currentTxMeta.arnsName}.${gatewayUrl.hostname}`;
      }
    }
    
    // For unresolved ArNS names (placeholder IDs), use ArNS subdomain format
    if (currentTxMeta.arnsName && !currentTxMeta.arnsGateway && dataTxId.startsWith('arns:')) {
      // Use the first gateway for unresolved ArNS names
      const gateway = new URL(GATEWAY_DATA_SOURCE[0]).hostname;
      return `https://${currentTxMeta.arnsName}.${gateway}`;
    }
    
    // For regular content, use the standard URL format
    return wayfinderResult.url || `${GATEWAY_DATA_SOURCE[0]}/${dataTxId}`;
  })();

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const wideContentTypes = [
    'application/pdf',
    'text/html',
    'application/xhtml+xml',
    'application/x.arweave-manifest+json'
  ];
  const isWide = contentType && wideContentTypes.includes(contentType);
  
  // Determine content type for height styling
  const getContentTypeClass = () => { if (contentType) {
      if (contentType.startsWith('image/')) return 'content-image';
      if (contentType === 'application/pdf') return 'content-pdf';
      if (['text/plain', 'text/markdown'].includes(contentType)) return 'content-text';
      if (contentType.startsWith('text/html') || 
          contentType === 'application/xhtml+xml' || 
          contentType.startsWith('application/x.arweave-manifest') || 
          contentType.startsWith('application/json')) return 'content-website';
      if (contentType.startsWith('audio/')) return 'content-audio';
      return '';
    }
  };

  // Initialize with false, will be properly set in useEffect after content type is determined
  const [manualLoad, setManualLoad] = useState(false);
  const [manualLoadVideo, setManualLoadVideo] = useState(false);
  const [manualLoadAudio, setManualLoadAudio] = useState(false);
  const [manualLoadText, setManualLoadText] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const objectUrlKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const textExtractionRef = useRef<{ txId: string; promise: Promise<string> | null }>({ txId: '', promise: null });
  const [mediaLoaded, setMediaLoaded] = useState(false);

  // Reset state when transaction changes
  useEffect(() => {
    setForceLoad(false);
    setTextContent(null);
    setLoadingText(false);
    setErrorText(null);
    setFadeIn(false);
    setMediaLoaded(false);
    
    // Release previous object URL when transaction changes
    if (objectUrlKeyRef.current) {
      objectUrlManager.release(objectUrlKeyRef.current);
      objectUrlKeyRef.current = null;
    }
    
    // Reset text extraction cache when transaction changes
    textExtractionRef.current = { txId: '', promise: null };
    
    // Trigger fade in after a short delay for smooth transition
    const timer = setTimeout(() => {
      setFadeIn(true);
    }, FADE_IN_DELAY);
    
    return () => clearTimeout(timer);
  }, [id]); // Only reset when transaction changes, not when content type is detected

  // Update manual load flags when content type or size changes
  useEffect(() => {
    const isImage = contentType.startsWith('image/');
    const isVideo = contentType.startsWith('video/');
    const isAudio = contentType.startsWith('audio/');
    const isText = ['text/plain', 'text/markdown'].includes(contentType);

    // Set manual load flags based on size thresholds
    setManualLoad(isImage && size > IMAGE_LOAD_THRESHOLD);
    setManualLoadVideo(isVideo && size > VIDEO_LOAD_THRESHOLD);
    setManualLoadAudio(isAudio && size > AUDIO_LOAD_THRESHOLD);
    setManualLoadText(isText && size > TEXT_LOAD_THRESHOLD);
    
    // For content types that don't need loading events, mark as loaded
    const needsLoadEvent = isImage || isVideo || isAudio;
    if (!needsLoadEvent && wayfinderResult.url && !wayfinderResult.loading) {
      setMediaLoaded(true);
    }
  }, [contentType, size, wayfinderResult.url, wayfinderResult.loading]);

  // Reset media error when content changes or retry is triggered
  useEffect(() => {
    setMediaLoadError(false);
  }, [id, retryCount]);

  // Clear retry state when content loads successfully
  useEffect(() => {
    if (!wayfinderResult.loading && !wayfinderResult.error && wayfinderResult.url && isRetrying) {
      setIsRetrying(false);
    }
  }, [wayfinderResult.loading, wayfinderResult.error, wayfinderResult.url, isRetrying]);

  // Reset ArNS validation state when transaction changes
  useEffect(() => {
    setArnsValidating(false);
    setArnsValidated(!txMeta.needsValidation);
    setArnsValidationError(null);
    setValidatedTxMeta(txMeta);
  }, [txMeta.id]);

  // ArNS validation effect - validate on-demand when component loads
  useEffect(() => {
    if (txMeta.needsValidation && txMeta.arnsName && !arnsValidated && !arnsValidating) {
      const validateArnsName = async () => {
        setArnsValidating(true);
        setArnsValidationError(null);
        
        // Set a timeout to prevent hanging ArNS validation
        const validationTimeout = setTimeout(() => {
          setArnsValidating(false);
          setArnsValidationError('ArNS validation timed out');
          logger.warn(`ArNS validation timeout for ${txMeta.arnsName}`);
        }, 10000); // 10 second timeout
        
        // Notify parent that validation is starting
        if (onArnsValidationStateChange) {
          onArnsValidationStateChange(true);
        }
        
        try {
          logger.info(`[ArNS Resolution] Resolving ArNS name to transaction ID: ${txMeta.arnsName}`);
          const resolvedTxId = await arnsService.validateArNSName(txMeta.arnsName!);
          
          if (!resolvedTxId) {
            throw new Error(`Failed to resolve ArNS name: ${txMeta.arnsName}`);
          }
          
          // Fetch transaction metadata for the resolved ID
          const response = await fetch(`${GATEWAY_DATA_SOURCE[0]}/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `
                query GetTransaction($id: ID!) {
                  transaction(id: $id) {
                    id
                    owner { address }
                    fee { ar }
                    quantity { ar }
                    tags { name value }
                    data { size }
                    block { height timestamp }
                    bundledIn { id }
                  }
                }
              `,
              variables: { id: resolvedTxId }
            })
          });
          
          const result = await response.json();
          
          if (result.data?.transaction) {
            const tx = result.data.transaction;
            
            // Get the gateway URL from the validated metadata
            const validatedMetadata = arnsService.getValidatedMetadata(txMeta.arnsName!);
            const gatewayUrl = validatedMetadata?.gatewayUrl || GATEWAY_DATA_SOURCE[0];
            
            // Update the transaction metadata with real data
            const newTxMeta: TxMeta = {
              ...tx,
              arnsName: txMeta.arnsName,
              arnsGateway: gatewayUrl,
              needsValidation: false
            };
            
            setValidatedTxMeta(newTxMeta);
            setArnsValidated(true);
            logger.info(`[ArNS Metadata] Successfully fetched transaction data for ${txMeta.arnsName} (${resolvedTxId})`);
            
            // Notify parent component of validated metadata
            if (onArnsValidated) {
              onArnsValidated(newTxMeta);
            }
          } else {
            throw new Error(`No transaction data found for resolved ID: ${resolvedTxId}`);
          }
        } catch (_error) {
          logger.error(`ArNS validation failed for ${txMeta.arnsName}:`, _error);
          
          // Get user-friendly error message
          const errorMessage = getArNSErrorMessage(_error);
          setArnsValidationError(errorMessage);
          
          // TODO: If the error is retryable, we could implement retry logic here
          // For now, just show the error to the user
          if (isRetryableArNSError(_error)) {
            logger.info(`ArNS error is retryable for ${txMeta.arnsName}`);
          }
        } finally {
          clearTimeout(validationTimeout);
          setArnsValidating(false);
          
          // Notify parent that validation is complete
          if (onArnsValidationStateChange) {
            onArnsValidationStateChange(false);
          }
        }
      };
      
      validateArnsName();
    }
  }, [txMeta.needsValidation, txMeta.arnsName, arnsValidated, arnsValidating]);

  // Notify parent component when gateway changes
  useEffect(() => {
    if (onGatewayChange && wayfinderResult.gateway) {
      onGatewayChange(wayfinderResult.gateway);
    }
  }, [wayfinderResult.gateway, onGatewayChange]);

  // Track component mount state and cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Release object URL on unmount
      if (objectUrlKeyRef.current) {
        objectUrlManager.release(objectUrlKeyRef.current);
        objectUrlKeyRef.current = null;
      }
    };
  }, []);

  // Handle Wayfinder content data and Object URL lifecycle
  useEffect(() => {
    // Don't process if component is unmounting
    if (!mountedRef.current) return;

    // Create Object URL for Wayfinder data if available
    // Skip Object URL creation for manifests and HTML that need domain context
    const isManifestOrHtml = contentType.startsWith('application/x.arweave-manifest') || 
                            contentType.startsWith('text/html') ||
                            contentType === 'application/xhtml+xml';
    const shouldUseDirectUrl = isManifestOrHtml && (txMeta.arnsName || validatedTxMeta.arnsName);
    
    if (wayfinderResult.data && !wayfinderResult.loading && !shouldUseDirectUrl) {
      // Generate a unique key for this content
      const urlKey = `${txMeta.id}-${wayfinderResult.data.size}`;
      
      // Release previous URL if key changed
      if (objectUrlKeyRef.current && objectUrlKeyRef.current !== urlKey) {
        objectUrlManager.release(objectUrlKeyRef.current);
      }
      
      // Acquire new URL with reference counting
      const newObjectUrl = objectUrlManager.acquire(wayfinderResult.data, urlKey);
      objectUrlKeyRef.current = urlKey;
      setObjectUrl(newObjectUrl);
    } else if (shouldUseDirectUrl) {
      // Clear object URL for manifests/HTML that need direct URLs
      if (objectUrlKeyRef.current) {
        objectUrlManager.release(objectUrlKeyRef.current);
        objectUrlKeyRef.current = null;
      }
      setObjectUrl(null);
    }
    
    // For text content, extract text from Blob automatically with memoization
    if (wayfinderResult.data && !wayfinderResult.loading) {
      if ((contentType.startsWith('text/') && !contentType.startsWith('text/html') && !contentType.startsWith('text/xml')) ||
          ['text/plain', 'text/markdown'].includes(contentType)) {
        if (!manualLoadText && !textContent && !loadingText) {
          // Check if we already have a text extraction in progress for this transaction
          if (textExtractionRef.current.txId === txMeta.id && textExtractionRef.current.promise) {
            // Reuse existing extraction promise
            setLoadingText(true);
            textExtractionRef.current.promise
              .then(text => {
                setTextContent(text);
                setErrorText(null);
              })
              .catch(() => setErrorText('Failed to extract text from verified content'))
              .finally(() => setLoadingText(false));
          } else {
            // Create new extraction promise and cache it
            setLoadingText(true);
            const extractionPromise = wayfinderResult.data.text();
            textExtractionRef.current = { txId: txMeta.id, promise: extractionPromise };
            
            extractionPromise
              .then(text => {
                if (mountedRef.current) {
                  setTextContent(text);
                  setErrorText(null);
                }
              })
              .catch(() => {
                if (mountedRef.current) {
                  setErrorText('Failed to extract text from verified content');
                }
              })
              .finally(() => {
                if (mountedRef.current) {
                  setLoadingText(false);
                }
              });
          }
        }
      }
    }

  }, [wayfinderResult.data, wayfinderResult.loading, contentType, manualLoadText, txMeta.id, txMeta.arnsName, validatedTxMeta.arnsName]);

  // Iframe fallback detection for manifests and HTML
  useEffect(() => {
    if (!['application/pdf', 'text/html', 'application/xhtml+xml', 'application/x.arweave-manifest+json'].includes(contentType)) return;

    const timeout = setTimeout(() => {
      const iframe = iframeRef.current;
      if (iframe && iframe.offsetHeight < 32) {
        onCorrupt?.(txMeta);
      }
    }, IFRAME_LOAD_TIMEOUT);

    return () => clearTimeout(timeout);
  }, [contentType, directUrl, txMeta]);

  const renderMedia = () => {
    // Show error state with retry button
    if ((wayfinderResult.error && !wayfinderResult.loading) || mediaLoadError) {
      return (
        <div className="media-error-container">
          <div className="media-error-icon">
            <Icons.AlertCircle size={48} />
          </div>
          <div className="media-error-message">
            Failed to load content
          </div>
          <div className="media-error-details">
            {wayfinderResult.error?.includes('503') ? 'Gateway temporarily unavailable' :
             wayfinderResult.error?.includes('502') ? 'Gateway error' :
             wayfinderResult.error?.includes('504') ? 'Gateway timeout' :
             wayfinderResult.error?.includes('timeout') ? 'Request timed out' :
             mediaLoadError ? 'Content could not be displayed' :
             'Network error'}
          </div>
          {/* Show attempted gateways if available */}
          {wayfinderResult.errorDetails?.attemptedGateways && wayfinderResult.errorDetails.attemptedGateways.length > 0 && (
            <div className="media-error-gateways">
              <div className="gateway-attempts-label">Attempted gateways:</div>
              <div className="gateway-attempts-list">
                {wayfinderResult.errorDetails.attemptedGateways.map((gateway, index) => (
                  <span key={index} className="gateway-attempt-item">{gateway}</span>
                ))}
              </div>
            </div>
          )}
          <button 
            className="media-retry-btn"
            onClick={() => {
              if (!isRetrying) {
                setIsRetrying(true);
                setMediaLoadError(false);
                setRetryCount(prev => prev + 1);
                // Prevent rapid retries - but don't wait too long
                setTimeout(() => setIsRetrying(false), 300);
              }
            }}
            disabled={isRetrying}
          >
            {isRetrying ? <Icons.Loading size={16} /> : <Icons.Refresh size={16} />}
            {isRetrying ? 'Retrying...' : 'Try Again'}
          </button>
          <button 
            className="media-skip-btn"
            onClick={() => onCorrupt?.(txMeta)}
          >
            Skip to Next
          </button>
        </div>
      );
    }
    
    if (contentType.startsWith('image/') && manualLoad) {
      return (
        <button className="media-load-btn" onClick={() => { setManualLoad(false); setForceLoad(true); }} aria-label={`Load image, ${(size / 1024 / 1024).toFixed(2)} MB`}>
          Tap to load image ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      );
    }
    if (contentType.startsWith('image/')) {
      // SVGs need special handling due to security restrictions with blob URLs
      if (contentType === 'image/svg+xml') {
        return (
          <object
            className="media-image media-svg"
            data={manualLoad ? undefined : getContentUrl()}
            type="image/svg+xml"
            aria-label="SVG content"
            onClick={() => onZoom?.(getContentUrl())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onZoom?.(getContentUrl());
              }
            }}
            role="button"
            tabIndex={0}
            onError={() => {
              logger.warn('SVG failed to load', { 
                txId: txMeta.id, 
                contentType,
                url: getContentUrl() 
              });
              setMediaLoadError(true);
            }}
            onLoad={() => {
              setMediaLoaded(true);
            }}
          >
            <div className="media-error">SVG content could not be displayed</div>
          </object>
        );
      }
      
      return (
        <img
          className="media-image"
          src={manualLoad ? undefined : getContentUrl()}
          alt="Roam content"
          onClick={() => onZoom?.(getContentUrl())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onZoom?.(getContentUrl());
            }
          }}
          role="button"
          tabIndex={0}
          onError={() => {
            logger.warn('Media element failed to load', { 
              txId: txMeta.id, 
              contentType,
              url: getContentUrl() 
            });
            setMediaLoadError(true);
          }}
          onLoad={() => {
            setMediaLoaded(true);
          }}
        />
      );
    }

    if (contentType.startsWith('video/') && manualLoadVideo) {
      return (
        <button className="media-load-btn" onClick={() => { setManualLoadVideo(false); setForceLoad(true); }} aria-label={`Load video, ${(size / 1024 / 1024).toFixed(2)} MB`}>
          Tap to load video ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      );
    }
    if (contentType.startsWith('video/')) {
      return (
        <video
          className="media-element media-video"
          src={manualLoadVideo ? undefined : getContentUrl()}
          controls
          preload="metadata"
          onError={() => {
            logger.warn('Media element failed to load', { 
              txId: txMeta.id, 
              contentType,
              url: getContentUrl() 
            });
            setMediaLoadError(true);
          }}
          onLoadedData={() => {
            setMediaLoaded(true);
          }}
        />
      );
    }

    if (contentType.startsWith('audio/') && manualLoadAudio) {
      return (
        <button className="media-load-btn" onClick={() => { setManualLoadAudio(false); setForceLoad(true); }} aria-label={`Load audio, ${(size / 1024 / 1024).toFixed(2)} MB`}>
          Tap to load audio ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      );
    }
    if (contentType.startsWith('audio/')) {
      return (
        <div className="audio-player-container">
          <div className="audio-visualizer">
            <div className="audio-icon">
              <Icons.Music size={32} />
            </div>
            <div className="audio-waves">
              <div className="wave-bar"></div>
              <div className="wave-bar"></div>
              <div className="wave-bar"></div>
              <div className="wave-bar"></div>
              <div className="wave-bar"></div>
            </div>
          </div>
          <audio
            className="media-element media-audio"
            src={manualLoadAudio ? undefined : getContentUrl()}
            controls
            preload="metadata"
            onError={() => {
            logger.warn('Media element failed to load', { 
              txId: txMeta.id, 
              contentType,
              url: getContentUrl() 
            });
            setMediaLoadError(true);
          }}
            onLoadedData={() => {
              setMediaLoaded(true);
            }}
          />
        </div>
      );
    }


    if (contentType === 'application/pdf') {
      return (
        <div className="media-embed-wrapper">
          <iframe 
            ref={iframeRef} 
            className="media-pdf" 
            src={getContentUrl()}
            title="PDF Viewer" 
          />
        </div>
      );
    }

    if (
      contentType.startsWith('text/html') ||
      contentType === 'application/xhtml+xml' ||
      contentType.startsWith('application/x.arweave-manifest') || 
      contentType.startsWith('application/json') ||
      contentType.startsWith('text/xml') ||
      contentType.startsWith('application/xml')
    ) {
      return (
        <div className="media-embed-wrapper">
          <iframe
            ref={iframeRef}
            className="media-iframe"
            src={getContentUrl()}
            sandbox="allow-scripts allow-same-origin"
            title="Permaweb content preview"
          />
        </div>
      );
    }

    // Handle all text types (including markdown) that should display as text
    if ((contentType.startsWith('text/') && !contentType.startsWith('text/html') && !contentType.startsWith('text/xml')) ||
        ['text/plain', 'text/markdown'].includes(contentType)) {
      if (manualLoadText) {
        return (
          <button className="media-load-btn" onClick={() => { setManualLoadText(false); setForceLoad(true); }} aria-label={`Load text, ${(size / 1024 / 1024).toFixed(2)} MB`}>
            Tap to load text ({(size / 1024 / 1024).toFixed(2)} MB)
          </button>
        );
      }

      if (loadingText) return <div className="media-loading">Loading…</div>;
      if (errorText) return <div className="media-error">{errorText}</div>;
      
      if (!textContent && wayfinderResult.data && !loadingText) {
        return (
          <button 
            className="media-load-btn" 
            onClick={async () => {
              // Check if we already have cached text extraction for this transaction
              if (textExtractionRef.current.txId === txMeta.id && textExtractionRef.current.promise) {
                setLoadingText(true);
                try {
                  const text = await textExtractionRef.current.promise;
                  setTextContent(text);
                  setErrorText(null);
                } catch (_error) {
                  setErrorText('Failed to read text content');
                } finally {
                  setLoadingText(false);
                }
              } else {
                // Create new extraction promise and cache it
                setLoadingText(true);
                try {
                  const extractionPromise = wayfinderResult.data!.text();
                  textExtractionRef.current = { txId: txMeta.id, promise: extractionPromise };
                  const text = await extractionPromise;
                  setTextContent(text);
                  setErrorText(null);
                } catch (_error) {
                  setErrorText('Failed to read text content');
                } finally {
                  setLoadingText(false);
                }
              }
            }}
          >
            Load text content
          </button>
        );
      }
      
      return (
        <div className="media-element text-container">
          <pre className="media-text">{textContent}</pre>
        </div>
      );
    }

    // Handle empty/unknown content types with fallback display
    if (!contentType || contentType.trim() === '') {
      return (
        <div className="media-element text-container">
          <div className="media-info">
            <p>Content type unknown - attempting to display as text</p>
            {textContent ? (
              <pre className="media-text">{textContent}</pre>
            ) : wayfinderResult.data ? (
              <button 
                className="media-load-btn" 
                onClick={async () => {
                  // Use cached extraction if available
                  if (textExtractionRef.current.txId === txMeta.id && textExtractionRef.current.promise) {
                    try {
                      const text = await textExtractionRef.current.promise;
                      setTextContent(text);
                    } catch (_error) {
                      setErrorText('Failed to read content as text');
                    }
                  } else {
                    try {
                      const extractionPromise = wayfinderResult.data!.text();
                      textExtractionRef.current = { txId: txMeta.id, promise: extractionPromise };
                      const text = await extractionPromise;
                      setTextContent(text);
                    } catch (_error) {
                      setErrorText('Failed to read content as text');
                    }
                  }
                }}
              >
                Try loading as text
              </button>
            ) : (
              <div className="media-error">No content data available</div>
            )}
          </div>
        </div>
      );
    }

    // Show detailed error for debugging unsupported types
    const debugInfo = {
      wayfinderContentType: wayfinderResult.contentType,
      arfsContentType: arfsMeta?.contentType,
      tagContentType: tags.find(t => t.name === 'Content-Type')?.value,
      finalContentType: contentType,
      wayfinderEnabled: wayfinderResult.isWayfinderEnabled,
      wayfinderLoading: wayfinderResult.loading,
      wayfinderError: wayfinderResult.error
    };
    
    return (
      <div className="media-error">
        <div>Unsupported media type: "{contentType}"</div>
        <details style={{marginTop: '10px', fontSize: '12px', opacity: '0.7'}}>
          <summary>Debug Info</summary>
          <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
        </details>
      </div>
    );
  };

  return (
    <div 
      key={txMeta.id} 
      className={`media-view-container ${fadeIn ? 'content-fade-in' : ''}`}
    >
      <div className="media-toolbar">
        <button
          className="privacy-toggle-btn"
          onClick={onPrivacyToggle}
          title={privacyOn ? 'Hide Privacy Screen' : 'Show Privacy Screen'}
          aria-label={privacyOn ? 'Hide privacy screen' : 'Show privacy screen'}
        >
          {privacyOn ? <Icons.Eye /> : <Icons.EyeOff />}
        </button>
        
      </div>

      <div className={`media-wrapper ${isWide ? 'wide' : ''} ${getContentTypeClass()}`}>
        {renderMedia()}
        {privacyOn && <div className="privacy-screen" />}
        
        {/* Unified loading indicator - show only one loading state at a time */}
        {(arnsValidating || (!arnsValidationError && !wayfinderResult.error && (wayfinderResult.loading || (!mediaLoaded && !mediaLoadError && !manualLoad && !manualLoadVideo && !manualLoadAudio && !manualLoadText)))) && (
          <div className="wayfinder-loading-overlay">
            <div className="wayfinder-loading-indicator">
              <Icons.Loading size={16} />
              <span>
                {arnsValidating 
                  ? 'Resolving ArNS name...' 
                  : wayfinderResult.verificationStatus.status === 'verifying' 
                    ? 'Loading and Verifying content...' 
                    : 'Loading content...'}
              </span>
            </div>
          </div>
        )}
        
        {/* ArNS validation error */}
        {arnsValidationError && (
          <div className="wayfinder-loading-overlay">
            <div className="wayfinder-loading-indicator error">
              <Icons.AlertCircle size={16} />
              <div className="error-content">
                <span className="error-message">{arnsValidationError}</span>
                {txMeta.arnsName && (
                  <span className="error-details">ArNS name: {txMeta.arnsName}</span>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Collapsible media actions */}
        <div className="media-actions-float">
          <button 
            className="action-toggle-btn" 
            onClick={() => setActionsExpanded(!actionsExpanded)}
            title={actionsExpanded ? "Hide actions" : "Show actions"}
            aria-label={actionsExpanded ? "Hide action menu" : "Show action menu"}
            aria-expanded={actionsExpanded}
          >
            {actionsExpanded ? <Icons.CloseMenu size={18} /> : <Icons.Menu size={18} />}
          </button>
          
          {actionsExpanded && (
            <div className="actions-menu">
              {onDetails && (
                <button className="action-float-btn" onClick={onDetails} title="Details" aria-label="View content details">
                  {(() => {
                    const MediaTypeIcon = getMediaTypeIcon(contentType);
                    return <MediaTypeIcon size={18} />;
                  })()}
                </button>
              )}
              {onOpenInNewTab && (
                <button className="action-float-btn" onClick={onOpenInNewTab} title="Open" aria-label="Open content in new tab">
                  <Icons.Open size={18} />
                </button>
              )}
              {onShare && (
                <button className="action-float-btn" onClick={onShare} title="Share" aria-label="Share this content">
                  <Icons.Share size={18} />
                </button>
              )}
              {onDownload && (
                <button className="action-float-btn" onClick={onDownload} title="Download" aria-label="Download this content">
                  <Icons.Download size={18} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
