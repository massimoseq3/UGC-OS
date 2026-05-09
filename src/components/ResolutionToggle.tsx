import { estimateCredits, formatCredits, getModel, type ImageResolution } from '../utils/models'

interface ResolutionToggleProps {
  modelId: string | undefined
  value: ImageResolution
  onChange: (next: ImageResolution) => void
}

// Inline pill-toggle showing the selected image model's supported resolution
// tiers (1K / 2K / 4K) with the credit cost inline. Visually matches the
// AspectRatioToggle pill so the image-settings toolbar reads as one row.
// Renders even for single-tier models so users always see what they're paying.
export default function ResolutionToggle({ modelId, value, onChange }: ResolutionToggleProps) {
  const model = modelId ? getModel(modelId) : undefined
  const tiers = (model?.imageConstraints?.resolutions ?? []) as ImageResolution[]

  if (tiers.length === 0) return null

  return (
    <div className="flex w-full items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
      {tiers.map((tier) => {
        const credits = formatCredits(estimateCredits(modelId ?? '', { imageCount: 1, resolution: tier }))
        const active = tier === value
        return (
          <button
            key={tier}
            onClick={() => onChange(tier)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              active ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span>{tier}</span>
            {credits && (
              <span className={`tabular-nums ${active ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {credits}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
