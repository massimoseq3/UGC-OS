import { getSupabase, selectAllRows } from '../../lib/supabase'
import {
  ANNOUNCEMENT_COLUMNS,
  rowToAnnouncement,
  type Announcement,
  type AnnouncementLevel,
  type AnnouncementRow,
} from '../../stores/announcementStore'
import { QUERY_TIMEOUT_MS, readyAdminSession, withTimeout } from './adminQuery'

// The admin half of announcements. Every call goes through the same
// readyAdminSession + withTimeout pair as the rest of Admin (see adminQuery),
// so a stalled auth lock reports instead of spinning and a timed-out request is
// genuinely aborted rather than landing late over fresher state.

/** What the editor holds. Strings, because that's what the inputs give back. */
export interface AnnouncementDraft {
  id: string
  title: string
  body: string
  level: AnnouncementLevel
  /** Data URI, or null for none — unless `imagePending`, when null means "not fetched yet". */
  image: string | null
  /**
   * True while an existing announcement's stored image hasn't been loaded into
   * `image` — still in flight, or the fetch failed. The editor opens before the
   * image arrives, so without this a save in that window (or after a failed
   * fetch) upserted `image: null` and silently deleted the picture.
   */
  imagePending: boolean
  videoUrl: string
  ctaLabel: string
  ctaUrl: string
  ctaApp: string
  /** ISO string, or null for a draft. */
  publishedAt: string | null
  expiresAt: string | null
  pinned: boolean
}

export type AnnouncementStatus = 'draft' | 'scheduled' | 'live' | 'expired'

export function announcementStatus(a: Pick<Announcement, 'publishedAt' | 'expiresAt'>, now = Date.now()): AnnouncementStatus {
  if (!a.publishedAt) return 'draft'
  if (Date.parse(a.publishedAt) > now) return 'scheduled'
  if (a.expiresAt && Date.parse(a.expiresAt) <= now) return 'expired'
  return 'live'
}

export function emptyDraft(): AnnouncementDraft {
  return {
    id: crypto.randomUUID(),
    title: '',
    body: '',
    level: 'update',
    image: null,
    imagePending: false,
    videoUrl: '',
    ctaLabel: '',
    ctaUrl: '',
    ctaApp: '',
    publishedAt: null,
    expiresAt: null,
    pinned: false,
  }
}

export function draftFrom(a: Announcement, image: string | null): AnnouncementDraft {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    level: a.level,
    image,
    imagePending: a.hasImage && image === null,
    videoUrl: a.videoUrl ?? '',
    ctaLabel: a.ctaLabel ?? '',
    ctaUrl: a.ctaUrl ?? '',
    ctaApp: a.ctaApp ?? '',
    publishedAt: a.publishedAt,
    expiresAt: a.expiresAt,
    pinned: a.pinned,
  }
}

/** The draft as the card component wants it — what makes the preview honest. */
export function draftToAnnouncement(d: AnnouncementDraft): Announcement {
  const now = new Date().toISOString()
  return {
    id: d.id,
    title: d.title.trim() || 'Untitled announcement',
    body: d.body,
    level: d.level,
    hasImage: Boolean(d.image),
    videoUrl: d.videoUrl.trim() || null,
    ctaLabel: d.ctaLabel.trim() || null,
    ctaUrl: d.ctaUrl.trim() || null,
    ctaApp: d.ctaApp.trim() || null,
    publishedAt: d.publishedAt,
    expiresAt: d.expiresAt,
    pinned: d.pinned,
    createdAt: now,
    updatedAt: now,
  }
}

/** Every announcement including drafts, scheduled and expired ones. */
export async function listAnnouncements(): Promise<Announcement[]> {
  await readyAdminSession()
  const { data, error } = await withTimeout(
    (signal) => getSupabase()
      .from('announcements')
      .select(ANNOUNCEMENT_COLUMNS)
      .order('created_at', { ascending: false })
      .abortSignal(signal),
    QUERY_TIMEOUT_MS,
    'Announcements',
  )
  if (error) throw new Error(error.message)
  return (data as AnnouncementRow[] ?? []).map(rowToAnnouncement)
}

export async function fetchAnnouncementImage(id: string): Promise<string | null> {
  await readyAdminSession()
  const { data, error } = await withTimeout(
    (signal) => getSupabase().from('announcements').select('image').eq('id', id).abortSignal(signal).maybeSingle(),
    QUERY_TIMEOUT_MS,
    'Announcement image',
  )
  if (error) throw new Error(error.message)
  return (data as { image: string | null } | null)?.image ?? null
}

export async function saveAnnouncement(d: AnnouncementDraft, userId: string | null): Promise<void> {
  await readyAdminSession()
  const { error } = await withTimeout(
    (signal) => getSupabase()
      .from('announcements')
      .upsert({
        id: d.id,
        title: d.title.trim(),
        body: d.body,
        level: d.level,
        // Left out while pending, so the upsert keeps the stored image rather
        // than overwriting it with a null that only means "not loaded".
        ...(d.imagePending ? {} : { image: d.image }),
        video_url: d.videoUrl.trim() || null,
        cta_label: d.ctaLabel.trim() || null,
        cta_url: d.ctaUrl.trim() || null,
        cta_app: d.ctaApp.trim() || null,
        published_at: d.publishedAt,
        expires_at: d.expiresAt,
        pinned: d.pinned,
        created_by: userId,
        updated_at: new Date().toISOString(),
      })
      .abortSignal(signal),
    QUERY_TIMEOUT_MS,
    'Save announcement',
  )
  if (error) throw new Error(error.message)
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await readyAdminSession()
  const { error } = await withTimeout(
    (signal) => getSupabase().from('announcements').delete().eq('id', id).abortSignal(signal),
    QUERY_TIMEOUT_MS,
    'Delete announcement',
  )
  if (error) throw new Error(error.message)
}

/**
 * announcement_id → how many members have read it. The admin read policy on
 * announcement_reads is what makes this visible; it stays SELECT-only, so
 * nothing here can mark something read on a member's behalf.
 */
export async function fetchReadCounts(): Promise<Record<string, number>> {
  await readyAdminSession()
  // Paged, and ordered on the primary key so pages can't overlap or skip: the
  // table is a row per member PER announcement, so it crosses PostgREST's
  // 1000-row response cap early and an unpaged read silently undercounts.
  const { data, error } = await withTimeout(
    (signal) => selectAllRows<{ announcement_id: string }>((from, to) => getSupabase()
      .from('announcement_reads')
      .select('announcement_id', { count: 'exact' })
      .order('user_id')
      .order('announcement_id')
      .range(from, to)
      .abortSignal(signal)),
    QUERY_TIMEOUT_MS,
    'Read receipts',
  )
  if (error) throw new Error(error.message)
  const counts: Record<string, number> = {}
  for (const row of data) {
    counts[row.announcement_id] = (counts[row.announcement_id] ?? 0) + 1
  }
  return counts
}
