import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, Check, Bookmark, ArrowUpRight, Mic, Film, PenLine, AlertCircle, ImagePlay, Palette, Pencil, X, Undo2, Redo2, Quote, ChevronDown, ChevronRight, RotateCw, Radar, Eye, FileText, type LucideIcon } from 'lucide-react'
import { titleCaseLabel } from '../../../utils/titleCaseLabel'
import GenerationProgress from '../../../components/GenerationProgress'
import GridCanvas, { AwaitingBody } from '../../../components/GridCanvas'
import AutoGrowTextarea from '../../../components/AutoGrowTextarea'
import { TileDeleteButton } from '../../../components/tileActions'
import { rangeDurationLabel } from '../../../utils/timecode'
import TokenField from './TokenField'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { REMIX_ANGLE_LABEL, remixAnglesForCount, HOOK_CATEGORY_META, DEFAULT_HOOK_COUNT, parseHooks, hooksPlainText, hooksToText, spokenLinesOnly, type ParsedHook, type PendingScriptRun, type RemixAngle, type ScriptMode, type WriteFormat } from '../types'
import { suspendChromeAutoHide } from '../../../hooks/useChromeAutoHide'
import type { Lineage } from '../../../stores/types'

// The Scripts run the takes on screen came from, or null while nothing
// finished is on screen. A take, scene or shot sent out of here names it as the
// parent of whatever the other app makes (see Lineage in stores/types.ts), so
// every send button reads it here rather than taking it as a prop.
const ShownRunContext = createContext<string | null>(null)

function useSentFrom(): Lineage[] | undefined {
  const runId = useContext(ShownRunContext)
  return runId ? [{ bank: 'scriptHistory', id: runId }] : undefined
}
import { groupSceneBeats, liftAudioNote, renumberScenes, shotSource, spliceOut, splitHeaderTime, splitScenes, splitSpokenLines, splitVisualStyle, splitVoiceProfile, type SceneChunk, type SceneBeat } from '../sceneParsing'

interface OutputPanelProps {
  variations: string[]
  // Remix only: angles that produced these cards, when the run stamped them.
  outputAngles?: RemixAngle[] | null
  // Mode that produced the shown variations — drives the card titles, the
  // "spoken vs scenes" send buttons, and the angle labels.
  mode: ScriptMode
  // Live left-panel mode — drives the empty-state + loading copy only.
  liveMode?: ScriptMode
  writeFormat?: WriteFormat
  writeStyleLabel?: string
  // Hooks format only — the family choice that produced the shown pack.
  hookCategoryLabel?: string
  // Hooks format only — the live count, for the empty + loading copy.
  hookCount?: number
  linkedProductId: string | null
  // Set only while this pane is parked on a run that is still writing. It
  // carries the run's own mode/format/count rather than the live selectors:
  // browsing History mid-run moves those, and the loading copy has to keep
  // describing the thing being written.
  pendingRun?: PendingScriptRun | null
  error?: string | null
  // Retries the run the error belongs to. Absent, the error has no button.
  onRetry?: () => void
  // Remix with nothing in the box: the empty canvas offers the ways to get a
  // source instead of waiting on one. Absent (Flow's window), the plain canvas.
  findSource?: FindSourceActions | null
  // Identifies the RUN these takes came from (a generation, or the history row
  // being shown). The panel scrolls back to the first take when this changes —
  // never when the takes' text changes, which is what an in-place edit does.
  runId?: string | null
  // Commits an inline edit of take `index` back to the persisted output state.
  onEditVariation?: (index: number, text: string) => void
  // Remix only: ONE voice brief for the whole run, rendered above the takes and
  // belonging to none of them. Empty → no card. A scene blueprint's profile is
  // a different thing and stays where it is: that one is parsed out of the take
  // and pasted into every scene's prompt, this one is a paragraph the member
  // copies by hand when a video wants the source ad's voice.
  voiceProfile?: string
  onEditVoiceProfile?: (text: string) => void
}

// The ways into a Remix source, offered on the empty canvas. `onFindOutlier`
// is absent while Outliers is switched off.
export interface FindSourceActions {
  onFindOutlier?: () => void
  onAnalyzeAd: () => void
  onPickScript: () => void
}

// The two icon buttons every scene and shot header carries.
//
// **Icon only** (September 2026, Massimo's call): the word "Copy" sat beside a
// copy glyph in a row that also holds a scene label, a timecode pill and a
// delete — three of the four things in it explaining themselves twice. The
// wording survives as the tooltip and the accessible name. The card header's
// "Copy Full Script" keeps its label, because that one says WHAT it copies and
// is the only thing distinguishing it from the per-scene button under it.
function IconPillButton({
  onClick,
  icon: Icon,
  title,
  active = false,
  className = '',
}: {
  onClick: () => void
  icon: typeof Copy
  title: string
  // Renders the green tick instead of the glyph — the copy button's 2s flash.
  active?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink/5 ${className}`}
    >
      {active ? <Check className="h-3 w-3 text-green-400 light:text-green-600" /> : <Icon className="h-3 w-3" />}
    </button>
  )
}

// Hand one shot (or one whole scene) to Playground as the video prompt.
//
// It REPLACES the prompt there and leaves the rest of that draft alone — the
// Voice box most of all, which is the whole reason this earns a button beside
// Copy: sending shot after shot only ever swaps the words, where copy → switch
// app → clear the prompt → paste was four actions with the voice profile at
// risk in the middle of every one of them.
function SendToPlaygroundButton({ text, unit }: { text: string; unit: 'shot' | 'scene' }) {
  const sendToApp = useAppStore((s) => s.sendToApp)
  const addToast = useAppStore((s) => s.addToast)
  const parents = useSentFrom()
  const send = () => {
    sendToApp({ targetApp: 'playground', targetField: 'videoPrompt', data: text, parents })
    addToast(`${unit === 'shot' ? 'Shot' : 'Scene'} sent to Playground`)
  }
  return (
    <IconPillButton
      onClick={send}
      icon={ImagePlay}
      title={`Send this ${unit} to Playground as the video prompt`}
      className="hover:text-emerald-400 light:hover:text-emerald-600"
    />
  )
}

// The spoken line — the thing that gets read aloud. Tinted, set at reading
// size, and separately copyable, because it's what leaves this app.
function SpokenLine({ speaker, text, onChange, onDelete }: { speaker: string | null; text: string; onChange?: (next: string) => void; onDelete?: () => void }) {
  const [copied, setCopied] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const handleCopy = async () => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      addToast('Line copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } else {
      addToast('Copy failed', 'error')
    }
  }
  return (
    <div className="relative rounded-xl border border-scripts-500/15 bg-scripts-500/[0.05] py-2.5 pl-3.5 pr-10">
      {speaker && (
        <div className="mb-1 flex select-none items-center gap-1.5 text-[12px] font-semibold tracking-tight text-scripts-text">
          <Quote className="h-3 w-3" strokeWidth={2.5} />
          {titleCaseLabel(speaker.replace(/^\[|\]$/g, ''))}
        </div>
      )}
      {/* The quote marks sit OUTSIDE the field, and the span the edit writes
          back is the words between them — so retyping the line can't delete the
          quotes the scene parser finds it by. */}
      <div className="flex items-start gap-0.5 text-[15px] font-light leading-snug tracking-tight text-ink-100">
        <span aria-hidden className="select-none">“</span>
        <EditableText
          value={text}
          onCommit={onChange}
          onDelete={onDelete}
          singleLine
          ariaLabel="Spoken line"
          className="min-w-0 flex-1 text-[15px] font-light leading-snug tracking-tight text-ink-100"
          render={<p className="min-w-0 flex-1 text-[15px] font-light leading-snug tracking-tight text-ink-100">{text}</p>}
        />
        <span aria-hidden className="select-none">”</span>
      </div>
      <button
        onClick={handleCopy}
        title="Copy line"
        aria-label="Copy line"
        className="absolute right-1.5 top-1.5 flex h-6 w-6 select-none items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink/5 hover:text-ink-300"
      >
        {copied ? <Check className="h-3 w-3 text-green-400 light:text-green-600" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}

interface VariationCardProps {
  text: string
  cardTitle: string
  defaultSaveTitle: string
  linkedProductId: string | null
  mode: ScriptMode
  // Hooks format: renders the tagged one-liners as per-hook rows; copy/save use
  // the clean spoken lines (tags stripped).
  isHooks?: boolean
  // Commits an inline edit of this take's text back to the persisted output
  // state. Omitted → the edit affordance is hidden.
  onEdit?: (text: string) => void
  // Callback ref to the card's root — lets the OutputPanel scroll a given take
  // into view when its number is clicked in the take switcher.
  cardRef?: (el: HTMLDivElement | null) => void
}

function VariationCard({
  text,
  cardTitle,
  defaultSaveTitle,
  linkedProductId,
  mode,
  isHooks = false,
  onEdit,
  cardRef,
}: VariationCardProps) {
  const [copied, setCopied] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveTitle, setSaveTitle] = useState(defaultSaveTitle)
  const [saved, setSaved] = useState(false)
  // Inline edit of the take's raw text. `draft` is the live textarea value;
  // committing on Done flows it up via onEdit (persisted in the parent) and the
  // refreshed `text` prop re-renders the parsed view.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  // Undo/redo stack for committed edits to this take. `textSync` lets the
  // render-time check tell our own commits (keep the stack) from an external
  // change — a new generation or a loaded history item (reset the stack).
  const [history, setHistory] = useState<string[]>([text])
  const [histIndex, setHistIndex] = useState(0)
  const [textSync, setTextSync] = useState(text)
  // Which scenes are folded shut, by their index in the parsed list. Purely a
  // view state — a folded scene is still in the take, still copied, still sent.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())
  // Sticky "already in the bank" flag — `saved` is only the 3s visual flash.
  // Send-to-app auto-saves use this to avoid writing duplicate bank rows.
  const [savedOnce, setSavedOnce] = useState(false)
  if (text !== textSync) {
    setTextSync(text)
    setHistory([text])
    setHistIndex(0)
    // Only an EXTERNAL change lands here (our own commits move `textSync` in
    // step), so this is a new generation or a restored history row — different
    // scenes entirely, and folds kept from the last one would land on them by
    // index alone.
    if (collapsed.size) setCollapsed(new Set())
    // The card is keyed by position, so it outlives the take it was showing.
    // Nothing about that take may carry over: a stale `savedOnce` skipped the
    // new take's auto-save on Send, the save form offered the last run's
    // title, and an open whole-take editor committed the old text over this one.
    setSavedOnce(false)
    setSaveTitle(defaultSaveTitle)
    setShowSaveForm(false)
    setEditing(false)
    setDraft(text)
  }
  const canUndo = histIndex > 0
  const canRedo = histIndex < history.length - 1

  const addScript = useBankStore((s) => s.addScript)
  const sendToApp = useAppStore((s) => s.sendToApp)
  const addToast = useAppStore((s) => s.addToast)
  const parents = useSentFrom()

  // Pull the voice-profile block (wherever it sits) out FIRST, then split the
  // remaining text into scenes — otherwise the appended profile gets merged into
  // the last scene's body.
  const { scenes, voiceProfile, voiceSpan, voiceBlock, visualStyle, styleSpan, styleBlock } = useMemo(() => {
    if (isHooks) return { scenes: null, voiceProfile: '', voiceSpan: null, voiceBlock: null, visualStyle: '', styleSpan: null, styleBlock: null }
    const { body, rest, bodyStart, bodyEnd, blockStart, blockEnd } = splitVoiceProfile(text)
    const parsed = splitScenes(rest)
    // Both master blocks belong to a blueprint; a plain spoken take that
    // happens to contain the words has no scenes for them to govern.
    const style = parsed ? splitVisualStyle(text) : null
    return {
      scenes: parsed,
      voiceProfile: parsed ? body : '',
      voiceSpan: bodyStart != null && bodyEnd != null ? { start: bodyStart, end: bodyEnd } : null,
      voiceBlock: blockStart != null && blockEnd != null ? { start: blockStart, end: blockEnd } : null,
      visualStyle: style?.body ?? '',
      styleSpan: style ? { start: style.start, end: style.end } : null,
      styleBlock: style ? { start: style.blockStart, end: style.blockEnd } : null,
    }
  }, [text, isHooks])

  // Hooks: the raw text carries <FAMILY> tags — parse them into rows, and use
  // the clean spoken lines for copy / save-to-bank.
  const hooks = useMemo<ParsedHook[] | null>(() => (isHooks ? parseHooks(text) : null), [text, isHooks])

  // The plain-script shape: one row per line that has words in it, each with its
  // offset in the take — the span an in-place edit writes back to — and whether
  // a blank line came before it.
  //
  // **A paragraph break is worth one gap however many newlines produced it.**
  // The take is the model's raw text and nothing normalises its whitespace, so
  // the same three-paragraph script arrived spaced three different ways: one
  // blank line between paragraphs rendered at 14px, two at 28px, and none at all
  // at 0px — a wall of flush sentences. Which one you got depended on the model
  // and the run, not on the writing, and that is the "some scripts come out with
  // bigger gaps" report. Rendering every blank line as its own spacer is what
  // made the take's whitespace visible; a RUN of them is one paragraph break.
  //
  // Fixed here rather than by rewriting the text: the take stays exactly what
  // the model wrote (it's what Copy, Save and Send to Voiceovers hand over), and
  // every span an edit splices back over stays where it was.
  //
  // A plain loop, not a map over a closed-over counter: reassigning a captured
  // variable from inside a render callback is what the compiler lint calls
  // "reassign after render completes", and it's right — the accumulator would
  // outlive the render that built it.
  const scriptLines = useMemo(() => {
    const out: Array<{ line: string; start: number; breakBefore: boolean }> = []
    let at = 0
    let pendingBreak = false
    for (const line of text.split('\n')) {
      const start = at
      at += line.length + 1
      if (line.trim() === '') {
        // Leading blank lines aren't a paragraph break — there's nothing above
        // them to break FROM, and they used to open the card with a spacer.
        pendingBreak = out.length > 0
        continue
      }
      out.push({ line, start, breakBefore: pendingBreak })
      pendingBreak = false
    }
    return out
  }, [text])
  const shareText = isHooks ? hooksPlainText(text) : text

  // A plain spoken script (remix variation, or a write-mode 'script' output)
  // can be read aloud → Voiceovers. A scene blueprint (reverse-engineer, or a
  // write-mode 'scenes' output) is a prompt asset → Playground. A hooks pack is
  // a list of standalone openers — copy/save only, no sends.
  const isSpokenScript = !isHooks && (mode === 'remix' || (mode === 'write' && !scenes))

  const startEdit = () => {
    setDraft(text)
    setShowSaveForm(false)
    setEditing(true)
  }

  // Push `next` as a new committed state and flow it to the parent. Setting
  // `textSync` in step keeps the render-time check from mistaking our own
  // commit for an external reset (which would wipe the undo stack).
  const applyText = (next: string) => {
    setTextSync(next)
    onEdit?.(next)
  }

  const commitEdit = () => {
    if (draft !== history[histIndex]) {
      const nextHistory = [...history.slice(0, histIndex + 1), draft]
      setHistory(nextHistory)
      setHistIndex(nextHistory.length - 1)
      applyText(draft)
      addToast('Edit saved')
    }
    setEditing(false)
  }

  const cancelEdit = () => {
    setDraft(text)
    setEditing(false)
  }

  // A hook is edited ON its own row — click the line and type, no Edit mode to
  // enter first. Rewrites that one line and pushes the rebuilt pack through the
  // same commit path (and the same undo stack) the whole-take editor uses, so
  // the two ways in stay interchangeable. Clearing a row deletes it; the
  // whole-take editor is what ADDS one.
  const editHookLine = (index: number, next: string) => {
    if (!hooks) return
    commitText(hooksToText(hooks.map((h, i) => (i === index ? { ...h, text: next } : h))))
  }

  // Clearing a hook drops it from the pack — the pack is a list, so removing a
  // line is rebuilding it without that one rather than splicing the text.
  const deleteHookLine = (index: number) => {
    if (!hooks) return
    commitText(hooksToText(hooks.filter((_, i) => i !== index)))
  }

  // Push a rewritten take through the same commit path (and the same undo
  // stack) the raw editor uses, so every way of editing this card is
  // interchangeable and Undo steps back through all of them.
  const commitText = (rebuilt: string) => {
    if (rebuilt === text) return
    const nextHistory = [...history.slice(0, histIndex + 1), rebuilt]
    setHistory(nextHistory)
    setHistIndex(nextHistory.length - 1)
    applyText(rebuilt)
  }

  // Splice one span of the take text — the primitive behind every in-place
  // edit outside the hooks pack. The span comes from the parse (a scene's
  // `bodyStart` plus a segment's own offset, or a script line's position), so
  // this never has to find anything: it writes back exactly the characters the
  // block on screen was rendered from. The bounds check is belt and braces
  // against a stale span surviving one render past a text change.
  const replaceRange = (start: number, end: number, next: string) => {
    if (start < 0 || end > text.length || start > end) return
    commitText(text.slice(0, start) + next + text.slice(end))
  }

  // The other half of the same primitive: emptying a block cuts its span out of
  // the take instead of committing an empty string. Same spans, same commit
  // path, same undo stack — so a deleted line comes back with Undo like any
  // other edit.
  const deleteRange = (start: number, end: number) => {
    if (start < 0 || end > text.length || start >= end) return
    commitText(spliceOut(text, start, end))
  }

  // A delete INSIDE a scene. Clearing the last block in a scene body leaves a
  // header with nothing under it — which renders nothing at all, so there'd be
  // no way left on screen to remove it — hence the whole scene goes instead,
  // renumbered like any other scene delete.
  const deleteInScene = (index: number, start: number, end: number) => {
    const chunk = scenes?.[index]
    if (!chunk || start < chunk.bodyStart || end > chunk.bodyEnd || start >= end) return
    if (!(text.slice(chunk.bodyStart, start) + text.slice(end, chunk.bodyEnd)).trim()) {
      deleteScene(index)
      return
    }
    deleteRange(start, end)
  }

  // Cut one scene out of the take — its header line, its body, and the blank
  // lines between it and the next scene. The span comes from the parse, so this
  // is the same splice every other edit here performs, and Undo steps back over
  // it like any other. The remaining headers are renumbered, since 1, 2, 4
  // reads as a bug in the take rather than as a deliberate cut.
  const deleteScene = (index: number) => {
    const chunk = scenes?.[index]
    if (!chunk || chunk.start < 0 || chunk.end > text.length) return
    const before = text.slice(0, chunk.start).replace(/\s+$/, '')
    const after = text.slice(chunk.end).replace(/^\s+/, '')
    commitText(renumberScenes(before && after ? `${before}\n\n${after}` : before || after))
    // The folds are keyed by index, so everything below the cut shifts up one.
    setCollapsed((prev) => {
      if (!prev.size) return prev
      const next = new Set<number>()
      prev.forEach((i) => {
        if (i < index) next.add(i)
        else if (i > index) next.add(i - 1)
      })
      return next
    })
  }

  const toggleCollapsed = (index: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(index)) next.add(index)
      return next
    })
  }

  const handleUndo = () => {
    if (!canUndo) return
    const i = histIndex - 1
    setHistIndex(i)
    applyText(history[i])
  }

  const handleRedo = () => {
    if (!canRedo) return
    const i = histIndex + 1
    setHistIndex(i)
    applyText(history[i])
  }

  // Also the tooltip and the accessible name, since the word itself is hidden
  // on a phone — the button has to keep saying what it copies somewhere.
  const copyAllLabel = copied ? 'Copied' : scenes ? 'Copy Full Script' : hooks ? 'Copy All' : 'Copy'

  const handleCopyAll = async () => {
    const ok = await copyToClipboard(shareText)
    if (ok) {
      setCopied(true)
      addToast(isHooks ? 'Hooks copied to clipboard' : 'Script copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } else {
      addToast('Copy failed', 'error')
    }
  }

  const saveToBank = (title: string) => {
    addScript({
      title,
      scriptText: shareText,
      linkedProductId: linkedProductId ?? '',
      source: 'script-architect',
      // Hooks are spoken one-liners, so they file with the spoken scripts.
      kind: isSpokenScript || isHooks ? 'remix' : 'reverse-engineer',
    })
    setSavedOnce(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleSave = () => {
    const title = saveTitle.trim()
    if (!title) return
    saveToBank(title)
    setShowSaveForm(false)
    addToast('Script saved to bank')
  }

  const handleSendToVoiceStudio = () => {
    const autoSaved = !savedOnce
    if (autoSaved) saveToBank(defaultSaveTitle)
    // The BANK keeps the script exactly as written — the HOST: / PERSON 2: turns
    // and the ON SCREEN: copy are what a multi-speaker format is shot from. Only
    // the voice handoff sheds them, because Voiceovers is one TTS speaker
    // reading one blob and would otherwise say "HOST colon" and read the comment
    // card aloud (see spokenLinesOnly).
    const spoken = spokenLinesOnly(text)
    sendToApp({ targetApp: 'voice-studio', targetField: 'scriptText', data: spoken, parents })
    addToast(autoSaved ? 'Script saved to bank · sent to Voiceovers' : 'Script sent to Voiceovers')
  }

  const handleSendToBrollStudio = () => {
    const autoSaved = !savedOnce
    if (autoSaved) saveToBank(defaultSaveTitle)
    sendToApp({ targetApp: 'broll-studio', targetField: 'scriptText', data: text, parents })
    addToast(autoSaved ? 'Script saved to bank · sent to B-Roll' : 'Script sent to B-Roll')
  }

  const handleSendToPlayground = () => {
    sendToApp({ targetApp: 'playground', targetField: 'videoPrompt', data: text, parents })
    addToast('Prompt sent to Playground')
  }

  return (
    // Every chrome row in this panel — headers, chips, copy/edit buttons, the
    // take switcher — is `select-none`, so dragging across a take highlights the
    // script and nothing else. Two symptoms came from letting chrome be
    // selectable: the highlight swept up "SCENE 1 — HOOK" and the word "Copy"
    // alongside the line you wanted, and clicking a button whose own label was
    // inside that highlight left the selection stuck (Chrome reads a mousedown
    // inside a selection as a drag-start, and the click's re-render then
    // interrupts the collapse). Prose stays selectable — it's what gets copied.
    <div ref={cardRef} className="flex shrink-0 flex-col rounded-3xl border border-ink/10 bg-ink/[0.06] light:bg-[#F1F1F2] overflow-hidden card-soft-shadow">
      {/* The title is the card's centred heading at 15px Title Case
          (September 2026, Massimo's call) — it was a 10px all-caps pill, the
          hardest thing on the card to read. A three-column grid rather than
          absolute side groups: the two `1fr` columns hold the edit tools and
          the copy glyph and stay equal while there's room, which is what
          keeps the title centred, and the middle track is `minmax(0, …)` so a
          long style name truncates instead of running under the controls. */}
      <div className="grid h-12 select-none grid-cols-[1fr_minmax(0,max-content)_1fr] items-center gap-2 border-b border-ink/5 px-2">
        <div className="flex items-center gap-0.5">
          {onEdit && !editing && (
            <>
              {/* The whole script in one box. No longer how you fix a typo
                  (every block on the card below is its own field), nor how you
                  remove a line or a scene (clear the block, or use the scene's
                  own delete). What's left is ADDING: a new scene, a line, a
                  paragraph. It read "Raw" until September 2026 — accurate about
                  the textarea and meaningless about the job. */}
              <button
                onClick={startEdit}
                title="Edit the whole script in one box · for adding scenes and lines"
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-300"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo"
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-300 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Undo2 className="h-3 w-3" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo"
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-300 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Redo2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
        <div className="flex min-w-0 items-center justify-center gap-2">
          <CardTitle title={cardTitle} />
          {scenes && !editing && (
            <span className="shrink-0 rounded-full bg-ink/5 px-2.5 py-0.5 text-[11px] text-ink-500 max-md:hidden">
              {scenes.length} Scene{scenes.length === 1 ? '' : 's'}
            </span>
          )}
          {hooks && !editing && (
            <span className="shrink-0 rounded-full bg-ink/5 px-2.5 py-0.5 text-[11px] text-ink-500 max-md:hidden">
              {hooks.length} Hook{hooks.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center justify-end">
          {!editing && (
            // Glyph only, at every width (Massimo's call, September 2026): the
            // copy icon already says it, and "Copy Full Script" was the longest
            // label on the row. The wording survives as the tooltip and the
            // accessible name, and the tick is the feedback either way.
            <button
              onClick={handleCopyAll}
              title={copyAllLabel}
              aria-label={copyAllLabel}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-300"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-400 light:text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
          {editing && (
            <span className="px-2.5 text-[11px] font-medium text-scripts-300">Editing</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {editing ? (
          // One textarea over the raw take text — works for every output shape
          // (scenes / plain script). Committing re-parses on render.
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            spellCheck={false}
            className="min-h-[320px] w-full resize-y rounded-2xl border border-ink/10 bg-surface-0 p-3 text-[13px] font-light leading-relaxed tracking-tight text-ink-100 outline-none transition-colors focus:border-scripts-500/30"
          />
        ) : hooks ? (
          // One row per hook — family chip + the line + its own copy button.
          <>
            {hooks.map((hook, i) => (
              <HookLineCard
                key={i}
                hook={hook}
                index={i}
                onChange={onEdit ? (line) => editHookLine(i, line) : undefined}
                onDelete={onEdit ? () => deleteHookLine(i) : undefined}
              />
            ))}
          </>
        ) : scenes ? (
          <>
            {visualStyle && (
              <BlueprintBlockCard
                icon={Palette}
                label="Visual Style"
                body={visualStyle}
                ariaLabel="Visual style"
                copyToast="Visual style copied to clipboard"
                copyTitle="Copy the visual style"
                onChange={onEdit && styleSpan ? (next) => replaceRange(styleSpan.start, styleSpan.end, next) : undefined}
                onDelete={onEdit && styleBlock ? () => deleteRange(styleBlock.start, styleBlock.end) : undefined}
              />
            )}
            {voiceProfile && (
              <VoiceProfileCard
                body={voiceProfile}
                onChange={onEdit && voiceSpan ? (next) => replaceRange(voiceSpan.start, voiceSpan.end, next) : undefined}
                onDelete={onEdit && voiceBlock ? () => deleteRange(voiceBlock.start, voiceBlock.end) : undefined}
              />
            )}
            {scenes.map((scene, i) => (
              <SceneChunkCard
                key={i}
                chunk={scene}
                onEditRange={onEdit ? replaceRange : undefined}
                onDeleteRange={onEdit ? (start, end) => deleteInScene(i, start, end) : undefined}
                onDelete={onEdit ? () => deleteScene(i) : undefined}
                collapsed={collapsed.has(i)}
                onToggleCollapsed={() => toggleCollapsed(i)}
              />
            ))}
          </>
        ) : mode === 'reverse-engineer' ? (
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed tracking-tight text-ink-100">
            {text}
          </pre>
        ) : (
          // Each source line is its own paragraph: normal line-height within a
          // (wrapped) sentence, a slight gap between sentences, and a wider one
          // where the model left a blank line. The face is inherited from the
          // body (the system sans).
          // Each one is also the field that edits it — the line IS the editor,
          // and the span it writes back is its own position in the take, so a
          // sentence repeated twice in a script can't overwrite its twin.
          //
          // The two spacings are the row gap and `mt-2`, with no spacer elements
          // between them: every field carries `-my-1` (its hover tint bleeds
          // past the text), which eats 8px of whatever gap is set — so `gap-3.5`
          // is the 6px between sentences, and a paragraph break is that plus 8.
          <div className="flex flex-col gap-3.5 text-sm font-light leading-normal tracking-tight text-ink-100">
            {scriptLines.map(({ line, start, breakBefore }, i) => (
              <EditableText
                key={i}
                value={line}
                onCommit={onEdit ? (next) => replaceRange(start, start + line.length, next) : undefined}
                onDelete={onEdit ? () => deleteRange(start, start + line.length) : undefined}
                singleLine
                ariaLabel={`Line ${i + 1}`}
                className={`text-sm font-light leading-normal tracking-tight text-ink-100 ${breakBefore ? 'mt-2' : ''}`}
                render={<p>{line}</p>}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex select-none flex-col gap-2 border-t border-ink/5 p-3">
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={commitEdit}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-scripts-500/15 px-4 py-2.5 text-[12px] font-medium tracking-tight text-scripts-text transition-colors hover:bg-scripts-500/25"
            >
              <Check className="h-3.5 w-3.5" /> Done
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center justify-center gap-2 rounded-full border border-ink/15 px-4 py-2.5 text-[12px] font-medium tracking-tight text-ink-500 transition-colors hover:bg-ink/[0.06] hover:text-ink-200"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        ) : showSaveForm ? (
          <div className="flex gap-2">
            <input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              placeholder="Script title..."
              autoFocus
              className="flex-1 select-text rounded-full border border-ink/10 bg-transparent px-4 py-2 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-scripts-500/30"
            />
            <button
              onClick={handleSave}
              disabled={!saveTitle.trim()}
              className="rounded-full bg-scripts-500/15 px-4 py-2 text-xs font-medium text-scripts-text transition-colors hover:bg-scripts-500/25 disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveForm(false)}
              className="rounded-full px-4 py-2 text-xs text-ink-500 transition-colors hover:text-ink-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          // The takes column is the one this app narrows — a history rail took
          // 280px off it — so this row has to survive ~290px of usable width.
          // Two rules do it and each one alone fails: `whitespace-nowrap`
          // (without it a label that no longer fits wraps INSIDE its own pill,
          // so three buttons grew a second line each) and the `min-w` floor,
          // which makes the ROW wrap instead — two buttons on one line and the
          // third under them, every label intact — where `min-w-0` let all
          // three squeeze down to "Sa… / … / B…". The floor is sized to the
          // longest label WHOLE: shedding "Send to" at narrow widths was tried
          // for a day and came out (September 2026, Massimo's call), because
          // "Voiceovers" beside "Save to Bank" reads as a place rather than as
          // something the button does to this take.
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowSaveForm(true)}
              className={`flex min-w-[12rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-[12px] font-medium tracking-tight transition-colors ${
                saved
                  ? 'border-green-500/20 bg-green-500/10 text-green-400 light:text-green-600'
                  : 'border-ink/15 text-ink-300 hover:bg-ink/[0.06] hover:text-ink-100'
              }`}
            >
              {saved
                ? (<><Check className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Saved</span></>)
                : (<><Bookmark className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Save to Bank</span></>)}
            </button>
            {isHooks ? (
              // A hook pack has no full-script send target — each line is a
              // different video's opener. Copy per row / save the pack.
              null
            ) : (
              <>
                {isSpokenScript && (
                  <button
                    onClick={handleSendToVoiceStudio}
                    className="flex min-w-[12rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-voice-500/20 bg-voice-500/10 px-4 py-2.5 text-[12px] font-medium tracking-tight text-voice-400 transition-colors hover:bg-voice-500/20"
                  >
                    <Mic className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">Send to Voiceovers</span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  </button>
                )}
                <button
                  onClick={handleSendToBrollStudio}
                  className="flex min-w-[12rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-broll-500/20 bg-broll-500/10 px-4 py-2.5 text-[12px] font-medium tracking-tight text-broll-400 transition-colors hover:bg-broll-500/20"
                >
                  <Film className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">Send to B-Roll</span>
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                {!isSpokenScript && (
                  <button
                    onClick={handleSendToPlayground}
                    className="flex min-w-[12rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-[12px] font-medium tracking-tight text-emerald-400 light:text-emerald-600 transition-colors hover:bg-emerald-500/20"
                  >
                    <ImagePlay className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">Send to Playground</span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// A blueprint's master block — one paragraph that governs every scene in the
// take, rendered once ABOVE them. Two of them exist and they are the two things
// that must NOT drift between clips (the same pair the Ad Analyzer writes):
// the VOICE the scenes are read in, and the LOOK they are rendered in. Both are
// pasted in front of every scene's prompt, so both are the first thing copied,
// and at the bottom of a ten-scene column most members never scrolled far
// enough to find them. The model still emits the voice profile last (the prompt
// says so) and the visual style first; the splitters lift each one out wherever
// it landed, so only the render order moved.
function BlueprintBlockCard({
  icon: Icon,
  label,
  body,
  ariaLabel,
  copyToast,
  copyTitle,
  onChange,
  onDelete,
}: {
  icon: typeof Copy
  label: string
  body: string
  ariaLabel: string
  copyToast: string
  copyTitle: string
  onChange?: (next: string) => void
  // Clearing the paragraph removes the whole block — its header line included,
  // since the label alone governs nothing. Omitted for the remix run's own
  // voice brief, which belongs to no take and so rides no undo stack.
  onDelete?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const handleCopy = async () => {
    const ok = await copyToClipboard(body)
    if (ok) {
      setCopied(true)
      addToast(copyToast)
      setTimeout(() => setCopied(false), 2000)
    } else {
      addToast('Copy failed', 'error')
    }
  }
  return (
    <div className="rounded-2xl border border-scripts-500/15 bg-scripts-500/[0.04] p-3 card-soft-shadow">
      <div className="relative mb-2.5 flex select-none items-center justify-center gap-2 px-8">
        <BlockHeading icon={Icon} label={label} />
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <IconPillButton
            onClick={handleCopy}
            icon={Copy}
            active={copied}
            title={copied ? 'Copied' : copyTitle}
            className="hover:text-ink-300"
          />
        </div>
      </div>
      {/* A hairline under the heading, run to the card's edges (`-mx-3`
          cancels its padding) — the same seam every scene card wears. */}
      <div className="-mx-3 mb-2.5 border-b border-ink/5" />
      {/* Always-on field, not click-to-edit: this block is plain prose with
          nothing tinted in it, so a textarea styled as the paragraph looks
          identical and costs nothing — the same rule a spoken line and a script
          paragraph follow. Multi-line, since both blocks are a paragraph. */}
      <EditableText
        value={body}
        onCommit={onChange}
        onDelete={onDelete}
        ariaLabel={ariaLabel}
        className="whitespace-pre-wrap rounded-xl bg-surface-0 p-2.5 text-[13px] font-light leading-relaxed tracking-tight text-ink-100"
        render={(
          <div className="whitespace-pre-wrap rounded-xl bg-surface-0 p-2.5 text-[13px] font-light leading-relaxed tracking-tight text-ink-100">
            {body}
          </div>
        )}
      />
    </div>
  )
}

// The voice half, and the one shape with a second caller: a remix run reuses
// the card for its own brief, which arrives from its own call rather than out
// of a take (see `runRemixVoiceProfile`) and is attached to no variation. Both
// are headed "Voice Profile" — the remix one used to add "· optional", a
// status qualifier no card header carries.
function VoiceProfileCard({ body, onChange, onDelete }: { body: string; onChange?: (next: string) => void; onDelete?: () => void }) {
  return (
    <BlueprintBlockCard
      icon={Mic}
      label="Voice Profile"
      body={body}
      ariaLabel="Voice profile"
      copyToast="Voice profile copied to clipboard"
      copyTitle="Copy the voice profile"
      onChange={onChange}
      onDelete={onDelete}
    />
  )
}

// The in-place editor every output block uses: a textarea styled as the prose
// it replaces, with no chrome until you're in it (a hover tint says "editable"
// without printing a box around every line). There is no edit MODE to enter —
// you click the words and type, which is the whole point. CLEARING a block is
// how it gets deleted, so the two halves of editing a take are both here. The
// header's Edit button survives as the escape hatch, because a single box over
// the take text is still the only way to ADD a scene, a line, or a hook.
//
// The field is ALWAYS on — every block that takes one is plain text, so a
// textarea styled as the paragraph looks identical and costs nothing. A
// `clickToEdit` variant used to exist for the two blocks whose render added the
// [CHARACTER] / [PRODUCT] tint, which a bare textarea can't reproduce; those now
// use `TokenField`, which paints the tint behind a real field instead, so
// nothing has to swap on click any more.
// `render` IS the read-only rendering when no `onCommit` is given, so a card
// without an edit handler looks exactly as it did before.
function EditableText({
  value,
  onCommit,
  onDelete,
  className,
  ariaLabel,
  singleLine = false,
  render,
}: {
  value: string
  // Omitted → read-only. A card with no edit handler renders exactly as before.
  onCommit?: (next: string) => void
  // Clearing the field REMOVES the block. Omitted → an emptied field reverts,
  // which is what a block with no well-defined cut has to do.
  onDelete?: () => void
  className: string
  ariaLabel: string
  // Enter commits instead of breaking the text in two, and anything pasted in
  // is flattened. For a hook or a spoken line, which are one line by definition.
  singleLine?: boolean
  render?: ReactNode
}) {
  const [draft, setDraft] = useState(value)
  const [sync, setSync] = useState(value)
  // Escape has to be able to cancel WITHOUT the blur it triggers committing the
  // draft it just discarded — setDraft is async, so `commit` would still read
  // the typed value. A ref is the only thing that's already updated by then.
  const reverting = useRef(false)
  if (value !== sync) {
    setSync(value)
    setDraft(value)
  }

  if (!onCommit) return <>{render ?? value}</>

  const commit = () => {
    if (reverting.current) {
      reverting.current = false
      setDraft(value)
      return
    }
    const next = singleLine ? draft.replace(/\s+/g, ' ').trim() : draft.trim()
    // Clearing a block IS how it gets deleted — select the line, delete it, and
    // it goes, which is what a member who empties a field is asking for. It used
    // to put the text back, so the only way to drop a line was the raw editor
    // and every attempt to do it in place read as the edit failing to save.
    // Undo covers it like any other edit. A block with no `onDelete` still
    // reverts: the cut isn't defined there, and prose that silently vanishes is
    // worse than prose that comes back.
    if (!next) {
      if (onDelete) onDelete()
      setDraft(value)
      return
    }
    if (next !== draft) setDraft(next)
    if (next !== value) onCommit(next)
  }

  return (
    <AutoGrowTextarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          reverting.current = true
          e.currentTarget.blur()
        }
      }}
      rows={1}
      spellCheck={false}
      aria-label={ariaLabel}
      // No fill on focus. It used to go `bg-surface-0` — near-black — the
      // instant the caret landed, so clicking a line to fix a word read as a
      // black editor box opening over the script. A field that looks exactly
      // like the prose it replaced is the whole idea; the hover tint says
      // "editable" on the way in and gets out of the way once you're typing.
      className={`-mx-1.5 -my-1 w-[calc(100%+0.75rem)] cursor-text resize-none rounded-lg bg-transparent px-1.5 py-1 outline-none transition-colors hover:bg-ink/[0.04] ${className}`}
    />
  )
}

// One hook in the pack — its family chip, the spoken line, and a copy button.
// The copy target is the clean line only (the chip is UI metadata).
//
// The line IS the editor when `onChange` is given: it's a textarea styled as
// the paragraph it replaces, so clicking a hook puts the caret in it. There's
// no edit mode to enter, which is the whole point — the alternative was
// swapping the ten rendered rows for one raw box of <FAMILY> tags to fix a
// typo in line 3.
function HookLineCard({ hook, index, onChange, onDelete }: { hook: ParsedHook; index: number; onChange?: (text: string) => void; onDelete?: () => void }) {
  const [copied, setCopied] = useState(false)
  // Local draft so a keystroke doesn't re-serialise and re-parse the whole
  // pack; committed on blur. `sync` tells our own commit from an external
  // change (an undo, a new generation) and re-seeds the draft for the latter.
  const addToast = useAppStore((s) => s.addToast)

  const handleCopy = async () => {
    const ok = await copyToClipboard(hook.text.replace(/\s+/g, ' ').trim())
    if (ok) {
      setCopied(true)
      addToast('Hook copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } else {
      addToast('Copy failed', 'error')
    }
  }
  return (
    <div className="rounded-2xl border border-ink/5 bg-ink/[0.02] p-3 transition-colors focus-within:border-scripts-500/30 card-soft-shadow">
      <div className="mb-1.5 flex select-none items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-ink-600">{index + 1}</span>
          {hook.category && (
            <span className="truncate rounded-full bg-scripts-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-tight text-scripts-300">
              {HOOK_CATEGORY_META[hook.category].label}
            </span>
          )}
        </span>
        <IconPillButton
          onClick={handleCopy}
          icon={Copy}
          active={copied}
          title={copied ? 'Copied' : 'Copy this hook'}
          className="hover:text-ink-300"
        />
      </div>
      <EditableText
        value={hook.text}
        onCommit={onChange}
        onDelete={onDelete}
        singleLine
        ariaLabel={`Hook ${index + 1}`}
        className="text-sm font-light leading-normal tracking-tight text-ink-100"
        // Read-only fallback keeps the paragraph it always was.
        render={<p className="text-sm font-light leading-normal tracking-tight text-ink-100">{hook.text}</p>}
      />
    </div>
  )
}

// Every editable block on this panel is a form field, and the fields are what
// the prose lives in.
const PANEL_FIELD = 'input, textarea, [contenteditable="true"]'

// The other half of the `select-none` chrome rule. Marking a header or a Copy
// button unselectable keeps it out of the highlight, but it ALSO tells Chrome to
// leave an existing selection alone when you press on it — the behaviour a
// rich-text toolbar wants, and the reason a highlight in this panel could look
// stuck: clicking the nearest thing to "somewhere else" (a scene header, a copy
// button) did nothing to it. Collapse it ourselves, which is what a click on
// ordinary page background does anyway.
//
// That fixed half of it. The other half is that every block of prose here is a
// TEXTAREA — the take is edited in place, so a highlight you drag across a
// scene direction or a spoken line is the FIELD's own selection, which
// `window.getSelection()` doesn't own and `removeAllRanges` can't touch. The
// browser keeps painting it for as long as the field holds focus, and pressing
// unselectable chrome doesn't take focus away (Safari never focuses a button on
// click), so the highlight outlived every click that should have cleared it and
// the only way out was to start another drag somewhere else. Blurring the field
// is what actually clears it — and it commits the edit exactly as clicking into
// another field already does.
function clearSelectionOnChrome(e: React.MouseEvent) {
  const target = e.target as Element | null
  if (!target) return
  // A press that lands IN a field is the browser's own business: it moves the
  // caret there and drops whatever was selected before.
  if (target.closest(PANEL_FIELD)) return
  const active = document.activeElement
  if (active instanceof HTMLElement && active.matches(PANEL_FIELD)) active.blur()
  if (getComputedStyle(target).userSelect !== 'none') return
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) selection.removeAllRanges()
}

// `onEditRange` splices a span of the TAKE text — the chunk's own `bodyStart`
// plus the segment's offset within the body. That's what makes editing a scene
// where it sits exact: no search (two scenes can share a sentence) and no
// reconstruction (the parse trims, strips and filters, so it doesn't round-trip).
function SceneChunkCard({
  chunk,
  onEditRange,
  onDeleteRange,
  onDelete,
  collapsed = false,
  onToggleCollapsed,
}: {
  chunk: SceneChunk
  onEditRange?: (start: number, end: number, next: string) => void
  // Emptying a block inside the scene cuts that span out — and cutting the last
  // one takes the whole scene, which the caller decides.
  onDeleteRange?: (start: number, end: number) => void
  // Omitted → no delete button (a card with no edit handler is read-only).
  onDelete?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const handleCopy = async () => {
    const ok = await copyToClipboard(chunk.body)
    if (ok) {
      setCopied(true)
      addToast('Scene copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } else {
      addToast('Copy failed', 'error')
    }
  }
  // Split the paragraph into direction + spoken lines, then regroup those into
  // the SHOTS the scene was written as. A body with neither a quoted line nor a
  // shot marker (a silent single-shot beat, or a shape the parser doesn't
  // recognise) comes back null and falls through to the plain prose block, so
  // nothing can render as an empty card.
  const { beats, audioNote } = useMemo(() => {
    const grouped = groupSceneBeats(splitSpokenLines(chunk.body))
    const spoken = grouped.some((b) => b.segments.some((seg) => seg.kind === 'line'))
    if (!spoken && !grouped.some((b) => b.time)) return { beats: null, audioNote: null }
    return { beats: grouped, audioNote: liftAudioNote(grouped) }
  }, [chunk.body])
  const { label, time } = splitHeaderTime(chunk.header)
  const duration = time ? rangeDurationLabel(time) : null
  return (
    <div className="rounded-2xl border border-ink/5 bg-ink/[0.02] p-3 card-soft-shadow">
      {/* The header wraps rather than truncating — a scene label plus its
          timecode outruns a narrow pane, and the timing is the half a member
          came here to read. Symmetric padding on a row whose chrome is pinned
          to both edges: the label centres on the CARD, not on whatever is left
          over between the buttons. */}
      <div className="relative mb-2.5 flex select-none flex-wrap items-center justify-center gap-x-2 gap-y-1 px-16">
        {/* Fold, not delete — a scene you're done with gets out of the way of
            the one you're working on, and the take text is untouched. */}
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title={collapsed ? 'Show scene' : 'Hide scene'}
            aria-label={collapsed ? 'Show scene' : 'Hide scene'}
            aria-expanded={!collapsed}
            className="absolute left-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink/5 hover:text-ink-300"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
        <span className="text-center text-[13px] font-semibold tracking-tight text-ink-100">
          {titleCaseLabel(label)}
        </span>
        {/* The timecode as its own pill: tabular figures so a column of scenes
            lines up digit for digit, and one step brighter than the label,
            because "where does this beat land" is what's being scanned for.
            The range is followed by how long it RUNS — the range alone is two
            clock times to subtract, and the answer is what the scene gets shot
            and generated at. */}
        {time && (
          <span className="shrink-0 rounded-full bg-scripts-500/[0.14] px-2 py-0.5 text-[11px] font-semibold tabular-nums tracking-tight text-scripts-text">
            {time}
            {duration && <span className="opacity-60"> · {duration}</span>}
          </span>
        )}
        <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {/* A scene with no shot markers has no shot row to carry these, so the
              scene header is the only place a single-take beat can be sent
              from. */}
          <SendToPlaygroundButton text={chunk.body} unit="scene" />
          <IconPillButton
            onClick={handleCopy}
            icon={Copy}
            active={copied}
            title={copied ? 'Copied' : 'Copy this scene'}
            className="hover:text-ink-300"
          />
          {/* The house two-click delete, in its panel skin — never a modal. It
              cuts the scene out of the take and renumbers what's left, and it
              rides the card's undo stack like every other edit here. */}
          {onDelete && (
            <TileDeleteButton
              onDelete={onDelete}
              title="Delete scene"
              variant="chrome"
              size="sm"
              alwaysVisible
            />
          )}
        </div>
      </div>
      {/* The heading's hairline, as on the Visual Style / Voice Profile cards. */}
      <div className="-mx-3 mb-2.5 border-b border-ink/5" />
      {collapsed ? (
        // One dim line of the body, so a folded scene is still findable — the
        // point is to get it out of the way, not to hide which one it is.
        <p className="truncate px-1 text-[12px] font-light tracking-tight text-ink-600">{chunk.body}</p>
      ) : beats ? (
        <div className="flex flex-col gap-2">
          {beats.map((beat, i) => (
            <SceneBeatBlock
              key={i}
              beat={beat}
              body={chunk.body}
              audioNote={audioNote?.text ?? null}
              onEditRange={onEditRange ? (start, end, next) => onEditRange(chunk.bodyStart + start, chunk.bodyStart + end, next) : undefined}
              onDeleteRange={onDeleteRange ? (start, end) => onDeleteRange(chunk.bodyStart + start, chunk.bodyStart + end) : undefined}
            />
          ))}
          {audioNote && (
            // Outside every shot box, because it belongs to the SCENE rather
            // than to whichever shot it happened to be written at the end of —
            // which is also why each shot's Copy carries a copy of it. Dimmer
            // than a direction: nothing here gets shot, it rides along with
            // whatever does.
            <TokenField
              value={audioNote.text}
              onCommit={onEditRange ? (next) => onEditRange(chunk.bodyStart + audioNote.start, chunk.bodyStart + audioNote.end, next) : undefined}
              onDelete={onDeleteRange ? () => onDeleteRange(chunk.bodyStart + audioNote.start, chunk.bodyStart + audioNote.end) : undefined}
              ariaLabel="Scene audio direction"
              className="-mx-1.5 -my-1 w-[calc(100%+0.75rem)] rounded-lg transition-colors hover:bg-ink/[0.04]"
              padClass="px-1.5 py-1"
              textClass="text-[12px] font-light leading-relaxed tracking-tight text-ink-600"
            />
          )}
        </div>
      ) : (
        // No quoted line in this scene (a silent beat, or an Ad Analyzer
        // blueprint whose scenes are pure direction) — the whole body is one
        // block, and editing it writes back the whole body span.
        // Body matches the Write/Remix script output: inherited system sans + white.
        <TokenField
          value={chunk.body}
          onCommit={onEditRange ? (next) => onEditRange(chunk.bodyStart, chunk.bodyEnd, next) : undefined}
          onDelete={onDeleteRange ? () => onDeleteRange(chunk.bodyStart, chunk.bodyEnd) : undefined}
          ariaLabel="Scene prompt"
          className="rounded-xl bg-surface-0"
          padClass="p-2.5"
          textClass="text-[13px] font-light leading-relaxed tracking-tight text-ink-100"
        />
      )}
    </div>
  )
}

// One SHOT inside a scene — its `[0:00–0:04]` marker as a pill, the direction
// and the spoken line(s) that belong to it, and its own Copy. This is the block
// a member actually takes out of here: a clip is generated per shot, so copying
// one meant hand-selecting a run of prose out of the middle of a paragraph,
// with the scene's Copy (the whole body) and the line's Copy (the words alone)
// as the only two things a button could give you. Both of those survive — the
// line still copies for a voiceover, the scene still copies whole.
//
// An untimed beat (a single-shot scene, or the prose in front of the first
// marker) renders bare, exactly as the whole scene used to: a box and a header
// around the only thing in the card would say nothing.
function SceneBeatBlock({
  beat,
  body,
  audioNote,
  onEditRange,
  onDeleteRange,
}: {
  beat: SceneBeat
  // The scene body the beat's spans are offsets into. Copy SLICES the shot's
  // words out of it verbatim rather than rebuilding them from the parse, which
  // trims, strips connectives and peels the attribution cue off the direction.
  body: string
  // The scene's audio direction, appended to this shot's copy — written once
  // per scene, true of every shot in it.
  audioNote: string | null
  // Spans are BODY-relative; the caller adds the chunk's own offset.
  onEditRange?: (start: number, end: number, next: string) => void
  // Emptying a block removes it. Body-relative like the edit span, but for a
  // spoken line it is the WIDER `cut` span — the cue and the quote marks go
  // with the words.
  onDeleteRange?: (start: number, end: number) => void
}) {
  const [copied, setCopied] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const rendered = beat.segments.map((segment, i) =>
    segment.kind === 'line' ? (
      <SpokenLine
        key={i}
        speaker={segment.speaker}
        text={segment.text}
        onChange={onEditRange ? (next) => onEditRange(segment.start, segment.end, next) : undefined}
        onDelete={onDeleteRange ? () => onDeleteRange(segment.cutStart, segment.cutEnd) : undefined}
      />
    ) : (
      // Direction is context for the shot, not the script — set a step down in
      // size and weight so the eye lands on the line first. A live field with
      // the [CHARACTER] / [PRODUCT] slots washed in behind it: the tint is what
      // used to force this block to be click-to-edit, and it survives while you
      // type now.
      <TokenField
        key={i}
        value={segment.text}
        onCommit={onEditRange ? (next) => onEditRange(segment.start, segment.end, next) : undefined}
        onDelete={onDeleteRange ? () => onDeleteRange(segment.start, segment.end) : undefined}
        ariaLabel="Scene direction"
        className="-mx-1.5 -my-1 w-[calc(100%+0.75rem)] rounded-lg transition-colors hover:bg-ink/[0.04]"
        padClass="px-1.5 py-1"
        textClass="text-[12.5px] font-light leading-relaxed tracking-tight text-ink-400"
      />
    ),
  )
  if (!beat.time) return <div className="flex flex-col gap-2">{rendered}</div>

  // A line's span is the WORDS INSIDE its quote marks — that's what keeps an
  // edit from deleting the quotes the scene parser finds the line by — so a
  // shot that opens or ends on dialogue reaches out to the line's cue and
  // marks, or every copy of it hands over a half-quoted line (`shotSource`).
  const source = shotSource(beat, body)
  // The marker itself stays behind: what gets pasted is one clip's prompt, and
  // a timecode inside it is a direction the video model tries to render.
  const text = audioNote && !source.includes(audioNote) ? `${source}\n\n${audioNote}` : source
  const duration = rangeDurationLabel(beat.time)

  const handleCopy = async () => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      addToast('Shot copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } else {
      addToast('Copy failed', 'error')
    }
  }

  return (
    <div className="rounded-xl bg-surface-0 p-2.5">
      <div className="mb-1.5 flex select-none items-center justify-between gap-2">
        {/* The scene header's pill, one step quieter so the scene still leads:
            the range, then how long the shot RUNS — which is the number it gets
            generated at, and two clock times to subtract if the pill won't say
            it. */}
        <span className="shrink-0 rounded-full bg-scripts-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums tracking-tight text-scripts-300">
          {beat.time}
          {duration && <span className="text-scripts-300/60"> · {duration}</span>}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Both act on the SAME string — the shot's own words plus the
              scene's audio note — so what lands in Playground is what the
              clipboard would have given you. */}
          <SendToPlaygroundButton text={text} unit="shot" />
          <IconPillButton
            onClick={handleCopy}
            icon={Copy}
            active={copied}
            title={copied ? 'Copied' : "Copy this shot: its direction, its lines, and the scene's audio note"}
            className="hover:text-ink-300"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">{rendered}</div>
    </div>
  )
}

// Height of the take switcher, which floats OVER the scroll port so the takes
// pass under its frosted glass. Kept in sync by hand with the bar's own
// `h-[53px]` and the scroller's `pt-[73px]` (this + the column's own 20px
// inset) — a Tailwind class can't be built from a variable.
const SWITCHER_H = 53
// Below this the takes are just a column you scroll (see `showSwitcher`).
const SWITCHER_MIN_TAKES = 5

export default function OutputPanel({ variations, outputAngles, mode, liveMode, writeFormat, writeStyleLabel, hookCategoryLabel, hookCount = DEFAULT_HOOK_COUNT, linkedProductId, pendingRun, error, onRetry, findSource, runId, onEditVariation, voiceProfile, onEditVoiceProfile }: OutputPanelProps) {
  // Resolve the linked product so saved scripts get a meaningful default title
  // ("<Product> — Hook-Led Script").
  const products = useBankStore((s) => s.products)
  const product = linkedProductId ? products.find((p) => p.id === linkedProductId) : undefined
  const productName = product?.productName

  // A hooks pack (write mode + 'hooks' format) renders as tagged one-liners.
  const isHooks = mode === 'write' && writeFormat === 'hooks'

  // Take switcher — a 1/2/3 row above the cards that scrolls the matching take
  // into view. `activeTake` tracks which card is currently nearest the top so
  // the row highlights as you scroll, not just on click. Deliberately a scroll
  // rather than tabs: every take stays in one continuous column, so you can read
  // straight through them instead of committing to one at a time.
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const [activeTake, setActiveTake] = useState(0)

  // New RUN → reset to the first take and the top of the list. Keyed on the
  // run's identity, never on the takes' text: every block on a card is edited
  // in place, so the text changes under us constantly, and keying on it sent a
  // member who fixed a typo in take 3 back to the top of take 1 the moment they
  // committed it. The array identity is no use either — the parent hands down a
  // fresh array on every render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // No run to jump to: takes restored from a persisted draft on mount (the
    // list is at the top already), or the row being shown was just deleted from
    // History — neither is a reason to move what the member is reading.
    if (!runId) return
    setActiveTake(0)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [runId])
  /* eslint-enable react-hooks/set-state-in-effect */

  // The switcher earns its 53px only on a batch you'd actually lose your place
  // in (September 2026, Massimo's call). At three takes it was a row of glass
  // over the top of the first one for a column you can read straight down —
  // the whole point of the scroll-jump shape is that the takes are one
  // continuous column, and at that length scrolling IS the switcher.
  const showSwitcher = variations.length >= SWITCHER_MIN_TAKES
  // It only floats when it's rendered, so the scroll maths only owes it
  // clearance then.
  const switcherOffset = showSwitcher ? SWITCHER_H : 0

  const scrollToTake = (i: number) => {
    setActiveTake(i)
    const card = cardRefs.current[i]
    const container = scrollRef.current
    if (!card || !container) return
    const top = card.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    suspendChromeAutoHide()
    container.scrollTo({ top: Math.max(0, top - 20 - switcherOffset), behavior: 'smooth' })
  }

  const handleScroll = () => {
    const container = scrollRef.current
    if (!container) return
    // At the bottom the trailing cards can't reach the top, so anchor the
    // last take as active; otherwise pick the last card whose top has scrolled
    // past the container's upper edge.
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4
    let idx = variations.length - 1
    if (!atBottom) {
      const cTop = container.getBoundingClientRect().top
      idx = 0
      for (let i = 0; i < variations.length; i++) {
        const card = cardRefs.current[i]
        if (card && card.getBoundingClientRect().top - cTop <= switcherOffset + 40) idx = i
      }
    }
    setActiveTake((prev) => (prev === idx ? prev : idx))
  }

  // Empty + loading copy follows the live selector (what you're about to make);
  // the cards themselves follow `mode` (what actually produced them).
  const copyMode = liveMode ?? mode

  if (pendingRun) {
    const message = pendingRun.mode === 'write'
      ? (pendingRun.writeFormat === 'hooks'
          ? ['Reading your brief...', 'Digging through the hook library...', `Writing ${pendingRun.hookCount} hooks...`, 'Cutting the weak ones...']
          : ['Reading your brief...', 'Writing the scripts...', 'Making it sound human...', 'Tightening the hooks...'])
      : pendingRun.mode === 'remix'
        ? ['Building the angles...', 'Sending parallel requests...', 'Writing variations...', 'Polishing final drafts...']
        : ['Reading the scenes...', 'Mapping product into structure...', 'Rewriting scenes...', 'Preserving structure...']
    // The cards this run is about to land, and what each will be called. Read
    // off the RUN, never the live selectors — a member browsing History
    // mid-write moves those, and the pane would relabel a run in flight.
    // Hooks come back as one card holding N lines; everything else is one card
    // per variation, and the blueprint rewrite returns a single script.
    const pendingTitles =
      pendingRun.mode === 'write' && pendingRun.writeFormat === 'hooks'
        ? [`Hooks · ${HOOK_CATEGORY_META[pendingRun.hookCategory]?.label ?? 'Best Mix'}`]
        : pendingRun.mode === 'reverse-engineer'
          ? ['Scene Prompts']
          : Array.from({ length: Math.max(1, pendingRun.variationCount) }, (_, i) =>
              pendingRun.mode === 'write' ? `Script ${i + 1}` : `Variation ${i + 1}`)
    return (
      <GridCanvas className="h-full">
        <div className="relative flex h-full flex-col gap-2 p-5">
          <GenerationProgress isActive color="bg-scripts-500" messages={message} showHelper={false} />
          {/* The takes' own scroller and the takes' own card shell, one per
              card this run will land — so the writing face IS the shape of the
              finished pane, and a take replacing its placeholder doesn't move
              anything on screen.

              It was ONE stretched slab wearing a 90px accent halo
              (`shadow-[0_0_90px_-24px_…]`), which is what Massimo reported as
              tacky in September 2026: a saturated glow bleeding onto the grid
              canvas reads as a light leak rather than as a status, and it was
              the third thing on one box already saying "box" with a border and
              a raised fill. The rule the skeletons themselves follow applies to
              it (see `.skeleton` in index.css): the progress bar and the
              rotating status line above are what say the work is running, and
              anything added underneath is decoration on a signal that is
              already there. The header band carries the take's real name
              instead, which the glow never did. */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {pendingTitles.map((title, i) => (
              // `VariationCard`'s shell, verbatim — same radius, border, fill
              // and soft shadow in both themes. Keep the two in step.
              <div key={i} className="flex shrink-0 flex-col overflow-hidden rounded-3xl border border-ink/10 bg-ink/[0.06] light:bg-[#F1F1F2] card-soft-shadow">
                <div className="flex h-12 select-none items-center justify-center border-b border-ink/5 px-12">
                  <CardTitle title={title} />
                </div>
                {/* One breathe for the block — see `.skeleton-group` in
                    index.css. The wrapper is what animates, not each line, and
                    one wrapper per card is one composited layer per card. */}
                <div className="skeleton-group flex flex-col gap-3 p-5">
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-[90%]" />
                  <div className="skeleton h-4 w-[95%]" />
                  <div className="skeleton h-4 w-[70%]" />
                  <div className="mt-2 skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-[85%]" />
                  <div className="skeleton h-4 w-[92%]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </GridCanvas>
    )
  }

  if (variations.length === 0) {
    // The house empty stage (`AwaitingBody`): a Title Case title over one line
    // of prose, at the shared type ramp — the shape B-Roll's storyboard and the
    // Characters / Playground galleries wear before their first run. It was a
    // one-off here, a lone sentence at ink-700, dim enough to read as disabled.
    // Remix with an empty box has nothing to wait FOR, so it says what Remix
    // needs and offers the three ways to get it, instead of "Awaiting
    // Variations" over a Generate that can't run. An error still wins: it is
    // about the run just fired, and its Retry is the way forward from there.
    const needsSource = !error && findSource
    const [title, hint] = needsSource
      ? ['Bring an Ad to Remix', "Remix rewrites a winning ad's words for your product. Start from one of these."]
      : copyMode === 'write'
        ? writeFormat === 'hooks'
          ? ['Awaiting Hooks', `Your ${hookCount} hooks land here, each ready to copy or save.`]
          : ['Awaiting Scripts', 'Each script lands here as its own card, ready to edit, save or send on.']
        : copyMode === 'remix'
          ? ['Awaiting Variations', 'Each variation lands here as its own card, ready to edit or save.']
          : ['Awaiting Scene Prompts', 'The rewritten scenes land here, one prompt per scene.']
    return (
      <GridCanvas className="h-full">
        <AwaitingBody icon={PenLine} title={title} hint={hint}>
          {error && (
            <div className="mt-2 flex max-w-sm flex-col items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-left">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
                <p className="text-xs leading-relaxed text-red-300 light:text-red-700">{error}</p>
              </div>
              {/* The way forward from here. It resumes the run while kie still
                  holds a take (and says so), else writes it again — the choice
                  is the app's, so the button is just "Retry". */}
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="ml-[22px] flex h-7 items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.04] px-3 text-[12px] font-semibold text-ink-100 transition-colors hover:bg-ink/[0.08]"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              )}
            </div>
          )}
          {needsSource && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {findSource.onFindOutlier && (
                <SourceButton icon={Radar} label="Find One in Outliers" onClick={findSource.onFindOutlier} />
              )}
              <SourceButton icon={Eye} label="Analyze an Ad" onClick={findSource.onAnalyzeAd} />
              <SourceButton icon={FileText} label="Pick a Saved Script" onClick={findSource.onPickScript} />
            </div>
          )}
        </AwaitingBody>
      </GridCanvas>
    )
  }

  // Prefer what the run actually used; fall back to matching by count for rows
  // saved before the angle list was stamped.
  const angles = outputAngles?.length === variations.length
    ? outputAngles
    : remixAnglesForCount(variations.length)
  const takeUnit = mode === 'remix' ? 'Variation' : 'Script'

  // No canvas once the takes are in: the grid marks an empty stage waiting for
  // work, and behind finished output it's just texture under the reading.
  return (
    <ShownRunContext.Provider value={pendingRun ? null : runId ?? null}>
    <div className="relative flex h-full flex-col overflow-hidden" onMouseDown={clearSelectionOnChrome}>
      {/* Floats OVER the scroll port rather than sitting above it, so the takes
          slide under its frosted glass as you read. Absolute, not `sticky`: it
          is a sibling of the scroller and never moves, so the compositor can't
          leave it a frame behind its own container — the artifact that took the
          glass off B-Roll's storyboard strips. The GLASS is on the pill, not on
          a full-width bar: the bar drew a second panel edge across the top of
          the takes for a control that only ever occupies its middle, and a
          backdrop root spanning the pane is a wider invalidation than a
          switcher needs. The row it sits in is `pointer-events-none`, so the
          dead space either side of the pill still scrolls the takes under it. */}
      {showSwitcher && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[53px] select-none items-center justify-center px-5">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-ink/10 bg-surface-1/70 p-0.5 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.45)] backdrop-blur-2xl backdrop-saturate-150 light:bg-white/70">
            {variations.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToTake(i)}
                aria-label={`Jump to ${takeUnit} ${i + 1}`}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors ${
                  activeTake === i
                    ? 'bg-scripts-500/15 text-scripts-300'
                    : 'text-ink-500 hover:bg-ink/5 hover:text-ink-200'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto p-5 ${showSwitcher ? 'pt-[73px]' : ''}`}
      >
        {/* Above the takes and inside the scroller: it's the first thing on the
            page but it isn't a header — it scrolls away with everything else,
            because most runs it's a paragraph the member never touches. The
            take switcher jumps by card offset, so nothing above it needs to
            know this is here. */}
        {mode === 'remix' && voiceProfile && (
          <VoiceProfileCard body={voiceProfile} onChange={onEditVoiceProfile} />
        )}
        {variations.map((text, i) => {
          const isRemix = mode === 'remix'
          const isWrite = mode === 'write'
          const angleLabel = isRemix && angles ? REMIX_ANGLE_LABEL[angles[i]] : null
          const cardTitle = isHooks
            ? `Hooks · ${hookCategoryLabel ?? 'Best Mix'}`
            : isWrite
              ? `Script ${i + 1}${writeStyleLabel ? ` · ${writeStyleLabel}` : ''}`
              : angleLabel
                ? `Variation ${i + 1} · ${angleLabel}`
                : isRemix
                  ? `Variation ${i + 1}`
                  : 'Scene Prompts'
          const defaultSaveTitle = isHooks
            ? (productName ? `${productName} · Hooks (${hookCategoryLabel ?? 'Best Mix'})` : `Hooks · ${hookCategoryLabel ?? 'Best Mix'}`)
            : isWrite && productName
              ? `${productName} · ${writeStyleLabel ?? 'New'} Script ${i + 1}`
              : isRemix && productName
                ? `${productName} · ${angleLabel ?? `Variation ${i + 1}`} Script`
                : deriveTitleFromContent(
                      text,
                      mode === 'reverse-engineer' ? 'Rewritten Scenes' : 'Untitled Script',
                    )
          return (
            <VariationCard
              key={i}
              cardRef={(el) => { cardRefs.current[i] = el }}
              text={text}
              cardTitle={cardTitle}
              defaultSaveTitle={defaultSaveTitle}
              linkedProductId={linkedProductId}
              mode={mode}
              isHooks={isHooks}
              onEdit={onEditVariation ? (newText) => onEditVariation(i, newText) : undefined}
            />
          )
        })}
      </div>
    </div>
    </ShownRunContext.Provider>
  )
}

// One way into a Remix source on the empty canvas: the house neutral pill,
// with the glyph of the app it opens (Outliers' radar, the Ad Analyzer's eye),
// so the three read as destinations rather than as three versions of Generate.
function SourceButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.03] px-3.5 text-[12px] font-semibold text-ink-200 transition-colors hover:border-scripts-500/30 hover:bg-scripts-500/10 hover:text-ink-100"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-scripts-text" strokeWidth={2} />
      {label}
    </button>
  )
}

// The heading over a block that governs every scene (Visual Style, Voice
// Profile): 13px Title Case with its icon, the qualifier after the middot a
// dimmer sentence-case tail. It was a 10px all-caps accent label, the hardest
// text on the card to read (September 2026, Massimo's call).
function BlockHeading({ icon: Icon, label }: { icon: typeof Copy; label: string }) {
  const [head, ...rest] = label.split(' · ')
  return (
    <span className="flex items-center gap-1.5 text-center text-[13px] font-semibold tracking-tight text-ink-100">
      <Icon className="h-3.5 w-3.5 shrink-0 text-scripts-text" strokeWidth={2} />
      {head}
      {rest.length > 0 && <span className="font-medium text-ink-500">· {rest.join(' · ')}</span>}
    </span>
  )
}

// A card's heading: 15px, Title Case, never all caps. "Script 1 · Problem–Agitate–Solution" splits at the first middot so
// the number stays whole and the style name is what truncates on a narrow pane.
function CardTitle({ title }: { title: string }) {
  const [head, ...rest] = title.split(' · ')
  return (
    <h3 className="flex min-w-0 items-baseline gap-1.5 text-[15px] font-semibold tracking-tight text-ink-100">
      <span className="shrink-0">{head}</span>
      {rest.length > 0 && <span className="truncate font-medium text-ink-500">· {rest.join(' · ')}</span>}
    </h3>
  )
}

// Derive a human-readable title from reverse-engineered prompt content.
// Strategy: skip scene dividers and label lines, find the first prose
// sentence, take ~6 words, Title Case. Falls back to a sensible default.
function deriveTitleFromContent(text: string, fallback = 'Untitled Script'): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    // Skip scene dividers ("--- Scene 1: HOOK ---") and short ALL-CAPS labels
    // ("HOOK", "VISUAL:", "VOICEOVER:").
    if (/^---/.test(line)) continue
    if (/^[A-Z][A-Z\s:]{0,30}:?$/.test(line)) continue
    // Skip lines that are only a bracketed section label, e.g. "[HOOK]".
    if (/^\[[^\]]+\]\s*$/.test(line)) continue
    // Strip leading markers like "[HOOK]", "Visual:", "Voiceover:", "1.", "- ".
    const cleaned = line
      .replace(/^\[[^\]]+\]\s*/, '')
      .replace(/^[*\-•]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^(visual|voiceover|action|dialogue|shot|scene|hook|cta)\s*[:-]\s*/i, '')
      .trim()
    if (cleaned.length < 6) continue
    const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned
    const words = firstSentence.split(/\s+/).slice(0, 7).join(' ')
    const trimmed = words.replace(/[.,;:!?-]+$/, '').trim()
    if (trimmed.length < 4) continue
    // Title case the first letter only; preserve original casing otherwise.
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  }
  return fallback
}

// Robust clipboard write with a textarea fallback for older browsers / non-
// secure contexts. Returns true if the copy succeeded.
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
