/** Renderer-side mirrors of main-process shapes not in shared/types. */
export interface ModUpdate {
  fullName: string
  current: string
  latest: string
  ref: string
  viaDependency: boolean
}
