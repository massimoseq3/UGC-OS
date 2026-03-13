import { useState, useRef } from 'react'
import type { VisualDNA } from './types'
import { analyzeImage } from './services/analyzeImage'
import UploadPanel from './components/UploadPanel'
import OutputPanel from './components/OutputPanel'

export default function ImageDna() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [dna, setDna] = useState<VisualDNA | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  const handleAnalyze = async (file: File) => {
    // Revoke previous URL
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)

    const url = URL.createObjectURL(file)
    urlRef.current = url
    setImageUrl(url)
    setDna(null)
    setIsAnalyzing(true)
    setError(null)

    try {
      const result = await analyzeImage(file)
      setDna(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image analysis failed. Check your API key and try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleClear = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setImageUrl(null)
    setDna(null)
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left panel — upload / preview */}
      <div className="flex w-full lg:w-1/2 shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-white/5">
        <UploadPanel
          imageUrl={imageUrl}
          isAnalyzing={isAnalyzing}
          onAnalyze={handleAnalyze}
          onClear={handleClear}
          error={error}
        />
      </div>

      {/* Right panel — output */}
      <div className="flex w-full lg:w-1/2 flex-col overflow-hidden min-h-[300px] lg:min-h-0">
        <OutputPanel dna={dna} imageUrl={imageUrl} />
      </div>
    </div>
  )
}
