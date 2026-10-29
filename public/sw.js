// Minimal service worker: makes WODXP installable ("Add to Home Screen").
// It deliberately does NOT cache anything, so deploys always show up at once.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
