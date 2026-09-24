// The left column with one block selected: that block's own settings, where
// its result comes from, what's wired into it, and Run Block. The apps'
// panels render here with the block's settings wherever they can take them
// (Voiceovers' settings, the whole Characters form); the rest are compact
// forms built from the same apps' own options.

import { ExternalLink } from 'lucide-react'
import type { FlowBlock, FlowDoc, FlowValue } from '../../types'
import type { FlowPlan } from '../../engine/plan'
import type { LiveRun } from '../../run/runtime'
import { KINDS, sourceOf } from '../../engine/catalog'
import { useAppStore } from '../../../../stores/appStore'
import { getAppConfig } from '../../../../utils/constants'
import { useAssetThumb } from '../../../../hooks/useAssetUrl'
import { BlockHeader, FlowToggles, InputsCard, PanelSection, RunBar, SourceToggle } from './common'
import { BankPick, HistoryPick } from './Picks'
import VoicePanel from './VoicePanel'
import ScriptsPanel from './ScriptsPanel'
import CharactersPanel from './CharactersPanel'
import { BrollPanel, PlaygroundPanel } from './MediaPanels'
import { AnalyzerPanel, BankPanel, EditPanel, ImagePanel, ListPanel, OutliersPanel, TextPanel } from './SmallPanels'
import type { RunRequest } from '../Editor'

export default function BlockPanel({
  block,
  doc,
  plan,
  run,
  onRun,
}: {
  flowId: string
  block: FlowBlock
  doc: FlowDoc
  plan: FlowPlan | null
  run: LiveRun | undefined
  onRun: (req: RunRequest) => void
}) {
  const source = sourceOf(block)
  const spec = KINDS[block.kind]

  // Characters' own form carries its own scroller and its own Run button, so
  // it gets the column and the flow's controls sit above it.
  if (block.kind === 'characters' && source === 'generate') {
    return (
      <div className="flex h-full flex-col">
        <BlockHeader block={block} />
        <div className="max-h-[38%] shrink-0 overflow-y-auto border-b border-ink/5">
          <PanelSection>
            <SourceToggle block={block} />
            <InputsCard block={block} doc={doc} />
            <FlowToggles block={block} />
          </PanelSection>
        </div>
        <div className="min-h-0 flex-1">
          <CharactersPanel block={block} run={run} onRun={onRun} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <BlockHeader block={block} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {(spec.sources.length > 1 || (spec.runnable && source === 'generate' && spec.ins.length > 0)) && (
          <PanelSection>
            <SourceToggle block={block} />
            {source === 'generate' && <InputsCard block={block} doc={doc} />}
          </PanelSection>
        )}

        {spec.runnable && source === 'bank' && (
          <PanelSection>
            <BankPick block={block} bank={block.kind === 'characters' ? 'models' : 'scripts'} />
          </PanelSection>
        )}
        {spec.runnable && source === 'history' && (
          <PanelSection>
            <HistoryPick block={block} />
          </PanelSection>
        )}
        {(!spec.runnable || source === 'generate') && <KindSettings block={block} doc={doc} plan={plan} />}

        <PanelSection>
          <FlowToggles block={block} />
        </PanelSection>
        <Results block={block} plan={plan} />
      </div>
      <RunBar block={block} plan={plan} run={run} onRun={onRun} />
    </div>
  )
}

function KindSettings({ block, doc, plan }: { block: FlowBlock; doc: FlowDoc; plan: FlowPlan | null }) {
  switch (block.kind) {
    case 'voice': return <VoicePanel block={block} />
    case 'scripts': return <ScriptsPanel block={block} doc={doc} />
    case 'broll': return <BrollPanel block={block} doc={doc} />
    case 'playground': return <PlaygroundPanel block={block} doc={doc} />
    case 'analyzer': return <AnalyzerPanel />
    case 'outliers': return <OutliersPanel block={block} />
    case 'edit': return <EditPanel block={block} plan={plan} flowName={doc.name} />
    case 'bank': return <BankPanel block={block} />
    case 'image': return <ImagePanel block={block} />
    case 'text':
    case 'note': return <TextPanel block={block} />
    case 'list': return <ListPanel block={block} />
    default: return null
  }
}

// What the block has made, newest run first, and the way into its app.
function Results({ block, plan }: { block: FlowBlock; plan: FlowPlan | null }) {
  const openApp = useAppStore((s) => s.openApp)
  const spec = KINDS[block.kind]
  if (!spec.runnable || sourceOf(block) !== 'generate' || block.kind === 'edit') return null
  const values: FlowValue[] = []
  for (const inst of plan?.blocks[block.id]?.instances ?? []) {
    if (!inst.cached || inst.cached.off) continue
    values.push(...Object.values(inst.cached.outputs).flat(), ...Object.values(inst.cached.items ?? {}))
  }
  if (!values.length) return null
  const app = spec.appId ? getAppConfig(spec.appId) : undefined
  return (
    <PanelSection>
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Made So Far</p>
        {app && (
          <button type="button" onClick={() => openApp(app.id)} className="flex items-center gap-1 text-[11px] text-ink-400 hover:text-ink-100">
            Open {app.name}
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {values.slice(0, 24).map((v, i) => <ResultRow key={`${v.key}:${i}`} value={v} />)}
        {values.length > 24 && <p className="px-2 text-[11px] text-ink-500">+{values.length - 24} more</p>}
      </div>
    </PanelSection>
  )
}

function ResultRow({ value }: { value: FlowValue }) {
  const ref = value.type === 'image' ? value.payload.ref
    : value.type === 'character' ? value.payload.imageRef
    : value.type === 'video' ? value.payload.cover ?? value.payload.stills?.[0]
    : undefined
  const thumb = useAssetThumb(ref)
  const meta = value.type === 'video' ? `${value.payload.clips.length} ${value.payload.clips.length === 1 ? 'clip' : 'clips'}`
    : value.type === 'audio' ? `${Math.round(value.payload.durationSeconds)}s`
    : undefined
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
      {ref ? (thumb.url ? <img src={thumb.url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-lg bg-ink/10" />) : null}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[12px] text-ink-200">{value.label}</span>
        {meta && <span className="block text-[10.5px] text-ink-500">{meta}</span>}
      </span>
    </div>
  )
}
