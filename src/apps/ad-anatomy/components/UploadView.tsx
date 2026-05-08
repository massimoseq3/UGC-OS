import { useState, useRef, useCallback } from 'react'
import { Upload, Film, X, Clapperboard, Eye } from 'lucide-react'

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const MAX_SIZE_MB = 20

interface UploadViewProps {
  onAnalyze: (file: File) => void
}

export default function UploadView({ onAnalyze }: UploadViewProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSet = useCallback((f: File) => {
    setError(null)
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError('Unsupported format. Use MP4, MOV, or WebM.')
      return
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_SIZE_MB}MB.`)
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) validateAndSet(f)
  }, [validateAndSet])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) validateAndSet(f)
  }

  const clearFile = () => {
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <Eye className="h-8 w-8 text-[#FB2B37]/60" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold tracking-tight text-zinc-200">
          Breakdown a Creative
        </h2>
        <p className="max-w-sm text-sm text-zinc-500">
          Upload a video ad and we'll dissect every frame, hook, and persuasion tactic.
        </p>
      </div>

      {!file ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            className={`flex h-56 w-full max-w-md flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-all duration-200 ${dragOver
              ? 'border-[#FB2B37]/40 bg-[#FB2B37]/5'
              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
              }`}
          >
            <Upload className={`h-6 w-6 transition-colors ${dragOver ? 'text-[#FB2B37]' : 'text-zinc-600'}`} />
            <span className="text-sm text-zinc-400">
              Drag & drop a video or <span className="text-zinc-200 underline underline-offset-2">browse</span>
            </span>
            <span className="text-[11px] text-zinc-600">MP4, MOV, WebM — max {MAX_SIZE_MB}MB</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={handleFileInput}
          />
        </>
      ) : (
        <div className="flex w-full max-w-md flex-col gap-4">
          {/* Video preview */}
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
            <video
              src={preview!}
              className="aspect-video w-full object-contain"
              controls
              muted
            />
            <button
              onClick={clearFile}
              className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-zinc-400 backdrop-blur transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* File info */}
          <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <Film className="h-4 w-4 text-zinc-600" />
              <span className="truncate max-w-[200px] text-sm text-zinc-300">{file.name}</span>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-zinc-600">{formatSize(file.size)}</span>
          </div>

          {/* Analyze button */}
          <button
            onClick={() => onAnalyze(file)}
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-full bg-[#FB2B37] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#FB2B37]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <div className="pointer-events-none absolute inset-0 z-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
            <span className="relative z-10 flex items-center gap-2">
              <Clapperboard className="h-4 w-4" />
              Breakdown Creative
            </span>
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-[#FB2B37]">{error}</p>
      )}
    </div>
  )
}
