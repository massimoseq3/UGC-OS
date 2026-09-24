// The Outliers runner: a search → a page of ads, and an ad → its transcript.
// Outliers calls it, and Flow's Outliers block will call the same functions.
//
// Not a BlockRunner (utils/blockRunner.ts): these are paid ScrapeCreators
// reads, not kie generations. There is no task to resume and nothing lands in
// a bank — a search is a page of signed URLs that expire within days, which
// is why only an explicit Save puts an ad in the swipe file.

import type { DiscoverFilters, DiscoverPlatform, DiscoverResult } from './types'
import { runSearch, type DiscoverPage } from './services/search'
import { fetchResultTranscript } from './services/handoff'
import { useSettingsStore } from '../../stores/settingsStore'

export interface OutliersSearchInput {
  platform: DiscoverPlatform
  query: string
  filters: DiscoverFilters
  // The page after the one already shown ("Load more").
  cursor?: string | number
}

// The member's ScrapeCreators key, read at call time so a key pasted into
// Settings mid-session applies to the next search.
function scrapeCreatorsKey(): string {
  return useSettingsStore.getState().scrapeCreatorsKey
}

export function searchOutliers(input: OutliersSearchInput, apiKey: string = scrapeCreatorsKey()): Promise<DiscoverPage> {
  return runSearch(apiKey, input.platform, input.query, input.filters, input.cursor)
}

// Transcripts already bought this session, so a second reader of the same ad
// doesn't pay for it again. Outliers keeps its own persisted cache in front of
// this one; this is what a caller without it (a Flow block) shares.
const transcripts = new Map<string, string>()

export function transcriptKey(result: Pick<DiscoverResult, 'platform' | 'id'>): string {
  return `${result.platform}:${result.id}`
}

// `useAi` forces the paid AI path, which is the only reason a transcript
// already held is ever fetched again.
export async function transcriptForAd(
  result: DiscoverResult,
  useAi = false,
  apiKey: string = scrapeCreatorsKey(),
): Promise<{ text: string; creditsRemaining: number | null }> {
  const key = transcriptKey(result)
  const held = transcripts.get(key)
  if (held !== undefined && !useAi) return { text: held, creditsRemaining: null }
  const fetched = await fetchResultTranscript(apiKey, result, useAi)
  transcripts.set(key, fetched.text)
  return fetched
}
