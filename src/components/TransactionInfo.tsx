import type { TxMeta } from '../constants'
import type { VerificationStatus } from '../services/wayfinderTypes'
import { Icons, getMediaTypeIcon } from './Icons'
import { VerificationIndicator } from './VerificationIndicator'
import { getDisplayArnsName } from '../utils/punycode'
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'

interface TransactionInfoProps {
  txMeta: TxMeta
  formattedTime: string
  verificationStatus?: VerificationStatus
  currentGateway?: string | null
}

export function TransactionInfo({ txMeta, formattedTime, verificationStatus, currentGateway }: TransactionInfoProps) {
  const fileName = txMeta.arfsMeta?.name
  const contentType = txMeta.arfsMeta?.contentType || 
    txMeta.tags.find(t => t.name === 'Content-Type')?.value || 'Unknown'
  
  const MediaTypeIcon = getMediaTypeIcon(contentType)
  
  // Check if this is an ArFS pin
  const pinnedDataOwner = txMeta.arfsMeta?.customTags?.pinnedDataOwner
  const isPinned = !!pinnedDataOwner
  
  return (
    <div className="content-metadata">
      <div className="metadata-footer">
        {fileName && (
          <div className="metadata-link filename">
            <MediaTypeIcon size={14} />
            <span>{fileName.length > 24 ? fileName.slice(0,24) + '…' : fileName}</span>
          </div>
        )}
        
        {txMeta.arnsName && (
          <a 
            className="metadata-link arns-name"
            href={(() => {
              // Get the ArNS app URL by replacing 'roam' with 'arns' in current URL
              const arnsAppUrl = (() => {
                // Get current page hostname
                const currentHostname = window.location.hostname;
                
                // If we're running on a roam.* domain, just replace roam with arns
                if (currentHostname.startsWith('roam.')) {
                  const arnsHostname = currentHostname.replace(/^roam\./, 'arns.');
                  return `https://${arnsHostname}/#/manage/names/${txMeta.arnsName}`;
                }
                
                // Fallback: try to use the gateway from the current content
                if (txMeta.arnsGateway) {
                  try {
                    const url = new URL(txMeta.arnsGateway);
                    const parts = url.hostname.split('.');
                    // Remove the first part (ArNS name) and prepend 'arns'
                    const gatewayDomain = parts.slice(1).join('.');
                    return `https://arns.${gatewayDomain}/#/manage/names/${txMeta.arnsName}`;
                  } catch (_error) {
                    // Invalid URL, continue to next fallback
                  }
                }
                
                // Last fallback: use current gateway if available
                if (currentGateway) {
                  try {
                    const url = new URL(currentGateway);
                    return `https://arns.${url.hostname}/#/manage/names/${txMeta.arnsName}`;
                  } catch (_error) {
                    // Invalid URL
                  }
                }
                
                // Final fallback: use first configured gateway
                const fallbackGateway = new URL(GATEWAY_DATA_SOURCE[0]).hostname;
                return `https://arns.${fallbackGateway}/#/manage/names/${txMeta.arnsName}`;
              })();
              
              return arnsAppUrl;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            title={`View ArNS details for ${getDisplayArnsName(txMeta.arnsName)}`}
          >
            <Icons.Globe size={14} />
            <span>{getDisplayArnsName(txMeta.arnsName)}</span>
          </a>
        )}
        
        <a
          className="metadata-link"
          href={`https://viewblock.io/arweave/tx/${txMeta.arfsMeta?.dataTxId || txMeta.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Transaction: ${txMeta.arfsMeta?.dataTxId || txMeta.id}`}
        >
          <Icons.Link size={14} />
          <span>{(txMeta.arfsMeta?.dataTxId || txMeta.id).slice(0,8)}…</span>
        </a>
        
        {isPinned ? (
          // For pinned files, show both pinner and original owner
          <>
            <a
              className="metadata-link"
              href={`https://viewblock.io/arweave/address/${txMeta.owner.address}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Pinned by: ${txMeta.owner.address}`}
            >
              <span style={{ marginRight: '4px' }}>📌</span>
              <span>{txMeta.owner.address.slice(0,6)}…</span>
            </a>
            <a
              className="metadata-link"
              href={`https://viewblock.io/arweave/address/${pinnedDataOwner}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Originally by: ${pinnedDataOwner}`}
            >
              <Icons.User size={14} />
              <span>{pinnedDataOwner.slice(0,6)}…</span>
            </a>
          </>
        ) : (
          // Regular file, show owner normally
          <a
            className="metadata-link"
            href={`https://viewblock.io/arweave/address/${txMeta.owner.address}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Owner: ${txMeta.owner.address}`}
          >
            <Icons.User size={14} />
            <span>{txMeta.owner.address.slice(0,8)}…</span>
          </a>
        )}
        
        <a
          className="metadata-link"
          href={`https://viewblock.io/arweave/block/${txMeta.block.height}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Posted: ${formattedTime}`}
        >
          <Icons.Clock size={14} />
          <span>{formattedTime}</span>
        </a>
        
        {verificationStatus && (
          <div className="metadata-verification">
            <VerificationIndicator 
              status={verificationStatus}
              className="metadata-verification-indicator"
            />
          </div>
        )}
      </div>
    </div>
  )
}