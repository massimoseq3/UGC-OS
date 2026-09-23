import { useCallback, useEffect, useRef, useState } from 'react'
import { Images, Wand2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import MobilePaneTabs from '../../components/MobilePaneTabs'
import { paneClass } from '../../components/paneClass'
import { clampBatchCount } from '../../utils/batchCount'
import { useReportActivity } from '../../stores/activityStore'
import type { VideoSourceClipPayload, ImageHistoryItem } from '../../stores/types'
import { isAssetRef, getAsBase64 } from '../../utils/assetStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { playgroundRunner, planPlaygroundRun, isMotionControlRun, type PlaygroundPlan, type PlaygroundRunInput } from './runner'
import PromptPanel, { type PromptPanelState, type PromptRef } from './components/PromptPanel'
import { composePlaygroundPrompt } from './composePrompt'
import PlaygroundHistoryGrid from './components/PlaygroundHistoryGrid'
import { getDefaultModel, getModel, type AspectRatio } from '../../utils/models'
import type { PlaygroundMode, InFlightGen } from './types'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'
import { humanizeError } from '../../utils/friendlyError'
import { isPollTimeout } from '../../utils/kie'
import { isRecordingActive, useRecordingLoop, useRecordingLoopSince } from '../../stores/recordingStore'
import { useBankStore } from '../../stores/bankStore'

// How long an in-flight task stays resumable. A poll timeout no longer drops
// the tile (the kie task may still be rendering — Seedance 2 can run 15+ min),
// so the entry survives until either it finishes on a later poll/refresh or it
// crosses this age, at which point we give up and clear the tile. Must be
// comfortably larger than the poll budget (VIDEO_POLL_ATTEMPTS ≈ 20 min) so a
// refresh after kie finishes still has a window to download the result.
const STALE_TASK_MS = 60 * 60 * 1000 // 60 minutes

// Uploaded audio/video clips are data URIs far beyond the localStorage quota
// (a 15MB clip is ~20MB of JSON), so they're kept in memory only — the
// persisted draft drops them. Bank-picked media (`asset://` refs) and image
// refs keep their existing persistence behaviour.
function pruneHeavyRefs(refs: PromptRef[]): PromptRef[] {
  return refs.filter(
    (r) => !(
      (r.slot === 'audio' || r.slot === 'video' || r.slot === 'omni-clip' || r.slot === 'motion-video') &&
      r.url.startsWith('data:')
    ),
  )
}

function initialState(): PromptPanelState {
  // Playground opens on the Image tab — the workflow it's used for starts with
  // a still, which the Animate button then carries into Video. Seed the model
  // from the user's last image pick (or the registry's image default) so the
  // picker isn't briefly out of sync with the mode on first paint.
  const defaultImage = getDefaultModel('playground', 'image', 'text-to-image')?.id ?? 'nano-banana-2'
  const persistedImage = useSettingsStore.getState().getAppModel('playground:image:text-to-image')
  return {
    mode: 'image',
    prompt: '',
    modelId: persistedImage ?? defaultImage,
    aspectRatio: '9:16',
    durationSeconds: 5,
    resolution: '1K', // snapped to the model's video default by sanitize / the constraint effect
    audio: true,
    instrumental: true,
    refs: [],
    batchCount: 1,
  }
}

export default function Playground() {
  const baseKey = useProjectScopedKey('playground')
  // Phone-only: which of the two panes is on screen (ignored from md up).
  const [pane, setPane] = useState<'prompt' | 'history'>('prompt')
  // Sanitize hydrated state so a few "users always want this" defaults
  // re-assert themselves on every load:
  // - Audio = on. Users routinely forget to flip the chip and end up with a
  //   silent video clip. Easier to mute occasionally than miss audio always.
  // - Instrumental = on. UGC ad scoring is overwhelmingly instrumental;
  //   lyrics are the rare case worth opting into per-track.
  // - Video resolution = clamped to a tier the picked model actually offers.
  //   Deliberately NOT re-stamped to the model's preferred default: that ran on
  //   every hydrate, so a member who chose a different tier lost it on the next
  //   refresh. The default belongs to picking a model, not to reloading a draft.
  const [state, setState] = usePersistedState<PromptPanelState>(`${baseKey}:state`, initialState(), {
    sanitize: (v) => {
      const next = { ...v, audio: true, instrumental: true, batchCount: clampBatchCount(v.batchCount) }
      // A persisted draft can point at a model that has since been removed
      // from the registry (e.g. a retired video model). Snap back to the
      // mode's default so generate doesn't throw "Unknown model".
      let m = getModel(v.modelId)
      if (!m) {
        const task = v.mode === 'image' ? 'image' : v.mode === 'music' ? 'music' : 'video'
        next.modelId = getDefaultModel('playground', task)?.id ?? next.modelId
        m = getModel(next.modelId)
      }
      const videoConstraints = m?.videoConstraints
      if (v.mode === 'video' && videoConstraints && !videoConstraints.resolutions.includes(v.resolution)) {
        next.resolution = videoConstraints.default ?? videoConstraints.resolutions[0] ?? next.resolution
      }
      return next
    },
    prune: (v) => ({ ...v, refs: pruneHeavyRefs(v.refs) }),
  })
  // Persisted across reload so a tab refresh / app switch can resume polling
  // an in-flight kie task. Tasks without a `taskId` (still in the createTask
  // leg when the tab died) and tasks older than 30 min are auto-expired on
  // mount — see the resume effect below.
  const [inFlight, setInFlight] = usePersistedState<InFlightGen[]>(`${baseKey}:inflight`, [])
  // Which project the history panel is showing and new generations are filed
  // under. `null` is All Generations — the view a member who has never made a
  // project stays in forever, and the one anything generated there stays
  // unfiled in.
  //
  // Browser-local rather than synced with the projects themselves: this is
  // where you are standing, not what you own, and a second device shouldn't be
  // dragged into the folder the first one happens to have open.
  const [activeProjectId, setActiveProjectId] = usePersistedState<string | null>(`${baseKey}:project`, null)
  const projects = useBankStore((s) => s.projects)
  // A pointer at a project that no longer exists — deleted here, deleted on
  // another device, or written before a hydrate that hasn't landed yet — falls
  // back to All Generations rather than showing an empty panel under a name
  // nothing can select. Derived, not an effect: a deleted project's row is gone
  // from the bank on the same render that removed it.
  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) ?? null : null
  const projectId = activeProject?.id ?? null
  // Recording Mode's fake generations (stores/recordingStore). Plain state,
  // never persisted and never given a taskId, so nothing can try to resume one.
  const [replayInFlight, setReplayInFlight] = useState<InFlightGen[]>([])
  const recordingLoop = useRecordingLoop()
  const loopSince = useRecordingLoopSince()
  // Per-tab prompt + refs. Each mode keeps its own inputs so typing a video
  // prompt and flipping to Image doesn't drag the text along. Persisted so a
  // refresh keeps every tab's draft. The active tab's inputs live in `state`;
  // this only holds the *other* tabs' stashed drafts.
  const [promptStash, setPromptStash] = usePersistedState<Record<PlaygroundMode, { prompt: string; refs: PromptRef[] }>>(
    `${baseKey}:promptstash`,
    { image: { prompt: '', refs: [] }, video: { prompt: '', refs: [] }, music: { prompt: '', refs: [] } },
    {
      prune: (v) => ({
        image: { ...v.image, refs: pruneHeavyRefs(v.image.refs) },
        video: { ...v.video, refs: pruneHeavyRefs(v.video.refs) },
        music: { ...v.music, refs: pruneHeavyRefs(v.music.refs) },
      }),
    },
  )
  // The live draft, read by handlers that must NOT be re-created on every
  // keystroke. `handleAnimateImage` is handed to the history grid: closing it
  // over `state` directly gave the grid a new prop on every character typed
  // into the prompt bar, which re-rendered every history row — at a few hundred
  // generations that alone was tens of milliseconds per keystroke. Reading
  // through the ref keeps the handler's identity stable, so React skips the
  // whole grid while you type.
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])
  const promptStashRef = useRef(promptStash)
  useEffect(() => { promptStashRef.current = promptStash }, [promptStash])

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)
  const addToast = useAppStore((s) => s.addToast)

  // Inter-app payload consumer: incoming refs / prompt seed from other apps.
  useEffect(() => {
    if (activeApp !== 'playground') return
    if (!interAppPayload || interAppPayload.targetApp !== 'playground') return
    const { targetField, data } = interAppPayload
    if (targetField === 'prompt' && typeof data === 'string') {
      setState((s) => ({ ...s, prompt: data }))
    } else if (targetField === 'videoPrompt' && typeof data === 'string') {
      // A scene or shot prompt from Scripts / the Ad Analyzer → land in video
      // mode with the prompt prefilled. Everything ELSE on the draft is left
      // alone, which is what makes this worth a button per shot: the Voice box,
      // the references and the model all survive, so sending shot after shot
      // only ever swaps the words.
      //
      // The mode flip stashes like `handleModeChange` does, and restores the
      // Video tab's own refs. Without the stash an image draft is silently
      // overwritten by the incoming prompt; without the restore you arrive on a
      // video prompt carrying the Image tab's attachments. Read through
      // `stateRef`, which this effect's sibling above has already refreshed.
      const draft = stateRef.current
      if (draft.mode === 'video') {
        setState((s) => ({ ...s, prompt: data }))
      } else {
        setPromptStash((prev) => ({ ...prev, [draft.mode]: { prompt: draft.prompt, refs: draft.refs } }))
        const restored = promptStashRef.current.video ?? { prompt: '', refs: [] }
        setState((s) => ({ ...s, mode: 'video', prompt: data, refs: restored.refs }))
      }
    } else if (targetField === 'imageRef' && typeof data === 'string') {
      setState((s) => ({
        ...s,
        refs: [...s.refs, { url: data, label: 'imported', source: 'upload', slot: 'ref' }],
      }))
    } else if (targetField === 'videoStartFrame') {
      // Accept either a bare data URI (string) or { imageUrl, prompt } from
      // upstream apps (B-Roll bank "Animate" sends the object form so the user
      // arrives with the source prompt already in the bar).
      let imageUrl: string | undefined
      let incomingPrompt: string | undefined
      if (typeof data === 'string') {
        imageUrl = data
      } else if (data && typeof data === 'object' && 'imageUrl' in data) {
        const obj = data as { imageUrl: string; prompt?: string }
        imageUrl = obj.imageUrl
        incomingPrompt = obj.prompt
      }
      if (imageUrl) {
        setState((s) => ({
          ...s,
          mode: 'video',
          prompt: incomingPrompt?.trim() ? incomingPrompt : s.prompt,
          refs: [...s.refs.filter((r) => r.slot !== 'start'), { url: imageUrl!, label: 'start', source: 'upload', slot: 'start' }],
        }))
      }
    } else if (targetField === 'videoSourceClip' && data && typeof data === 'object' && 'videoRef' in data) {
      // Generated video (B-Roll take, etc.) → Gemini Omni source clip, for
      // redubs/restyles of an existing clip. The Omni family is what takes a
      // source video at all, so the handoff switches to it outright, and it
      // picks Flash 1.1 — the newer of the two, and the same flat price on a
      // clip-input run (168 credits, 252 at 4k), so there is nothing to trade.
      // Refs are replaced wholesale: leftover images could bust the 7-slot
      // quota, and a stale start frame is worse here than it looks — 1.0 has no
      // frame fields and would fold it in as another reference, while 1.1 DOES,
      // so it would land as frame one and fight the clip for what the take
      // opens on. The prompt is left alone — with a source clip it's the change
      // instruction ("same take, dialogue in Spanish"), not a scene brief.
      const clip = data as VideoSourceClipPayload
      const omni = getModel('google/gemini-omni-flash-1-1')
      const knownDuration = Number.isFinite(clip.durationSeconds) && clip.durationSeconds! > 0
        ? clip.durationSeconds!
        : undefined
      // Same floor the trim inputs enforce (ends ≥ start + 0.5).
      const ends = Math.max(0.5, Math.min(10, knownDuration ?? 10))
      setState((s) => ({
        ...s,
        mode: 'video',
        modelId: 'google/gemini-omni-flash-1-1',
        resolution: omni?.videoConstraints?.default ?? s.resolution,
        audio: true,
        refs: [{
          url: clip.videoRef,
          label: clip.label ?? 'Source clip',
          source: 'broll',
          slot: 'omni-clip',
          clipStart: 0,
          clipEnds: Math.round(ends * 10) / 10,
          durationSeconds: knownDuration,
        }],
      }))
    }
    consumePayload()
  }, [interAppPayload, activeApp, consumePayload])

  // Resume-on-mount. Walks persisted inFlight[] and finishes any task that
  // still has a taskId. useRef<Set> guards against React 18 strict-mode
  // double-invoke. Only runs once on mount — new entries added during this
  // session don't need resume, they already run in handleSubmit.
  const resuming = useRef<Set<string>>(new Set())
  // Read the queue through a ref rather than closing over it with a suppressed
  // exhaustive-deps warning: a disabled React lint rule tells the React
  // Compiler the file breaks its rules, and it then skips optimizing this
  // WHOLE component — which is the one holding the prompt draft, so every
  // keystroke re-rendered the history grid beside it.
  const inFlightRef = useRef(inFlight)
  useEffect(() => { inFlightRef.current = inFlight }, [inFlight])
  // The deps below are stable identities, so this fires once — but the ref now
  // tracks the LIVE queue, so a re-fire would try to resume this session's own
  // gens (which handleSubmit already owns) and download each result twice.
  // The flag makes "once" structural rather than a property of the deps.
  const didResumeRef = useRef(false)
  useEffect(() => {
    if (didResumeRef.current) return
    didResumeRef.current = true
    for (const gen of inFlightRef.current) {
      if (resuming.current.has(gen.id)) continue
      if (!gen.taskId) {
        setInFlight((prev) => prev.filter((g) => g.id !== gen.id))
        continue
      }
      if (Date.now() - gen.startedAt > STALE_TASK_MS) {
        setInFlight((prev) => prev.filter((g) => g.id !== gen.id))
        addToast(`${gen.mode} generation expired. It ran too long to recover`, 'error')
        continue
      }
      resuming.current.add(gen.id)
      void playgroundRunner.finish({ ...gen, taskId: gen.taskId })
        .then(() => {
          addToast(`${gen.mode} resumed and ready`, 'success')
          setInFlight((prev) => prev.filter((g) => g.id !== gen.id))
        })
        .catch((err: unknown) => {
          if (isPollTimeout(err)) {
            // The poll budget ran out but kie may still be rendering. Leave the
            // entry persisted so a later refresh resumes it again; the staleness
            // guard above evicts it once it crosses STALE_TASK_MS.
            return
          }
          addToast(humanizeError(err, `Resume failed (${gen.mode})`), 'error')
          setInFlight((prev) => prev.filter((g) => g.id !== gen.id))
        })
        .finally(() => { resuming.current.delete(gen.id) })
    }
    // Mount-only in effect: `resuming` dedupes, and both deps are stable
    // identities (a zustand action and a useState setter).
  }, [addToast, setInFlight])

  async function handleSubmit() {
    if (!state.modelId) return

    // On a phone only one pane is on screen — follow the run to the grid.
    setPane('history')

    const mode = state.mode
    // Motion Control makes the prompt optional; everything else needs one.
    const isMotionControl = isMotionControlRun(mode, state.modelId)
    // The member's own text, not the composed string: a voice profile with no
    // prompt in front of it isn't a generation (and the button is already grey).
    if (!isMotionControl && !state.prompt.trim()) return

    // Snapshot every input synchronously so subsequent prompt-bar edits don't
    // mutate this job's params while it runs. The prompt is the one the model
    // will actually see — the member's text with the Voice box's profile on the
    // end. Composed here rather than folded into `state.prompt` so the box
    // keeps holding it across a Clear, an Enhance and the next idea, and every
    // tile, history row and Copy prompt shows the string that was sent.
    const input: PlaygroundRunInput = {
      mode,
      modelId: state.modelId,
      prompt: composePlaygroundPrompt(state, isMotionControl),
      refs: state.refs.slice(),
      aspectRatio: state.aspectRatio,
      resolution: state.resolution,
      durationSeconds: state.durationSeconds,
      audio: state.audio,
      instrumental: state.instrumental,
      characterOrientation: state.characterOrientation,
      // Snapshotted with everything else: a project switch while this renders
      // must not re-file the generation it was started for.
      projectId: projectId ?? undefined,
    }

    // The runner decides what this press sends — the inferred video mode, the
    // model the attached pictures need — and refuses a run that can't go.
    // What it trades away with a frame and a reference attached together is
    // said here, once per press, before the credits go.
    let plan: PlaygroundPlan
    try {
      plan = planPlaygroundRun(input)
    } catch (err) {
      addToast(playgroundRunner.describeError(err), 'error')
      return
    }
    for (const notice of plan.notices) addToast(notice, 'info')

    // What the in-flight tile shows while the run renders.
    const tile = {
      mode,
      modelId: plan.modelId,
      prompt: input.prompt,
      imageParams: plan.imageParams,
      videoParams: plan.videoParams,
      musicParams: plan.musicParams,
      projectId: input.projectId,
    }

    // One member of the run. Everything above is snapshotted once and shared by
    // all of them; each call here is its own kie task, its own in-flight tile
    // and its own history row — exactly what pressing Generate N times has
    // always produced, minus the N presses.
    const runOne = async (index: number) => {
    // Recording Mode: the tile renders for the replay length, then the oldest
    // hidden output of this tab comes back in its place. Nothing reaches kie.
    if (isRecordingActive()) {
      const fake: InFlightGen = { id: `replay-${crypto.randomUUID()}`, startedAt: Date.now(), ...tile }
      setReplayInFlight((prev) => [...prev, fake])
      const row = await playgroundRunner.replay(input, { extraMs: index * 700 })
      setReplayInFlight((prev) => prev.filter((g) => g.id !== fake.id))
      if (row) addToast(mode === 'image' ? 'Image ready' : mode === 'video' ? 'Video ready' : 'Track ready', 'success')
      return
    }
    const id = crypto.randomUUID()
    // Add to inFlight WITHOUT a taskId yet — covers the createTask leg.
    setInFlight((prev) => [...prev, { id, startedAt: Date.now(), ...tile }])

    // Leave the prompt + refs in place so the user can fire off the same (or a
    // tweaked) generation again immediately — gens run in parallel, each job
    // already snapshotted its own inputs above.

    try {
      const task = await playgroundRunner.start(input)
      // Patch the in-flight entry with the task so a refresh from this point
      // on resumes correctly — its taskId, the endpoint kie took it on, and
      // what it was made from.
      setInFlight((prev) => prev.map((g) => g.id === id ? { ...g, ...task } : g))
      // The runner writes the history row, which is what replaces the tile.
      await playgroundRunner.finish(task)
      addToast(mode === 'image' ? 'Image ready' : mode === 'video' ? 'Video ready' : 'Track ready', 'success')
      setInFlight((prev) => prev.filter((g) => g.id !== id))
    } catch (err) {
      if (isPollTimeout(err)) {
        // We stopped polling, but the kie task is very likely still rendering
        // (Seedance 2 can run 15+ min). Keep the in-flight entry persisted so
        // the resume-on-mount effect finishes the download on the next refresh.
        // Deleting it here was the "video succeeds on kie but never shows up"
        // bug — it's now evicted only once it crosses STALE_TASK_MS.
        const noun = mode === 'image' ? 'Image' : mode === 'music' ? 'Track' : 'Video'
        addToast(`${noun} is still rendering on kie. Refresh in a bit and it'll appear here once it's ready.`, 'info')
      } else {
        addToast(playgroundRunner.describeError(err), 'error')
        setInFlight((prev) => prev.filter((g) => g.id !== id))
      }
    }
    }

    // Music stays one per press: Suno already returns a pair of tracks for a
    // single call, so a count chip there would be billing twice for something
    // the API hands over anyway.
    const count = mode === 'music' ? 1 : clampBatchCount(state.batchCount)
    for (let i = 0; i < count; i++) void runOne(i)
  }

  // Switch tabs without bleeding inputs across them: stash the current tab's
  // prompt + refs, then restore whatever the target tab had last.
  function handleModeChange(nextMode: PlaygroundMode) {
    if (nextMode === state.mode) return
    setPromptStash((prev) => ({ ...prev, [state.mode]: { prompt: state.prompt, refs: state.refs } }))
    const restored = promptStash[nextMode] ?? { prompt: '', refs: [] }
    setState((s) => ({ ...s, mode: nextMode, prompt: restored.prompt, refs: restored.refs }))
  }

  // Image → Video handoff. The loop this app is actually used for is "make a
  // still, then animate it", which otherwise meant downloading the image,
  // flipping tabs, re-uploading it as a start frame and retyping the prompt.
  // Goes through the same stash as a manual tab switch so the Image tab keeps
  // its own draft instead of bleeding its refs into Video.
  //
  // Refs carry a renderable URL, not an asset id (FrameSlot renders the value
  // straight into an <img>), so the history item's asset is inlined first —
  // same conversion the Bank's own Animate button does.
  //
  // useCallback with only stable deps, because this is the grid's prop and the
  // grid is memoized: a fresh identity here would re-render every history row
  // on every keystroke in the prompt bar. The live draft comes from the refs.
  const handleAnimateImage = useCallback(async (item: ImageHistoryItem) => {
    let url = item.imageUrl
    if (isAssetRef(url)) {
      const asset = await getAsBase64(url)
      if (!asset) {
        addToast('That image is no longer available to animate.')
        return
      }
      url = `data:${asset.mimeType};base64,${asset.base64}`
    }
    const startRef: PromptRef = {
      url, label: 'start', source: 'upload', slot: 'start',
      parent: { bank: 'imageHistory', id: item.id },
    }
    const seedPrompt = item.prompt?.trim()

    // Read the draft through the ref, not the closure — see stateRef above.
    const draft = stateRef.current

    // Already on Video: just swap the start frame and leave the draft alone.
    if (draft.mode === 'video') {
      setState((s) => ({ ...s, refs: [...s.refs.filter((r) => r.slot !== 'start'), startRef] }))
      return
    }

    setPromptStash((prev) => ({ ...prev, [draft.mode]: { prompt: draft.prompt, refs: draft.refs } }))
    const restored = promptStashRef.current.video ?? { prompt: '', refs: [] }
    setState((s) => ({
      ...s,
      mode: 'video',
      // The prompt that made the still is the best starting point for the
      // motion; fall back to whatever the Video tab already had.
      prompt: seedPrompt || restored.prompt,
      refs: [...restored.refs.filter((r) => r.slot !== 'start'), startRef],
    }))
  }, [addToast, setState, setPromptStash])

  // Put a past generation's prompt back in the box, replacing what's there.
  //
  // Everything ELSE on the draft is left alone — the Voice box, the references,
  // the model — which is the same contract the Scripts handoff runs on: reusing
  // a prompt swaps the words and nothing else.
  //
  // It takes the card's own MODE because the history is no longer sliced by
  // tab: a project holds the stills, the clips and the track for one piece of
  // work, so the card you press Reuse on is routinely not the tab you are
  // standing in. Landing a video prompt in the Image box would hand it to a
  // model that can't make the thing it describes, so the tab follows the card,
  // through the same stash a manual tab switch uses — the outgoing draft is
  // kept and the target tab's own refs come back with it. `PromptPanel`'s own
  // effect snaps the model to the new tab, so nothing here has to.
  //
  // It genuinely REPLACES, with no undo of its own (`PromptPanel`'s stack only
  // tracks changes made inside the box). That's what the button says it does,
  // and it's how every other prompt handoff into this app already behaves.
  //
  // `useCallback` is not optional here: the history grid is `memo`'d against
  // hundreds of rows, and a fresh identity per render re-renders the whole list
  // on every keystroke in the prompt box. See the note on `stateRef` above.
  const handleReusePrompt = useCallback((prompt: string, mode: PlaygroundMode) => {
    const text = prompt.trim()
    if (!text) return
    // Read the draft through the ref, not the closure — see stateRef above.
    const draft = stateRef.current
    if (draft.mode === mode) {
      setState((s) => ({ ...s, prompt: text }))
    } else {
      setPromptStash((prev) => ({ ...prev, [draft.mode]: { prompt: draft.prompt, refs: draft.refs } }))
      const restored = promptStashRef.current[mode] ?? { prompt: '', refs: [] }
      setState((s) => ({ ...s, mode, prompt: text, refs: restored.refs }))
    }
    // On a phone only one pane is on screen and it's the grid you pressed this
    // from — follow the prompt to the panel that now holds it. No toast: the
    // box visibly changes, which is better feedback than a line of copy.
    setPane('prompt')
  }, [setState, setPromptStash])

  // Submit button no longer disables on in-flight count — users can queue
  // unlimited parallel generations. The prop stays for any future use.
  // Loop keeps one tile rendering on the open tab, built from the inputs on
  // screen, for cutaway footage.
  const loopGen: InFlightGen | null = recordingLoop && !inFlight.some((g) => g.mode === state.mode)
    ? {
        id: 'replay-loop',
        mode: state.mode,
        modelId: state.modelId ?? '',
        prompt: state.prompt,
        startedAt: loopSince,
        // The grid filters in-flight tiles by project like everything else —
        // without this the loop tile vanishes the moment a project is open.
        projectId: projectId ?? undefined,
        imageParams: state.mode === 'image' ? { aspectRatio: state.aspectRatio as AspectRatio } : undefined,
        videoParams: state.mode === 'video'
          ? { mode: 'text-to-video', aspectRatio: state.aspectRatio, durationSeconds: state.durationSeconds, resolution: state.resolution, audio: state.audio }
          : undefined,
        musicParams: state.mode === 'music' ? { instrumental: state.instrumental } : undefined,
      }
    : null
  const shownInFlight = [...inFlight, ...replayInFlight, ...(loopGen ? [loopGen] : [])]
  const isGenerating = shownInFlight.length > 0

  // Pulse the dock dot while any image/video/music generation is in flight.
  useReportActivity('playground', isGenerating)

  return (
    <div className="relative flex h-full flex-col">
      <MobilePaneTabs
        options={[
          { value: 'prompt', label: 'Prompt', icon: Wand2 },
          { value: 'history', label: 'History', icon: Images },
        ]}
        value={pane}
        onChange={setPane}
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Left — prompt panel. */}
        <div className={paneClass(pane === 'prompt', 'md:w-1/3 md:min-w-[380px] md:shrink-0 md:border-r md:border-ink/5')}>
          <PromptPanel
            state={state}
            onChange={setState}
            onModeChange={handleModeChange}
            onSubmit={handleSubmit}
            isGenerating={isGenerating}
          />
        </div>

        {/* Right — history grid */}
        <div className={paneClass(pane === 'history', 'md:flex-1 md:overflow-hidden')}>
          <PlaygroundHistoryGrid
            inFlight={shownInFlight}
            activeProjectId={projectId}
            onChangeProject={setActiveProjectId}
            onAnimateImage={handleAnimateImage}
            onReusePrompt={handleReusePrompt}
          />
        </div>
      </div>
    </div>
  )
}
