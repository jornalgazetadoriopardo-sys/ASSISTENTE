import { abrirBanco } from './db.js';

const ICON={
  briefing:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="6" stroke-dasharray="2.4 2"/></svg>',
  producao:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>',
  aguardando:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
  ajustes:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 4L2 7l3 3"/><path d="M2 7h7.5a4 4 0 010 8H7"/></svg>',
  aprovado:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="6"/><path d="M5.3 8.2l1.9 1.9 3.6-3.8"/></svg>',
  publicado:'<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6.6"/><path d="M5.2 8.2l1.9 1.9 3.7-3.8" fill="none" stroke="var(--surface)" stroke-width="1.8"/></svg>'
};
const ST={briefing:'Briefing',producao:'Em produção',aguardando:'Aguardando cliente',ajustes:'Ajustes pedidos',aprovado:'Aprovado',publicado:'Publicado'};
const ORDER=['briefing','producao','aguardando','ajustes','aprovado','publicado'];
const ACTIONS={
  briefing:[['producao','Começar produção','primary']],
  producao:[['aguardando','Enviei pra aprovação','primary']],
  aguardando:[['aprovado','Aprovou','ok'],['ajustes','Pediu ajuste',''],['@cobrar','Cobrar aprovação','']],
  ajustes:[['aguardando','Reenviei pra aprovação','primary']],
  aprovado:[['publicado','Marcar publicado','primary']],
  publicado:[['producao','Reabrir','ghost']]
};
const TIPOS=['Post','Carrossel','Story','Reels','Vídeo','Impresso','Site','Identidade visual','Outro'];
const PARADA_DIAS=3;

let db=null, clientes=[], pecas=[], loaded={c:false,p:false};
let fState=null, fClient=null, openEdit=null, confirmDel=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parse(s){if(!s)return null;const [y,m,d]=s.slice(0,10).split('-').map(Number);return new Date(y,m-1,d)}
function diffDays(a,b){return Math.round((parse(a)-parse(b))/864e5)}
const DOW=['dom','seg','ter','qua','qui','sex','sáb'];
function fmt(s){const d=parse(s);if(!d)return'';return DOW[d.getDay()]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')}
$('#today').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});

function info(p){
  const t=todayStr(), open=!['aprovado','publicado'].includes(p.status);
  const late=open&&p.prazo&&diffDays(t,p.prazo)>0;
  const dias=p.status==='aguardando'&&p.statusDesde?diffDays(t,p.statusDesde):0;
  return {late,lateDays:late?diffDays(t,p.prazo):0,dueToday:open&&p.prazo===t,parada:dias>=PARADA_DIAS,dias};
}
function score(p){const i=info(p);if(p.status==='publicado')return 9e9;let s=0;if(i.late)s-=1e6+i.lateDays*1e3;if(i.parada)s-=5e5+i.dias*1e3;s+=p.prazo?diffDays(p.prazo,todayStr()):5e3;return s}
function cname(id){return (clientes.find(c=>c.id===id)||{}).nome||'Sem cliente'}
function client(id){return clientes.find(c=>c.id===id)}

function render(){
  if(!loaded.c||!loaded.p)return;
  const t=todayStr(), mes=t.slice(0,7);
  const base=pecas.filter(p=>!fClient||p.cliente===fClient);
  const cnt={atrasadas:base.filter(p=>info(p).late).length,cliente:base.filter(p=>p.status==='aguardando').length,mao:base.filter(p=>['briefing','producao','ajustes'].includes(p.status)).length,pub:base.filter(p=>p.status==='publicado'&&(p.statusDesde||'').startsWith(mes)).length};
  const S=[['atrasadas','Atrasadas','bad'],['cliente','Com o cliente','warn'],['mao','Na sua mão','info'],['pub','Publicadas no mês','ok']];
  $('#stats').innerHTML=S.map(([k,l,c])=>`<button class="stat ${c}" data-state="${k}" aria-pressed="${fState===k}"><b>${cnt[k]}</b><span>${l}</span></button>`).join('');

  const hasEx=pecas.some(p=>p.exemplo);
  $('#exNotice').innerHTML=hasEx?`<div class="notice"><span>As peças marcadas <b>Exemplo</b> são só para você ver como funciona.</span><button class="btn" data-act="clearEx">Apagar exemplos</button></div>`:'';

  $('#chips').innerHTML=`<button class="chip" data-client="" aria-pressed="${!fClient}">Todos</button>`+clientes.map(c=>`<button class="chip" data-client="${esc(c.id)}" aria-pressed="${fClient===c.id}">${esc(c.nome)}</button>`).join('');

  const showDone=$('#showDone').checked||fState==='pub';
  let rows=base.filter(p=>showDone||p.status!=='publicado');
  if(fState==='atrasadas')rows=rows.filter(p=>info(p).late);
  if(fState==='cliente')rows=rows.filter(p=>p.status==='aguardando');
  if(fState==='mao')rows=rows.filter(p=>['briefing','producao','ajustes'].includes(p.status));
  if(fState==='pub')rows=rows.filter(p=>p.status==='publicado'&&(p.statusDesde||'').startsWith(mes));
  rows.sort((a,b)=>score(a)-score(b));
  const titles={atrasadas:'Atrasadas',cliente:'Aguardando o cliente',mao:'Na sua mão',pub:'Publicadas este mês'};
  $('#listTitle').textContent=(titles[fState]||'Peças em andamento')+(fClient?' · '+cname(fClient):'');

  if(!rows.length){
    $('#list').innerHTML=pecas.length?`<div class="empty"><b>Nada por aqui.</b>Nenhuma peça neste filtro.</div>`:`<div class="empty"><b>Nenhuma peça cadastrada.</b>Toque em <b>+ Nova peça</b> para registrar o primeiro trabalho de um cliente.</div>`;
  } else $('#list').innerHTML=rows.map(card).join('');

  $('#clients').innerHTML=clientes.length?clientes.map(c=>{
    const ab=pecas.filter(p=>p.cliente===c.id&&p.status!=='publicado').length;
    const total=pecas.filter(p=>p.cliente===c.id).length;
    return `<div class="crow"><div><div class="n">${esc(c.nome)}</div><div class="c">${ab} em aberto</div></div>
      <div class="acts"><button class="btn" data-act="status" data-id="${esc(c.id)}">Copiar status</button>${total?'':`<button class="btn danger" data-act="delClient" data-id="${esc(c.id)}">${confirmDel==='c:'+c.id?'Confirmar remoção':'Remover'}</button>`}</div>
      <div class="phone"><input id="ph-${esc(c.id)}" data-phone="${esc(c.id)}" value="${esc(c.whatsapp||'')}" placeholder="WhatsApp com DDD (opcional)" inputmode="tel" aria-label="WhatsApp de ${esc(c.nome)}"></div></div>`}).join('')
    :`<div class="empty"><b>Nenhum cliente ainda.</b>Adicione abaixo.</div>`;
}

function card(p){
  const i=info(p), acts=ACTIONS[p.status]||[], c=client(p.cliente);
  const flags=[];
  if(p.exemplo)flags.push('<span class="flag ex">Exemplo</span>');
  if(i.late)flags.push(`<span class="flag bad">Atrasada ${i.lateDays} dia${i.lateDays>1?'s':''}</span>`);
  else if(i.dueToday)flags.push('<span class="flag warn">Vence hoje</span>');
  if(i.parada)flags.push(`<span class="flag warn">Parada há ${i.dias} dias</span>`);
  let prazo='';
  if(p.prazo)prazo=`<span>Prazo <span class="mono">${fmt(p.prazo)}</span></span>`;
  let desde='';
  if(p.status==='aguardando'&&p.statusDesde)desde=`<span>Enviada <span class="mono">${fmt(p.statusDesde)}</span></span>`;
  if(p.status==='publicado'&&p.statusDesde)desde=`<span>Publicada <span class="mono">${fmt(p.statusDesde)}</span></span>`;
  const btns=acts.map(([to,l,cls])=>{
    if(to==='@cobrar'){
      const wa=c&&c.whatsapp?waLink(c.whatsapp,cobranca(p)):null;
      return `<button class="btn ${cls}" data-act="cobrar" data-id="${p.id}">${l}</button>`+(wa?`<a class="btn ghost" href="${esc(wa)}" target="_blank" rel="noopener">Abrir WhatsApp</a>`:'');
    }
    return `<button class="btn ${cls}" data-act="move" data-to="${to}" data-id="${p.id}">${l}</button>`;
  }).join('');
  const editing=openEdit===p.id;
  return `<article class="card${i.late?' is-late':''}">
    <div class="top"><span class="pill s-${p.status}">${ICON[p.status]}${ST[p.status]}</span>${flags.join('')}</div>
    <h3 class="title">${esc(p.titulo)}</h3>
    <div class="meta"><span class="client">${esc(cname(p.cliente))}</span><span>${esc(p.tipo||'')}</span>${prazo}${desde}</div>
    ${p.obs&&!editing?`<p class="obs">${esc(p.obs)}</p>`:''}
    <div class="actions">${btns}<button class="btn ghost more" data-act="edit" data-id="${p.id}" aria-expanded="${editing}">${editing?'Fechar':'Editar'}</button></div>
    ${editing?editForm(p):''}
  </article>`;
}
function opts(list,sel,labels){return list.map(v=>`<option value="${esc(v)}"${v===sel?' selected':''}>${esc(labels?labels[v]:v)}</option>`).join('')}
function editForm(p){
  return `<form class="edit" data-edit="${p.id}">
    <label class="f">Título<input id="e-t-${p.id}" name="titulo" value="${esc(p.titulo)}" required></label>
    <div class="row2">
      <label class="f">Cliente<select id="e-c-${p.id}" name="cliente">${clientes.map(c=>`<option value="${esc(c.id)}"${c.id===p.cliente?' selected':''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="f">Tipo<select id="e-y-${p.id}" name="tipo">${opts(TIPOS,p.tipo)}</select></label>
      <label class="f">Prazo<input id="e-p-${p.id}" type="date" name="prazo" value="${esc(p.prazo||'')}"></label>
      <label class="f">Status<select id="e-s-${p.id}" name="status">${opts(ORDER,p.status,ST)}</select></label>
    </div>
    <label class="f">Observações<textarea id="e-o-${p.id}" name="obs" placeholder="Ex.: cliente pediu trocar a foto">${esc(p.obs||'')}</textarea></label>
    <div class="actions"><button class="btn primary" type="submit">Salvar</button><button class="btn danger" type="button" data-act="del" data-id="${p.id}">${confirmDel==='p:'+p.id?'Confirmar exclusão':'Excluir peça'}</button></div>
  </form>`;
}

function cobranca(p){
  const c=client(p.cliente), quando=p.statusDesde?(diffDays(todayStr(),p.statusDesde)===0?'hoje':'no '+fmt(p.statusDesde).replace(/^(\w+)/,(m)=>({dom:'domingo',seg:'segunda',ter:'terça',qua:'quarta',qui:'quinta',sex:'sexta',sáb:'sábado'}[m]||m))):'';
  return `Oi! Tudo bem? Passando pra lembrar da aprovação de "${p.titulo}"${quando?', que mandei '+quando:''}. Consegue dar uma olhada? Assim já deixo tudo pronto${p.prazo?' pro dia '+fmt(p.prazo).slice(4):''}. Obrigado!`;
}
function statusMsg(cid){
  const ps=pecas.filter(p=>p.cliente===cid&&p.status!=='publicado').sort((a,b)=>score(a)-score(b));
  if(!ps.length)return `Oi! Passando pra atualizar: no momento está tudo entregue por aqui. Qualquer nova demanda é só me chamar.`;
  const g=k=>ps.filter(p=>k.includes(p.status));
  let m='Oi! Segue a atualização dos trabalhos:\n';
  const sec=(t,arr)=>{if(arr.length)m+=`\n${t}\n`+arr.map(p=>`• ${p.titulo}${p.prazo?' (prazo '+fmt(p.prazo).slice(4)+')':''}`).join('\n')+'\n'};
  sec('Aguardando sua aprovação:',g(['aguardando']));
  sec('Em produção:',g(['briefing','producao','ajustes']));
  sec('Aprovado, pronto pra publicar:',g(['aprovado']));
  return m.trim();
}
function waLink(num,txt){const d=String(num).replace(/\D/g,'');if(d.length<10)return null;return 'https://wa.me/'+(d.length<=11?'55'+d:d)+'?text='+encodeURIComponent(txt)}

let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2600)}
async function copy(txt,okMsg){
  try{await navigator.clipboard.writeText(txt);toast(okMsg)}
  catch(e){showSheet(`<h3>Copie a mensagem</h3><textarea class="copybox" id="copyTxt" rows="7" readonly>${esc(txt)}</textarea><button class="btn" data-act="close">Fechar</button>`);setTimeout(()=>{const a=$('#copyTxt');if(a){a.focus();a.select()}},50)}
}
function showSheet(html){$('#sheetHost').innerHTML=`<div class="sheet-bg" data-act="bg"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`}
function closeSheet(){$('#sheetHost').innerHTML=''}

async function save(id,patch){
  if(!db){toast('Banco de dados não conectado.');return}
  try{await db.collection('pecas').doc(id).update({...patch,atualizadoEm:new Date().toISOString()})}
  catch(e){toast('Não consegui salvar: '+(e.message||e.code||'tente de novo'))}
}

document.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-act],[data-state],[data-client]');if(!b)return;
  if(b.dataset.act==='bg'&&ev.target!==b)return;
  if(b.hasAttribute('data-state')){fState=fState===b.dataset.state?null:b.dataset.state;render();return}
  if(b.hasAttribute('data-client')){fClient=b.dataset.client||null;render();return}
  const a=b.dataset.act,id=b.dataset.id;
  if(a==='bg'||a==='close'){closeSheet();return}
  if(a==='move'){const to=b.dataset.to;b.disabled=true;await save(id,{status:to,statusDesde:todayStr()});toast(ST[to]);return}
  if(a==='cobrar'){const p=pecas.find(x=>x.id===id);copy(cobranca(p),'Mensagem de cobrança copiada. É só colar no WhatsApp.');return}
  if(a==='status'){copy(statusMsg(id),'Status copiado para colar no WhatsApp.');return}
  if(a==='edit'){openEdit=openEdit===id?null:id;confirmDel=null;render();return}
  if(a==='del'){if(confirmDel!=='p:'+id){confirmDel='p:'+id;render();return}
    try{await db.collection('pecas').doc(id).delete();openEdit=null;confirmDel=null;toast('Peça excluída')}catch(e){toast('Não consegui excluir.')}return}
  if(a==='delClient'){if(confirmDel!=='c:'+id){confirmDel='c:'+id;render();return}
    try{await db.collection('clientes').doc(id).delete();confirmDel=null;if(fClient===id)fClient=null;toast('Cliente removido')}catch(e){toast('Não consegui remover.')}return}
  if(a==='clearEx'){const ex=pecas.filter(p=>p.exemplo);for(const p of ex){try{await db.collection('pecas').doc(p.id).delete()}catch(e){}}toast('Exemplos apagados');return}
});
$('#showDone').addEventListener('change',render);
document.addEventListener('submit',async ev=>{
  ev.preventDefault();const f=ev.target;
  if(f.dataset.edit){const fd=new FormData(f),id=f.dataset.edit,p=pecas.find(x=>x.id===id);
    const patch={titulo:fd.get('titulo').trim(),cliente:fd.get('cliente'),tipo:fd.get('tipo'),prazo:fd.get('prazo')||'',obs:fd.get('obs').trim()};
    if(fd.get('status')!==p.status){patch.status=fd.get('status');patch.statusDesde=todayStr()}
    openEdit=null;await save(id,patch);toast('Salvo');return}
  if(f.id==='newPiece'){const fd=new FormData(f);
    if(!db){toast('Banco de dados não conectado.');return}
    const now=new Date().toISOString();
    try{await db.collection('pecas').add({titulo:fd.get('titulo').trim(),cliente:fd.get('cliente'),tipo:fd.get('tipo'),prazo:fd.get('prazo')||'',status:fd.get('status'),statusDesde:todayStr(),obs:fd.get('obs').trim(),criadoEm:now,atualizadoEm:now});closeSheet();toast('Peça cadastrada')}
    catch(e){toast('Não consegui salvar: '+(e.message||'tente de novo'))}return}
  if(f.id==='addClient'){const nome=$('#newClientName').value.trim();if(!nome)return;
    if(!db){toast('Banco de dados não conectado.');return}
    try{await db.collection('clientes').add({nome,whatsapp:$('#newClientPhone').value.trim(),criadoEm:new Date().toISOString()});f.reset();toast('Cliente adicionado')}
    catch(e){toast('Não consegui salvar o cliente.')}}
});
document.addEventListener('change',async ev=>{
  const i=ev.target;if(!i.dataset||!i.dataset.phone||!db)return;
  try{await db.collection('clientes').doc(i.dataset.phone).update({whatsapp:i.value.trim()});toast('WhatsApp salvo')}catch(e){toast('Não consegui salvar o número.')}
});
$('#fab').addEventListener('click',()=>{
  if(!clientes.length){toast('Cadastre um cliente primeiro, lá embaixo.');return}
  showSheet(`<h3>Nova peça</h3><form id="newPiece" style="display:grid;gap:10px">
    <label class="f">O que é<input id="n-titulo" name="titulo" required placeholder="Ex.: Carrossel Outubro Rosa"></label>
    <div class="row2">
      <label class="f">Cliente<select id="n-cliente" name="cliente">${clientes.map(c=>`<option value="${esc(c.id)}"${c.id===fClient?' selected':''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="f">Tipo<select id="n-tipo" name="tipo">${opts(TIPOS,'Post')}</select></label>
      <label class="f">Prazo<input id="n-prazo" type="date" name="prazo"></label>
      <label class="f">Começa como<select id="n-status" name="status">${opts(ORDER.slice(0,4),'briefing',ST)}</select></label>
    </div>
    <label class="f">Observações<textarea id="n-obs" name="obs" placeholder="Detalhes do pedido"></textarea></label>
    <div class="actions"><button class="btn primary" type="submit">Cadastrar</button><button class="btn ghost" type="button" data-act="close">Cancelar</button></div>
  </form>`);
  setTimeout(()=>{const t=$('#n-titulo');t&&t.focus()},50);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});

let relatorios=[];
function renderReport(){
  const r=relatorios[0];
  if(!r){$('#report').hidden=true;return}
  $('#report').hidden=false;
  $('#report').innerHTML=`<h2>Resumo da semana</h2><small>Gerado pelo agente em ${esc(new Date(r.criadoEm).toLocaleString('pt-BR'))}</small><pre>${esc(r.texto)}</pre>`;
}

(async()=>{
  try{db=await abrirBanco()}catch(e){db=null}
  if(!db){$('#list').innerHTML=`<div class="empty"><b>Não consegui abrir os dados.</b>Confira a configuração em config.js e se você entrou com a conta certa.</div>`;return}
  const err=()=>{$('#list').innerHTML=`<div class="empty"><b>Sem acesso aos dados.</b>Este painel é só para o dono. Entre com a sua conta.</div>`};
  db.collection('clientes').orderBy('nome').onSnapshot(s=>{clientes=s.docs.map(d=>({id:d.id,...d.data()}));loaded.c=true;render()},err);
  db.collection('pecas').onSnapshot(s=>{pecas=s.docs.map(d=>({id:d.id,...d.data()}));loaded.p=true;render()},err);
  db.collection('relatorios').orderBy('criadoEm','desc').limit(1).onSnapshot(s=>{relatorios=s.docs.map(d=>({id:d.id,...d.data()}));renderReport()},()=>{});
  setInterval(()=>{if(!openEdit)render()},60000);
})();
