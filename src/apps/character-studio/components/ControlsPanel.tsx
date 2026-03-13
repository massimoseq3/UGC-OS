import { useState } from 'react'
import { FolderOpen, Trash2, Sparkles, Save } from 'lucide-react'
import type { TabId, CharacterProfile } from '../types'
import { TABS, PRESET_MARIE, PRESET_ZANE, createEmptyProfile } from '../types'
import type { Model } from '../../../stores/types'
import { useBankStore } from '../../../stores/bankStore'
import { buildJsonPrompt } from '../services/generateCharacter'
import BankPicker from '../../../components/BankPicker'
import ChipField from './ChipField'

interface ControlsPanelProps {
  profile: CharacterProfile
  onProfileChange: (profile: CharacterProfile) => void
  activeTab: TabId
}

export default function ControlsPanel({ profile, onProfileChange, activeTab }: ControlsPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)

  const addModel = useBankStore((s) => s.addModel)

  const currentTab = TABS.find((t) => t.id === activeTab)!

  const setField = (key: string, value: string) => {
    onProfileChange({ ...profile, [key]: value })
  }

  const handleLoadFromBank = (item: Model) => {
    if (item.jsonProfile) {
      const newProfile = createEmptyProfile()
      for (const section of Object.values(item.jsonProfile)) {
        if (typeof section === 'object' && section !== null) {
          for (const [key, value] of Object.entries(section as Record<string, string>)) {
            if (key in newProfile) {
              newProfile[key] = value
            }
          }
        }
      }
      onProfileChange(newProfile)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Presets, load, clear */}
      <div className="border-b border-white/5 px-3 py-2">
        <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Presets & Bank</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onProfileChange({ ...PRESET_MARIE })}
            className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
          >
            <Sparkles className="h-3 w-3" />
            Marie - Female
          </button>
          <button
            onClick={() => onProfileChange({ ...PRESET_ZANE })}
            className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
          >
            <Sparkles className="h-3 w-3" />
            Zane - Male
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-sky-500/10 hover:text-sky-400"
          >
            <FolderOpen className="h-3 w-3" />
            Load from Bank
          </button>

          <div className="flex-1" />

          {showSaveForm ? (
            <div className="flex items-center gap-1.5">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveName.trim()) {
                    addModel({
                      name: saveName.trim(),
                      characterImage: '',
                      notes: '',
                      source: 'character-studio',
                      jsonProfile: buildJsonPrompt(profile) as Record<string, unknown>
                    })
                    setShowSaveForm(false)
                    setSaveName('')
                    setSaved(true)
                    setTimeout(() => setSaved(false), 2000)
                  }
                  if (e.key === 'Escape') {
                    setShowSaveForm(false)
                    setSaveName('')
                  }
                }}
                autoFocus
                placeholder="Name preset..."
                className="w-32 rounded-full border border-white/10 bg-transparent px-2.5 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-sky-500/30"
              />
              <button
                onClick={() => {
                  if (saveName.trim()) {
                    addModel({
                      name: saveName.trim(),
                      characterImage: '',
                      notes: '',
                      source: 'character-studio',
                      jsonProfile: buildJsonPrompt(profile) as Record<string, unknown>
                    })
                    setShowSaveForm(false)
                    setSaveName('')
                    setSaved(true)
                    setTimeout(() => setSaved(false), 2000)
                  }
                }}
                disabled={!saveName.trim()}
                className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-400 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => { setShowSaveForm(false); setSaveName('') }}
                className="rounded-full px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveForm(true)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${saved ? 'bg-green-500/10 text-green-400' : 'bg-white/[0.05] text-zinc-400 hover:bg-sky-500/10 hover:text-sky-400'}`}
            >
              <Save className="h-3 w-3" />
              {saved ? 'Saved!' : 'Save as Preset'}
            </button>
          )}

          <button
            onClick={() => onProfileChange(createEmptyProfile())}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
            Clear All
          </button>
        </div>
      </div>

      {/* Tab label header */}
      <div className="border-b border-white/5 px-4 py-2">
        <span className="text-xs font-semibold tracking-tight text-zinc-300">{currentTab.label}</span>
        <span className="ml-2 text-[10px] tabular-nums text-zinc-600">
          {currentTab.fields.filter((f) => (profile[f.key] ?? '').trim() !== '').length}/{currentTab.fields.length}
        </span>
      </div>

      {/* Scrollable parameter fields */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-5">
          {currentTab.fields.map((field) => (
            <ChipField
              key={field.key}
              fieldKey={field.key}
              label={field.label}
              value={profile[field.key] ?? ''}
              chips={field.chips}
              onChange={(v) => setField(field.key, v)}
              placeholder={field.placeholder}
            />
          ))}
        </div>
      </div>

      {/* Bank Picker */}
      <BankPicker
        bankType="models"
        isOpen={pickerOpen}
        onSelect={(item) => handleLoadFromBank(item as Model)}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
