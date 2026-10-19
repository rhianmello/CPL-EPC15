(()=>{'use strict';
const $=id=>document.getElementById(id), sel=$('wh-week-select'),source=$('executive-week-filter');
if(!sel)return;
let seq=0,lastReport='',lastWeek=0,lastAudit=null;
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
 lastReport='';write('wh-status','Consultando');write('audit-updated','Consultando dados...');
 if(!week){write('wh-detail','Selecione uma semana.');return}
 try{
  if(!window.CloudSync?.ready?.())throw Error('Conexão Supabase indisponível');
  const previous=week>1?CloudSync.loadCoordinationWeek(week-1).catch(()=>null):Promise.resolve(null);
  const [cur,prev,photos,history,review,offenderReview,versions]=await Promise.all([
    CloudSync.loadCoordinationWeek(week),
    previous,
    CloudSync.listCoordinationPhotos(week,'','').then(data=>({ok:true,data})).catch(error=>({ok:false,error:String(error.message||error)})),
    CloudSync.listCoordinationWeeks().catch(()=>[]),
    CloudSync.getPresentationReview(week).then(data=>({ok:true,data})).catch(error=>({ok:false,error:String(error.message||error)})),
    CloudSync.getOffenderReview(week).then(data=>({ok:true,data})).catch(error=>({ok:false,error:String(error.message||error)})),
    CloudSync.listCoordinationVersionAudit(week).catch(()=>null)
  ]);
  if(token!==seq)return;
  const snap=asSnapshot(cur),before=asSnapshot(prev),rows=noteRows(snap),earlier=noteRows(before),offenders=carry(snap);
  const file=snap.excel_file_name||snap.excelFileName||'';
  const physical=file&&!/^Destaques da semana/i.test(file)?'Excel identificado':'Não verificado';
  const count=photos.ok&&Array.isArray(photos.data)?photos.data.length:null;
  const imgList=photos.ok&&Array.isArray(photos.data)?photos.data:[];
  write('wh-events',Array.isArray(rows)?rows.length:'—');
  write('wh-photos',count==null?'Indisponível':count);
  write('wh-offenders',offenders.length||'0');
  write('wh-physical',physical);
  const status=$('wh-status');status.dataset.tone=physical==='Excel identificado'?'warning':'warning';
  write('wh-status',physical==='Excel identificado'?'Arquivo identificado':'Dados a conferir');
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
  if(count===null)issues.push(issue('Fotos — consulta indisponível','Não foi possível consultar fotos: '+photos.error,'info'));else if(count===0)issues.push(issue('Fotos ausentes','Nenhum registro fotográfico retornado para a semana.','attention'));
  const captions=new Map();for(const p of imgList){const key=clean(p.unit_name||p.unitName)+'|'+clean(p.caption).toLowerCase();captions.set(key,(captions.get(key)||0)+1)}
  const sameCaptions=[...captions].filter(([k,n])=>n>1);
  if(sameCaptions.length)issues.push(issue('Legendas fotográficas repetidas',sameCaptions.length+' descrições se repetem; isso não prova que as imagens são duplicadas.','info'));
  if(!issues.some(i=>i.dataset.severity==='attention')&&photos.ok&&review.ok&&offenderReview.ok)issues.unshift(issue('Sem alertas nas verificações disponíveis','Conferências básicas executadas. Esta situação não equivale à aprovação completa.','ok'));
  fill('audit-issues',issues);
  const units=new Set(rows.map(x=>x.unit).filter(Boolean)),pastUnits=new Set(earlier.map(x=>x.unit).filter(Boolean));
  const hasPrevious=Boolean(prev?.snapshot?.dataset||prev?.snapshot?.pb_manual||prev?.pb_manual);
  const kinds=['Destaque','Pontos de Atenção','Próximas Ações'];
  const ofKind=(items,kind)=>items.filter(x=>String(x.event||'').toLowerCase()===kind.toLowerCase()).length;
  const delta=(now,old)=>(now-old>0?'+':'')+(now-old);
  const output=[label('Comparação','S-'+(week-1)+' → S-'+week)];
  for(const kind of kinds)output.push(label(kind,hasPrevious?ofKind(earlier,kind)+' → '+ofKind(rows,kind)+' ('+delta(ofKind(rows,kind),ofKind(earlier,kind))+')':'Semana anterior indisponível'));
  output.push(label('Eventos Gerenciais',hasPrevious?earlier.length+' → '+rows.length+' ('+delta(rows.length,earlier.length)+')':'Sem base de comparação'));
  output.push(label('Unidades com eventos',hasPrevious?pastUnits.size+' → '+units.size:units.size+' na semana atual'));
  const key=x=>[x.unit,x.event,x.phase,x.description].map(v=>String(v||'').trim().toLowerCase()).join('|');
  const build=items=>{const m=new Map();for(const x of items){const k=key(x);m.set(k,[...(m.get(k)||[]),x])}return m};
  const oldEvents=build(earlier),newEvents=build(rows),added=[],removed=[],kept=[];
  for(const [k,items] of newEvents){const old=oldEvents.get(k)||[];kept.push(...items.slice(0,old.length));added.push(...items.slice(old.length))}
  for(const [k,items] of oldEvents)removed.push(...items.slice((newEvents.get(k)||[]).length));
  const details=elt('details','audit-differences');
  details.append(elt('summary','','Ver diferenças: '+added.length+' novos, '+removed.length+' ausentes, '+kept.length+' mantidos'));
  for(const [name,items] of [['Novos',added],['Ausentes nesta semana',removed],['Mantidos',kept]]){
    const group=elt('div','audit-difference-group');group.append(elt('h4','',name+' ('+items.length+')'));
    for(const x of items)group.append(label((x.unit||'Unidade não informada')+' · '+(x.event||''),x.description||'Sem descrição'));
    details.append(group);
  }
  output.push(elt('p','audit-dim',hasPrevious?'Comparação textual: eventos com descrição alterada podem aparecer como novo e ausente. Ausência não significa conclusão da atividade.':'Semana anterior não disponível: eventos não podem ser classificados como novos ou ausentes.'),...(hasPrevious?[details]:[]));
  fill('audit-diff',output);
  const wk=Array.isArray(history)?history.filter(x=>Number(x.week_no??x.weekNo??x.week)===week):[];
  const versionNodes=[label('Arquivo atual',file||'Não identificado'),label('Versão',snap.version_no||snap.versionNo||'Não informada'),label('Salvo em',date(snap.saved_at||snap.savedAt)),label('Responsável',snap.saved_by||snap.savedBy||'Não informado'),label('Versões listadas',wk.length||'Não disponível'),elt('p','audit-dim','Comparação somente leitura; nenhuma versão será restaurada.')];
  if(Array.isArray(versions)&&versions.length){
    const box=elt('div','audit-versions');const left=elt('select'),right=elt('select');
    for(const v of versions){left.append(new Option('V'+v.version_no,v.version_no));right.append(new Option('V'+v.version_no,v.version_no))}
    right.value=String(versions.length>1?versions[1].version_no:versions[0].version_no);
    const result=elt('div','audit-version-result');
    const compare=()=>{const a=versions.find(v=>String(v.version_no)===left.value),b=versions.find(v=>String(v.version_no)===right.value);if(!a||!b)return;
      const signature=x=>[x.unit,x.event,x.phase,x.description].join('|').toLowerCase();
      const A=(a.events||[]).map(signature),B=(b.events||[]).map(signature);
      result.replaceChildren(label('Eventos por versão','V'+a.version_no+': '+A.length+' / V'+b.version_no+': '+B.length),label('Apenas na primeira',A.filter(x=>!B.includes(x)).length),label('Apenas na segunda',B.filter(x=>!A.includes(x)).length),elt('p','audit-dim','Comparação textual. Diferenças não indicam automaticamente erros.'));
    };
    left.onchange=compare;right.onchange=compare;box.append(elt('p','audit-dim','Comparar versões da mesma semana'),left,right,result);compare();versionNodes.push(box);
  }else versionNodes.push(elt('p','audit-dim','Histórico detalhado indisponível nesta consulta.'));
  fill('audit-history',versionNodes);
  const grouping=new Map();for(const p of imgList){const k=p.unit_name||p.unitName||'Sem unidade';grouping.set(k,(grouping.get(k)||0)+1)}
  const photoNodes=[label('Total de fotos',count==null?'Consulta indisponível':count),...Array.from(grouping,([k,v])=>label(k,v))];
  const gallery=elt('div','audit-photo-gallery');
  for(const p of imgList){
    const tile=elt('figure','audit-photo-tile'),img=elt('img'),cap=elt('figcaption','',((p.unit_name||'Unidade não informada')+' — '+(p.caption||'Sem legenda')));
    img.loading='lazy';img.decoding='async';img.alt=cap.textContent;img.src=p.signed_url||'';
    img.onerror=()=>{tile.classList.add('audit-photo-error');cap.textContent='Imagem indisponível — '+cap.textContent};
    tile.append(img,cap);gallery.append(tile);
  }
  photoNodes.push(gallery,elt('p','audit-dim','Miniaturas somente para conferência. Fotos com legendas iguais podem representar registros distintos.'));
  fill('audit-images',photoNodes);
  fill('audit-pending',[...issues.filter(x=>x.dataset.severity!=='ok').map(x=>{const e=elt('div','audit-line');e.append(elt('span','',x.querySelector('strong')?.textContent),elt('span','audit-tag',x.dataset.severity==='attention'?'REVISAR':'INFORMATIVO'));return e}),elt('p','audit-dim','Diagnósticos somente para consulta. Nenhuma ação automática de edição, exclusão ou correção.')]);
  const reviewed=Boolean(review.ok&&review.data&&Number(review.data.version_no)===Number(snap.version_no));
  const reviewPanel=elt('div','audit-issue');
  reviewPanel.dataset.severity=reviewed?'ok':'attention';
  reviewPanel.append(elt('strong','',reviewed?'Apresentação conferida':'Conferência humana da apresentação pendente'),elt('p','',reviewed?'Responsável: '+review.data.reviewer+' · '+date(review.data.reviewed_at)+' · Versão '+review.data.version_no:'Confira o PDF e confirme manualmente. Uma nova versão exige nova revisão.'));
  if(!reviewed&&review.ok){
    const confirmButton=elt('button','','Marcar apresentação como conferida');
    confirmButton.type='button';confirmButton.style.cssText='padding:10px;background:#146180;color:white;border:1px solid #58bfe2;border-radius:8px;cursor:pointer';
    confirmButton.onclick=async()=>{
      const reviewer=prompt('Nome do responsável que conferiu o PDF:');if(!reviewer||reviewer.trim().length<2)return;
      const master=prompt('Senha master para confirmar a conferência:');if(!master)return;
      if(!confirm('Confirmar a revisão da apresentação da S-'+week+', versão '+snap.version_no+'?'))return;
      try{await CloudSync.confirmPresentationReview({weekNo:week,versionNo:snap.version_no,reviewer:reviewer.trim(),masterPassword:master});alert('Conferência registrada.');refresh()}
      catch(err){alert('Não foi possível confirmar: '+err.message)}
    };
    reviewPanel.append(confirmButton);
  }
  const offendersReviewed=Boolean(offenderReview.ok&&offenderReview.data&&Number(offenderReview.data.version_no)===Number(snap.version_no));
  const offenderPanel=elt('div','audit-issue');
  offenderPanel.dataset.severity=offendersReviewed?'ok':'attention';
  offenderPanel.append(
    elt('strong','',offendersReviewed?'Frentes ofensoras revalidadas':'Revalidação operacional das frentes pendente'),
    elt('p','',offendersReviewed?'Responsável: '+offenderReview.data.reviewer+' · '+date(offenderReview.data.reviewed_at)+' · Versão '+offenderReview.data.version_no:'Confirme somente após verificar operacionalmente as frentes. A confirmação não altera seus registros.')
  );
  if(!offendersReviewed&&offenderReview.ok){
    const btn=elt('button','','Confirmar frentes ofensoras');
    btn.type='button';
    btn.style.cssText='padding:10px;background:#146180;color:white;border:1px solid #58bfe2;border-radius:8px;cursor:pointer';
    btn.onclick=async()=>{
      const reviewer=prompt('Nome do responsável que revalidou as frentes ofensoras:');
      if(!reviewer||reviewer.trim().length<2)return;
      const master=prompt('Senha master para confirmar a revalidação:');if(!master)return;
      if(!confirm('Você confirma que as frentes ofensoras da S-'+week+', versão '+snap.version_no+', foram verificadas operacionalmente?'))return;
      try{
        await CloudSync.confirmOffenderReview({weekNo:week,versionNo:snap.version_no,reviewer:reviewer.trim(),masterPassword:master});
        alert('Revalidação operacional registrada.');refresh();
      }catch(err){alert('Não foi possível registrar: '+err.message)}
    };
    offenderPanel.append(btn);
  }
  if(!review.ok)reviewPanel.append(elt('p','audit-dim','Consulta da validação indisponível: '+review.error));
  if(!offenderReview.ok)offenderPanel.append(elt('p','audit-dim','Consulta da revalidação indisponível: '+offenderReview.error));
  const checks=[['Base física da S-'+week+' — '+(physical==='Excel identificado'?'Excel identificado; valores ainda não auditados':'Aguardando publicação do Excel atualizado'),physical==='Excel identificado'?null:false],['Registros manuais encontrados',rows.length>0],['Consulta fotográfica concluída',photos.ok],['Frentes ofensoras da semana anterior preservadas — '+offenders.length+' registros',offenders.length>0],['Revalidação operacional das frentes',offenderReview.ok?offendersReviewed:null],['Conferência humana da apresentação',review.ok?Boolean(reviewed):null]];
  fill('audit-checklist',[...checks.map(([name,ok])=>{const e=elt('div','audit-check');e.append(elt('span','',ok===null?'?':ok?'✓':'○'),elt('span','',name));if(ok!==true)e.append(elt('em','',ok===null?'Não verificado — consulta indisponível':'Pendente / não confirmado'));return e}),offenderPanel,reviewPanel]);
  write('audit-updated','Auditoria consultada em '+new Date().toLocaleString('pt-BR'));
  lastAudit={week,rows,photos:imgList,offenders:offenders.length,issues:issues.map(x=>({title:x.querySelector('strong').textContent,description:x.querySelector('p').textContent})),file,reviewed,offendersReviewed};
  lastReport=['CONTROLE SEMANAL — EPC-15','Semana S-'+week,'Arquivo: '+file,'Registros: '+rows.length,'Fotos: '+count,'Frentes preservadas: '+offenders.length,'','DIAGNÓSTICOS',...issues.map(x=>'- '+x.querySelector('strong').textContent+': '+x.querySelector('p').textContent),'','Somente relatório. Não foram alterados dados.'].join('\n');
 }catch(err){
  if(token!==seq)return;
  write('wh-status','Consulta indisponível');write('wh-detail',clean(err.message));
  fill('audit-issues',[issue('Falha na consulta','Nenhuma alteração realizada. '+clean(err.message),'attention')]);
  ['audit-diff','audit-history','audit-images','audit-pending','audit-checklist'].forEach(id=>fill(id,[elt('p','audit-dim','Dados indisponíveis nesta consulta.')]));
  lastReport='';lastAudit=null;write('audit-updated','Falha na consulta');
 }
}
options();
if(source)new MutationObserver(options).observe(source,{childList:true,subtree:true});
document.querySelector('[data-page="week-health"]')?.addEventListener('click',()=>{options();refresh()});
sel.addEventListener('change',refresh);
$('audit-refresh')?.addEventListener('click',refresh);
$('audit-export')?.addEventListener('click',()=>{if(!lastReport){alert('Execute a auditoria antes de exportar.');return}const PDF=window.jspdf?.jsPDF;if(!PDF){alert('Gerador PDF indisponível.');return}const doc=new PDF();doc.setFontSize(17);doc.text('Auditoria interna EPC-15 — S-'+lastWeek,14,18);doc.setFontSize(10);const lines=doc.splitTextToSize(lastReport,175);let y=28;for(const line of lines){if(y>277){doc.addPage();y=18}doc.text(line,14,y);y+=6}doc.save('Auditoria-EPC15-S'+lastWeek+'.pdf')});
setTimeout(()=>{if(document.getElementById('page-week-health')?.classList.contains('active'))refresh()},800);
})();