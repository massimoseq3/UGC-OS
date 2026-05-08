import { useState } from 'react'
import { FolderOpen, Sparkles, Save, Check } from 'lucide-react'
import type { CharacterProfile } from '../types'
import { PRESET_MARIE, PRESET_ZANE, createEmptyProfile } from '../types'
import type { Model } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import { buildJsonPrompt } from '../services/generateCharacter'
import BankPicker from '../../../components/BankPicker'

interface SideRailActionsProps {
  profile: CharacterProfile
  onProfileChange: (profile: CharacterProfile) => void
}

const ROW_BASE = 'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors lg:mx-2 lg:gap-2.5'
const ROW_INACTIVE = 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'

export default function SideRailActions({ profile, onProfileChange }: SideRailActionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)

  const addModel = useBankStore((s) => s.addModel)

  const handleLoadFromBank = (item: Model) => {
    if (!item.jsonProfile) return
    const newProfile = createEmptyProfile()
    for (const section of Object.values(item.jsonProfile)) {
      if (typeof section === 'object' && section !== null) {
        for (const [key, value] of Object.entries(section as Record<string, string>)) {
          if (key in newProfile) newProfile[key] = value
        }
      }
    }
    onProfileChange(newProfile)
  }

  const commitSave = () => {
    if (!saveName.trim()) return
    addModel({
      name: saveName.trim(),
      characterImage: '',
      notes: '',
      source: 'character-studio',
      jsonProfile: buildJsonPrompt(profile) as Record<string, unknown>,
    })
    setShowSaveForm(false)
    setSaveName('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      {/* Section divider between tabs and presets */}
      <div className="my-3 hidden mx-3 h-px bg-white/5 lg:block" />
      <div className="mx-1 w-px shrink-0 self-stretch bg-white/5 lg:hidden" />

      {/* Presets section */}
      <span className="mb-3 hidden px-4 text-[11px] font-medium uppercase tracking-widest text-zinc-600 lg:block">
        Presets
      </span>

      <button
        onClick={() => onProfileChange({ ...PRESET_MARIE })}
        className={`${ROW_BASE} ${ROW_INACTIVE}`}
      >
        <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 truncate tracking-tight">Marie</span>
      </button>
      <button
        onClick={() => onProfileChange({ ...PRESET_ZANE })}
        className={`${ROW_BASE} ${ROW_INACTIVE}`}
      >
        <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 truncate tracking-tight">Zane</span>
      </button>

      {/* Divider between presets and bank actions */}
      <div className="my-2 hidden mx-3 h-px bg-white/5 lg:block" />
      <div className="mx-1 w-px shrink-0 self-stretch bg-white/5 lg:hidden" />

      <button
        onClick={() => setPickerOpen(true)}
        className={`${ROW_BASE} ${ROW_INACTIVE}`}
      >
        <FolderOpen className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 truncate tracking-tight">Load from Bank</span>
      </button>

      {showSaveForm ? (
        <div className="flex shrink-0 flex-col gap-1 px-2 py-1 lg:mx-2 lg:px-1">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSave()
              if (e.key === 'Escape') { setShowSaveForm(false); setSaveName('') }
            }}
            autoFocus
            placeholder="Preset name…"
            className="w-full rounded-md border border-white/10 bg-transparent px-2 py-1.5 text-[13px] text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-sky-500/30"
          />
          <div className="flex gap-1">
            <button
              onClick={commitSave}
              disabled={!saveName.trim()}
              className="flex-1 rounded-md bg-sky-500/15 px-2 py-1 text-[12px] font-medium text-sky-400 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => { setShowSaveForm(false); setSaveName('') }}
              className="rounded-md px-2 py-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowSaveForm(true)}
          className={`${ROW_BASE} ${saved
            ? 'bg-green-500/10 text-green-400'
            : ROW_INACTIVE
          }`}
        >
          {saved ? <Check className="h-4 w-4 shrink-0" strokeWidth={1.5} /> : <Save className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
          <span className="flex-1 truncate tracking-tight">{saved ? 'Saved!' : 'Save as Preset'}</span>
        </button>
      )}

      <BankPicker
        bankType="models"
        isOpen={pickerOpen}
        onSelect={(item) => handleLoadFromBank(item as Model)}
        onClose={() => setPickerOpen(false)}
      />
    </>
  )
}
