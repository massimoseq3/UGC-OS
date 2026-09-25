// What's on a wire: every value it carries into the block at its end — the
// ten hooks behind a "×10", the faces, the clips — made or still to be made.
// The canvas says how many; this says which, without opening either block.

import { Circle } from 'lucide-react'
import type { FlowValue } from '../types'
import { TYPE_META } from '../engine/catalog'
import { useAssetThumb } from '../../../hooks/useAssetUrl'
import { MenuSurface } from '../../../components/Menu'
import { useBankStore } from '../../../stores/bankStore'

export default function WirePeek({ x, y, title, values, onClose }: {
  x: number
  y: number
  title: string
  values: FlowValue[]
  onClose: () => void
}) {
  const type = values[0]?.type
  return (
    <>
      <div className="absolute inset-0 z-30" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className="absolute z-40" style={{ left: x, top: y }}>
        <MenuSurface className="w-[320px]">
          <div className="flex items-center gap-2 border-b border-ink/5 px-3.5 py-2 text-[11px] font-medium text-ink-500">
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {type && <span style={{ color: TYPE_META[type].color }}>{values.length} {TYPE_META[type].label}</span>}
          </div>
          <div className="menu-scroll flex max-h-[340px] flex-col overflow-y-auto py-1">
            {values.length === 0 && <p className="px-3.5 py-3 text-[12px] text-ink-500">Nothing on this wire yet: the block it comes from has nothing to hand on.</p>}
            {values.map((v, i) => <Row key={`${v.key}:${i}`} value={v} index={i} />)}
          </div>
        </MenuSurface>
      </div>
    </>
  )
}

function Row({ value, index }: { value: FlowValue; index: number }) {
  const productImage = useBankStore((s) => (value.type === 'product' ? s.products.find((p) => p.id === value.payload.productId)?.productImage : undefined))
  const ref = value.pending ? undefined
    : value.type === 'image' ? value.payload.ref
    : value.type === 'character' ? value.payload.imageRef
    : value.type === 'video' ? value.payload.cover ?? value.payload.clips[0]?.ref
    : value.type === 'product' ? productImage
    : undefined
  const thumb = useAssetThumb(ref)
  const detail = value.pending ? 'Not made yet'
    : value.type === 'video' ? `${value.payload.clips.length} ${value.payload.clips.length === 1 ? 'clip' : 'clips'}`
    : value.type === 'audio' ? `${Math.round(value.payload.durationSeconds)}s`
    : ''
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-1.5">
      {ref ? (
        thumb.url ? <img src={thumb.url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-lg bg-ink/10" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[10px] tabular-nums text-ink-500">
          {value.pending ? <Circle className="h-2.5 w-2.5" /> : index + 1}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`line-clamp-2 text-[12px] leading-snug ${value.pending ? 'text-ink-500' : 'text-ink-200'}`}>{value.label || `${TYPE_META[value.type].label} ${index + 1}`}</span>
        {detail && <span className="block text-[10.5px] text-ink-500">{detail}</span>}
      </span>
    </div>
  )
}
