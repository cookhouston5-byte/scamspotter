// ScamSpotter service worker. Its only job: receive things shared from the phone's Share menu.
// The shared text or screenshot is held in this browser's cache just long enough for /check to read it, then deleted.
// Nothing is cached for offline use and nothing is sent to the server here.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'POST' || url.origin !== location.origin || url.pathname !== '/share-target') return;
  e.respondWith((async () => {
    try{
      const fd = await e.request.formData();
      const cache = await caches.open('ss-share');
      const file = fd.getAll('image').find(f => f && f.size && /^image\//.test(f.type));
      const text = ['title','text','url'].map(k => fd.get(k)).filter(v => typeof v === 'string' && v.trim()).join('\n');
      await Promise.all([cache.delete('/shared/image'), cache.delete('/shared/text')]);
      if(file) await cache.put('/shared/image', new Response(file, { headers:{ 'Content-Type': file.type } }));
      if(text) await cache.put('/shared/text', new Response(text, { headers:{ 'Content-Type':'text/plain; charset=utf-8' } }));
      return Response.redirect('/check?shared=1', 303);
    }catch(err){ return Response.redirect('/check?shared=0', 303); }
  })());
});
