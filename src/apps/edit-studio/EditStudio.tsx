import { CheckCircle2, Download } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import SegmentedToggle from '../../components/SegmentedToggle'
import { usePersistedState } from '../../hooks/usePersistedState'
import { SKILL_VERSION, useSkillUpdateStore } from '../../stores/skillUpdateStore'
import {
  AGENT_BRAND,
  AGENT_COMMAND,
  AGENT_FILE,
  AGENT_LABEL,
  AGENT_STORAGE_KEY,
  type EditorAgent,
} from './agent'
import SkillFolder from './SkillFolder'
import { downloadSkill } from './downloadSkill'

// Edit is the last stop in the create row. Unlike the other apps it doesn't
// generate anything in the browser: it hands out the video editor skill (a
// local pipeline that turns a script, voiceover, and B-roll into a finished
// captioned 9:16 ad) and walks through setting it up, in the same short
// numbered-steps style as the kie.ai key guide. Copy is kept plain and
// friendly (roughly 6th-grade reading level) for non-technical members.
//
// One skill, two places to run it: Claude Code and Codex. The toggle in the
// setup card is the whole switch — it re-writes the steps, the folder's tile
// and command, and the name the file downloads under. See `agent.ts`.

const DISPLAY_FONT = { fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }

// A label the member will look for — a menu path, a command, a folder.
function Ui({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink-200">{children}</span>
}

// One line per step, per agent. Every step is a thing to do — the reassurance
// and the "what if I've never used Claude Code" link that used to sit around
// them were read once and then in the way every time after. Codex takes a step
// more because its skills folder is a place you put a file rather than a
// dialog you upload one to, and because the model is the member's to pick.
const SKILL_STEPS: Record<EditorAgent, ReactNode[]> = {
  claude: [
    <>
      Get{' '}
      <a
        href="https://claude.com/claude-code"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-ink-200 underline decoration-ink/30 underline-offset-2 hover:text-ink-100"
      >
        Claude Code
      </a>
      .
    </>,
    <>Download the Skill.</>,
    <>
      In Claude: <Ui>Settings → Customize → Add → Upload a skill</Ui>, and pick the file.
    </>,
    <>
      Start a Claude Code chat in a new folder, type <Ui>{AGENT_COMMAND.claude}</Ui>, and paste in the paths
      to your B-roll and voiceover.
    </>,
  ],
  codex: [
    <>
      Get{' '}
      <a
        href="https://developers.openai.com/codex/cli"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-ink-200 underline decoration-ink/30 underline-offset-2 hover:text-ink-100"
      >
        Codex
      </a>
      .
    </>,
    <>Download the Skill.</>,
    <>
      Unzip it and drop the <Ui>video-editor</Ui> folder into <Ui>~/.codex/skills</Ui> (create it
      if it's missing).
    </>,
    <>
      Start a Codex chat in a new folder, then run <Ui>/model</Ui> and pick <Ui>GPT-6 Astra</Ui>.
    </>,
    <>
      Type <Ui>{AGENT_COMMAND.codex}</Ui>, and paste in the paths to your B-roll and voiceover.
    </>,
  ],
}

// One benefit per line, each with a small green tick.
const BENEFITS = [
  'Cleans up your voiceover',
  'Picks the best B-roll for each line',
  'Speeds clips up or slows them down to fit the voiceover',
  'Adds smooth zooms and background music',
  'Puts captions on the screen that match every word',
]

// Kept next to SKILL_VERSION so the two are edited together. One archive
// serves both agents, so this number doesn't split by agent either.
const SKILL_FILE_SIZE = '45 KB'

// What this cut of the skill changed, shown ONLY while the badge is unseen.
// The standing rule is that the badge is the whole announcement and no
// what's-new line goes on the page — that rule is about copy a member reads
// once and steps over on every visit after, and this line can't become that:
// it is gone the moment Edit has been opened on this version. A member who is
// already on v4 has no reason to be told what v4 was. Bump it with
// SKILL_VERSION, or it announces the wrong release.
const WHATS_NEW = 'New in v4: the skill now works with ChatGPT Codex.'

const AGENT_OPTIONS = (['claude', 'codex'] as const).map((value) => ({
  value,
  label: AGENT_LABEL[value],
}))

export default function EditStudio() {
  const markSeen = useSkillUpdateStore((s) => s.markSeen)
  // Which assistant the member edits in, remembered per browser: the skill is
  // installed into one setup on this machine, so re-picking it every visit is
  // asking the same question twice.
  const [agent, setAgent] = usePersistedState<EditorAgent>(AGENT_STORAGE_KEY, 'claude')
  // Read once on mount: marking it seen must not pull the badge out from under
  // the member while they're looking at the page it's on.
  const [fresh] = useState(() => useSkillUpdateStore.getState().seenVersion < SKILL_VERSION)

  useEffect(() => {
    markSeen()
  }, [markSeen])

  return (
    // A folder and a card floating on the bare canvas — the shared
    // `AppBackground` gradient, same as the Dashboard and every other page.
    // overflow-x-clip, not hidden: the folder's halo is a 135%-wide radial glow
    // that hangs past both edges, and on a phone that made the whole page
    // scroll ~20px sideways. `clip` trims it without turning this into a scroll
    // container, so the pane's own vertical scroll is untouched.
    <div className="relative flex min-h-full flex-col overflow-x-clip">
      {/* Phone: one column, and the READING order is not the desktop one — the
          title says what the page is, the folder is the thing to take, the
          benefits and the setup steps follow. Desktop keeps the two columns
          (folder left, everything else right) via explicit grid placement, so
          the header can lead on a phone without being duplicated.
          No vertical centering under `md`: a flex column that centres content
          taller than its scroller puts the top of the page out of reach. */}
      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-7 sm:px-5 md:grid md:grid-cols-2 md:content-center md:items-center md:justify-center md:gap-x-8 md:gap-y-2 md:px-8 md:py-10">
        <header className="md:col-start-2 md:row-start-1">
          <h1
            className="text-[2rem] italic font-normal leading-tight tracking-tight text-ink-50 sm:text-4xl md:text-[2.6rem]"
            style={DISPLAY_FONT}
          >
            Your AI Video Editor
          </h1>
          <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-ink-400">
            A {AGENT_BRAND[agent]} Skill that edits your videos for you.
          </p>
        </header>

        {/* The folder is the download */}
        <div className="flex flex-col items-center gap-6 md:col-start-1 md:row-span-2 md:row-start-1 md:gap-7 md:self-center">
          <SkillFolder agent={agent} fresh={fresh} />
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => downloadSkill(agent)}
              className="flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-paper transition-opacity hover:opacity-90 md:h-10 md:px-5 md:text-[13px]"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              Download Skill
            </button>
            <p className="text-[11px] text-ink-600">
              {AGENT_FILE[agent]} · v{SKILL_VERSION} · {SKILL_FILE_SIZE}
            </p>
            {fresh && (
              // Same orange as the folder's "New update" sticker, so the badge
              // that brought the member here and the line explaining it read
              // as one announcement rather than two.
              <p className="max-w-[19rem] text-center text-[11.5px] font-medium leading-snug text-[#F77646]">
                {WHATS_NEW}
              </p>
            )}
          </div>
        </div>

        {/* What it does + how to set it up */}
        <div className="flex flex-col gap-5 md:col-start-2 md:row-start-2">
          <ul className="space-y-1.5">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-[13.5px] leading-snug text-ink-300">
                <CheckCircle2
                  className="mt-px h-4 w-4 shrink-0 text-emerald-500 light:text-emerald-600"
                  strokeWidth={2}
                />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          {/* Blurred, not just translucent: a flat 60% fill reads as a smudge
              — the blur is what makes it a pane. */}
          <div className="rounded-3xl border border-ink/10 bg-ink/[0.045] p-4 backdrop-blur-2xl backdrop-saturate-150 shadow-lg shadow-black/30 light:border-black/[0.05] light:bg-white/70 light:shadow-black/[0.08] md:p-5">
            {/* The toggle heads the card it rewrites, so the steps underneath
                are visibly the answer to it. Fit-to-content: two short labels
                shouldn't stretch across the card and read as a pair of tabs. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-ink-100">Set it up</h2>
              <SegmentedToggle
                options={AGENT_OPTIONS}
                value={agent}
                onChange={setAgent}
                fitContent
                dense
              />
            </div>
            <ol className="mt-3.5 space-y-3.5">
              {SKILL_STEPS[agent].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-[13px] leading-relaxed text-ink-400">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-[11px] font-semibold text-ink-300">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
