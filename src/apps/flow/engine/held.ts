// What a block hands on without running: a Bank block's row, an Image, a
// Text, a List, and an app block sourced From Bank or From History. Read
// from the banks at plan time, so a row edited in the Bank is what the next
// run reads.

import type { FlowBlock } from '../types'
import type { Held, HeldValue } from './plan'
import { sourceOf } from './catalog'
import { useBankStore } from '../../../stores/bankStore'
import type {
  AdAnatomyHistoryItem,
  BrollHistoryItem,
  Lineage,
  LineageBank,
  Model,
  Product,
  SwipeItem,
} from '../../../stores/types'
import type { BankType } from '../../../utils/constants'
import { parseHooks } from '../../script-architect/types'
import type { AnalysisResult } from '../../ad-anatomy/types'
import { buildFullPrompt, transcriptText } from '../../ad-anatomy/services/fullPrompt'
import { buildAdBlueprint } from '../../ad-anatomy/services/adBlueprint'
import { sessionMedia } from './brollSession'
import { fingerprint } from './hash'

const lineage = (bank: LineageBank, id: string): Lineage[] => [{ bank, id }]

export function productValue(p: Product): HeldValue {
  return { type: 'product', key: `products:${p.id}`, label: p.productName || 'Product', payload: { productId: p.id }, lineage: lineage('products', p.id) }
}

export function modelValue(m: Model): HeldValue {
  return {
    type: 'character',
    key: `models:${m.id}`,
    label: m.name || 'Character',
    payload: { imageRef: m.characterImage, name: m.name, modelRowId: m.id },
    lineage: lineage('models', m.id),
  }
}

export function swipeValue(s: SwipeItem): HeldValue {
  return {
    type: 'ad',
    key: `swipes:${s.id}`,
    label: s.caption?.slice(0, 60) || `@${s.authorHandle}`,
    payload: {
      swipeId: s.id,
      platform: s.platform,
      sourceId: s.sourceId,
      postUrl: s.postUrl,
      mediaUrl: s.mediaUrl,
      thumbUrl: s.thumbRef,
      caption: s.caption,
      author: s.authorHandle,
      transcript: s.transcript,
    },
    lineage: lineage('swipes', s.id),
  }
}

// A bank row as the value its bank's type carries.
export function bankRowValue(bank: BankType, id: string): HeldValue | null {
  const s = useBankStore.getState()
  switch (bank) {
    case 'products': {
      const p = s.products.find((r) => r.id === id)
      return p ? productValue(p) : null
    }
    case 'models': {
      const m = s.models.find((r) => r.id === id)
      return m ? modelValue(m) : null
    }
    case 'scripts': {
      const r = s.scripts.find((x) => x.id === id)
      return r ? { type: 'script', key: `scripts:${r.id}`, label: r.title || 'Script', payload: { text: r.scriptText }, lineage: lineage('scripts', r.id) } : null
    }
    case 'voices': {
      const r = s.voices.find((x) => x.id === id)
      return r ? { type: 'voice', key: `voices:${r.id}`, label: r.label || r.voiceName, payload: { presetId: r.id }, lineage: lineage('voices', r.id) } : null
    }
    case 'brolls': {
      const r = s.brolls.find((x) => x.id === id)
      return r ? { type: 'image', key: `brolls:${r.id}`, label: r.prompt?.slice(0, 60) || 'B-Roll Still', payload: { ref: r.imageUrl, prompt: r.prompt }, lineage: lineage('brolls', r.id) } : null
    }
    case 'styles': {
      const r = s.styles.find((x) => x.id === id)
      return r
        ? { type: 'style', key: `styles:${r.id}`, label: r.name || 'Visual Style', payload: { brief: r.brief, name: r.name, styleId: r.id, thumbRefs: r.thumbRefs }, lineage: lineage('styles', r.id) }
        : null
    }
    case 'swipes': {
      const r = s.swipes.find((x) => x.id === id)
      return r ? swipeValue(r) : null
    }
  }
}

const BANK_NOUN: Record<BankType, string> = {
  products: 'a product',
  models: 'a character',
  scripts: 'a script',
  voices: 'a voice preset',
  brolls: 'a still',
  styles: 'a visual style',
  swipes: 'a saved ad',
}

// The items a Scripts history row holds: its hooks, or its takes.
export function scriptHistoryItems(rowId: string): HeldValue[] {
  const row = useBankStore.getState().scriptHistory.find((r) => r.id === rowId)
  if (!row) return []
  const hooks = row.writeFormat === 'hooks' && row.mode === 'write'
  const texts = hooks ? parseHooks(row.variations[0] ?? '').map((h) => h.text) : row.variations
  return texts.map((text, i) => ({
    type: 'script',
    key: `scriptHistory:${row.id}#${i}`,
    label: text,
    payload: { text, voiceProfile: row.voiceProfile },
    lineage: lineage('scriptHistory', row.id),
  }))
}

// The Ad Analyzer's two outputs off a finished analysis.
export function analysisValues(row: AdAnatomyHistoryItem): Record<string, HeldValue[]> | null {
  if (row.status !== 'complete' || !row.result) return null
  const result = row.result as AnalysisResult
  const title = result.adTitle?.trim() || row.fileName
  const blueprint = buildAdBlueprint(result, row.fileName)
  return {
    transcript: [{
      type: 'transcript',
      key: `adAnatomyHistory:${row.id}:transcript`,
      label: title,
      payload: { text: transcriptText(result), scenes: blueprint.staging },
      lineage: lineage('adAnatomyHistory', row.id),
    }],
    scenes: [{
      type: 'text',
      key: `adAnatomyHistory:${row.id}:scenes`,
      label: `${title} · Scene Prompts`,
      payload: { text: buildFullPrompt(result.reverseEngineeredPrompt) },
      lineage: lineage('adAnatomyHistory', row.id),
    }],
  }
}

export function brollSessionValues(row: BrollHistoryItem): Record<string, HeldValue[]> {
  const media = sessionMedia(row)
  const title = row.inputSummary || 'B-Roll'
  return {
    clips: media.clips.length
      ? [{ type: 'video', key: `brollHistory:${row.id}:clips`, label: title, payload: { clips: media.clips, stills: media.inserts, scriptText: row.scriptText, cover: media.stills[0] }, lineage: lineage('brollHistory', row.id) }]
      : [],
    stills: media.stills.map((ref, i) => ({ type: 'image', key: `brollHistory:${row.id}:still:${i}`, label: `${title} · Still ${i + 1}`, payload: { ref }, lineage: lineage('brollHistory', row.id) })),
  }
}

export function heldValues(block: FlowBlock): Held {
  const s = useBankStore.getState()
  const pick = block.pick
  const source = sourceOf(block)

  switch (block.kind) {
    case 'bank': {
      const bank = (block.settings.bank as BankType) ?? 'products'
      if (!pick) return { missing: `Pick ${BANK_NOUN[bank]} from the bank` }
      const v = bankRowValue(bank, pick)
      return v ? { outputs: { out: [v] } } : { missing: `That ${BANK_NOUN[bank].replace(/^an? /, '')} was deleted from the bank` }
    }
    case 'image': {
      const ref = String(block.settings.ref ?? '')
      if (!ref) return { missing: 'Drop an image on it' }
      return { outputs: { out: [{ type: 'image', key: `image:${ref}`, label: String(block.settings.name || 'Image'), payload: { ref } }] } }
    }
    case 'text': {
      const text = String(block.settings.text ?? '').trim()
      if (!text) return { missing: 'Type the text it hands on' }
      return { outputs: { out: [{ type: 'text', key: `text:${fingerprint(text)}`, label: text.slice(0, 60), payload: { text } }] } }
    }
    case 'list': {
      const entries = Array.isArray(block.settings.entries) ? (block.settings.entries as string[]) : []
      if (!entries.some((e) => e.trim())) return { missing: 'Add at least one item' }
      const items: Record<string, HeldValue> = {}
      ;(block.items ?? []).forEach((it, i) => {
        const text = (entries[i] ?? '').trim()
        if (text) items[it.id] = { type: 'text', key: `list:${fingerprint(text)}`, label: text, payload: { text } }
      })
      return { outputs: {}, items }
    }
    case 'note':
      return { outputs: {} }
  }

  if (!pick) return { missing: source === 'bank' ? 'Pick one from the bank' : 'Pick a past result from history' }

  switch (block.kind) {
    case 'characters': {
      if (source === 'bank') {
        const m = s.models.find((r) => r.id === pick)
        return m ? { outputs: { all: [modelValue(m)] } } : { missing: 'That character was deleted from the bank' }
      }
      const r = s.characterHistory.find((x) => x.id === pick)
      if (!r) return { missing: 'That character was deleted from history' }
      return {
        outputs: {
          all: [{
            type: 'character',
            key: `characterHistory:${r.id}`,
            label: 'Character',
            payload: { imageRef: r.imageRef, profile: r.profile, historyId: r.id },
            lineage: lineage('characterHistory', r.id),
          }],
        },
      }
    }
    case 'scripts': {
      if (source === 'bank') {
        const v = bankRowValue('scripts', pick)
        return v ? { outputs: { all: [v] } } : { missing: 'That script was deleted from the bank' }
      }
      const texts = scriptHistoryItems(pick)
      if (!texts.length) return { missing: 'That run was deleted from history' }
      const items: Record<string, HeldValue> = {}
      ;(block.items ?? []).forEach((it, i) => {
        if (texts[i]) items[it.id] = texts[i]
      })
      return { outputs: {}, items }
    }
    case 'voice': {
      const r = s.voiceHistory.find((x) => x.id === pick)
      if (!r) return { missing: 'That voiceover was deleted from history' }
      return {
        outputs: {
          audio: [{
            type: 'audio',
            key: `voiceHistory:${r.id}`,
            label: `${r.voiceName} · ${r.scriptPreview}`,
            payload: { ref: r.audioUrl, durationSeconds: r.duration, historyId: r.id },
            lineage: lineage('voiceHistory', r.id),
          }],
        },
      }
    }
    case 'broll': {
      const r = s.brollHistory.find((x) => x.id === pick)
      if (!r) return { missing: 'That session was deleted from history' }
      return { outputs: brollSessionValues(r) }
    }
    case 'playground': {
      const mode = block.settings.mode
      if (mode === 'video') {
        const r = s.videoHistory.find((x) => x.id === pick)
        if (!r) return { missing: 'That clip was deleted from history' }
        return {
          outputs: {
            out: [{
              type: 'video',
              key: `videoHistory:${r.id}`,
              label: r.prompt.slice(0, 60) || 'Clip',
              payload: { clips: [{ ref: r.videoUrl, durationSeconds: r.durationSeconds, prompt: r.prompt, historyId: r.id }] },
              lineage: lineage('videoHistory', r.id),
            }],
          },
        }
      }
      if (mode === 'music') {
        const r = s.musicHistory.find((x) => x.id === pick)
        if (!r) return { missing: 'That track was deleted from history' }
        return {
          outputs: {
            out: [{ type: 'music', key: `musicHistory:${r.id}`, label: r.title || 'Music', payload: { ref: r.audioRef, durationSeconds: r.durationSeconds, historyId: r.id }, lineage: lineage('musicHistory', r.id) }],
          },
        }
      }
      const r = s.imageHistory.find((x) => x.id === pick)
      if (!r) return { missing: 'That image was deleted from history' }
      return {
        outputs: {
          out: [{ type: 'image', key: `imageHistory:${r.id}`, label: r.prompt.slice(0, 60) || 'Image', payload: { ref: r.imageUrl, prompt: r.prompt }, lineage: lineage('imageHistory', r.id) }],
        },
      }
    }
    case 'analyzer': {
      const r = s.adAnatomyHistory.find((x) => x.id === pick)
      if (!r) return { missing: 'That analysis was deleted from history' }
      const values = analysisValues(r)
      return values ? { outputs: values } : { missing: 'That analysis never finished' }
    }
    default:
      return { missing: 'Nothing to hand on' }
  }
}
