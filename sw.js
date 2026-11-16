/* Flávia Reminder V6.3 — notificações com tulipas e ações seguras */
const CACHE='flavia-reminder-v6.5';
const API='https://flavia-reminder-api.pedrohaubert52.workers.dev';
const CORE=['./','./index.html','./styles.css','./app.js','./push.js','./icon.svg','./apple-touch-icon.png','./manifest.webmanifest','./assets/tulips.svg','./assets/study.svg','./assets/pedro-pixel.png','./assets/oliver-animado.gif','./assets/layla-animada.gif','./assets/notificacao-tulipas.png','./assets/badge-tulipa.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('flavia-reminder-')&&n!==CACHE).map(n=>caches.delete(n)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}return r;}).catch(()=>caches.match(e.request)));
});
self.addEventListener('push',event=>{
 let p={};try{p=event.data?event.data.json():{};}catch{}
 const url=new URL(p.url||self.registration.scope,self.registration.scope);
 if(url.origin!==self.location.origin)url.href=self.registration.scope;
 const actionable=Boolean(p.reminderId&&p.proof);
 const opts={body:p.body||'Seu lembrete chegou! 💜',icon:new URL('./icon-192.png',self.registration.scope).href,badge:new URL('./assets/badge-tulipa.png',self.registration.scope).href,image:new URL('./assets/notificacao-tulipas.png',self.registration.scope).href,
   tag:actionable?'flavia-task-'+String(p.reminderId).slice(0,140):'flavia-test-'+Date.now(),renotify:actionable,
   data:{url:url.href,id:p.reminderId||null,proof:p.proof||null},timestamp:Date.now(),
   actions:actionable?[{action:'done',title:'✅ Concluir'},{action:'snooze',title:'⏰ Adiar 10 min'}]:[{action:'open',title:'🌷 Ver lembrete'}]};
 event.waitUntil(self.registration.showNotification(p.title||'Flávia Reminder 🌷',opts));
});
async function openApp(url){
 const safe=new URL(url||self.registration.scope,self.registration.scope);if(safe.origin!==self.location.origin)safe.href=self.registration.scope;
 const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
 for(const tab of windows){if(new URL(tab.url).origin===safe.origin){await tab.focus();if('navigate'in tab&&tab.url!==safe.href)await tab.navigate(safe.href);return;}}
 if(clients.openWindow)await clients.openWindow(safe.href);
}
self.addEventListener('notificationclick',event=>{
 const data=event.notification.data||{},action=event.action;
 event.notification.close();
 event.waitUntil((async()=>{
   if(['done','snooze'].includes(action)&&data.id&&data.proof){
     try{
       const res=await fetch(API+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:data.id,proof:data.proof,action})});
       if(!res.ok)throw Error('HTTP '+res.status);
       const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
       windows.forEach(w=>w.postMessage({type:'flavia-action-updated'}));
       return; // Registrado no servidor, sem abrir o app.
     }catch(err){console.warn('Falha na ação da notificação:',err);await openApp(data.url);return;}
   }
   await openApp(data.url);
 })());
});
