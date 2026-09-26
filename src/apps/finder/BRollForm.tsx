import { useRef, useState } from 'react'
import { ImagePlus, Download, Film } from 'lucide-react'
import type { BRoll } from '../../stores/types'
import { useAssetUrl } from '../../hooks/useAssetUrl'
import { useAppStore } from '../../stores/appStore'
import { getAsBase64, isAssetRef } from '../../utils/assetStore'
import { downloadImage } from '../../utils/downloadImage'
import { SectionLabel } from '../../components/SectionCard'
import { useBankAutosave, type BankAutosaveOptions } from './useBankAutosave'
import { AutosaveStatus, DoneButton, FormCloseButton, RequiredNote } from './BankFormChrome'

// The two things this form edits. Everything else on the row — the product,
// character and script it was made with, its clips — is left alone by the
// merge, so an autosave can't unlink them.
export type BRollDraft = Pick<BRoll, 'imageUrl' | 'prompt'>

interface BRollFormProps {
  item?: BRoll | null
  // A draft handed back by the "wasn't saved" toast's Reopen (see Finder).
  seed?: BRollDraft
  onAutosave: BankAutosaveOptions<BRollDraft>['persist']
  onAbandoned: (draft: BRollDraft, rowId: string | null, message: string) => void
  onClose: () => void
}

export default function BRollForm({ item, seed, onAutosave, onAbandoned, onClose }: BRollFormProps) {
  // Seeded once — see ScriptForm: the row changes under the form on every save.
  const start = seed ?? item
  const [imageUrl, setImageUrl] = useState(start?.imageUrl ?? '')
  const [prompt, setPrompt] = useState(start?.prompt ?? '')
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const resolvedImageUrl = useAssetUrl(imageUrl)
  const displayImage = localImagePreview ?? resolvedImageUrl
  const fileRef = useRef<HTMLInputElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const missingPrompt = !prompt.trim()
  const autosave = useBankAutosave<BRollDraft>(
    { imageUrl, prompt },
    {
      rowId: item?.id ?? null,
      canSave: (d) => !!d.prompt.trim(),
      persist: onAutosave,
      // The still goes up once: take its asset ref back, where the form is
      // still showing the picture that was sent.
      onStored: (sent, stored) => setImageUrl((current) => (current === sent.imageUrl ? stored.imageUrl : current)),
      restored: !!seed,
      onAbandon: (d, rowId) => onAbandoned(d, rowId, 'That b-roll wasn’t saved: it still needs its prompt.'),
    },
  )

  const unsaved = missingPrompt && autosave.touched
  const showMissing = autosave.touched || attempted

  const revealMissing = () => {
    setAttempted(true)
    promptRef.current?.focus()
  }

  const close = () => {
    void autosave.flush()
    onClose()
  }

  const discard = () => {
    autosave.discard()
    onClose()
  }

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImageUrl(dataUrl)
      setLocalImagePreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleDownloadImage = () => {
    if (!displayImage) return
    downloadImage(displayImage, `broll-${autosave.rowId?.slice(0, 8) ?? 'image'}`)
  }

  const handleSendToVideos = async () => {
    if (!imageUrl) return
    let dataUri = imageUrl
    if (isAssetRef(imageUrl)) {
      const asset = await getAsBase64(imageUrl)
      if (!asset) return
      dataUri = `data:${asset.mimeType};base64,${asset.base64}`
    }
    useAppStore.getState().sendToApp({
      targetApp: 'playground',
      targetField: 'videoStartFrame',
      data: { imageUrl: dataUri, prompt },
      parents: autosave.rowId ? [{ bank: 'brolls', id: autosave.rowId }] : undefined,
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (missingPrompt) revealMissing()
        else close()
      }}
      className="flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink-200">
          {item ? 'B-Roll Details' : 'New B-Roll'}
        </h3>
        <div className="flex items-center gap-3">
          <AutosaveStatus state={autosave.state} blocked={unsaved} />
          <FormCloseButton onClose={close} onDiscard={discard} wouldDiscard={unsaved} onBlocked={revealMissing} />
        </div>
      </div>

      {/* Side-by-side: large image left, prompt right */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left — b-roll image */}
        <div className="relative group/img w-full shrink-0 md:w-[340px]">
          {displayImage ? (
            <>
              <img
                src={displayImage}
                alt=""
                className="w-full rounded-3xl border border-ink/[0.06] object-contain bg-black/30"
              />
              <button
                type="button"
                onClick={handleDownloadImage}
                className="absolute right-2.5 top-2.5 rounded-full border border-white/20 bg-black/35 p-2 text-white opacity-0 backdrop-blur transition-all hover:bg-black/50 group-hover/img:opacity-100"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-2.5 right-2.5 rounded-full border border-white/20 bg-black/35 px-3 py-1.5 text-[10px] font-medium text-white opacity-0 backdrop-blur transition-all hover:bg-black/50 group-hover/img:opacity-100"
              >
                Replace
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group flex aspect-[9/16] w-full items-center justify-center rounded-3xl border border-dashed border-ink/10 bg-ink/[0.02] transition-colors hover:border-ink/20"
            >
              <div className="flex flex-col items-center gap-2">
                <ImagePlus className="h-6 w-6 text-ink-600 transition-colors group-hover:text-ink-400" />
                <span className="text-[11px] text-ink-600">Upload Image</span>
              </div>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={handleImage} />

        {/* Right — prompt + Done */}
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          {/* No card: the prompt is the only input on this side, and a border
              around one row says nothing while costing 24px. The label picks up
              the shared register and the dot, so the `*` stops being the one
              thing on the row you can't see. */}
          <label className="flex flex-1 flex-col gap-1.5">
            <SectionLabel label="Prompt" filled={!missingPrompt} required />
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={12}
              placeholder="Describe the image generation prompt..."
              className={`min-h-[280px] flex-1 resize-none rounded-3xl border bg-ink/[0.02] px-5 py-4 text-[13px] leading-relaxed text-ink-300 placeholder-ink-700 outline-none transition-colors ${
                showMissing && missingPrompt ? 'border-red-500/60 focus:border-red-400' : 'border-ink/[0.06] focus:border-ink/15'
              }`}
            />
            <RequiredNote show={showMissing && missingPrompt}>A b-roll needs its prompt to be saved.</RequiredNote>
          </label>

          <div className="flex flex-col gap-2">
            {/* Needs the row to exist — the clip it makes is linked back to it. */}
            {autosave.rowId && imageUrl && (
              <button
                type="button"
                onClick={handleSendToVideos}
                className="flex items-center justify-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-300 light:text-green-700 transition-colors hover:bg-green-500/20"
                title="Open Playground in video mode with this image as the start frame"
              >
                <Film className="h-3.5 w-3.5" />
                Animate in Playground
              </button>
            )}
            <DoneButton
              blocker={missingPrompt ? 'Add the Prompt' : null}
              onDone={close}
              onBlocked={revealMissing}
            />
          </div>
        </div>
      </div>
    </form>
  )
}
