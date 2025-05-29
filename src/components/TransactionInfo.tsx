import type { TxMeta } from '../constants'

interface TransactionInfoProps {
  txMeta: TxMeta
  formattedTime: string
}

export function TransactionInfo({ txMeta, formattedTime }: TransactionInfoProps) {
  const txIdToShow = txMeta.arfsMeta?.dataTxId || txMeta.id
  
  return (
    <div className="tx-info">
      <a
        href={`https://viewblock.io/arweave/tx/${txIdToShow}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        TX: {txIdToShow.slice(0,6)}…
      </a>
      <span></span>
      <a
        href={`https://viewblock.io/arweave/address/${txMeta.owner.address}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Owner: {txMeta.owner.address.slice(0,6)}…
      </a>
      <span></span>
      <a
        className="tx-info-time"
        href={`https://viewblock.io/arweave/block/${txMeta.block.height}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {formattedTime}
      </a>
    </div>
  )
}