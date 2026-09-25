// The executors for blocks that are one generation per run: Voiceovers,
// Scripts, Characters (one per face), Playground, the Ad Analyzer, Outliers
// and Edit Pack. B-Roll, which is a storyboard, stills and clips, is in
// broll.ts.

import type { ExecContext, ExecOutput, Executor } from '../types'
import type { FlowValue } from '../../types'
import type { HeldValue } from '../../engine/plan'
import type { CharacterHistoryItem, ImageHistoryItem, Lineage, MusicHistoryItem, VideoHistoryItem, VoiceHistoryItem } from '../../../../stores/types'
import { useBankStore } from '../../../../stores/bankStore'
import { useSettingsStore, resolveTtsModel } from '../../../../stores/settingsStore'
import { FriendlyError } from '../../../../utils/friendlyError'
import { voiceRunner, type VoiceTask } from '../../../voice-studio/runner'
import { sanitizeVoiceSettings, settingsFromPreset, type VoiceSettings } from '../../../voice-studio/types'
import { scriptRunner, type ScriptRunInput } from '../../../script-architect/runner'
import {
  createEditableContext,
  detectSceneBlueprint,
  isHookCategoryChoice,
  isHookCount,
  isRemixLength,
  isVariationCount,
  isWriteFormat,
  isWriteLength,
  isWriteStyle,
  parseHooks,
  spokenLinesOnly,
} from '../../../script-architect/types'
import { characterRunner, type CharacterTask } from '../../../character-studio/runner'
import { createEmptyProfile, type CharacterProfile } from '../../../character-studio/types'
import { playgroundRunner, planPlaygroundRun, type PlaygroundTask } from '../../../playground/runner'
import { adAnalysisRunner } from '../../../ad-anatomy/runner'
import { resumeAnalysis, retryAnalysis } from '../../../ad-anatomy/services/analysisQueue'
import { downloadAdVideo, searchOutliers } from '../../../discover/runner'
import { refreshResultMedia } from '../../../discover/services/search'
import { swipeToResult } from '../../../discover/services/swipe'
import { DEFAULT_FILTERS, type DiscoverPlatform, type DiscoverResult } from '../../../discover/types'
import { analysisValues } from '../../engine/held'
import { playgroundInput, refOfPicture } from '../../engine/cost'
import { liveItems } from '../../engine/graph'
import { taskIsDead } from '../errors'
import { useAppStore } from '../../../../stores/appStore'
import type { ImageResolution } from '../../../../utils/models'

// ── Shared ─────────────────────────────────────────────────────────────────

export function textOf(values: FlowValue[] | undefined): string | undefined {
  const v = values?.[0]
  if (!v) return undefined
  const p = v.payload as { text?: string }
  return typeof p.text === 'string' ? p.text : undefined
}

function one<T extends FlowValue['type']>(values: FlowValue[] | undefined, type: T): Extract<FlowValue, { type: T }> | undefined {
  return values?.find((v): v is Extract<FlowValue, { type: T }> => v.type === type)
}

const row = (bank: Lineage['bank'], id: string): Lineage[] => [{ bank, id }]

// Every slot the block shows, in order — for a block whose one call fills
// them all, whatever this run was asked for.
function slotIds(ctx: ExecContext): string[] {
  return liveItems(ctx.block).map((it) => it.id)
}

// ── Voiceovers ─────────────────────────────────────────────────────────────

function voiceSettings(ctx: ExecContext): VoiceSettings {
  const preset = one(ctx.inst.inputs.preset, 'voice')
  if (preset) {
    const p = useBankStore.getState().voices.find((v) => v.id === preset.payload.presetId)
    if (p) return settingsFromPreset(p)
  }
  return sanitizeVoiceSettings(ctx.block.settings as Partial<VoiceSettings>)
}

export function voiceValue(r: VoiceHistoryItem): HeldValue {
  return {
    type: 'audio',
    key: `voiceHistory:${r.id}`,
    label: `${r.voiceName} · ${r.scriptPreview}`,
    payload: { ref: r.audioUrl, durationSeconds: r.duration, historyId: r.id },
    lineage: row('voiceHistory', r.id),
  }
}

export const voiceExecutor: Executor = {
  async run(ctx) {
    const text = textOf(ctx.inst.inputs.script)?.trim()
    if (!text) throw new FriendlyError('The script wired into Voiceovers is empty. Check the block that makes it.')
    // A Voiceovers block reads what a voice would say — the same cut Scripts'
    // Send to Voiceovers makes, minus speaker labels and on-screen copy.
    const scriptText = spokenLinesOnly(text)
    let task = (ctx.resume as { task?: VoiceTask } | undefined)?.task
    if (!task) {
      const modelId = (ctx.block.settings.modelId as string | undefined) ?? resolveTtsModel()
      task = await voiceRunner.start({ settings: voiceSettings(ctx), scriptText, modelId }, { signal: ctx.signal, provenance: ctx.provenance })
      ctx.save({ task })
    }
    ctx.progress('Reading')
    const r = await voiceRunner.finish(task, { signal: ctx.signal })
    return { outputs: { audio: [voiceValue(r)] }, rows: row('voiceHistory', r.id) }
  },
  async replay() {
    const r = await voiceRunner.replay({ settings: sanitizeVoiceSettings({}), scriptText: '' })
    return r ? { outputs: { audio: [voiceValue(r)] } } : null
  },
}

// ── Scripts ────────────────────────────────────────────────────────────────

function scriptInput(ctx: ExecContext): ScriptRunInput {
  const s = ctx.block.settings
  const productValue = one(ctx.inst.inputs.product, 'product')
  const productId = productValue?.payload.productId ?? (s.productId as string | undefined) ?? null
  const product = productId ? useBankStore.getState().products.find((p) => p.id === productId) : undefined
  const brief = textOf(ctx.inst.inputs.brief) ?? String(s.brief ?? '')
  const source = textOf(ctx.inst.inputs.source) ?? String(s.source ?? '')
  // A winning ad wired in makes it a remix, whatever the panel was left on;
  // a scene blueprint is rebuilt scene by scene, the way Scripts reads one.
  const remix = s.mode === 'remix' || !!textOf(ctx.inst.inputs.source)
  const mode = remix ? (detectSceneBlueprint(source) && !s.forceTranscript ? 'reverse-engineer' : 'remix') : 'write'
  if (remix && !source.trim()) throw new FriendlyError('Scripts is set to Remix but has no winning ad. Wire one in, or paste one in its panel.')
  return {
    mode,
    source,
    brief,
    writeStyle: isWriteStyle(s.writeStyle) ? s.writeStyle : 'pas',
    writeFormat: isWriteFormat(s.writeFormat) ? s.writeFormat : 'script',
    writeLength: isWriteLength(s.writeLength) ? s.writeLength : 30,
    remixLength: isRemixLength(s.remixLength) ? s.remixLength : 'default',
    hookCategory: isHookCategoryChoice(s.hookCategory) ? s.hookCategory : 'auto',
    hookCount: isHookCount(s.hookCount) ? s.hookCount : 10,
    variationCount: isVariationCount(s.variationCount) ? s.variationCount : 3,
    productId: product?.id ?? null,
    productName: product?.productName,
    productContext: product ? createEditableContext(product) : null,
    additionalContext: String(s.additionalContext ?? ''),
  }
}

export function scriptItems(
  r: { id: string; mode: string; writeFormat?: string; variations: string[]; voiceProfile?: string },
  slots: string[],
  staging?: string,
): Record<string, HeldValue> {
  const hooks = r.mode === 'write' && r.writeFormat === 'hooks'
  const texts = hooks ? parseHooks(r.variations[0] ?? '').map((h) => h.text) : r.variations
  const items: Record<string, HeldValue> = {}
  slots.forEach((slot, i) => {
    const text = texts[i]
    if (!text) return
    items[slot] = {
      type: 'script',
      key: `scriptHistory:${r.id}#${i}`,
      label: text,
      payload: { text, voiceProfile: r.voiceProfile, staging },
      lineage: row('scriptHistory', r.id),
    }
  })
  return items
}

// A remix of an analyzed ad keeps that ad's staging with every take, so B-Roll
// shoots the new words on the old beats.
function stagingOf(ctx: ExecContext): string | undefined {
  const source = ctx.inst.inputs.source?.[0]
  return source?.type === 'transcript' ? source.payload.scenes : undefined
}

export const scriptsExecutor: Executor = {
  // A script is streamed chat with no task to resume: a reload mid-write
  // writes it again, for under a credit.
  async run(ctx) {
    ctx.progress('Writing')
    const task = await scriptRunner.start(scriptInput(ctx), { provenance: ctx.provenance })
    const r = await scriptRunner.finish(task)
    // One call writes every hook, so every slot is filled — a test run's
    // extra hooks are kept for the full run rather than written twice.
    return { items: scriptItems(r, slotIds(ctx), stagingOf(ctx)), rows: row('scriptHistory', r.id) }
  },
  async replay(ctx) {
    const r = await scriptRunner.replay(scriptInput(ctx))
    // The row the replay brought back, so the block's window shows it too.
    return r ? { items: scriptItems(r, slotIds(ctx), stagingOf(ctx)), rows: row('scriptHistory', r.id) } : null
  },
}

// ── Characters ─────────────────────────────────────────────────────────────

export function characterValue(r: CharacterHistoryItem): HeldValue {
  return {
    type: 'character',
    key: `characterHistory:${r.id}`,
    label: 'Character',
    payload: { imageRef: r.imageRef, profile: r.profile, historyId: r.id },
    lineage: row('characterHistory', r.id),
  }
}

// Each face is its own generation, all fired at once: one press of the
// Characters app's Generate with a batch count, slot by slot.
export const charactersExecutor: Executor = {
  async run(ctx) {
    const s = ctx.block.settings
    const slots = ctx.inst.slots ?? []
    const photo = ctx.inst.inputs.photo?.[0]
    const saved = (ctx.resume as { tasks?: Record<string, CharacterTask> } | undefined)?.tasks ?? {}
    const tasks: Record<string, CharacterTask> = { ...saved }
    const batchId = slots.length > 1 ? crypto.randomUUID() : undefined
    const profile = { ...createEmptyProfile(), ...((s.profile as CharacterProfile | undefined) ?? {}) }
    const items: Record<string, HeldValue> = {}
    const errors: unknown[] = []
    ctx.progress(slots.length > 1 ? `${slots.length} faces` : 'Drawing')
    await Promise.all(slots.map(async (slot, i) => {
      try {
        if (!tasks[slot]) {
          tasks[slot] = await characterRunner.start({
            profile,
            resolution: (s.resolution as ImageResolution) ?? '1K',
            kind: s.kind === 'sheet' ? 'sheet' : 'portrait',
            aspect: String(s.aspect ?? profile.aspectRatio ?? '9:16'),
            referenceUrl: photo ? refOfPicture(photo) || undefined : undefined,
            modelId: s.modelId as string | undefined,
            batchId,
            batchIndex: batchId ? i : undefined,
          }, { signal: ctx.signal, provenance: ctx.provenance })
          ctx.save({ tasks })
        }
        const r = await characterRunner.finish(tasks[slot], { signal: ctx.signal })
        items[slot] = characterValue(r)
      } catch (err) {
        if (taskIsDead(err) && tasks[slot]) {
          delete tasks[slot]
          ctx.save({ tasks })
        }
        errors.push(err)
      }
    }))
    if (!Object.keys(items).length && errors.length) throw errors[0]
    return { items, rows: Object.values(items).flatMap((v) => v.lineage ?? []) }
  },
  async replay(ctx) {
    const items: Record<string, HeldValue> = {}
    for (const [i, slot] of (ctx.inst.slots ?? []).entries()) {
      const r = await characterRunner.replay({ profile: createEmptyProfile(), resolution: '1K', kind: 'portrait', aspect: '9:16' }, { extraMs: i * 400 })
      if (r) items[slot] = characterValue(r)
    }
    return { items }
  },
}

// ── Playground ─────────────────────────────────────────────────────────────

export function playgroundValue(r: ImageHistoryItem | VideoHistoryItem | MusicHistoryItem): HeldValue {
  if ('imageUrl' in r) {
    return { type: 'image', key: `imageHistory:${r.id}`, label: r.prompt.slice(0, 60) || 'Image', payload: { ref: r.imageUrl, prompt: r.prompt }, lineage: row('imageHistory', r.id) }
  }
  if ('videoUrl' in r) {
    return {
      type: 'video',
      key: `videoHistory:${r.id}`,
      label: r.prompt.slice(0, 60) || 'Clip',
      payload: { clips: [{ ref: r.videoUrl, durationSeconds: r.durationSeconds, prompt: r.prompt, historyId: r.id }] },
      lineage: row('videoHistory', r.id),
    }
  }
  return { type: 'music', key: `musicHistory:${r.id}`, label: r.title || 'Music', payload: { ref: r.audioRef, durationSeconds: r.durationSeconds, historyId: r.id }, lineage: row('musicHistory', r.id) }
}

export const playgroundExecutor: Executor = {
  async run(ctx) {
    let task = (ctx.resume as { task?: PlaygroundTask } | undefined)?.task
    if (!task) {
      const input = playgroundInput(ctx.block, ctx.inst.inputs)
      if (!input.prompt.trim() && input.mode !== 'video') {
        throw new FriendlyError('Playground has no prompt. Write one in its panel, or wire one in.')
      }
      if (!input.modelId) throw new FriendlyError('Pick a model in the Playground block first.')
      // Said before anything is spent, like Playground's own notices.
      const plan = planPlaygroundRun(input)
      if (plan.notices[0]) ctx.progress(plan.notices[0])
      task = await playgroundRunner.start(input, { signal: ctx.signal, provenance: ctx.provenance })
      ctx.save({ task })
    }
    const r = await playgroundRunner.finish(task, { signal: ctx.signal })
    const v = playgroundValue(r)
    return { outputs: { out: [v] }, rows: v.lineage }
  },
  async replay(ctx) {
    const r = await playgroundRunner.replay(playgroundInput(ctx.block, ctx.inst.inputs))
    return r ? { outputs: { out: [playgroundValue(r)] } } : null
  },
}

// ── Ad Analyzer ────────────────────────────────────────────────────────────

// An ad on a wire → the video file the analyzer reads. A saved swipe's link
// has usually expired, so it's re-resolved once (a ScrapeCreators credit),
// the way the Swipe File's own Analyze button does it.
async function adFile(ad: Extract<FlowValue, { type: 'ad' }>): Promise<{ file: File; durationSeconds?: number }> {
  const p = ad.payload
  const apiKey = useSettingsStore.getState().scrapeCreatorsKey
  const result: DiscoverResult | undefined = (p.result as DiscoverResult | undefined)
    ?? (p.swipeId ? swipeFromBank(p.swipeId) : undefined)
  if (!result) throw new FriendlyError('That ad has no video Flow can reach. Wire in an ad from Outliers or the Swipe File.')
  const refresh = async (): Promise<string | null> => {
    if (!apiKey || !p.platform || !p.sourceId) return null
    const fresh = await refreshResultMedia(apiKey, p.platform, { sourceId: p.sourceId, postUrl: p.postUrl })
    if (fresh.videoUrl && p.swipeId) void useBankStore.getState().updateSwipe(p.swipeId, { mediaUrl: fresh.videoUrl })
    return fresh.videoUrl ?? null
  }
  const file = await downloadAdVideo(result, refresh)
  return { file, durationSeconds: result.durationSeconds }
}

function swipeFromBank(id: string): DiscoverResult | undefined {
  const item = useBankStore.getState().swipes.find((s) => s.id === id)
  return item ? swipeToResult(item) : undefined
}

// Rows this page load queued an analysis for. One still 'analyzing' with no
// taskId that isn't here (and that the Ad Analyzer, closed, isn't running)
// was cut off by a reload before kie took the job: nothing will settle it.
const queuedHere = new Set<string>()

export const analyzerExecutor: Executor = {
  async run(ctx) {
    let rowId = (ctx.resume as { rowId?: string } | undefined)?.rowId
    const held = rowId ? useBankStore.getState().getAdAnatomyHistoryById(rowId) : undefined
    if (rowId && !held) {
      // Deleted in the Ad Analyzer: there's nothing to wait on, so the ad is
      // analyzed afresh rather than failing the same way every run.
      rowId = undefined
    } else if (held) {
      const owned = useAppStore.getState().runningApps.includes('ad-anatomy')
      const stranded = held.status === 'analyzing' && !held.taskId && !owned && !queuedHere.has(held.id)
      if (held.status === 'error' || stranded) {
        // Waiting on a failed or stranded row only reads the same failure
        // back, so it runs again from the ad it kept — or, with that gone,
        // from the ad on the wire.
        if (await retryAnalysis(held)) queuedHere.add(held.id)
        else rowId = undefined
      } else if (held.status === 'analyzing' && !owned && !queuedHere.has(held.id)) {
        // The Ad Analyzer resumes its own rows when it's open; when it isn't,
        // nothing would, so the block re-attaches the poll itself.
        resumeAnalysis(held)
        queuedHere.add(held.id)
      }
    }
    if (!rowId) {
      const ad = one(ctx.inst.inputs.ad, 'ad')
      if (!ad) throw new FriendlyError('Wire an ad into the Ad Analyzer.')
      ctx.progress('Fetching the ad')
      const { file, durationSeconds } = await adFile(ad)
      ctx.progress('Analyzing')
      const task = await adAnalysisRunner.start({ file, durationSeconds }, { provenance: ctx.provenance })
      rowId = task.rowId
      queuedHere.add(rowId)
      ctx.save({ rowId })
    }
    const r = await adAnalysisRunner.finish({ rowId }, { signal: ctx.signal })
    const values = analysisValues(r)
    if (!values) throw new FriendlyError('The analysis finished without a result. Open it in the Ad Analyzer to retry.')
    return { outputs: values, rows: row('adAnatomyHistory', r.id) }
  },
  async replay() {
    const r = await adAnalysisRunner.replay({ file: new File([], 'ad.mp4') })
    const values = r ? analysisValues(r) : null
    return values && r ? { outputs: values, rows: row('adAnatomyHistory', r.id) } : null
  },
}

// ── Outliers ───────────────────────────────────────────────────────────────

const PLATFORMS: DiscoverPlatform[] = ['tiktok', 'instagram', 'meta']

export function adValue(r: DiscoverResult): HeldValue {
  return {
    type: 'ad',
    key: `outliers:${r.platform}:${r.id}`,
    label: r.caption?.slice(0, 60) || `@${r.author.handle}`,
    payload: {
      platform: r.platform,
      sourceId: r.id,
      postUrl: r.postUrl,
      mediaUrl: r.videoUrl,
      thumbUrl: r.coverUrl,
      caption: r.caption,
      author: r.author.handle,
      result: r,
    },
  }
}

export const outliersExecutor: Executor = {
  realInReplay: true,
  async run(ctx) {
    const s = ctx.block.settings
    // A search wired in (a Text, or one item of a List) wins over the typed one.
    const query = (textOf(ctx.inst.inputs.query) ?? String(s.query ?? '')).trim()
    if (!query) throw new FriendlyError('Type what Outliers should search for, or wire a search in.')
    if (!useSettingsStore.getState().scrapeCreatorsKey) {
      throw new FriendlyError('Outliers searches with your ScrapeCreators key. Add it in Settings first.')
    }
    const platform = PLATFORMS.includes(s.platform as DiscoverPlatform) ? (s.platform as DiscoverPlatform) : 'tiktok'
    ctx.progress('Searching')
    const page = await searchOutliers({ platform, query, filters: { ...DEFAULT_FILTERS, ...((s.filters as object | undefined) ?? {}) } })
    const withVideo = page.results.filter((r) => !!r.videoUrl)
    const items: Record<string, HeldValue> = {}
    slotIds(ctx).forEach((slot, i) => {
      if (withVideo[i]) items[slot] = adValue(withVideo[i])
    })
    if (!Object.keys(items).length) throw new FriendlyError('That search found no video ads. Try a broader search.')
    return { items }
  },
}

// ── Edit Pack ──────────────────────────────────────────────────────────────

// Gathers one ad's folder — nothing to generate, so it's done at once. The
// block's Download button zips every pack the run made.
export const editExecutor: Executor = {
  realInReplay: true,
  async run(ctx) {
    const clips = one(ctx.inst.inputs.clips, 'video')
    if (!clips?.payload.clips.length) throw new FriendlyError('Edit Pack got no clips. Check the block that makes them.')
    const audio = one(ctx.inst.inputs.audio, 'audio')
    const music = one(ctx.inst.inputs.music, 'music')
    const script = textOf(ctx.inst.inputs.script) ?? clips.payload.scriptText
    return {
      pack: {
        title: clips.label || 'Ad',
        cover: clips.payload.cover,
        script: script ? spokenLinesOnly(script) : undefined,
        voiceover: audio?.payload.ref,
        music: music?.payload.ref,
        clips: clips.payload.clips.map((c) => c.ref),
        stills: clips.payload.stills ?? [],
      },
    }
  },
}

export type { ExecOutput }
