export interface ScoreItem {
  label: string
  score: number
}

export interface Scorecard {
  scores: ScoreItem[]
  analystNote: string
}

export interface TranscriptLine {
  timestamp: string
  text: string
}

export interface Scene {
  index: number
  startTime: string
  endTime: string
  durationSeconds: number
  label: string
  prompt: string
}

export interface ReverseEngineeredPrompt {
  totalDurationSeconds: number
  isSingleClip: boolean
  scenes: Scene[]
}

// Strategy-level dissection of why the ad works (vs. the shot-level scenes).
// `stylePrompt` is the reusable artifact: a product-agnostic writing brief
// distilled from the ad's psychology + DTC fundamentals, meant to be saved to
// the Script Bank and fed to Scripts to write new scripts in the same style.
export interface CreativeBreakdown {
  hook: string
  angle: string
  // Beat-by-beat skeleton, one beat per line ("MM:SS–MM:SS BEAT — role").
  structure: string
  stylePrompt: string
}

export interface AnalysisResult {
  // 3–6 word descriptor of the ad — used as the History row title and
  // as the auto-name stem for Script Bank saves. Title Case, no trailing
  // punctuation. May be missing on legacy persisted results; callers
  // should fall back to fileName.
  adTitle: string
  scorecard: Scorecard
  // Missing on legacy persisted results — render only when present.
  creativeBreakdown?: CreativeBreakdown
  transcript: TranscriptLine[]
  reverseEngineeredPrompt: ReverseEngineeredPrompt
}
