import { useState } from 'react'
import { WandSparkles } from 'lucide-react'
import Spinner from '../../../components/Spinner'
import { formatCredits } from '../../../utils/models'
import { estimateDescribeCredits } from '../services/analyzeImage'

interface DescribeLineProps {
  // Resolves true once the form holds the described character, which is when
  // the line empties — a failed call leaves the words in place to try again.
  onDescribe: (description: string) => Promise<boolean>
  // A description is being read right now. The button keeps answering the
  // pointer (the parent drops a second press on its own guard), it just says
  // it's working.
  busy: boolean
}

// "Describe Them": the third way into the form, beside a saved preset and a
// reference photo — one line of text ("28-year-old Latina skincare girl, messy
// bun, bathroom mirror") read into every field by the same model and the same
// answer shape the photo read uses. It is for the member with an idea and no
// picture, who otherwise faced ~28 empty fields.
//
// A single-line field, so `rounded-full` like every other one-line input, at
// the band's h-12 so it reads as the third row of the same chrome as the two
// pickers above it rather than as a form field that wandered up out of the
// column.
export default function DescribeLine({ onDescribe, busy }: DescribeLineProps) {
  const [text, setText] = useState('')
  const cost = formatCredits(estimateDescribeCredits())

  const submit = async () => {
    if (!text.trim()) return
    if (await onDescribe(text)) setText('')
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void submit() }}
      className="flex h-12 items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.02] pl-3 pr-1.5 transition-colors focus-within:border-influencers-500/30"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-influencers-500/10 text-influencers-400">
        <WandSparkles className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe them, e.g. 28-year-old Latina skincare girl, messy bun, bathroom mirror"
        aria-label="Describe the character"
        className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-ink-200 placeholder-ink-600 outline-none"
      />
      {/* Grey only for the one thing that stops it — nothing typed. Never while
          a read is running: the parent's guard drops a double press, and a
          button that greys out mid-call reads as broken. */}
      <button
        type="submit"
        disabled={!text.trim()}
        title={cost ? `Fill every field from this description · ${cost}` : 'Fill every field from this description'}
        className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-influencers-500/25 bg-influencers-500/10 px-3.5 text-[12px] font-semibold text-influencers-300 transition-colors hover:bg-influencers-500/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-influencers-500/10"
      >
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <WandSparkles className="h-3.5 w-3.5" strokeWidth={2} />}
        {busy ? 'Filling…' : 'Fill Form'}
      </button>
    </form>
  )
}
