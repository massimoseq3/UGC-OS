import { useState } from 'react'
import { ChevronRight, UserRound } from 'lucide-react'
import type { CharacterProfile } from '../types'
import { createEmptyProfile } from '../types'
import PresetPickerModal from './PresetPickerModal'

interface LoadPresetDropdownProps {
  onLoadProfile: (profile: CharacterProfile) => void
  // 'rail' is the stacked icon-over-label tile for the controls column's left
  // rail (desktop); 'row' the full-width pill it keeps on a phone.
  variant?: 'row' | 'rail'
}

// Trigger row for the preset browser. (File name kept from the dropdown era so
// call sites stay stable; the picker itself is `PresetPickerModal`.)
export default function LoadPresetDropdown({ onLoadProfile, variant = 'row' }: LoadPresetDropdownProps) {
  const [open, setOpen] = useState(false)

  // Full apply — replace the whole form with the picked recipe.
  const apply = (incoming: Record<string, string>) => {
    const next = createEmptyProfile()
    for (const [key, value] of Object.entries(incoming)) {
      if (key in next && typeof value === 'string') next[key] = value
    }
    onLoadProfile(next)
  }

  return (
    <>
      {/* "Character" is doing the work the word "Full" used to: the scoped
          pickers further down the column ("Physical Presets" / "Scene & Pose
          Presets") load one tab's fields from the same saved recipes, so this
          one has to read as the whole-character load. */}
      {variant === 'rail' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Load every field from a saved preset: physical, scene and pose"
          className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-ink/10 bg-ink/[0.02] px-1 py-2.5 text-center text-[11px] font-medium leading-tight text-ink-300 transition-colors hover:bg-ink/[0.05]"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-influencers-500/10 text-influencers-400">
            <UserRound className="h-4 w-4" strokeWidth={1.5} />
          </span>
          Load Preset
        </button>
      ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Load every field from a saved preset: physical, scene and pose"
        // h-12, the house pill height, and the SAME box the Extract row beside
        // it holds in every state: that row's analyzing and applied faces were
        // always h-12 while both idle rows were py-2 (46px), so auto-filling
        // from a photo left the pair 2px out of step and nudged the whole
        // column below them down.
        className="flex h-12 w-full items-center gap-2.5 rounded-full border border-dashed border-ink/10 bg-ink/[0.02] px-3 text-left transition-colors hover:bg-ink/[0.05]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-influencers-500/10 text-influencers-400">
          <UserRound className="h-4 w-4" strokeWidth={1.5} />
        </span>
        {/* 13px — the B-Roll reference-row title size, so a picker row reads
            the same weight in every app. No hint line: the title says it. */}
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-300">
          {/* Three tiers, not two. The band gained a third control (the prompt
              JSON square), and at 375px the two rows split what's left: "Load
              Preset" no longer fits and truncated to "Load …", which names
              nothing. A label that doesn't fit gets shorter — the tinted person
              circle beside it is what says which row this is. */}
          <span className="sm:hidden">Preset</span>
          <span className="hidden sm:inline lg:hidden">Load Preset</span>
          <span className="hidden lg:inline">Load Character Preset</span>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" strokeWidth={2} />
      </button>
      )}

      {/* Mounted only while open, so each visit starts at the top of the
          library — see `PresetPickerModal`'s own doc. */}
      {open && <PresetPickerModal open onClose={() => setOpen(false)} onPick={apply} />}
    </>
  )
}
