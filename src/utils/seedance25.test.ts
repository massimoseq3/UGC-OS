import { describe, expect, it } from 'vitest'
import { buildVideoInput, estimateCredits, getModel } from './models'

const SEEDANCE_25 = 'bytedance/seedance-2-5'
const START = 'https://example.com/start.png'
const END = 'https://example.com/end.png'
const REF = 'https://example.com/ref.png'

describe('Seedance 2.5 frames', () => {
  it('declares the frame modes, so B-Roll Animate and Continuous can pick it', () => {
    expect(getModel(SEEDANCE_25)?.modes).toEqual(
      expect.arrayContaining(['image-to-video', 'frames-to-video', 'reference-to-video']),
    )
  })

  it('sends start and end frames in their own fields when nothing else is attached', () => {
    const body = buildVideoInput(SEEDANCE_25, { prompt: 'p', mode: 'frames-to-video', firstFrameUrl: START, lastFrameUrl: END })
    expect(body.first_frame_url).toBe(START)
    expect(body.last_frame_url).toBe(END)
    expect(body.reference_image_urls).toBeUndefined()
  })

  it('animates a single still from imageUrl as the first frame', () => {
    const body = buildVideoInput(SEEDANCE_25, { prompt: 'p', mode: 'image-to-video', imageUrl: START })
    expect(body.first_frame_url).toBe(START)
    expect(body.last_frame_url).toBeUndefined()
  })

  it('folds frames into the references, in shot order, once a reference image is attached', () => {
    const body = buildVideoInput(SEEDANCE_25, {
      prompt: 'p', mode: 'reference-to-video', firstFrameUrl: START, lastFrameUrl: END, referenceImageUrls: [REF],
    })
    expect(body.first_frame_url).toBeUndefined()
    expect(body.last_frame_url).toBeUndefined()
    expect(body.reference_image_urls).toEqual([START, END, REF])
  })

  it('folds frames into the references beside a reference audio clip too', () => {
    const body = buildVideoInput(SEEDANCE_25, {
      prompt: 'p', mode: 'image-to-video', firstFrameUrl: START, referenceAudioUrls: ['https://example.com/a.mp3'],
    })
    expect(body.first_frame_url).toBeUndefined()
    expect(body.reference_image_urls).toEqual([START])
  })

  it('never sends an end frame without a start frame', () => {
    const body = buildVideoInput(SEEDANCE_25, { prompt: 'p', mode: 'frames-to-video', lastFrameUrl: END })
    expect(body.last_frame_url).toBeUndefined()
    expect(body.reference_image_urls).toEqual([END])
  })

  it('offers and prices 1080p', () => {
    expect(getModel(SEEDANCE_25)?.videoConstraints?.resolutions).toContain('1080p')
    expect(buildVideoInput(SEEDANCE_25, { prompt: 'p', mode: 'text-to-video', resolution: '1080p' }).resolution).toBe('1080p')
    expect(estimateCredits(SEEDANCE_25, { durationSeconds: 5, resolution: '1080p' })).toBe(790)
    expect(estimateCredits(SEEDANCE_25, { durationSeconds: 5, resolution: '720p' })).toBe(315)
    expect(estimateCredits(SEEDANCE_25, { durationSeconds: 5, resolution: '480p' })).toBe(140)
  })
})
