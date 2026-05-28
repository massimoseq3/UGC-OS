import { useEffect, useState } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import UploadView from './components/UploadView'
import ResultsView from './components/ResultsView'
import HistoryRail from './components/HistoryRail'
import type { AnalysisResult } from './types'
import type { AdAnatomyHistoryItem } from '../../stores/types'
import GenerationProgress from '../../components/GenerationProgress'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import { saveAsset } from '../../utils/assetStore'
import { enqueueAnalysis } from './services/analysisQueue'
import { useBankStore } from '../../stores/bankStore'

// Cycled under the spinner during analysis so the user has something
// interesting to read while the kie task runs.
const AD_FACTS = [
  'The first 1.5 seconds of a UGC ad decide whether a viewer scrolls or stays.',
  'Ads filmed on a real iPhone front camera outperform DSLR-shot ads on TikTok 3× as often.',
  '40% of top-performing UGC ads start with a face directly in the camera lens.',
  'Vertical 9:16 ads command roughly 90% more attention on social than horizontal cuts.',
  'A handheld micro-jitter signals "real person" to the brain faster than any caption.',
  'The hook line of a high-converting ad averages 7 words.',
  'Best-in-class UGC ads name the product after the third spoken line — never earlier.',
  'Showing the after-state before the product itself is the single biggest hook trick.',
  'Most viral ads use one continuous take. No cuts. The cut is the kill switch.',
  'Captions raise watch-through by ~80% even when audio is on.',
  'Eye contact with the lens for >2 seconds doubles a viewer\'s recall of the brand.',
  '"Pattern interrupts" (sudden zoom, on-screen text, prop reveal) every 3-5 seconds keep retention high.',
  'A genuine half-smile outperforms a full smile in trust scores by ~30%.',
  'CTAs that name a feeling ("get your glow back") beat feature-CTAs ("32mg of vitamin C") by 2.5×.',
  'Ad fatigue sets in around 7 days for any single creative — refresh weekly.',
]
const FACT_ROTATE_MS = 5000

export default function AdAnatomy() {
  const baseKey = useProjectScopedKey('ad-anatomy')
  const [selectedId, setSelectedId] = usePersistedState<string | null>(`${baseKey}:selectedId`, null)

  const adAnatomyHistory = useBankStore((s) => s.adAnatomyHistory)
  const addAdAnatomyHistory = useBankStore((s) => s.addAdAnatomyHistory)
  const updateAdAnatomyHistory = useBankStore((s) => s.updateAdAnatomyHistory)
  const deleteAdAnatomyHistory = useBankStore((s) => s.deleteAdAnatomyHistory)

  // Mount-time reconciler: flip any row stuck in 'analyzing' (e.g. left over
  // from a refresh) to 'error'. Chat completions can't resume.
  useEffect(() => {
    const stuck = useBankStore.getState().adAnatomyHistory.filter((h) => h.status === 'analyzing')
    for (const item of stuck) {
      void updateAdAnatomyHistory(item.id, {
        status: 'error',
        errorMessage: 'Analysis was interrupted. Re-upload to retry.',
        uploadedRef: undefined,
      })
    }
    // Only run once on mount; we deliberately don't want this firing on later
    // status flips back to 'analyzing' from genuine new uploads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAnalyze = async (files: File[]) => {
    let firstId: string | null = null
    for (const file of files) {
      try {
        const uploadedRef = await saveAsset(file, file.type)
        const id = crypto.randomUUID()
        const item: AdAnatomyHistoryItem = {
          id,
          createdAt: Date.now(),
          status: 'analyzing',
          adTitle: '',
          fileName: file.name,
          mediaKind: file.type.startsWith('image/') ? 'image' : 'video',
          uploadedRef,
        }
        await addAdAnatomyHistory(item)
        enqueueAnalysis(id, file)
        if (firstId === null) firstId = id
      } catch (e) {
        console.warn('[ad-anatomy] failed to enqueue analysis for', file.name, e)
      }
    }
    if (firstId) setSelectedId(firstId)
  }

  const handleDelete = (id: string) => {
    void deleteAdAnatomyHistory(id)
    if (selectedId === id) setSelectedId(null)
  }

  const selected = selectedId
    ? adAnatomyHistory.find((h) => h.id === selectedId) ?? null
    : null

  return (
    <div className="flex h-full overflow-hidden">
      <HistoryRail
        items={adAnatomyHistory}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={() => setSelectedId(null)}
        onDelete={handleDelete}
      />
      <div className="flex-1 min-w-0">
        {!selected ? (
          <UploadView onAnalyze={handleAnalyze} />
        ) : selected.status === 'analyzing' ? (
          <AnalyzingPane item={selected} />
        ) : selected.status === 'error' ? (
          <ErrorPane item={selected} onRetry={() => setSelectedId(null)} />
        ) : (
          <CompletePane item={selected} onReset={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  )
}

// ── Pane: completed analysis ────────────────────────────────────────
function CompletePane({ item, onReset }: { item: AdAnatomyHistoryItem; onReset: () => void }) {
  const result = item.result as AnalysisResult | null
  const thumbUrl = useAssetUrl(item.thumbnailRef ?? null) ?? null
  if (!result) {
    return (
      <ErrorPane
        item={{ ...item, status: 'error', errorMessage: 'Result missing — please re-analyse.' }}
        onRetry={onReset}
      />
    )
  }
  return (
    <ResultsView
      result={result}
      videoSrc={null}
      restoredThumbUrl={thumbUrl}
      fileName={item.fileName}
      onReset={onReset}
    />
  )
}

// ── Pane: analysis in progress ──────────────────────────────────────
function AnalyzingPane({ item }: { item: AdAnatomyHistoryItem }) {
  const [factIndex, setFactIndex] = useState(0)
  // Prefer the live source asset (gives us a playing preview) over the
  // stamped thumbnail. Falls back to thumbnail once source is cleaned up.
  const sourceUrl = useAssetUrl(item.uploadedRef ?? null)
  const thumbUrl = useAssetUrl(item.thumbnailRef ?? null)
  useEffect(() => {
    const id = setInterval(() => setFactIndex((i) => (i + 1) % AD_FACTS.length), FACT_ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
          Analysing your ad
        </h2>
        {item.fileName && (
          <p className="max-w-md truncate text-xs text-zinc-500">{item.fileName}</p>
        )}
      </div>

      {(sourceUrl || thumbUrl) && (
        <div
          className="relative max-h-80 max-w-72 overflow-hidden rounded-xl border border-[#FB2B37]/30 shadow-[0_0_40px_-10px_rgba(251,43,55,0.6)]"
          style={{ aspectRatio: '9 / 16' }}
        >
          {sourceUrl ? (
            <video src={sourceUrl} className="h-full w-full object-cover" muted autoPlay loop playsInline />
          ) : (
            <img src={thumbUrl!} alt="" className="h-full w-full object-cover" />
          )}
          {/* Scanning bar */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-x-0 h-1/3 -top-1/3 bg-gradient-to-b from-transparent via-[#FB2B37]/50 to-transparent"
              style={{ animation: 'broll-scanner 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#FB2B37]/20" />
        </div>
      )}

      <div className="flex w-full max-w-md flex-col items-center gap-3">
        <GenerationProgress
          isActive
          color="bg-[#FB2B37]"
          messages={['Preparing ad for analysis...', 'Sending request...', 'Dissecting the ad...', 'Compiling results...']}
          showHelper={false}
          className="w-full"
        />
        <div className="flex min-h-[60px] w-full items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3">
          <span className="mt-0.5 shrink-0 rounded-full bg-[#FB2B37]/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#FB2B37]/80">
            Did you know
          </span>
          <p key={factIndex} className="animate-fade-in text-[12px] leading-relaxed text-zinc-400">
            {AD_FACTS[factIndex]}
          </p>
        </div>
        <p className="text-[11px] text-zinc-600">Feel free to upload more ads or jump to another tool — this keeps running in the background.</p>
      </div>

      <style>{`
        @keyframes broll-scanner {
          0% { transform: translateY(0); }
          50% { transform: translateY(300%); }
          100% { transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 280ms ease-out;
        }
      `}</style>
    </div>
  )
}

// ── Pane: error ─────────────────────────────────────────────────────
function ErrorPane({ item, onRetry }: { item: AdAnatomyHistoryItem; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
      <AlertCircle className="h-10 w-10 text-[#FB2B37]/70" strokeWidth={1.5} />
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Analysis failed</h2>
        <p className="max-w-md text-xs text-zinc-500">{item.fileName}</p>
      </div>
      <div className="max-w-md rounded-xl border border-[#FB2B37]/20 bg-[#FB2B37]/[0.06] px-4 py-3 text-center">
        <p className="text-sm text-zinc-300">{item.errorMessage || 'Something went wrong.'}</p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 rounded-full border border-[#FB2B37]/20 bg-[#FB2B37]/10 px-4 py-2 text-sm font-medium text-[#FB2B37] transition-colors hover:bg-[#FB2B37]/20"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Re-upload to retry
      </button>
    </div>
  )
}
