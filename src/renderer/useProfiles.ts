import { useCallback, useEffect, useState } from 'react'
import type { Profile } from '../shared/types'

/** Profile list plus the currently selected one, with a default created on first run. */
export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    let list: Profile[] = await window.tidepool.listProfiles()
    if (list.length === 0) {
      await window.tidepool.createProfile('Default')
      list = await window.tidepool.listProfiles()
    }
    setProfiles(list)
    setCurrentId((id) => (id && list.some((p) => p.id === id) ? id : (list[0]?.id ?? null)))
    return list
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const create = useCallback(async (name: string) => {
    await window.tidepool.createProfile(name)
    await refresh()
  }, [refresh])

  const current = profiles.find((p) => p.id === currentId) ?? null
  return { profiles, current, currentId, setCurrentId, refresh, create }
}
