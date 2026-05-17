import { useEffect, useState } from 'react'
import UploadView from './components/UploadView'
import ResultsView from './components/ResultsView'
import { analyzeAd } from './services/analyzeAd'
import type { AnalysisResult } from './types'
import GenerationProgress from '../../components/GenerationProgress'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import { saveAsset, deleteAsset } from '../../utils/assetStore'

// Cycled under the spinner during analysis so the user has something
// interesting to read while the kie task runs. UGC / direct-response /
// short-form video lore — short enough to scan in 4-5 seconds each.
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

type ViewState = 'upload' | 'loading' | 'results'

export default function AdAnatomy() {
  const baseKey = useProjectScopedKey('ad-anatomy')
  // 'loading' is transient — never persist it. If a refresh happens mid-analyze
  // we'd otherwise come back into a fake loading screen that never resolves.
  const [view, setView] = usePersistedState<ViewState>(`${baseKey}:view`, 'upload', {
    sanitize: (v) => (v === 'loading' ? 'upload' : v),
  })
  const [result, setResult] = usePersistedState<AnalysisResult | null>(`${baseKey}:result`, null, {
    // Older persisted results predate the slim 3-section shape. Drop them so
    // we never try to render undefined fields.
    sanitize: (v) => (v && typeof v === 'object' && 'reverseEngineeredPrompt' in v ? v : null),
  })
  const [uploadedRef, setUploadedRef] = usePersistedState<string | null>(`${baseKey}:upload`, null)
  const [fileName, setFileName] = usePersistedState(`${baseKey}:fileName`, '')

  const [error, setError] = useState<string | null>(null)

  // Resolves an asset id (asset-xxxx) back to a fresh blob URL after refresh.
  const videoSrc = useAssetUrl(uploadedRef) ?? null

  const handleAnalyze = async (file: File) => {
    setView('loading')
    setFileName(file.name)
    setError(null)

    // Save the upload to IndexedDB so it survives a refresh. Drop any
    // previous upload to avoid leaking storage.
    if (uploadedRef) {
      deleteAsset(uploadedRef).catch(() => {})
    }
    const ref = await saveAsset(file, file.type)
    setUploadedRef(ref)

    try {
      const analysis = await analyzeAd(file)
      setResult(analysis)
      setView('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Check your API key and try again.')
      setView('upload')
    }
  }

  const handleReset = () => {
    if (uploadedRef) deleteAsset(uploadedRef).catch(() => {})
    setResult(null)
    setView('upload')
    setUploadedRef(null)
    setFileName('')
    setError(null)
  }

  if (view === 'loading') {
    return <AnalyzingView videoSrc={videoSrc} fileName={fileName} />
  }

  if (view === 'results' && result && videoSrc) {
    return (
      <ResultsView
        result={result}
        videoSrc={videoSrc}
        fileName={fileName}
        onReset={handleReset}
      />
    )
  }

  return (
    <>
      <UploadView onAnalyze={handleAnalyze} />
      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-lg bg-[#FB2B37]/15 px-4 py-2 text-sm text-[#FB2B37]">
          {error}
        </div>
      )}
    </>
  )
}

// Analysis-in-progress screen.
//   • Headline above the looping playback so the user knows what's happening.
//   • A red scanning bar sweeps top-to-bottom across the video to convey
//     "AI is reading this frame by frame."
//   • Rotating facts panel instead of a static "couple of minutes" line.
function AnalyzingView({ videoSrc, fileName }: { videoSrc: string | null; fileName: string }) {
  const [factIndex, setFactIndex] = useState(0)
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
        {fileName && (
          <p className="max-w-md truncate text-xs text-zinc-500">{fileName}</p>
        )}
      </div>

      {videoSrc && (
        <div
          className="relative max-h-80 max-w-72 overflow-hidden rounded-xl border border-[#FB2B37]/30 shadow-[0_0_40px_-10px_rgba(251,43,55,0.6)]"
          style={{ aspectRatio: '9 / 16' }}
        >
          <video src={videoSrc} className="h-full w-full object-cover" muted autoPlay loop playsInline />
          {/* Scanning bar — a horizontal red gradient that sweeps top→bottom */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-x-0 h-1/3 -top-1/3 bg-gradient-to-b from-transparent via-[#FB2B37]/50 to-transparent"
              style={{ animation: 'broll-scanner 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
            />
          </div>
          {/* Vignette tint */}
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
        {/* Rotating facts. The min-h prevents layout jump when a fact wraps. */}
        <div className="flex min-h-[60px] w-full items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3">
          <span className="mt-0.5 shrink-0 rounded-full bg-[#FB2B37]/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#FB2B37]/80">
            Did you know
          </span>
          <p key={factIndex} className="animate-fade-in text-[12px] leading-relaxed text-zinc-400">
            {AD_FACTS[factIndex]}
          </p>
        </div>
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
