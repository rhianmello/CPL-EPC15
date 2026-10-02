(function(){
'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:d});
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const present=v=>v!=null && String(v).replace(/[\s/\-]/g,'')!=='';
const numbers=v=>(String(v??'').match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>Number(x.replace(',','.')));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const iso=v=>{if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);if(typeof v==='number'&&v>1){const d=XLSX.SSF.parse_date_code(v);return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:'';}const s=String(v||'');if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';};
const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
let data=null,draft=null,page=0,busy=false,logs=[],charts={},weeks=[];
const DRAFT_KEY='epc15_estacas_draft_v2';
const clone=v=>{try{return structuredClone(v);}catch(_){return JSON.parse(JSON.stringify(v));}};
function persistDraft(model){try{if(model)localStorage.setItem(DRAFT_KEY,JSON.stringify(model));}catch(e){console.warn('Rascunho local:',e);}}
function restoreDraft(){try{const v=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');return v?.schema==='estacas_v1'&&Array.isArray(v.rows)?v:null;}catch(_){return null;}}
function clearCharts(){for(const k of Object.keys(charts)){try{charts[k]?.destroy();}catch(_){ }delete charts[k];}}

const type=()=>`estacas_week_${Number($('week').value)}`;
function log(message){logs.unshift({at:new Date().toISOString(),message});logs=logs.slice(0,100);$('logs').innerHTML=logs.map(x=>`<li>${esc(new Date(x.at).toLocaleString('pt-BR'))} • ${esc(x.message)}</li>`).join('');}
function source(message,error=false){$('source').textContent=message;$('source').dataset.error=String(error);}
function enrich(r){const executed=!!r.execution,pit=present(r.pitStatus),conform=pit&&norm(r.pitStatus)===norm(data.config.pitConform),rnc=present(r.rnc),test=numbers(r.strength).length>0,days=executed?Math.floor((Date.parse(data.base)-Date.parse(r.execution))/86400000):null;
const complete=executed&&present(r.molding)&&test&&(pit||days<data.config.pitDays)&&(!pit||conform)&&!rnc;
const status=rnc?'Crítico (RNC)':!executed?'Não executada':pit&&!conform?'Crítico (PIT)':complete?'Completo':'Pendente';
const pending=[];if(!executed)pending.push('Execução não registrada');else{if(!present(r.molding))pending.push('Ficha de moldagem');if(!test)pending.push('Resultado 28 dias');if(!pit)pending.push('PIT não registrado');if(pit&&!conform)pending.push('Achado técnico no PIT');}if(rnc)pending.push('RNC vinculada');return {...r,executed,pit,conform,rncLinked:rnc,test,complete,status,pending:pending.join('; ')};}
function parseWorkbook(w,name){const s=w.Sheets.Estaqueamento;if(!s)throw Error('A aba Estaqueamento não foi encontrada.');const raw=XLSX.utils.sheet_to_json(s,{header:1,defval:null});const h=raw.findIndex(r=>norm(r[3]).replace(/\s/g,'')==='tag2'&&norm(r[6])==='unidade');if(h<0)throw Error('Cabeçalhos incompatíveis: confira TAG2 em D, Bloco em E e Unidade em G.');
const expected={4:'bloco',8:'data de execucao',15:'volume de concreto',25:'28 dias',30:'status pit',37:'rnc'};for(const [i,n]of Object.entries(expected))if(!norm(raw[h][i]).includes(n))throw Error('Colunas alteradas na aba Estaqueamento: '+n);
const rows=[],seen=new Set();let duplicates=0,ignored=0;
for(let i=h+1;i<raw.length;i++){const r=raw[i];if(!present(r[3])||!present(r[6])){if(r.some(present))ignored++;continue;}const key=[r[6],r[3]].map(norm).join('|');if(seen.has(key))throw Error(`TAG2 duplicada na unidade: ${r[6]} / ${r[3]} (linha ${i+1}). Corrija a base antes de importar.`);seen.add(key);rows.push({line:i+1,report:r[1],tag:String(r[3]).trim(),block:String(r[4]??'Sem bloco').trim(),unit:String(r[6]).trim(),local:r[7],diameter:r[5],execution:iso(r[8]),depth:r[9],volume:numbers(r[15])[0]||0,molding:r[16],sample:r[17],strength:r[25],cut:iso(r[26]),pitDate:iso(r[28]),pitReport:r[29],pitStatus:r[30],pceDate:iso(r[31]),pceReport:r[32],pceStatus:r[33],project:r[34],revision:r[35],survey:r[36],rnc:r[37]});}
if(!rows.length)throw Error('Nenhuma estaca com TAG2 e Unidade encontrada.');const c=w.Sheets['10-CONFIGURACOES'];return {schema:'estacas_v1',file:name,base:$('base').value||today(),importedAt:new Date().toISOString(),config:{pitConform:c?.B22?.v||'Íntegra',pitDays:Number(c?.B36?.v)||30},rows,ignored,duplicates};}
function options(id,values){const old=$(id).value;$(id).innerHTML='<option value="">Todos</option>'+[...new Set(values)].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(values.includes(old))$(id).value=old;}
function filters(){const rs=data?.rows||[];options('unit',rs.map(r=>r.unit));const us=rs.filter(r=>!$('unit').value||r.unit===$('unit').value);options('block',us.map(r=>r.block));options('tag',us.filter(r=>!$('block').value||r.block===$('block').value).map(r=>r.tag));}
function chart(id,type,labels,datasets,extra={}){if(!window.Chart||!$(id))return;try{charts[id]?.destroy();charts[id]=new Chart($(id),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:{duration:300},plugins:{legend:{position:'bottom',labels:{color:'#b9cbe0',usePointStyle:true,boxWidth:10,padding:16}},tooltip:{backgroundColor:'#071321',borderColor:'#29435f',borderWidth:1,titleColor:'#fff',bodyColor:'#d8e7f5'}},scales:type==='doughnut'?{}:{x:{ticks:{color:'#93abc5',maxRotation:35,minRotation:0},grid:{color:'rgba(76,111,147,.16)'}},y:{beginAtZero:true,ticks:{color:'#93abc5'},grid:{color:'rgba(76,111,147,.16)'}}},...extra}});}catch(e){log('Falha no gráfico '+id+': '+e.message);}}
function render(){
  const hasData=Boolean(data?.rows?.length);
  if(!hasData){
    clearCharts();
    if(busy){
      // Skeleton durante a consulta: placeholders sem dados fictícios.
      $('kpis').innerHTML=Array.from({length:10},()=>'<div class="kpi skeleton" aria-hidden="true"><span>&nbsp;</span><strong class="sk-line"></strong><small class="sk-line short"></small></div>').join('');
      if($('progress-value')) $('progress-value').textContent='…';
      if($('progress-copy')) $('progress-copy').textContent='Consultando a semana…';
      for(const id of ['overview-total','overview-executed','overview-pending','overview-critical']) if($(id)) $(id).textContent='…';
      $('rows').innerHTML=Array.from({length:6},()=>'<tr class="sk-row" aria-hidden="true"><td colspan="12"><span class="sk-line"></span></td></tr>').join('');
      $('count').textContent='Carregando…';
      $('page').textContent='Página 1 de 1';
      $('prev').disabled=true;
      $('next').disabled=true;
      $('save').disabled=true;
      for(const id of ['week','base','import','load','file']) $(id).disabled=true;
      $('draft').disabled=true;
      return;
    }
    const labels=['Estacas cadastradas','Executadas','Avanço físico','A executar','Rastreabilidade completa','Pendentes','Estacas críticas','Cobertura PIT','Volume de concreto','Resistência média 28d'];
    $('kpis').innerHTML=labels.map(x=>`<div class="kpi empty"><span>${x}</span><strong>—</strong><small>Aguardando base</small></div>`).join('');
    if($('progress-value')) $('progress-value').textContent='—';
    if($('progress-bar')) $('progress-bar').style.width='0%';
    if($('progress-copy')) $('progress-copy').textContent='Aguardando dados da aba Estaqueamento.';
    for(const id of ['overview-total','overview-executed','overview-pending','overview-critical']) if($(id)) $(id).textContent='—';
    $('rows').innerHTML='<tr><td colspan="12" class="empty-row">Importe o Excel para preencher a rastreabilidade.</td></tr>';
    $('count').textContent='Sem dados';
    $('page').textContent='Página 1 de 1';
    $('prev').disabled=true;
    $('next').disabled=true;
    $('save').disabled=true;
    for(const id of ['week','base','import','load','file']) $(id).disabled=busy;
    $('draft').disabled=busy||!draft;
    return;
  }

  const rs=data.rows.map(enrich).filter(r=>
    (!$('unit').value||r.unit===$('unit').value)&&
    (!$('block').value||r.block===$('block').value)&&
    (!$('tag').value||r.tag===$('tag').value)&&
    (!$('status').value||r.status===$('status').value)
  );
  const executed=rs.filter(r=>r.executed);
  const total=rs.length;
  const complete=executed.filter(r=>r.complete).length;
  const pending=rs.filter(r=>r.status==='Pendente').length;
  const critical=rs.filter(r=>r.status.startsWith('Crítico')).length;
  const pits=executed.filter(r=>r.pit).length;
  const advance=total?executed.length/total*100:0;
  const values=executed.flatMap(r=>numbers(r.strength));
  const mean=values.length?fmt(values.reduce((a,b)=>a+b,0)/values.length,1):'—';

  if($('progress-value')) $('progress-value').textContent=fmt(advance,1)+'%';
  if($('progress-bar')) $('progress-bar').style.width=Math.max(0,Math.min(100,advance))+'%';
  if($('progress-copy')) $('progress-copy').textContent=fmt(executed.length)+' executadas de '+fmt(total)+' estacas da seleção atual.';
  if($('overview-total')) $('overview-total').textContent=fmt(total);
  if($('overview-executed')) $('overview-executed').textContent=fmt(executed.length);
  if($('overview-pending')) $('overview-pending').textContent=fmt(pending);
  if($('overview-critical')) $('overview-critical').textContent=fmt(critical);

  const kpis=[
    ['Estacas cadastradas',fmt(total),'Base filtrada','base'],
    ['Executadas',fmt(executed.length),fmt(advance,1)+'% da base','ok'],
    ['Avanço físico',fmt(advance,1)+'%',fmt(executed.length)+' de '+fmt(total),'accent'],
    ['A executar',fmt(total-executed.length),'Sem data de execução','neutral'],
    ['Rastreabilidade completa',fmt(executed.length?complete/executed.length*100:0,1)+'%',complete+' de '+executed.length+' executadas','ok'],
    ['Pendentes',fmt(pending),'Documentação / ensaios','warn'],
    ['Estacas críticas',fmt(critical),'RNC ou achado PIT • sem dupla contagem','alert'],
    ['Cobertura PIT',fmt(executed.length?pits/executed.length*100:0,1)+'%',pits+' registros de '+executed.length+' executadas','accent'],
    ['Volume de concreto',fmt(executed.reduce((a,r)=>a+r.volume,0),2),'m³ • estacas executadas','base'],
    ['Resistência média 28d',mean,values.length+' resultados • MPa','base']
  ];
  $('kpis').innerHTML=kpis.map(([a,b,c,d])=>`<div class="kpi ${d||''}"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');

  const statuses=['Completo','Pendente','Crítico (RNC)','Crítico (PIT)','Não executada'];
  chart('distribution','doughnut',statuses,[{data:statuses.map(s=>rs.filter(r=>r.status===s).length),backgroundColor:['#1fd2a4','#f2bf58','#ff627a','#9d7cff','#35506e'],borderWidth:0,hoverOffset:6}],{cutout:'68%'});

  const units=[...new Set(rs.map(r=>r.unit))];
  chart('units','bar',units,[
    {label:'Executadas',data:units.map(u=>rs.filter(r=>r.unit===u&&r.executed).length),backgroundColor:'#22d3ee',borderRadius:7},
    {label:'A executar',data:units.map(u=>rs.filter(r=>r.unit===u&&!r.executed).length),backgroundColor:'#344d6b',borderRadius:7}
  ]);

  const days=[...new Set(executed.map(r=>r.execution))].sort();
  chart('production','line',days.map(date),[{label:'Estacas executadas',data:days.map(d=>executed.filter(r=>r.execution===d).length),borderColor:'#35d3e2',backgroundColor:'rgba(31,158,183,.18)',fill:true,tension:.2,pointRadius:3,borderWidth:2.5}]);

  chart('pit','bar',['Íntegra / conforme','Achado técnico','Sem registro'],[{label:'Estacas executadas',data:[executed.filter(r=>r.conform).length,executed.filter(r=>r.pit&&!r.conform).length,executed.filter(r=>!r.pit).length],backgroundColor:['#1fd2a4','#ff627a','#f2bf58'],borderRadius:8}]);

  const ds=[...new Set(executed.map(r=>r.diameter).filter(present))].sort((a,b)=>Number(a)-Number(b));
  chart('strength','bar',ds.map(d=>`Ø ${d} cm`),[{label:'Média MPa',data:ds.map(d=>{const v=executed.filter(r=>r.diameter===d).flatMap(r=>numbers(r.strength));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}),backgroundColor:'#7ea9ff',borderRadius:8}]);

  page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(total/50)-1)));
  const badge=r=>r.status==='Completo'?'complete':r.status==='Pendente'?'pending':r.status==='Não executada'?'idle':'critical';
  $('rows').innerHTML=rs.slice(page*50,page*50+50).map(r=>`<tr><td>${esc(r.unit)}</td><td>${esc(r.block)}</td><td title="Linha ${r.line}">${esc(r.tag)}</td><td>${date(r.execution)}</td><td>${fmt(r.volume,2)}</td><td>${esc(r.strength??'—')}</td><td>${date(r.cut)}</td><td title="${esc(r.pitReport)}">${esc(r.pitStatus||'Sem registro')}</td><td title="${esc(r.pceReport)}">${esc(r.pceStatus||'Sem registro')}</td><td>${esc(r.rnc||'—')}</td><td><span class="badge ${badge(r)}">${r.status}</span></td><td>${esc(r.pending||'—')}</td></tr>`).join('')||'<tr><td colspan="12" class="empty-row">Nenhuma estaca nesta seleção.</td></tr>';

  $('count').textContent=fmt(total)+' estacas';
  $('page').textContent='Página '+(page+1)+' de '+Math.max(1,Math.ceil(total/50));
  $('prev').disabled=page===0;
  $('next').disabled=(page+1)*50>=total;
  $('save').disabled=!data||busy;
  for(const id of ['week','base','import','load','file']) $(id).disabled=busy;
  $('draft').disabled=busy||!draft;
}
async function history(){const versions=await CloudSync.rpc('list_bi_publications',{p_dataset_type:type(),p_limit:50});$('history').innerHTML=(versions||[]).map(v=>`<div>V${Number(v.version_no)} • ${esc(v.file_name)} • Data-base ${date(v.data_base)} • ${esc(new Date(v.published_at).toLocaleString('pt-BR'))}</div>`).join('')||'Nenhuma versão salva nesta semana.';}
async function load(){
  if(busy)return;
  const before=data;
  busy=true;
  render();
  source('Consultando semana...');
  try{
    const result=await CloudSync.rpc('get_current_bi_snapshot',{p_dataset_type:type()});
    if(result?.dataset?.schema_version!=='estacas_v1'){
      if(draft){
        data=clone(draft);
        $('base').value=data.base||today();
        source('Nenhuma publicação nesta semana • exibindo o último Excel preservado neste aparelho.');
      }else{
        data=null;
        logs=[];
        source('Nenhuma versão publicada nesta semana. Importe o Excel da aba Estaqueamento ou salve a semana atual.',true);
      }
    }else{
      data=result.dataset.model;
      logs=result.dataset.logs||[];
      $('base').value=data.base||today();
      draft=clone(data);
      persistDraft(data);
      source(`Semana ${$('week').value} • V${result.version_no} • ${data.file} • Data-base ${date(data.base)} • salva ${new Date(result.published_at).toLocaleString('pt-BR')}`);
    }
    filters();
    render();
    await history();
    log('Consulta da semana '+$('week').value);
  }catch(e){
    data=before||draft||null;
    if(data)$('base').value=data.base||today();
    filters();
    render();
    source('Falha ao consultar a nuvem: '+e.message+' • dados locais preservados.',true);
    log('Falha de consulta: '+e.message);
  }finally{
    busy=false;
    render();
  }
}
async function save(){if(!data||busy)return;busy=true;render();$('save').textContent='Salvando...';try{const week=weeks.find(w=>Number(w.week_no)===Number($('week').value));if(week?.is_locked)throw Error('Semana encerrada: disponível apenas para consulta. Selecione uma semana aberta.');data.base=$('base').value||today();const at=new Date().toISOString(),entry={at,message:'Salvamento da semana '+$('week').value};const saved=await CloudSync.rpc('publish_bi_snapshot',{p_dataset_type:type(),p_file_name:data.file,p_file_size:null,p_file_last_modified:null,p_data_base:data.base,p_schema_version:'estacas_v1',p_dataset:{schema_version:'estacas_v1',model:data,logs:[entry,...logs].slice(0,100),week_no:Number($('week').value)},p_pb_manual:{}});if(!Number(saved?.version_no))throw Error('O banco não confirmou a versão.');const check=await CloudSync.rpc('get_current_bi_snapshot',{p_dataset_type:type()});if(Number(check?.version_no)!==Number(saved.version_no))throw Error('Não foi possível confirmar a leitura da versão salva.');persistDraft(data);draft=clone(data);log(`Semana ${$('week').value} salva e conferida • V${saved.version_no}`);source(`Semana ${$('week').value} salva • V${saved.version_no} • ${data.file}`);await history();}catch(e){source('Falha ao salvar: '+e.message+' • o Excel importado foi preservado.',true);log('Falha de salvamento: '+e.message);}finally{busy=false;$('save').textContent='Salvar semana';render();}}
$('import').onclick=()=>$('file').click();$('file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const w=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});const parsed=parseWorkbook(w,f.name);data=parsed;draft=clone(parsed);persistDraft(parsed);page=0;logs=[];log(`Importação: ${f.name} • ${data.rows.length} estacas • ${data.ignored} linhas auxiliares ignoradas`);source(`${f.name} • ${data.rows.length} estacas • Excel importado, ainda não salvo`);$('draft').disabled=false;filters();render();}catch(error){source('Importação recusada: '+error.message,true);log(error.message);}finally{e.target.value='';}};
$('save').onclick=save;$('load').onclick=load;$('draft').onclick=()=>{data=clone(draft);$('base').value=data.base||today();filters();render();source('Excel preservado localmente • ainda não salvo nesta semana');};$('week').onchange=()=>{source('Semana alvo alterada. Clique em Consultar semana ou Salvar semana para gravar o arquivo atual.');$('history').textContent='Clique em Consultar semana para carregar o histórico.';};for(const id of ['unit','block','tag','status'])$(id).onchange=()=>{page=0;filters();render();};$('clear').onclick=()=>{for(const id of ['unit','block','tag','status'])$(id).value='';page=0;filters();render();};$('base').onchange=()=>{if(data){data.base=$('base').value;render();source('Data-base alterada • salve para publicar esta alteração.');}};$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('print').onclick=()=>window.print();
async function init(){
  $('base').value=today();
  draft=restoreDraft();
  if(draft){
    data=clone(draft);
    $('base').value=data.base||today();
    source('Último Excel recuperado deste aparelho • conferindo a semana publicada...');
  }
  const start=Date.parse('2026-03-29T00:00:00Z');
  weeks=Array.from({length:134},(_,i)=>{
    const a=new Date(start+i*7*86400000).toISOString().slice(0,10);
    const b=new Date(start+(i*7+6)*86400000).toISOString().slice(0,10);
    return {week_no:i+1,start_date:a,end_date:b,is_current:today()>=a&&today()<=b,is_locked:b<today()};
  });
  try{
    const remote=await CloudSync.listCoordinationWeeks();
    if(remote.length)weeks=remote;
  }catch(e){
    log('Calendário local EPC-15 em uso: '+e.message);
  }
  $('week').innerHTML=weeks.map(w=>`<option value="${Number(w.week_no)}">Semana ${Number(w.week_no)} • ${date(w.start_date)} – ${date(w.end_date)}${w.is_current?' • ATUAL':''}</option>`).join('');
  $('week').value=String(weeks.find(w=>w.is_current)?.week_no||1);
  filters();
  render();
  await load();
}
window.Estacas={parseWorkbook,numbers,iso,getData:()=>data};init();
})();
