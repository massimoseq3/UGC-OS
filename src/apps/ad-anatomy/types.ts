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

export interface HookBreakdown {
  hookText: string
  technique: string
  whyItWorks: string
  adaptableTemplate: string
}

export interface StructureBeat {
  timestamp: string
  beat: string
  description: string
  duration: string
}

export interface StructureMap {
  runtime: string
  pacing: string
  beats: StructureBeat[]
}

export interface PsychologyPersuasion {
  primaryLevers: string[]
  targetingSignals: string[]
}

export interface VisualFrame {
  timestamp: string
  description: string
  prompt: string
}

export interface Improvement {
  weakness: string
  fix: string
}

export interface AnalysisResult {
  scorecard: Scorecard
  transcript: TranscriptLine[]
  hookBreakdown: HookBreakdown
  structureMap: StructureMap
  psychology: PsychologyPersuasion
  visualPlaybook: VisualFrame[]
  improvements: Improvement[]
  reconstructionPrompt: string
}
