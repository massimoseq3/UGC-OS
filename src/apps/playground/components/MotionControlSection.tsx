import { useRef } from 'react'
import { X, Plus, Film } from 'lucide-react'
import VideoInputSlot, { type VideoInputValue } from '../../../components/video/VideoInputSlot'
import { fileToDataUri } from '../../../utils/kie'
import { readMediaDuration } from '../../../utils/media'
import type { BankType } from '../../../utils/constants'
import type { BRoll } from '../../../stores/types'
import type { PromptRef } from './PromptPanel'

// Kling Motion Control's inputs: a reference character image (the look) and a
// driving video (the motion), plus an orientation choice. Mirrors the shape of
// OmniInputsSection — it owns the refs[] slots it cares about ('motion-image',
// 'motion-video') and the parent threads the orientation through state.

// The character image leads with Influencers (the headline use case: animate an
// AI influencer), then B-Roll stills, then Products.
const MOTION_IMAGE_TABS: Array<{ type: BankType; filter?: (item: BRoll | unknown) => boolean }> = [
  { type: 'models' },
  { type: 'brolls', filter: (item) => !!(item as BRoll).imageUrl },
  { type: 'products' },
]

// kie caps the driving clip at 30s for 'video' orientation, 10s for 'image'.
// We validate against the generous bound and let kie reject the narrower case.
const MAX_DRIVING_SECONDS = 30

interface MotionControlSectionProps {
  refs: PromptRef[]
  onChangeRefs: (next: PromptRef[]) => void
  orientation: 'image' | 'video'
  onChangeOrientation: (next: 'image' | 'video') => void
  onError: (message: string) => void
}

export default function MotionControlSection({
  refs,
  onChangeRefs,
  orientation,
  onChangeOrientation,
  onError,
}: MotionControlSectionProps) {
  const videoInputRef = useRef<HTMLInputElement>(null)

  const imageRef = refs.find((r) => r.slot === 'motion-image')
  const videoRef = refs.find((r) => r.slot === 'motion-video')

  function setImage(value: VideoInputValue | null) {
    const others = refs.filter((r) => r.slot !== 'motion-image')
    if (!value) {
      onChangeRefs(others)
      return
    }
    onChangeRefs([...others, { url: value.dataUri, label: 'character', source: 'upload', slot: 'motion-image' }])
  }

  async function handleVideoFile(file: File | null) {
    if (!file) return
    const dataUri = await fileToDataUri(file)
    let durationSeconds: number | undefined
    try {
      durationSeconds = await readMediaDuration(dataUri, 'video')
    } catch {
      // Unreadable metadata — let kie validate length server-side.
    }
    if (durationSeconds && durationSeconds > MAX_DRIVING_SECONDS) {
      onError(`The driving video can't exceed ${MAX_DRIVING_SECONDS}s — this one is ${Math.ceil(durationSeconds)}s.`)
      return
    }
    onChangeRefs([
      ...refs.filter((r) => r.slot !== 'motion-video'),
      { url: dataUri, label: file.name, source: 'upload', slot: 'motion-video', durationSeconds },
    ])
  }

  return (
    <div className="space-y-4">
      {/* Character image */}
      <div>
        <VideoInputSlot
          label="Character image"
          helper="— the look to animate"
          value={imageRef ? { dataUri: imageRef.url } : null}
          onChange={setImage}
          bankType="models"
          tabs={MOTION_IMAGE_TABS}
        />
      </div>

      {/* Driving video */}
      <div>
        <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-ink-500">
          Driving video
          <span className="text-ink-700 normal-case"> — the motion to copy</span>
        </label>
        {videoRef ? (
          <div className="flex h-9 items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.03] pl-3 pr-1.5 text-[12px] text-ink-300">
            <Film className="h-3.5 w-3.5 shrink-0 text-ink-500" />
            <span className="max-w-[180px] truncate">{videoRef.label}</span>
            {videoRef.durationSeconds != null && (
              <span className="text-[10px] text-ink-600">{Math.round(videoRef.durationSeconds)}s</span>
            )}
            <button
              onClick={() => onChangeRefs(refs.filter((r) => r.slot !== 'motion-video'))}
              className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/10 hover:text-ink-200"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => videoInputRef.current?.click()}
            className="flex h-9 items-center gap-1.5 rounded-full border border-dashed border-ink/15 bg-ink/[0.02] px-3.5 text-[12px] text-ink-500 transition-colors hover:border-ink/25 hover:text-ink-300"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Upload video</span>
          </button>
        )}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            void handleVideoFile(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
      </div>

      {/* Orientation */}
      <div>
        <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-ink-500">
          Orientation
        </label>
        <div className="inline-flex rounded-full border border-ink/10 bg-ink/[0.02] p-0.5">
          <button
            type="button"
            onClick={() => onChangeOrientation('video')}
            className={`rounded-full px-4 py-1.5 text-[12px] transition-colors ${
              orientation === 'video'
                ? 'bg-playground-500/15 text-playground-200'
                : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            Follow video
          </button>
          <button
            type="button"
            onClick={() => onChangeOrientation('image')}
            className={`rounded-full px-4 py-1.5 text-[12px] transition-colors ${
              orientation === 'image'
                ? 'bg-playground-500/15 text-playground-200'
                : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            Match photo
          </button>
        </div>
        <p className="mt-2 text-[11px] text-ink-600">
          {orientation === 'video'
            ? 'Character faces the same way as the driving video (clip up to 30s).'
            : 'Character keeps the orientation of the reference photo (clip up to 10s).'}
        </p>
      </div>
    </div>
  )
}
