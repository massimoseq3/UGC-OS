import { describe, expect, it } from 'vitest'
import { groupSceneBeats, liftAudioNote, splitSpokenLines } from './sceneParsing'

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
})
