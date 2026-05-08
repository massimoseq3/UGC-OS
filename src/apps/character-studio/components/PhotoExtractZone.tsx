import { useState, useRef, useCallback } from 'react'
import { Upload, Dna, Check, X } from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'

interface PhotoExtractZoneProps {
  isExtracting: boolean
  extractError: string | null
  thumbnail: string | null
  onPhotoDrop: (file: File) => void
  onReset: () => void
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024

export default function PhotoExtractZone({
  isExtracting,
  extractError,
  thumbnail,
  onPhotoDrop,
  onReset,
}: PhotoExtractZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSubmit = useCallback((file: File) => {
    setValidationError(null)
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setValidationError('Unsupported format. Use JPG, PNG, or WebP.')
      return
    }
    if (file.size > MAX_SIZE) {
      setValidationError('File too large. Maximum size is 10 MB.')
      return
    }
    onPhotoDrop(file)
  }, [onPhotoDrop])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSubmit(file)
  }, [validateAndSubmit])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) validateAndSubmit(file)
    e.target.value = ''
  }

  // Analyzing state
  if (isExtracting) {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-500/[0.04] px-3 py-3">
        <div className="flex items-center gap-3">
          {thumbnail && (
            <img
              src={thumbnail}
              alt="Analyzing"
              className="h-10 w-10 shrink-0 rounded-lg object-cover opacity-70"
            />
          )}
          <div className="min-w-0 flex-1">
            <GenerationProgress
              isActive={true}
              color="bg-green-500"
              messages={['Preparing image...', 'Sending request...', 'Extracting visual DNA...', 'Finalizing analysis...']}
            />
          </div>
        </div>
      </div>
    )
  }

  // Success state — collapsed confirmation
  if (thumbnail && !extractError) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/[0.06] px-3 py-2">
        <img
          src={thumbnail}
          alt="Source"
          className="h-9 w-9 shrink-0 rounded-lg object-cover"
        />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Check className="h-3.5 w-3.5 shrink-0 text-green-400" />
          <span className="truncate text-xs font-medium text-green-300">
            Auto-filled from reference image
          </span>
        </div>
        <button
          onClick={onReset}
          className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
        >
          <X className="h-3 w-3" />
          Reset
        </button>
      </div>
    )
  }

  // Empty / drop zone state
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-3 py-2.5 transition-all ${dragOver
            ? 'border-green-400/40 bg-green-400/5'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
          }`}
      >
        <div className={`shrink-0 rounded-lg p-1.5 ${dragOver ? 'bg-green-400/10' : 'bg-white/5'}`}>
          {dragOver ? (
            <Dna className="h-4 w-4 text-green-400" strokeWidth={1.5} />
          ) : (
            <Upload className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-300">
            {dragOver ? 'Drop to extract DNA' : 'Drop a reference image to auto-fill'}
          </p>
          <p className="truncate text-[10px] text-zinc-600">
            JPG, PNG, WebP — Max 10 MB · or click to browse
          </p>
        </div>
      </div>

      {(validationError || extractError) && (
        <p className="mt-1.5 text-[11px] text-red-400">
          {validationError ?? extractError}
        </p>
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
