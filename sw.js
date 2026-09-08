const CACHE='me-plus-v6';
const SHELL=['/','/index.html','/styles.css?v=6','/app.js?v=6','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const url=new URL(e.request.url);if(url.origin!==location.origin)return;const core=e.request.mode==='navigate'||SHELL.some(x=>url.pathname===x.split('?')[0]);if(core){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request).then(x=>x||caches.match('/index.html'))))}else{e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request)))}});
