import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Download, Bookmark, Check, ImagePlus, Wand2, LayoutGrid, CornerDownLeft } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { downloadImage } from '../../../utils/downloadImage'
import { humanizeError } from '../../../utils/friendlyError'
import type { CharacterHistoryItem } from '../../../stores/types'
import type { AspectRatio, ImageResolution } from '../../../utils/models'
import { startCharacterEditTask, finishCharacterTask, buildJsonPrompt } from '../services/generateCharacter'
import { pickInfluencerName } from './nameGenerator'

// A B-Roll-style editor for an influencer image. Clicking a portrait opens this:
// pick which output to edit, attach reference images, type an edit instruction,
// and re-generate (image-to-image). Every output tile hovers Save to Bank +
// Download. New edits persist to characterHistory so nothing is lost on close.

interface SessionOutput {
  // For the base image this is the source history id; for edits it's the new
  // characterHistory id we stamp on generation.
  id: string
  imageRef: string
  aspectRatio: string
}

interface UploadedRef {
  // data: URI held in memory (too large for the persisted draft, and the modal
  // is ephemeral anyway).
  url: string
  name: string
}

interface InfluencerEditModalProps {
  item: CharacterHistoryItem
  onClose: () => void
  // Make a character sheet from the selected image (image-to-image).
  onMakeSheet: (imageRef: string) => void
  // Load this influencer's settings back into the left form.
  onReuse: () => void
}

function coerceAspect(ar: string): AspectRatio {
  if (ar.includes('16:9')) return '16:9'
  if (ar.includes('1:1')) return '1:1'
  return '9:16'
}

function aspectStyle(ar: string): React.CSSProperties {
  if (ar.includes('16:9')) return { aspectRatio: '16 / 9' }
  if (ar.includes('1:1')) return { aspectRatio: '1 / 1' }
  return { aspectRatio: '9 / 16' }
}

export default function InfluencerEditModal({ item, onClose, onMakeSheet, onReuse }: InfluencerEditModalProps) {
  const addCharacterHistory = useBankStore((s) => s.addCharacterHistory)
  const addModel = useBankStore((s) => s.addModel)
  const updateCharacterHistory = useBankStore((s) => s.updateCharacterHistory)
  const addToast = useAppStore((s) => s.addToast)

  const [outputs, setOutputs] = useState<SessionOutput[]>([
    { id: item.id, imageRef: item.imageRef, aspectRatio: item.aspectRatio },
  ])
  const [selectedId, setSelectedId] = useState(item.id)
  const [prompt, setPrompt] = useState('')
  const [refs, setRefs] = useState<UploadedRef[]>([])
  const [editing, setEditing] = useState(false)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selected = outputs.find((o) => o.id === selectedId) ?? outputs[0]
  const selectedUrl = useAssetUrl(selected?.imageRef)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !editing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setRefs((prev) => [...prev, { url: reader.result as string, name: file.name }])
        }
      }
      reader.readAsDataURL(file)
    }
  }

  async function handleEdit() {
    const instruction = prompt.trim()
    if (!instruction || editing || !selected) return
    setEditing(true)
    try {
      const { taskId, modelId } = await startCharacterEditTask({
        prompt: instruction,
        baseImageRef: selected.imageRef,
        referenceRefs: refs.map((r) => r.url),
        aspectRatio: coerceAspect(selected.aspectRatio),
        resolution: (item.resolution as ImageResolution) ?? '1K',
      })
      const assetId = await finishCharacterTask(taskId, modelId)
      const newId = crypto.randomUUID()
      // Persist as a portrait generation so the edit survives the modal close
      // and shows in the main gallery too.
      addCharacterHistory({
        id: newId,
        imageRef: assetId,
        profile: item.profile,
        modelId,
        aspectRatio: selected.aspectRatio,
        resolution: (item.resolution as ImageResolution) ?? '1K',
        kind: 'portrait',
        createdAt: Date.now(),
      })
      setOutputs((prev) => [{ id: newId, imageRef: assetId, aspectRatio: selected.aspectRatio }, ...prev])
      setSelectedId(newId)
      setPrompt('')
      addToast('Edit generated', 'success')
    } catch (err) {
      addToast(humanizeError(err, 'Edit failed. Check your API key and try again.'), 'error')
    } finally {
      setEditing(false)
    }
  }

  async function handleSave(output: SessionOutput) {
    if (savingId || savedIds.has(output.id)) return
    setSavingId(output.id)
    try {
      const name = pickInfluencerName(item.profile.gender)
      await addModel({
        name,
        characterImage: output.imageRef,
        notes: '',
        source: 'character-studio',
        jsonProfile: buildJsonPrompt(item.profile) as Record<string, unknown>,
      })
      // Link back to the history row (base or persisted edit) so the main
      // gallery shows the saved badge too.
      const justAdded = useBankStore.getState().models.find(
        (m) => m.characterImage === output.imageRef && m.name === name,
      )
      if (justAdded) await updateCharacterHistory(output.id, { linkedModelId: justAdded.id })
      setSavedIds((prev) => new Set(prev).add(output.id))
      addToast(`Saved to bank as ${name}`, 'success')
    } catch (err) {
      addToast(humanizeError(err, 'Save failed'), 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDownload(output: SessionOutput) {
    const url = await getUrl(output.imageRef)
    if (url) await downloadImage(url, `influencer-${output.id}`)
  }

  const modal = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={() => { if (!editing) onClose() }}
    >
      <div
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-ink/10 bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/5 px-5 py-3.5">
          <span className="text-sm font-semibold tracking-tight text-ink-100">Edit influencer</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 50/50 grid; each column scrolls. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          {/* LEFT — selected preview + references + edit prompt */}
          <div className="col-span-1 flex min-h-0 flex-col overflow-y-auto border-b border-ink/5 md:border-b-0 md:border-r">
            <div className="flex grow flex-col gap-5 px-5 pb-6 pt-4">
              {/* Editing target */}
              <div>
                <span className="text-sm font-medium text-ink-200">Editing</span>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
                  The image your edit applies to. Click any output on the right to switch.
                </p>
                <div className="mt-2 flex justify-center">
                  <div
                    className="relative max-h-[34vh] overflow-hidden rounded-xl border border-ink/10 bg-black"
                    style={{ ...aspectStyle(selected?.aspectRatio ?? '9:16'), maxWidth: '220px' }}
                  >
                    {selectedUrl
                      ? <img src={selectedUrl} alt="" className="h-full w-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-ink-500" /></div>}
                  </div>
                </div>
              </div>

              {/* Reference images */}
              <div>
                <span className="text-sm font-medium text-ink-200">Reference images</span>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
                  Optional — add a product, outfit, or pose to guide the edit.
                </p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {refs.map((r, i) => (
                    <div key={i} className="group/ref relative aspect-square overflow-hidden rounded-lg border border-ink/10">
                      <img src={r.url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => setRefs((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-500/60 group-hover/ref:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-ink/15 bg-ink/[0.02] text-ink-500 transition-colors hover:border-ink/30 hover:text-ink-300"
                  >
                    <ImagePlus className="h-5 w-5" />
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePickFiles} />
              </div>

              {/* Edit prompt */}
              <div className="flex grow flex-col">
                <span className="text-sm font-medium text-ink-200">Edit instruction</span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="Describe the change — e.g. 'change the top to a red hoodie', 'add round glasses', 'softer warm lighting'…"
                  className="mt-2 min-h-[96px] w-full grow resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-3.5 py-3 text-[13px] leading-[1.5] text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20 focus:bg-ink/[0.05]"
                />
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={!prompt.trim() || editing}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-influencers-500 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-influencers-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {editing ? 'Generating edit…' : 'Generate edit'}
                </button>
                <div className="mt-2 flex items-center gap-2">
                  {item.kind !== 'sheet' && (
                    <button
                      type="button"
                      onClick={() => selected && onMakeSheet(selected.imageRef)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-influencers-500/30 bg-influencers-500/10 py-2 text-[12px] font-medium text-influencers-300 transition-colors hover:bg-influencers-500/20"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      Make Sheet
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onReuse}
                    title="Load this influencer's settings back into the form"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.02] py-2 text-[12px] font-medium text-ink-300 transition-colors hover:bg-ink/[0.05]"
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    Edit in form
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — outputs gallery */}
          <div className="col-span-1 flex min-h-0 flex-col overflow-y-auto">
            <div className="px-4 py-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-ink-500">Outputs</span>
              <div className="mt-2 grid grid-cols-2 gap-2 [grid-auto-flow:dense] lg:grid-cols-3">
                {editing && (
                  <div
                    className="flex items-center justify-center rounded-lg border border-influencers-500/30 bg-influencers-500/[0.06]"
                    style={aspectStyle(selected?.aspectRatio ?? '9:16')}
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-influencers-300" />
                  </div>
                )}
                {outputs.map((o) => (
                  <OutputTile
                    key={o.id}
                    output={o}
                    selected={o.id === selectedId}
                    saved={savedIds.has(o.id)}
                    saving={savingId === o.id}
                    onSelect={() => setSelectedId(o.id)}
                    onSave={() => handleSave(o)}
                    onDownload={() => handleDownload(o)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function OutputTile({
  output,
  selected,
  saved,
  saving,
  onSelect,
  onSave,
  onDownload,
}: {
  output: SessionOutput
  selected: boolean
  saved: boolean
  saving: boolean
  onSelect: () => void
  onSave: () => void
  onDownload: () => void
}) {
  const url = useAssetUrl(output.imageRef)
  return (
    <div
      onClick={onSelect}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-black transition-all ${
        selected ? 'border-influencers-500/70 ring-2 ring-influencers-500/40' : 'border-ink/10 hover:border-ink/25'
      }`}
    >
      {url
        ? <img src={url} alt="" className="block h-auto w-full" />
        : <div className="flex w-full items-center justify-center" style={aspectStyle(output.aspectRatio)}><Loader2 className="h-5 w-5 animate-spin text-ink-500" /></div>}

      {selected && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-influencers-500/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur">
          Editing
        </span>
      )}

      {/* Hover actions: Save to Bank · Download */}
      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <TileButton
          title={saved ? 'Saved to bank' : saving ? 'Saving…' : 'Save to Bank'}
          tone={saved ? 'saved' : 'default'}
          onClick={(e) => { e.stopPropagation(); if (!saved && !saving) onSave() }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </TileButton>
        <TileButton title="Download image" onClick={(e) => { e.stopPropagation(); onDownload() }}>
          <Download className="h-4 w-4" />
        </TileButton>
      </div>
    </div>
  )
}

function TileButton({
  children,
  onClick,
  title,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title: string
  tone?: 'default' | 'saved'
}) {
  const toneClass = tone === 'saved'
    ? 'border-emerald-400/50 bg-emerald-500/45 text-emerald-100'
    : 'border-white/20 bg-black/55 text-white hover:bg-black/70'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${toneClass}`}
    >
      {children}
    </button>
  )
}
