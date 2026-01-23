import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Version for debugging cache issues
const APP_VERSION = 'v3-ios-fix-2024-01-23';
console.log(`[Familiar] ${APP_VERSION} loaded`);

// Force service worker update check
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) {
      console.log('[SW] Checking for updates...');
      reg.update().then(() => {
        console.log('[SW] Update check complete');
      });
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
