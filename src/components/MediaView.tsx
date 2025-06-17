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
import { useWayfinderContent } from '../hooks/useWayfinderContent';
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
  onOpenInNewTab
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
  
  // Use Wayfinder for content URL with size-aware loading
  const wayfinderResult = useWayfinderContent(dataTxId, undefined, forceLoad, baseContentType, size);
  
  // Final content type: prefer Wayfinder's detected type, fallback to base
  const contentType = wayfinderResult.contentType || baseContentType;
  
  const directUrl = wayfinderResult.url || `${GATEWAY_DATA_SOURCE[0]}/${dataTxId}`;

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

  const [manualLoad, setManualLoad] = useState(contentType.startsWith('image/') && size > IMAGE_LOAD_THRESHOLD);
  const [manualLoadVideo, setManualLoadVideo] = useState(contentType.startsWith('video/') && size > VIDEO_LOAD_THRESHOLD);
  const [manualLoadAudio, setManualLoadAudio] = useState(contentType.startsWith('audio/') && size > AUDIO_LOAD_THRESHOLD);
  const [manualLoadText, setManualLoadText] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const textExtractionRef = useRef<{ txId: string; promise: Promise<string> | null }>({ txId: '', promise: null });

  // Reset flags when tx changes
useEffect(() => {
  const isImage = contentType.startsWith('image/');
  const isVideo = contentType.startsWith('video/');
  const isAudio = contentType.startsWith('audio/');
  const isText = ['text/plain', 'text/markdown'].includes(contentType);

  setManualLoad(isImage && size > IMAGE_LOAD_THRESHOLD);
  setManualLoadVideo(isVideo && size > VIDEO_LOAD_THRESHOLD);
  setManualLoadAudio(isAudio && size > AUDIO_LOAD_THRESHOLD);
  setManualLoadText(isText && size > TEXT_LOAD_THRESHOLD);
  setForceLoad(false);

  setTextContent(null);
  setLoadingText(false);
  setErrorText(null);
  setFadeIn(false);
  
  // Reset text extraction cache when transaction changes
  textExtractionRef.current = { txId: '', promise: null };
  
  // Trigger fade in after a short delay for smooth transition
  const timer = setTimeout(() => {
    setFadeIn(true);
  }, FADE_IN_DELAY);
  
  return () => clearTimeout(timer);
}, [id, contentType, size]);

  // Handle Wayfinder content data and Object URL lifecycle
  useEffect(() => {
    // Clean up previous Object URL
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }

    // Create Object URL for Wayfinder data if available
    if (wayfinderResult.data) {
      const newObjectUrl = URL.createObjectURL(wayfinderResult.data);
      setObjectUrl(newObjectUrl);
      
      // For text content, extract text from Blob automatically with memoization
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
                setTextContent(text);
                setErrorText(null);
              })
              .catch(() => setErrorText('Failed to extract text from verified content'))
              .finally(() => setLoadingText(false));
          }
        }
      }
    }

    // Cleanup function - ensure no memory leaks
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
    };
  }, [wayfinderResult.data, wayfinderResult.loading, contentType, manualLoadText, txMeta.id]);

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
    if (contentType.startsWith('image/') && manualLoad) {
      return (
        <button className="media-load-btn" onClick={() => { setManualLoad(false); setForceLoad(true); }} aria-label={`Load image, ${(size / 1024 / 1024).toFixed(2)} MB`}>
          Tap to load image ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      );
    }
    if (contentType.startsWith('image/')) {
      return (
        <img
          className="media-image"
          src={manualLoad ? undefined : objectUrl || directUrl}
          alt="Roam content"
          onClick={() => onZoom?.(objectUrl || directUrl)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onZoom?.(objectUrl || directUrl);
            }
          }}
          role="button"
          tabIndex={0}
          onError={() => onCorrupt?.(txMeta)}
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
          src={manualLoadVideo ? undefined : objectUrl || directUrl}
          controls
          preload="metadata"
          onError={() => onCorrupt?.(txMeta)}
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
            src={manualLoadAudio ? undefined : objectUrl || directUrl}
            controls
            preload="metadata"
            onError={() => onCorrupt?.(txMeta)}
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
            src={objectUrl || directUrl}
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
            src={objectUrl || directUrl}
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
                } catch (error) {
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
                } catch (error) {
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
                    } catch (error) {
                      setErrorText('Failed to read content as text');
                    }
                  } else {
                    try {
                      const extractionPromise = wayfinderResult.data!.text();
                      textExtractionRef.current = { txId: txMeta.id, promise: extractionPromise };
                      const text = await extractionPromise;
                      setTextContent(text);
                    } catch (error) {
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
        
        {/* Subtle loading indicator for Wayfinder - only show when actually verifying */}
        {wayfinderResult.loading && wayfinderResult.verificationStatus.status === 'verifying' && (
          <div className="wayfinder-loading-overlay">
            <div className="wayfinder-loading-indicator">
              <Icons.Loading size={16} />
              <span>Verifying content...</span>
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
