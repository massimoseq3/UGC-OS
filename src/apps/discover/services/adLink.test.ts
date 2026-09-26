import { describe, expect, it } from 'vitest'
import { parseAdLink } from './adLink'

describe('parseAdLink', () => {
  it('reads a TikTok video link, with or without a scheme', () => {
    expect(parseAdLink('https://www.tiktok.com/@brand/video/7412345678901234567?is_from_webapp=1')).toMatchObject({
      platform: 'tiktok',
      sourceId: '7412345678901234567',
    })
    expect(parseAdLink('tiktok.com/@brand/video/7412345678901234567')?.platform).toBe('tiktok')
  })

  it('passes a TikTok short link through for the vendor to follow', () => {
    expect(parseAdLink('https://vm.tiktok.com/ZMabc123/')).toMatchObject({ platform: 'tiktok', sourceId: '' })
  })

  it('reads an Instagram reel or post, including one under a handle', () => {
    expect(parseAdLink('https://www.instagram.com/reel/C8FTNDKualt/?igsh=abc')).toMatchObject({
      platform: 'instagram',
      sourceId: 'C8FTNDKualt',
      url: 'https://www.instagram.com/reel/C8FTNDKualt/',
    })
    expect(parseAdLink('https://instagram.com/nike/p/ABC_12-3/')?.sourceId).toBe('ABC_12-3')
  })

  it('refuses an Instagram profile, which names no post', () => {
    expect(parseAdLink('https://www.instagram.com/nike/')).toBeNull()
  })

  it('reads a Meta Ad Library link by its archive id', () => {
    expect(parseAdLink('https://www.facebook.com/ads/library/?active_status=all&id=1234567890123')).toMatchObject({
      platform: 'meta',
      sourceId: '1234567890123',
    })
    expect(parseAdLink('https://www.facebook.com/somepage/posts/123')).toBeNull()
  })

  it('refuses anything else', () => {
    expect(parseAdLink('')).toBeNull()
    expect(parseAdLink('not a link')).toBeNull()
    expect(parseAdLink('https://youtube.com/watch?v=abc')).toBeNull()
    expect(parseAdLink('https://nottiktok.com/@x/video/1')).toBeNull()
  })
})
