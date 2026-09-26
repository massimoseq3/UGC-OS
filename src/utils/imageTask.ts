import { createTask, pollTask, parseResult, fetchGeneratedAsset, IMAGE_POLL_ATTEMPTS } from './kie'
import { higgsfieldSubmit, pollHiggsfield, higgsfieldImageUrls } from './higgsfield'
import { modelApi } from './models'
import { saveAsset } from './assetStore'
import { useSettingsStore } from '../stores/settingsStore'

// Create one image generation on whichever API serves the model, and return
// the id to persist and poll: a kie taskId, or a Higgsfield request_id. Both
// ride in the in-flight entry's `taskId` field, and finishImageAssetTask below
// tells them apart by the entry's `modelId` — the model a run was started on
// is already persisted, so a reload resumes on the right API with no new field.
// (Removing a Higgsfield model while one of its runs is in flight strands that
// one run; in-flight entries are evicted within the hour anyway.)
//
// Only Playground and Characters reach a Higgsfield model — it is scoped to
// those two pickers (ModelEntry.apps) — so B-Roll keeps calling createTask.
export async function submitImageTask(
  modelId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const settings = useSettingsStore.getState()
  if (modelApi(modelId) === 'higgsfield') {
    return higgsfieldSubmit(settings.getHiggsfieldKey(), modelId, body, signal)
  }
  return createTask(settings.getKieApiKey(), modelId, body, signal)
}

// Shared tail of every image generation (Playground, B-Roll, Influencers):
// poll the task to completion, take the first result URL, download it, and
// persist it as a local asset. Returns the saved asset id. Callers keep their
// own history-row / usage-ledger side-effects.
//
// The download stays a Blob end to end. It used to be read into a base64
// string (chunked `String.fromCharCode` + `btoa`) and then handed BACK to
// `fetch()` as a data: URL to become a Blob again — three full copies of a
// multi-megabyte PNG built on the main thread, right as the result landed,
// which is the moment every other tile of the batch is still animating.
export async function finishImageAssetTask(
  taskId: string,
  modelId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const urls = await finishedImageUrls(taskId, modelId, opts.signal)
  const res = await fetchGeneratedAsset(urls[0], { signal: opts.signal })
  if (!res.ok) throw new Error(`Failed to download generated asset (${res.status}).`)
  const blob = await res.blob()
  if (blob.size === 0) throw new Error(`The image came back empty (0 bytes). url=${urls[0]}`)
  return saveAsset(blob, blob.type || 'image/png')
}

// Poll a submitted image to completion on the API that took it, and return its
// result URLs (never empty).
async function finishedImageUrls(taskId: string, modelId: string, signal?: AbortSignal): Promise<string[]> {
  const settings = useSettingsStore.getState()
  if (modelApi(modelId) === 'higgsfield') {
    const req = await pollHiggsfield(settings.getHiggsfieldKey(), taskId, { signal })
    const urls = higgsfieldImageUrls(req)
    if (urls.length === 0) {
      throw new Error(`${modelId}: Higgsfield finished with no images. taskId=${taskId} body=${JSON.stringify(req).slice(0, 400)}`)
    }
    return urls
  }
  const record = await pollTask(settings.getKieApiKey(), taskId, { signal, maxPollAttempts: IMAGE_POLL_ATTEMPTS })
  const urls = parseResult(record).resultUrls
  if (urls.length === 0) {
    throw new Error(
      `${modelId}: kie.ai returned no resultUrls. taskId=${taskId} record=${JSON.stringify(record).slice(0, 400)}`,
    )
  }
  return urls
}
