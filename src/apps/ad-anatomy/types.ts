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

// ── Two-pass pipeline shapes ─────────────────────────────────────────
// Pass 1 (perception) watches the ad and logs pure observation: transcript,
// every camera cut, and visual dossiers. Pass 2 (synthesis) is text-only —
// it turns the shot log into the scorecard, breakdown, and scene prompts.

// One camera cut. Typed fields force the model to cover every dimension
// instead of summarising a multi-cut stretch into one sentence.
export interface Shot {
  index: number
  start: string // MM:SS
  end: string // MM:SS
  framing: string
  camera: string
  action: string
  onScreenText?: string
  dialogue?: string
}

export interface PerceptionResult {
  totalDurationSeconds: number
  // Full identifying visual descriptions, established once and embedded into
  // every scene prompt by pass 2 so each stays self-contained.
  characterDossier: string
  productDossier: string
  settingDossier: string
  transcript: TranscriptLine[]
  shots: Shot[]
}

// Pass-2 output. AnalysisResult = SynthesisResult + pass-1 transcript.
export interface SynthesisResult {
  adTitle: string
  scorecard: Scorecard
  creativeBreakdown: CreativeBreakdown
  reverseEngineeredPrompt: ReverseEngineeredPrompt
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
