import { useEffect, useMemo, useState } from 'react'
import { X, Bookmark, Download, Check, Loader2, Copy } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { humanizeError } from '../../../utils/friendlyError'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { downloadImage } from '../../../utils/downloadImage'
import type { CharacterHistoryItem } from '../../../stores/types'
import { buildImagePrompt, buildSheetPrompt, buildJsonPrompt } from '../services/generateCharacter'

interface HistoryPreviewModalProps {
  item: CharacterHistoryItem
  onClose: () => void
}

export default function HistoryPreviewModal({ item, onClose }: HistoryPreviewModalProps) {
  const imageUrl = useAssetUrl(item.imageRef)
  const addModel = useBankStore((s) => s.addModel)
  const deleteModel = useBankStore((s) => s.deleteModel)
  const updateCharacterHistory = useBankStore((s) => s.updateCharacterHistory)
  const models = useBankStore((s) => s.models)
  const addToast = useAppStore((s) => s.addToast)

  const [showSaveForm, setShowSaveForm] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const isSheet = item.kind === 'sheet'
  // Horizontal output (16:9 sheet or landscape portrait) gets a much wider
  // column so the panels stay readable; everything else keeps the tighter frame.
  const isWide = item.aspectRatio.includes('16:9')
  const linkedModel = item.linkedModelId ? models.find((m) => m.id === item.linkedModelId) : undefined
  // Portraits and sheets alike save as their own Bank entry, tracked by linkedModelId.
  const savedAsModel = !!linkedModel

  const prompt = useMemo(
    () => (isSheet ? buildSheetPrompt(item.profile, item.aspectRatio) : buildImagePrompt(item.profile)),
    [item.profile, item.aspectRatio, isSheet],
  )

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
        // A saved sheet doubles as its own reference, so stamp it as the
        // entry's sheetImage too — downstream apps prefer it for consistency.
        ...(isSheet ? { sheetImage: item.imageRef } : {}),
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

  // Remove the linked Bank entry (keeping this history image) so it can be
  // re-saved. Mirrors the gallery tile's save/un-save toggle.
  async function handleUnsave() {
    if (saving) return
    setSaving(true)
    try {
      if (linkedModel) await deleteModel(linkedModel.id)
      await updateCharacterHistory(item.id, { linkedModelId: undefined })
    } catch (e) {
      addToast(humanizeError(e, 'Failed to remove from Bank'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDownload() {
    if (!imageUrl) return
    const url = await getUrl(item.imageRef)
    if (!url) return
    await downloadImage(url, `${isSheet ? 'character-sheet' : 'influencer'}-${item.id}`)
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
      {/* Top-right holds only Close — Save + Download moved down to labeled
          buttons beside Copy prompt (mirrors the Playground preview modal). */}
      <div
        className="absolute right-4 top-4 z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalActionButton title="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </ModalActionButton>
      </div>

      {/* Centered content — the media element shrinks to the image's real
          rendered size so the border hugs the picture (no letterbox bars),
          and clicks anywhere outside it close the modal. */}
      {/* Horizontal output is width-bound — give it a much wider column so the
          panels stay readable; portraits keep the tighter 5xl frame. */}
      <div className={`mx-auto flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden px-6 py-16 ${isWide ? 'max-w-[1700px]' : 'max-w-5xl'}`}>
        {imageUrl && (
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <img
              src={imageUrl}
              alt=""
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-xl border border-white/10 object-contain"
            />
          </div>
        )}

        {showSaveForm ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md shrink-0 items-center gap-2 rounded-full border border-ink/10 bg-surface-2/95 p-1.5 backdrop-blur"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSave()
                if (e.key === 'Escape') { setShowSaveForm(false); setName('') }
              }}
              placeholder="Influencer name…"
              className="flex-1 rounded-full bg-transparent px-3 py-1.5 text-[12px] text-ink-200 placeholder-ink-600 outline-none"
            />
            <button
              type="button"
              onClick={commitSave}
              disabled={!name.trim() || saving}
              className="flex items-center gap-1.5 rounded-full bg-influencers-500/15 px-3 py-1.5 text-[12px] font-medium text-influencers-400 transition-colors hover:bg-influencers-500/25 disabled:opacity-40"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setShowSaveForm(false); setName('') }}
              disabled={saving}
              className="rounded-full px-2 py-1.5 text-[12px] text-ink-500 transition-colors hover:text-ink-300 disabled:opacity-40"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-2xl shrink-0 flex-col items-center gap-3"
          >
            <div className="max-h-[18vh] w-full overflow-y-auto rounded-lg bg-white/[0.02] px-4 py-3 text-center text-[12px] leading-relaxed text-zinc-400 whitespace-pre-wrap">
              {prompt}
            </div>
            {/* Primary actions — labeled pills beside Copy prompt, matching the
                Playground preview modal. */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <ModalBarButton
                onClick={savedAsModel ? handleUnsave : () => setShowSaveForm(true)}
                disabled={saving}
                tone={savedAsModel ? 'saved' : 'default'}
                title={savedAsModel ? 'Saved — click to remove from Bank' : 'Save to Bank'}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAsModel ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                <span>{savedAsModel ? 'Saved to Bank' : 'Save to Bank'}</span>
              </ModalBarButton>
              <ModalBarButton onClick={handleDownload}>
                <Download className="h-4 w-4" />
                <span>{isSheet ? 'Download Sheet' : 'Download Image'}</span>
              </ModalBarButton>
              <ModalBarButton onClick={handleCopyPrompt}>
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                <span>{copied ? 'Copied' : 'Copy prompt'}</span>
              </ModalBarButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Labeled action pill for the modal's bottom bar — Save / Download / Copy,
// matching the Playground preview modal.
function ModalBarButton({
  children,
  onClick,
  disabled,
  title,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  tone?: 'default' | 'saved'
}) {
  const toneClass = tone === 'saved'
    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
    : 'border-white/15 bg-white/[0.06] text-zinc-100 hover:bg-white/[0.12]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-2 rounded-full border px-5 py-3 text-[13px] font-semibold tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {children}
    </button>
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
