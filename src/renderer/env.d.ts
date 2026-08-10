import type { TidePoolApi } from '../main/preload'

declare global {
  interface Window {
    tidepool: TidePoolApi
  }
  /** Injected by vite.config.ts; true only for a development build. */
  const __TIDEPOOL_DEV__: boolean
}

export {}
