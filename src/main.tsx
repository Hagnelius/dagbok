import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerSW } from 'virtual:pwa-register'

// Service worker: cachar appen för offlinebruk och uppdaterar automatiskt vid nästa start.
if (import.meta.env.PROD) registerSW({ immediate: true })

// Be webbläsaren om beständig lagring så att IndexedDB inte rensas vid lagringsbrist.
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
