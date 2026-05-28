import { useRef, useCallback, useEffect, useState } from 'react'
import { Upload, Eye } from 'lucide-react'

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const MAX_SIZE_MB = 50

interface UploadViewProps {
  onAnalyze: (files: File[]) => void
}

interface RejectedFile {
  name: string
  reason: string
}

function validate(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Unsupported format'
  if (file.size > MAX_SIZE_MB * 1024 * 1024) return `Larger than ${MAX_SIZE_MB}MB`
  return null
}

export default function UploadView({ onAnalyze }: UploadViewProps) {
  const [dragOver, setDragOver] = useState(false)
  // Panel-scoped drag overlay — visible whenever a file drag enters the
  // Ad Analyzer surface (not the sidebar or app chrome). Tracks a counter
  // so nested dragenter/leave from child elements don't flicker the overlay.
  const [panelDragActive, setPanelDragActive] = useState(false)
  const dragCounterRef = useRef(0)
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleFiles = useCallback((files: File[]) => {
    setRejected([])
    const accepted: File[] = []
    const failed: RejectedFile[] = []
    for (const f of files) {
      const reason = validate(f)
      if (reason) failed.push({ name: f.name, reason })
      else accepted.push(f)
    }
    if (failed.length > 0) setRejected(failed)
    if (accepted.length > 0) onAnalyze(accepted)
  }, [onAnalyze])

  // Panel-scoped drag-drop: listen on the Ad Analyzer panel only so the
  // overlay covers just this surface — not the sidebar or app chrome.
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    function isFileDrag(e: DragEvent): boolean {
      return Array.from(e.dataTransfer?.types ?? []).includes('Files')
    }
    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      dragCounterRef.current += 1
      setPanelDragActive(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      dragCounterRef.current -= 1
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setPanelDragActive(false)
      }
    }
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      dragCounterRef.current = 0
      setPanelDragActive(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) handleFiles(files)
    }
    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [handleFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) handleFiles(files)
  }, [handleFiles])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) handleFiles(files)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div ref={panelRef} className="relative flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <Eye className="h-8 w-8 text-[#FB2B37]/60" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold tracking-tight text-zinc-200">
          Reverse Engineer Any Ad
        </h2>
        <p className="max-w-sm text-sm text-zinc-500">
          Drop in one or more ads and we&apos;ll analyze them with extreme precision so you can reverse-engineer every detail.
        </p>
      </div>

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
          Drag &amp; drop one or more ads, or <span className="text-zinc-200 underline underline-offset-2">browse</span>
        </span>
        <span className="text-[11px] text-zinc-600">MP4, MOV, WebM — max {MAX_SIZE_MB}MB each</span>
        <span className="text-[10px] uppercase tracking-widest text-zinc-700">Up to 5 analyse in parallel · the rest queue</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {rejected.length > 0 && (
        <div className="flex w-full max-w-md flex-col gap-1 rounded-lg border border-[#FB2B37]/20 bg-[#FB2B37]/[0.06] px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#FB2B37]/80">Skipped</p>
          {rejected.map((r) => (
            <p key={r.name} className="truncate text-xs text-[#FB2B37]/90">
              <span className="text-zinc-400">{r.name}</span> — {r.reason}
            </p>
          ))}
        </div>
      )}

      {/* Panel-scoped drag overlay — covers the Ad Analyzer surface only
          (sidebar and app chrome remain visible). */}
      {panelDragActive && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[#FB2B37]/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-[#FB2B37]/50 bg-black/40 px-12 py-10 text-center shadow-2xl">
            <Upload className="h-10 w-10 text-[#FB2B37]" />
            <p className="text-xl font-semibold tracking-tight text-zinc-100">
              Drop your ads here to analyse
            </p>
            <p className="text-sm text-zinc-400">MP4, MOV, WebM — max {MAX_SIZE_MB}MB each</p>
          </div>
        </div>
      )}
    </div>
  )
}
