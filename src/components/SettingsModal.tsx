import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Key, Check, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { kieTestConnection } from '../utils/kie'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const storedKieKey = useSettingsStore((s) => s.kieApiKey)
  const storedGoogleKey = useSettingsStore((s) => s.googleApiKey)
  const setKieApiKey = useSettingsStore((s) => s.setKieApiKey)
  const setGoogleApiKey = useSettingsStore((s) => s.setGoogleApiKey)

  const [kieDraft, setKieDraft] = useState(storedKieKey)
  const [googleDraft, setGoogleDraft] = useState(storedGoogleKey)
  const [showKie, setShowKie] = useState(false)
  const [showGoogle, setShowGoogle] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (open) {
      setKieDraft(storedKieKey)
      setGoogleDraft(storedGoogleKey)
      setSaved(false)
      setShowKie(false)
      setShowGoogle(false)
      setTestResult(null)
    }
  }, [open, storedKieKey, storedGoogleKey])

  if (!open) return null

  function handleSave() {
    setKieApiKey(kieDraft.trim())
    setGoogleApiKey(googleDraft.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleTest() {
    if (!kieDraft.trim()) return
    setTesting(true)
    setTestResult(null)
    const result = await kieTestConnection(kieDraft.trim())
    if (result.ok) {
      setTestResult({ ok: true, message: `Connected — ${result.credits} credits remaining.` })
    } else {
      setTestResult({ ok: false, message: result.error })
    }
    setTesting(false)
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
            <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Settings</h2>
            <p className="mt-0.5 text-sm text-zinc-500">Connect your AI accounts</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* kie.ai key — primary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Key className="h-3.5 w-3.5 text-zinc-500" />
              kie.ai API Key
            </label>
            <a
              href="https://kie.ai/api-key"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Get key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="relative">
            <input
              type={showKie ? 'text' : 'password'}
              value={kieDraft}
              onChange={(e) => {
                setKieDraft(e.target.value)
                setTestResult(null)
              }}
              placeholder="sk-..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 pr-10 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.07]"
            />
            <button
              type="button"
              onClick={() => setShowKie(!showKie)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {showKie ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleTest}
            disabled={!kieDraft.trim() || testing}
            className="flex items-center gap-2 text-[11px] text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {testing ? 'Testing…' : 'Test connection'}
          </button>

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[11px] ${
                testResult.ok
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/20 bg-red-500/10 text-red-300'
              }`}
            >
              {testResult.ok ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Google AI key — legacy, fading out */}
        <div className="mt-5 space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <Key className="h-3 w-3 text-zinc-600" />
              Google AI API Key (legacy)
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Still used for image, video, and voice generation while we finish migrating those to kie.ai. Will be removed once migration is complete.
          </p>
          <div className="relative">
            <input
              type={showGoogle ? 'text' : 'password'}
              value={googleDraft}
              onChange={(e) => setGoogleDraft(e.target.value)}
              placeholder="AIza..."
              className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 pr-10 text-xs text-zinc-300 placeholder-zinc-700 outline-none transition-colors focus:border-white/15"
            />
            <button
              type="button"
              onClick={() => setShowGoogle(!showGoogle)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 transition-colors hover:text-zinc-400"
            >
              {showGoogle ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
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
