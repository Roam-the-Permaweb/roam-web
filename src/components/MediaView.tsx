import { useState, useEffect, useRef } from 'preact/hooks';
import '../styles/media-view.css';
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue';
import type { TxMeta } from '../constants';
import { Icons } from './Icons';
import { MediaSkeleton } from './SkeletonLoader';

const IMAGE_LOAD_THRESHOLD = 25 * 1024 * 1024;
const VIDEO_LOAD_THRESHOLD = 200 * 1024 * 1024;
const AUDIO_LOAD_THRESHOLD = 50 * 1024 * 1024;
const TEXT_LOAD_THRESHOLD = 10 * 1024 * 1024;

export interface MediaViewProps {
  txMeta: TxMeta;
  onDetails?: () => void;
  privacyOn: boolean;
  onPrivacyToggle: () => void;
  onZoom?: (src: string) => void;
  onCorrupt?: (txMeta: TxMeta) => void;
  loading?: boolean;
}

export const MediaView = ({
  txMeta,
  onDetails,
  privacyOn,
  onPrivacyToggle,
  onZoom,
  onCorrupt,
  loading = false
}: MediaViewProps) => {
  const { id, tags } = txMeta;

  const arfsMeta = txMeta.arfsMeta;
  const contentType =
    arfsMeta?.contentType ||     // fallback if old style
    tags.find(t => t.name === 'Content-Type')?.value || '';
  const size = arfsMeta?.size ?? txMeta.data.size;
  const dataTxId = arfsMeta?.dataTxId || id;
  const directUrl = `${GATEWAY_DATA_SOURCE[0]}/${dataTxId}`;

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const wideContentTypes = [
    'application/pdf',
    'text/html',
    'application/xhtml+xml',
    'application/x.arweave-manifest+json'
  ];
  const isWide = wideContentTypes.includes(contentType);

  const [manualLoad, setManualLoad] = useState(contentType.startsWith('image/') && size > IMAGE_LOAD_THRESHOLD);
  const [manualLoadVideo, setManualLoadVideo] = useState(contentType.startsWith('video/') && size > VIDEO_LOAD_THRESHOLD);
  const [manualLoadAudio, setManualLoadAudio] = useState(contentType.startsWith('audio/') && size > AUDIO_LOAD_THRESHOLD);
  const [manualLoadText, setManualLoadText] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

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

  setTextContent(null);
  setLoadingText(false);
  setErrorText(null);
  setContentLoaded(false);
  setFadeIn(false);
  
  // Trigger fade in after a short delay for smooth transition
  const timer = setTimeout(() => {
    setContentLoaded(true);
    setFadeIn(true);
  }, 100);
  
  return () => clearTimeout(timer);
}, [id, contentType, size]);

  // Fetch plaintext
  useEffect(() => {
    let canceled = false;
    if (!['text/plain', 'text/markdown'].includes(contentType) || manualLoadText) return;

    setLoadingText(true);
    fetch(directUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => { if (!canceled) setTextContent(text); })
      .catch(() => { if (!canceled) setErrorText('Failed to load text'); })
      .finally(() => { if (!canceled) setLoadingText(false); });

    return () => { canceled = true };
  }, [directUrl, contentType]);

  // Iframe fallback detection for manifests and HTML
  useEffect(() => {
    if (!['application/pdf', 'text/html', 'application/xhtml+xml', 'application/x.arweave-manifest+json'].includes(contentType)) return;

    const timeout = setTimeout(() => {
      const iframe = iframeRef.current;
      if (iframe && iframe.offsetHeight < 32) {
        onCorrupt?.(txMeta);
      }
    }, 4000); // 4 seconds to show something

    return () => clearTimeout(timeout);
  }, [contentType, directUrl, txMeta]);

  const renderMedia = () => {
    if (contentType.startsWith('image/') && manualLoad) {
      return (
        <button className="media-load-btn" onClick={() => setManualLoad(false)}>
          Tap to load image ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      );
    }
    if (contentType.startsWith('image/')) {
      return (
        <img
          className="media-image"
          src={manualLoad ? undefined : directUrl}
          alt="Roam content"
          onClick={() => onZoom?.(directUrl)}
          onError={() => onCorrupt?.(txMeta)}
        />
      );
    }

    if (contentType.startsWith('video/') && manualLoadVideo) {
      return (
        <button className="media-load-btn" onClick={() => setManualLoadVideo(false)}>
          Tap to load video ({(size / 1024 / 1024).toFixed(2)} MB)
        </button>
      );
    }
    if (contentType.startsWith('video/')) {
      return (
        <video
          className="media-element media-video"
          src={manualLoadVideo ? undefined : directUrl}
          controls
          preload="metadata"
          onError={() => onCorrupt?.(txMeta)}
        />
      );
    }

    if (contentType.startsWith('audio/') && manualLoadAudio) {
      return (
        <button className="media-load-btn" onClick={() => setManualLoadAudio(false)}>
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
            src={manualLoadAudio ? undefined : directUrl}
            controls
            preload="metadata"
            onError={() => onCorrupt?.(txMeta)}
          />
        </div>
      );
    }

    if (['text/plain', 'text/markdown'].includes(contentType)) {
      if (manualLoadText) {
        return (
          <button className="media-load-btn" onClick={() => setManualLoadText(false)}>
            Tap to load text ({(size / 1024 / 1024).toFixed(2)} MB)
          </button>
        );
      }

      if (loadingText) return <div className="media-loading">Loading…</div>;
      if (errorText) return <div className="media-error">{errorText}</div>;
      return (
        <div className="media-element text-container">
          <pre className="media-text">{textContent}</pre>
        </div>
      );
    }

    if (contentType === 'application/pdf') {
      return (
        <div className="media-embed-wrapper">
          <iframe ref={iframeRef} className="media-pdf" src={directUrl} title="PDF Viewer" />
        </div>
      );
    }

    if (
      contentType.startsWith('text/html') ||
      contentType === 'application/xhtml+xml' ||
      contentType.startsWith('application/x.arweave-manifest') || 
      contentType.startsWith('application/json')
    ) {
      return (
        <div className="media-embed-wrapper">
          <iframe
            ref={iframeRef}
            className="media-iframe"
            src={directUrl}
            sandbox="allow-scripts allow-same-origin"
            title="Permaweb content preview"
          />
        </div>
      );
    }

    return <div className="media-error">Unsupported media type: {contentType}</div>;
  };

  // Show skeleton loader if loading or content not ready
  if (loading || !contentLoaded) {
    return <MediaSkeleton />
  }

  return (
    <div className={`media-view-container ${fadeIn ? 'content-fade-in' : ''}`}>
      <div className="media-toolbar">
        <button
          className="privacy-toggle-btn"
          onClick={onPrivacyToggle}
          title={privacyOn ? 'Hide Privacy Screen' : 'Show Privacy Screen'}
        >
          {privacyOn ? <Icons.Eye /> : <Icons.EyeOff />}
        </button>
      </div>

      <div className={`media-wrapper ${isWide ? 'wide' : ''}`}>
        {renderMedia()}
        {privacyOn && <div className="privacy-screen" />}
      </div>

      {onDetails && (
        <div className="media-actions">
          <button className="details-btn" onClick={onDetails}>Details</button>
        </div>
      )}
    </div>
  );
};
