import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Catches render errors so one broken component doesn't blank the window.
 *
 * Without this, any thrown error during render unmounts the whole tree and the
 * user is left staring at an empty frame with no way back short of force
 * quitting — and no clue what happened.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Goes to the terminal running the app, which is where a report starts.
    console.error('Render error:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <h1>Something broke</h1>
        <p className="muted">
          A part of the interface failed to render. Your profiles and installed mods are files on
          disk and are untouched by this.
        </p>
        <pre className="crash__detail">{error.message}</pre>
        <div className="crash__actions">
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="button--ghost" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            className="button--ghost"
            onClick={() =>
              void window.tidepool.openExternal(
                'https://github.com/AttackStudios/tidepool/issues/new',
              )
            }
          >
            Report it
          </button>
        </div>
      </div>
    )
  }
}
