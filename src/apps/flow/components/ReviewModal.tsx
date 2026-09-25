// Pause for Review: a block that finished with review on waits here, and only
// its own branch waits — everything else keeps running. Scripts: tick the
// hooks to keep. Characters: pick the faces. Voiceovers and Playground: keep
// the takes. B-Roll: after the stills, pick which ones get animated, with the
// clip total counting as you go.

import { useState } from 'react'
import { Check, Pause, Pencil, Play } from 'lucide-react'
import type { FlowBlock, FlowDoc, FlowValue } from '../types'
import { approveReview, type LiveRun } from '../run/runtime'
import { itemNoun, titleOf } from '../engine/catalog'
import { liveItems } from '../engine/graph'
import { brollClipSeconds, brollVideoModel, brollVideoResolution } from '../engine/cost'
import { reviewStills } from '../run/executors/broll'
import Modal from '../../../components/Modal'
import { useAssetThumb, useAssetUrl } from '../../../hooks/useAssetUrl'
import VideoLightbox from '../../../components/VideoLightbox'
import { useAudioPlayback } from '../../../hooks/useAudioPlayback'
import { estimateCredits, getModel } from '../../../utils/models'
import { creditsLabel } from '../hooks/useFlowPlan'
import { useBankStore } from '../../../stores/bankStore'
import AutoGrowTextarea from '../../../components/AutoGrowTextarea'
import { editItem } from '../run/edits'

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
  if (block.kind === 'scenes') {
    return <TakesReview flowId={flowId} block={block} keys={madeKeys} doc={doc} onLater={onLater} onDone={onDone} />
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
  const valueOf = (slot: string) => results.map((r) => r.items?.[slot]).find(Boolean)
  // Only what the run actually made: a model that wrote nine hooks for ten
  // slots leaves one with nothing to keep.
  const slots = liveItems(block).filter((it) => !it.off && valueOf(it.id))
  const [keep, setKeep] = useState<string[]>(slots.map((it) => it.id))
  // Scripts only: the words rewritten by hand before they're voiced or shot.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const noun = itemNoun(block)
  const toggle = (id: string) => setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]))
  const faces = block.kind === 'characters'
  const textOf = (v: FlowValue | undefined) => (v?.type === 'script' ? v.payload.text : v?.label ?? '')
  const go = () => {
    for (const [slot, text] of Object.entries(edits)) {
      if (text.trim() && text !== textOf(valueOf(slot))) editItem(flowId, block.id, slot, text.trim())
    }
    approveReview(flowId, block.id, { kind: 'items', keep, shown: slots.map((it) => it.id) })
    onDone()
  }
  const edited = Object.entries(edits).filter(([slot, text]) => text.trim() && text !== textOf(valueOf(slot))).length
  return (
    <Modal
      open
      onClose={onLater}
      title={`Review ${titleOf(block)}`}
      subtitle={faces
        ? `Keep the ${noun.toLowerCase()}s worth making more from. The rest turn off, and nothing downstream runs for them.`
        : `Keep the ${noun.toLowerCase()}s worth making, and fix any line that doesn't sound like a person. The rest turn off, and nothing downstream runs for them.`}
      size={faces ? 'wide' : 'medium'}
      footer={<Footer onLater={onLater} label={`Keep ${keep.length}${edited ? `, ${edited} Edited,` : ''} and Continue`} disabled={!keep.length} onGo={go} />}
    >
      <div className={faces ? 'grid grid-cols-2 gap-3 p-4 sm:grid-cols-4' : 'flex flex-col gap-1.5 p-4'}>
        {slots.map((it, i) => {
          const v = valueOf(it.id)
          const on = keep.includes(it.id)
          if (faces) return <FaceTile key={it.id} value={v} on={on} onClick={() => toggle(it.id)} />
          const text = edits[it.id] ?? textOf(v)
          return (
            <div
              key={it.id}
              className={`group flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${on ? 'border-flow-500/40 bg-flow-500/10' : 'border-ink/5 opacity-60 hover:opacity-100'}`}
            >
              <button
                type="button"
                onClick={() => toggle(it.id)}
                aria-label={on ? `Leave ${noun} ${i + 1} Out` : `Keep ${noun} ${i + 1}`}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-flow-400 bg-flow-500 text-white' : 'border-ink/20'}`}
              >
                {on && <Check className="h-3 w-3" />}
              </button>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[11px] text-ink-500">
                  {noun} {i + 1}
                  {edits[it.id] !== undefined && edits[it.id] !== textOf(v) && <span className="text-flow-300">Edited</span>}
                </span>
                {editing === it.id ? (
                  <AutoGrowTextarea
                    autoFocus
                    value={text}
                    onChange={(e) => setEdits((cur) => ({ ...cur, [it.id]: e.target.value }))}
                    onBlur={() => setEditing(null)}
                    className="mt-1 w-full resize-none rounded-xl border border-flow-500/30 bg-ink/[0.04] px-3 py-2 text-[13px] leading-relaxed text-ink-100 outline-none"
                  />
                ) : (
                  <span className="block cursor-text whitespace-pre-wrap text-[13px] leading-relaxed text-ink-100" onClick={() => setEditing(it.id)}>{text || '—'}</span>
                )}
              </span>
              {editing !== it.id && (
                <button
                  type="button"
                  onClick={() => setEditing(it.id)}
                  title="Edit the words before anything is made from them"
                  className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-ink/10 px-2.5 text-[11px] font-medium text-ink-400 opacity-0 transition-opacity hover:border-ink/20 hover:text-ink-100 group-hover:opacity-100 touch:opacity-100"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              )}
            </div>
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

// ── Scene Clips takes ──────────────────────────────────────────────────────

// The best take of each scene: every take a run filmed, scene by scene, and
// only the picked ones go on to the edit. The first take of each scene
// starts picked, so Continue with nothing touched keeps one clip per scene.
function TakesReview({ flowId, block, keys, doc, onLater, onDone }: { flowId: string; block: FlowBlock; keys: string[]; doc: FlowDoc; onLater: () => void; onDone: () => void }) {
  const results = doc.outputs[block.id]?.instances ?? {}
  const runs = keys.map((key) => {
    const v = results[key]?.outputs.clips?.[0]
    const clips = v?.type === 'video' ? v.payload.clips.filter((c) => c.scene !== undefined) : []
    const scenes = [...new Set(clips.map((c) => c.scene!))].sort((a, b) => a - b)
    return { key, label: v?.label ?? '', scenes: scenes.map((n) => ({ n, takes: clips.filter((c) => c.scene === n).sort((a, b) => (a.take ?? 0) - (b.take ?? 0)) })) }
  })
  const [keep, setKeep] = useState<Record<string, string[]>>(() => Object.fromEntries(runs.map((r) => [r.key, r.scenes.map((s) => `${s.n}:${s.takes[0]?.take ?? 0}`)])))
  const [playing, setPlaying] = useState<string | null>(null)
  const playUrl = useAssetUrl(playing ?? undefined)
  const toggle = (run: string, id: string) =>
    setKeep((cur) => {
      const list = cur[run] ?? []
      return { ...cur, [run]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }
    })
  const count = Object.values(keep).reduce((n, l) => n + l.length, 0)
  const bare = runs.flatMap((r) => r.scenes.filter((s) => !s.takes.some((t) => keep[r.key]?.includes(`${s.n}:${t.take ?? 0}`))).map((s) => s.n))
  const aspect = String(block.settings.aspectRatio ?? '9:16')
  return (
    <Modal
      open
      onClose={onLater}
      title="Pick the Best Takes"
      subtitle={bare.length ? `Scene ${[...new Set(bare)].join(', ')} has no take picked, so it's left out of the edit.` : 'Only the takes you pick go on to the edit. Click a take to pick it, and its ▶ to watch it.'}
      size="wide"
      footer={<Footer onLater={onLater} label={`Keep ${count} and Continue`} disabled={!count} onGo={() => { approveReview(flowId, block.id, { kind: 'takes', keep }); onDone() }} />}
    >
      <div className="flex flex-col gap-6 p-4">
        {runs.map((r, i) => (
          <div key={r.key} className="flex flex-col gap-3">
            {runs.length > 1 && <p className="truncate text-[12px] font-medium text-ink-300">Ad {i + 1} · {r.label}</p>}
            {r.scenes.map((s) => (
              <div key={s.n} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[12px] font-medium text-ink-400">Scene {s.n}</span>
                <div className="flex flex-wrap gap-2">
                  {s.takes.map((t) => {
                    const id = `${s.n}:${t.take ?? 0}`
                    return (
                      <TakeTile
                        key={id}
                        refId={t.ref}
                        aspect={aspect}
                        on={!!keep[r.key]?.includes(id)}
                        label={`Take ${(t.take ?? 0) + 1}`}
                        onClick={() => toggle(r.key, id)}
                        onPlay={() => setPlaying(t.ref)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {playing && playUrl && (
        <VideoLightbox videoUrl={playUrl} fileStem="scene-take" aspectRatio={aspect} sourceApp="playground" accentClass="border-playground-500/40 bg-playground-500/20 text-playground-100 hover:bg-playground-500/30" onClose={() => setPlaying(null)} />
      )}
    </Modal>
  )
}

function TakeTile({ refId, aspect, on, label, onClick, onPlay }: { refId: string; aspect: string; on: boolean; label: string; onClick: () => void; onPlay: () => void }) {
  const thumb = useAssetThumb(refId)
  return (
    <div className={`relative w-[96px] overflow-hidden rounded-xl border-2 transition-colors ${on ? 'border-flow-400' : 'border-transparent opacity-55 hover:opacity-100'}`} style={{ aspectRatio: aspect.replace(':', ' / ') }}>
      <button type="button" onClick={onClick} className="absolute inset-0" aria-label={on ? `Leave ${label} Out` : `Keep ${label}`} aria-pressed={on}>
        {thumb.url ? <img src={thumb.url} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full bg-ink/10" />}
      </button>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-[10px] font-medium text-white">{label}</span>
      {on && <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-flow-500 text-white"><Check className="h-3 w-3" /></span>}
      <button type="button" onClick={onPlay} aria-label={`Watch ${label}`} className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75">
        <Play className="ml-0.5 h-3 w-3" />
      </button>
    </div>
  )
}
