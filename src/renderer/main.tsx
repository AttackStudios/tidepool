import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Stamped on <html> so the stylesheet can reserve space for the macOS traffic
// lights. Doing this from the real platform beats inferring it from CSS support.
document.documentElement.dataset.platform = window.tidepool.platform

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
