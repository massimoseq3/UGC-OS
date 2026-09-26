import { describe, expect, it } from 'vitest'
import {
  buildImageInput,
  estimateCredits,
  formatCredits,
  formatUsd,
  getDefaultModel,
  kieModelIds,
  kieOnly,
  listModels,
  modelApi,
  imageModelTakesReferences,
  requiredKeyLabel,
} from './models'
import { humanizeError } from './friendlyError'
import { HiggsfieldHttpError } from './higgsfield'
import { PollTimeoutError } from './kie'

const SOUL_2 = 'higgsfield-ai/soul/v2/standard'
const SOUL_STANDARD = 'higgsfield-ai/soul/standard'

describe('Higgsfield models in the registry', () => {
  it('routes the Soul pair to Higgsfield and everything else to kie', () => {
    expect(modelApi(SOUL_2)).toBe('higgsfield')
    expect(modelApi(SOUL_STANDARD)).toBe('higgsfield')
    expect(modelApi('gpt-image-2-5-sunburst-text-to-image')).toBe('kie')
    expect(modelApi(undefined)).toBe('kie')
  })

  it('prices in dollars, written the way Higgsfield’s model pages write them', () => {
    // open.higgsfield.ai: "$0.0032 each at 720p and $0.0057 each at 1080p".
    expect(formatCredits(estimateCredits(SOUL_2, { imageCount: 1, resolution: '1K' }), SOUL_2)).toBe('$0.0032')
    expect(formatCredits(estimateCredits(SOUL_2, { imageCount: 1, resolution: '2K' }), SOUL_2)).toBe('$0.0057')
    expect(formatCredits(estimateCredits(SOUL_2, { imageCount: 4, resolution: '2K' }), SOUL_2)).toBe('$0.0228')
    expect(formatCredits(estimateCredits(SOUL_STANDARD, { imageCount: 1, resolution: '1K' }), SOUL_STANDARD)).toBe('$0.0938')
    expect(formatCredits(estimateCredits(SOUL_STANDARD, { imageCount: 4, resolution: '2K' }), SOUL_STANDARD)).toBe('$0.75')
    expect(formatUsd(1.125)).toBe('$1.13')
    // kie formatting is untouched, with or without an id.
    expect(formatCredits(6, 'gpt-image-2-5-sunburst-text-to-image')).toBe('6 credits')
    expect(formatCredits(0.4)).toBe('< 1 credit')
  })

  it('is offered only in Playground and Characters, and is nobody’s default', () => {
    const ids = (appId?: string) => listModels({ task: 'image', mode: 'text-to-image', appId }).map((m) => m.id)
    expect(ids('playground')).toContain(SOUL_2)
    expect(ids('character-studio')).toContain(SOUL_STANDARD)
    expect(ids('broll-studio')).not.toContain(SOUL_2)
    expect(ids()).not.toContain(SOUL_2)
    // Named with its maker, wears the key pill, starred — and still nobody's default.
    expect(listModels({ appId: 'playground' }).find((m) => m.id === SOUL_2)?.displayName).toBe('Higgsfield Soul 2')
    expect(requiredKeyLabel(SOUL_2)).toBe('Requires Higgsfield API Key')
    expect(requiredKeyLabel('nano-banana-2')).toBeNull()
    // No image field on the API, so Playground greys its reference tile out.
    expect(imageModelTakesReferences(SOUL_2)).toBe(false)
    expect(imageModelTakesReferences('gpt-image-2-5-flare-text-to-image')).toBe(true)
    expect(listModels({ appId: 'playground' }).find((m) => m.id === SOUL_2)?.tags).toContain('recommended')
    for (const app of ['playground', 'character-studio']) {
      expect(modelApi(getDefaultModel(app, 'image', 'text-to-image')?.id)).toBe('kie')
    }
  })

  it('keeps Flow on kie models', () => {
    expect(kieModelIds({ task: 'image', mode: 'text-to-image', appId: 'playground' })).not.toContain(SOUL_2)
    expect(kieOnly(SOUL_2)).toBeUndefined()
    expect(kieOnly('nano-banana-2')).toBe('nano-banana-2')
  })

  it('maps the app ladder onto Soul’s tier names and sends no image field', () => {
    expect(buildImageInput(SOUL_2, { prompt: 'p', aspectRatio: '9:16', resolution: '2K' })).toEqual({
      prompt: 'p',
      aspect_ratio: '9:16',
      resolution: '1080p',
      // Higgsfield defaults this to true; the prompt must run as written.
      enhance_prompt: false,
    })
    expect(buildImageInput(SOUL_2, { prompt: 'p', resolution: '1K' }).resolution).toBe('720p')
  })
})

describe('Higgsfield error copy', () => {
  it('names Higgsfield, not kie, for its own auth and balance failures', () => {
    expect(humanizeError(new HiggsfieldHttpError(401, 'Invalid credentials', 'POST /x'))).toMatch(/Higgsfield key/)
    expect(humanizeError(new HiggsfieldHttpError(403, 'Insufficient credits', 'POST /x'))).toMatch(/Higgsfield balance/)
  })

  it('ignores digits in the endpoint', () => {
    // A request UUID containing "401" must not read as a bad key.
    const err = new HiggsfieldHttpError(500, 'boom', 'GET /requests/a401b0c2-0000-4000-8000-000000000402/status')
    expect(humanizeError(err)).toMatch(/Higgsfield had a server error/)
  })

  it('says where a timed-out image is still running', () => {
    expect(humanizeError(new PollTimeoutError(10, 'Generation', false, 'Higgsfield'))).toMatch(/still running on Higgsfield/)
    expect(humanizeError(new PollTimeoutError(10, 'Generation', true, 'Higgsfield'))).toMatch(/connection to Higgsfield/)
    // kie's own timeout copy is unchanged.
    expect(humanizeError(new PollTimeoutError(10))).toMatch(/kie\.ai/)
  })

  it('asks for a key when none is saved', () => {
    expect(humanizeError(new Error('No Higgsfield key configured. Open Settings to add it.'))).toMatch(/^No Higgsfield key yet/)
  })
})
