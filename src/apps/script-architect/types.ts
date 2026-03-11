export interface GenerateScriptInput {
  winningTranscript: string
  productId: string | null
  productContext?: any
  additionalContext: string
}

export interface GeneratedScript {
  scriptText: string
}
