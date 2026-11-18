// Olimp Garden menyu — service worker.
// Onlayn bo'lsa har doim eng yangi menyuni ko'rsatadi (network-first),
// oflayn bo'lsa oxirgi saqlangan nusxani beradi.
//
// v2 (2026-11-18): kesh endi cheksiz o'smaydi, faqat o'z saytimizning
// to'g'ri javoblari saqlanadi, xotira to'lsa jim o'tiladi (oldin kesh
// cheksiz kattalashib, planshet xotirasini yeb qo'yardi).

const CACHE = 'olimp-garden-menu-v2';
const MAX_ENTRIES = 500;          // shundan oshsa eng eskisi o'chiriladi
const TRIM_EVERY = 25;            // har 25 yozuvdan keyin bir marta tekshiriladi

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Bosh sahifa va belgilar hech qachon tozalashga tushmaydi.
function isShell(url){
  return SHELL.some((s) => url.endsWith(s.replace('./', '/')) || url.endsWith('/'));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

let sinceTrim = 0;

async function trim(cache){
  sinceTrim++;
  if (sinceTrim < TRIM_EVERY) return;
  sinceTrim = 0;
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  // keys() qo'shilgan tartibda qaytadi — eng eskisidan o'chiramiz.
  const removable = keys.filter((k) => !isShell(k.url));
  const extra = keys.length - MAX_ENTRIES;
  for (const k of removable.slice(0, extra)) {
    await cache.delete(k);
  }
}

async function putSafe(request, response){
  try{
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
    await trim(cache);
  }catch(e){
    // Xotira to'lgan yoki javob saqlab bo'lmaydigan turda — menyuga ta'siri yo'q.
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Faqat o'z saytimiz. Tashqi manzillarga (masalan shriftlar) aralashmaymiz.
  let sameOrigin = false;
  try{ sameOrigin = new URL(req.url).origin === self.location.origin; }catch(e){}
  if (!sameOrigin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Faqat to'g'ri, to'liq javoblar saqlanadi: xato sahifalar, yo'naltirishlar
        // va qisman javoblar keshga tushsa, oflayn holatda buzuq menyu ko'rinardi.
        if (res && res.ok && res.type === 'basic' && res.status === 200){
          putSafe(req, res.clone());
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
