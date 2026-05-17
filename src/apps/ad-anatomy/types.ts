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

export interface AnalysisResult {
  scorecard: Scorecard
  transcript: TranscriptLine[]
  reverseEngineeredPrompt: ReverseEngineeredPrompt
}
