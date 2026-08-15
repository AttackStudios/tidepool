import type { GameInstall } from '../shared/types'

/**
 * First-run orientation.
 *
 * Shown until dismissed, and it reflects real state rather than a fixed script —
 * a step already done is ticked, so it reads as progress rather than homework.
 */
/** 25 August 2026, the day Surf Sandbox releases. */
const RELEASE_DAY = Date.UTC(2026, 7, 25)

export function Welcome({
  game,
  hasMods,
  onDismiss,
}: {
  game: GameInstall | null | undefined
  hasMods: boolean
  onDismiss: () => void
}) {
  // Before release there is genuinely nothing to install. Telling someone to go
  // and install BepInExPack when no community exists is how they conclude the
  // app is broken rather than early.
  const gameOut = Date.now() >= RELEASE_DAY

  const steps = [
    {
      done: Boolean(game),
      title: 'Find your game',
      body: game
        ? `Found at ${game.root}`
        : gameOut
          ? 'TidePool reads Steam’s own records. If it hasn’t found Surf Sandbox, use “Locate game” above.'
          : 'Surf Sandbox isn’t out until 25 August 2026, so there’s nothing to find yet.',
    },
    {
      done: hasMods,
      title: 'Install some mods',
      body: gameOut
        ? 'Search for BepInExPack in Browse and install it — that’s the loader mods run on. Anything a mod needs is pulled in automatically.'
        : 'Nothing to install yet — mods appear once people start publishing them. TidePool checks fresh every time, so there’s nothing for you to update.',
    },
    {
      done: false,
      title: 'Drop in',
      body: gameOut
        ? 'Starts the game with this profile’s mods. Or use “Via Steam” to keep the overlay and playtime.'
        : 'Once the game is out, this starts it with your mods loaded.',
    },
  ]

  return (
    <section className="welcome">
      <div className="welcome__head">
        <h2>Welcome to TidePool</h2>
        <button className="button--ghost" onClick={onDismiss}>Dismiss</button>
      </div>
      <p className="muted">
        A mod manager for Surf Sandbox. Each profile is a separate set of mods, and switching between
        them never touches your game install — so going back to vanilla is always one click.
      </p>
      <ol className="welcome__steps">
        {steps.map((s) => (
          <li key={s.title} className={s.done ? 'is-done' : ''}>
            <span
              className={s.done ? 'welcome__tick is-done' : 'welcome__tick'}
              aria-hidden="true"
            />
            <div>
              <strong>{s.title}</strong>
              <p className="muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
