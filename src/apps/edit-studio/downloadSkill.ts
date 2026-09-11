import { AGENT_FILE, type EditorAgent } from './agent'

// Trigger the download from JS (via a throwaway anchor) rather than wrapping
// the folder in an <a href>, so hovering it shows neither the browser's URL
// preview nor a native tooltip.
//
// One file on disk, two names: the `download` attribute renames it on the way
// out (same-origin, so browsers honour it), which is what lets the Codex
// member get a `.zip` they can double-click without a second 45 KB copy of the
// identical archive sitting in `public/`.
//
// Lives beside SkillFolder rather than in it: a file that exports both a
// component and a plain function loses React Fast Refresh.
export function downloadSkill(agent: EditorAgent = 'claude') {
  const link = document.createElement('a')
  link.href = '/video-editor.skill'
  link.download = AGENT_FILE[agent]
  document.body.appendChild(link)
  link.click()
  link.remove()
}
