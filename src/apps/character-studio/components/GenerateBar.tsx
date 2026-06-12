import { UserRound } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settingsStore'
import ModelPicker from '../../../components/ModelPicker'
import ConstraintChip from '../../../components/ConstraintChip'
import AspectIcon from '../../../components/AspectIcon'
import ClearAllButton from '../../../components/ClearAllButton'
import { estimateCredits, formatCredits, getDefaultModel, getModel, type ImageResolution } from '../../../utils/models'

interface GenerateBarProps {
  error: string | null
  onGenerate: () => void
  canGenerate: boolean
  aspectRatio: string
  onAspectRatioChange: (value: string) => void
  resolution: ImageResolution
  onResolutionChange: (value: ImageResolution) => void
  inFlightCount: number
  // Clear All — tucked tight under the Generate button.
  onClear: () => void
}

// Aspect options offered by the dropdown. Stored values may be legacy verbose
// strings ('Portrait (9:16)') or raw ratios — normalizeAspect() collapses both
// to a raw ratio so the chip highlights the right option.
const ASPECT_OPTIONS = ['9:16', '16:9', '1:1']
function normalizeAspect(ar: string): string {
  if (ar.includes('16:9')) return '16:9'
  if (ar.includes('1:1')) return '1:1'
  return '9:16'
}

// The action footer for the Influencers form: the model picker + resolution/
// aspect chips, the Generate button, and a tight Clear All. Lives at the foot
// of the left (controls) column so every input and the action sit together.
export default function GenerateBar({
  error,
  onGenerate,
  canGenerate,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  inFlightCount,
  onClear,
}: GenerateBarProps) {
  const persistedModel = useSettingsStore((s) => s.getAppModel('character-studio:image:text-to-image'))
  const selectedModelId = persistedModel ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
  const creditsLabel = formatCredits(estimateCredits(selectedModelId ?? '', { imageCount: 1, resolution }))

  return (
    <div className="sticky bottom-0 z-10 min-w-0 space-y-2 border-t border-ink/5 bg-surface-0/95 p-3 backdrop-blur-xl md:static md:bg-transparent md:backdrop-blur-none">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <p className="text-xs leading-relaxed text-red-300 light:text-red-700">{error}</p>
        </div>
      )}
      {/* Model picker + aspect/resolution chips share one row so the
          controls stay compact. Resolution options show their credit cost. */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ModelPicker
            appId="character-studio"
            task="image"
            mode="text-to-image"
            costParams={{ imageCount: 1, resolution }}
            large
          />
        </div>
        <ConstraintChip
          align="right"
          size="lg"
          options={getModel(selectedModelId ?? '')?.imageConstraints?.resolutions ?? ['1K', '2K', '4K']}
          value={resolution}
          onChange={(v) => onResolutionChange(v as ImageResolution)}
          renderOption={(v) => {
            const credits = formatCredits(estimateCredits(selectedModelId ?? '', { imageCount: 1, resolution: v as ImageResolution }))
            return (
              <span className="flex w-full items-center justify-between gap-6">
                <span>{v}</span>
                {credits && <span className="text-ink-500">{credits}</span>}
              </span>
            )
          }}
        />
        <ConstraintChip
          align="right"
          size="lg"
          options={ASPECT_OPTIONS}
          value={normalizeAspect(aspectRatio)}
          onChange={onAspectRatioChange}
          render={(v) => (
            <span className="flex items-center gap-1.5">
              <AspectIcon ratio={v} />
              <span>{v}</span>
            </span>
          )}
        />
      </div>
      <button
        onClick={onGenerate}
        disabled={!canGenerate}
        className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-influencers-500 px-6 py-3.5 text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-influencers-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <UserRound className="h-4 w-4" strokeWidth={2.5} />
        <span>
          Generate Influencer{creditsLabel ? ` (${creditsLabel})` : ''}
          {inFlightCount > 0 && ` · ${inFlightCount} running`}
        </span>
      </button>

      {/* Clear All — tucked tight under the Generate button, bottom-left. */}
      <div className="!mt-1 px-1">
        <ClearAllButton onClear={onClear} />
      </div>
    </div>
  )
}
