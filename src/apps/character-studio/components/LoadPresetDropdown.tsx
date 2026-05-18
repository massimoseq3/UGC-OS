import { useEffect, useRef, useState } from 'react'
import { ChevronDown, UserRound, Sparkles } from 'lucide-react'
import type { CharacterProfile } from '../types'
import { createEmptyProfile, PRESET_MARIE, PRESET_ZANE } from '../types'
import type { Model } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'

// Built-in presets shown alongside the user's saved bank entries.
const BUILTIN_PRESETS: Array<{ id: string; name: string; profile: CharacterProfile }> = [
  { id: 'builtin-marie', name: 'Marie', profile: PRESET_MARIE },
  { id: 'builtin-zane', name: 'Zane', profile: PRESET_ZANE },
]

function ModelThumb({ assetRef }: { assetRef: string }) {
  const url = useAssetUrl(assetRef)
  if (!url) return <div className="h-9 w-9 shrink-0 rounded-md bg-white/5" />
  return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
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

export default function LoadPresetDropdown({ onLoadProfile }: LoadPresetDropdownProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const bankModels = useBankStore((s) => s.models)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const apply = (incoming: CharacterProfile | Record<string, string>) => {
    const next = createEmptyProfile()
    for (const [key, value] of Object.entries(incoming)) {
      if (key in next && typeof value === 'string') next[key] = value
    }
    onLoadProfile(next)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-400">
          <UserRound className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-zinc-100">Character Presets</div>
          <div className="truncate text-[10px] text-zinc-500">Load saved character parameters</div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 min-w-[260px] overflow-hidden rounded-xl border border-white/10 bg-[#0B0B0D] shadow-2xl">
          <div className="max-h-[320px] overflow-y-auto p-1">
            <div className="px-2 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Starters
            </div>
            {BUILTIN_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => apply(p.profile)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.06]"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-500" strokeWidth={1.5} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
            {bankModels.length > 0 && (
              <>
                <div className="mx-2 my-1 h-px bg-white/5" />
                <div className="px-2 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                  Bank
                </div>
                {bankModels.filter((m) => m.jsonProfile).map((m: Model) => (
                  <button
                    key={m.id}
                    onClick={() => m.jsonProfile && apply(flattenJsonProfile(m.jsonProfile))}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.06]"
                  >
                    {m.characterImage ? (
                      <ModelThumb assetRef={m.characterImage} />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5">
                        <Sparkles className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                      </div>
                    )}
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
