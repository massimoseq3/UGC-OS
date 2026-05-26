// Single-line disclosure shown under generation history grids. Keeps the
// "this is AI-generated, your responsibility to verify" message visible at
// the place users actually act on outputs.
export default function AiContentDisclosure() {
  return (
    <p className="px-4 py-2 text-center text-[11px] text-zinc-600">
      AI-generated content — verify before publishing or distributing.
    </p>
  )
}
