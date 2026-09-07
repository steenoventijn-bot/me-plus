const CACHE='me-plus-v3';
const SHELL=['/','/index.html','/manifest.webmanifest','/icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const request=event.request;
  const isNavigation=request.mode==='navigate';
  const isAppShell=isNavigation || request.url.includes('/index.html') || request.url.includes('/manifest.webmanifest') || request.url.includes('/icon.svg');

  if(isAppShell){
    event.respondWith(
      fetch(request)
        .then(response=>{
          if(response && response.status===200){
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put(request,copy));
          }
          return response;
        })
        .catch(()=>caches.match(request).then(cached=>cached || caches.match('/index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached=>cached || fetch(request).then(response=>{
        if(response && response.status===200){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy));
        }
        return response;
      }))
  );
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if('focus' in client) return client.focus();
      }
      return clients.openWindow ? clients.openWindow('/') : undefined;
    })
  );
});
