import { useState } from 'react'
import { ChevronRight, UserRound, Sparkles } from 'lucide-react'
import type { CharacterProfile } from '../types'
import { createEmptyProfile, PRESET_MARIE, PRESET_ZANE } from '../types'
import type { Model } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import SlideOver from '../../../components/SlideOver'

// Built-in presets shown alongside the user's saved bank entries.
const BUILTIN_PRESETS: Array<{ id: string; name: string; profile: CharacterProfile }> = [
  { id: 'builtin-marie', name: 'Marie', profile: PRESET_MARIE },
  { id: 'builtin-zane', name: 'Zane', profile: PRESET_ZANE },
]

// Small influencer card — mirrors the Bank's portrait cards (9:16 image with
// a name overlay) but at a compact size so a few fit per row in the slide-over.
function PresetCard({ imageRef, name, onClick }: { imageRef?: string; name: string; onClick: () => void }) {
  const url = useAssetUrl(imageRef)
  return (
    <button
      onClick={onClick}
      className="group relative block aspect-[9/16] w-full overflow-hidden rounded-xl border border-ink/5 bg-ink/[0.03] transition-all hover:border-ink/15 hover:-translate-y-0.5"
    >
      {url ? (
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/[0.04]">
          <Sparkles className="h-6 w-6 text-ink-700" strokeWidth={1.5} />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2 pt-6">
        <span className="block truncate text-[11px] font-semibold tracking-tight text-zinc-100">{name}</span>
      </div>
    </button>
  )
}

function flattenJsonProfile(json: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof json !== 'object' || json === null) return out
  for (const section of Object.values(json as Record<string, unknown>)) {
    if (typeof section === 'object' && section !== null) {
      for (const [key, value] of Object.entries(section as Record<string, unknown>)) {
        if (typeof value === 'string') out[key] = value
      }
    }
  }
  return out
}

interface LoadPresetDropdownProps {
  onLoadProfile: (profile: CharacterProfile) => void
}

// Trigger card + right slide-over for loading a saved influencer recipe.
// (File name kept from the dropdown era so call sites stay stable.)
export default function LoadPresetDropdown({ onLoadProfile }: LoadPresetDropdownProps) {
  const [open, setOpen] = useState(false)
  const bankModels = useBankStore((s) => s.models)

  const apply = (incoming: CharacterProfile | Record<string, string>) => {
    const next = createEmptyProfile()
    for (const [key, value] of Object.entries(incoming)) {
      if (key in next && typeof value === 'string') next[key] = value
    }
    onLoadProfile(next)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.02] px-4 text-left transition-colors hover:bg-ink/[0.05]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-influencers-500/10 text-influencers-400">
          <UserRound className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink-100">Influencer Presets</div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" strokeWidth={2} />
      </button>

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Influencer Presets"
        subtitle="Pick a recipe to fill the form"
      >
        <div className="p-3">
          <div className="px-1 pb-2 pt-0.5 text-[9px] font-semibold uppercase tracking-widest text-ink-500">
            Starters
          </div>
          <div className="grid grid-cols-3 gap-2">
            {BUILTIN_PRESETS.map((p) => (
              <PresetCard key={p.id} name={p.name} onClick={() => apply(p.profile)} />
            ))}
          </div>
          {bankModels.filter((m) => m.jsonProfile).length > 0 && (
            <>
              <div className="px-1 pb-2 pt-4 text-[9px] font-semibold uppercase tracking-widest text-ink-500">
                Bank
              </div>
              <div className="grid grid-cols-3 gap-2">
                {bankModels.filter((m) => m.jsonProfile).map((m: Model) => (
                  <PresetCard
                    key={m.id}
                    imageRef={m.characterImage}
                    name={m.name}
                    onClick={() => m.jsonProfile && apply(flattenJsonProfile(m.jsonProfile))}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </SlideOver>
    </>
  )
}
