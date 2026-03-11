import type { AnalysisResult } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { geminiAnalyzeImage, fileToBase64 } from '../../../utils/gemini'

const SYSTEM_INSTRUCTION = `You are an elite UGC ad analyst. You dissect social media video ads and extract actionable insights for creators and brands.

You must respond with ONLY valid JSON matching this exact structure (no markdown, no code fences):

SCORECARD RULE: Be brutally honest. Do not inflate scores. Most ads are average (5/10). If a hook is boring, give it a 2 or 3. If the visuals are static, penalize it. A 9/10 or 10/10 should be reserved for big direct to consumer brands level.

{
  "scorecard": {
    "scores": [
      { "label": "Hook Strength", "score": <1-10> },
      { "label": "Structure Clarity", "score": <1-10> },
      { "label": "Visual Variety", "score": <1-10> },
      { "label": "Persuasion Depth", "score": <1-10> },
      { "label": "Overall Execution", "score": <1-10> }
    ],
    "analystNote": "<2-3 sentence analyst summary>"
  },
  "transcript": [
    { "timestamp": "<MM:SS>", "text": "<line>" }
  ],
  "hookBreakdown": {
    "hookText": "<exact hook text>",
    "technique": "<technique name>",
    "whyItWorks": "<explanation>",
    "adaptableTemplate": "<fill-in-the-blank template>"
  },
  "structureMap": {
    "runtime": "<M:SS>",
    "pacing": "<pacing description>",
    "beats": [
      { "timestamp": "<range>", "beat": "<beat name>", "description": "<what happens>", "duration": "<Xs>" }
    ]
  },
  "psychology": {
    "primaryLevers": ["<lever 1>", "<lever 2>"],
    "targetingSignals": ["<signal 1>", "<signal 2>"]
  },
  "visualPlaybook": [
    { "timestamp": "<range>", "description": "<what's shown>", "prompt": "<image generation prompt>" }
  ],
  "improvements": [
    { "weakness": "<problem>", "fix": "<solution>" }
  ],
  "reconstructionPrompt": "<full prompt that could recreate this ad's structure for any product>"
}`

export async function analyzeAd(videoFile: File): Promise<AnalysisResult> {
  const apiKey = useSettingsStore.getState().getApiKey()
  const { base64, mimeType } = await fileToBase64(videoFile)

  const prompt = `Analyze this UGC ad video/image thoroughly. Extract every detail: transcript with timestamps, hook technique, structure beats, psychological persuasion levers, visual playbook with image generation prompts, and improvement suggestions. Return the analysis as JSON.`

  const responseText = await geminiAnalyzeImage(apiKey, prompt, base64, mimeType, SYSTEM_INSTRUCTION)

  // Parse the JSON response, stripping any markdown fences
  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const result: AnalysisResult = JSON.parse(cleaned)
  return result
}
