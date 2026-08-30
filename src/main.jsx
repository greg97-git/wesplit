import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './styles.css'

// The service worker makes the app open instantly, but it also means a device
// can keep running an old build indefinitely — an installed iOS app is
// suspended rather than reloaded, so it may never check for a new one. Check
// every time the app comes back to the foreground, and reload when there is
// something newer.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    const check = () => {
      if (!document.hidden) registration.update()
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    setInterval(check, 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
