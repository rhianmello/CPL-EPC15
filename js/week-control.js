(()=>{'use strict';
const $=id=>document.getElementById(id), sel=$('wh-week-select'),source=$('executive-week-filter');
if(!sel)return;
let seq=0,lastReport='',lastWeek=0;
const clean=v=>String(v==null?'':v);
const write=(id,val)=>{const x=$(id);if(x)x.textContent=clean(val)};
const elt=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=clean(txt);return e};
const fill=(id,nodes)=>{const parent=$(id);if(parent)parent.replaceChildren(...nodes)};
function options(){
 const old=sel.value; if(!source)return;
 sel.replaceChildren(...Array.from(source.options).filter(o=>o.value).map(o=>o.cloneNode(true)));
 if(!sel.options.length)sel.append(new Option('Selecione a semana',''));
 sel.value=[...sel.options].some(o=>o.value===old)?old:(source.value||sel.options[sel.options.length-1]?.value||'');
}
const label=(k,v)=>{const e=elt('div','audit-line'),a=elt('span','',k),b=elt('b','',v);e.append(a,b);return e};
const issue=(title,detail,severity='info')=>{const e=elt('div','audit-issue');e.dataset.severity=severity;e.append(elt('strong','',title),elt('p','',detail));return e};
const asSnapshot=r=>r?.snapshot||r?.week||r||{};
const noteRows=s=>s?.pb_manual?.coordinationNotes?.__manualHighlights||s?.pbManual?.coordinationNotes?.__manualHighlights||[];
const carry=s=>s?.pb_manual?.offenderCarryover?.rows||s?.pbManual?.offenderCarryover?.rows||[];
const date=v=>v?new Date(v).toLocaleString('pt-BR'):'Não informado';
async function refresh(){
 const token=++seq,week=Number(sel.value);lastWeek=week;
 write('wh-week-label',week?'S-'+week:'—');
 ['wh-events','wh-photos','wh-offenders','wh-physical'].forEach(id=>write(id,'—'));
 write('wh-status','Consultando');write('audit-updated','Consultando dados...');
 if(!week){write('wh-detail','Selecione uma semana.');return}
 try{
  if(!window.CloudSync?.ready?.())throw Error('Conexão Supabase indisponível');
  const previous=week>1?CloudSync.loadCoordinationWeek(week-1).catch(()=>null):Promise.resolve(null);
  const [cur,prev,photos,history,allPhotos]=await Promise.all([
    CloudSync.loadCoordinationWeek(week),
    previous,
    CloudSync.listCoordinationPhotos(week,'','').catch(()=>null),
    CloudSync.listCoordinationWeeks().catch(()=>[]),
    CloudSync.listCoordinationPhotoHistory('','','').catch(()=>null)
  ]);
  if(token!==seq)return;
  const snap=asSnapshot(cur),before=asSnapshot(prev),rows=noteRows(snap),earlier=noteRows(before),offenders=carry(snap);
  const file=snap.excel_file_name||snap.excelFileName||'';
  const physical=file&&!/^Destaques da semana/i.test(file)?'Excel salvo':'A confirmar';
  const count=Array.isArray(photos)?photos.length:null;
  const photosAll=Array.isArray(allPhotos)?allPhotos.filter(p=>Number(p.week_no||p.weekNo)===week):null;
  const effectivePhotos=photosAll?.length>count?photosAll:photos;
  const imgList=Array.isArray(effectivePhotos)?effectivePhotos:[];
  write('wh-events',Array.isArray(rows)?rows.length:'—');
  write('wh-photos',count==null?'Indisponível':count);
  write('wh-offenders',offenders.length||'0');
  write('wh-physical',physical);
  const status=$('wh-status');status.dataset.tone=physical==='Excel salvo'?'ok':'warning';
  write('wh-status',physical==='Excel salvo'?'Excel cadastrado':'Dados a conferir');
  write('wh-detail','Fonte: '+(file||'não informada')+'. Publicação física só é confirmada quando o Excel correspondente for salvo. Contagens de fotos e frentes são registros existentes, não confirmação de integridade dos arquivos.');
  const issues=[];
  if(!file||physical!=='Excel salvo')issues.push(issue('Base física não confirmada','Não tratar os indicadores físicos como atualização oficial desta semana.','attention'));
  if(!rows.length)issues.push(issue('Sem registros gerenciais','Não foram encontrados destaques ou notas manuais nesta versão.','attention'));
  const normalized=t=>[t.unit,t.event,t.phase,t.description].map(z=>clean(z).trim().toLowerCase().replace(/\s+/g,' ')).join('|');
  const seen=new Set();let dupe=0,short=0;
  for(const r of rows){const key=normalized(r);if(seen.has(key))dupe++;seen.add(key);if(clean(r.description).trim().length<14||/[-–—:]\s*$/.test(clean(r.description)))short++}
  if(dupe)issues.push(issue('Possíveis eventos duplicados',dupe+' lançamentos com mesma unidade, categoria, fase e descrição. Revise antes de corrigir.','attention'));
  if(short)issues.push(issue('Descrições a revisar',short+' eventos curtos ou terminados em pontuação de continuação.','attention'));
  if(offenders.length)issues.push(issue('Frentes ofensoras preservadas',offenders.length+' registros identificados; a presença não confirma revalidação na semana.','info'));
  if(!count)issues.push(issue('Fotos não confirmadas',count===0?'Nenhum registro fotográfico retornado para a semana.':'A consulta de fotos não foi concluída.','attention'));
  const captions=new Map();for(const p of imgList){const key=clean(p.unit_name||p.unitName)+'|'+clean(p.caption).toLowerCase();captions.set(key,(captions.get(key)||0)+1)}
  const sameCaptions=[...captions].filter(([k,n])=>n>1);
  if(sameCaptions.length)issues.push(issue('Legendas fotográficas repetidas',sameCaptions.length+' descrições se repetem; isso não prova que as imagens são duplicadas.','info'));
  if(!issues.some(i=>i.dataset.severity==='attention'))issues.unshift(issue('Sem alerta crítico nas verificações disponíveis','Conferências automatizadas básicas concluídas. Recomenda-se validação humana das informações.','ok'));
  fill('audit-issues',issues);
  const units=new Set(rows.map(x=>x.unit).filter(Boolean)),pastUnits=new Set(earlier.map(x=>x.unit).filter(Boolean));
  fill('audit-diff',[label('Semana de referência','S-'+(week-1)),label('Registros anteriores',earlier.length||'Não encontrados'),label('Registros atuais',rows.length),label('Diferença',earlier.length?((rows.length-earlier.length)>0?'+':'')+(rows.length-earlier.length):'Sem base comparável'),label('Unidades com registros',units.size),label('Unidades na semana anterior',pastUnits.size),elt('p','audit-dim','A comparação indica volumes de registros, não evolução física; isso depende dos Excel publicados.')]);
  const wk=Array.isArray(history)?history.filter(x=>Number(x.week_no??x.weekNo??x.week)===week):[];
  fill('audit-history',[label('Arquivo atual',file||'Não identificado'),label('Versão',snap.version_no||snap.versionNo||'Não informada'),label('Salvo em',date(snap.saved_at||snap.savedAt)),label('Responsável',snap.saved_by||snap.savedBy||'Não informado'),label('Versões listadas',wk.length||'Não disponível'),elt('p','audit-dim','Cada publicação pode gerar uma nova versão. O relatório não restaura dados nem modifica publicações.')]);
  const grouping=new Map();for(const p of imgList){const k=p.unit_name||p.unitName||'Sem unidade';grouping.set(k,(grouping.get(k)||0)+1)}
  fill('audit-images',[label('Total de fotos',count==null?'Consulta indisponível':count),...Array.from(grouping,([k,v])=>label(k,v)),elt('p','audit-dim',sameCaptions.length?sameCaptions.length+' grupos com legendas repetidas. Conferir visualmente antes de classificar como duplicidade.':'Legendas repetidas não identificadas na resposta disponível.')]);
  fill('audit-pending',[...issues.filter(x=>x.dataset.severity!=='ok').map(x=>{const e=elt('div','audit-line');e.append(elt('span','',x.querySelector('strong')?.textContent),elt('span','audit-tag',x.dataset.severity==='attention'?'REVISAR':'INFORMATIVO'));return e}),elt('p','audit-dim','Diagnósticos somente para consulta. Nenhuma ação automática de edição, exclusão ou correção.')]);
  const checks=[['Excel físico correspondente cadastrado',physical==='Excel salvo'],['Registros manuais encontrados',rows.length>0],['Consulta fotográfica concluída',count!==null],['Frentes ofensoras da semana anterior preservadas — '+offenders.length+' registros',offenders.length>0],['Revalidação operacional das frentes (não aferida automaticamente)',false],['Conferência humana da apresentação',false]];
  fill('audit-checklist',checks.map(([name,ok])=>{const e=elt('div','audit-check');e.append(elt('span','',ok?'✓':'○'),elt('span','',name));if(!ok)e.append(elt('em','','Pendente / não confirmado'));return e}));
  write('audit-updated','Auditoria consultada em '+new Date().toLocaleString('pt-BR'));
  lastReport=['CONTROLE SEMANAL — EPC-15','Semana S-'+week,'Arquivo: '+file,'Registros: '+rows.length,'Fotos: '+count,'Frentes preservadas: '+offenders.length,'','DIAGNÓSTICOS',...issues.map(x=>'- '+x.querySelector('strong').textContent+': '+x.querySelector('p').textContent),'','Somente relatório. Não foram alterados dados.'].join('\n');
 }catch(err){
  if(token!==seq)return;
  write('wh-status','Consulta indisponível');write('wh-detail',clean(err.message));
  fill('audit-issues',[issue('Falha na consulta','Nenhuma alteração realizada. '+clean(err.message),'attention')]);
  ['audit-diff','audit-history','audit-images','audit-pending','audit-checklist'].forEach(id=>fill(id,[elt('p','audit-dim','Dados indisponíveis nesta consulta.')]));
  write('audit-updated','Falha na consulta');
 }
}
options();
if(source)new MutationObserver(options).observe(source,{childList:true,subtree:true});
document.querySelector('[data-page="week-health"]')?.addEventListener('click',()=>{options();refresh()});
sel.addEventListener('change',refresh);
$('audit-refresh')?.addEventListener('click',refresh);
$('audit-export')?.addEventListener('click',()=>{if(!lastReport){alert('Execute a auditoria antes de exportar.');return}const a=document.createElement('a'),blob=new Blob([lastReport],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);a.href=url;a.download='Auditoria-EPC15-S'+lastWeek+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)});
setTimeout(()=>{if(document.getElementById('page-week-health')?.classList.contains('active'))refresh()},800);
})();