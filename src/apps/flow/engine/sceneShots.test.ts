import { describe, expect, it } from 'vitest'
import { oneShot, rangeSeconds, readSceneScript, shotPrompt } from './sceneShots'

// A remixed blueprint in the shape Scripts writes one: the look leads, the
// scenes are headed with their timecodes, and the voice profile comes last.
const TAKE = [
  '=== MASTER VISUAL STYLE (every scene is shot in this look) ===',
  'Handheld iPhone selfie footage, warm window light, slight grain.',
  '',
  '--- Scene 1: THE HOOK (00:00-00:04) ---',
  'Close-up of [CHARACTER] in her parked car, leaning into the lens. [CHARACTER] says: "Okay, I have to tell you about this."',
  '',
  '--- Scene 2: THE PROOF (00:04-00:12) ---',
  '[CHARACTER] holds [PRODUCT] up to the camera and turns it. [CHARACTER] says: "Two weeks of this and my skin is the clearest it has been in years, honestly."',
  '',
  '--- Scene 3: THE CTA (00:12-00:16) ---',
  '[CHARACTER] smiles and points down. [CHARACTER] says: "Link is below."',
  '',
  '=== VOICE PROFILE (same voice in every scene) ===',
  'Female, late 20s, London accent, warm and quick, a friend telling a friend.',
].join('\n')

describe('readSceneScript', () => {
  it('reads each scene as a shot, with the master blocks apart', () => {
    const s = readSceneScript(TAKE)
    expect(s.scenes).toBe(true)
    expect(s.shots.map((x) => x.label)).toEqual(['Scene 1 · The Hook', 'Scene 2 · The Proof', 'Scene 3 · The Cta'])
    expect(s.voice).toContain('London accent')
    expect(s.style).toContain('Handheld iPhone')
    // Neither master block is filmed as part of the last scene.
    expect(s.shots[2].body).not.toContain('VOICE PROFILE')
    expect(s.shots[0].body).not.toContain('VISUAL STYLE')
  })

  it("runs a scene for its timecode, and longer when its lines need it", () => {
    const [hook, proof, cta] = readSceneScript(TAKE).shots
    expect(proof.seconds).toBe(8)
    // "Okay, I have to tell you about this." fits its 4s.
    expect(hook.seconds).toBe(4)
    expect(cta.seconds).toBe(4)
    const rushed = TAKE.replace('(00:04-00:12)', '(00:04-00:06)')
    // Sixteen words can't be said in 2s: it stretches to fit them.
    expect(readSceneScript(rushed).shots[1].seconds).toBeGreaterThan(6)
  })

  it('puts the product only in the scenes that name it', () => {
    const shots = readSceneScript(TAKE).shots
    expect(shots.map((x) => x.showsProduct)).toEqual([false, true, false])
  })

  it('shows the product everywhere when the script never marks it', () => {
    const plain = TAKE.replaceAll('[PRODUCT]', 'the serum')
    expect(readSceneScript(plain).shots.every((x) => x.showsProduct)).toBe(true)
  })

  it('reads a plain script as one shot of the whole thing', () => {
    const s = readSceneScript('Okay so I almost returned this. Then I tried it for a week.')
    expect(s.scenes).toBe(false)
    expect(s.shots).toHaveLength(1)
    expect(s.shots[0].seconds).toBeGreaterThanOrEqual(4)
  })
})

describe('shotPrompt', () => {
  it('sends the look, the scene, the rules and the voice, in that order', () => {
    const s = readSceneScript(TAKE)
    const prompt = shotPrompt(s, s.shots[1], { style: true, voice: true, rules: 'No captions or text on screen.' })
    const at = (x: string) => prompt.indexOf(x)
    expect(at('Handheld iPhone')).toBe(0)
    expect(at('[PRODUCT] up to the camera')).toBeGreaterThan(at('Handheld iPhone'))
    expect(at('No captions')).toBeGreaterThan(at('[PRODUCT] up to the camera'))
    expect(at('London accent')).toBeGreaterThan(at('No captions'))
  })

  it('leaves out what was switched off', () => {
    const s = readSceneScript(TAKE)
    const prompt = shotPrompt(s, s.shots[0], { style: false, voice: false, rules: '' })
    expect(prompt).toBe(s.shots[0].body)
  })
})

describe('oneShot', () => {
  it('films every scene in one clip, as long as they run together', () => {
    const s = readSceneScript(TAKE)
    const shot = oneShot(s, TAKE)!
    expect(shot.seconds).toBe(16)
    expect(shot.body).toContain('Scene 2')
    expect(shot.body).not.toContain('VOICE PROFILE')
    expect(shot.showsProduct).toBe(true)
  })
})

describe('rangeSeconds', () => {
  it('reads a range, and refuses a lone stamp or a backwards one', () => {
    expect(rangeSeconds('00:04–00:12')).toBe(8)
    expect(rangeSeconds('00:04')).toBeNull()
    expect(rangeSeconds('00:12-00:04')).toBeNull()
  })
})
