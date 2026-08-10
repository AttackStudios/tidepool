import { describe, expect, it } from 'vitest'
import { DEV_COMMUNITIES, HOME_COMMUNITY, communitiesFor, showCommunityPicker } from './communities'

describe('communitiesFor', () => {
  it('offers only Surf Sandbox in a packaged build', () => {
    // Someone installing a Surf Sandbox mod manager and finding Lethal Company
    // selected would reasonably conclude it was broken.
    expect(communitiesFor(false)).toEqual([HOME_COMMUNITY])
  })

  it('exposes no development target in a packaged build', () => {
    const slugs = communitiesFor(false).map((c) => c.slug)
    for (const dev of DEV_COMMUNITIES) expect(slugs).not.toContain(dev.slug)
  })

  it('offers the development targets when unpackaged', () => {
    expect(communitiesFor(true).map((c) => c.slug))
      .toEqual(['surf-sandbox', 'lethal-company', 'valheim'])
  })

  it('hides the picker entirely when there is nothing to choose', () => {
    expect(showCommunityPicker(false)).toBe(false)
    expect(showCommunityPicker(true)).toBe(true)
  })

  it('always leads with Surf Sandbox', () => {
    expect(communitiesFor(true)[0]).toEqual(HOME_COMMUNITY)
    expect(communitiesFor(false)[0]).toEqual(HOME_COMMUNITY)
  })
})
