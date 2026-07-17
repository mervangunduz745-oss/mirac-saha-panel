const CACHE='mirac-saha-v1';
const ROOT='/mirac-saha-panel/';
const ASSETS=[
  ROOT,
  ROOT+'siyah-saha-paneli.html',
  ROOT+'siyah-saha-supabase.js',
  ROOT+'supabase-config.js',
  ROOT+'manifest.webmanifest',
  ROOT+'favicon.svg'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).catch(()=>undefined));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match(ROOT+'siyah-saha-paneli.html'))));
});
