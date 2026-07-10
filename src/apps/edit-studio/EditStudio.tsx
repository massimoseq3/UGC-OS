import { CheckCircle2, Download, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import SkillFolder, { downloadSkill } from './SkillFolder'

// Edit is the last stop in the create row. Unlike the other apps it doesn't
// generate anything in the browser: it hands out the video editor Claude skill
// (a local Claude Code pipeline that turns a script, voiceover, and B-roll into
// a finished captioned 9:16 ad) and walks through setting it up, in the same
// short numbered-steps style as the kie.ai key guide. Copy is kept plain and
// friendly (roughly 6th-grade reading level) for non-technical members.

const DISPLAY_FONT = { fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }

// A clickable label the member will look for in the Claude UI.
function Ui({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink-200">{children}</span>
}

const SKILL_STEPS: ReactNode[] = [
  <>
    Get{' '}
    <a
      href="https://claude.com/claude-code"
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-ink-200 underline decoration-ink/30 underline-offset-2 hover:text-ink-100"
    >
      Claude Code
    </a>{' '}
    if you don&apos;t have it yet.
  </>,
  <>Download the video editor Skill.</>,
  <>
    In Claude, open <Ui>Settings</Ui>, click <Ui>Customize</Ui>, click <Ui>Add</Ui>, then click{' '}
    <Ui>Upload a skill</Ui>. Pick the file you just downloaded.
  </>,
  <>
    Open Claude Code and start a new chat in a new folder. Name the folder{' '}
    <Ui>Ad Editor</Ui>. Type <Ui>/video-editor</Ui>, then copy the path name of your B-roll clips
    and voiceover and paste it in.
  </>,
]

// One benefit per line, each with a small green tick.
const BENEFITS = [
  'Cleans up your voiceover',
  'Picks the best B-roll for each line',
  'Adds smooth zooms and background music',
  'Puts captions on the screen that match every word',
]

export default function EditStudio() {
  return (
    <div className="mx-auto grid min-h-full max-w-5xl content-center gap-10 px-5 py-10 md:grid-cols-2 md:items-center md:gap-8 md:px-8">
      {/* Left: the folder is the download */}
      <div className="flex flex-col items-center gap-7">
        <SkillFolder />
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={downloadSkill}
            className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            Download Skill
          </button>
          <p className="text-[11px] text-ink-600">video-editor.skill · 20 KB</p>
        </div>
      </div>

      {/* Right: what it is + how to set it up */}
      <div className="flex flex-col gap-5">
        <header>
          <h1 className="text-4xl italic font-normal tracking-tight text-ink-50 md:text-[2.6rem]" style={DISPLAY_FONT}>
            Your AI Video Editor
          </h1>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink-400">
            A Claude Skill that edits your videos for you.
          </p>
          <ul className="mt-2 space-y-1.5">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-[13.5px] text-ink-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 light:text-emerald-600" strokeWidth={2} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-500">
            You run one command and your video is ready.
          </p>
        </header>

        <div className="rounded-3xl border border-ink/10 bg-surface-1/60 p-5 shadow-lg shadow-black/20 light:shadow-black/[0.08]">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink-100">Set it up</h2>
          <ol className="mt-4 space-y-3.5">
            {SKILL_STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-[13px] leading-relaxed text-ink-400">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-[11px] font-semibold text-ink-300">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-ink/[0.07] pt-3.5 text-[12px] leading-relaxed text-ink-500">
            You do not need any video editing apps. The skill sets itself up the first time you run
            it, and your files never leave your computer.
          </p>
        </div>

        <a
          href="https://claude.com/claude-code"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 self-start text-[12.5px] font-medium text-ink-400 transition-colors hover:text-ink-200"
        >
          New to Claude Code? Start here
          <ExternalLink className="h-3.5 w-3.5 text-ink-600" />
        </a>
      </div>
    </div>
  )
}
