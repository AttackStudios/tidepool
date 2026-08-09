import type { TidePoolApi } from '../main/preload'

declare global {
  interface Window {
    tidepool: TidePoolApi
  }
}
export {}
