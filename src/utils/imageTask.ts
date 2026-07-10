import { pollTask, parseResult, downloadAsBase64, IMAGE_POLL_ATTEMPTS } from './kie'
import { saveBase64Asset } from './assetStore'
import { useSettingsStore } from '../stores/settingsStore'

// Shared tail of every image generation (Playground, B-Roll, Influencers):
// poll the task to completion, take the first result URL, download it, and
// persist it as a local asset. Returns the saved asset id. Callers keep their
// own history-row / usage-ledger side-effects.
export async function finishImageAssetTask(
  taskId: string,
  modelId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const record = await pollTask(apiKey, taskId, { signal: opts.signal, maxPollAttempts: IMAGE_POLL_ATTEMPTS })
  const urls = parseResult(record).resultUrls
  if (urls.length === 0) {
    throw new Error(
      `${modelId}: kie.ai returned no resultUrls. taskId=${taskId} record=${JSON.stringify(record).slice(0, 400)}`,
    )
  }
  const { base64, mimeType } = await downloadAsBase64(urls[0])
  return saveBase64Asset(base64, mimeType)
}
