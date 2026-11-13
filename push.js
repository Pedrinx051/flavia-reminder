/* Flávia Reminder V6.3 — Web Push com ativação persistente. */
(() => {
  'use strict';
  const API = 'https://flavia-reminder-api.pedrohaubert52.workers.dev';
  const LOCAL_KEY = 'flavia-reminder-push-access';
  const TASKS_KEY = 'flavia-reminder-v1';
  const ACTIVE_KEY = 'flavia-reminder-push-enabled';
  let sub = null, busy = false, timer = null, pulling = false;
  let pushIsActive = false, manageOpen = false;
  function updatePushUi(active) {
    pushIsActive = Boolean(active);
    $('pushPanel')?.classList.toggle('hidden', pushIsActive && !manageOpen);
    $('pushCompact')?.classList.toggle('hidden', !pushIsActive || manageOpen);
    $('pushHide')?.classList.toggle('hidden', !pushIsActive);
  }
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
    if(!response.ok){const err=Error(data.erro || `Erro HTTP ${response.status}`);err.status=response.status;throw err;}
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
      if(!sub){localStorage.removeItem(ACTIVE_KEY);if(show)message('Assinatura não encontrada. Ative novamente neste aparelho.');updatePushUi(false);return false;}
      const reminders=buildOccurrences();
      const data=await request('/api/sync',{method:'POST',body:JSON.stringify({endpoint:sub.endpoint, reminders})});
      if(show)message(`${data.agendados} ocorrências agendadas para os próximos 90 dias. 🌷`);
      if(Notification.permission === 'granted') localStorage.setItem(ACTIVE_KEY,sub.endpoint);
      updatePushUi(Notification.permission === 'granted');
      return true;
    }catch(err){
      // Não desativa as notificações por causa de internet instável ou falha temporária do servidor.
      // O navegador continua inscrito e o Worker ainda pode enviar os lembretes já agendados.
      const connected=Boolean(sub && Notification.permission === 'granted' && localStorage.getItem(LOCAL_KEY));
      if(err.status===401 || err.status===403){
        manageOpen=true;
        updatePushUi(false);
        message('O código salvo não foi aceito pelo servidor. Toque em “Trocar código de acesso”.',true);
      }else{
        updatePushUi(connected);
        if(show)message('Avisos ativos, mas não foi possível sincronizar agora. Tentaremos de novo com internet.',true);
        else console.warn('Sincronização temporariamente indisponível:',err);
      }
      console.warn('Falha ao sincronizar notificações:',err);
      return false;
    } finally {busy=false;}
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
    const permissionRequest = Notification.permission === 'granted'
      ? Promise.resolve('granted') : Notification.requestPermission();
    try{
      let token=localStorage.getItem(LOCAL_KEY);
      if(!token){token=prompt('Digite o código de acesso configurado no servidor (ACCESS_TOKEN):'); if(!token)return;
        token=token.trim();if(token.length<20)throw Error('O código de acesso parece muito curto.');
        localStorage.setItem(LOCAL_KEY,token);
      }
      const {publicKey}=await request('/api/config',{},false);
      const reg=await navigator.serviceWorker.register('./sw.js?v=6.3');
      await navigator.serviceWorker.ready;
      const permission=await permissionRequest;
      if(permission!=='granted')throw Error('Permissão de notificações não concedida no iPhone.');
      sub=await reg.pushManager.getSubscription();
      if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:publicKeyBytes(publicKey)});
      await request('/api/register',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})});
      await pullActions();
      const synchronized = await sync(true);
      if (!synchronized) return;
      $('pushTest').disabled=false;
      message('Notificações ativadas! Use “Gerenciar” para enviar um teste. 💜');
      localStorage.setItem(ACTIVE_KEY,sub.endpoint);
      manageOpen = false;
      updatePushUi(true);
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
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    $('pushTest').disabled=true;
    manageOpen=false;updatePushUi(false);
    message('Código apagado deste aparelho. Os agendamentos existentes no servidor não foram apagados.');
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
  $('pushManage')?.addEventListener('click',()=>{manageOpen=true;updatePushUi(pushIsActive);});
  $('pushHide')?.addEventListener('click',()=>{manageOpen=false;updatePushUi(pushIsActive);});
  // Verifica automaticamente o estado real da assinatura ao abrir o aplicativo.
  // Permissão e assinatura pertencem ao navegador; o marcador local serve apenas à UI.
  // NUNCA pede permissão automaticamente: o primeiro pedido precisa do clique da pessoa.
  async function restaurarNotificacoes() {
    if(!allowed())return;
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v=6.3');
      await reg.update();
      sub=await reg.pushManager.getSubscription();
      const token=localStorage.getItem(LOCAL_KEY);
      if(Notification.permission==='granted' && sub && token){
        localStorage.setItem(ACTIVE_KEY,sub.endpoint);
        updatePushUi(true);
        $('pushTest').disabled=false;
        message('Avisos ativados neste aparelho. Nada para configurar de novo. 💜');
        // Sincroniza ocorrências recentes/novas sem pedir ação ou código.
        await pullActions();
        await sync(false);
        return;
      }
      localStorage.removeItem(ACTIVE_KEY);
      updatePushUi(false);
      $('pushTest').disabled=true;
      if(Notification.permission==='denied'){
        message('As notificações foram bloqueadas nas configurações do celular. Libere o site para reativar.',true);
      }else if(sub && !token){
        message('A permissão continua ativa, mas falta o código de acesso para sincronizar. Ative novamente.');
      }else if(token && Notification.permission==='granted'){
        message('A assinatura de notificações não foi encontrada. Toque em “Ativar notificações” para recuperar.');
      }
    }catch(err){
      // Se a atualização do SW falhar por falta de conexão, tente ler a assinatura instalada.
      console.warn('Não foi possível verificar as notificações automaticamente:',err);
      try{
        const reg=await navigator.serviceWorker.getRegistration();
        sub=await reg?.pushManager.getSubscription() || null;
        const active=Notification.permission==='granted' && Boolean(sub) && Boolean(localStorage.getItem(LOCAL_KEY));
        updatePushUi(active);
        $('pushTest').disabled=!active;
        if(active)message('Avisos já ativados. Sincronizaremos quando a internet voltar. 💜');
        else message('Não foi possível verificar os avisos. Conecte à internet e reabra o aplicativo.',true);
      }catch{message('Não foi possível verificar as notificações agora.',true);}
    }
  }
  // Exibe o estado salvo sem piscar o painel de configuração até a consulta de assinatura.
  if(localStorage.getItem(ACTIVE_KEY) && localStorage.getItem(LOCAL_KEY) &&
     allowed() && Notification.permission==='granted') {
    updatePushUi(true);
    $('pushTest').disabled=false;
  }
  restaurarNotificacoes();
})();
