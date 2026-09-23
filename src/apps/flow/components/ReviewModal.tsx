// Pause for Review: a block that finished with review on waits here, and only
// its own branch waits — everything else keeps running. Scripts: tick the
// hooks to keep. Characters: pick the faces. Voiceovers and Playground: keep
// the takes. B-Roll: after the stills, pick which ones get animated, with the
// clip total counting as you go.

import { useState } from 'react'
import { Check, Play, Pause } from 'lucide-react'
import type { FlowBlock, FlowDoc, FlowValue } from '../types'
import { approveReview, type LiveRun } from '../run/runtime'
import { itemNoun, titleOf } from '../engine/catalog'
import { liveItems } from '../engine/graph'
import { brollClipSeconds, brollVideoModel, brollVideoResolution } from '../engine/cost'
import { reviewStills } from '../run/executors/broll'
import Modal from '../../../components/Modal'
import { useAssetThumb } from '../../../hooks/useAssetUrl'
import { useAudioPlayback } from '../../../hooks/useAudioPlayback'
import { estimateCredits, getModel } from '../../../utils/models'
import { creditsLabel } from '../hooks/useFlowPlan'
import { useBankStore } from '../../../stores/bankStore'

export default function ReviewModal({
  flowId,
  block,
  run,
  doc,
  onLater,
  onDone,
}: {
  flowId: string
  block: FlowBlock
  run: LiveRun
  doc: FlowDoc
  onLater: () => void
  onDone: () => void
}) {
  const results = doc.outputs[block.id]?.instances ?? {}
  const madeKeys = Object.keys(run.instances[block.id] ?? {}).filter((k) => results[k])

  if (block.kind === 'scripts' || block.kind === 'characters') {
    return <ItemsReview flowId={flowId} block={block} results={madeKeys.map((k) => results[k])} onLater={onLater} onDone={onDone} />
  }
  if (block.kind === 'broll') {
    return <StillsReview flowId={flowId} block={block} keys={madeKeys} doc={doc} onLater={onLater} onDone={onDone} />
  }
  return <RunsReview flowId={flowId} block={block} keys={madeKeys} doc={doc} onLater={onLater} onDone={onDone} />
}

function Footer({ onLater, onGo, label, disabled }: { onLater: () => void; onGo: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onLater} className="rounded-full px-4 py-2 text-sm text-ink-300 hover:text-ink-100">Review Later</button>
      <button
        type="button"
        onClick={onGo}
        disabled={disabled}
        className="glass-fill glass-fill-soft rounded-full border border-white/15 bg-flow-500 px-5 py-2 text-sm font-semibold text-white btn-soft-shadow transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
      >
        {label}
      </button>
    </div>
  )
}

// ── Hooks and faces ────────────────────────────────────────────────────────

function ItemsReview({ flowId, block, results, onLater, onDone }: {
  flowId: string
  block: FlowBlock
  results: Array<{ items?: Record<string, FlowValue> }>
  onLater: () => void
  onDone: () => void
}) {
  const slots = liveItems(block).filter((it) => !it.off)
  const [keep, setKeep] = useState<string[]>(slots.map((it) => it.id))
  const noun = itemNoun(block)
  const valueOf = (slot: string) => results.map((r) => r.items?.[slot]).find(Boolean)
  const toggle = (id: string) => setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]))
  const faces = block.kind === 'characters'
  return (
    <Modal
      open
      onClose={onLater}
      title={`Review ${titleOf(block)}`}
      subtitle={`Keep the ${noun.toLowerCase()}s worth making more from. The rest turn off, and nothing downstream runs for them.`}
      size={faces ? 'wide' : 'medium'}
      footer={<Footer onLater={onLater} label={`Keep ${keep.length} and Continue`} disabled={!keep.length} onGo={() => { approveReview(flowId, block.id, { kind: 'items', keep }); onDone() }} />}
    >
      <div className={faces ? 'grid grid-cols-2 gap-3 p-4 sm:grid-cols-4' : 'flex flex-col gap-1.5 p-4'}>
        {slots.map((it, i) => {
          const v = valueOf(it.id)
          const on = keep.includes(it.id)
          return faces ? (
            <FaceTile key={it.id} value={v} on={on} onClick={() => toggle(it.id)} />
          ) : (
            <button
              key={it.id}
              type="button"
              onClick={() => toggle(it.id)}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${on ? 'border-flow-500/40 bg-flow-500/10' : 'border-ink/5 opacity-60 hover:opacity-100'}`}
            >
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-flow-400 bg-flow-500 text-white' : 'border-ink/20'}`}>
                {on && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] text-ink-500">{noun} {i + 1}</span>
                <span className="block whitespace-pre-wrap text-[13px] leading-relaxed text-ink-100">{v?.label ?? '—'}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

function FaceTile({ value, on, onClick }: { value: FlowValue | undefined; on: boolean; onClick: () => void }) {
  const thumb = useAssetThumb(value?.type === 'character' ? value.payload.imageRef : undefined)
  return (
    <button type="button" onClick={onClick} className={`relative overflow-hidden rounded-2xl border-2 transition-colors ${on ? 'border-flow-400' : 'border-transparent opacity-50 hover:opacity-100'}`}>
      {thumb.url ? <img src={thumb.url} alt="" className="aspect-[9/16] w-full object-cover" /> : <div className="aspect-[9/16] w-full bg-ink/10" />}
      {on && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-flow-500 text-white"><Check className="h-3.5 w-3.5" /></span>}
    </button>
  )
}

// ── Takes and images ───────────────────────────────────────────────────────

function RunsReview({ flowId, block, keys, doc, onLater, onDone }: { flowId: string; block: FlowBlock; keys: string[]; doc: FlowDoc; onLater: () => void; onDone: () => void }) {
  const [keep, setKeep] = useState<string[]>(keys)
  const results = doc.outputs[block.id]?.instances ?? {}
  const toggle = (k: string) => setKeep((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
  const noun = block.kind === 'voice' ? 'take' : 'result'
  return (
    <Modal
      open
      onClose={onLater}
      title={`Review ${titleOf(block)}`}
      subtitle={`Keep the ${noun}s you like. The rest are left out of everything after this block.`}
      size="wide"
      footer={<Footer onLater={onLater} label={`Keep ${keep.length} and Continue`} disabled={!keep.length} onGo={() => { approveReview(flowId, block.id, { kind: 'runs', keep }); onDone() }} />}
    >
      <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        {keys.map((k) => {
          const v = Object.values(results[k]?.outputs ?? {}).flat()[0]
          const on = keep.includes(k)
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${on ? 'border-flow-500/40 bg-flow-500/10' : 'border-ink/5 opacity-60 hover:opacity-100'}`}
            >
              {v?.type === 'audio' ? <AudioButton refId={v.payload.ref} duration={v.payload.durationSeconds} /> : <ValueThumb value={v} />}
              <span className="line-clamp-3 min-w-0 flex-1 text-[12.5px] text-ink-100">{v?.label ?? '—'}</span>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-flow-400 bg-flow-500 text-white' : 'border-ink/20'}`}>
                {on && <Check className="h-3 w-3" />}
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

function AudioButton({ refId, duration }: { refId: string; duration: number }) {
  const player = useAudioPlayback(refId, duration)
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); player.toggle() }}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-voice-500/15 text-voice-300 hover:bg-voice-500/25"
      title={player.isPlaying ? 'Pause' : 'Play'}
    >
      {player.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </span>
  )
}

function ValueThumb({ value }: { value: FlowValue | undefined }) {
  const ref = value?.type === 'image' ? value.payload.ref : undefined
  const thumb = useAssetThumb(ref)
  if (!ref) return null
  return thumb.url ? <img src={thumb.url} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" /> : <span className="h-16 w-12 shrink-0 rounded-lg bg-ink/10" />
}

// ── B-Roll stills ──────────────────────────────────────────────────────────

function StillsReview({ flowId, block, keys, doc, onLater, onDone }: { flowId: string; block: FlowBlock; keys: string[]; doc: FlowDoc; onLater: () => void; onDone: () => void }) {
  const results = doc.outputs[block.id]?.instances ?? {}
  const brollHistory = useBankStore((st) => st.brollHistory)
  const sessions = keys.map((k) => ({ key: k, sessionId: results[k]?.rows?.find((r) => r.bank === 'brollHistory')?.id }))
  const stills = sessions.map((s) => ({ ...s, stills: s.sessionId ? reviewStills(s.sessionId, brollHistory) : [] }))
  const [keep, setKeep] = useState<Record<string, string[]>>(() => Object.fromEntries(stills.map((s) => [s.key, s.stills.map((x) => x.key)])))
  const toggle = (inst: string, card: string) =>
    setKeep((cur) => {
      const list = cur[inst] ?? []
      return { ...cur, [inst]: list.includes(card) ? list.filter((x) => x !== card) : [...list, card] }
    })
  const model = brollVideoModel(block)
  const supportsAudio = !!getModel(model ?? '')?.videoConstraints?.supportsAudio
  let total = 0
  let count = 0
  for (const s of stills) {
    for (const x of s.stills) {
      if (!keep[s.key]?.includes(x.key) || !model) continue
      count += 1
      total += estimateCredits(model, {
        durationSeconds: brollClipSeconds(block, x.line, model),
        resolution: brollVideoResolution(block, model),
        audio: supportsAudio && block.settings.audio !== false,
      }) ?? 0
    }
  }
  const animate = block.settings.animate !== false
  return (
    <Modal
      open
      onClose={onLater}
      title="Pick the Stills to Animate"
      subtitle={animate ? 'Only the ones you keep become clips.' : 'Animation is off for this block, so these are the finished stills.'}
      size="gallery"
      fill
      footer={
        <Footer
          onLater={onLater}
          label={animate ? `Animate ${count} · ${creditsLabel(total)}` : `Keep ${count}`}
          disabled={!count}
          onGo={() => { approveReview(flowId, block.id, { kind: 'stills', keep }); onDone() }}
        />
      }
    >
      <div className="flex flex-col gap-6 p-4">
        {stills.map((s, i) => (
          <div key={s.key}>
            {stills.length > 1 && <p className="mb-2 text-[12px] font-medium text-ink-300">Ad {i + 1}</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {s.stills.map((x) => (
                <StillTile key={x.key} refId={x.ref} line={x.line} on={!!keep[s.key]?.includes(x.key)} onClick={() => toggle(s.key, x.key)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function StillTile({ refId, line, on, onClick }: { refId: string; line: string; on: boolean; onClick: () => void }) {
  const thumb = useAssetThumb(refId)
  return (
    <button type="button" onClick={onClick} className={`group relative overflow-hidden rounded-xl border-2 text-left transition-colors ${on ? 'border-flow-400' : 'border-transparent opacity-50 hover:opacity-100'}`} title={line}>
      {thumb.url ? <img src={thumb.url} alt="" className="aspect-[9/16] w-full object-cover" /> : <div className="aspect-[9/16] w-full bg-ink/10" />}
      <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-[10px] leading-snug text-white">{line}</span>
      {on && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-flow-500 text-white"><Check className="h-3 w-3" /></span>}
    </button>
  )
}
