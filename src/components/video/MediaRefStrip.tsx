import { useRef } from 'react'
import { X, Plus, Music, Film } from 'lucide-react'
import { fileToDataUri } from '../../utils/kie'
import { readMediaDuration } from '../../utils/media'

// Upload strip for non-image media references (Seedance 2's reference audio
// and reference video clips). Upload-only — the bank picker doesn't surface
// audio/video rows yet. Values render as labelled chips, not thumbnails.

export interface MediaRefValue {
  dataUri: string
  name: string
  durationSeconds?: number
}

interface MediaRefStripProps {
  label: string
  helper?: string
  kind: 'audio' | 'video'
  values: MediaRefValue[]
  onChange: (next: MediaRefValue[]) => void
  max: number
  // Combined length cap across all clips (kie rejects beyond it server-side;
  // checking here saves the user a failed, billed-nothing round trip).
  maxTotalSeconds?: number
  onLimitError?: (message: string) => void
}

export default function MediaRefStrip({
  label,
  helper,
  kind,
  values,
  onChange,
  max,
  maxTotalSeconds,
  onLimitError,
}: MediaRefStripProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const Icon = kind === 'audio' ? Music : Film

  async function handleFile(file: File | null) {
    if (!file) return
    if (values.length >= max) return
    const dataUri = await fileToDataUri(file)

    let durationSeconds: number | undefined
    try {
      durationSeconds = await readMediaDuration(dataUri, kind)
    } catch {
      // Unreadable metadata — let kie be the judge rather than blocking.
    }
    if (maxTotalSeconds && durationSeconds) {
      const total = values.reduce((s, v) => s + (v.durationSeconds ?? 0), 0) + durationSeconds
      if (total > maxTotalSeconds) {
        onLimitError?.(`Combined ${kind} length can't exceed ${maxTotalSeconds}s — this clip would make it ${Math.ceil(total)}s.`)
        return
      }
    }

    onChange([...values, { dataUri, name: file.name, durationSeconds }])
  }

  return (
    <div>
      <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-ink-500">
        {label}
        <span className="text-ink-700 normal-case"> ({values.length}/{max}){helper ? ` — ${helper}` : ''}</span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {values.map((v, i) => (
          <div
            key={i}
            className="flex h-9 items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.03] pl-3 pr-1.5 text-[12px] text-ink-300"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-ink-500" />
            <span className="max-w-[140px] truncate">{v.name}</span>
            {v.durationSeconds != null && (
              <span className="text-[10px] text-ink-600">{Math.round(v.durationSeconds)}s</span>
            )}
            <button
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/10 hover:text-ink-200"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {values.length < max && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-9 items-center gap-1.5 rounded-full border border-dashed border-ink/15 bg-ink/[0.02] px-3.5 text-[12px] text-ink-500 transition-colors hover:border-ink/25 hover:text-ink-300"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Upload {kind}</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={kind === 'audio' ? 'audio/*' : 'video/*'}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
    </div>
  )
}
