// B-Roll, as a block. The left column is B-Roll's own panel — Character,
// Product, the script, B-Roll or Dialogue, Additional Instructions, who writes
// the shots — working on this block; whatever a wire feeds stands in the
// panel where its card would be. Under it, the Stills and Clips card: what a
// run decides up front that B-Roll decides later, on the storyboard and in
// the clip modal. The right is each run's storyboard, line by line, its
// stills and clips landing as they're made.

import { useState } from 'react'
import { Film, Play } from 'lucide-react'
import type { BrollHistoryItem, Model, Product, Script } from '../../../../stores/types'
import type { FlowValue } from '../../types'
import { wiresInto } from '../../engine/graph'
import { brollVideoModel, brollVideoResolution } from '../../engine/cost'
import { cardKey } from '../../engine/brollSession'
import { useFlowStore } from '../../store/flowStore'
import { useBankStore } from '../../../../stores/bankStore'
import InputPanel from '../../../broll-studio/components/InputPanel'
import type { BrollResult, CardState } from '../../../broll-studio/types'
import { CONTINUOUS_STYLES } from '../../../../utils/visualStyle'
import { getModel } from '../../../../utils/models'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { creditsPill } from '../../hooks/useFlowPlan'
import BankPicker from '../../../../components/BankPicker'
import SectionCard from '../../../../components/SectionCard'
import Dropdown from '../../../../components/Dropdown'
import ModelPicker from '../../../../components/ModelPicker'
import Switch from '../../../../components/Switch'
import GridCanvas from '../../../../components/GridCanvas'
import VideoLightbox from '../../../../components/VideoLightbox'
import { PendingMedia } from '../../../../components/GeneratingMedia'
import { useAssetThumb, useAssetUrl } from '../../../../hooks/useAssetUrl'
import { InputsBand, NothingYet, RunChip, WiredCard } from './parts'
import { arrivingLabels, blockRuns, blockTitle, ownRunPrice, type BlockRun, type WindowProps } from './runs'

type Picker = 'products' | 'models' | 'scripts' | null

export default function BrollWindow({ doc, block, plan, run, onRun, onReview }: WindowProps) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const [picker, setPicker] = useState<Picker>(null)
  const [pickedScript, setPickedScript] = useState<Script | null>(null)
  const s = block.settings
  const set = (patch: Record<string, unknown>, coalesce?: string) => patchSettings(block.id, patch, coalesce ? { coalesce: `${coalesce}:${block.id}` } : undefined)
  const product = useBankStore((st) => (typeof s.productId === 'string' ? st.products.find((p) => p.id === s.productId) ?? null : null))
  const character = useBankStore((st) => (typeof s.characterId === 'string' ? st.models.find((m) => m.id === s.characterId) ?? null : null))
  const bp = plan?.blocks[block.id]
  const runs = blockRuns(block, bp, run)
  const runCount = bp?.instances.length ?? 0
  const price = ownRunPrice(doc, block, plan)

  const wiredCard = (port: 'character' | 'product' | 'script' | 'instructions', hint: string) => {
    const wires = wiresInto(doc, block.id, port)
    if (!wires.length) return undefined
    const arriving = [...new Set(runs.flatMap((r) => arrivingLabels(r.inputs[port], blockTitle(doc, wires[0].from))))]
    return (
      <WiredCard doc={doc} block={block} port={port} hint={hint}>
        {arriving.length > 0 && (
          <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
            {arriving.slice(0, 8).map((a) => (
              <span key={a} className="truncate rounded-xl bg-ink/[0.05] px-2.5 py-1.5 text-[11.5px] text-ink-300">{a}</span>
            ))}
            {arriving.length > 8 && <span className="px-1 text-[11px] text-ink-500">+{arriving.length - 8} more</span>}
          </div>
        )}
      </WiredCard>
    )
  }

  return (
    <>
      <div className="flex w-[440px] shrink-0 flex-col border-r border-ink/5">
        <InputPanel
          selectedProduct={product as Product | null}
          selectedModel={character as Model | null}
          selectedScript={pickedScript}
          scriptText={String(s.scriptText ?? '')}
          additionalContext={String(s.context ?? '')}
          onSelectProduct={() => setPicker('products')}
          onSelectModel={() => setPicker('models')}
          onSelectScript={() => setPicker('scripts')}
          onClearProduct={() => set({ productId: undefined })}
          onClearModel={() => set({ characterId: undefined })}
          onClearScript={() => setPickedScript(null)}
          onScriptTextChange={(v) => {
            set({ scriptText: v }, 'script')
            setPickedScript(null)
          }}
          onAdditionalContextChange={(v) => set({ context: v }, 'context')}
          onGenerate={() => onRun({ only: block.id })}
          onImportPrompts={() => undefined}
          isGenerating={false}
          mode="line"
          onModeChange={() => undefined}
          showModeToggle={false}
          lineDelivery={s.delivery === 'dialogue' ? 'dialogue' : 'silent'}
          onLineDeliveryChange={(v) => set({ delivery: v })}
          flow={{
            wired: {
              character: wiredCard('character', 'Each character that comes in shoots its own run.'),
              product: wiredCard('product', 'The product in every shot comes in on its wire.'),
              script: wiredCard('script', 'Each script that comes in becomes its own storyboard, with its stills and clips.'),
              instructions: wiredCard('instructions', 'The instructions come in on their wire. A Batch wired here shoots once per item.'),
            },
            settings: <StillsAndClips doc={doc} block={block} />,
            // In B-Roll this button writes a storyboard. Here it runs the
            // whole block — storyboard, every still and, animated, every clip.
            actionLabel: `${block.settings.animate !== false ? 'Generate Stills and Clips' : 'Generate Stills'}${runCount > 1 ? ` · ${runCount} runs` : ''}`,
            credits: price.credits ? creditsPill(price.credits, price.unpriced) : null,
            hideImport: true,
          }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand doc={doc} block={block} plan={plan} run={run} onReview={onReview} />
        <GridCanvas>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {runs.length === 0 ? (
              <NothingYet icon={Film} title="No storyboard yet" hint="Each script becomes a storyboard: a still for every line, then a clip for every still you keep." />
            ) : (
              <div className="flex flex-col gap-4 px-6 py-6">
                {runs.map((r) => <SessionCard key={r.key} run={r} modelId={brollVideoModel(block)} />)}
              </div>
            )}
          </div>
        </GridCanvas>
      </div>

      {picker && (
        <BankPicker
          bankType={picker}
          isOpen
          onClose={() => setPicker(null)}
          onSelect={(item) => {
            if (picker === 'products') set({ productId: item.id })
            else if (picker === 'models') set({ characterId: item.id })
            else {
              const script = item as Script
              set({ scriptText: script.scriptText })
              setPickedScript(script)
            }
            setPicker(null)
          }}
        />
      )}
    </>
  )
}

// What a run decides before it starts that B-Roll decides later: the look,
// how many takes of each line, the frame, and whether — and on what — the
// stills become clips.
function StillsAndClips({ doc, block }: { doc: WindowProps['doc']; block: WindowProps['block'] }) {
  const patchSettings = useFlowStore((st) => st.patchSettings)
  const s = block.settings
  const set = (patch: Record<string, unknown>) => patchSettings(block.id, patch)
  // Read through the selector so the row follows a pick made in B-Roll; the
  // fallback order is brollVideoModel's (engine/cost.ts), the run's own.
  const appVideo = useSettingsStore((st) => st.getAppModel('broll-studio:video'))
  const videoModel = (s.videoModelId as string | undefined) ?? appVideo ?? brollVideoModel(block)
  const resolutions = videoModel ? getModel(videoModel)?.videoConstraints?.resolutions ?? [] : []
  const styleWired = wiresInto(doc, block.id, 'style').length > 0
  const animate = s.animate !== false
  return (
    <SectionCard icon={Film} title="Stills and Clips" className="mt-2 shrink-0" contentClassName="flex flex-col gap-2">
      {styleWired ? (
        <p className="rounded-2xl border border-dashed border-ink/10 px-4 py-2.5 text-[11.5px] text-ink-500">The look comes in on its Visual Style wire.</p>
      ) : (
        <Dropdown
          label="Look"
          accent="broll"
          value={String(s.styleId ?? 'ugc')}
          options={CONTINUOUS_STYLES.map((st) => ({ value: st.id, label: st.label }))}
          onChange={(v) => set({ styleId: v })}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <Dropdown label="Takes" accent="broll" value={String(s.takes ?? 1)} options={['1', '2', '3']} onChange={(v) => set({ takes: Number(v) })} />
        <Dropdown label="Frame" accent="broll" value={String(s.aspectRatio ?? '9:16')} options={['9:16', '16:9', '1:1']} onChange={(v) => set({ aspectRatio: v })} />
      </div>
      <div className="flex items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.02] py-2 pl-4 pr-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-ink-200">Animate the Stills</span>
          <span className="block truncate text-[11px] text-ink-500">{animate ? 'Every kept still becomes a clip' : 'Stills only'}</span>
        </span>
        <Switch checked={animate} onChange={(next) => set({ animate: next })} label="Animate the Stills" accent="broll" size="sm" />
      </div>
      {animate && (
        <>
          <ModelPicker
            appId="broll-studio"
            task="video"
            row
            value={videoModel}
            onChange={(id) => set({ videoModelId: id })}
            persist={false}
            requireAnyModes={['image-to-video', 'reference-to-video']}
            requireModeNote="Greyed models can't start from a still."
          />
          {resolutions.length > 1 && (
            <Dropdown label="Clip Quality" accent="broll" value={brollVideoResolution(block, videoModel)} options={resolutions} onChange={(v) => set({ videoResolution: v })} />
          )}
        </>
      )}
    </SectionCard>
  )
}

// One run: its storyboard, a line per row, each take's still — or its clip,
// once there is one.
function SessionCard({ run, modelId }: { run: BlockRun; modelId?: string }) {
  const sessionId = run.result?.rows?.find((r) => r.bank === 'brollHistory')?.id
  const session = useBankStore((st) => (sessionId ? st.brollHistory.find((h) => h.id === sessionId) : undefined))
  const script = run.inputs.script?.[0] as FlowValue | undefined
  return (
    <section className="rounded-3xl border border-ink/5 bg-surface-1/80 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-200">{script && !script.pending ? script.label : run.label}</span>
        <RunChip status={run.status} note={run.note} />
      </div>
      {session ? (
        <Storyboard session={session} />
      ) : run.status === 'running' ? (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 4 }, (_, i) => <PendingMedia key={i} kind="image" family="broll" modelId={modelId} />)}
        </div>
      ) : (
        <p className="text-[12px] text-ink-500">{run.error ?? 'Not made yet. Its storyboard lands here, still by still.'}</p>
      )}
    </section>
  )
}

function Storyboard({ session }: { session: BrollHistoryItem }) {
  const result = session.result as BrollResult | undefined
  if (!result?.scenes?.length) return <p className="text-[12px] text-ink-500">Writing the storyboard…</p>
  return (
    <div className="flex flex-col gap-3">
      {result.scenes.map((scene) => {
        const keys = scene.variations.map((_, i) => cardKey(scene.number, i)).filter((k) => session.cardStates?.[k])
        if (!keys.length) return null
        return (
          <div key={scene.number} className="flex gap-3">
            <p className="w-40 shrink-0 text-[11.5px] leading-snug text-ink-400">
              <span className="mr-1 font-semibold text-ink-500">{scene.number}.</span>
              {scene.scriptLine}
            </p>
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {keys.map((k) => <CardTile key={k} card={session.cardStates[k] as CardState} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CardTile({ card }: { card: CardState }) {
  const [open, setOpen] = useState(false)
  const image = card.images?.[card.images.length - 1]
  const video = card.videos?.[card.videos.length - 1]
  const thumb = useAssetThumb(image?.imageUrl)
  const videoUrl = useAssetUrl(open ? video?.url : undefined)
  if (!image) return <span className="h-[106px] w-[60px] shrink-0 rounded-xl border border-dashed border-ink/15" />
  return (
    <>
      <button
        type="button"
        onClick={() => video && setOpen(true)}
        className={`relative h-[106px] w-[60px] shrink-0 overflow-hidden rounded-xl border border-ink/10 ${video ? 'cursor-pointer' : 'cursor-default'}`}
        title={video ? 'Play the clip' : 'A still'}
      >
        {thumb.url ? <img src={thumb.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 bg-ink/10" />}
        {video && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white">
              <Play className="ml-0.5 h-3 w-3" />
            </span>
          </span>
        )}
      </button>
      {open && videoUrl && (
        <VideoLightbox videoUrl={videoUrl} prompt={video?.prompt} fileStem="broll-clip" aspectRatio={card.cardVideoAspectRatio} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
