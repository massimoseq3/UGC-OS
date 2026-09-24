// "Version 2 of this template is out": a flow made from a gallery template
// offers the gallery's newer version, with what changed. Updating lays the new
// version in as one undo step and carries the member's field picks across —
// their product, character, text and images — by the field's block id, then
// by its title. Anything else they changed in the blocks is replaced, which
// the bar says before they press it. Not Now stops offering that version.

import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { FlowDoc } from '../types'
import { useFlowStore } from '../store/flowStore'
import { loadGallery, loadGalleryTemplate, type GalleryEntry } from '../templates/gallery'
import { instantiate, type FlowTemplateFile } from '../templates/io'
import { useAppStore } from '../../../stores/appStore'
import { humanizeError } from '../../../utils/friendlyError'
import Spinner from '../../../components/Spinner'

type Pick = { pick?: string; text?: string; ref?: string }

// The member's picks, keyed by the NEW version's field blocks.
function carriedPicks(doc: FlowDoc, file: FlowTemplateFile): Record<string, Pick> {
  const picks: Record<string, Pick> = {}
  for (const f of file.fields) {
    const mine = doc.blocks.find((b) => b.id === f.blockId) ?? doc.blocks.find((b) => b.field && b.label === f.title)
    if (!mine) continue
    if (mine.pick) picks[f.blockId] = { pick: mine.pick }
    else if (mine.kind === 'text' && typeof mine.settings.text === 'string') picks[f.blockId] = { text: mine.settings.text }
    else if (mine.kind === 'image' && typeof mine.settings.ref === 'string' && mine.settings.ref) picks[f.blockId] = { ref: mine.settings.ref }
  }
  return picks
}

export default function TemplateUpdateBar({ doc }: { doc: FlowDoc }) {
  const [entry, setEntry] = useState<GalleryEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const updateTemplate = useFlowStore((s) => s.updateTemplate)
  const skipTemplateVersion = useFlowStore((s) => s.skipTemplateVersion)
  const addToast = useAppStore((s) => s.addToast)
  const templateId = doc.template?.id

  useEffect(() => {
    if (!templateId) return
    let live = true
    void loadGallery().then((entries) => {
      if (live) setEntry(entries.find((e) => e.slug === templateId) ?? null)
    })
    return () => { live = false }
  }, [templateId])

  const current = doc.template?.version ?? 1
  const latest = entry?.version ?? 0
  if (!entry || !doc.template || latest <= current || doc.template.skipped === latest) return null

  const update = async () => {
    setBusy(true)
    try {
      const loaded = await loadGalleryTemplate(entry.slug)
      const graph = await instantiate(loaded, carriedPicks(doc, loaded.file))
      updateTemplate(graph, { ...loaded.file.template, version: latest })
      addToast(`Updated to version ${latest}. Your picks carried over; Undo puts the old version back.`, 'success')
    } catch (err) {
      addToast(humanizeError(err, "That update couldn't be loaded. Check your connection and try again."), 'error')
    }
    setBusy(false)
  }

  return (
    <div className="flex shrink-0 items-start gap-3 border-b border-ink/5 bg-flow-500/[0.06] px-5 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-flow-300" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-ink-100">Version {latest} of {entry.name} is out</p>
        {entry.changes?.length ? (
          <ul className="mt-1 flex flex-col gap-0.5">
            {entry.changes.map((c) => <li key={c} className="text-[11.5px] leading-relaxed text-ink-400">· {c}</li>)}
          </ul>
        ) : null}
        <p className="mt-1 text-[11px] text-ink-500">Your picks carry over. Other changes you made to its blocks are replaced, and Undo brings them back.</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => void update()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-flow-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
        >
          {busy && <Spinner className="h-3 w-3" />}
          Update
        </button>
        <button
          type="button"
          onClick={() => skipTemplateVersion(doc.id, latest)}
          title="Not Now · this version stops being offered"
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/10 hover:text-ink-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
