// Scene Clips: a scene script filmed one Playground clip per scene — the
// loop the channel's talking-head ads are made with by hand, as one run.
// Every clip goes through Playground's own runner, so each lands in
// Playground's history like one made there, stamped with the flow.
//
// With Continuity on, scene 1 is filmed first and its opening frame rides
// into every later scene as a reference — the step done by hand in the
// Seedance video (save the first frame to the bank, attach it to scene 2…)
// so the room and the light hold from clip to clip.
//
// Paying once: every submitted task is saved before its wait, and every
// finished clip is kept in the saved state until the run lands — so a
// reload, a Stop or a scene that failed re-films only what isn't made.

import type { Executor } from '../types'
import type { ClipRef } from '../../types'
import type { HeldValue } from '../../engine/plan'
import type { Lineage } from '../../../../stores/types'
import { playgroundRunner, planPlaygroundRun, type PlaygroundTask } from '../../../playground/runner'
import { FriendlyError, humanizeError } from '../../../../utils/friendlyError'
import { getBlob, saveAsset } from '../../../../utils/assetStore'
import { extractVideoFrame } from '../../../../utils/videoFrames'
import { matchTextOf, sceneClipInput, sceneRefs, scriptTextOf } from '../../engine/sceneClips'
import { sceneKey, sceneTakes, scenesToFilm, type SceneShot } from '../../engine/sceneShots'
import { taskIsDead } from '../errors'

interface ScenesResume {
  tasks?: Record<string, PlaygroundTask>
  done?: Record<string, ClipRef>
  // Scene 1's opening frame, once it's been taken, as an asset ref.
  frame?: string
}

// The frame a clip opens on, kept as an asset so every later scene can be
// handed it. Returns undefined when it can't be read — the scenes still film,
// just without the extra reference.
async function openingFrame(ref: string): Promise<string | undefined> {
  let url: string | null = ref
  let objectUrl: string | null = null
  if (ref.startsWith('asset')) {
    const blob = await getBlob(ref)
    if (!blob) return undefined
    objectUrl = URL.createObjectURL(blob)
    url = objectUrl
  }
  try {
    const frame = await extractVideoFrame(url, 'first')
    return await saveAsset(frame, 'image/png')
  } catch (err) {
    console.warn('[flow] scene 1 frame', err)
    return undefined
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function orderOf(key: string): [number, number] {
  const [scene, take] = key.split(':').map(Number)
  return [scene, take]
}

export const scenesExecutor: Executor = {
  async run(ctx) {
    const text = scriptTextOf(ctx.inst.inputs).trim()
    if (!text) throw new FriendlyError('The script wired into Scene Clips is empty. Check the block that writes it.')
    const { script, shots } = scenesToFilm(ctx.block, text, ctx.test, matchTextOf(ctx.inst.inputs))
    if (!shots.length) throw new FriendlyError('Scene Clips found no scenes in that script. Write it in Scripts as scenes, or turn on One Clip.')
    const takes = sceneTakes(ctx.block, ctx.test)
    const r: ScenesResume = { ...((ctx.resume as ScenesResume | undefined) ?? {}) }
    r.tasks = { ...(r.tasks ?? {}) }
    r.done = { ...(r.done ?? {}) }
    // A run topping up a finished one — the rest of a test, or a take added
    // since — keeps the clips it has. Run Block films the whole ad again.
    if (!ctx.fresh) {
      const before = ctx.prior?.outputs.clips?.[0]
      for (const c of before?.type === 'video' ? before.payload.clips : []) {
        if (c.scene !== undefined) r.done[sceneKey(c.scene, c.take ?? 0)] ??= c
      }
    }
    const save = () => ctx.save({ ...r, tasks: { ...r.tasks }, done: { ...r.done } })

    const wanted = shots.flatMap((shot) => Array.from({ length: takes }, (_, take) => ({ shot, take, key: sceneKey(shot.number, take) })))
    const total = wanted.length
    const count = () => Object.keys(r.done!).filter((k) => wanted.some((w) => w.key === k)).length
    const failed = new Map<number, unknown>()
    ctx.progress(`Scenes · ${count()} of ${total}`)

    const film = async ({ shot, take, key }: { shot: SceneShot; take: number; key: string }) => {
      if (r.done![key] || ctx.signal.aborted) return
      try {
        let task = r.tasks![key]
        if (!task) {
          // Scene 1's frame goes to every scene after it, never to itself.
          const frame = shot.number > 1 ? r.frame : undefined
          const input = sceneClipInput(ctx.block, script, shot, sceneRefs(ctx.block, ctx.inst.inputs, shot, frame))
          if (!input.modelId) throw new FriendlyError('Pick a video model in the Scene Clips block first.')
          const plan = planPlaygroundRun(input)
          if (plan.notices[0] && shot.number === 1 && take === 0) ctx.progress(plan.notices[0])
          task = await playgroundRunner.start(input, { signal: ctx.signal, provenance: ctx.provenance })
          r.tasks![key] = task
          save()
        }
        const made = await playgroundRunner.finish(task, { signal: ctx.signal })
        if (!('videoUrl' in made)) throw new FriendlyError('Scene Clips got something other than a clip back. Run it again.')
        r.done![key] = { ref: made.videoUrl, durationSeconds: made.durationSeconds, prompt: made.prompt, historyId: made.id, scene: shot.number, take }
        delete r.tasks![key]
        save()
        ctx.progress(`Scenes · ${count()} of ${total}`)
      } catch (err) {
        if (ctx.signal.aborted) return
        if (taskIsDead(err) && r.tasks![key]) {
          delete r.tasks![key]
          save()
        }
        if (!failed.has(shot.number)) failed.set(shot.number, err)
      }
    }

    // Continuity: scene 1 first, then its opening frame for the rest.
    const continuity = ctx.block.settings.continuity !== false && shots.length > 1 && ctx.block.settings.shape !== 'one'
    const first = continuity ? wanted.filter((w) => w.shot.number === shots[0].number) : []
    await Promise.all(first.map(film))
    if (continuity && !r.frame) {
      const opener = r.done[sceneKey(shots[0].number, 0)] ?? Object.values(r.done).find((c) => c.scene === shots[0].number)
      if (opener) {
        ctx.progress('Taking scene 1’s first frame')
        r.frame = await openingFrame(opener.ref)
        save()
      }
    }
    await Promise.all(wanted.filter((w) => !first.includes(w)).map(film))
    if (ctx.signal.aborted) return {}

    // Every scene needs at least one clip for the ad to hold together; a
    // missing take is filled by the next Run Flow (the plan counts it).
    const empty = shots.filter((s) => !Array.from({ length: takes }, (_, t) => r.done![sceneKey(s.number, t)]).some(Boolean))
    if (empty.length) {
      const why = failed.get(empty[0].number)
      const names = empty.map((s) => s.number).join(', ')
      throw new FriendlyError(
        `${empty.length === 1 ? `Scene ${names}` : `Scenes ${names}`} didn't film. ${humanizeError(why, 'The clip failed.')} The scenes that finished are kept, so Run Flow again films only ${empty.length === 1 ? 'that one' : 'those'}.`,
      )
    }

    const clips = Object.entries(r.done)
      .filter(([k]) => wanted.some((w) => w.key === k))
      .sort(([a], [b]) => orderOf(a)[0] - orderOf(b)[0] || orderOf(a)[1] - orderOf(b)[1])
      .map(([, c]) => c)
    const rows: Lineage[] = clips.filter((c) => c.historyId).map((c) => ({ bank: 'videoHistory', id: c.historyId! }))
    const lead = ctx.inst.inputs.script?.[0]
    const value: HeldValue = {
      type: 'video',
      key: `scenes:${clips.map((c) => c.historyId ?? c.ref).join('+')}`,
      label: lead?.label?.slice(0, 60) || `${shots.length} scenes`,
      payload: {
        clips,
        // What the edit captions from: the words said, scene by scene.
        scriptText: shots.map((s) => s.spoken).filter(Boolean).join('\n'),
        cover: r.frame,
      },
      lineage: rows,
    }
    return { outputs: { clips: [value] }, rows }
  },

  // Recording Mode reveals one hidden Playground clip per scene, the way
  // Playground's own Generate replays.
  async replay(ctx) {
    const text = scriptTextOf(ctx.inst.inputs).trim()
    const { script, shots } = scenesToFilm(ctx.block, text, ctx.test)
    const clips: ClipRef[] = []
    for (const [i, shot] of shots.entries()) {
      const made = await playgroundRunner.replay(sceneClipInput(ctx.block, script, shot, []), { extraMs: i * 400 })
      if (made && 'videoUrl' in made) clips.push({ ref: made.videoUrl, durationSeconds: made.durationSeconds, prompt: made.prompt, historyId: made.id, scene: shot.number, take: 0 })
    }
    if (!clips.length) return null
    return {
      outputs: {
        clips: [{
          type: 'video',
          key: `scenes:${clips.map((c) => c.historyId).join('+')}`,
          label: ctx.inst.inputs.script?.[0]?.label?.slice(0, 60) || `${shots.length} scenes`,
          payload: { clips, scriptText: shots.map((s) => s.spoken).join('\n') },
        }],
      },
    }
  },
}
