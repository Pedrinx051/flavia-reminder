const CACHE='flavia-reminder-v5.0';
const CORE=['./','./index.html','./styles.css','./app.js','./push.js','./icon.svg','./apple-touch-icon.png','./manifest.webmanifest','./assets/tulips.svg','./assets/study.svg','./assets/pedro-pixel.png','./assets/notificacao-tulipas.png','./assets/badge-tulipa.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('flavia-reminder-')&&n!==CACHE).map(n=>caches.delete(n)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});

// Visual da notificação é parcialmente controlado pelo sistema operacional.
self.addEventListener('push', event => {
  let info = {};
  try { info = event.data ? event.data.json() : {}; } catch { /* usa padrão */ }
  const safeUrl = new URL(info.url || self.registration.scope, self.registration.scope);
  if (safeUrl.origin !== self.location.origin) safeUrl.href = self.registration.scope;
  const tag = info.reminderId ? 'flavia-task-' + String(info.reminderId).slice(0,160) : 'flavia-test';
  event.waitUntil(self.registration.showNotification(info.title || 'Flávia Reminder 🌷', {
    body: info.body || 'Seu lembrete chegou! 💜',
    icon: './icon-192.png',
    badge: './assets/badge-tulipa.png',
    image: './assets/notificacao-tulipas.png',
    tag,
    renotify: true,
    data: { url: safeUrl.href },
    actions: [{ action:'open', title:'🌷 Ver lembrete' }],
    timestamp: Date.now()
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || self.registration.scope);
  if(url.origin !== self.location.origin) url.href = self.registration.scope;
  event.waitUntil((async () => {
    const tabs = await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const tab of tabs){
      if(new URL(tab.url).origin === url.origin){
        await tab.focus();
        if('navigate' in tab && tab.url !== url.href) await tab.navigate(url.href);
        return;
      }
    }
    await clients.openWindow(url.href);
  })());
});
