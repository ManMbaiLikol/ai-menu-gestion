import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

// PWA : capture précoce de l'invite d'installation (l'événement peut survenir
// avant le montage des composants). On la stocke sur `window` et on notifie
// l'app via un événement personnalisé « pwa-installable ».
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__deferredInstallPrompt = e;
  window.dispatchEvent(new Event('pwa-installable'));
});
window.addEventListener('appinstalled', () => {
  (window as any).__deferredInstallPrompt = null;
  window.dispatchEvent(new Event('pwa-installed'));
});

// PWA : enregistrement du service worker (installation mobile + secours hors-ligne)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* échec silencieux : l'app fonctionne sans le SW */
    });
  });
}
