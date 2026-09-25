import { describe, expect, it } from 'vitest'
import { parseScenePrompt } from './scenePrompt'

const quotes = (prompt: string) =>
  parseScenePrompt(prompt).flatMap((b) => b.segments.filter((s) => s.kind === 'quote'))

describe('parseScenePrompt', () => {
  // A noun cue matched on its own and read the possessive's apostrophe as an
  // opening quote, which then ran to the next closing mark and ate the real line.
  it('does not open a quote on a possessive after a noun cue', () => {
    const lifted = quotes("[0:00–0:03] The narrator's tone stays calm as the woman's hand lifts the jar. She says 'Try it.' and smiles.")
    expect(lifted.map((q) => q.text)).toEqual(['Try it.'])
  })

  it("does not open a quote on a voiceover's possessive either", () => {
    const lifted = quotes("[0:00–0:03] The voiceover's pacing is quick. Text on screen: 'Day 1'.")
    expect(lifted.map((q) => [q.variant, q.text])).toEqual([['screen', 'Day 1']])
  })

  it('still lifts a single-quoted line after a spaced cue', () => {
    expect(quotes("[0:00–0:02] She says, 'This is the one.'").map((q) => q.text)).toEqual(['This is the one.'])
  })
})
