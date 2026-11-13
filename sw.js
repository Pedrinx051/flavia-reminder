const CACHE='flavia-reminder-v4.0';
const CORE=['./','./index.html','./styles.css','./app.js','./push.js','./icon.svg','./apple-touch-icon.png','./manifest.webmanifest','./assets/tulips.svg','./assets/study.svg','./assets/pedro-pixel.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('flavia-reminder-')&&n!==CACHE).map(n=>caches.delete(n)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});

self.addEventListener('push',event=>{
  let info={};
  try {info=event.data?event.data.json():{};} catch {info={};}
  event.waitUntil(self.registration.showNotification(info.title || 'Flávia Reminder 🌷',{
    body: info.body || 'Você tem um lembrete! 💜',
    icon:'./icon-192.png',badge:'./icon-192.png',tag:'flavia-'+Date.now(),
    data:{url:info.url || self.registration.scope}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url || self.registration.scope);
  if(url.origin!==self.location.origin)url.href=self.registration.scope;
  event.waitUntil((async()=>{
    const tabs=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const tab of tabs){if(new URL(tab.url).origin===url.origin){await tab.focus();return;}}
    await clients.openWindow(url.href);
  })());
});
