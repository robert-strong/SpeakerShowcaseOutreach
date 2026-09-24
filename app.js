import { SEED } from './seed.js';

const COLLS=['orgs','tasks','contacts','touches','opps'];
const S={orgs:{},tasks:{},contacts:{},touches:{},opps:{}};
const ORG_STATUS=['Not started','Researching','Reached out','In conversation','Proposal submitted','Showcase secured','Member','Not a fit'];
const ORG_CLS={'Reached out':'s-reached','In conversation':'s-conv','Proposal submitted':'s-prop','Showcase secured':'s-won','Member':'s-member','Not a fit':'s-nofit'};
const TIERS={1:'Core targets',2:'State and regional societies',3:'Specialized and adjacent',4:'Lower priority'};
const PHASES=['This week','Foundation','Memberships','Expand outreach','Ongoing rhythm'];
const CHANNELS=['Email','Phone','LinkedIn','In person','At an event','Proposal form','Other'];
const OUTCOMES=['Awaiting reply','Replied','Meeting set','Proposal invited','Declined','No fit'];
const STAGES=['Identified','Pitched','In discussion','Confirmed','Booked','Lost'];
const STAGE_CLS={'Pitched':'s-pitched','In discussion':'s-disc','Confirmed':'s-conf','Booked':'s-book','Lost':'s-lost'};
const OPP_TYPES=['Showcase slot','Education session','Keynote lead','Bureau referral','Membership or partnership'];

let tab='today';
const ui={q:'',tier:'',status:'',showDone:true,cq:'',logFilter:'all'};
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=()=>ymd(new Date());
const addDays=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return ymd(d)};
const dayDiff=s=>Math.round((new Date(s+'T12:00:00')-new Date(today()+'T12:00:00'))/864e5);
function fmt(s){if(!s)return '';const d=new Date(s+'T12:00:00');return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined})}
function rel(s){const n=dayDiff(s);if(n===0)return 'Today';if(n===1)return 'Tomorrow';if(n===-1)return 'Yesterday';if(n<0)return `${-n} days overdue`;if(n<7)return `In ${n} days`;return fmt(s)}
const newId=()=>(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36)).replace(/[^a-z0-9-]/gi,'').slice(0,20);
const orgName=id=>S.orgs[id]?.name||'';
const contactName=id=>S.contacts[id]?.name||'';
const orgsSorted=()=>Object.entries(S.orgs).sort((a,b)=>(a[1].rank??999)-(b[1].rank??999)||String(a[1].name).localeCompare(b[1].name));
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),2200)}

/* ---------- storage ---------- */
// Server mode: /api/* backed by Upstash Redis. Local mode: this browser's localStorage.
const LS_KEY='showcase-desk-data', PASS_KEY='showcase-desk-passcode';
let mode='loading';
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
function applyData(d){for(const c of COLLS)S[c]=(d&&d[c]&&typeof d[c]==='object')?d[c]:{}}
function readLocal(){const raw=lsGet(LS_KEY);if(raw){try{return JSON.parse(raw)}catch(e){}}return JSON.parse(JSON.stringify(SEED))}
function writeLocal(){lsSet(LS_KEY,JSON.stringify(S))}
function askPass(){
  return new Promise(res=>{const d=$('#passdlg'),f=$('#passf');f.reset();
    f.onsubmit=e=>{e.preventDefault();lsSet(PASS_KEY,new FormData(f).get('p'));d.close();res()};
    d.addEventListener('cancel',e=>e.preventDefault(),{once:true});d.showModal();f.p.focus()});
}
async function api(path,opts={},tries=0){
  const r=await fetch(path,{...opts,headers:{'content-type':'application/json','x-passcode':lsGet(PASS_KEY)||''}});
  if(r.status===401&&tries<5){await askPass();return api(path,opts,tries+1)}
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(body.error||'request_failed'),{status:r.status,code:body.error});
  return body;
}
async function load(quiet){
  try{const d=await api('/api/data');mode='server';applyData(d)}
  catch(e){
    if(mode==='server'){if(!quiet)toast("Couldn't refresh. Check your connection.");return}
    mode='local';applyData(readLocal());
  }
  if(!quiet)renderShell();else renderBody();
}
async function put(c,id,data){
  const prev=S[c][id];S[c][id]=data;renderBody();
  if(mode==='local'){writeLocal();return true}
  try{await api(`/api/doc?c=${c}&id=${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(data)});return true}
  catch(e){if(prev)S[c][id]=prev;else delete S[c][id];renderBody();handleErr(e);return false}
}
async function patch(c,id,data){
  const prev=S[c][id];S[c][id]={...prev,...data};renderBody();
  if(mode==='local'){writeLocal();return true}
  try{await api(`/api/doc?c=${c}&id=${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(data)});return true}
  catch(e){S[c][id]=prev;renderBody();handleErr(e);return false}
}
async function del(c,id){
  const prev=S[c][id];delete S[c][id];renderBody();
  if(mode==='local'){writeLocal();return}
  try{await api(`/api/doc?c=${c}&id=${encodeURIComponent(id)}`,{method:'DELETE'})}
  catch(e){S[c][id]=prev;renderBody();handleErr(e)}
}
function handleErr(e){toast(e.status===413?'That record is too large to save.':"That change didn't save. Try again in a moment.")}
async function importBackup(file){
  let d;try{d=JSON.parse(await file.text())}catch(e){toast("That file isn't a valid backup.");return}
  if(!d||!COLLS.some(c=>d[c]&&typeof d[c]==='object')){toast("That file isn't a Showcase Desk backup.");return}
  const n=COLLS.reduce((a,c)=>a+Object.keys(d[c]||{}).length,0);
  if(!confirm(`Replace everything in this tracker with the ${n} records in ${file.name}? This can't be undone.`))return;
  const clean={};for(const c of COLLS)clean[c]=d[c]||{};
  if(mode==='local'){applyData(clean);writeLocal();renderBody();toast('Backup restored');return}
  try{await api('/api/import',{method:'POST',body:JSON.stringify(clean)});applyData(clean);renderBody();toast('Backup restored')}
  catch(e){handleErr(e)}
}
$('#importFile').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(f)importBackup(f)});
// Pick up teammates' changes: refresh every 30 seconds and when the tab regains focus.
setInterval(()=>{if(mode==='server'&&document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))load(true)},30000);
document.addEventListener('visibilitychange',()=>{if(mode==='server'&&document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))load(true)});

/* ---------- shell ---------- */
document.querySelectorAll('nav.tabs button').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;renderShell()}));
function renderShell(){
  document.querySelectorAll('nav.tabs button').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  const m=$('#main');
  const notice=mode==='local'?'<div class="notice">No database is connected, so this copy saves to this browser only. Connect Upstash Redis in Vercel to share it across devices and teammates.</div>':'';
  const bars={
    today:`<div class="bar"><h2>Today</h2><button class="btn" data-act="new-touch">Log outreach</button><button class="btn primary" data-act="new-task">Add task</button></div>`,
    plan:`<div class="bar"><h2>Action plan</h2><label class="muted" style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="showDone" ${ui.showDone?'checked':''}> Show completed</label><button class="btn primary" data-act="new-task">Add task</button></div>`,
    orgs:`<div class="bar"><h2>Organizations</h2><input type="search" id="q" placeholder="Search organizations" value="${esc(ui.q)}" aria-label="Search organizations">
      <select id="tier" aria-label="Filter by tier"><option value="">All tiers</option>${Object.entries(TIERS).map(([k,v])=>`<option value="${k}" ${ui.tier==k?'selected':''}>${v}</option>`).join('')}</select>
      <select id="status" aria-label="Filter by status"><option value="">Any status</option>${ORG_STATUS.map(s=>`<option ${ui.status===s?'selected':''}>${s}</option>`).join('')}</select>
      <button class="btn" data-act="csv" data-c="orgs">Export CSV</button><button class="btn primary" data-act="new-org">Add organization</button></div>`,
    contacts:`<div class="bar"><h2>Contacts</h2><input type="search" id="cq" placeholder="Search contacts" value="${esc(ui.cq)}" aria-label="Search contacts"><button class="btn" data-act="csv" data-c="contacts">Export CSV</button><button class="btn primary" data-act="new-contact">Add contact</button></div>`,
    log:`<div class="bar"><h2>Outreach log</h2><select id="logf" aria-label="Filter outreach"><option value="all">All outreach</option><option value="open" ${ui.logFilter==='open'?'selected':''}>Open follow-ups</option></select><button class="btn" data-act="csv" data-c="touches">Export CSV</button><button class="btn primary" data-act="new-touch">Log outreach</button></div>`,
    pipe:`<div class="bar"><h2>Pipeline</h2><button class="btn" data-act="csv" data-c="opps">Export CSV</button><button class="btn" data-act="backup">Back up everything</button><button class="btn" data-act="restore">Restore from backup</button><button class="btn primary" data-act="new-opp">Add opportunity</button></div>`,
  };
  m.innerHTML=notice+bars[tab]+'<div id="body"></div>';
  const on=(id,ev,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener(ev,fn)};
  on('q','input',e=>{ui.q=e.target.value;renderBody()});
  on('tier','change',e=>{ui.tier=e.target.value;renderBody()});
  on('status','change',e=>{ui.status=e.target.value;renderBody()});
  on('cq','input',e=>{ui.cq=e.target.value;renderBody()});
  on('logf','change',e=>{ui.logFilter=e.target.value;renderBody()});
  on('showDone','change',e=>{ui.showDone=e.target.checked;renderBody()});
  renderBody();
}
function renderBody(){const b=$('#body');if(!b)return;b.innerHTML=VIEWS[tab]()}

/* ---------- views ---------- */
function agendaItems(){
  const it=[];
  for(const[id,t]of Object.entries(S.tasks))if(!t.done&&t.due)it.push({d:t.due,kind:'Task',title:t.title,sub:orgName(t.orgId),act:'edit-task',id,check:true});
  for(const[id,x]of Object.entries(S.touches))if(x.followUp&&!x.followUpDone)it.push({d:x.followUp,kind:'Follow-up',title:`Follow up with ${contactName(x.contactId)||orgName(x.orgId)||'contact'}`,sub:x.summary,act:'edit-touch',id});
  for(const[id,o]of Object.entries(S.orgs))if(o.nextDate&&o.status!=='Not a fit')it.push({d:o.nextDate,kind:'Organization',title:o.nextAction||`Next step with ${o.name}`,sub:o.name,act:'open-org',id});
  for(const[id,o]of Object.entries(S.opps))if(o.deadline&&!['Booked','Lost'].includes(o.stage))it.push({d:o.deadline,kind:'Opportunity deadline',title:o.title,sub:orgName(o.orgId),act:'edit-opp',id});
  return it.sort((a,b)=>a.d.localeCompare(b.d));
}
function agendaLi(i){
  const late=dayDiff(i.d)<0;
  return `<li><div class="d ${late?'late':''}">${esc(rel(i.d))}</div>
    <div class="t" data-act="${i.act}" data-id="${i.id}" tabindex="0" role="button"><div class="ti">${esc(i.title)}</div><div class="k">${esc(i.kind)}${i.sub?' for '+esc(i.sub):''}</div></div>
    <div>${i.check?`<button class="btn small" data-act="done-task" data-id="${i.id}">Done</button>`:i.kind==='Follow-up'?`<button class="btn small" data-act="done-fu" data-id="${i.id}">Done</button>`:''}</div></li>`;
}
const VIEWS={
today(){
  const items=agendaItems(), t=today(), horizon=addDays(t,14);
  const soon=items.filter(i=>i.d<=horizon);
  const next=items[0];
  const tasks=Object.values(S.tasks), done=tasks.filter(x=>x.done).length;
  const touched=Object.values(S.orgs).filter(o=>!['Not started','Researching'].includes(o.status)).length;
  const openFu=Object.values(S.touches).filter(x=>x.followUp&&!x.followUpDone).length;
  const opps=Object.values(S.opps);
  const cue=next?`<div class="cue"><div class="left"><div class="when">${esc(rel(next.d))}, ${esc(fmt(next.d))}</div><h2>${esc(next.title)}</h2><div class="sub">${esc(next.kind)}${next.sub?' for '+esc(next.sub):''}</div></div>
    <div class="tally"><div><b>${done}/${tasks.length}</b>plan tasks done</div><div><b>${touched}</b>organizations contacted</div><div><b>${openFu}</b>open follow-ups</div><div><b>${opps.filter(o=>['Confirmed','Booked'].includes(o.stage)).length}</b>confirmed or booked</div></div></div>`
    :`<div class="cue"><div class="left"><div class="when">Nothing scheduled</div><h2>Your agenda is clear</h2><div class="sub">Add a task or log outreach with a follow-up date to fill it.</div></div></div>`;
  const counts=STAGES.map(s=>`<div><b>${opps.filter(o=>o.stage===s).length}</b>${s}</div>`).join('');
  const recent=Object.entries(S.touches).sort((a,b)=>(b[1].date||'').localeCompare(a[1].date||'')).slice(0,6);
  return cue+`<div class="grid2">
    <section class="panel"><h3>Next two weeks and overdue</h3>${soon.length?`<ul class="agenda">${soon.map(agendaLi).join('')}</ul>`:'<p class="muted">Nothing due in the next two weeks.</p>'}</section>
    <section class="panel"><h3>Opportunity pipeline</h3><div class="stages">${counts}</div>
      <h3 style="margin-top:22px">Latest outreach</h3>${recent.length?`<ul class="feed">${recent.map(([id,x])=>`<li><button class="linkish" data-act="edit-touch" data-id="${id}">${esc(fmt(x.date))}: ${esc(x.channel||'')} with ${esc(contactName(x.contactId)||orgName(x.orgId)||'someone')}</button> <span class="muted">${esc(x.outcome||'')}</span></li>`).join('')}</ul>`:'<p class="muted">No outreach logged yet. Use Log outreach after each email, call or form submission.</p>'}
    </section></div>`;
},
plan(){
  const all=Object.entries(S.tasks);
  if(!all.length)return '<div class="empty">No tasks yet. Add the first step of your plan.</div>';
  const phases=[...PHASES,...new Set(all.map(([,t])=>t.phase).filter(p=>!PHASES.includes(p)))];
  return phases.map(ph=>{
    let list=all.filter(([,t])=>(t.phase||'This week')===ph).sort((a,b)=>(a[1].done-b[1].done)||(a[1].due||'9').localeCompare(b[1].due||'9')||(a[1].order||0)-(b[1].order||0));
    if(!list.length)return '';
    const n=list.length,d=list.filter(([,t])=>t.done).length;
    if(!ui.showDone)list=list.filter(([,t])=>!t.done);
    return `<section class="phase"><div class="phase-head"><h3>${esc(ph)}</h3><span class="muted">${d} of ${n} done</span><div class="meter" aria-hidden="true"><i style="width:${n?d/n*100:0}%"></i></div></div>
    <div class="tasks">${list.map(([id,t])=>`<div class="task ${t.done?'done':''}"><input type="checkbox" data-chk="${id}" ${t.done?'checked':''} aria-label="Mark ${esc(t.title)} done">
      <div><div class="ti">${esc(t.title)}</div><div class="meta">${t.due?`<span class="${!t.done&&dayDiff(t.due)<0?'late':''}">Due ${esc(fmt(t.due))}</span>`:''}${t.orgId&&S.orgs[t.orgId]?`${t.due?', ':''}<button class="linkish" data-act="open-org" data-id="${t.orgId}">${esc(orgName(t.orgId))}</button>`:''}${t.notes?`<div>${esc(t.notes)}</div>`:''}</div></div>
      <button class="btn small" data-act="edit-task" data-id="${id}">Edit</button></div>`).join('')||'<div class="task"><span></span><span class="muted">All done in this phase.</span></div>'}</div></section>`}).join('');
},
orgs(){
  const q=ui.q.toLowerCase();
  const cc={},lt={};
  for(const c of Object.values(S.contacts))cc[c.orgId]=(cc[c.orgId]||0)+1;
  for(const x of Object.values(S.touches))if(x.orgId&&(!lt[x.orgId]||x.date>lt[x.orgId]))lt[x.orgId]=x.date;
  const list=orgsSorted().filter(([,o])=>(!ui.tier||String(o.tier)===ui.tier)&&(!ui.status||o.status===ui.status)&&(!q||[o.name,o.aka,o.specialty,o.notes].join(' ').toLowerCase().includes(q)));
  if(!list.length)return '<div class="empty">No organizations match these filters.</div>';
  let lastTier=null,rows='';
  for(const[id,o]of list){
    if(o.tier!==lastTier){lastTier=o.tier;rows+=`<tr class="tier-row"><td colspan="6">${esc(TIERS[o.tier]||'Other')}</td></tr>`}
    rows+=`<tr class="row" data-act="open-org" data-id="${id}"><td class="rank">${o.rank??''}</td>
      <td><div class="nm">${esc(o.name)}</div>${o.aka?`<div class="aka">${esc(o.aka)}</div>`:''}</td>
      <td>${esc(o.specialty)}</td>
      <td><select class="inline" data-inline="orgs:${id}:status" aria-label="Status for ${esc(o.name)}">${ORG_STATUS.map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
      <td>${o.nextAction?esc(o.nextAction):'<span class="muted">None set</span>'}${o.nextDate?`<div class="${dayDiff(o.nextDate)<0?'late':'muted'}" style="font-size:12px">${esc(rel(o.nextDate))}</div>`:''}</td>
      <td class="muted">${cc[id]||0} contacts${lt[id]?`<div style="font-size:12px">Last touch ${esc(fmt(lt[id]))}</div>`:''}</td></tr>`;
  }
  return `<div class="scroll"><table><thead><tr><th>#</th><th>Organization</th><th>Specialty</th><th>Status</th><th>Next step</th><th>Activity</th></tr></thead><tbody>${rows}</tbody></table></div>`;
},
contacts(){
  const q=ui.cq.toLowerCase();
  const list=Object.entries(S.contacts).filter(([,c])=>!q||[c.name,c.role,orgName(c.orgId),c.email].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(a[1].name).localeCompare(b[1].name));
  if(!list.length)return `<div class="empty">${Object.keys(S.contacts).length?'No contacts match that search.':'No contacts yet. Add the people who pick speakers: education directors, meeting VPs, chapter program chairs.'}</div>`;
  return `<div class="scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Organization</th><th>Email</th><th>Phone</th><th>Last touch</th></tr></thead><tbody>${list.map(([id,c])=>{
    const last=Object.values(S.touches).filter(x=>x.contactId===id).map(x=>x.date).sort().pop();
    return `<tr class="row" data-act="edit-contact" data-id="${id}"><td class="nm">${esc(c.name)}</td><td>${esc(c.role)}</td><td>${esc(orgName(c.orgId))}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td class="muted">${last?esc(fmt(last)):'Never'}</td></tr>`}).join('')}</tbody></table></div>`;
},
log(){
  let list=Object.entries(S.touches);
  if(ui.logFilter==='open')list=list.filter(([,x])=>x.followUp&&!x.followUpDone).sort((a,b)=>a[1].followUp.localeCompare(b[1].followUp));
  else list.sort((a,b)=>(b[1].date||'').localeCompare(a[1].date||''));
  if(!list.length)return `<div class="empty">${ui.logFilter==='open'?'No open follow-ups.':'No outreach logged yet. Log each email, call, DM or proposal so follow-ups land on Today.'}</div>`;
  return `<div class="scroll"><table><thead><tr><th>Date</th><th>Organization</th><th>Contact</th><th>Channel</th><th>What happened</th><th>Outcome</th><th>Follow-up</th></tr></thead><tbody>${list.map(([id,x])=>`<tr class="row" data-act="edit-touch" data-id="${id}"><td>${esc(fmt(x.date))}</td><td>${esc(orgName(x.orgId))}</td><td>${esc(contactName(x.contactId))}</td><td>${esc(x.channel)}</td><td>${esc(x.summary)}</td><td>${esc(x.outcome)}</td>
    <td>${x.followUp?(x.followUpDone?`<span class="muted">Done</span>`:`<span class="${dayDiff(x.followUp)<0?'late':''}">${esc(rel(x.followUp))}</span> <button class="btn small" data-act="done-fu" data-id="${id}">Done</button>`):'<span class="muted">None</span>'}</td></tr>`).join('')}</tbody></table></div>`;
},
pipe(){
  const opps=Object.entries(S.opps);
  if(!opps.length)return '<div class="empty">No opportunities yet. Add a showcase slot, education session or keynote lead as soon as you spot one.</div>';
  return `<div class="board">${STAGES.map((s,si)=>{const l=opps.filter(([,o])=>(o.stage||'Identified')===s).sort((a,b)=>(a[1].deadline||a[1].eventDate||'9').localeCompare(b[1].deadline||b[1].eventDate||'9'));
    const fee=l.reduce((a,[,o])=>a+(+o.fee||0),0);
    return `<div class="col"><h3><span>${s}</span><span class="muted">${l.length}${fee?', $'+fee.toLocaleString():''}</span></h3>${l.map(([id,o])=>`<div class="card"><div class="ti" data-act="edit-opp" data-id="${id}" role="button" tabindex="0">${esc(o.title)}</div>
      <div class="k">${[o.type,orgName(o.orgId),o.speaker,o.eventDate?'Event '+fmt(o.eventDate):'',o.deadline?'Deadline '+rel(o.deadline):'',o.fee?'$'+(+o.fee).toLocaleString():''].filter(Boolean).map(esc).join('<br>')}</div>
      <div class="mv"><button class="btn small" data-act="move" data-id="${id}" data-dir="-1" ${si===0?'disabled':''} aria-label="Move back a stage">Back</button><button class="btn small" data-act="move" data-id="${id}" data-dir="1" ${si===STAGES.length-1?'disabled':''} aria-label="Move forward a stage">Forward</button></div></div>`).join('')}</div>`}).join('')}</div>`;
}};

/* ---------- forms ---------- */
const orgOpts=()=>[['','None'],...orgsSorted().map(([id,o])=>[id,o.name])];
const contactOpts=()=>[['','None'],...Object.entries(S.contacts).sort((a,b)=>String(a[1].name).localeCompare(b[1].name)).map(([id,c])=>[id,c.name+(c.orgId?` (${orgName(c.orgId)})`:'')])];
const FIELDS={
  orgs:[['name','Name','text',1],['aka','Also known as','text'],['tier','Tier','select',0,()=>Object.entries(TIERS)],['rank','Rank','number'],['status','Status','select',0,()=>ORG_STATUS.map(s=>[s,s])],['specialty','Specialty','text'],['nextAction','Next step','text'],['nextDate','Next step date','date'],['website','Website','url',0,null,1],['approach','Approach','textarea'],['notes','Notes','textarea']],
  tasks:[['title','Task','text',1,null,1],['phase','Phase','select',0,()=>PHASES.map(p=>[p,p])],['due','Due','date'],['orgId','Organization','select',0,orgOpts],['done','Done','checkbox'],['notes','Notes','textarea']],
  contacts:[['name','Name','text',1],['role','Role','text'],['orgId','Organization','select',0,orgOpts,1],['email','Email','email'],['phone','Phone','text'],['linkedin','LinkedIn or profile link','url',0,null,1],['notes','Notes','textarea']],
  touches:[['date','Date','date',1],['channel','Channel','select',0,()=>CHANNELS.map(c=>[c,c])],['orgId','Organization','select',0,orgOpts],['contactId','Contact','select',0,contactOpts],['summary','What happened','textarea'],['outcome','Outcome','select',0,()=>OUTCOMES.map(c=>[c,c])],['followUp','Follow-up date','date'],['followUpDone','Follow-up done','checkbox']],
  opps:[['title','Opportunity','text',1,null,1],['type','Type','select',0,()=>OPP_TYPES.map(c=>[c,c])],['stage','Stage','select',0,()=>STAGES.map(c=>[c,c])],['orgId','Organization','select',0,orgOpts],['speaker','Speaker','text'],['eventDate','Event date','date'],['deadline','Application or decision deadline','date'],['fee','Fee (USD)','number'],['notes','Notes','textarea']],
};
const LABEL={orgs:'organization',tasks:'task',contacts:'contact',touches:'outreach',opps:'opportunity'};
const DEFAULTS={orgs:{status:'Not started',tier:'1'},tasks:{phase:'This week'},touches:{date:today(),channel:'Email',outcome:'Awaiting reply',followUp:addDays(today(),7)},opps:{stage:'Identified',type:'Showcase slot'},contacts:{}};
let returnOrg=null;
function openForm(c,id,preset={}){
  const cur=id?S[c][id]:{...DEFAULTS[c],...(c==='touches'?{date:today(),followUp:addDays(today(),7)}:{}),...preset};
  const d=$('#dlg');d.className='';
  const field=([k,label,type,req,opts,full])=>{
    const v=cur[k]??'';const wide=full||type==='textarea';
    if(type==='checkbox')return `<label class="check full"><input type="checkbox" name="${k}" ${v?'checked':''}> ${label}</label>`;
    if(type==='textarea')return `<label class="full">${label}<textarea name="${k}">${esc(v)}</textarea></label>`;
    if(type==='select')return `<label class="${wide?'full':''}">${label}<select name="${k}">${opts().map(([ov,ol])=>`<option value="${esc(ov)}" ${String(v)===String(ov)?'selected':''}>${esc(ol)}</option>`).join('')}</select></label>`;
    return `<label class="${wide?'full':''}">${label}<input type="${type}" name="${k}" value="${esc(v)}" ${req?'required':''}></label>`;
  };
  d.innerHTML=`<form method="dialog" id="f"><div class="dlg-head"><h2>${id?'Edit':'New'} ${LABEL[c]}</h2><button type="button" class="btn small" data-close>Close</button></div>
    <div class="dlg-body"><div class="form">${FIELDS[c].map(field).join('')}</div>
    ${c==='touches'&&!id?'<p class="muted" style="font-size:13px;margin:12px 0 0">Saving moves the organization to Reached out if it hadn\'t been contacted yet.</p>':''}</div>
    <div class="dlg-foot">${id?`<button type="button" class="btn danger" data-del>Delete</button>`:''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${id?'Save changes':'Add '+LABEL[c]}</button></div></form>`;
  d.showModal();
  d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeDlg());
  const delb=d.querySelector('[data-del]');
  if(delb)delb.onclick=async()=>{if(!confirm(`Delete this ${LABEL[c]}? This can't be undone.`))return;await del(c,id);toast(`Deleted ${LABEL[c]}`);closeDlg()};
  d.querySelector('#f').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.target),out={...(id?cur:{})};
    for(const[k,,type]of FIELDS[c]){
      if(type==='checkbox')out[k]=fd.get(k)==='on';
      else if(type==='number'){const n=fd.get(k);out[k]=n===''?'':Number(n)}
      else out[k]=(fd.get(k)||'').trim();
    }
    if(c==='orgs')out.tier=Number(out.tier)||1;
    if(c==='tasks'&&!id)out.order=Date.now();
    const nid=id||newId();
    const ok=await put(c,nid,out);
    if(!ok)return;
    if(c==='touches'&&!id&&out.orgId&&S.orgs[out.orgId]&&['Not started','Researching'].includes(S.orgs[out.orgId].status))await patch('orgs',out.orgId,{status:'Reached out'});
    toast(id?'Saved changes':`Added ${LABEL[c]}`);
    closeDlg();
  };
}
function closeDlg(){const d=$('#dlg');d.close();if(returnOrg&&S.orgs[returnOrg]){const r=returnOrg;returnOrg=null;openOrg(r)}else returnOrg=null}
function openOrg(id){
  const o=S.orgs[id];if(!o)return;
  const d=$('#dlg');d.className='wide';
  const contacts=Object.entries(S.contacts).filter(([,c])=>c.orgId===id);
  const touches=Object.entries(S.touches).filter(([,x])=>x.orgId===id).sort((a,b)=>(b[1].date||'').localeCompare(a[1].date||''));
  const opps=Object.entries(S.opps).filter(([,x])=>x.orgId===id);
  const tasks=Object.entries(S.tasks).filter(([,x])=>x.orgId===id);
  const f=(l,v)=>v?`<div><span>${l}</span>${esc(v)}</div>`:'';
  d.innerHTML=`<div class="dlg-head"><h2>${esc(o.name)}</h2><span class="chip ${ORG_CLS[o.status]||''}">${esc(o.status)}</span><button class="btn small" data-close>Close</button></div>
  <div class="dlg-body">
    <div class="facts">${f('Also known as',o.aka)}${f('Tier',TIERS[o.tier])}${f('Rank',o.rank)}${f('Specialty',o.specialty)}${f('Next step',o.nextAction)}${f('Next step date',o.nextDate&&fmt(o.nextDate))}${o.website?`<div><span>Website</span><a href="${esc(o.website)}" target="_blank" rel="noopener">${esc(o.website)}</a></div>`:''}</div>
    ${o.approach?`<p><strong>Approach.</strong> ${esc(o.approach)}</p>`:''}${o.notes?`<p class="muted">${esc(o.notes)}</p>`:''}
    <div class="sect"><div class="sect-head"><h3>Contacts</h3><button class="btn small" data-sub="new-contact">Add contact</button></div>${contacts.length?`<ul class="mini">${contacts.map(([cid,c])=>`<li data-sub="edit-contact" data-id="${cid}"><strong>${esc(c.name)}</strong>${c.role?', '+esc(c.role):''} <span class="muted">${esc(c.email)}</span></li>`).join('')}</ul>`:'<p class="muted">No contacts yet. Find who chooses speakers here.</p>'}</div>
    <div class="sect"><div class="sect-head"><h3>Outreach</h3><button class="btn small" data-sub="new-touch">Log outreach</button></div>${touches.length?`<ul class="mini">${touches.map(([tid,x])=>`<li data-sub="edit-touch" data-id="${tid}">${esc(fmt(x.date))}, ${esc(x.channel)}${x.contactId?' with '+esc(contactName(x.contactId)):''}: ${esc(x.summary)} <span class="muted">${esc(x.outcome)}${x.followUp&&!x.followUpDone?', follow up '+esc(rel(x.followUp)):''}</span></li>`).join('')}</ul>`:'<p class="muted">No outreach logged.</p>'}</div>
    <div class="sect"><div class="sect-head"><h3>Opportunities</h3><button class="btn small" data-sub="new-opp">Add opportunity</button></div>${opps.length?`<ul class="mini">${opps.map(([oid,x])=>`<li data-sub="edit-opp" data-id="${oid}">${esc(x.title)} <span class="chip ${STAGE_CLS[x.stage]||''}">${esc(x.stage)}</span></li>`).join('')}</ul>`:'<p class="muted">No opportunities yet.</p>'}</div>
    ${tasks.length?`<div class="sect"><div class="sect-head"><h3>Plan tasks</h3></div><ul class="mini">${tasks.map(([tid,x])=>`<li data-sub="edit-task" data-id="${tid}">${x.done?'Done: ':''}${esc(x.title)} <span class="muted">${x.due?esc(fmt(x.due)):''}</span></li>`).join('')}</ul></div>`:''}
  </div>
  <div class="dlg-foot"><button class="btn primary" data-sub="edit-org">Edit organization</button></div>`;
  if(!d.open)d.showModal();
  d.querySelector('[data-close]').onclick=()=>{returnOrg=null;d.close()};
  d.querySelectorAll('[data-sub]').forEach(el=>el.onclick=()=>{
    const a=el.dataset.sub,sid=el.dataset.id;d.close();returnOrg=id;
    if(a==='edit-org')openForm('orgs',id);
    else if(a==='new-contact')openForm('contacts',null,{orgId:id});
    else if(a==='new-touch')openForm('touches',null,{orgId:id});
    else if(a==='new-opp')openForm('opps',null,{orgId:id});
    else openForm({'edit-contact':'contacts','edit-touch':'touches','edit-opp':'opps','edit-task':'tasks'}[a],sid);
  });
}

/* ---------- export ---------- */
function saveFile(filename,data){
  const type=filename.endsWith('.csv')?'text/csv':'application/json';
  const url=URL.createObjectURL(new Blob([data],{type}));
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Downloaded '+filename);
}
function csv(c){
  const cols=FIELDS[c].map(f=>f[0]);
  const lookup={orgId:orgName,contactId:contactName};
  const rows=[cols.map(k=>k==='orgId'?'organization':k==='contactId'?'contact':k),...Object.values(S[c]).map(r=>cols.map(k=>lookup[k]?lookup[k](r[k]):r[k]))];
  return rows.map(r=>r.map(v=>{v=String(v??'');return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')).join('\n');
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]');if(!el||el.closest('dialog'))return;
  if(e.target.closest('select'))return;
  const a=el.dataset.act,id=el.dataset.id;
  e.stopPropagation();
  switch(a){
    case 'new-task':return openForm('tasks');
    case 'new-touch':return openForm('touches');
    case 'new-org':return openForm('orgs',null,{rank:Object.keys(S.orgs).length+1});
    case 'new-contact':return openForm('contacts');
    case 'new-opp':return openForm('opps');
    case 'edit-task':return openForm('tasks',id);
    case 'edit-touch':return openForm('touches',id);
    case 'edit-contact':return openForm('contacts',id);
    case 'edit-opp':return openForm('opps',id);
    case 'open-org':return openOrg(id);
    case 'done-task':if(await patch('tasks',id,{done:true}))toast('Marked done');return;
    case 'done-fu':if(await patch('touches',id,{followUpDone:true}))toast('Follow-up done');return;
    case 'move':{const o=S.opps[id];const i=Math.max(0,STAGES.indexOf(o.stage||'Identified'))+Number(el.dataset.dir);if(STAGES[i]&&await patch('opps',id,{stage:STAGES[i]}))toast('Moved to '+STAGES[i]);return}
    case 'csv':return saveFile(`showcase-${el.dataset.c}-${today()}.csv`,csv(el.dataset.c));
    case 'backup':return saveFile(`showcase-desk-backup-${today()}.json`,JSON.stringify(S,null,2));
    case 'restore':return $('#importFile').click();
  }
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[role=button][data-act]')){e.preventDefault();e.target.click()}});
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.dataset.chk){if(await patch('tasks',t.dataset.chk,{done:t.checked}))toast(t.checked?'Marked done':'Marked not done');}
  else if(t.dataset.inline){const[c,id,k]=t.dataset.inline.split(':');if(await patch(c,id,{[k]:t.value}))toast(`Status set to ${t.value}`);}
});
renderShell();
load();
