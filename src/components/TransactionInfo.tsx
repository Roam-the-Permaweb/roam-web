import type { TxMeta } from '../constants'
import { Icons, getMediaTypeIcon } from './Icons'

interface TransactionInfoProps {
  txMeta: TxMeta
  formattedTime: string
}

export function TransactionInfo({ txMeta, formattedTime }: TransactionInfoProps) {
  const fileName = txMeta.arfsMeta?.name
  const fileSize = txMeta.arfsMeta?.size || txMeta.data.size
  const contentType = txMeta.arfsMeta?.contentType || 
    txMeta.tags.find(t => t.name === 'Content-Type')?.value || 'Unknown'
  
  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // Extract readable type from content type
  const getReadableType = (ct: string): string => {
    if (ct.startsWith('image/')) return 'Image'
    if (ct.startsWith('video/')) return 'Video'
    if (ct.startsWith('audio/')) return 'Audio'
    if (ct.includes('pdf')) return 'PDF'
    if (ct.startsWith('text/')) return 'Text'
    if (ct.includes('html')) return 'Website'
    return 'File'
  }
  
  const MediaTypeIcon = getMediaTypeIcon(contentType)
  
  return (
    <div className="content-metadata">
      {fileName && (
        <div className="metadata-card primary">
          <div className="card-header">
            <MediaTypeIcon size={20} />
            <span className="card-title">{fileName}</span>
          </div>
        </div>
      )}
      
      <div className="metadata-cards">
        <div className="metadata-card icon-only">
          <div className="card-content">
            <MediaTypeIcon size={24} />
          </div>
        </div>
        
        <div className="metadata-card">
          <div className="card-content">
            <Icons.Package size={16} />
            <div className="card-info">
              <span className="card-label">Size</span>
              <span className="card-value">{formatFileSize(fileSize)}</span>
            </div>
          </div>
        </div>
        
        <a
          className="metadata-card link"
          href={`https://viewblock.io/arweave/block/${txMeta.block.height}`}
          target="_blank"
          rel="noopener noreferrer"
          title="View on Viewblock"
        >
          <div className="card-content">
            <Icons.Clock size={16} />
            <div className="card-info">
              <span className="card-label">Posted</span>
              <span className="card-value">{formattedTime}</span>
            </div>
          </div>
        </a>
      </div>

      <div className="metadata-cards secondary">
        <a
          className="metadata-card link compact"
          href={`https://viewblock.io/arweave/tx/${txMeta.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="View transaction on Viewblock"
        >
          <div className="card-content">
            <Icons.Link size={14} />
            <span className="card-value">TX: {txMeta.id.slice(0,8)}…</span>
          </div>
        </a>
        
        <a
          className="metadata-card link compact"
          href={`https://viewblock.io/arweave/address/${txMeta.owner.address}`}
          target="_blank"
          rel="noopener noreferrer"
          title="View owner on Viewblock"
        >
          <div className="card-content">
            <Icons.User size={14} />
            <span className="card-value">Owner: {txMeta.owner.address.slice(0,8)}…</span>
          </div>
        </a>
      </div>
    </div>
  )
}