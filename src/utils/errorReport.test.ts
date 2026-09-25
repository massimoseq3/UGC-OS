import { describe, expect, it } from 'vitest'
import { buildReport, fingerprintOf, isNoise, mergeReport, normalizeMessage, scrub, subtractSent, topSource, MAX_COUNT, type ErrorReport } from './errorReport'
import { humanizeError, onErrorShown, type ShownError } from './friendlyError'

const env = { appId: 'playground', buildId: 'b1', secrets: [] as string[], context: {} }

function report(fingerprint: string, count = 1): ErrorReport {
  return { fingerprint, kind: 'error', app_id: null, message: fingerprint, shown: null, operation: null, stack: null, context: {}, build_id: 'b1', count }
}

describe('scrub', () => {
  it("takes the member's own keys out wherever they appear", () => {
    expect(scrub('kie.ai 401: key sk-live-abcdef123456 rejected', ['sk-live-abcdef123456'])).toBe('kie.ai 401: key [key] rejected')
  })

  it('removes bearer tokens, JWTs and signed-URL queries but keeps where the URL pointed', () => {
    const out = scrub(
      'Authorization: Bearer abc.def-123 failed for https://r2.example.com/auth/u1/a.png?X-Amz-Signature=deadbeef&X-Amz-Date=1 with eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4',
    )
    expect(out).toContain('Bearer [redacted]')
    expect(out).toContain('https://r2.example.com/auth/u1/a.png?[…]')
    expect(out).not.toContain('deadbeef')
    expect(out).toContain('[jwt]')
  })

  it('drops inline base64 media', () => {
    expect(scrub('bad image data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')).toBe('bad image data:[…]')
  })
})

describe('fingerprints', () => {
  it('group the same failure across different task ids and URLs', () => {
    const a = fingerprintOf({ kind: 'failed', name: 'Error', operation: 'Video generation failed.', stack: null, message: 'kie.ai 500 at POST /jobs taskId=7f3a9c2e11aa url=https://x.y/1' })
    const b = fingerprintOf({ kind: 'failed', name: 'Error', operation: 'Video generation failed.', stack: null, message: 'kie.ai 500 at POST /jobs taskId=0000ffff9999 url=https://x.y/2' })
    expect(a).toBe(b)
  })

  it('keep different HTTP statuses apart', () => {
    expect(normalizeMessage('kie.ai 422 at POST')).not.toBe(normalizeMessage('kie.ai 500 at POST'))
    expect(normalizeMessage('took 1532ms')).toBe(normalizeMessage('took 88ms'))
  })

  it('keep the same message from two different chunks apart, but not across deploys of one', () => {
    const msg = "Cannot read properties of undefined (reading 'map')"
    const playground = fingerprintOf({ kind: 'crash', name: 'TypeError', operation: null, message: msg, stack: `TypeError: ${msg}\n    at Kt (https://app.x/assets/Playground-Bx7a9Qe1.js:1:2345)` })
    const redeployed = fingerprintOf({ kind: 'crash', name: 'TypeError', operation: null, message: msg, stack: `TypeError: ${msg}\n    at Qa (https://app.x/assets/Playground-Zz0011Aa.js:9:10)` })
    const broll = fingerprintOf({ kind: 'crash', name: 'TypeError', operation: null, message: msg, stack: `TypeError: ${msg}\n    at Kt (https://app.x/assets/BrollStudio-Bx7a9Qe1.js:1:2345)` })
    expect(playground).toBe(redeployed)
    expect(playground).not.toBe(broll)
  })

  it('read the chunk name off a stack frame', () => {
    expect(topSource('at x (https://a.b/assets/Playground-Bx7a9Qe1.js:1:2)')).toBe('Playground')
    expect(topSource(null)).toBe('')
  })
})

describe('isNoise', () => {
  it('filters cancelled requests, browser quirks and extensions', () => {
    expect(isNoise('AbortError', 'The user aborted a request.', null)).toBe(true)
    expect(isNoise(null, 'ResizeObserver loop completed with undelivered notifications.', null)).toBe(true)
    expect(isNoise(null, 'Script error.', null)).toBe(true)
    expect(isNoise('TypeError', 'x is undefined', 'TypeError: x\n    at chrome-extension://abc/content.js:1:1')).toBe(true)
  })

  it('keeps real errors', () => {
    expect(isNoise('TypeError', "Cannot read properties of undefined (reading 'map')", 'at x (https://a.b/assets/App-12345678.js:1:1)')).toBe(false)
  })
})

describe('the outbox', () => {
  it('coalesces one fingerprint and caps the count', () => {
    let box = mergeReport([], report('a'), 5)
    box = mergeReport(box, report('a', MAX_COUNT), 5)
    expect(box).toHaveLength(1)
    expect(box[0].count).toBe(MAX_COUNT)
  })

  it('drops a new fingerprint once full, keeping the first ones', () => {
    const box = mergeReport([report('a'), report('b')], report('c'), 2)
    expect(box.map((r) => r.fingerprint)).toEqual(['a', 'b'])
  })

  it('keeps occurrences that landed while a send was in flight', () => {
    const sent = [report('a', 2), report('b', 1)]
    const now = [report('a', 5), report('b', 1), report('c', 1)]
    expect(subtractSent(now, sent)).toEqual([report('a', 3), report('c', 1)])
  })
})

describe('buildReport', () => {
  it('scrubs before fingerprinting and caps what it keeps', () => {
    const r = buildReport(
      { kind: 'failed', name: 'Error', message: `kie.ai 500 for key sk-secret-000000 ${'x'.repeat(2000)}`, stack: null, shown: 'Try again.', operation: 'Enhance failed.' },
      { ...env, secrets: ['sk-secret-000000'] },
    )
    expect(r.message).not.toContain('sk-secret-000000')
    expect(r.message.length).toBeLessThanOrEqual(1000)
    expect(r.app_id).toBe('playground')
    expect(r.context.name).toBe('Error')
    expect(r.count).toBe(1)
  })
})

describe('humanizeError → reporter hook', () => {
  it("tells the listener what the member saw, and flags the member's own situation", () => {
    const heard: ShownError[] = []
    const off = onErrorShown((e) => heard.push(e))
    humanizeError(new Error('kie.ai 402 (insufficient credits)'), 'Video generation failed.')
    humanizeError(new Error('kie.ai 500 at POST /jobs/createTask'), 'Video generation failed.')
    humanizeError(new Error('something new'))
    off()
    humanizeError(new Error('after unsubscribing'))

    expect(heard).toHaveLength(3)
    expect(heard[0].member).toBe(true)
    expect(heard[1].member).toBe(false)
    expect(heard[1].fallback).toBe('Video generation failed.')
    expect(heard[1].shown).toMatch(/server error/)
    // The generic fallback names no operation.
    expect(heard[2].fallback).toBeNull()
  })

  it('returns the same copy it always did', () => {
    expect(humanizeError(new Error('kie.ai 402'), 'x')).toMatch(/out of kie\.ai credits/)
    expect(humanizeError('', 'Fallback sentence.')).toBe('Fallback sentence.')
  })
})
