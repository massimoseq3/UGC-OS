import { describe, expect, it } from 'vitest'
import { groupSceneBeats, liftAudioNote, shotSource, splitSpokenLines } from './sceneParsing'

// The street-interview shape that rendered the answer as plain direction: the
// interviewer's `asks` was a cue, the character's `responds` was not, so the
// reply stayed in the prose and its closing quote rode onto the audio note.
const BODY =
  'Medium close-up handheld shot of [CHARACTER] standing on the sidewalk. Off-camera male ' +
  'interviewer asks: "So creams weren\'t fixing it?" [CHARACTER] responds: "They just burned my ' +
  'skin barrier. Now I take SkinClear with food." Audio direction: NO background music, only ' +
  'spoken dialogue and natural street ambient sound.'

describe('splitSpokenLines', () => {
  it('lifts a `responds:` line out of the direction like a `says:` one', () => {
    const lines = splitSpokenLines(BODY).filter((s) => s.kind === 'line')
    expect(lines.map((l) => l.text)).toEqual([
      "So creams weren't fixing it?",
      'They just burned my skin barrier. Now I take SkinClear with food.',
    ])
  })

  it('leaves no stray quote mark on the audio note', () => {
    const note = liftAudioNote(groupSceneBeats(splitSpokenLines(BODY)))
    expect(note?.text.startsWith('Audio direction')).toBe(true)
  })

  it('still keeps on-screen copy in the direction', () => {
    const segs = splitSpokenLines('A text overlay reads: "2 weeks later" over the mirror shot.')
    expect(segs.some((s) => s.kind === 'line')).toBe(false)
  })

  // Green Screen and Comment Reply write the on-screen copy verbatim, and a
  // reaction verb after it read backwards as a trailing attribution: the review
  // became [CHARACTER]'s line and "laughs" vanished from the direction.
  it('never promotes on-screen copy through a trailing `laughs`', () => {
    const segs = splitSpokenLines(
      'The green screen behind [CHARACTER] shows a one-star review: "Didn\'t do anything for me." ' +
        '[CHARACTER] laughs and points at it. [CHARACTER] says: "Okay, but did you use it right?"',
    )
    expect(segs.filter((s) => s.kind === 'line').map((l) => l.text)).toEqual(['Okay, but did you use it right?'])
    expect(segs.some((s) => s.kind === 'direction' && s.text.includes('[CHARACTER] laughs'))).toBe(true)
  })

  it('never promotes a comment card through a trailing `laughs` or `repeats`', () => {
    for (const verb of ['laughs', 'repeats']) {
      const segs = splitSpokenLines(
        `The comment card pinned on screen reads: "Does this actually work?" [CHARACTER] ${verb} and shakes her head.`,
      )
      expect(segs.some((s) => s.kind === 'line')).toBe(false)
    }
  })

  it('still reads a genuine trailing attribution', () => {
    const lines = splitSpokenLines('"Stop scrolling," [CHARACTER] says, holding the jar up to the lens.').filter(
      (s) => s.kind === 'line',
    )
    expect(lines.map((l) => l.text)).toEqual(['Stop scrolling,'])
  })
})

describe('shotSource', () => {
  const copies = (body: string) =>
    groupSceneBeats(splitSpokenLines(body))
      .filter((b) => b.time)
      .map((b) => shotSource(b, body))

  it('keeps the cue and opening quote of a shot that opens on dialogue', () => {
    const body =
      '[0:00–0:03] Close-up of [CHARACTER] in her kitchen. [0:03–0:06] [CHARACTER] says: "This changed my mornings." She smiles at the lens.'
    expect(copies(body)).toEqual([
      'Close-up of [CHARACTER] in her kitchen.',
      '[CHARACTER] says: "This changed my mornings." She smiles at the lens.',
    ])
  })

  it('keeps both quote marks of a hook line with a trailing attribution', () => {
    const body = '[0:00–0:03] "Stop scrolling," [CHARACTER] says, holding the jar up to the lens.'
    expect(copies(body)).toEqual(['"Stop scrolling," [CHARACTER] says, holding the jar up to the lens.'])
  })

  it('keeps the closing quote of a shot that ends on dialogue', () => {
    const body = '[0:00–0:04] [CHARACTER] holds up the jar and says: "Two weeks in."'
    expect(copies(body)).toEqual(['[CHARACTER] holds up the jar and says: "Two weeks in."'])
  })
})
