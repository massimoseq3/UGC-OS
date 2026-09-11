// The skill is one file, and it runs in two places: Claude Code, and OpenAI's
// Codex (where a member can put GPT-6 Astra behind it). Nothing INSIDE the
// skill is vendor-specific — SKILL.md is ffmpeg, python and shell, and neither
// it nor the scripts name an assistant — so supporting Codex is entirely a
// question of what the page TELLS the member to do with the download.
//
// Every one of those differences lives here, because they show up in three
// places at once (the folder art, the download, and the setup steps) and a
// page that says "Codex" beside a folder still wearing `/video-editor` is
// worse than one that never offered Codex at all.

export type EditorAgent = 'claude' | 'codex'

// Persisted per browser, like the skill's seen-version: which assistant a
// member edits in is a fact about this machine's setup, not their account.
export const AGENT_STORAGE_KEY = 'ai-ugc-lab:edit-agent'

// The toggle names the TOOL the skill is installed into.
export const AGENT_LABEL: Record<EditorAgent, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

// Prose names the skill's flavour, which is the shorter word: "a Claude Skill",
// not "a Claude Code Skill".
export const AGENT_BRAND: Record<EditorAgent, string> = {
  claude: 'Claude',
  codex: 'Codex',
}

// What the member types to run the skill. Claude Code takes a slash command,
// Codex takes a `$` mention. The folder wears this, and the last setup step
// repeats it — they must be the same string or one of them is a typo.
export const AGENT_COMMAND: Record<EditorAgent, string> = {
  claude: '/video-editor',
  codex: '$video-editor',
}

// The same bytes under two names. Claude installs a `.skill` bundle as-is;
// Codex reads a plain folder under `~/.codex/skills`, and macOS won't unzip a
// file it doesn't know the extension of — so the Codex download is handed over
// as `.zip`, which double-clicks into the folder the step asks for.
export const AGENT_FILE: Record<EditorAgent, string> = {
  claude: 'video-editor.skill',
  codex: 'video-editor.zip',
}
