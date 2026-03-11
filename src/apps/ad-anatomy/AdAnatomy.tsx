import { useState, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import UploadView from './components/UploadView'
import ResultsView from './components/ResultsView'
import { analyzeAd } from './services/analyzeAd'
import type { AnalysisResult } from './types'

type ViewState = 'upload' | 'loading' | 'results'

export default function AdAnatomy() {
  const [view, setView] = useState<ViewState>('upload')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const videoUrlRef = useRef<string | null>(null)

  const handleAnalyze = async (file: File) => {
    setView('loading')
    setFileName(file.name)
    setError(null)

    // Create a preview URL for the video
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    const url = URL.createObjectURL(file)
    videoUrlRef.current = url
    setVideoSrc(url)

    try {
      const analysis = await analyzeAd(file)
      setResult(analysis)
      setView('results')
    } catch {
      setError('Analysis failed. Please try again.')
      setView('upload')
    }
  }

  const handleReset = () => {
    setResult(null)
    setView('upload')
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current)
      videoUrlRef.current = null
    }
    setVideoSrc(null)
    setFileName('')
    setError(null)
  }

  if (view === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        {/* Greyscale video preview */}
        {videoSrc && (
          <div className="max-h-80 max-w-72 overflow-hidden rounded-xl border border-white/10 opacity-40 grayscale">
            <video src={videoSrc} className="h-full w-full object-contain" muted autoPlay loop />
          </div>
        )}
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-[#FB2B37]" />
          <p className="text-sm font-medium tracking-tight text-zinc-400">
            Gemini is dissecting the ad with brutal precision
          </p>
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FB2B37]/40" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FB2B37]/40" style={{ animationDelay: '200ms' }} />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FB2B37]/40" style={{ animationDelay: '400ms' }} />
          </div>
        </div>
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
