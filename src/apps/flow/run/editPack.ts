// Edit Pack: every ad a run made, as the folder the /video-editor skill reads
// (edit-studio). One zip, one folder per ad:
//
//   <ad>/input/script.txt      one spoken beat per line
//   <ad>/input/voiceover.mp3   (or .wav)
//   <ad>/input/broll/          the clips in scene order, then stills as pop-ups
//   <ad>/input/music/          when a track was wired in
//
// The skill writes its cut to <ad>/output/, so the member runs it once per
// folder and gets one finished ad each.

import type { EditPack } from '../types'
import { downloadAssetsZip, type ZipEntry } from '../../../utils/downloadZip'
import { useAppStore } from '../../../stores/appStore'

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ad'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// One spoken beat per non-empty line, the skill's own reading of script.txt.
function beats(script: string): string {
  return script.split(/\n+/).map((l) => l.trim()).filter(Boolean).join('\n') + '\n'
}

export function packEntries(packs: EditPack[]): ZipEntry[] {
  const entries: ZipEntry[] = []
  packs.forEach((pack, i) => {
    const folder = `ad-${pad(i + 1)}-${slug(pack.title)}/input`
    if (pack.script?.trim()) entries.push({ text: beats(pack.script), name: `${folder}/script.txt` })
    if (pack.voiceover) entries.push({ ref: pack.voiceover, name: `${folder}/voiceover`, fallbackExt: 'mp3' })
    pack.clips.forEach((ref, j) => entries.push({ ref, name: `${folder}/broll/clip-${pad(j + 1)}`, fallbackExt: 'mp4' }))
    pack.stills.forEach((ref, j) => entries.push({ ref, name: `${folder}/broll/insert-${j + 1}`, fallbackExt: 'png' }))
    if (pack.music) entries.push({ ref: pack.music, name: `${folder}/music/track`, fallbackExt: 'mp3' })
  })
  return entries
}

export async function downloadEditPacks(flowName: string, packs: EditPack[]): Promise<void> {
  const addToast = useAppStore.getState().addToast
  try {
    const entries = packEntries(packs)
    const expected = entries.length
    addToast(`Packing ${packs.length} ${packs.length === 1 ? 'ad' : 'ads'}…`, 'info')
    const added = await downloadAssetsZip(entries, `${slug(flowName)}-edit-pack`)
    if (added < expected) {
      addToast(`${expected - added} files couldn't be loaded and were left out. The rest downloaded.`, 'error')
    }
  } catch (err) {
    addToast(err instanceof Error ? err.message : 'The pack could not be built.', 'error')
  }
}
