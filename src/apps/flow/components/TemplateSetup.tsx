// Template Setup: what a template needs from you before it can run — your
// product, your character, anything else the author left as a field — checked
// against your kie.ai key and balance, with the price, and then Run or Open
// Canvas. Run stays grey, with the reason, until every field is filled.

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronRight, Upload } from 'lucide-react'
import Modal from '../../../components/Modal'
import BankPicker from '../../../components/BankPicker'
import Spinner from '../../../components/Spinner'
import AutoGrowTextarea from '../../../components/AutoGrowTextarea'
import { useBankStore } from '../../../stores/bankStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useCreditsStore } from '../../../stores/creditsStore'
import { useAppStore } from '../../../stores/appStore'
import { humanizeError } from '../../../utils/friendlyError'
import { saveAsset } from '../../../utils/assetStore'
import { BANK_CONFIG } from '../../../utils/constants'
import { useAssetThumb } from '../../../hooks/useAssetUrl'
import { bankRowValue } from '../engine/held'
import { planFlow } from '../engine/plan'
import { PLAN_DEPS, startRun } from '../run/runtime'
import { useFlowStore } from '../store/flowStore'
import { withSlots } from '../store/blocks'
import { creditsLabel } from '../hooks/useFlowPlan'
import { instantiate, type LoadedTemplate, type TemplateField } from '../templates/io'
import { loadGalleryTemplate, type GalleryEntry } from '../templates/gallery'
import type { FlowGraph } from '../types'

export type SetupSource = { kind: 'gallery'; entry: GalleryEntry } | { kind: 'file'; template: LoadedTemplate }

interface Pick { pick?: string; text?: string; ref?: string }

export default function TemplateSetup({ source, onClose }: { source: SetupSource; onClose: () => void }) {
  const [loaded, setLoaded] = useState<LoadedTemplate | null>(source.kind === 'file' ? source.template : null)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [busy, setBusy] = useState(false)
  const hasKey = useSettingsStore((s) => !!s.kieApiKey)
  const balance = useCreditsStore((s) => s.balance)
  const refreshBalance = useCreditsStore((s) => s.refresh)
  const banks = useBankStore((s) => s)
  const createFlow = useFlowStore((s) => s.createFlow)
  const openFlow = useFlowStore((s) => s.openFlow)
  const addToast = useAppStore((s) => s.addToast)

  useEffect(() => {
    void refreshBalance()
  }, [refreshBalance])

  useEffect(() => {
    if (source.kind !== 'gallery') return
    let live = true
    loadGalleryTemplate(source.entry.slug).then(
      (t) => { if (live) setLoaded(t) },
      (err) => { if (live) setError(humanizeError(err, 'That template could not be loaded.')) },
    )
    return () => { live = false }
  }, [source])

  const file = loaded?.file
  const fields = file?.fields ?? []
  const missing = fields.filter((f) => f.required && !filled(f, picks[f.blockId]))

  // The price, planned on the template as it would run with these picks —
  // typed text and uploads included, or a field that feeds a required input
  // would leave everything after it out of the price.
  const preview: FlowGraph | null = file
    ? {
        blocks: file.blocks.map((b) => withSlots({
          ...b,
          pick: picks[b.id]?.pick ?? b.pick,
          settings: {
            ...b.settings,
            ...(b.kind === 'image' && typeof b.settings.asset === 'string' ? { ref: `embedded:${b.settings.asset}` } : {}),
            ...(b.kind === 'image' && picks[b.id]?.ref ? { ref: picks[b.id].ref } : {}),
            ...(b.kind === 'text' && picks[b.id]?.text !== undefined ? { text: picks[b.id].text } : {}),
          },
        })),
        wires: file.wires,
      }
    : null
  const plan = preview && banks ? planFlow(preview, {}, PLAN_DEPS) : null
  const credits = plan?.creditsAll ?? file?.estimate ?? 0
  const short = balance !== null && credits > balance

  const reason = !hasKey ? 'Add your kie.ai API key in Settings first'
    : missing.length ? `Pick ${missing[0].title}`
    : short ? `Needs ${creditsLabel(credits)}, your balance is ${Math.floor(balance!).toLocaleString('en-US')}`
    : null

  const create = async (): Promise<string | null> => {
    if (!loaded) return null
    setBusy(true)
    let id: string | null = null
    try {
      const graph = await instantiate(loaded, picks)
      id = createFlow({ name: loaded.file.name, graph, template: loaded.file.template })
    } catch (err) {
      addToast(humanizeError(err, 'That template could not be set up.'), 'error')
    }
    setBusy(false)
    return id
  }

  const openCanvas = async () => {
    const id = await create()
    if (!id) return
    openFlow(id)
    onClose()
  }

  const run = async () => {
    if (reason) return
    const id = await create()
    if (!id) return
    openFlow(id)
    onClose()
    const started = startRun(id)
    if (!started.ok) addToast(started.reason, 'error')
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={file?.name ?? (source.kind === 'gallery' ? source.entry.name : 'Import Flow')}
      subtitle={file?.description}
      size="medium"
      // Under the pickers it opens: BankPicker paints above it.
      layer="below-pickers"
      footer={
        <div className="flex flex-col gap-2">
          {reason && file && (
            <p className="flex items-center gap-1.5 text-[12px] text-amber-400/90"><AlertCircle className="h-3.5 w-3.5" />{reason}.</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => void openCanvas()} disabled={!file || busy} className="rounded-full border border-ink/10 px-4 py-2.5 text-sm text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100 disabled:opacity-40">
              Open Canvas
            </button>
            <button
              type="button"
              onClick={() => void run()}
              disabled={!file || busy || !!reason}
              className="glass-fill glass-fill-soft flex items-center gap-2 rounded-full border border-white/15 bg-flow-500 px-5 py-2.5 text-sm font-semibold text-white btn-soft-shadow transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
            >
              {busy && <Spinner className="h-3.5 w-3.5" />}
              Run · {creditsLabel(credits, plan?.unpriced)}
            </button>
          </div>
        </div>
      }
    >
      {!file ? (
        <div className="flex h-40 items-center justify-center text-ink-500">{error ? <p className="text-sm text-red-400">{error}</p> : <Spinner className="h-5 w-5" />}</div>
      ) : (
        <div className="flex flex-col gap-5 p-5">
          {fields.length > 0 && (
            <section className="flex flex-col gap-3">
              {fields.map((f) => (
                <FieldInput
                  key={f.blockId}
                  field={f}
                  text={file.blocks.find((b) => b.id === f.blockId)?.settings.text}
                  value={picks[f.blockId]}
                  onChange={(p) => setPicks((cur) => ({ ...cur, [f.blockId]: p }))}
                />
              ))}
            </section>
          )}
          {(file.notes?.length ?? 0) > 0 && (
            <section className="rounded-2xl border border-[#E8C872]/20 bg-[#E8C872]/5 px-4 py-3 text-[12.5px] leading-relaxed text-[#E8C872]/90">
              {file.notes!.map((n, i) => <p key={i}>{n}</p>)}
            </section>
          )}
          {loaded.changes.length > 0 && (
            <section className="flex flex-col gap-1 text-[12px] text-ink-500">
              {loaded.changes.map((c, i) => <p key={i}>{c}</p>)}
            </section>
          )}
          <section className="flex flex-col gap-1 rounded-2xl border border-ink/5 bg-ink/[0.02] px-4 py-3 text-[12.5px]">
            <div className="flex justify-between"><span className="text-ink-400">One full run</span><span className="tabular-nums text-ink-100">{creditsLabel(credits, plan?.unpriced)}</span></div>
            {balance !== null && <div className="flex justify-between"><span className="text-ink-500">Your balance</span><span className={`tabular-nums ${short ? 'text-red-400' : 'text-ink-400'}`}>{Math.floor(balance).toLocaleString('en-US')} credits</span></div>}
            <p className="pt-1 text-[11px] text-ink-500">Runs while UGC OS is open. Open Canvas to change anything first.</p>
          </section>
        </div>
      )}
    </Modal>
  )
}

function filled(f: TemplateField, p: Pick | undefined): boolean {
  if (f.kind === 'text') return !!p?.text?.trim() || (!f.required)
  if (f.kind === 'image') return !!p?.ref
  return !!p?.pick
}

// `text` is a Text field's block as the template has it: the field's example
// is cut short for display, so editing from it would replace the whole text
// with its opening.
function FieldInput({ field, text, value, onChange }: { field: TemplateField; text: unknown; value: Pick | undefined; onChange: (p: Pick) => void }) {
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const thumb = useAssetThumb(value?.ref)
  const bank = typeof field.kind === 'object' ? field.kind.bank : null
  const rows = useBankStore((s) => (bank ? s[bank] : null))
  const picked = bank && value?.pick && rows ? bankRowValue(bank, value.pick) : null

  if (field.kind === 'text') {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink-200">{field.title}</span>
        <AutoGrowTextarea
          value={value?.text ?? (typeof text === 'string' ? text : field.example ?? '')}
          onChange={(e) => onChange({ text: e.target.value })}
          className="w-full resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-[13px] text-ink-100 outline-none focus:border-ink/20"
          rows={3}
        />
      </div>
    )
  }
  if (field.kind === 'image') {
    return (
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[12.5px] font-medium text-ink-200">{field.title}</span>
        {thumb.url && <img src={thumb.url} alt="" className="h-10 w-10 rounded-xl object-cover" />}
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-2 text-xs text-ink-300 hover:border-ink/20 hover:text-ink-100">
          <Upload className="h-3.5 w-3.5" />{value?.ref ? 'Replace' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onChange({ ref: await saveAsset(f, f.type) })
        }} />
      </div>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-[58px] w-full items-center gap-3 rounded-2xl border px-4 text-left transition-colors ${picked ? 'border-ink/10 bg-ink/[0.03]' : 'border-dashed border-flow-500/40 bg-flow-500/[0.04]'} hover:border-ink/25`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-ink-200">{field.title}</span>
          <span className="block truncate text-[11.5px] text-ink-500">
            {picked ? picked.label : `Choose from ${BANK_CONFIG[bank!].label}${field.example ? ` · ${field.example} was the example` : ''}`}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-ink-500" />
      </button>
      {bank === 'swipes' ? (
        <SwipeChooser open={open} onClose={() => setOpen(false)} onPick={(id) => { onChange({ pick: id }); setOpen(false) }} />
      ) : (
        <BankPicker bankType={bank!} isOpen={open} onClose={() => setOpen(false)} onSelect={(item) => { onChange({ pick: item.id }); setOpen(false) }} />
      )}
    </>
  )
}

function SwipeChooser({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const swipes = useBankStore((s) => s.swipes)
  return (
    <Modal open={open} onClose={onClose} title="Choose a Saved Ad" size="medium" fill>
      <div className="flex flex-col gap-1 p-3">
        {swipes.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-500">Save ads from Outliers and they land here.</p>}
        {swipes.map((s) => (
          <button key={s.id} type="button" onClick={() => onPick(s.id)} className="rounded-2xl px-3 py-2.5 text-left text-[12.5px] text-ink-100 hover:bg-ink/[0.05]">
            <span className="line-clamp-2">{s.caption || `@${s.authorHandle}`}</span>
            <span className="block text-[11px] capitalize text-ink-500">{s.platform} · @{s.authorHandle}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
