import { useState, useMemo, useRef } from 'react'
import { Trash2, Package, UserRound, FileText, Mic, Film, Plus, Video, Download, Loader2, ChevronDown, Sparkles } from 'lucide-react'
import type { Product, Model, Script, VoicePreset, BRoll } from '../../stores/types'
import type { BankType } from '../../utils/constants'
import { useBankStore } from '../../stores/bankStore'
import { useAppStore } from '../../stores/appStore'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import { getAsBase64, isAssetRef } from '../../utils/assetStore'
import { downloadImage } from '../../utils/downloadImage'
import { sortByOrder, type SortOrder } from './bankSort'

export function SortControl({ value, onChange, options }: { value: SortOrder; onChange: (v: SortOrder) => void; options: { value: SortOrder; label: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as SortOrder)}
          className="appearance-none rounded-full border border-white/10 bg-[#0a0a0a] py-1.5 pl-3.5 pr-8 text-xs text-zinc-200 outline-none transition-colors hover:border-white/20 focus:border-white/20"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
      </div>
    </div>
  )
}

interface BankListProps {
  bankType: BankType
  onEdit: (id: string) => void
  onAdd: () => void
  sort: SortOrder
  inFlightProductIds?: Set<string>
  onBulkProductFiles?: (files: File[]) => void
}

// Local busy state stops a slow async delete from being clicked twice
// (which would call the cloud delete twice and toast twice).
function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => Promise<void> | void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleConfirm}
        disabled={busy}
        className="flex items-center gap-1 rounded-md bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); if (!busy) onCancel() }}
        disabled={busy}
        className="text-[11px] text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
      >
        Cancel
      </button>
    </div>
  )
}

function productCompleteness(p: Product): string {
  const fields = [p.productImage, p.productName, p.productDescription, p.targetMarket, p.painPoints, p.usps, p.benefits, p.offer, p.cta]
  const filled = fields.filter((f) => f && f.trim() !== '').length
  return `${filled}/9 fields`
}

// undefined → legacy product (predates the draft system, no dot).
// false → draft awaiting user review (orange dot).
// true → confirmed via Save in the form (green dot).
function productState(p: Product): 'legacy' | 'draft' | 'confirmed' {
  if (p.confirmed === undefined) return 'legacy'
  return p.confirmed ? 'confirmed' : 'draft'
}

function ProductCard({ item, onEdit, onDelete, inFlight }: { item: Product; onEdit: () => void; onDelete: () => void; inFlight?: boolean }) {
  const [confirm, setConfirm] = useState(false)
  const resolvedImage = useAssetUrl(item.productImage)
  const state = productState(item)
  return (
    <div
      onClick={onEdit}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] transition-all hover:border-white/15 hover:-translate-y-0.5"
    >
      {resolvedImage ? (
        <img src={resolvedImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-white/[0.04]">
          <Package className="h-12 w-12 text-zinc-800" strokeWidth={1} />
        </div>
      )}
      {/* Top-left status indicator: Extracting badge (while in-flight) OR draft/confirmed dot */}
      {inFlight ? (
        <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 backdrop-blur-sm">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          Extracting
        </span>
      ) : state !== 'legacy' ? (
        <span
          title={state === 'draft' ? 'Unconfirmed draft — open and save to confirm' : 'Confirmed'}
          className={`absolute left-2 top-2 z-10 h-2 w-2 rounded-full ring-2 ${
            state === 'draft'
              ? 'bg-orange-400 ring-orange-400/20 shadow-[0_0_8px_rgba(251,146,60,0.5)]'
              : 'bg-emerald-400 ring-emerald-400/20 shadow-[0_0_8px_rgba(74,222,128,0.5)]'
          }`}
        />
      ) : null}
      {/* Bottom info overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-10">
        <span className="block truncate text-sm font-semibold tracking-tight text-zinc-100">{item.productName}</span>
        <span className="block truncate text-xs text-zinc-400">{item.targetMarket || 'No target market'}</span>
        <span className="text-[10px] text-zinc-500">{productCompleteness(item)}</span>
      </div>
      {/* Delete button overlay */}
      <div className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
        {confirm ? (
          <ConfirmDelete onConfirm={onDelete} onCancel={() => setConfirm(false)} />
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded-lg bg-black/50 p-1.5 text-zinc-400 opacity-0 backdrop-blur-sm transition-all hover:text-red-400 group-hover:opacity-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function ModelCard({ item, onEdit, onDelete }: { item: Model; onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const resolvedImage = useAssetUrl(item.characterImage)
  const sourceLabel = item.source === 'character-studio' ? 'Characters' : item.source === 'image-dna-extractor' ? 'Image DNA' : 'Imported'

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!resolvedImage) return
    downloadImage(resolvedImage, `model-${item.name || item.id.slice(0, 8)}`)
  }

  return (
    <div
      onClick={onEdit}
      className="group relative aspect-[9/16] cursor-pointer overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] transition-all hover:border-white/15 hover:-translate-y-0.5"
    >
      {resolvedImage ? (
        <img src={resolvedImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-white/[0.04]">
          <UserRound className="h-12 w-12 text-zinc-800" strokeWidth={1} />
        </div>
      )}
      {/* Bottom info overlay — same gradient pattern as ProductCard */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-10">
        <span className="block truncate text-sm font-semibold tracking-tight text-zinc-100">{item.name}</span>
        <span className="text-[10px] text-zinc-300">{sourceLabel}</span>
      </div>
      {/* Action buttons top-right */}
      <div className="absolute right-2 top-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {confirm ? (
          <ConfirmDelete onConfirm={onDelete} onCancel={() => setConfirm(false)} />
        ) : (
          <>
            {resolvedImage && (
              <button onClick={handleDownload} className="rounded-lg bg-black/50 p-1.5 text-zinc-400 opacity-0 backdrop-blur-sm transition-all hover:text-zinc-200 group-hover:opacity-100">
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => setConfirm(true)} className="rounded-lg bg-black/50 p-1.5 text-zinc-400 opacity-0 backdrop-blur-sm transition-all hover:text-red-400 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ScriptCard({ item, onEdit, onDelete }: { item: Script; onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const getProductById = useBankStore((s) => s.getProductById)
  const linked = item.linkedProductId ? getProductById(item.linkedProductId) : null
  const preview = item.scriptText.split('\n').slice(0, 2).join(' ').slice(0, 80)
  // Legacy items predate `kind` — treat them as scripts.
  const isPrompt = item.kind === 'reverse-engineer'
  const badge = isPrompt
    ? { label: 'PROMPT', className: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20' }
    : { label: 'SCRIPT', className: 'bg-sky-500/15 text-sky-300 border-sky-500/20' }
  return (
    <div onClick={onEdit} className="group flex cursor-pointer gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:border-white/10 hover:bg-white/[0.05]">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/5">
        <FileText className="h-5 w-5 text-zinc-600" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-widest ${badge.className}`}>
            {badge.label}
          </span>
          <span className="truncate text-sm font-semibold tracking-tight text-zinc-200">{item.title}</span>
        </div>
        <span className="truncate text-xs text-zinc-500">{preview || 'Empty script'}</span>
        <div className="flex items-center gap-2">
          {linked && <span className="text-[10px] text-zinc-600">{linked.productName}</span>}
          <span className="text-[10px] text-zinc-700">{new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="shrink-0 self-start" onClick={(e) => e.stopPropagation()}>
        {confirm ? (
          <ConfirmDelete onConfirm={onDelete} onCancel={() => setConfirm(false)} />
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded p-1 text-zinc-700 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function BRollCard({ item, onEdit, onDelete }: { item: BRoll; onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const promptPreview = item.prompt.length > 80 ? item.prompt.slice(0, 80) + '…' : item.prompt
  const videoCount = item.videos?.length ?? (item.videoUrl ? 1 : 0)
  // Video-only brolls (text-to-video saves) have no still — fall back to the
  // first video and let the browser show its first frame as the thumbnail.
  const hasImage = !!item.imageUrl
  const firstVideoUrl = item.videos?.[0]?.url ?? item.videoUrl
  const resolvedImage = useAssetUrl(hasImage ? item.imageUrl : undefined)
  const resolvedVideo = useAssetUrl(!hasImage ? firstVideoUrl : undefined)
  const isVideoOnly = !hasImage && !!resolvedVideo

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    const target = resolvedImage ?? resolvedVideo
    if (!target) return
    downloadImage(target, `broll-${item.id.slice(0, 8)}`, resolvedImage ? 'png' : 'mp4')
  }

  // Send the still to Playground in video mode as the start frame.
  const handleAnimate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item.imageUrl) return
    let dataUri = item.imageUrl
    if (isAssetRef(item.imageUrl)) {
      const asset = await getAsBase64(item.imageUrl)
      if (!asset) return
      dataUri = `data:${asset.mimeType};base64,${asset.base64}`
    }
    useAppStore.getState().sendToApp({
      targetApp: 'playground',
      targetField: 'videoStartFrame',
      data: { imageUrl: dataUri, prompt: item.prompt },
    })
  }

  return (
    <div onClick={onEdit} className="group cursor-pointer rounded-xl border border-white/5 bg-white/[0.03] transition-all hover:border-white/15 hover:bg-white/[0.05] hover:-translate-y-0.5">
      {/* Thumbnail — adapts to image's natural aspect ratio */}
      <div className="relative w-full overflow-hidden rounded-t-xl">
        {resolvedImage ? (
          <img src={resolvedImage} alt="" className="block w-full" />
        ) : isVideoOnly ? (
          <video
            src={resolvedVideo}
            preload="metadata"
            muted
            playsInline
            className="block w-full"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-white/[0.04]">
            <Film className="h-10 w-10 text-zinc-800" strokeWidth={1} />
          </div>
        )}
        {/* Video badge */}
        {videoCount > 0 && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 backdrop-blur-sm">
            <Video className="h-2.5 w-2.5" />
            {videoCount} {videoCount === 1 ? 'video' : 'videos'}
          </span>
        )}
        {/* Action buttons overlay */}
        <div className="absolute right-2 top-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {confirm ? (
            <ConfirmDelete onConfirm={onDelete} onCancel={() => setConfirm(false)} />
          ) : (
            <>
              <button onClick={handleDownload} className="rounded-lg bg-black/50 p-1.5 text-zinc-400 opacity-0 backdrop-blur-sm transition-all hover:text-zinc-200 group-hover:opacity-100">
                <Download className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setConfirm(true)} className="rounded-lg bg-black/50 p-1.5 text-zinc-400 opacity-0 backdrop-blur-sm transition-all hover:text-red-400 group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {/* Animate in Playground — green pill, bottom-left, image cards only */}
        {hasImage && (
          <button
            onClick={handleAnimate}
            title="Open Playground in video mode with this image as the start frame"
            className="absolute left-2 bottom-2 flex items-center gap-1 whitespace-nowrap rounded-full border border-green-500/40 bg-green-500/80 px-2.5 py-1 text-[10px] font-medium text-white opacity-0 backdrop-blur-sm transition-all hover:bg-green-500 group-hover:opacity-100"
          >
            <Film className="h-3 w-3" />
            Animate in playground
          </button>
        )}
      </div>
      {/* Info */}
      <div className="flex flex-col gap-0.5 p-3">
        <p className="text-[11px] leading-relaxed text-zinc-500 line-clamp-2">{promptPreview}</p>
        <span className="text-[10px] text-zinc-700">{new Date(item.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  )
}

function VoiceCard({ item, onEdit, onDelete }: { item: VoicePreset; onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div onClick={onEdit} className="group flex cursor-pointer gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:border-white/10 hover:bg-white/[0.05]">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/5">
        <Mic className="h-5 w-5 text-zinc-600" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold tracking-tight text-zinc-200">{item.label}</span>
        <span className="text-xs text-zinc-500">{item.voiceName}{item.gender ? ` · ${item.gender}` : ''}</span>
        <span className="truncate text-[10px] tabular-nums text-zinc-600">
          Stability {item.stability.toFixed(2)}
        </span>
      </div>
      <div className="shrink-0 self-start" onClick={(e) => e.stopPropagation()}>
        {confirm ? (
          <ConfirmDelete onConfirm={onDelete} onCancel={() => setConfirm(false)} />
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded p-1 text-zinc-700 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

export default function BankList({ bankType, onEdit, onAdd, sort, inFlightProductIds, onBulkProductFiles }: BankListProps) {
  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scripts = useBankStore((s) => s.scripts)
  const voices = useBankStore((s) => s.voices)
  const brolls = useBankStore((s) => s.brolls)
  const deleteProduct = useBankStore((s) => s.deleteProduct)
  const deleteModel = useBankStore((s) => s.deleteModel)
  const deleteScript = useBankStore((s) => s.deleteScript)
  const deleteVoice = useBankStore((s) => s.deleteVoice)
  const deleteBRoll = useBankStore((s) => s.deleteBRoll)

  if (bankType === 'products') {
    return (
      <ProductsBankZone onBulkFiles={onBulkProductFiles}>
        {products.length === 0 ? (
          <EmptyState icon={Package} label="products" singular="product" onAdd={onAdd} />
        ) : (
          <ProductsList items={products} onEdit={onEdit} onDelete={deleteProduct} sort={sort} inFlightIds={inFlightProductIds} />
        )}
      </ProductsBankZone>
    )
  }

  if (bankType === 'models') {
    if (models.length === 0) return <EmptyState icon={UserRound} label="characters" singular="character" onAdd={onAdd} />
    return <ModelsList items={models} onEdit={onEdit} onDelete={deleteModel} sort={sort} />
  }

  if (bankType === 'scripts') {
    if (scripts.length === 0) return <EmptyState icon={FileText} label="scripts" singular="script" onAdd={onAdd} />
    return <ScriptsList items={scripts} onEdit={onEdit} onDelete={deleteScript} sort={sort} />
  }

  if (bankType === 'voices') {
    if (voices.length === 0) return <EmptyState icon={Mic} label="voice presets" singular="voice preset" onAdd={onAdd} />
    return (
      <div className="flex flex-col gap-2">
        {voices.map((v) => (
          <VoiceCard key={v.id} item={v} onEdit={() => onEdit(v.id)} onDelete={() => deleteVoice(v.id)} />
        ))}
      </div>
    )
  }

  // brolls
  if (brolls.length === 0) return <EmptyState icon={Film} label="b-rolls" singular="b-roll" onAdd={onAdd} />
  return <BRollsList items={brolls} onEdit={onEdit} onDelete={deleteBRoll} sort={sort} />
}

// Wraps the entire products view (empty-state OR grid) with a multi-file dropzone
// that funnels into the parent's bulk-add handler. Mirrors the dragDepth pattern
// used in ProductForm.tsx so nested children don't flicker the overlay.
function ProductsBankZone({ children, onBulkFiles }: { children: React.ReactNode; onBulkFiles?: (files: File[]) => void }) {
  const dragDepthRef = useRef(0)
  const [overlay, setOverlay] = useState(false)
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  if (!onBulkFiles) return <>{children}</>

  return (
    <div
      className="relative min-h-full"
      onDragEnter={(e) => { if (!hasFiles(e)) return; dragDepthRef.current += 1; setOverlay(true) }}
      onDragOver={(e) => { if (!hasFiles(e)) return; e.preventDefault() }}
      onDragLeave={() => { dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (dragDepthRef.current === 0) setOverlay(false) }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        dragDepthRef.current = 0
        setOverlay(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) onBulkFiles(files)
      }}
    >
      {overlay && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-emerald-400/60 bg-emerald-500/10 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-emerald-200">
            <Sparkles className="h-4 w-4" />
            Drop image(s) to bulk-add products
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

function ProductsList({ items, onEdit, onDelete, sort, inFlightIds }: { items: Product[]; onEdit: (id: string) => void; onDelete: (id: string) => void; sort: SortOrder; inFlightIds?: Set<string> }) {
  const sorted = useMemo(() => sortByOrder(items, sort, (p) => p.productName), [items, sort])
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {sorted.map((p) => (
        <ProductCard
          key={p.id}
          item={p}
          onEdit={() => onEdit(p.id)}
          onDelete={() => onDelete(p.id)}
          inFlight={inFlightIds?.has(p.id)}
        />
      ))}
    </div>
  )
}

function ModelsList({ items, onEdit, onDelete, sort }: { items: Model[]; onEdit: (id: string) => void; onDelete: (id: string) => void; sort: SortOrder }) {
  const sorted = useMemo(() => sortByOrder(items, sort, (m) => m.name), [items, sort])
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {sorted.map((m) => (
        <ModelCard key={m.id} item={m} onEdit={() => onEdit(m.id)} onDelete={() => onDelete(m.id)} />
      ))}
    </div>
  )
}

function ScriptsList({ items, onEdit, onDelete, sort }: { items: Script[]; onEdit: (id: string) => void; onDelete: (id: string) => void; sort: SortOrder }) {
  const sorted = useMemo(() => sortByOrder(items, sort, (s) => s.title), [items, sort])
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((s) => (
        <ScriptCard key={s.id} item={s} onEdit={() => onEdit(s.id)} onDelete={() => onDelete(s.id)} />
      ))}
    </div>
  )
}

function BRollsList({ items, onEdit, onDelete, sort }: { items: BRoll[]; onEdit: (id: string) => void; onDelete: (id: string) => void; sort: SortOrder }) {
  const sorted = useMemo(() => sortByOrder(items, sort), [items, sort])
  return (
    <div className="columns-2 sm:columns-3 lg:columns-4 gap-4">
      {sorted.map((b) => (
        <div key={b.id} className="mb-4 break-inside-avoid">
          <BRollCard item={b} onEdit={() => onEdit(b.id)} onDelete={() => onDelete(b.id)} />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon: Icon, label, singular, onAdd }: { icon: React.ElementType; label: string; singular: string; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]">
        <Icon className="h-7 w-7 text-zinc-700" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-zinc-500">No {label} yet</p>
        <p className="text-xs text-zinc-700">Add your first {singular} to get started</p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 rounded-xl bg-white/[0.07] px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/10"
      >
        <Plus className="h-4 w-4" />
        Add Your First {singular.charAt(0).toUpperCase() + singular.slice(1)}
      </button>
    </div>
  )
}
