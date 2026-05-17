import { useState } from 'react'
import UploadView from './components/UploadView'
import ResultsView from './components/ResultsView'
import { analyzeAd } from './services/analyzeAd'
import type { AnalysisResult } from './types'
import GenerationProgress from '../../components/GenerationProgress'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import { saveAsset, deleteAsset } from '../../utils/assetStore'

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
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        {videoSrc && (
          <div className="max-h-80 max-w-72 overflow-hidden rounded-xl border border-white/10 opacity-40 grayscale">
            <video src={videoSrc} className="h-full w-full object-contain" muted autoPlay loop />
          </div>
        )}
        <GenerationProgress
          isActive={view === 'loading'}
          color="bg-[#FB2B37]"
          messages={['Preparing ad for analysis...', 'Sending request...', 'Dissecting the ad...', 'Compiling results...']}
          className="max-w-sm"
        />
      </div>
    )
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
