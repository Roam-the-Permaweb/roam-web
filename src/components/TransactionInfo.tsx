import type { TxMeta } from '../constants'
import { Icons, getMediaTypeIcon } from './Icons'

interface TransactionInfoProps {
  txMeta: TxMeta
  formattedTime: string
}

export function TransactionInfo({ txMeta, formattedTime }: TransactionInfoProps) {
  const fileName = txMeta.arfsMeta?.name
  const contentType = txMeta.arfsMeta?.contentType || 
    txMeta.tags.find(t => t.name === 'Content-Type')?.value || 'Unknown'
  
  const MediaTypeIcon = getMediaTypeIcon(contentType)
  
  return (
    <div className="content-metadata">
      <div className="metadata-footer">
        {fileName && (
          <div className="metadata-link filename">
            <MediaTypeIcon size={14} />
            <span>{fileName.length > 24 ? fileName.slice(0,24) + '…' : fileName}</span>
          </div>
        )}
        
        <a
          className="metadata-link"
          href={`https://viewblock.io/arweave/tx/${txMeta.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Transaction: ${txMeta.id}`}
        >
          <Icons.Link size={14} />
          <span>{txMeta.id.slice(0,8)}…</span>
        </a>
        
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
      </div>
    </div>
  )
}