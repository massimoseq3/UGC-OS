// The face a block wears when what it holds is a thing you'd know on sight —
// a product, a face, a script, a voice. What's picked is named on a pill at
// the top (a chevron-right, since it opens where you pick: the Bank's picker,
// or the block's own window), and the thing itself fills the block below as a
// rounded square. Bank and Image blocks wear it, and so does an app block
// reusing a result From Bank or From History; the Characters block shows its
// faces as a grid of the same squares.

import type { ElementType, ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Bookmark, ChevronRight, Eye, EyeOff, Film, Image as ImageIcon, Mic, Music, Package, Play, UserRound, X } from 'lucide-react'
import type { FlowBlock, PortSpec } from '../../types'
import type { BlockPlan, HeldValue } from '../../engine/plan'
import { TYPE_META } from '../../engine/catalog'
import { itemPort, liveItems, wiresOutOf } from '../../engine/graph'
import { secondsToSay } from '../../engine/sceneShots'
import { useFlowStore } from '../../store/flowStore'
import { useBankStore } from '../../../../stores/bankStore'
import { useAssetThumb } from '../../../../hooks/useAssetUrl'
import Spinner from '../../../../components/Spinner'
import { wordCount } from '../../../broll-studio/services/clipDuration'
import { seedColor } from '../../../voice-studio/components/seedColor'
import { formatCount } from '../../../discover/services/scoring'
import { useCanvas } from '../canvasContext'
import { latestItems } from './made'
import { OutHandle } from './OutHandle'
import { CHIP, clock, PLATFORM } from './chips'

const SQUARE = 'relative aspect-square w-full overflow-hidden rounded-2xl'
// A character's shape: Characters makes 9:16 portraits, and one cropped to a
// square lost the outfit and half the look, so a face fills a 9:16 card.
const PORTRAIT = 'relative aspect-[9/16] w-full overflow-hidden rounded-2xl'

// ── The frame ──────────────────────────────────────────────────────────────

// What's picked, at the top. A chevron-right, not a dropdown's chevron: it
// opens a picker (or a window), never a list under it.
export function FacePill({ label, placeholder, title, onClick }: { label?: string; placeholder: string; title: string; onClick: () => void }) {
  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="nodrag flex h-8 w-full items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.04] pl-3 pr-2 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.07]"
      >
        <span className={`min-w-0 flex-1 truncate text-[12px] ${label ? 'font-medium text-ink-100' : 'text-ink-400'}`}>{label || placeholder}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-500" />
      </button>
    </div>
  )
}

// The square's row. Full width, so an output handed in sits on the block's
// own right edge, halfway down the picture, like any port's dot.
export function FaceFrame({ block, port, children }: { block: FlowBlock; port: PortSpec | null; children: ReactNode }) {
  return (
    <div className="relative px-3 pb-3">
      {children}
      {port && <OutHandle block={block} port={port} />}
    </div>
  )
}

// Nothing picked yet: the whole square is the button — a 9:16 one where a
// character goes, so picking one doesn't grow the block.
export function EmptySquare({ icon: Icon, title, hint, portrait, onClick }: { icon: ElementType; title: string; hint?: string; portrait?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`nodrag ${portrait ? PORTRAIT : SQUARE} flex flex-col items-center justify-center gap-1.5 border border-dashed border-ink/15 px-5 text-center transition-colors hover:border-flow-500/40 hover:bg-flow-500/[0.04]`}
    >
      <Icon className="h-5 w-5 text-ink-500" />
      <span className="text-[12px] font-medium text-ink-300">{title}</span>
      {hint && <span className="text-[10.5px] leading-snug text-ink-500">{hint}</span>}
    </button>
  )
}

// ── What fills the square ──────────────────────────────────────────────────

// A value as the thing it is: the photo, the page, the voice. `more` counts
// the values behind it (a reused run that handed on several).
export function ValueSquare({ value, more = 0 }: { value: HeldValue; more?: number }) {
  const extra = more > 0 ? <span className={`${CHIP} right-2 top-2`}>+{more}</span> : null
  switch (value.type) {
    case 'product':
      return <ProductSquare productId={value.payload.productId}>{extra}</ProductSquare>
    case 'character':
      return <PictureSquare refId={value.payload.imageRef} glyph={UserRound} portrait>{extra}</PictureSquare>
    case 'image':
      return <PictureSquare refId={value.payload.ref} glyph={ImageIcon}>{extra}</PictureSquare>
    case 'video': {
      const clips = value.payload.clips.length
      return (
        <PictureSquare refId={value.payload.cover ?? value.payload.stills?.[0]} glyph={Film}>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"><Play className="h-4 w-4" /></span>
          </span>
          {clips > 0 && <span className={`${CHIP} bottom-2 left-2`}>{clips} {clips === 1 ? 'Clip' : 'Clips'}</span>}
          {extra}
        </PictureSquare>
      )
    }
    case 'ad':
      return <AdSquare value={value}>{extra}</AdSquare>
    case 'style':
      return <StyleSquare refs={value.payload.thumbRefs ?? []} brief={value.payload.brief}>{extra}</StyleSquare>
    case 'script':
    case 'transcript':
      return <TextSquare text={value.payload.text} timed>{extra}</TextSquare>
    case 'text':
      return <TextSquare text={value.payload.text}>{extra}</TextSquare>
    case 'voice':
      return <VoiceSquare presetId={value.payload.presetId} label={value.label}>{extra}</VoiceSquare>
    case 'audio':
      return <SoundSquare glyph={Mic} label={value.label} seconds={value.payload.durationSeconds}>{extra}</SoundSquare>
    case 'music':
      return <SoundSquare glyph={Music} label={value.label} seconds={value.payload.durationSeconds}>{extra}</SoundSquare>
  }
}

// A picture filling its card, cropped from the middle — or from the top,
// where a saved ad's face is. A character fills a 9:16 `portrait` card, its
// own shape, so nothing is cropped and there are no bars.
export function PictureSquare({ refId, glyph: Glyph, top, portrait, children }: { refId: string | undefined; glyph: ElementType; top?: boolean; portrait?: boolean; children?: ReactNode }) {
  const thumb = useAssetThumb(refId || undefined)
  return (
    <div className={`${portrait ? PORTRAIT : SQUARE} bg-ink/[0.05]`}>
      {thumb.url ? (
        <img src={thumb.url} alt="" draggable={false} className={`absolute inset-0 h-full w-full object-cover ${top ? 'object-top' : ''}`} />
      ) : refId ? (
        <span className="absolute inset-0 bg-ink/10" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-ink-500"><Glyph className="h-6 w-6" /></span>
      )}
      {children}
    </div>
  )
}

function ProductSquare({ productId, children }: { productId: string; children?: ReactNode }) {
  const image = useBankStore((s) => s.products.find((p) => p.id === productId)?.productImage)
  return <PictureSquare refId={image} glyph={Package}>{children}</PictureSquare>
}

// A saved ad: its cover, where it ran and how far it went.
function AdSquare({ value, children }: { value: Extract<HeldValue, { type: 'ad' }>; children?: ReactNode }) {
  const views = useBankStore((s) => (value.payload.swipeId ? s.swipes.find((r) => r.id === value.payload.swipeId)?.views : undefined))
  const platform = value.payload.platform ? PLATFORM[value.payload.platform] : undefined
  return (
    <PictureSquare refId={value.payload.thumbUrl} glyph={Bookmark} top>
      {platform && <span className={`${CHIP} left-2 top-2`}>{platform}</span>}
      {!!views && <span className={`${CHIP} bottom-2 left-2`}><Eye className="h-3 w-3" />{formatCount(views)}</span>}
      {children}
    </PictureSquare>
  )
}

// A visual style: the frames it was read from, four to a square. A style
// written by hand has none, so it reads as its brief.
function StyleSquare({ refs, brief, children }: { refs: string[]; brief: string; children?: ReactNode }) {
  if (!refs.length) return <TextSquare text={brief}>{children}</TextSquare>
  const shown = refs.slice(0, 4)
  return (
    <div className={`${SQUARE} grid gap-[3px] ${shown.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {shown.map((ref) => <StyleTile key={ref} refId={ref} />)}
      {children}
    </div>
  )
}

function StyleTile({ refId }: { refId: string }) {
  const thumb = useAssetThumb(refId)
  return thumb.url ? <img src={thumb.url} alt="" draggable={false} className="h-full min-h-0 w-full object-cover" /> : <span className="bg-ink/10" />
}

// Words as a page you can read at a glance. A script says how long it runs.
function TextSquare({ text, timed, children }: { text: string; timed?: boolean; children?: ReactNode }) {
  const flat = text.replace(/\s+/g, ' ').trim()
  const words = timed ? wordCount(flat) : 0
  return (
    <div className={`${SQUARE} flex flex-col border border-ink/[0.07] bg-ink/[0.03] px-3.5 pb-2.5 pt-3`}>
      <p className="line-clamp-[9] min-h-0 text-[11.5px] leading-relaxed text-ink-300">{flat || <span className="text-ink-500">Nothing written yet.</span>}</p>
      {timed && words > 0 && (
        <p className="mt-auto flex shrink-0 justify-between pt-2 text-[10.5px] tabular-nums text-ink-500">
          <span>{words} words</span>
          <span>~{Math.round(secondsToSay(flat))}s</span>
        </p>
      )}
      {children}
    </div>
  )
}

// A voice preset: its voice's colour, the one the Voiceovers app gives it.
function VoiceSquare({ presetId, label, children }: { presetId: string; label: string; children?: ReactNode }) {
  const preset = useBankStore((s) => s.voices.find((v) => v.id === presetId))
  return (
    <div className={`${SQUARE} flex flex-col items-center justify-center gap-3 border border-ink/[0.07] bg-ink/[0.03] px-4 text-center`}>
      <span className="h-16 w-16 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]" style={{ background: seedColor(preset?.voiceId ?? presetId) }} />
      <span className="min-w-0 max-w-full">
        <span className="block truncate text-[12.5px] font-medium text-ink-100">{preset?.voiceName ?? label}</span>
        {preset && <span className="line-clamp-2 text-[10.5px] leading-snug text-ink-500">{preset.style} · {preset.pace}</span>}
      </span>
      {children}
    </div>
  )
}

function SoundSquare({ glyph: Glyph, label, seconds, children }: { glyph: ElementType; label: string; seconds?: number; children?: ReactNode }) {
  return (
    <div className={`${SQUARE} flex flex-col items-center justify-center gap-3 border border-ink/[0.07] bg-ink/[0.03] px-4 text-center`}>
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink/[0.07] text-ink-300"><Glyph className="h-6 w-6" /></span>
      <span className="min-w-0 max-w-full">
        <span className="line-clamp-2 text-[12px] font-medium leading-snug text-ink-100">{label}</span>
        {!!seconds && <span className="block text-[10.5px] tabular-nums text-ink-500">{clock(seconds)}</span>}
      </span>
      {children}
    </div>
  )
}

// ── Batch items: a tile, its actions, its own dot ─────────────────────────

// A picture inside a tile, filling it. `contain` shows it whole on the
// tile's black instead — a Playground result, which can be any shape.
export function TileImage({ refId, contain }: { refId: string | undefined; contain?: boolean }) {
  const thumb = useAssetThumb(refId || undefined)
  return thumb.url
    ? <img src={thumb.url} alt="" draggable={false} className={`absolute inset-0 h-full w-full ${contain ? 'object-contain' : 'object-cover'}`} />
    : <span className="absolute inset-0 bg-ink/10" />
}

// Turn Off and Delete for one item, on hover — over a picture in the black
// chips every media tile uses, over a card in the ink ones.
export function ItemActions({ block, itemId, name, off, editable, onMedia, className = '' }: {
  block: FlowBlock
  itemId: string
  name: string
  off: boolean
  editable: boolean
  onMedia?: boolean
  className?: string
}) {
  const toggleItem = useFlowStore((s) => s.toggleItem)
  const deleteItem = useFlowStore((s) => s.deleteItem)
  const button = `nodrag flex h-6 w-6 items-center justify-center rounded-full transition-colors ${onMedia ? 'bg-black/55 text-white hover:bg-black/75' : 'text-ink-500 hover:bg-ink/[0.08] hover:text-ink-200'}`
  return (
    <span className={`flex gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100 touch:opacity-100 ${className}`} style={off ? { opacity: 1 } : undefined}>
      <button
        type="button"
        onClick={() => toggleItem(block.id, itemId)}
        className={button}
        title={off ? `Turn ${name} On` : `Turn ${name} Off · nothing downstream runs for it`}
        aria-label={off ? `Turn ${name} On` : `Turn ${name} Off`}
      >
        {off ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
      {editable && (
        <button type="button" onClick={() => deleteItem(block.id, itemId)} className={button} title={`Delete ${name}`} aria-label={`Delete ${name}`}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

// An item's own output dot, for wiring that one item alone. `right` places it
// from its parent's right edge; `quiet` keeps it hidden until the block is
// pointed at or selected, or it's wired (flow.css), for dots that would
// otherwise stud a grid.
export function ItemDot({ block, itemId, name, color, right, top, quiet }: {
  block: FlowBlock
  itemId: string
  name: string
  color: string
  right?: number
  top?: number
  quiet?: boolean
}) {
  const { doc } = useCanvas()
  const used = wiresOutOf(doc, block.id).some((w) => w.fromPort === itemPort(itemId))
  return (
    <Handle
      type="source"
      position={Position.Right}
      id={itemPort(itemId)}
      className={`flow-port flow-port-item ${quiet ? 'flow-port-quiet' : ''} ${used ? 'flow-port-used' : ''}`}
      style={{ right, top, background: used ? color : 'var(--color-surface-1)', borderColor: color }}
      title={`${name} on its own`}
    />
  )
}

// One item of a grid — a face, a found ad: its picture once made, a dashed
// stand-in until then (spinning while it's being made), Turn Off and Delete
// on hover, and its quiet dot: on the block's edge for the last column (past
// the grid's 12px inset), in the 10px gutter for the others.
export function GridTile({ block, itemId, name, off, editable, portrait, picture, glyph: Glyph, busy, caption, color, edge, children }: {
  block: FlowBlock
  itemId: string
  name: string
  off: boolean
  editable: boolean
  portrait: boolean
  picture: ReactNode
  glyph: ElementType
  busy: boolean
  caption?: string
  color: string
  edge: boolean
  children?: ReactNode
}) {
  return (
    <div className="group/item relative">
      <div className={`relative w-full overflow-hidden rounded-2xl ${portrait ? 'aspect-[9/16]' : 'aspect-square'} ${picture ? 'bg-black' : 'border border-dashed border-ink/15'} ${off ? 'opacity-40' : ''}`}>
        {picture ?? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-ink-500">
            {busy && !off ? <Spinner className="h-4 w-4" /> : <Glyph className="h-5 w-5" />}
            <span className="text-[10.5px]">{name}</span>
          </span>
        )}
        {picture && caption && (
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-[10.5px] font-medium text-white">{caption}</span>
        )}
        {picture && children}
      </div>
      <ItemActions block={block} itemId={itemId} name={name} off={off} editable={editable} onMedia className="absolute right-1.5 top-1.5" />
      <ItemDot block={block} itemId={itemId} name={name} color={color} right={edge ? -12 : -5} quiet />
    </div>
  )
}

// ── Characters: the faces as a grid ────────────────────────────────────────

// Each face is a 9:16 portrait, the shape Characters makes them: one fills
// the block's width, two or more sit two across. Each fills in as it's made.
export function CharacterGrid({ block, bp }: { block: FlowBlock; bp: BlockPlan | undefined }) {
  const { run, openBlock } = useCanvas()
  const items = liveItems(block)
  const made = latestItems(bp)
  const writing = run?.status === 'running' && run.blocks[block.id]?.status === 'running'
  const n = items.length
  const two = n > 1
  return (
    <div className="border-t border-ink/5 pt-2.5">
      <FacePill
        label={n === 1 ? 'Make a New Face' : `Make ${n} New Faces`}
        placeholder="Make New Faces"
        title="Open Characters · change the faces, or pick one From Bank or From History"
        onClick={() => openBlock(block.id)}
      />
      <div className={`grid gap-2.5 px-3 pb-3 ${two ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {items.map((it, i) => {
          const value = made[it.id]
          const name = `Face ${i + 1}`
          return (
            <GridTile
              key={it.id}
              block={block}
              itemId={it.id}
              name={name}
              off={!!it.off}
              editable
              portrait
              picture={value?.type === 'character' ? <TileImage refId={value.payload.imageRef} /> : null}
              glyph={UserRound}
              busy={writing}
              // A variant's own name ("Maya · Asian-American"); a plain face is
              // only "Character", which says less than its number.
              caption={value?.label && value.label !== 'Character' ? value.label : name}
              color={TYPE_META.character.color}
              edge={!two || i % 2 === 1}
            />
          )
        })}
      </div>
    </div>
  )
}
