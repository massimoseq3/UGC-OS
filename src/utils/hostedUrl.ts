import { ensureHostedUrl } from './kie'
import { getAsBase64, isAssetRef } from './assetStore'

// A picture a member attached — an asset ref from the Bank or History, a data:
// URI from an upload, or an http(s) URL — as a URL kie can fetch.
// `ensureHostedUrl` refuses asset refs, so every generation surface used to
// inline them to a data: URI first, each with its own copy of these lines.
//
// Null means the asset's blob is gone. What that costs is the caller's call,
// because they don't agree: a missing reference image is skipped, a missing
// character face fails the run.
export async function hostedUrlFor(apiKey: string, ref: string): Promise<string | null> {
  let source = ref
  if (isAssetRef(ref)) {
    const asset = await getAsBase64(ref)
    if (!asset) return null
    source = `data:${asset.mimeType};base64,${asset.base64}`
  }
  return ensureHostedUrl(apiKey, source)
}
