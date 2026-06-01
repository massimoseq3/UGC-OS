import { useEffect, useMemo, useState } from 'react'
import { X, Bookmark, Download, Check, Loader2, Copy } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { humanizeError } from '../../../utils/friendlyError'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import type { CharacterHistoryItem } from '../../../stores/types'
import { buildImagePrompt, buildJsonPrompt } from '../services/generateCharacter'

interface HistoryPreviewModalProps {
  item: CharacterHistoryItem
  onClose: () => void
}

export default function HistoryPreviewModal({ item, onClose }: HistoryPreviewModalProps) {
  const imageUrl = useAssetUrl(item.imageRef)
  const addModel = useBankStore((s) => s.addModel)
  const updateCharacterHistory = useBankStore((s) => s.updateCharacterHistory)
  const models = useBankStore((s) => s.models)
  const addToast = useAppStore((s) => s.addToast)

  const [showSaveForm, setShowSaveForm] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const linkedModel = item.linkedModelId ? models.find((m) => m.id === item.linkedModelId) : undefined
  const savedAsModel = !!linkedModel

  const prompt = useMemo(() => buildImagePrompt(item.profile), [item.profile])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function commitSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await addModel({
        name: name.trim(),
        characterImage: item.imageRef,
        notes: '',
        source: 'character-studio',
        jsonProfile: buildJsonPrompt(item.profile) as Record<string, unknown>,
      })
      const justAdded = useBankStore.getState().models.find(
        (m) => m.characterImage === item.imageRef && m.name === name.trim(),
      )
      if (justAdded) await updateCharacterHistory(item.id, { linkedModelId: justAdded.id })
      setShowSaveForm(false)
      setName('')
    } catch (e) {
      addToast(humanizeError(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDownload() {
    if (!imageUrl) return
    const url = await getUrl(item.imageRef)
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `character-${item.id}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleCopyPrompt() {
    const ok = await copyToClipboard(prompt)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } else {
      addToast('Copy failed', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top-right action cluster */}
      <div
        className="absolute right-4 top-4 z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalActionButton
          title={savedAsModel ? 'Saved to Characters bank' : 'Save to Characters bank'}
          onClick={() => setShowSaveForm(true)}
          disabled={savedAsModel}
          tone={savedAsModel ? 'saved' : 'default'}
        >
          {savedAsModel ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </ModalActionButton>
        <ModalActionButton title="Download" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </ModalActionButton>
        <ModalActionButton title="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </ModalActionButton>
      </div>

      {/* Centered content */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center gap-4 overflow-hidden px-6 py-16"
      >
        {imageUrl && (
          <img src={imageUrl} alt="" className="min-h-0 max-w-full flex-1 rounded-xl border border-white/10 object-contain" />
        )}

        {showSaveForm ? (
          <div className="flex w-full max-w-md shrink-0 items-center gap-2 rounded-full border border-white/10 bg-[#0B0B0D]/95 p-1.5 backdrop-blur">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSave()
                if (e.key === 'Escape') { setShowSaveForm(false); setName('') }
              }}
              placeholder="Character name…"
              className="flex-1 rounded-full bg-transparent px-3 py-1.5 text-[12px] text-zinc-200 placeholder-zinc-600 outline-none"
            />
            <button
              type="button"
              onClick={commitSave}
              disabled={!name.trim() || saving}
              className="flex items-center gap-1.5 rounded-full bg-sky-500/15 px-3 py-1.5 text-[12px] font-medium text-sky-400 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setShowSaveForm(false); setName('') }}
              disabled={saving}
              className="rounded-full px-2 py-1.5 text-[12px] text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-40"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex w-full max-w-2xl shrink-0 flex-col items-center gap-2">
            <div className="max-h-[18vh] w-full overflow-y-auto rounded-lg bg-white/[0.02] px-4 py-3 text-center text-[12px] leading-relaxed text-zinc-400 whitespace-pre-wrap">
              {prompt}
            </div>
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy prompt'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ModalActionButton({
  children,
  onClick,
  title,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  tone?: 'default' | 'saved'
}) {
  const toneClass = tone === 'saved'
    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
    : 'border-white/15 bg-black/40 text-white hover:bg-black/60'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {children}
    </button>
  )
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
