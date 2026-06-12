// Service Worker מינימלי ל-PWA: network-first עם נפילה ל-cache במצב אופליין.
// לא מתערב בבקשות חוצות-מקור (Supabase, WhatsApp) ולא בבקשות שאינן GET.
const CACHE = 'paseo-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase וכו' — לא נוגעים
  e.respondWith(
    fetch(req)
      .then((res) => {
        caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {})
        return res
      })
      .catch(() => caches.match(req)),
  )
})
