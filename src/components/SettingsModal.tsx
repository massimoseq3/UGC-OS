import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Key, Check } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const storedKey = useSettingsStore((s) => s.googleApiKey)
  const setGoogleApiKey = useSettingsStore((s) => s.setGoogleApiKey)

  const [draft, setDraft] = useState(storedKey)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(storedKey)
      setSaved(false)
      setShowKey(false)
    }
  }, [open, storedKey])

  if (!open) return null

  function handleSave() {
    setGoogleApiKey(draft.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 lg:mx-0 rounded-xl border border-white/10 bg-[#0A0A0A] p-5 lg:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
              Settings
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Insert your API keys here
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* API Key Input */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Key className="h-3.5 w-3.5 text-zinc-500" />
            Google AI API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="AIza..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 pr-10 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.07]"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Model Info */}
        <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            This key enables
          </p>
          <div className="space-y-1.5 text-sm text-zinc-400">
            <div className="flex items-center justify-between">
              <span>Text Generation</span>
              <span className="text-xs text-zinc-600">Gemini 3 Flash</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Image Generation</span>
              <span className="text-xs text-zinc-600">Nano Banana 2</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Video Generation</span>
              <span className="text-xs text-zinc-600">Veo 3.1</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Voice Direction</span>
              <span className="text-xs text-zinc-600">Gemini 2.5 Flash</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saved}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/15 disabled:opacity-60"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4 text-emerald-400" />
              <span className="text-emerald-400">Saved</span>
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
    </div>
  )
}
