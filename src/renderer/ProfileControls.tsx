import type { Profile } from '../shared/types'

export function ProfileControls({
  profiles,
  current,
  onSelect,
  onChanged,
}: {
  profiles: Profile[]
  current: Profile | null
  onSelect: (id: string) => void
  onChanged: () => void
}) {
  const create = async () => {
    const name = window.prompt('Profile name', `Profile ${profiles.length + 1}`)
    if (name?.trim()) {
      await window.tidepool.createProfile(name.trim())
      onChanged()
    }
  }

  const rename = async () => {
    if (!current) return
    const name = window.prompt('Rename profile', current.name)
    if (name?.trim()) {
      await window.tidepool.renameProfile(current.id, name.trim())
      onChanged()
    }
  }

  const duplicate = async () => {
    if (!current) return
    await window.tidepool.duplicateProfile(current.id)
    onChanged()
  }

  const remove = async () => {
    if (!current) return
    // Deleting takes the installed mods with it, so make that explicit.
    const ok = window.confirm(
      `Delete “${current.name}” and its ${current.mods.length} installed mod(s)? This cannot be undone.`,
    )
    if (!ok) return
    await window.tidepool.deleteProfile(current.id)
    onChanged()
  }

  return (
    <div className="profilebar">
      <label className="field">
        <span className="field__label">Profile</span>
        <select
          value={current?.id ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Active profile"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.mods.length})</option>
          ))}
        </select>
      </label>
      <button className="button--ghost" onClick={() => void create()}>New</button>
      <button className="button--ghost" onClick={() => void rename()} disabled={!current}>Rename</button>
      <button className="button--ghost" onClick={() => void duplicate()} disabled={!current}>Duplicate</button>
      <button
        className="button--danger"
        onClick={() => void remove()}
        disabled={!current || profiles.length < 2}
        title={profiles.length < 2 ? 'Keep at least one profile' : undefined}
      >
        Delete
      </button>
    </div>
  )
}
