// Run View: the flow as an app. Its fields and Run on the left — whatever the
// author left as a field — and on the right one card per ad the flow made,
// arriving as the run makes them. A pinned flow opens here, and on a phone
// this is the whole of Flow: editing the canvas stays on a computer.

import { useState } from 'react'
import { ArrowLeft, Download, Layers, Pause, Play, Workflow } from 'lucide-react'
import type { EditPack, FlowBlock, FlowDoc, FlowValue } from '../types'
import type { FlowPlan } from '../engine/plan'
import type { LiveRun } from '../run/runtime'
import { KINDS, sourceOf, titleOf } from '../engine/catalog'
import { wiresOutOf } from '../engine/graph'
import { downloadEditPacks } from '../run/editPack'
import FlowPanel from './panels/FlowPanel'
import PinButton from './PinButton'
import MobilePaneTabs from '../../../components/MobilePaneTabs'
import { paneClass } from '../../../components/paneClass'
import GridCanvas from '../../../components/GridCanvas'
import { useAssetThumb } from '../../../hooks/useAssetUrl'
import { useAudioPlayback } from '../../../hooks/useAudioPlayback'
import { useIsDesktop } from '../../../hooks/useBreakpoint'
import type { RunRequest } from './Editor'

interface AdCard {
  key: string
  block: FlowBlock
  value?: FlowValue
  pack?: EditPack
}

// The ads are what the flow's last blocks made: the blocks nothing is wired
// out of, newest runs first.
function cardsOf(doc: FlowDoc, plan: FlowPlan | null): AdCard[] {
  const sinks = doc.blocks.filter((b) => KINDS[b.kind]?.runnable && sourceOf(b) === 'generate' && !b.off && wiresOutOf(doc, b.id).length === 0)
  const cards: AdCard[] = []
  for (const block of sinks) {
    for (const inst of plan?.blocks[block.id]?.instances ?? []) {
      const made = inst.cached
      if (!made || made.off || inst.run) continue
      if (made.pack) {
        cards.push({ key: `${block.id}:${inst.key}`, block, pack: made.pack })
        continue
      }
      const values = [...Object.values(made.outputs).flat(), ...Object.values(made.items ?? {})]
      const lead = values.find((v) => v.type === 'video') ?? values[0]
      if (lead) cards.push({ key: `${block.id}:${inst.key}`, block, value: lead })
    }
  }
  return cards
}

export default function RunView({
  flowId,
  doc,
  plan,
  test,
  run,
  balance,
  onRun,
  onEdit,
  onBack,
}: {
  flowId: string
  doc: FlowDoc
  plan: FlowPlan | null
  test: FlowPlan | null
  run: LiveRun | undefined
  balance: number | null
  onRun: (req: RunRequest) => void
  onEdit: () => void
  onBack: () => void
}) {
  const isDesktop = useIsDesktop()
  const [pane, setPane] = useState<'inputs' | 'results'>('inputs')
  const cards = cardsOf(doc, plan)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <MobilePaneTabs
        options={[
          { value: 'inputs', label: 'Inputs', icon: Workflow },
          { value: 'results', label: 'Results', icon: Layers, badge: cards.length || undefined },
        ]}
        value={pane}
        onChange={setPane}
        accent="flow"
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className={paneClass(pane === 'inputs', 'md:w-[400px] md:shrink-0 md:border-r md:border-ink/5')}>
          <FlowPanel flowId={flowId} doc={doc} plan={plan} test={test} run={run} balance={balance} onRun={(req) => { onRun(req); setPane('results') }} />
        </div>
        <div className={paneClass(pane === 'results', 'md:flex-1 md:overflow-hidden')}>
          <div className="flex h-[57px] shrink-0 items-center gap-3 border-b border-ink/5 px-5">
            <button
              type="button"
              onClick={onBack}
              title="All Flows"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 text-ink-400 transition-colors hover:border-ink/20 hover:text-ink-100"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="min-w-0 truncate text-sm font-semibold text-ink-100">{doc.name}</span>
            <span className="shrink-0 text-xs text-ink-500">{cards.length} {cards.length === 1 ? 'result' : 'results'}</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <PinButton flowId={flowId} pinned={!!doc.pinned} />
              {isDesktop && (
                <button type="button" onClick={onEdit} className="rounded-full border border-ink/10 px-3.5 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100">
                  Open Canvas
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cards.length === 0 ? (
              <GridCanvas>
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-24 text-center">
                  <p className="text-sm font-medium text-ink-200">{run?.status === 'running' ? 'Making your ads…' : 'Nothing made yet'}</p>
                  <p className="max-w-xs text-xs text-ink-500">Fill the fields, then Run. Each finished ad lands here as its own card.</p>
                </div>
              </GridCanvas>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((c) => <Card key={c.key} card={c} flowName={doc.name} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function clipsLabel(n: number): string {
  return `${n} ${n === 1 ? 'clip' : 'clips'}`
}

function Card({ card, flowName }: { card: AdCard; flowName: string }) {
  if (card.pack) return <PackCard pack={card.pack} flowName={flowName} />
  const v = card.value!
  const ref = v.type === 'image' ? v.payload.ref
    : v.type === 'character' ? v.payload.imageRef
    : v.type === 'video' ? v.payload.cover ?? v.payload.stills?.[0]
    : undefined
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-ink/5 bg-ink/[0.02]">
      {ref && <CardThumb refId={ref} />}
      {v.type === 'audio' && <AudioRow refId={v.payload.ref} duration={v.payload.durationSeconds} />}
      <div className="flex flex-col gap-1 p-3">
        <span className="text-[11px] text-ink-500">{titleOf(card.block)}{v.type === 'video' ? ` · ${clipsLabel(v.payload.clips.length)}` : ''}</span>
        <span className="line-clamp-3 text-[12.5px] leading-snug text-ink-100">{v.label}</span>
      </div>
    </div>
  )
}

function CardThumb({ refId }: { refId: string }) {
  const thumb = useAssetThumb(refId)
  return thumb.url ? <img src={thumb.url} alt="" className="aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5] w-full bg-ink/5" />
}

function AudioRow({ refId, duration }: { refId: string; duration: number }) {
  const player = useAudioPlayback(refId, duration)
  return (
    <button type="button" onClick={player.toggle} className="flex items-center gap-2 px-3 pt-3 text-[12px] text-voice-300">
      {player.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      {duration > 0 ? `${Math.round(duration)}s voiceover` : 'Voiceover'}
    </button>
  )
}

function PackCard({ pack, flowName }: { pack: EditPack; flowName: string }) {
  const cover = pack.cover ?? pack.stills[0]
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-ink/5 bg-ink/[0.02]">
      {cover ? <CardThumb refId={cover} /> : <div className="flex aspect-[4/5] w-full items-center justify-center bg-gradient-to-br from-[#F77646]/20 to-transparent text-[12px] text-ink-400">{clipsLabel(pack.clips.length)}</div>}
      <div className="flex flex-col gap-2 p-3">
        <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-100">{pack.title}</span>
        <span className="text-[11px] text-ink-500">{clipsLabel(pack.clips.length)}{pack.voiceover ? ' · voiceover' : ''}{pack.script ? ' · script' : ''}</span>
        {pack.voiceover && <AudioRow refId={pack.voiceover} duration={0} />}
        <button
          type="button"
          onClick={() => void downloadEditPacks(`${flowName}-${pack.title}`, [pack])}
          className="flex items-center justify-center gap-1.5 rounded-full border border-[#F77646]/40 bg-[#F77646]/10 px-3 py-2 text-[12px] font-semibold text-[#F77646] transition-colors hover:bg-[#F77646]/20"
        >
          <Download className="h-3.5 w-3.5" />
          Download Pack
        </button>
      </div>
    </div>
  )
}
