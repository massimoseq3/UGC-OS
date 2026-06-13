import { useEffect, useMemo, useState } from 'react'
import { X, Bookmark, Download, Check, Loader2, Copy } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { humanizeError } from '../../../utils/friendlyError'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { downloadImage } from '../../../utils/downloadImage'
import type { CharacterHistoryItem, Model } from '../../../stores/types'
import { buildImagePrompt, buildSheetPrompt, buildJsonPrompt } from '../services/generateCharacter'
import { attachSheetToModel } from '../services/attachSheet'
import InfluencerPickList from './InfluencerPickList'

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

  const isSheet = item.kind === 'sheet'
  const linkedModel = item.linkedModelId ? models.find((m) => m.id === item.linkedModelId) : undefined
  // Sheets count as saved only while still the model's current sheet — they
  // attach to an existing influencer instead of creating a bank entry.
  const savedAsModel = isSheet
    ? models.some((m) => m.sheetImage === item.imageRef)
    : !!linkedModel

  const prompt = useMemo(
    () => (isSheet ? buildSheetPrompt(item.profile) : buildImagePrompt(item.profile)),
    [item.profile, isSheet],
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

  async function commitAttach(model: Model) {
    if (saving) return
    setSaving(true)
    try {
      await attachSheetToModel(item, model)
      setShowSaveForm(false)
    } catch (e) {
      addToast(humanizeError(e, 'Attach failed'), 'error')
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
      {/* Top-right action cluster */}
      <div
        className="absolute right-4 top-4 z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalActionButton
          title={isSheet
            ? (savedAsModel ? 'Attached — click to move to another influencer' : 'Attach to influencer')
            : (savedAsModel ? 'Saved to Influencers bank' : 'Save to Influencers bank')}
          onClick={() => setShowSaveForm(true)}
          disabled={savedAsModel && !isSheet}
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

      {/* Centered content — the media element shrinks to the image's real
          rendered size so the border hugs the picture (no letterbox bars),
          and clicks anywhere outside it close the modal. */}
      {/* Sheets are 16:9 and width-bound — give them a much wider column so
          the panels stay readable; portraits keep the tighter 5xl frame. */}
      <div className={`mx-auto flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden px-6 py-16 ${isSheet ? 'max-w-[1700px]' : 'max-w-5xl'}`}>
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

        {showSaveForm && isSheet ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-ink/10 bg-surface-2/95 backdrop-blur"
          >
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500">Attach to influencer</span>
              <button
                type="button"
                onClick={() => setShowSaveForm(false)}
                disabled={saving}
                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 transition-colors hover:text-ink-300"
                aria-label="Cancel"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <InfluencerPickList item={item} busy={saving} onPick={commitAttach} />
          </div>
        ) : showSaveForm ? (
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
            className="flex w-full max-w-2xl shrink-0 flex-col items-center gap-2"
          >
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
