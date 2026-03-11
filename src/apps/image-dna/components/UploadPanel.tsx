import { useState, useRef, useCallback } from 'react'
import { Upload, Image, X, Dna, Loader2 } from 'lucide-react'

interface UploadPanelProps {
  imageUrl: string | null
  isAnalyzing: boolean
  onAnalyze: (file: File) => void
  onClear: () => void
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export default function UploadPanel({ imageUrl, isAnalyzing, onAnalyze, onClear }: UploadPanelProps) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndUpload = useCallback((file: File) => {
    setError(null)
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Unsupported format. Use JPG, PNG, or WebP.')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('File too large. Maximum size is 10 MB.')
      return
    }
    onAnalyze(file)
  }, [onAnalyze])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndUpload(file)
  }, [validateAndUpload])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) validateAndUpload(file)
    e.target.value = ''
  }

  // Scanning / analyzing state overlay
  if (isAnalyzing && imageUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
        <div className="relative">
          <img
            src={imageUrl}
            alt="Analyzing"
            className="h-64 w-64 rounded-2xl object-cover opacity-60"
          />
          {/* Scanning line animation */}
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            <div className="animate-scan absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-green-400" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-green-400">Extracting Visual DNA</p>
          <p className="mt-1 text-xs text-zinc-600">Gemini is analyzing every pixel...</p>
        </div>
      </div>
    )
  }

  // Image uploaded — preview state
  if (imageUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="relative">
          <img
            src={imageUrl}
            alt="Uploaded"
            className="max-h-[60vh] max-w-full rounded-2xl border border-white/10 object-contain"
          />
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
        >
          <X className="h-3 w-3" />
          Clear & Upload New
        </button>
      </div>
    )
  }

  // Empty state — drop zone
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex w-full max-w-sm cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-12 transition-all ${dragOver
            ? 'border-green-400/40 bg-green-400/5'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
          }`}
      >
        <div className={`rounded-xl p-3 ${dragOver ? 'bg-green-400/10' : 'bg-white/5'}`}>
          {dragOver ? (
            <Dna className="h-8 w-8 text-green-400" strokeWidth={1.5} />
          ) : (
            <Upload className="h-8 w-8 text-zinc-600" strokeWidth={1.5} />
          )}
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-300">
            {dragOver ? 'Drop to analyze' : 'Drop an image here'}
          </p>
          <p className="mt-1 text-xs text-zinc-600">or click to browse</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-700">
          <Image className="h-3 w-3" />
          JPG, PNG, WebP — Max 10 MB
        </div>
      </div>

      {error && (
        <p className="mt-4 text-xs text-red-400">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  )
}
