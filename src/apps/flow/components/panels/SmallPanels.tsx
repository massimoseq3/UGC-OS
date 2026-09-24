// Settings for the blocks with few of them: a Bank row, an Image, Text, a
// List, a Note, an Outliers search, the Ad Analyzer and Edit Pack.

import { useRef } from 'react'
import { Download, Upload } from 'lucide-react'
import type { FlowBlock } from '../../types'
import type { FlowPlan } from '../../engine/plan'
import { useFlowStore } from '../../store/flowStore'
import { BANK_ORDER } from '../../engine/catalog'
import { BANK_CONFIG, type BankType } from '../../../../utils/constants'
import { saveAsset } from '../../../../utils/assetStore'
import { useAssetThumb } from '../../../../hooks/useAssetUrl'
import { useSettingsStore } from '../../../../stores/settingsStore'
import Dropdown from '../../../../components/Dropdown'
import SegmentedToggle from '../../../../components/SegmentedToggle'
import AutoGrowTextarea from '../../../../components/AutoGrowTextarea'
import { BankPick } from './Picks'
import { FieldLabel } from './common'
import { downloadEditPacks } from '../../run/editPack'

const TEXTAREA = 'w-full resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-[13px] text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-ink/20'
const INPUT = 'w-full rounded-full border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-[13px] text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-ink/20'

export function BankPanel({ block }: { block: FlowBlock }) {
  const patchBlock = useFlowStore((s) => s.patchBlock)
  const bank = (block.settings.bank as BankType) ?? 'products'
  return (
    <div className="flex flex-col gap-3 px-5 pb-4 pt-4">
      <Dropdown
        label="Bank"
        accent="flow"
        value={bank}
        options={BANK_ORDER.map((b) => ({ value: b, label: BANK_CONFIG[b].label }))}
        onChange={(v) => patchBlock(block.id, { settings: { ...block.settings, bank: v }, pick: undefined })}
      />
      <BankPick block={block} bank={bank} />
    </div>
  )
}

export function ImagePanel({ block }: { block: FlowBlock }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const fileRef = useRef<HTMLInputElement>(null)
  const ref = String(block.settings.ref ?? '')
  const thumb = useAssetThumb(ref || undefined)
  return (
    <div className="flex flex-col gap-3 px-5 pb-4 pt-4">
      {ref ? (
        thumb.url ? <img src={thumb.url} alt="" className="max-h-72 w-full rounded-2xl object-contain" /> : <div className="h-48 rounded-2xl bg-ink/5" />
      ) : (
        <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-8 text-center text-xs text-ink-500">Drop an image on the canvas, or upload one.</p>
      )}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex items-center justify-center gap-2 rounded-full border border-ink/10 px-4 py-2.5 text-sm text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
      >
        <Upload className="h-4 w-4" />
        {ref ? 'Replace Image' : 'Upload Image'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const saved = await saveAsset(file, file.type)
          patchSettings(block.id, { ref: saved, name: file.name.replace(/\.[^.]+$/, '') })
        }}
      />
    </div>
  )
}

export function TextPanel({ block }: { block: FlowBlock }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  return (
    <div className="flex flex-col gap-2 px-5 pb-4 pt-4">
      <FieldLabel>{block.kind === 'note' ? 'Note' : 'Text'}</FieldLabel>
      <AutoGrowTextarea
        value={String(block.settings.text ?? '')}
        onChange={(e) => patchSettings(block.id, { text: e.target.value }, { coalesce: `text:${block.id}` })}
        placeholder={block.kind === 'note' ? 'Explain what to swap, or why the flow is built this way. Whoever imports it reads this.' : 'A brief, a prompt, a script — anything a text input takes.'}
        className={TEXTAREA}
        rows={6}
      />
    </div>
  )
}

export function ListPanel({ block }: { block: FlowBlock }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const entries = Array.isArray(block.settings.entries) ? (block.settings.entries as string[]) : []
  return (
    <div className="flex flex-col gap-2 px-5 pb-4 pt-4">
      <FieldLabel>One Item per Line</FieldLabel>
      <AutoGrowTextarea
        value={entries.join('\n')}
        onChange={(e) => patchSettings(block.id, { entries: e.target.value.split('\n').slice(0, 20) }, { coalesce: `list:${block.id}` })}
        placeholder={'Sensitive skin\nOily skin\nDry skin'}
        className={TEXTAREA}
        rows={6}
      />
      <p className="px-1 text-[11px] text-ink-500">Everything wired after it runs once per item. Up to 20.</p>
    </div>
  )
}

export function OutliersPanel({ block }: { block: FlowBlock }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const hasKey = useSettingsStore((s) => !!s.scrapeCreatorsKey)
  const s = block.settings
  return (
    <div className="flex flex-col gap-3 px-5 pb-4 pt-4">
      <SegmentedToggle
        options={[{ value: 'tiktok', label: 'TikTok' }, { value: 'instagram', label: 'Instagram' }, { value: 'meta', label: 'Meta Ads' }]}
        value={String(s.platform ?? 'tiktok')}
        onChange={(v) => patchSettings(block.id, { platform: v })}
        accent="outliers"
      />
      <input
        value={String(s.query ?? '')}
        onChange={(e) => patchSettings(block.id, { query: e.target.value }, { coalesce: `query:${block.id}` })}
        placeholder="What to search for, e.g. vitamin c serum"
        className={INPUT}
      />
      <Dropdown
        label="Ads to Keep"
        accent="neutral"
        value={String(s.count ?? 5)}
        options={['1', '3', '5', '10', '20']}
        onChange={(v) => patchSettings(block.id, { count: Number(v) })}
      />
      <p className="px-1 text-[11px] leading-relaxed text-ink-500">
        {hasKey
          ? 'Searches with your ScrapeCreators key, one search per run. It costs no kie.ai credits. Only video ads are kept.'
          : 'Outliers searches with a ScrapeCreators key. Add one in Settings before running this block.'}
      </p>
    </div>
  )
}

export function AnalyzerPanel() {
  return (
    <div className="flex flex-col gap-2 px-5 pb-4 pt-4 text-[12px] leading-relaxed text-ink-400">
      <p>Wire in an ad from Outliers or a Bank block set to Swipe File. Each ad is analyzed once, the way the Ad Analyzer does it, and lands in its history.</p>
      <p className="text-ink-500">Transcript goes to Scripts to remix, or to B-Roll to shoot your own version with the same beats. Scene Prompts carries the full recreation as text.</p>
    </div>
  )
}

export function EditPanel({ block, plan, flowName }: { block: FlowBlock; plan: FlowPlan | null; flowName: string }) {
  const packs = (plan?.blocks[block.id]?.instances ?? []).map((i) => i.cached?.pack).filter((p): p is NonNullable<typeof p> => !!p)
  return (
    <div className="flex flex-col gap-3 px-5 pb-4 pt-4">
      <p className="text-[12px] leading-relaxed text-ink-400">
        One folder per ad, laid out for the /video-editor skill: the script, the voiceover and the clips in scene order. Download the pack, then run the skill on each folder.
      </p>
      <pre className="rounded-2xl border border-ink/5 bg-ink/[0.02] px-4 py-3 text-[11px] leading-relaxed text-ink-400">{`ad-01/input/script.txt
ad-01/input/voiceover.mp3
ad-01/input/broll/clip-01.mp4
ad-01/input/music/track.mp3`}</pre>
      <button
        type="button"
        disabled={!packs.length}
        onClick={() => void downloadEditPacks(flowName, packs)}
        className="flex items-center justify-center gap-2 rounded-full border border-[#F77646]/40 bg-[#F77646]/10 px-4 py-3 text-sm font-semibold text-[#F77646] transition-colors hover:bg-[#F77646]/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download className="h-4 w-4" />
        {packs.length ? `Download ${packs.length} ${packs.length === 1 ? 'Pack' : 'Packs'}` : 'Run the Flow to Make Packs'}
      </button>
    </div>
  )
}
