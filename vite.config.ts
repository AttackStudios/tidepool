import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * `import.meta.env.DEV` is not usable here: `vite build` applies production
 * semantics whatever `--mode` says, so it folds to false even for a development
 * build. An explicit define keyed off the mode is unambiguous, and portable
 * without needing cross-env on Windows.
 */
export default defineConfig(({ mode }) => ({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  define: {
    __TIDEPOOL_DEV__: JSON.stringify(mode !== 'production'),
  },
  build: { outDir: '../../dist/renderer', emptyOutDir: true },
}))
