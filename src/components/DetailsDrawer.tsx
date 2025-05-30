// src/components/DetailsDrawer.tsx
import type { JSX } from 'preact/jsx-runtime'
import '../styles/details-drawer.css'
import { useState } from 'preact/hooks'
import type { TxMeta } from '../constants'
import { GATEWAY_DATA_SOURCE } from '../engine/fetchQueue'
import { Icons } from './Icons'

export interface DetailsDrawerProps {
  txMeta: TxMeta | null
  open: boolean
  onClose: () => void
}

function shortenId(id: string, head = 6, tail = 6): string {
  return id.length > head + tail + 3 ? `${id.slice(0, head)}...${id.slice(-tail)}` : id;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export const DetailsDrawer = ({ txMeta, open, onClose }: DetailsDrawerProps): JSX.Element | null => {
  if (!open || !txMeta) return null

  const { id, owner, fee, quantity, tags, block, arfsMeta } = txMeta
  const [showAllTags, setShowAllTags] = useState(false)
  const visibleTags = showAllTags ? tags : tags.slice(0, 5)
  const gatewayDataSourceNoProtocol = GATEWAY_DATA_SOURCE[0].replace('https://', '')

  const driveIdTag = tags.find(tag => tag.name === 'Drive-Id')
  const fileIdTag = tags.find(tag => tag.name === 'File-Id')

  return (
    <>
      <div className="details-backdrop open" onClick={onClose} />
      <aside className="details-drawer open" role="dialog" aria-modal="true">
        <header className="details-header">
          <h2>Transaction Details</h2>
          <button className="details-close-btn" aria-label="Close details" onClick={onClose}>
            <Icons.Close />
          </button>
        </header>
        <div className="details-content">
          {/* File Information Section */}
          <div className="info-section file-info">
            <h3 className="section-title">File Information</h3>
            {arfsMeta && (
              <div className="info-item">
                <span className="info-label">Filename</span>
                <span className="info-value">{arfsMeta.name}</span>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">Type</span>
              <span className="info-value">{arfsMeta?.contentType || txMeta.tags.find(t => t.name === 'Content-Type')?.value || 'Unknown'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Size</span>
              <span className="info-value">{formatFileSize(arfsMeta?.size || txMeta.data.size)}</span>
            </div>
            {arfsMeta?.customTags?.lastModifiedDate && (
              <div className="info-item">
                <span className="info-label">Modified</span>
                <span className="info-value">{new Date(Number(arfsMeta.customTags.lastModifiedDate)).toLocaleString()}</span>
              </div>
            )}
            {arfsMeta && (
              <div className="info-item">
                <span className="info-label">Data Tx</span>
                <span className="info-value">
                  <a
                    href={`https://viewblock.io/arweave/tx/${arfsMeta.dataTxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={arfsMeta.dataTxId}
                  >
                    {shortenId(arfsMeta.dataTxId)}
                  </a>
                </span>
              </div>
            )}
          </div>

          {/* ArDrive Links Section */}
          {(driveIdTag || fileIdTag) && (
            <div className="info-section">
              <h3 className="section-title">ArDrive Links</h3>
              <div className="ardrive-links">
                {driveIdTag && (
                  <a
                    href={`https://ardrive.${gatewayDataSourceNoProtocol}/#/drives/${driveIdTag.value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ardrive-link"
                    title={driveIdTag.value}
                  >
                    <span className="ardrive-icon">🗂</span>
                    <div className="ardrive-info">
                      <div className="ardrive-label">Drive</div>
                      <div className="ardrive-id">{shortenId(driveIdTag.value)}</div>
                    </div>
                  </a>
                )}
                {fileIdTag && (
                  <a
                    href={`https://ardrive.${gatewayDataSourceNoProtocol}/#/file/${fileIdTag.value}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ardrive-link"
                    title={fileIdTag.value}
                  >
                    <span className="ardrive-icon">📄</span>
                    <div className="ardrive-info">
                      <div className="ardrive-label">File</div>
                      <div className="ardrive-id">{shortenId(fileIdTag.value)}</div>
                    </div>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Blockchain Information Section */}
          <div className="info-section">
            <h3 className="section-title">Blockchain Info</h3>
            <div className="info-item">
              <span className="info-label">Tx ID</span>
              <span className="info-value">
                <a href={`https://viewblock.io/arweave/tx/${id}`} target="_blank" rel="noopener noreferrer" title={id}>
                  {shortenId(id)}
                </a>
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Owner</span>
              <span className="info-value">
                <a href={`https://viewblock.io/arweave/address/${owner.address}`} target="_blank" rel="noopener noreferrer" title={owner.address}>
                  {shortenId(owner.address)}
                </a>
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Block</span>
              <span className="info-value">{block.height.toLocaleString()}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Timestamp</span>
              <span className="info-value">{new Date(block.timestamp * 1000).toLocaleString()}</span>
            </div>
            {parseFloat(fee.ar) > 0 && (
              <div className="info-item">
                <span className="info-label">Fee</span>
                <span className="info-value">{parseFloat(fee.ar).toFixed(6)} AR</span>
              </div>
            )}
            {parseFloat(quantity.ar) > 0 && (
              <div className="info-item">
                <span className="info-label">Quantity</span>
                <span className="info-value">{parseFloat(quantity.ar).toFixed(6)} AR</span>
              </div>
            )}
          </div>

          {/* Transaction Tags Section */}
          <div className="info-section">
            <h3 className="section-title">Transaction Tags</h3>
            <div className="tag-list">
              {visibleTags.map(tag => {
                const isDriveOrFile = tag.name === 'Drive-Id' || tag.name === 'File-Id'
                if (isDriveOrFile) return null // Already shown above

                return (
                  <span className="tag-item" key={`${tag.name}-${tag.value}`}>
                    <span className="tag-name">{tag.name}:</span> {tag.value}
                  </span>
                )
              })}
              {tags.length > 5 && (
                <button
                  className="more-tags"
                  onClick={() => setShowAllTags(f => !f)}
                >
                  {showAllTags ? 'Show fewer tags' : `+${tags.length - 5} more`}
                </button>
              )}
            </div>
          </div>

          {/* ArFS Custom Tags Section */}
          {arfsMeta && Object.keys(arfsMeta.customTags).length > 0 && (
            <div className="info-section">
              <h3 className="section-title">ArFS Metadata</h3>
              <div className="tag-list">
                {Object.entries(arfsMeta.customTags).map(([key, value]) => (
                  <span className="tag-item" key={`arfs-${key}-${value}`}>
                    <span className="tag-name">{key}:</span> {value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}