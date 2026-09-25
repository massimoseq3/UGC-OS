// Feed fakeChat's answers straight into the APP's own parsers (imported from
// the Vite dev server) — a fast check that a responder still satisfies its
// caller after either side changes. Run: node check-parsers.mjs
import { boot } from './boot.mjs'
import { answerChat } from './fakeChat.mjs'

const ctx = (system, user) => ({ system, user, all: `${system}\n\n${user}`, messages: [], model: 'check' })
const PRODUCT = '- Product Name: GlowSerum Vitamin C Serum\n- Product: A 20% vitamin C serum'
const script = answerChat(ctx('writes organic TikTok/Reels ad scripts', `${PRODUCT}\nTHIS TAKE: open with a surprising number`)).text

const cases = {
  hooks10: answerChat(ctx('short-form hook writer ... Return EXACTLY 10 lines. One hook per line.', `${PRODUCT}\nWrite the 10 hooks now.`)).text,
  hooks50: answerChat(ctx('short-form hook writer ... Return EXACTLY 50 lines. One hook per line.', `${PRODUCT}\nWrite the 50 hooks now.`)).text,
  scenes: answerChat(ctx('scene-by-scene blueprint for a brand-new organic TikTok ad', `${PRODUCT}\nTHIS TAKE: open mid-story\nLENGTH: the ad is exactly 30 seconds.`)).text,
  reverse: answerChat(ctx('rewrite it so the SAME ad structure can be regenerated', `--- Scene 1: Hook (00:00-00:08) ---\nShe says: "hi"\n\n--- Scene 2: CTA (00:08-00:15) ---\nShe says: "bye"\n${PRODUCT}`)).text,
  lineSilent: answerChat(ctx('# OUTPUT FORMAT (STRICT) <SCENE>', `Break this script into B-Roll scenes following the system rules.\n\nScript:\n${script}\n\nTHE PRODUCT THIS AD IS FOR — x\n- Product: GlowSerum`)).text,
  lineDialogue: answerChat(ctx('# OUTPUT FORMAT (STRICT) <SCENE>', `Break this script into dialogue scenes following the system rules.\n\nScript:\n${script}`)).text,
  continuous: answerChat(ctx('# ROLE', `Storyboard this script as a keyframe-chain ad.\n\nThe script's 3 lines:\n1. One line here for the test.\n2. Second line of the script here.\n3. Third and final line of it.\n`)).text,
  analysis: answerChat(ctx('You are an elite UGC ad analyst. You dissect', 'Analyze this UGC ad')).text,
}

const { browser, page } = await boot({ seed: false, route: null, logConsole: false, stub: { quiet: true } })
const out = await page.evaluate(async ({ cases, script }) => {
  const sa = await window.__appImport('/src/apps/script-architect/types.ts')
  const sp = await window.__appImport('/src/apps/script-architect/sceneParsing.ts')
  const sb = await window.__appImport('/src/apps/broll-studio/services/storyboardRun.ts')
  const sc = await window.__appImport('/src/apps/broll-studio/services/storyboardCompletion.ts')
  const r = {}
  r.hooks10 = sa.parseHooks(cases.hooks10).filter((h) => h.category).length
  r.hooks50 = sa.parseHooks(cases.hooks50).length
  r.scenesDetected = sa.detectSceneBlueprint(cases.scenes)
  r.scenesSplit = sp.splitScenes(cases.scenes)?.length ?? 0
  r.scenesVoice = !!sp.splitVoiceProfile(cases.scenes).rest
  r.reverseSplit = sp.splitScenes(cases.reverse)?.length ?? 0
  r.reverseStyle = !!sp.splitVisualStyle(cases.reverse)
  const silent = sb.parseStoryboardText(cases.lineSilent, { mode: 'line', scriptText: script, delivery: 'silent', styleId: 'ugc' })
  r.lineScenes = silent.result.scenes.length
  r.lineVarsPerScene = silent.result.scenes.map((s) => s.variations.length).join(',')
  r.lineCoverageShort = sc.isStoryboardShort(script, cases.lineSilent)
  const dia = sb.parseStoryboardText(cases.lineDialogue, { mode: 'line', scriptText: script, delivery: 'dialogue', styleId: 'ugc' })
  r.dialogueTags = [...new Set(dia.result.scenes.flatMap((s) => s.variations.map((v) => v.tag)))].join(',')
  r.dialogueVoiceProfile = !!dia.result.voiceProfile
  try {
    const cont = sb.parseStoryboardText(cases.continuous, { mode: 'continuous', scriptText: 'One line here for the test.\nSecond line of the script here.\nThird and final line of it.', styleId: 'ugc' })
    r.continuousScenes = cont.result.scenes?.length ?? JSON.stringify(Object.keys(cont.result))
  } catch (e) { r.continuousScenes = `ERR ${e}` }
  const a = JSON.parse(cases.analysis)
  r.analysisShape = !!(a.reverseEngineeredPrompt?.scenes?.length && a.scorecard?.scores?.length && a.transcript?.length)
  return r
}, { cases, script })
console.log(out)
await browser.close()
