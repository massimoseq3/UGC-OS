import { beforeEach, describe, expect, it, vi } from 'vitest'

// The beta gate reads two things: whether this build has accounts, and whether
// the signed-in profile is an admin. Both are stubbed so the test can be each
// kind of viewer.
const viewer = { cloud: true, admin: false }

vi.mock('../lib/supabase', () => ({ isCloudEnabled: () => viewer.cloud }))
vi.mock('./authStore', () => ({
  useAuthStore: { getState: () => ({ profile: { is_admin: viewer.admin } }) },
}))

const { BETA_APPS, isAppVisible, useAppVisibilityStore } = await import('./appVisibilityStore')

describe('the Flow beta gate', () => {
  beforeEach(() => {
    viewer.cloud = true
    viewer.admin = false
    useAppVisibilityStore.getState().setOptionalEnabled('flow', true)
  })

  it('keeps Flow from a member even with the switch on', () => {
    expect(BETA_APPS.has('flow')).toBe(true)
    expect(isAppVisible('flow')).toBe(false)
  })

  it('shows Flow to an admin who switched it on, and not after switching it off', () => {
    viewer.admin = true
    expect(isAppVisible('flow')).toBe(true)
    useAppVisibilityStore.getState().setOptionalEnabled('flow', false)
    expect(isAppVisible('flow')).toBe(false)
  })

  it('treats a build with no accounts as the operator', () => {
    viewer.cloud = false
    expect(isAppVisible('flow')).toBe(true)
  })

  it("leaves apps outside the beta to their own switch", () => {
    expect(isAppVisible('discover')).toBe(true)
    useAppVisibilityStore.getState().setOptionalEnabled('discover', false)
    expect(isAppVisible('discover')).toBe(false)
    expect(isAppVisible('voice-studio')).toBe(true)
  })
})
