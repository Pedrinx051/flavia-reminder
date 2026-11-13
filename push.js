/* Flávia Reminder — Web Push para iPhone instalado pela Tela de Início. */
(() => {
  'use strict';
  const API = 'https://flavia-reminder-api.pedrohaubert52.workers.dev';
  const LOCAL_KEY = 'flavia-reminder-push-access';
  const TASKS_KEY = 'flavia-reminder-v1';
  let sub = null, busy = false, timer = null, pulling = false;
  const ACTION_CURSOR='flavia-v6-action-cursor';
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  function message(s, isError=false) {
    const el=$('pushStatus'); if(!el)return;
    el.textContent=s; el.style.color=isError?'#A12D4C':'#704180';
  }
  function publicKeyBytes(base64) {
    const pad='='.repeat((4-base64.length%4)%4);
    const raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/'));
    return Uint8Array.from(raw, c=>c.charCodeAt(0));
  }
  function allowed() {
    return location.protocol==='https:' && 'serviceWorker' in navigator &&
      'PushManager' in window && 'Notification' in window;
  }
  async function request(path, opts={}, auth=true) {
    const token=localStorage.getItem(LOCAL_KEY);
    const response=await fetch(API+path,{
      ...opts,
      headers:{'content-type':'application/json',...(auth && token?{'authorization':`Bearer ${token}`}:{})}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.erro || `Erro HTTP ${response.status}`);
    return data;
  }
  function buildOccurrences() {
    let tasks=[];
    try {tasks=JSON.parse(localStorage.getItem(TASKS_KEY)||'[]');}catch{}
    if(!Array.isArray(tasks))return [];
    const today=new Date(); today.setHours(0,0,0,0);
    const list=[];
    for(let day=0;day<90;day++){
      const d=new Date(today);d.setDate(today.getDate()+day);
      const localDate=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
      for(const task of tasks) {
        if(!task || localDate<task.date)continue;
        let occurs=task.repeat==='daily' ||
          (task.repeat==='none' && localDate===task.date) ||
          (task.repeat==='weekdays' && d.getDay()>=1 && d.getDay()<=5);
        if(task.repeat==='weekly'){
          const start=new Date(`${task.date}T12:00:00`);
          occurs=start.getDay()===d.getDay();
        }
        if(!occurs || task.completed?.[localDate])continue;
        let at=new Date(`${localDate}T${task.time}:00`);
        if(task.snoozes?.[localDate])at=new Date(task.snoozes[localDate]);
        // Mantém ocorrências com atraso de até 90 s ao sincronizar, evitando apagar avisos pendentes.
        if(!Number.isFinite(at.getTime()) || at.getTime()<Date.now()-90000)continue;
        list.push({
          id:`${task.id}|${localDate}`,
          title:String(task.title||'Lembrete').slice(0,90),
          body:String(task.desc||'Chegou a hora! 💜').slice(0,350),
          due_at:at.toISOString()
        });
      }
    }
    return list.slice(0,800);
  }
  async function sync(show=false) {
    if(busy || !localStorage.getItem(LOCAL_KEY))return;
    busy=true;
    try {
      const registration=await navigator.serviceWorker.ready;
      sub=await registration.pushManager.getSubscription();
      if(!sub){if(show)message('Ative as notificações primeiro.');return;}
      const reminders=buildOccurrences();
      const data=await request('/api/sync',{method:'POST',body:JSON.stringify({endpoint:sub.endpoint, reminders})});
      if(show)message(`${data.agendados} ocorrências agendadas para os próximos 90 dias. 🌷`);
    }catch(err){if(show)message(err.message,true);console.warn('Falha ao sincronizar notificações:',err);}
    finally{busy=false;}
  }
  async function pullActions(){
    if(pulling||!localStorage.getItem(LOCAL_KEY)||!allowed())return;
    pulling=true;
    try{
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription();
      if(!subscription)return;
      // Ler ações antes de sincronizar evita reverter um adiamento feito com o app fechado.
      for(let page=0;page<4;page++){
        const cursor=Number(localStorage.getItem(ACTION_CURSOR)||0);
        const result=await request('/api/actions?endpoint='+encodeURIComponent(subscription.endpoint)+'&after='+cursor);
        const actions=result.actions||[];
        if(!actions.length)break;
        window.dispatchEvent(new CustomEvent('flavia-push-actions',{detail:actions}));
        localStorage.setItem(ACTION_CURSOR,String(actions[actions.length-1].id));
        if(actions.length<200)break;
      }
    }catch(err){console.warn('Não foi possível consultar ações anteriores:',err);}
    finally{pulling=false;}
  }
  async function activate() {
    if(!allowed()){message('Notificações Web Push indisponíveis. No iPhone, instale pelo Safari na Tela de Início (iOS 16.4+).',true);return;}
    const button=$('pushEnable');button.disabled=true;
    // No iOS, solicitar permissão diretamente a partir do clique, antes de outros awaits.
    const permissionRequest = Notification.requestPermission();
    try{
      let token=localStorage.getItem(LOCAL_KEY);
      if(!token){token=prompt('Digite o código de acesso configurado no servidor (ACCESS_TOKEN):'); if(!token)return;
        token=token.trim();if(token.length<20)throw Error('O código de acesso parece muito curto.');
        localStorage.setItem(LOCAL_KEY,token);
      }
      const {publicKey}=await request('/api/config',{},false);
      const reg=await navigator.serviceWorker.register('./sw.js?v=6.1');
      await navigator.serviceWorker.ready;
      const permission=await permissionRequest;
      if(permission!=='granted')throw Error('Permissão de notificações não concedida no iPhone.');
      sub=await reg.pushManager.getSubscription();
      if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:publicKeyBytes(publicKey)});
      await request('/api/register',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})});
      await pullActions();
      await sync(true);
      $('pushTest').disabled=false;
      message('Notificações ativadas! Toque em “Enviar teste”. 💜');
    }catch(err){message(err.message,true);console.warn(err);}
    finally{button.disabled=false;}
  }
  async function test(){
    const btn=$('pushTest');btn.disabled=true;
    try{
      if(!sub)sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if(!sub)throw Error('Ative as notificações primeiro.');
      const result=await request('/api/test',{method:'POST',body:JSON.stringify({endpoint:sub.endpoint})});
      message(result.ok?'Teste enviado! Confira as notificações no iPhone. 🔔':'Falha no teste.');
    }catch(err){message(err.message,true);}finally{btn.disabled=false;}
  }
  async function clearCode(){
    if(!confirm('Esquecer o código de acesso salvo neste aparelho?'))return;
    localStorage.removeItem(LOCAL_KEY);message('Código apagado deste aparelho. Os agendamentos existentes no servidor não foram apagados.');
  }
  window.addEventListener('flavia-reminders-updated',()=>{
    clearTimeout(timer);timer=setTimeout(()=>sync(false),1100);
  });
  window.addEventListener('online',()=>pullActions().then(()=>sync(false)));
  window.addEventListener('focus',()=>pullActions().then(()=>sync(false)));
  navigator.serviceWorker?.addEventListener('message',ev=>{if(ev.data?.type==='flavia-action-updated')pullActions().then(()=>sync(false));});
  $('pushEnable')?.addEventListener('click',activate);
  $('pushTest')?.addEventListener('click',test);
  $('pushReset')?.addEventListener('click',clearCode);
  // Corrige automaticamente instalações antigas cujo SW ainda está na V3.
  // Não pede permissão por conta própria; só atualiza a infraestrutura já instalada.
  async function atualizarSW(){
    if(!allowed())return;
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v=6.1');
      await reg.update();
      if(localStorage.getItem(LOCAL_KEY)&&Notification.permission==='granted'){
        await pullActions();
        await sync(false);
        message('Notificações V6 atualizadas 🌷. Faça um teste para confirmar.');
      }
    }catch(err){
      console.warn('Falha ao atualizar o service worker:',err);
      message('Falha ao atualizar notificações. Reabra o app com internet e tente novamente.',true);
    }
  }
  setTimeout(atualizarSW,1200);
  if(localStorage.getItem(LOCAL_KEY) && allowed()){
    $('pushTest').disabled=false;
    message('Código salvo. Se já autorizou, pode testar.');
    setTimeout(()=>pullActions().then(()=>sync(false)),2500);
  }
})();
