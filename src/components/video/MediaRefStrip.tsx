import { useRef } from 'react'
import { Music, Film } from 'lucide-react'
import { fileToDataUri } from '../../utils/kie'
import { readMediaDuration } from '../../utils/media'
import { RefSlotPill, RefChip } from './RefSlot'

// Upload slot for non-image media references (Seedance 2's reference audio
// and reference video clips). Upload-only — the bank picker doesn't surface
// audio/video rows yet. Attached clips render as labelled chips.

export interface MediaRefValue {
  dataUri: string
  name: string
  durationSeconds?: number
}

interface MediaRefStripProps {
  label: string
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

  // Fragment, not a block: the parent's attachment row flows the pill and its
  // chips together with the other slots.
  return (
    <>
      <RefSlotPill
        icon={Icon}
        label={label}
        count={values.length}
        max={max}
        disabled={values.length >= max}
        onClick={() => fileInputRef.current?.click()}
      />

      {values.map((v, i) => (
        <RefChip
          key={i}
          icon={Icon}
          label={v.name}
          meta={v.durationSeconds != null ? `${Math.round(v.durationSeconds)}s` : undefined}
          onRemove={() => onChange(values.filter((_, idx) => idx !== i))}
        />
      ))}

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
    </>
  )
}
