// A traced row as a member reads it: which app made it (or which bank it's
// from), a title, the settings that matter, and a picture when it has one.
// How Was This Made and Flow Home's From Your Work both draw from this.

import type { ElementType } from 'react'
import type { BrollResult, CardState } from '../../broll-studio/types'
import type { TracedRow } from './trace'
import { BANK_CONFIG, getAppConfig, type BankType } from '../../../utils/constants'
import { getModel } from '../../../utils/models'
import { HOOK_CATEGORY_META, WRITE_STYLE_META, parseHooks, type HookCategoryChoice, type WriteStyle } from '../../script-architect/types'

export interface RowFace {
  // "Voiceovers", "Bank · Products".
  source: string
  icon: ElementType
  accent: string
  title: string
  detail?: string
  // An asset ref to show, when the row is a picture or has one.
  thumb?: string
  // An audio ref, for a voiceover or a track.
  audio?: string
  when?: number
}

const APP_OF: Record<string, string> = {
  voiceHistory: 'voice-studio',
  scriptHistory: 'script-architect',
  brollHistory: 'broll-studio',
  imageHistory: 'playground',
  musicHistory: 'playground',
  characterHistory: 'character-studio',
  adAnatomyHistory: 'ad-anatomy',
}

function firstLine(text: string | undefined, max = 90): string {
  const line = (text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function modelName(id: string | undefined): string | undefined {
  return id ? getModel(id)?.displayName : undefined
}

function joined(...parts: Array<string | undefined | false>): string | undefined {
  const kept = parts.filter((p): p is string => !!p)
  return kept.length ? kept.join(' · ') : undefined
}

export function appOf(node: TracedRow): string | undefined {
  if (node.bank === 'videoHistory') return node.row?.sourceApp === 'broll-studio' ? 'broll-studio' : 'playground'
  return APP_OF[node.bank]
}

export function faceOf(node: TracedRow): RowFace {
  if (node.bank in BANK_CONFIG) {
    const cfg = BANK_CONFIG[node.bank as BankType]
    const base = { source: `Bank · ${cfg.label}`, icon: cfg.icon, accent: cfg.accent }
    if (!node.row) return { ...base, title: 'No longer in your bank' }
    switch (node.bank) {
      case 'products': return { ...base, title: node.row.productName, thumb: node.row.productImage }
      case 'models': return { ...base, title: node.row.name, thumb: node.row.characterImage }
      case 'scripts': return { ...base, title: node.row.title || firstLine(node.row.scriptText) }
      case 'voices': return { ...base, title: node.row.label, detail: node.row.voiceName }
      case 'brolls': return { ...base, title: firstLine(node.row.prompt) || 'B-Roll still', thumb: node.row.imageUrl }
      case 'styles': return { ...base, title: node.row.name, thumb: node.row.thumbRefs?.[0] }
      case 'swipes': return { ...base, title: firstLine(node.row.caption) || `@${node.row.authorHandle}`, detail: `@${node.row.authorHandle}`, thumb: node.row.thumbRef }
    }
  }

  const app = getAppConfig(appOf(node) ?? '') ?? getAppConfig('playground')!
  const base = { source: app.name, icon: app.icon, accent: app.accent }
  if (!node.row) return { ...base, title: 'Deleted since' }

  switch (node.bank) {
    case 'voiceHistory': {
      const r = node.row
      return { ...base, title: firstLine(r.scriptText), detail: joined(r.voiceName, r.style !== 'Natural' && r.style, r.pace !== 'Normal' && r.pace, modelName(r.modelId)), audio: r.audioUrl, when: r.createdAt }
    }
    case 'scriptHistory': {
      const r = node.row
      const n = r.variations.length
      // A hooks pack is one variation of tagged lines; the tags are the
      // app's chips, not words anyone reads.
      if (r.mode === 'write' && r.writeFormat === 'hooks') {
        const hooks = parseHooks(r.variations[0] ?? '')
        return { ...base, title: firstLine(hooks[0]?.text) || 'Hooks', detail: joined(`${hooks.length} ${hooks.length === 1 ? 'hook' : 'hooks'}`, HOOK_CATEGORY_META[r.hookCategory as HookCategoryChoice]?.label), when: r.createdAt }
      }
      const format = r.mode === 'remix' ? `Remix · ${n} ${n === 1 ? 'take' : 'takes'}`
        : joined(`${n} ${r.writeFormat === 'scenes' ? 'scene scripts' : n === 1 ? 'script' : 'scripts'}`, r.writeLength ? `${r.writeLength}s` : undefined, WRITE_STYLE_META[r.writeStyle as WriteStyle]?.label)
      return { ...base, title: firstLine(r.variations[0]) || r.inputSummary || 'Scripts', detail: format, when: r.createdAt }
    }
    case 'brollHistory': {
      const r = node.row
      const result = r.result as BrollResult | undefined
      const cards = Object.values(r.cardStates ?? {}) as CardState[]
      const still = cards.flatMap((c) => c?.images ?? [])[0]?.imageUrl
      const clips = cards.reduce((n, c) => n + (c?.videos?.length ?? 0), 0)
      const lines = result?.scenes?.length ?? 0
      return {
        ...base,
        title: firstLine(r.scriptText) || r.inputSummary || 'B-Roll session',
        detail: joined(lines ? `${lines} ${lines === 1 ? 'line' : 'lines'}` : undefined, clips ? `${clips} ${clips === 1 ? 'clip' : 'clips'}` : 'stills', r.lineDelivery === 'dialogue' ? 'Spoken' : undefined),
        thumb: still,
        when: r.updatedAt ?? r.createdAt,
      }
    }
    case 'videoHistory': {
      const r = node.row
      return { ...base, title: firstLine(r.prompt) || 'Clip', detail: joined(modelName(r.modelId), r.aspectRatio, r.durationSeconds ? `${r.durationSeconds}s` : undefined), thumb: r.thumbnailUrl, when: r.createdAt }
    }
    case 'imageHistory': {
      const r = node.row
      return { ...base, title: firstLine(r.prompt) || 'Image', detail: joined(modelName(r.modelId), r.aspectRatio), thumb: r.imageUrl, when: r.createdAt }
    }
    case 'musicHistory': {
      const r = node.row
      return { ...base, title: r.title || firstLine(r.prompt) || 'Track', detail: joined(modelName(r.modelId), r.instrumental && 'Instrumental'), thumb: r.coverImageRef, audio: r.audioRef, when: r.createdAt }
    }
    case 'characterHistory': {
      const r = node.row
      const p = r.profile ?? {}
      return { ...base, title: joined(p.gender, p.age, p.ethnicity) ?? 'Character', detail: joined(r.kind === 'sheet' ? 'Sheet' : 'Portrait', modelName(r.modelId)), thumb: r.imageRef, when: r.createdAt }
    }
    case 'adAnatomyHistory': {
      const r = node.row
      return { ...base, title: r.adTitle || r.fileName, detail: r.mediaKind === 'image' ? 'Image ad breakdown' : 'Video ad breakdown', thumb: r.thumbnailRef, when: r.createdAt }
    }
  }
  return { ...base, title: 'Result' }
}
