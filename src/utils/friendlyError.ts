// Single source of truth for the user-facing error text shown anywhere a
// generation/API call can fail. Every catch block that surfaces an error to a
// real user (toast, inline chip, history row) should run the caught value
// through humanizeError so the whole app speaks with one voice and users get a
// plain-English "here's what to do" line instead of a raw kie.ai 4xx/5xx dump.
//
// NOTE: This deliberately overrides the older CLAUDE.md "surface raw kie.ai
// response shape" rule for *end-user* surfaces — the operator asked for friendly
// copy so members stop forwarding raw errors as support questions. The raw text
// still lives in kie.ai's own request logs (which the operator reads) and in
// admin/settings/infra surfaces, which intentionally keep verbatim messages.

/**
 * An error whose message is ALREADY the sentence to show the member —
 * `humanizeError` hands it straight back instead of matching it against the
 * table below.
 *
 * The table exists to translate a VENDOR's wording, and it can only ever
 * recognise wording it has seen. Anything we raise ourselves that is more
 * specific than the copy a rule could give — a file we measured, a browser
 * capability we probed, a limit we know the exact number of — loses that detail
 * the moment it falls through to the generic fallback. Throw this instead, and
 * write the message as a complete sentence that names what to do next.
 *
 * Do NOT reach for it to smuggle raw API text past the table: the whole point
 * of the table is that a member never reads a vendor's 4xx. This is for
 * sentences written for a member in the first place.
 */
export class FriendlyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FriendlyError'
  }
}

// The three sentences a member can fix from the toast that shows them: the
// toast store matches on these exact strings and puts a Connect Key / Add
// Credits button beside them (stores/appStore.ts). They name no Settings path,
// because the button — and the menu bar's red "Connect Your kie.ai API Key"
// wherever the sentence shows without one — is the way in.
export const NO_KIE_KEY_MESSAGE = 'Connect your kie.ai API key to start generating.'
export const INVALID_KIE_KEY_MESSAGE =
  'Your kie.ai API key looks invalid or expired. Connect a fresh key from kie.ai, then try again.'
export const NO_KIE_CREDITS_MESSAGE =
  "You're out of kie.ai credits. Top up your balance at kie.ai, then try again."
const MEMBER_FIX_MESSAGES = [NO_KIE_KEY_MESSAGE, INVALID_KIE_KEY_MESSAGE, NO_KIE_CREDITS_MESSAGE]

// Each rule matches case-insensitively against the raw error message. Order
// matters: most specific first, generic codes last. The first match wins.
//
// `member: true` marks a failure that is the member's own situation rather than
// something broken — no key, a wrong key, an empty balance, the content filter.
// The error reporter (utils/errorReporter.ts) skips those, so Admin → Errors
// lists bugs rather than every member who ran out of credits. A new rule for a
// cause only the member can fix takes the flag; anything that might be ours
// (a 422 is as often our request shape as their input) does not.
const RULES: Array<{ test: (m: string) => boolean; message: string; member?: true }> = [
  // ── ScrapeCreators (Outliers search) ──
  //
  // These MUST stay above the kie.ai rules below: both services use 401 and
  // 402, and the generic kie rules would otherwise tell a member to go and
  // replace their kie.ai key when it's the ScrapeCreators one that's wrong.
  // ScrapeCreatorsError prefixes every message with the vendor name so this
  // test can't be fooled by a kie error that happens to contain a number.
  {
    test: (m) => m.includes('scrapecreators') && m.includes('401'),
    message:
      "That ScrapeCreators API key isn't valid. Open Settings, paste a fresh key from scrapecreators.com, and try again.",
    member: true,
  },
  {
    // ScrapeCreators answers an UNRECOGNISED key with 402 "out of credits",
    // not 401 — verified against the live API. So this one message has to cover
    // both causes, or a member who typo'd their key is sent off to buy credits
    // they already have.
    test: (m) => m.includes('scrapecreators') && (m.includes('402') || m.includes('credit')),
    message:
      "ScrapeCreators turned that search down. Either the key is wrong or you're out of credits. Check the key in Settings, then top up at scrapecreators.com if it's correct.",
    member: true,
  },
  {
    test: (m) => m.includes('scrapecreators') && m.includes('429'),
    message:
      'ScrapeCreators is rate-limiting requests right now. Wait a few seconds and search again.',
  },
  {
    test: (m) => m.includes('scrapecreators') && /\b(0|5\d\d)\b/.test(m),
    message:
      'Could not reach ScrapeCreators. Check your internet connection and try the search again.',
  },
  {
    test: (m) => m.includes('scrapecreators'),
    message:
      'That search failed. Try a different phrase, or check your ScrapeCreators key in Settings.',
  },

  // ── Higgsfield (the Soul models) ──
  //
  // Above the kie rules for the ScrapeCreators reason: Higgsfield answers a
  // bad key with 401 and an empty balance with 403, and the kie rules would
  // send the member to the wrong site. utils/higgsfield.ts starts every
  // message "Higgsfield <status>:" and parks the endpoint (which holds a
  // request UUID full of digits) behind `endpoint=`, so these match the status
  // itself and nothing else.
  {
    test: (m) => m.includes('no higgsfield key'),
    message:
      'No Higgsfield key yet. Open Settings, paste your key from the Higgsfield console, and try again.',
  },
  {
    test: (m) => m.startsWith('higgsfield 401:'),
    message:
      "Your Higgsfield key isn't valid. Open Settings, paste a fresh KEY_ID:KEY_SECRET from the Higgsfield console, and try again.",
  },
  {
    test: (m) => m.startsWith('higgsfield 403:'),
    message:
      "Your Higgsfield balance has run out. Top it up in the Higgsfield console, then try again.",
  },
  {
    // Only reached when a submit waited ten minutes for a slot — the client
    // retries a concurrency refusal on its own until then.
    test: (m) => m.startsWith('higgsfield 400:') && m.includes('concurrent'),
    message:
      'Your Higgsfield account is still busy with earlier generations. Wait for them to finish and try again.',
  },
  {
    test: (m) => /^higgsfield (423|503):/.test(m),
    message:
      'Higgsfield has this model switched off for now. This is on their end, not yours. Try again later.',
  },
  {
    test: (m) => m.startsWith('higgsfield 404:'),
    message:
      "Higgsfield says this model isn't available on your account. Check the model in the Higgsfield console.",
  },
  {
    test: (m) => /^higgsfield 5\d\d:/.test(m),
    message:
      'Higgsfield had a server error. This is on their end, not yours. Try again in a moment.',
  },
  {
    test: (m) => m.includes('connection to higgsfield kept failing'),
    message:
      'Lost the connection to Higgsfield while waiting. Check your internet. The generation may have finished anyway, so check the Higgsfield console before running it again.',
  },
  {
    // PollTimeoutError from the Higgsfield poller on a healthy connection.
    test: (m) => m.includes('timed out') && m.includes('on higgsfield'),
    message:
      "This is taking longer than we wait for, so we stopped watching. It's likely still running on Higgsfield. Check the Higgsfield console before generating it again.",
  },
  {
    // A submit we hung up on may still have been created — Higgsfield takes no
    // idempotency key, which is why the client never resends one.
    test: (m) => m.startsWith('higgsfield request timed out'),
    message:
      'The request was dropped before Higgsfield answered. It may have gone through anyway, so check the Higgsfield console before retrying.',
  },
  {
    test: (m) => m.startsWith('higgsfield connection failed'),
    message:
      'The connection to Higgsfield dropped mid-request. Check your internet connection and try again.',
  },
  {
    // Failed requests are refunded by Higgsfield.
    test: (m) => m.startsWith('higgsfield generation failed'),
    message:
      "Higgsfield couldn't generate this one, and nothing was charged. Try again, or reword the prompt.",
  },
  {
    test: (m) => m.startsWith('higgsfield'),
    message:
      'Higgsfield turned that request down. Try again, or check your Higgsfield key in Settings.',
  },

  // ── Veo: Google's per-prompt audio-generation failure (HTTP 400) ──
  {
    test: (m) => m.includes('unable to generate audio') || (m.includes('google model') && m.includes('audio')),
    message:
      "Veo couldn't generate audio for this prompt. This is a Google model limitation, not a problem with your account. Try rephrasing the prompt (simplify or change any dialogue) and generate again, or switch to a different video model.",
  },

  // ── Content moderation / safety filters ──
  //
  // This has to sit above the 422/validation rule at the bottom, because a
  // refused prompt usually arrives AS a validation error — and "adjust your
  // inputs (prompt, reference images, or settings)" sends a member off to
  // swap pictures and resolutions when the words are the problem. Each vendor
  // words the refusal differently and only a handful said "sensitive" or
  // "safety", so the rest fell through: ByteDance answers a Seedance rejection
  // with `InputTextSensitiveContentDetected` or a bare "text risk not passed",
  // Kling with "suspected of violating", Google with PROHIBITED_CONTENT.
  // Match the vendor's own vocabulary, not ours.
  //
  // Kept deliberately free of loose words: bare 'blocked' catches a throttle
  // message and bare 'explicit' catches "explicit aspect_ratio required", and
  // either would route an unrelated failure to copy about the member's script.
  {
    test: (m) =>
      m.includes('sensitive') ||
      m.includes('moderation') ||
      m.includes('flagged') ||
      m.includes('content policy') ||
      m.includes('content filter') ||
      m.includes('safety') ||
      m.includes('nsfw') ||
      m.includes('violat') ||
      m.includes('prohibited') ||
      m.includes('inappropriate') ||
      m.includes('sexual') ||
      m.includes('risk not passed') ||
      m.includes('risk control'),
    message:
      "The model's content filter turned this down. It's the wording of the prompt or a reference image, not your account. Rewrite the line and try again.",
    member: true,
  },

  // ── Auth / billing on the kie.ai key ──
  //
  // `getKieApiKey()` throws before any request is made when the field is empty,
  // and its message names no status code and no vendor phrase — so it fell
  // through every rule below and landed on whatever fallback the call site
  // passed. On a generation surface that reads as the model refusing the work,
  // which sends a member off rewriting a prompt when they simply have no key in
  // yet. Above the 401 rule, which is the same problem one step later.
  {
    test: (m) => m.includes('no kie.ai api key'),
    message: NO_KIE_KEY_MESSAGE,
    member: true,
  },
  {
    test: (m) => m.includes('401') || (m.includes('invalid') && m.includes('key')) || (m.includes('expired') && m.includes('key')),
    message: INVALID_KIE_KEY_MESSAGE,
    member: true,
  },
  {
    test: (m) => m.includes('402') || m.includes('insufficient credit') || m.includes('not enough credit'),
    message: NO_KIE_CREDITS_MESSAGE,
    member: true,
  },
  {
    test: (m) => m.includes('433') || (m.includes('usage limit') || m.includes('limit exceeded')),
    message:
      'Your kie.ai key has hit its usage limit. Check your plan limits at kie.ai, then try again.',
    member: true,
  },
  {
    test: (m) => m.includes('429') || m.includes('rate limit') || m.includes('too many request'),
    message:
      'kie.ai is rate-limiting requests right now. Wait a few seconds and try again.',
  },

  // ── kie.ai-side outages (incl. the 200-envelope maintenance case) ──
  {
    test: (m) => m.includes('455') || m.includes('maintenance') || m.includes('maintain'),
    message:
      'kie.ai is under maintenance right now. This is on their end, not yours. Try again in a few minutes.',
  },
  {
    test: (m) => /\b5\d\d\b/.test(m) || m.includes('server error'),
    message:
      'kie.ai had a server error. This is on their end, not yours. Try again in a moment.',
  },

  // ── Network / timeouts (our own messages) ──
  //
  // These four were one rule, and its advice ("the model is likely busy, give
  // it a minute") was wrong for three of them. A dropped connection, a request
  // we hung up on (kie finishes and bills it anyway), and a poll budget that
  // ran out while the task was still rendering all need different next steps —
  // and "try again" is the expensive answer when the work already happened.
  //
  // Order matters: a stalled upload and a blind poll loop both say "timed out"
  // too, so the connection rules must sit above the generic catch-all.
  {
    // r2.ts's stalled upload, and fetchWithRetry giving up on the socket.
    test: (m) =>
      m.includes('stalled') ||
      m.includes('connection failed') ||
      m.includes('failed to fetch') ||
      m.includes('network'),
    message:
      'The connection dropped mid-request. Check your internet connection and try again.',
  },
  {
    // PollTimeoutError with unreachable=true — we gave up while the polls
    // themselves were failing, so the model was never the problem.
    test: (m) => m.includes('connection to kie.ai kept failing'),
    message:
      'Lost the connection to kie.ai while waiting. Check your internet. The generation may have finished anyway, so check kie.ai before running it again.',
  },
  {
    // fetchWithRetry's AbortController fired: we stopped listening before kie
    // answered. kie bills for whatever it finished after that.
    test: (m) => m.includes('request timed out'),
    message:
      'The request was dropped before kie.ai answered. It may have finished anyway, so check kie.ai before retrying.',
  },
  {
    // fetchGeneratedAsset's deadline: kie FINISHED and billed, and the download
    // of the finished file stalled. This used to fall through to the poll-timeout
    // rule below and tell the member their clip was "still running on kie.ai",
    // which sent them off to check a task that was already done — and left them
    // a Retry that re-billed a full generation. It's the biggest files that trip
    // it, so this is the one a Seedance 2.5 clip lands on.
    test: (m) => m.includes('timed out downloading'),
    message:
      "Your result finished, but downloading it timed out. Retry picks up the finished file rather than generating it again, so it costs no extra credits.",
  },
  {
    // The clip arrived and the BROWSER couldn't open it: the metadata probe in
    // videoTask.ts timed out, or the <video> element rejected the blob. Both
    // happen on this machine, after kie has rendered and billed — most often
    // when a whole batch lands at once and every tile is decoding — and both
    // used to fall through to the poll-timeout rule below, which sent members
    // off to kie.ai to look for a task that had already finished. Retrying is
    // free (it re-fetches the finished file), which is the whole message here.
    test: (m) => m.includes('metadata probe timed out') || m.includes('rejected the downloaded video'),
    message:
      "The clip downloaded but this browser couldn't open it. Retry picks the finished file up again and costs no extra credits.",
  },
  {
    // PollTimeoutError on a healthy connection — the task is very likely still
    // rendering on kie.ai, and regenerating pays for it twice.
    test: (m) => m.includes('timed out') || m.includes('timeout'),
    message:
      "This is taking longer than we wait for, so we stopped watching. It's likely still running on kie.ai. Check there before generating it again.",
  },

  // ── Truncated model responses (TruncatedResponseError) ──
  //
  // Distinct from the empty/malformed rule below: the model DID answer, it just
  // ran out of room mid-answer. That matters because the parsers downstream
  // would otherwise accept the fragment — a cut-off storyboard renders as a
  // short one — so this copy has to say the result is incomplete, not that
  // something failed. Keyed on 'output token limit', which is narrower than the
  // 'usage limit' / 'rate limit' rules above and so can't be caught by them.
  {
    test: (m) => m.includes('output token limit'),
    message:
      'The model ran out of room and stopped partway, so this result is incomplete. Try again with a shorter script or fewer scenes, or pick a different model.',
  },

  // ── Empty / malformed model responses ──
  {
    test: (m) =>
      m.includes('empty sse') ||
      m.includes('empty response') ||
      m.includes('non-json') ||
      m.includes('no result') ||
      m.includes('no tracks') ||
      m.includes('no audiourl'),
    message:
      'The model returned an empty result. Try again, or simplify your prompt.',
  },

  // ── Request body too large ──
  //
  // The Ad Analyzer sends a whole video inline, so it is the one surface that
  // can walk past the model's request-size ceiling — and it did, on files the
  // upload screen had already accepted. Without this rule the rejection landed
  // on the generic validation copy below ("adjust your inputs"), which sent
  // members off changing settings on a failure only a smaller file can fix.
  //
  // Kept ABOVE the validation rule because this arrives as a 400 or a 422 as
  // often as a 413, and above the timeout rules is unnecessary — none of them
  // match these words. The phrases are the ones the layers in between actually
  // use (an HTTP 413, a gateway's "request entity too large", the model's own
  // inline-size complaint), the same list `analyzeAd.ts` matches on to stop a
  // doomed retry down the streaming transport.
  //
  // 'too large' is deliberately unqualified: every producer of it here is a
  // size rejection, and pairing it with a status code would miss the ones that
  // come back inside a 200 envelope.
  {
    test: (m) =>
      m.includes('413') ||
      m.includes('too large') ||
      m.includes('too big') ||
      m.includes('entity too large') ||
      m.includes('payload size') ||
      m.includes('request size') ||
      m.includes('exceeds the maximum size'),
    message:
      'This file is too large to send in one request. Trim the ad shorter or export it at a lower resolution, then try again.',
  },

  // ── Generic validation ──
  {
    test: (m) => m.includes('422') || m.includes('validation'),
    message:
      'The request was rejected as invalid. Try adjusting your inputs (prompt, reference images, or settings) and generate again.',
  },
]

const GENERIC_FALLBACK =
  'Something went wrong while generating. Please try again in a moment. If it keeps failing, the model may be temporarily down on kie.ai.'

/** What `humanizeError` tells its listener about each failure it translates. */
export interface ShownError {
  /** The value that was thrown. */
  err: unknown
  /** The sentence the member reads. */
  shown: string
  /** The call site's own fallback — it names the operation. Null for the generic one. */
  fallback: string | null
  /** A rule marked this as the member's own situation (key, credits, filter). */
  member: boolean
}

// One listener, registered by the error reporter. A hook rather than an import
// so this module stays dependency-free: nearly every app imports it, and the
// reporter pulls in the stores and the Supabase client.
let shownListener: ((e: ShownError) => void) | null = null

/** Hear about every failure `humanizeError` translates. Returns the unsubscribe. */
export function onErrorShown(listener: (e: ShownError) => void): () => void {
  shownListener = listener
  return () => {
    if (shownListener === listener) shownListener = null
  }
}

/**
 * Turn any thrown value into one friendly, plain-English sentence for end users.
 * Pass an optional `fallback` to override the generic message for unrecognized
 * errors (e.g. "Couldn't save to your bank. Try again.").
 *
 * The return value is ALWAYS a complete sentence — never prefix it at the call
 * site. `addToast(\`Video generation failed: ${humanizeError(err, 'Video
 * generation failed.')}\`)` renders the operation name twice. Name the
 * operation in the `fallback` instead and toast the result verbatim:
 * `addToast(humanizeError(err, 'Video generation failed.'), 'error')`.
 */
// Where a message stops explaining and starts dumping debug context. Several
// generation errors append the raw evidence an operator needs — `taskId=…`,
// `url=…`, `record={…}`, `body=…`, `size=…B` — and those payloads are full of
// arbitrary digits, while the status-code rules above are plain substring
// matches. So `kie.ai returned an undecodable video (size=402B, …)` matched the
// 402 rule and told a member with a full balance to go and buy credits, and any
// blob size or CDN URL containing 401 told them to replace a working API key.
//
// Matching against the human half only fixes that without weakening anything:
// kie's own status codes and messages always land BEFORE this boundary
// (`friendlyHttpError` builds `kie.ai 402 (insufficient credits) at POST /x: …`),
// and so does every phrase the non-numeric rules look for.
// The leading boundary is "any non-identifier char", not whitespace: these keys
// appear bracketed as often as spaced (`blob (size=1401234B, …)`). `type` is
// deliberately NOT in the list — it only ever follows a `size=`/`url=` that
// already cuts, and including it would truncate at `content-type=` and throw
// away the sentence that names the failure.
export const DEBUG_TAIL = /(?:^|[^a-z0-9])(?:taskid|url|record|body|size|endpoint|response shape|response tail|first \d+ chars)\s*[=:]/i

export function humanizeError(err: unknown, fallback: string = GENERIC_FALLBACK): string {
  const { message, member } = translate(err, fallback)
  // Every call is a failure a member is about to read, which is the moment the
  // error reporter wants. Never allowed to break the copy it rides on.
  if (shownListener) {
    try {
      shownListener({ err, shown: message, fallback: fallback === GENERIC_FALLBACK ? null : fallback, member })
    } catch (e) {
      console.warn('[friendlyError] error listener threw', e)
    }
  }
  return message
}

function translate(err: unknown, fallback: string): { message: string; member: boolean } {
  // Already written for the member — see FriendlyError above. A pre-check that
  // throws one of the member-fix sentences (no key, bad key, no credits) is the
  // member's own situation exactly as if the rule below had matched it, so the
  // error reporter must skip it too.
  if (err instanceof FriendlyError && err.message.trim()) {
    return { message: err.message, member: MEMBER_FIX_MESSAGES.includes(err.message) }
  }
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (!raw) return { message: fallback, member: false }
  const cut = raw.search(DEBUG_TAIL)
  const lower = (cut === -1 ? raw : raw.slice(0, cut)).toLowerCase()
  if (!lower.trim()) return { message: fallback, member: false }
  for (const rule of RULES) {
    if (rule.test(lower)) return { message: rule.message, member: rule.member === true }
  }
  return { message: fallback, member: false }
}
