/* Flávia Reminder v2 — totalmente local, sem bibliotecas e sem servidor. */
(() => {
  'use strict';
  const STORAGE_KEY = 'flavia-reminder-v1'; // Mesmo nome da v1: mantém os lembretes já cadastrados.
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dateString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateString(new Date());
  const dateAtNoon = (s) => new Date(`${s}T12:00:00`);
  const plusDays = (s, n) => { const d = dateAtNoon(s); d.setDate(d.getDate() + n); return dateString(d); };
  const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const uniqueId = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `flavia-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const formatShort = (s) => dateAtNoon(s).toLocaleDateString('pt-BR', {day:'2-digit', month:'short'}).replace('.', '');
  const formatLong = (s) => dateAtNoon(s).toLocaleDateString('pt-BR', {weekday:'short', day:'numeric', month:'short'}).replace('.', '');
  const allowedRepeat = ['none','daily','weekdays','weekly'];
  const allowedEmoji = ['🌷','📚','💧','💊','🎒','🌙','🧘‍♀️','💼','💜','✨'];
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && dateString(dateAtNoon(s)) === s;
  const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const hasPedro = (title, description) => /(^|[^a-zà-ÿ])pedro(?=$|[^a-zà-ÿ])/i.test(`${title} ${description}`);

  function normalizeTask(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string' ||
        typeof raw.date !== 'string' || !isDate(raw.date) ||
        typeof raw.time !== 'string' || !isTime(raw.time)) return null;
    const completed = {};
    if (raw.completed && typeof raw.completed === 'object') {
      for (const [date, stamp] of Object.entries(raw.completed)) {
        if (isDate(date) && stamp) completed[date] = typeof stamp === 'string' ? stamp.slice(0, 40) : new Date().toISOString();
      }
    }
    const snoozes = {};
    if (raw.snoozes && typeof raw.snoozes === 'object') {
      for (const [date, value] of Object.entries(raw.snoozes)) {
        if (isDate(date) && typeof value === 'string' && !Number.isNaN(new Date(value).getTime())) snoozes[date] = value;
      }
    }
    return {
      id: typeof raw.id === 'string' && raw.id.length < 100 ? raw.id : uniqueId(),
      title: raw.title.trim().slice(0, 90),
      desc: String(raw.desc || '').slice(0, 350),
      date: raw.date,
      time: raw.time,
      repeat: allowedRepeat.includes(raw.repeat) ? raw.repeat : 'none',
      emoji: allowedEmoji.includes(raw.emoji) ? raw.emoji : '🌷',
      completed,
      snoozes
    };
  }

  let tasks = [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(stored)) tasks = stored.map(normalizeTask).filter(Boolean);
  } catch (e) { console.warn('Não foi possível carregar os lembretes.', e); }
  let activePage = 'home', editingId = null;
  let calendarMonth = new Date(new Date().getFullYear(),new Date().getMonth(),1);
  let selectedDate = today();
  let toastTimer = null;

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
    catch (e) { toast('Não foi possível salvar. Confira o armazenamento do navegador.'); console.warn(e); }
    render();
    window.dispatchEvent(new Event('flavia-reminders-updated'));
  }
  function toast(message) {
    const el = $('toast');
    window.clearTimeout(toastTimer);
    el.textContent = message;
    el.classList.remove('hidden');
    toastTimer = window.setTimeout(() => el.classList.add('hidden'), 2800);
  }
  function occurs(task, date) {
    if (date < task.date) return false;
    if (task.repeat === 'none') return date === task.date;
    if (task.repeat === 'daily') return true;
    const current = dateAtNoon(date), start = dateAtNoon(task.date);
    if (task.repeat === 'weekdays') return current.getDay() > 0 && current.getDay() < 6;
    if (task.repeat === 'weekly') return current.getDay() === start.getDay();
    return false;
  }
  function isDone(task, date) { return Boolean(task.completed?.[date]); }
  function dueFor(task, date) {
    const fallback = new Date(`${date}T${task.time}:00`).getTime();
    const snoozed = task.snoozes?.[date];
    const value = snoozed ? new Date(snoozed).getTime() : fallback;
    return Number.isFinite(value) ? value : fallback;
  }
  function instances(start, days = 45) {
    const list = [];
    for (let i = -1; i < days; i++) {
      const date = plusDays(start, i);
      for (const task of tasks) {
        if (occurs(task,date)) list.push({task, date, due:dueFor(task,date)});
      }
    }
    return list.sort((a,b) => a.due-b.due || a.task.title.localeCompare(b.task.title));
  }
  function when(date) {
    return date === today() ? 'Hoje' : date === plusDays(today(),1) ? 'Amanhã' : formatShort(date);
  }
  function timeOf(occurrence) { return new Date(occurrence.due).toLocaleTimeString('pt-BR',{hour:'2-digit', minute:'2-digit'}); }
  function taskRow(task, date) {
    const complete = isDone(task,date), occurrence = {task,date,due:dueFor(task,date)};
    return `<div class="task ${complete?'done':''}">
      <div class="task-icon" aria-hidden="true">${escapeHTML(task.emoji)}</div>
      <div class="task-copy"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(when(date))}, às ${timeOf(occurrence)}${task.repeat!=='none'?' · ↻':''}</small></div>
      <button type="button" class="task-check ${complete?'checked':''}" data-action="done" data-id="${escapeHTML(task.id)}" data-date="${date}" aria-label="${complete?'Desfazer conclusão':'Concluir lembrete'}">${complete?icon('check'):''}</button>
      <button type="button" class="task-more" data-action="edit" data-id="${escapeHTML(task.id)}" aria-label="Editar ou excluir lembrete">${icon('edit')}</button>
    </div>`;
  }
  function emptyState(title, message, showDemo=false) {
    return `<div class="empty"><span class="empty-illustration" aria-hidden="true">🌷✨</span><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p>${showDemo?'<button type="button" data-action="demo">Ver layout com lembretes de exemplo</button>':''}</div>`;
  }
  function featured(occurrence) {
    if (!occurrence) {
      return `<div class="featured featured-empty"><img class="feature-graphic" src="./assets/study.svg" alt=""/><div class="feature-content"><span class="feature-tag">UM DIA DE CADA VEZ 💜</span><h3>Seu dia merece carinho!</h3><p>Cadastre seu primeiro lembrete e comece sua rotina.</p><button type="button" class="primary-btn" data-action="new">${icon('plus')} Novo lembrete</button></div></div>`;
    }
    const {task, date, due} = occurrence;
    const diff = due - Date.now();
    const tag = diff < 0 ? 'PENDENTE' : diff < 10*60*1000 ? 'AGORA' : date === today() ? 'HOJE' : 'EM BREVE';
    return `<div class="featured"><img class="feature-graphic" src="./assets/study.svg" alt="Livros decorados com uma tulipa"/><div class="feature-content"><span class="feature-tag">${tag} • ${timeOf(occurrence)}</span><h3>${escapeHTML(task.title)} ${escapeHTML(task.emoji)}</h3><p>${escapeHTML(task.desc || 'Você consegue! Um passo de cada vez. 💜')}</p><div class="actions"><button type="button" class="primary-btn" data-action="done" data-id="${escapeHTML(task.id)}" data-date="${date}">${icon('check')} Concluir</button><button type="button" class="secondary-btn" data-action="snooze" data-id="${escapeHTML(task.id)}" data-date="${date}">${icon('clock')} Adiar 10 min</button></div></div><span class="feature-deco">♡</span></div>`;
  }

  function render() {
    $('todayLabel').textContent = new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replaceAll('.', '');
    const todayTasks = tasks.filter(task => occurs(task,today()));
    $('countToday').textContent = todayTasks.length;
    $('countPending').textContent = todayTasks.filter(task=>!isDone(task,today())).length;
    $('countDone').textContent = tasks.reduce((n,task)=>n + Object.keys(task.completed||{}).length,0);
    const list = instances(today(),46);
    const notDone = list.filter(({task,date})=>!isDone(task,date));
    const forward = notDone.filter(x=>x.due >= new Date(`${today()}T00:00:00`).getTime());
    const highlight = forward[0] || null;
    $('featured').innerHTML = featured(highlight);
    const upcoming = [];
    const shown = new Set(highlight ? [highlight.task.id] : []);
    for (const item of forward) {
      if (shown.has(item.task.id)) continue;
      shown.add(item.task.id); upcoming.push(item);
      if (upcoming.length === 3) break;
    }
    $('upcoming').innerHTML = upcoming.length
      ? upcoming.map(x=>taskRow(x.task,x.date)).join('')
      : emptyState('Nenhum próximo lembrete', 'Quando você cadastrar tarefas, elas aparecerão aqui.', tasks.length === 0);
    const nearest = new Map();
    for (const occurrence of list) if (!nearest.has(occurrence.task.id) && occurrence.due >= new Date(`${today()}T00:00:00`).getTime()) nearest.set(occurrence.task.id,occurrence);
    const all = tasks.map(task => nearest.get(task.id) || {task,date:task.date,due:dueFor(task,task.date)}).sort((a,b)=>a.due-b.due);
    $('allTasks').innerHTML = all.length ? all.map(x=>taskRow(x.task,x.date)).join('') : emptyState('Sua agenda está vazia','Comece criando um lembrete. Um dia organizado faz toda diferença!',true);
    const history = tasks.flatMap(task => Object.entries(task.completed||{}).filter(([,stamp])=>stamp).map(([date,stamp])=>({task,date,stamp})))
      .sort((a,b)=>String(b.stamp).localeCompare(String(a.stamp)));
    $('historyTasks').innerHTML = history.length ? history.map(x=>taskRow(x.task,x.date)).join('') : emptyState('O começo de tudo','Assim que concluir um lembrete, ele aparece no histórico.');
    renderCalendar();
  }
  function renderCalendar() {
    const y = calendarMonth.getFullYear(), m = calendarMonth.getMonth();
    $('monthLabel').textContent = calendarMonth.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    const offset = (new Date(y,m,1).getDay()+6)%7;
    const length = new Date(y,m+1,0).getDate();
    let html = ['S','T','Q','Q','S','S','D'].map(l=>`<span aria-hidden="true">${l}</span>`).join('');
    html += '<span></span>'.repeat(offset);
    for (let d=1; d<=length; d++) {
      const date = dateString(new Date(y,m,d));
      const has = tasks.some(task=>occurs(task,date));
      html += `<button type="button" data-day="${date}" class="${date===selectedDate?'selected':''} ${has?'has':''}" aria-label="Dia ${d}${has?', com lembrete':''}">${d}</button>`;
    }
    $('days').innerHTML = html;
    $('selectedLabel').textContent = `Lembretes de ${formatShort(selectedDate)}`;
    const matches = tasks.filter(task=>occurs(task,selectedDate));
    $('calendarTasks').innerHTML = matches.length ? matches.map(task=>taskRow(task,selectedDate)).join('') : emptyState('Dia tranquilinho','Nenhum lembrete para esta data.');
  }
  function showPage(page) {
    if (!['home','reminders','calendar','history'].includes(page)) return;
    activePage = page;
    for (const p of ['home','reminders','calendar','history']) $(p).classList.toggle('hidden',p!==activePage);
    for (const button of document.querySelectorAll('.bottom-nav .nav-item')) button.classList.toggle('active',button.dataset.page===page);
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function openForm(id) {
    editingId = id || null;
    const t = tasks.find(x=>x.id===editingId);
    $('formTitle').textContent = t ? 'Editar lembrete 🌷' : 'Novo lembrete 🌷';
    $('title').value = t?.title || '';
    $('desc').value = t?.desc || '';
    $('date').value = t?.date || today();
    const roundTime = new Date(Date.now() + 60*60*1000);
    roundTime.setMinutes(Math.ceil(roundTime.getMinutes()/5)*5,0,0);
    $('time').value = t?.time || `${pad(roundTime.getHours())}:${pad(roundTime.getMinutes())}`;
    $('repeat').value = t?.repeat || 'none';
    $('emoji').value = t?.emoji || '🌷';
    $('deleteBtn').classList.toggle('hidden',!t);
    $('modal').classList.remove('hidden');
    window.setTimeout(()=>$('title').focus(),120);
  }
  function closeForm() { $('modal').classList.add('hidden'); editingId=null; }
  function showPedro() {
    $('pedroOverlay').classList.remove('hidden');
    $('pedroClose').focus();
  }
  function closePedro() { $('pedroOverlay').classList.add('hidden'); }
  function demoTasks() {
    if (tasks.length && !confirm('Adicionar três lembretes de exemplo à sua agenda?')) return;
    const td = today();
    const samples = [
      {title:'Hora de estudar!',desc:'Revisar o conteúdo de inglês por 30 minutos.',time:'18:30',emoji:'📚',repeat:'none'},
      {title:'Tomar água',desc:'Uma pausa para se cuidar. 💧',time:'19:00',emoji:'💧',repeat:'daily'},
      {title:'Organizar a mochila',desc:'Deixar tudo pronto para amanhã.',time:'21:00',emoji:'🎒',repeat:'weekdays'}
    ];
    for (const s of samples) tasks.push({id:uniqueId(),date:td,completed:{},snoozes:{},...s});
    persist(); toast('Três lembretes de exemplo adicionados 🌷');
  }

  document.addEventListener('click',event=>{
    const nav = event.target.closest('[data-page]');
    if (nav) {showPage(nav.dataset.page);return;}
    const day = event.target.closest('[data-day]');
    if (day) {selectedDate=day.dataset.day;renderCalendar();return;}
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action==='new') {openForm();return;}
    if (action==='demo') {demoTasks();return;}
    const task = tasks.find(t=>t.id===btn.dataset.id);
    if (!task) return;
    const date = btn.dataset.date;
    if (action==='edit') {openForm(task.id);return;}
    if (action==='done' && isDate(date)) {
      if (isDone(task,date)) delete task.completed[date];
      else task.completed[date] = new Date().toISOString();
      persist();toast(isDone(task,date)?'Lembrete concluído! 💜':'Conclusão desfeita.');
      return;
    }
    if (action==='snooze' && isDate(date)) {
      task.snoozes ??= {};
      const base = dueFor(task,date);
      const next = Math.max(base,Date.now()) + 10*60*1000;
      task.snoozes[date] = new Date(next).toISOString();
      persist();toast('Combinado! Adiado 10 minutos ⏰');
    }
  });
  // Ações feitas pela notificação (com o aplicativo fechado) são importadas do servidor.
  window.addEventListener('flavia-push-actions',event=>{
    let changed=false;
    for(const record of (event.detail||[])){
      const ref=record.reminder_ref;
      if(typeof ref!=='string')continue;
      const sep=ref.lastIndexOf('|');if(sep<0)continue;
      const id=ref.slice(0,sep),date=ref.slice(sep+1);
      if(!isDate(date))continue;
      const task=tasks.find(t=>t.id===id);if(!task)continue;
      if(record.action==='done'&&!task.completed[date]){
        task.completed[date]=record.performed_at||new Date().toISOString();changed=true;
      }else if(record.action==='snooze'&&record.next_due_at&&!task.completed[date]){
        task.snoozes??={};
        if(task.snoozes[date]!==record.next_due_at){task.snoozes[date]=record.next_due_at;changed=true;}
      }
    }
    if(changed){persist();toast('Lembretes atualizados pelas notificações! 🌷');}
  });

  $('addBtn').addEventListener('click',()=>openForm());
  $('cancelBtn').addEventListener('click',closeForm);
  $('cancelX').addEventListener('click',closeForm);
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeForm();});
  $('form').addEventListener('submit',event=>{
    event.preventDefault();
    const title = $('title').value.trim(), desc = $('desc').value.trim(), date=$('date').value, time=$('time').value;
    if (!title || !isDate(date) || !isTime(time)) {toast('Preencha nome, data e horário.');return;}
    const old = tasks.find(x=>x.id===editingId);
    const obj = {id:old?.id||uniqueId(),title,desc,date,time,repeat:$('repeat').value,emoji:$('emoji').value,completed:old?.completed||{},snoozes:old?.snoozes||{}};
    if (old) tasks = tasks.map(task=>task.id===old.id?obj:task);
    else tasks.push(obj);
    persist();closeForm();
    if (hasPedro(title,desc)) showPedro();
    else toast('Lembrete salvo com carinho 🌷');
  });
  $('deleteBtn').addEventListener('click',()=>{
    if (!editingId) return;
    if (!confirm('Excluir este lembrete e seu histórico?')) return;
    tasks=tasks.filter(task=>task.id!==editingId);
    closeForm();persist();toast('Lembrete excluído.');
  });
  $('pedroClose').addEventListener('click',closePedro);
  $('pedroOverlay').addEventListener('click',e=>{if (e.target===$('pedroOverlay')) closePedro();});
  document.addEventListener('keydown',e=>{
    if (e.key==='Escape') {if (!$('pedroOverlay').classList.contains('hidden'))closePedro(); else if (!$('modal').classList.contains('hidden'))closeForm();}
  });
  $('prevMonth').addEventListener('click',()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();});
  $('nextMonth').addEventListener('click',()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();});
  $('exportBtn').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(tasks,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download=`flavia-reminder-backup-${today()}.json`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('importBtn').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if (!file)return;
    try {
      const parsed=JSON.parse(await file.text());
      if (!Array.isArray(parsed)||parsed.length>5000) throw new Error('Formato inválido');
      const imported=parsed.map(normalizeTask);
      if (imported.some(x=>!x)||new Set(imported.map(x=>x.id)).size!==imported.length)throw new Error('Dados inválidos');
      if (confirm(`Substituir seus ${tasks.length} lembretes pelos ${imported.length} do backup?`)){
        tasks=imported;persist();toast('Backup importado com sucesso! 💜');
      }
    }catch(e){console.warn(e);toast('Este arquivo não é um backup válido.');}
    e.target.value='';
  });
  render();
  window.setInterval(render,60000); // Atualiza etiquetas com o passar do tempo; não cria notificações fora do site.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
    navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Service worker:',e));
  }
})();
