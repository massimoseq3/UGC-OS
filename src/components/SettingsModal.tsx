import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Key, Check, ExternalLink, Loader2, AlertCircle, FlaskConical, HardDrive, Trash2 } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useAuthStore } from '../stores/authStore'
import { isCloudEnabled } from '../lib/supabase'
import { kieTestConnection } from '../utils/kie'
import { seedTestData, type SeedResult } from '../utils/seedTestData'
import { findOrphanAssets, purgeOrphans, formatBytes, type OrphanAsset } from '../utils/orphanCleanup'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const storedKieKey = useSettingsStore((s) => s.kieApiKey)
  const setKieApiKey = useSettingsStore((s) => s.setKieApiKey)

  const [kieDraft, setKieDraft] = useState(storedKieKey)
  const [showKie, setShowKie] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null)

  const signedIn = !!useAuthStore((s) => s.user)
  const cloudOn = isCloudEnabled() && signedIn

  type StorageState =
    | { phase: 'idle' }
    | { phase: 'scanning' }
    | { phase: 'scanned'; orphans: OrphanAsset[]; totalBytes: number; total: number; totalAssetBytes: number }
    | { phase: 'purging'; orphans: OrphanAsset[]; totalBytes: number; done: number; total: number }
    | { phase: 'done'; cleaned: number; bytes: number; failed: number }
    | { phase: 'error'; message: string }
  const [storage, setStorage] = useState<StorageState>({ phase: 'idle' })
  const [showOrphanList, setShowOrphanList] = useState(false)

  useEffect(() => {
    if (open) {
      setKieDraft(storedKieKey)
      setSaved(false)
      setShowKie(false)
      setTestResult(null)
      setSeedResult(null)
      setStorage({ phase: 'idle' })
      setShowOrphanList(false)
    }
  }, [open, storedKieKey])

  if (!open) return null

  function handleSave() {
    setKieApiKey(kieDraft.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleSeed() {
    const result = seedTestData()
    setSeedResult(result)
    setTimeout(() => setSeedResult(null), 4000)
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

  async function handleScanOrphans() {
    setStorage({ phase: 'scanning' })
    setShowOrphanList(false)
    try {
      const result = await findOrphanAssets()
      setStorage({ phase: 'scanned', ...result })
    } catch (e) {
      setStorage({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async function handlePurgeOrphans() {
    if (storage.phase !== 'scanned') return
    const orphans = storage.orphans
    const totalBytes = storage.totalBytes
    setStorage({ phase: 'purging', orphans, totalBytes, done: 0, total: orphans.length })
    const result = await purgeOrphans(
      orphans.map((o) => o.id),
      (done, total) => setStorage({ phase: 'purging', orphans, totalBytes, done, total }),
    )
    setStorage({
      phase: 'done',
      cleaned: result.ok,
      bytes: orphans.slice(0, result.ok).reduce((s, o) => s + Number(o.byte_size ?? 0), 0),
      failed: result.failed.length,
    })
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
            <p className="mt-0.5 text-sm text-zinc-500">Connect your kie.ai account</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* kie.ai key */}
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

        {/* Storage / orphan cleanup — only when cloud is active */}
        {cloudOn && (
          <div className="mt-6 border-t border-white/5 pt-5">
            <div className="flex items-center gap-2">
              <HardDrive className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-300">Storage</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Files in cloud storage that no item in your banks references. These can build up from older versions of the app — clean them up to free space.
            </p>

            {storage.phase === 'idle' && (
              <button
                type="button"
                onClick={handleScanOrphans}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.05]"
              >
                Find orphan assets
              </button>
            )}

            {storage.phase === 'scanning' && (
              <button
                type="button"
                disabled
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-[13px] font-medium text-zinc-400"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scanning…
              </button>
            )}

            {storage.phase === 'scanned' && (
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-300">
                  {storage.orphans.length === 0 ? (
                    <span className="flex items-center gap-2 text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      No orphans found — your storage is clean.
                    </span>
                  ) : (
                    <>
                      Found <span className="font-mono text-zinc-100">{storage.orphans.length}</span> orphan{storage.orphans.length === 1 ? '' : 's'} ({formatBytes(storage.totalBytes)}) out of {storage.total} total assets ({formatBytes(storage.totalAssetBytes)}).
                    </>
                  )}
                </div>

                {storage.orphans.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowOrphanList((v) => !v)}
                      className="text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                    >
                      {showOrphanList ? 'Hide' : 'Show'} details
                    </button>
                    {showOrphanList && (
                      <div className="max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02] p-2 text-[10px] font-mono text-zinc-500">
                        {storage.orphans.map((o) => (
                          <div key={o.id} className="truncate">
                            {o.id} · {formatBytes(Number(o.byte_size ?? 0))} · {o.mime_type}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handlePurgeOrphans}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/15 py-2 text-[12px] font-medium text-red-200 transition-colors hover:bg-red-500/25"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clean up — frees {formatBytes(storage.totalBytes)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStorage({ phase: 'idle' })}
                        className="rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.05]"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}

                {storage.orphans.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setStorage({ phase: 'idle' })}
                    className="text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    Done
                  </button>
                )}
              </div>
            )}

            {storage.phase === 'purging' && (
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[12px] text-zinc-300">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                  Cleaning… {storage.done} of {storage.total}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    className="h-full bg-emerald-400/60 transition-all"
                    style={{ width: `${storage.total === 0 ? 0 : Math.round((storage.done / storage.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {storage.phase === 'done' && (
              <div className="mt-3 space-y-2">
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
                  <Check className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>Cleaned {storage.cleaned} orphan{storage.cleaned === 1 ? '' : 's'} — freed {formatBytes(storage.bytes)}.{storage.failed > 0 ? ` ${storage.failed} failed (see console).` : ''}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStorage({ phase: 'idle' })}
                  className="text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  Done
                </button>
              </div>
            )}

            {storage.phase === 'error' && (
              <div className="mt-3 space-y-2">
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{storage.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStorage({ phase: 'idle' })}
                  className="text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Seed test data — quick way to populate banks for trying the app */}
        <div className="mt-6 border-t border-white/5 pt-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-300">Test data</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Adds sample products, characters, scripts, voice presets, and B-Rolls so you can play with every app without setting up data first.
          </p>
          <button
            type="button"
            onClick={handleSeed}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.05]"
          >
            {seedResult ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400">
                  Added {seedResult.products} products · {seedResult.characters} characters · {seedResult.scripts} scripts · {seedResult.voices} voices · {seedResult.brolls} B-Rolls
                </span>
              </>
            ) : (
              'Seed test data'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
