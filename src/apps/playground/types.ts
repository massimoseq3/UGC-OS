import type { Product, Model as Character, BRoll } from '../../stores/types'

// One inline mention inserted into the prompt. We track the kind + the bank
// item id + the start/end character offsets into the prompt string so we can
// re-render the token chips and remove them when the user backspaces over.
export interface Mention {
  kind: 'product' | 'character' | 'broll'
  id: string
  // The display label used for the token in the prompt string. Wrapped in
  // square brackets in the textarea content, e.g. `[@Product:Nike Air]`.
  label: string
  // Character offsets into the prompt text (inclusive start, exclusive end)
  // for the token's bracketed substring.
  start: number
  end: number
}

export type PlaygroundMode = 'image' | 'video' | 'music'

export type BankReference =
  | { kind: 'product'; item: Product }
  | { kind: 'character'; item: Character }
  | { kind: 'broll'; item: BRoll }
