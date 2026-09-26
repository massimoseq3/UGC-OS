import { useState } from 'react'
import Modal from '../../../components/Modal'
import VoiceCard from '../../../components/VoiceCard'

// The storyboard-level way into a Dialogue session's Voice Profile — the one
// text every dialogue clip of the ad is sent with (`BrollResult.voiceProfile`,
// appended in `runner.ts`). Opened from the Voice Profile pill on the
// storyboard bar, beside the Style and Character pills, because it is the same
// kind of thing they are: a setting of the WHOLE storyboard. Until September
// 2026 the only place to set it was inside one card's Video / Animate tab,
// which hid an ad-wide setting behind a single clip.
//
// It is the same value, not a copy: this modal and every dialogue card's own
// Voice card read `result.voiceProfile` and write it back through the one
// `onUpdateVoiceProfile`, so an edit in either shows in the other.
//
// The body is the shared `VoiceCard` rather than a bare textarea, so the voice
// presets behind its heading are reachable from here too. Its fold is kept (a
// card that can't fold would be a second VoiceCard shape) and opens unfolded.
// `below-pickers` so the preset picker the card opens lands on top of this
// panel rather than behind it — `StyleModal`'s tier, for the same reason.
export default function VoiceProfileModal({
  open,
  value,
  onClose,
  onCommit,
}: {
  open: boolean
  value: string
  onClose: () => void
  onCommit: (text: string) => void
}) {
  // A local draft, committed on blur (the card's own rule — this text is
  // written onto every dialogue clip, which is not work to do per keystroke)
  // and on close, since closing with the caret still in the box never blurs
  // it. Re-seeded each time the panel opens, from the value as it is then.
  const [draft, setDraft] = useState(value)
  const [cardOpen, setCardOpen] = useState(true)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(value)
      setCardOpen(true)
    }
  }

  const close = () => {
    if (draft !== value) onCommit(draft)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Voice Profile"
      subtitle="How the character sounds in every dialogue clip"
      layer="below-pickers"
    >
      <div className="p-5">
        <VoiceCard
          value={draft}
          open={cardOpen}
          onToggleOpen={() => setCardOpen(!cardOpen)}
          onChange={setDraft}
          onCommit={onCommit}
          placeholder="How the character sounds: age, accent, pitch, pace, texture, energy. Written once, applied to every talking clip."
        />
      </div>
    </Modal>
  )
}
