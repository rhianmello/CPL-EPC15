(function () {
  'use strict';
  const core = window.FleetCore;
  const api = window.FleetAPI;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const esc = core.escape;
  const fmt = core.formatDate;
  const norm = core.norm;
  const types = ['Veículo','Equipamento'];
  const operational = ['Disponível','Em operação','Em manutenção','Indisponível','Reserva','Fora do contrato'];
  const inspectionTypes = ['Diária','Semanal','Mensal','Segurança','Operacional','Petrobras','Interna CPL','Outras'];
  const maintenanceCategories = ['Preventiva','Corretiva','Revisão','Pneus','Óleo','Filtros','Freios','Elétrica','Mecânica','Documentação','Outros'];
  const documentTypes = ['CRLV','Licenciamento','Seguro','PTRAN','Certificado','Inspeção','Documentação de máquina','Documento Petrobras','Outros'];
  const movements = ['entrada','saída','troca de responsável','troca de gerência','indisponibilidade','retorno à operação','mudança de frente','mudança de contrato','veículo reserva','outros'];
  const colors = {green:'#2dd4bf',yellow:'#f5b72e',red:'#fb7185',gray:'#708aa6',cyan:'#38bdf8',blue:'#60a5fa',purple:'#a78bfa'};
  const state = {assets:[],filtered:[],loaded:false,connected:false,loading:false,filters:{},page:0,pageSize:25,view:'dashboard',charts:{},detail:null,drawerTab:'resumo',quality:[],alerts:[],history:[],historyTotal:0,historyFilters:{},historyLoading:false,historyLoaded:false,import:null,importFile:null,importBatch:null,lastFocus:null,confirmResolve:null,modalClose:null};
  const fields = {
    asset_code:'Código do ativo',placa_identificador:'Placa / identificador',tipo:'Tipo',categoria:'Categoria',modelo:'Modelo',marca:'Marca',ano:'Ano',cor:'Cor',empresa:'Empresa',gerencia:'Gerência',responsavel_cpl:'Responsável CPL',status_operacional:'Status operacional',ativo_no_contrato:'Ativo no contrato',data_entrada:'Entrada no contrato',data_saida:'Saída do contrato',observacao_atual:'Observação',quilometragem:'Quilometragem',horimetro:'Horímetro',numero_ptran:'Número PTRAN',numero_isc:'Número ISC',data_recebimento:'Recebimento',data_solicitacao:'Solicitação',data_emissao:'Emissão',data_validade:'Validade',status:'Status',tipo_ptran:'Tipo PTRAN',provisoria:'Provisória',observacao:'Observação',responsavel:'Responsável',tipo_inspecao:'Tipo de inspeção',data_inspecao:'Data da inspeção',validade:'Validade',proxima_inspecao:'Próxima inspeção',inspetor:'Inspetor',resultado:'Resultado',anexo_url:'Anexo',data_abertura:'Abertura',data_execucao:'Execução',proxima_revisao_data:'Próxima revisão',km_atual:'KM atual',proxima_revisao_km:'Próxima revisão • KM',horimetro_atual:'Horímetro atual',proxima_revisao_horas:'Próxima revisão • horas',oficina_fornecedor:'Oficina / fornecedor',numero_os:'Ordem de serviço',descricao:'Descrição',valor:'Valor (R$)',tipo_documento:'Tipo de documento',numero_documento:'Número do documento',emissao:'Emissão',arquivo_url:'Arquivo',tipo_movimento:'Movimentação',data:'Data e hora',origem:'Origem',destino:'Destino',responsavel_anterior:'Responsável anterior',responsavel_novo:'Novo responsável'
  };
  const kindNames = {ptrans:'PTRAN',inspections:'Inspeções',maintenance:'Manutenção',documents:'Documentos',movements:'Movimentações',assets:'Ativo'};
  const icon = name => '<i data-lucide="' + name + '"></i>';
  function icons() { window.lucide?.createIcons(); }
  function badge(label,tone='gray') { return '<span class="fleet-badge" data-tone="' + esc(tone) + '">' + esc(label || 'Não informado') + '</span>'; }
  function assetLabel(asset) { return [asset?.modelo || 'Ativo',asset?.placa_identificador || asset?.asset_code || 'Sem identificação'].join(' • '); }
  function vehicleThumb(asset) {
    const model=norm(asset?.modelo || '');
    const descriptor=norm([asset?.tipo,asset?.categoria,asset?.modelo,asset?.marca].filter(Boolean).join(' '));
    if(/actros/.test(model)) return 'assets/frota/mercedes-actros.svg';
    if(/volvo.*fh|fh\s*540|fh540/.test(model)) return 'assets/frota/volvo-fh-540.svg';
    if(/iveco.*daily|daily/.test(model)) return 'assets/frota/iveco-daily.svg';
    if(/constellation/.test(model)) return 'assets/frota/vw-constellation.svg';
    if(/sprinter/.test(model)) return 'assets/frota/sprinter-416.svg';
    if(/van|furgao|furgão|minibus|microonibus|micro-?onibus|utilitario|utilitário/.test(descriptor)) return 'assets/frota/default-van.svg';
    if(/munck|guind|retro|escav|empilh|trator|maquina|máquina|equipamento/.test(descriptor)) return 'assets/frota/default-equipment.svg';
    return 'assets/frota/default-truck.svg';
  }
  function latest(asset,kind) { return core.newest(asset?.[kind] || []); }
  function number(value) { return Number(value || 0).toLocaleString('pt-BR'); }
  function fieldLabel(field) { const clean=String(field || '').replace(/^PTRAN\./,''); return (String(field || '').startsWith('PTRAN.')?'PTRAN • ':'')+(fields[clean] || clean || 'Registro'); }
  function display(value) { if (value === false) return 'Não'; if (value === true) return 'Sim'; if (value == null || value === '') return '—'; if (typeof value === 'object') return JSON.stringify(value); return String(value); }
  function safeURL(value) { try { const url=new URL(String(value)); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; } }
  function errorMessage(error) { return error?.message || String(error || 'Não foi possível concluir a ação.'); }
  function editing() { return api.isEditing(); }
  function toast(message,tone='green') {
    const element=document.createElement('div'); element.className='fleet-toast'; element.dataset.tone=tone;
    element.innerHTML=icon(tone==='red'?'circle-alert':tone==='yellow'?'triangle-alert':'circle-check')+'<span>'+esc(message)+'</span><button type="button" aria-label="Fechar notificação">×</button>';
    $('#fleet-toasts').append(element); $('button',element).onclick=()=>element.remove(); icons(); setTimeout(()=>element.remove(),tone==='red'?12000:6500);
  }
  function notice(message,tone='error') {
    const el=$('#page-notice'); el.classList.toggle('hidden',!message); el.dataset.tone=tone;
    el.innerHTML=message?'<div>'+message+'</div><button class="fleet-button" id="notice-refresh">'+icon('refresh-cw')+' Atualizar banco</button>':'';
    const retry=$('#notice-refresh'); if(retry)retry.onclick=loadAssets; icons();
  }
  function empty(title,text,actions='',emptyIcon='inbox') { return icon(emptyIcon)+'<h3>'+esc(title)+'</h3><p>'+esc(text)+'</p>'+(actions?'<div class="fleet-empty-actions">'+actions+'</div>':''); }
  function setConnection(status) {
    $('#connection-status').dataset.status=status;
    $('#connection-status').innerHTML='<span class="fleet-dot"></span>'+({loading:'Consultando banco',online:'Banco online',offline:'Banco indisponível'}[status]);
  }
  async function loadAssets() {
    if(state.loading)return;
    state.loading=true; $('#refresh-button').disabled=true; setConnection('loading');
    if(!state.loaded)renderDashboard();
    try {
      const assets=[]; let offset=0, total=0, updated=null,pendingImport=null;
      do {
        const result=await api.listAssets({offset,limit:250});
        const chunk=Array.isArray(result?.assets)?result.assets:[];
        assets.push(...chunk); total=Number(result?.total ?? assets.length); updated=result?.updated_at || updated;pendingImport=result?.pending_import||pendingImport;
        if(!chunk.length && assets.length<total)throw new Error('A consulta foi interrompida antes de carregar todos os ativos. Atualize para tentar novamente.');
        offset+=chunk.length;
      } while(offset<total);
      state.assets=assets; state.loaded=true; state.connected=true; state.lastUpdate=updated;state.pendingDraft=pendingImport;
      $('#pending-import-button').classList.toggle('hidden',!pendingImport);
      $('#pending-import-button').innerHTML=icon('clipboard-list')+' Revisar carga inicial'+(pendingImport?' • '+number(pendingImport.row_count)+' registros':'');
      state.historyLoaded=false; state.page=0;
      $('#last-update').textContent='Última atualização: '+fmt(updated,true);
      notice(''); setConnection('online'); populateFilters(); recalculate();
      if(state.view==='history')loadHistory();
    } catch(error) {
      state.connected=false; setConnection('offline');
      notice('<strong>'+esc(errorMessage(error))+'</strong><br>'+(state.loaded?'A visão exibida conserva os dados da última consulta. A atualização não foi concluída.':'Os indicadores serão preenchidos após uma consulta válida ao banco. A importação permite conferir o Excel antes da publicação.'));
      renderDashboard(); renderAlerts(); renderQuality();
    } finally { state.loading=false; $('#refresh-button').disabled=false;renderTable();if(state.import&&$('#import-publish'))updateImportFooter();icons(); }
  }
  function populateSelect(selector,values,firstLabel) {
    const element=$(selector); if(!element)return;
    const value=element.value;
    const distinct=[...new Set(values.filter(v=>v!=null && String(v).trim()!=='').map(String))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    element.innerHTML='<option value="">'+esc(firstLabel)+'</option>'+distinct.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
    element.value=distinct.includes(value)?value:'';
  }
  function populateFilters() {
    ['tipo','categoria','modelo','responsavel_cpl','gerencia','empresa','status_operacional'].forEach(key=>{
      const select=$('select[data-filter="'+key+'"]'); const label=select.options[0].text;
      populateSelect('select[data-filter="'+key+'"]',state.assets.map(a=>a[key]),label);
    });
    populateSelect('select[data-filter="ptran_status"]',[...core.PTRAN_STATUSES,...state.assets.map(a=>latest(a,'ptrans')?.status)],'Todos os status');
    const selected=$('#history-asset').value;
    $('#history-asset').innerHTML='<option value="">Todos os ativos</option>'+state.assets.map(a=>'<option value="'+esc(a.id)+'">'+esc(assetLabel(a))+'</option>').join('');
    $('#history-asset').value=selected;
  }
  function readFilters() {
    const filters={}; $$('[data-filter]').forEach(el=>{ filters[el.dataset.filter]=el.type==='checkbox'?el.checked:el.value; });
    state.filters=filters; state.page=0; recalculate();
  }
  function setFilter(key,value) {
    const el=$('[data-filter="'+key+'"]'); if(!el)return;
    if(el.type==='checkbox')el.checked=Boolean(value); else el.value=value == null ? '' : String(value);
    readFilters();
  }
  function clearFilters() {
    $$('[data-filter]').forEach(el=>el.type==='checkbox'?el.checked=false:el.value='');
    readFilters();
  }
  function revealAnalytics() {
    const wrap=$('#fleet-secondary-analytics'),button=$('#analytics-toggle');
    if(!wrap)return;
    wrap.classList.remove('hidden');
    if(button){button.setAttribute('aria-expanded','true');button.innerHTML=icon('chart-no-axes-combined')+' Ocultar análises detalhadas '+icon('chevron-up');}
    requestAnimationFrame(()=>Object.values(state.charts).forEach(c=>c.resize()));
    icons();
  }
  function focusDashboard(area) {
    showView('dashboard');
    $$('.fleet-sidebar .fleet-subnav').forEach(btn=>btn.classList.remove('active'));
    const nav=$('.fleet-sidebar [data-focus="'+area+'"]'); if(nav)nav.classList.add('active');
    let targetId='fleet-assets-panel';
    if(area==='maintenance'){revealAnalytics();targetId=$('#maintenance-panel')&&!$('#maintenance-panel').classList.contains('hidden')?'maintenance-panel':'expiry-panel';}
    if(area==='documents'){revealAnalytics();targetId='document-panel';}
    requestAnimationFrame(()=>document.getElementById(targetId)?.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  function recalculate() {
    state.filtered=core.filterAssets(state.assets,state.filters);
    state.quality=core.quality(state.assets);
    state.alerts=state.assets.flatMap(a=>core.situation(a).alerts.map(alert=>({...alert,asset:a}))).sort((a,b)=>({red:0,yellow:1}[a.tone]-{red:0,yellow:1}[b.tone]) || (a.days??999)-(b.days??999));
    const count=Object.values(state.filters).filter(Boolean).length;
    $('#active-filter-count').textContent=count;
    ['nav-alert-count','tab-alert-count'].forEach(id=>$('#'+id).textContent=state.loaded?number(state.alerts.length):'—');
    ['nav-quality-count','tab-quality-count'].forEach(id=>$('#'+id).textContent=state.loaded?number(state.quality.length):'—');
    renderDashboard(); renderAlerts(); renderQuality(); updateEditing();
  }
  function renderDashboard() {
    const assets=state.filtered, metrics=core.metrics(assets);
    $('#filter-result').textContent=state.loaded?number(assets.length)+' de '+number(state.assets.length)+' ativos na visão':'Aguardando dados do banco';
    const alertAssets=assets.filter(a=>['yellow','red'].includes(core.situation(a).tone)).length;
    const ptranAttention=assets.filter(a=>{const p=latest(a,'ptrans');if(!p||norm(p.status)==='cancelado')return false;const d=core.daysUntil(p.data_validade);return norm(p.status)==='vencido'||(d!==null&&d<=30);}).length;
    const maintenanceAttention=assets.filter(a=>core.situation(a).alerts.some(x=>x.type==='Revisão')).length;
    const specs=[['total','Frota Total','truck','cyan','Ativos cadastrados','all'],['available','Operacionais','circle-check-big','green','Disponível, em operação ou reserva','operational'],['alerts','Em Alerta','triangle-alert','yellow','Ativos com pendências','alerts'],['ptran','PTRAN em atenção','file-warning','red','Vencidos ou em até 30 dias','documents'],['maintenance','Revisões pendentes','wrench','purple','Revisões vencidas ou próximas','maintenance']];
    const values={total:assets.length,available:metrics.available,alerts:alertAssets,ptran:ptranAttention,maintenance:maintenanceAttention};
    $('#fleet-kpis').innerHTML=specs.map(([key,label,ico,tone,sub,action])=>'<button type="button" class="fleet-kpi" data-tone="'+tone+'" data-kpi-action="'+action+'"><div class="fleet-kpi-label">'+esc(label)+icon(ico)+'</div><strong class="fleet-kpi-value fleet-number">'+(state.loaded?number(values[key]):'—')+'</strong><div class="fleet-kpi-sub">'+esc(sub)+'</div></button>').join('');
    renderCharts(assets,metrics); renderTable(); renderAlertPreview(); icons();
  }
  function chart(id,config,hasData,emptyId) {
    if(emptyId)$('#'+emptyId).classList.toggle('hidden',Boolean(hasData));
    if(!window.Chart)return;
    if(state.charts[id]){state.charts[id].destroy();delete state.charts[id];}
    if(hasData)state.charts[id]=new Chart($('#'+id),config);
  }
  function chartOptions(horizontal=false) {
    return {responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#10263b',titleColor:'#d9f4ff',bodyColor:'#9dc4df',borderColor:'#284760',borderWidth:1,padding:10}},scales:{x:{grid:{color:horizontal?'rgba(93,134,168,.09)':'transparent',drawBorder:false},ticks:{color:'#638dac',font:{size:9},precision:0},border:{display:false}},y:{grid:{color:horizontal?'transparent':'rgba(93,134,168,.09)',drawBorder:false},ticks:{color:'#88acc5',font:{size:9},precision:0},border:{display:false},beginAtZero:true}},...(horizontal?{indexAxis:'y'}:{})};
  }
  function grouped(values) { const map=new Map();values.forEach(v=>map.set(v,(map.get(v)||0)+1));return [...map].sort((a,b)=>b[1]-a[1]); }
  function dateEntries(assets) {
    return assets.flatMap(a=>[...(latest(a,'ptrans')?[{kind:'PTRAN',date:latest(a,'ptrans').data_validade}]:[]),...core.latestByType(a.inspections||[],'tipo_inspecao').map(r=>({kind:'Inspeção',date:r.validade || r.proxima_inspecao})),...core.latestByType(a.maintenance||[],'categoria').filter(r=>norm(r.status)!=='cancelado').map(r=>({kind:'Revisão',date:r.proxima_revisao_data})),...core.latestByType(a.documents||[],'tipo_documento').map(r=>({kind:'Documento',date:r.validade}))]);
  }
  function renderCharts(assets,metrics) {
    const tones=['green','yellow','red','gray'], names=['Regular','Atenção','Crítico','Inativo'];
    const counts=tones.map(tone=>assets.filter(a=>core.situation(a).tone===tone).length);
    $('#situation-legend').innerHTML=tones.map((tone,i)=>'<button type="button" class="fleet-legend-row" data-situation-filter="'+tone+'" style="--tone-color:'+colors[tone]+'"><i></i><span>'+names[i]+'</span><b>'+ (state.loaded?number(counts[i]):'—')+' <small>'+(assets.length?Math.round(counts[i]/assets.length*100)+'%':'')+'</small></b></button>').join('');
    $('#situation-center').innerHTML='<strong>'+ (state.loaded?number(assets.length):'—')+'</strong><span>ativos</span>';
    $('#situation-center').classList.toggle('hidden',!assets.length);
    $('#situation-empty').textContent=state.loaded?'Nenhum ativo nesta visão':'Aguardando dados do banco';
    chart('situation-chart',{type:'doughnut',data:{labels:names,datasets:[{data:counts,backgroundColor:tones.map(t=>colors[t]),borderWidth:0,hoverOffset:4,borderRadius:3,spacing:3}]},options:{responsive:true,maintainAspectRatio:false,cutout:'76%',animation:false,onClick:(_,elements)=>{if(elements?.length)setFilter('situation',tones[elements[0].index]);},plugins:{legend:{display:false},tooltip:{backgroundColor:'#10263b',bodyColor:'#c0e0f1',titleColor:'#e0f6ff'}}}},assets.length,'situation-empty');
    const ptrans=grouped(assets.map(a=>latest(a,'ptrans')).filter(Boolean).map(p=>p.status||'Não informado'));
    const pOptions=chartOptions(true);pOptions.onClick=(_,elements)=>{if(elements?.length)setFilter('ptran_status',ptrans[elements[0].index]?.[0]||'');};
    chart('ptran-chart',{type:'bar',data:{labels:ptrans.map(p=>p[0]),datasets:[{data:ptrans.map(p=>p[1]),backgroundColor:ptrans.map(([status])=>statusTone(status)==='gray'?colors.gray:colors[statusTone(status)]),borderRadius:5,barThickness:14}]},options:pOptions},ptrans.length,'ptran-empty');
    const docRecords=assets.flatMap(a=>core.latestByType(a.documents||[],'tipo_documento'));
    const docExpired=docRecords.filter(r=>core.daysUntil(r.validade)!=null && core.daysUntil(r.validade)<0).length;
    $('#document-overview').innerHTML=docRecords.length?'<div><b>'+number(docRecords.length)+'</b>Documentos atuais</div><div><b>'+number(docExpired)+'</b>Vencidos</div><div><b>'+number(docRecords.filter(r=>{const d=core.daysUntil(r.validade);return d!==null&&d>=0&&d<=30;}).length)+'</b>Até 30 dias</div>':'<div><b>—</b>Documentação ainda não cadastrada</div>';
    const categories=grouped(assets.map(a=>a.categoria || 'Sem categoria'));
    const categoryOptions=chartOptions(true);categoryOptions.onClick=(_,elements)=>{if(elements?.length){const value=categories[elements[0].index]?.[0];if(value&&value!=='Sem categoria')setFilter('categoria',value);}};
    chart('category-chart',{type:'bar',data:{labels:categories.map(c=>c[0]),datasets:[{data:categories.map(c=>c[1]),backgroundColor:'#38bdf8',borderRadius:5,barThickness:14}]},options:categoryOptions},categories.length,'category-empty');
    const entries=dateEntries(assets).map(e=>({...e,days:core.daysUntil(e.date)})).filter(e=>e.days!==null&&e.days>=0&&e.days<=90);
    const expiryKinds=['PTRAN','Inspeção','Revisão','Documento'];
    const expiryOptions=chartOptions();expiryOptions.plugins={...expiryOptions.plugins,legend:{display:true,position:'bottom',labels:{color:'#7897b2',boxWidth:8,boxHeight:8,font:{size:9},padding:13}}};expiryOptions.onClick=(_,elements)=>{if(!elements?.length)return;setFilter('expiry',[30,60,90][elements[0].index]);};
    chart('expiry-chart',{type:'bar',data:{labels:['0–30 dias','31–60 dias','61–90 dias'],datasets:expiryKinds.map((kind,index)=>({label:kind,data:[entries.filter(e=>e.kind===kind&&e.days<=30).length,entries.filter(e=>e.kind===kind&&e.days>30&&e.days<=60).length,entries.filter(e=>e.kind===kind&&e.days>60).length],backgroundColor:['#fb7185','#38bdf8','#f5b72e','#2dd4bf'][index],borderRadius:5,maxBarThickness:28}))},options:expiryOptions},entries.length,'expiry-empty');
    const maintenance=assets.flatMap(a=>core.currentRecords(a.maintenance||[])).filter(r=>r.data_execucao && norm(r.status)!=='cancelado');
    $('#maintenance-panel').classList.toggle('hidden',!maintenance.length);
    const months=grouped(maintenance.map(r=>r.data_execucao.slice(0,7))).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
    chart('maintenance-chart',{type:'bar',data:{labels:months.map(([m])=>new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z'))),datasets:[{data:months.map(m=>m[1]),backgroundColor:'#2dd4bf',borderRadius:5,maxBarThickness:24}]},options:chartOptions()},months.length);
    const active=assets.filter(a=>a.ativo_no_contrato===true), informed=active.filter(a=>a.status_operacional);
    $('#availability-panel').classList.toggle('hidden',!informed.length);
    const percent=informed.length?Math.round(metrics.available/informed.length*100):0;
    $('#availability-content').innerHTML='<strong>'+percent+'<span style="font-size:25px">%</span></strong><p>'+number(metrics.available)+' disponíveis entre '+number(informed.length)+' ativos com situação informada</p><div class="fleet-progress-track"><span style="width:'+percent+'%"></span></div><small>'+number(active.length-informed.length)+' ativo(s) sem situação operacional. A disponibilidade considera Disponível, Em operação e Reserva.</small>';
  }
  function statusTone(status) {
    const value=norm(status);
    if(['cancelado','inativo','fora do contrato'].includes(value))return 'gray';
    if(['vencido','reprovado','indisponivel','em manutencao','critico'].includes(value))return 'red';
    if(['pronto','aprovado','regular','valido','concluido','disponivel','em operacao'].includes(value))return 'green';
    return 'yellow';
  }
  function dateTone(value) { const days=core.daysUntil(value); return days===null?'gray':days<0?'red':days<=30?'yellow':'green'; }
  function summaryDate(records,key,dateField) {
    const candidates=core.latestByType(records||[],key).filter(r=>r[dateField]);
    return candidates.sort((a,b)=>String(a[dateField]).localeCompare(String(b[dateField])))[0]?.[dateField] || null;
  }
  function renderTable() {
    const assets=state.filtered;
    $('#table-count').textContent=state.loaded?number(assets.length):'—';
    $('#fleet-table-empty').classList.toggle('hidden',assets.length>0);
    $('#fleet-table-wrap').classList.toggle('hidden',!assets.length);
    if(!assets.length) {
      let title='Consultando a frota',text='A fonte oficial deste painel é o banco de dados.',ico='database';
      if(!state.connected&&!state.loading){title='Banco de dados indisponível';text='Atualize a consulta após configurar ou restabelecer a conexão do módulo.';ico='cloud-off';}
      if(state.loaded){title=state.assets.length?'Nenhum ativo nesta visão':'Nenhum ativo cadastrado';text=state.assets.length?'Ajuste a busca ou limpe os filtros para visualizar a frota.':'Cadastre o primeiro ativo ou confira sua planilha pelo botão Importar Excel.';ico=state.assets.length?'search-x':'truck';}
      if(state.loaded&&!state.assets.length&&state.pendingDraft)text='A carga inicial contém '+number(state.pendingDraft.row_count)+' registros aguardando conferência linha a linha.';
      const actions=state.loaded&&!state.assets.length?(state.pendingDraft?'<button class="fleet-button primary" data-action="pending-import">'+icon('clipboard-list')+' Revisar carga inicial</button>':editing()?'<button class="fleet-button primary" data-action="new-asset">'+icon('plus')+' Cadastrar primeiro ativo</button><button class="fleet-button" data-action="import">'+icon('file-spreadsheet')+' Importar Excel</button>':''):'';
      $('#fleet-table-empty').innerHTML=empty(title,text,actions,ico);
    }
    const pages=Math.max(1,Math.ceil(assets.length/state.pageSize));state.page=Math.min(state.page,pages-1);
    const start=state.page*state.pageSize;
    $('#fleet-table-body').innerHTML=assets.slice(start,start+state.pageSize).map(a=>{
      const situation=core.situation(a),p=latest(a,'ptrans');
      const inspection=summaryDate(a.inspections,'tipo_inspecao','validade') || summaryDate(a.inspections,'tipo_inspecao','proxima_inspecao');
      const revision=summaryDate(a.maintenance,'categoria','proxima_revisao_data');
      const mileage=a.quilometragem!=null&&a.quilometragem!==''?number(a.quilometragem)+' km':a.horimetro!=null&&a.horimetro!==''?number(a.horimetro)+' h':'—';
      const ptranLabel=p?.data_validade?fmt(p.data_validade):(p?.status||'Não cadastrado');
      const ptranTone=p?.data_validade?dateTone(p.data_validade):(p?statusTone(p.status):'gray');
      return '<tr data-asset="'+esc(a.id)+'" tabindex="0" aria-label="Abrir ficha de '+esc(assetLabel(a))+'"><td><div class="fleet-asset-cell"><span class="fleet-asset-thumb" data-tone="'+situation.tone+'"><img src="'+esc(vehicleThumb(a))+'" alt="" loading="lazy" decoding="async"></span><div class="fleet-asset-copy"><strong>'+esc(a.modelo||'Modelo não informado')+'</strong><small>'+esc(a.placa_identificador||a.asset_code||'Sem identificação')+'</small></div></div></td><td>'+esc(a.categoria||a.tipo||'—')+'</td><td>'+esc(a.responsavel_cpl||'Não informado')+'<small>'+esc(a.gerencia||'')+'</small></td><td>'+badge(situation.label,situation.tone)+'<small>'+esc(a.status_operacional||'Operação não informada')+'</small></td><td>'+ (revision?badge(fmt(revision),dateTone(revision)):'<small>Não informada</small>')+'</td><td>'+badge(ptranLabel,ptranTone)+(p?.numero_ptran?'<small>PTRAN '+esc(p.numero_ptran)+'</small>':'')+'</td><td>'+ (inspection?badge(fmt(inspection),dateTone(inspection)):'<small>Não registrada</small>')+'</td><td><span class="fleet-km">'+esc(mileage)+'</span></td><td><div class="fleet-row-actions"><button class="fleet-button fleet-table-view" data-open-asset="'+esc(a.id)+'">Ver</button><button class="fleet-icon-button" data-edit-asset="'+esc(a.id)+'" title="Editar ativo" aria-label="Editar ativo">'+icon('ellipsis-vertical')+'</button></div></td></tr>';
    }).join('');
    $('#table-page-info').textContent=assets.length?(start+1)+'–'+Math.min(start+state.pageSize,assets.length)+' de '+number(assets.length)+' ativos':'Nenhum registro exibido';
    $('#table-prev').disabled=state.page===0;$('#table-next').disabled=state.page>=pages-1;$('#export-button').disabled=!assets.length;
  }
  function alertHTML(alert) { return '<button class="fleet-alert-card" data-open-asset="'+esc(alert.asset_id)+'" data-tone="'+alert.tone+'">'+icon(alert.tone==='red'?'triangle-alert':'clock-3')+'<span class="fleet-alert-copy"><strong>'+esc(alert.message)+'</strong><small>'+esc(assetLabel(alert.asset))+'</small></span><span>'+ (alert.validade?fmt(alert.validade):'Revisar')+'</span></button>'; }
  function renderAlertPreview() {
    const ids=new Set(state.filtered.map(a=>a.id));const alerts=state.alerts.filter(a=>ids.has(a.asset_id));
    $('#alert-preview-count').textContent=state.loaded?number(alerts.length):'—';
    $('#alert-preview').innerHTML=alerts.length?alerts.slice(0,3).map(alertHTML).join(''):'<div class="fleet-alert-empty">'+icon(state.loaded?'circle-check':'database')+(state.loaded?'Nenhuma pendência encontrada nesta visão.':'Alertas serão calculados com os dados do banco.')+'</div>';
  }
  function renderAlerts() {
    $('#alerts-total').textContent=state.loaded?number(state.alerts.length)+' alerta(s)':'Aguardando dados';
    const groups=[{title:'Críticos',subtitle:'Vencimentos ultrapassados e restrições operacionais',tone:'red',test:a=>a.tone==='red'},{title:'Atenção • até 7 dias',subtitle:'Vencimentos que exigem ação imediata',tone:'yellow',test:a=>a.tone==='yellow'&&a.days!==null&&a.days>=0&&a.days<=7},{title:'Atenção • 8 a 15 dias',subtitle:'Organize as renovações para as próximas semanas',tone:'yellow',test:a=>a.tone==='yellow'&&a.days>7&&a.days<=15},{title:'Atenção • 16 a 30 dias',subtitle:'Prazos próximos para programação preventiva',tone:'yellow',test:a=>a.tone==='yellow'&&a.days>15&&a.days<=30},{title:'Pendências de cadastro e autorização',subtitle:'Dados ausentes, provisórios e aprovações pendentes',tone:'yellow',test:a=>a.tone==='yellow'&&(a.days===null||a.days<0||a.days>30)}];
    $('#alerts-content').innerHTML=groups.map(group=>{
      const alerts=state.alerts.filter(group.test);return '<section class="fleet-panel fleet-alert-group" data-tone="'+group.tone+'"><h3>'+icon(group.tone==='red'?'triangle-alert':'clock-3')+esc(group.title)+' <span class="fleet-chip">'+ (state.loaded?alerts.length:'—')+'</span></h3><p>'+esc(group.subtitle)+'</p><div class="fleet-alert-list">'+ (alerts.length?alerts.map(alertHTML).join(''):'<div class="fleet-alert-empty">'+icon('circle-check')+(state.loaded?'Nenhuma pendência encontrada.':'Aguardando consulta ao banco.')+'</div>')+'</div></section>';
    }).join('');icons();
  }
  function renderQuality() {
    const issues=state.quality;
    $('#quality-total').textContent=state.loaded?number(issues.length)+' item(ns) para revisão':'Aguardando dados';
    const groups=grouped(issues.map(i=>i.type));
    $('#quality-summary').innerHTML=(groups.length?groups:[['Duplicidades',0],['PTRAN sem número',0],['Responsável ausente',0],['Status / datas',0]]).map(([type,count])=>'<div class="fleet-quality-tile"><strong>'+ (state.loaded?number(count):'—')+'</strong><span>'+esc(type)+'</span></div>').join('');
    populateSelect('#quality-type',issues.map(i=>i.type),'Todas as inconsistências');
    const selected=$('#quality-type').value,shown=issues.filter(i=>!selected||i.type===selected);
    $('#quality-content').innerHTML=shown.length?shown.map(issue=>{
      const a=state.assets.find(asset=>asset.id===issue.asset_id);
      return '<button class="fleet-quality-row" data-open-asset="'+esc(issue.asset_id)+'">'+icon('shield-alert')+'<div><strong>'+esc(a?.placa_identificador||a?.asset_code||'Sem identificação')+'</strong><small>'+esc(a?.modelo||'Ativo')+'</small></div><span>'+esc(issue.message)+'</span>'+badge(issue.type,'yellow')+'</button>';
    }).join(''):'<div class="fleet-empty">'+empty(state.loaded?'Nenhuma inconsistência nesta visão':'Qualidade aguardando dados',state.loaded?'Os dados recebidos não apresentam as inconsistências monitoradas neste painel.':'A análise usa os cadastros e registros publicados no banco.','','shield-check')+'</div>';icons();
  }
  function showView(view) {
    if(!['dashboard','alerts','quality','history'].includes(view))return;
    state.view=view;
    const labels={dashboard:'Visão Geral',alerts:'Alertas',quality:'Qualidade da Base',history:'Histórico'};
    if($('#fleet-view-label'))$('#fleet-view-label').textContent=labels[view]||'Gestão de Frota';
    $$('.fleet-sidebar [data-focus]').forEach(button=>button.classList.remove('active'));
    $$('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===view);if(button.getAttribute('role')==='tab')button.setAttribute('aria-selected',String(button.dataset.view===view));});
    $$('.fleet-view').forEach(section=>section.classList.toggle('hidden',section.id!=='view-'+view));
    if(view==='history'&&!state.historyLoaded)loadHistory();
    if(view==='dashboard')requestAnimationFrame(()=>Object.values(state.charts).forEach(c=>c.resize()));
  }
  function eventValue(event,keys) { return keys.map(key=>event[key]).find(value=>value!==undefined&&value!==null&&value!==''); }
  function eventKind(event) { return String(eventValue(event,['kind','table_name','tabela','entity_type'])||'').replace(/^fleet_/,''); }
  function eventDate(event) { return eventValue(event,['created_at','occurred_at','event_at','data','data_hora','timestamp']); }
  function historyEventHTML(event,showAsset=true) {
    const asset=state.assets.find(a=>a.id===event.asset_id), field=eventValue(event,['field_name','campo','field']);
    const before=eventValue(event,['old_value','valor_anterior','before']),after=eventValue(event,['new_value','valor_novo','after']);
    const action=eventValue(event,['title','action','acao','event_type'])||'Alteração registrada';
    const kind=eventKind(event), actor=eventValue(event,['actor','usuario','user_name','responsavel'])||'Não informado';
    const origin=eventValue(event,['origin','origem'])||'manual';
    const actionLabel={insert:'Cadastro registrado',update:'Atualização registrada',supersede:'Correção registrada',delete:'Inativação registrada',create:'Cadastro registrado',import:'Importação registrada'}[norm(action)]||action;
    const title=event.title||((kindNames[kind]||'Frota')+' • '+(field?fieldLabel(field)+' alterado':actionLabel));
    const hasDiff=field && (before!==undefined || after!==undefined);
    return '<article class="fleet-timeline-event"><time datetime="'+esc(eventDate(event)||'')+'">'+esc(fmt(eventDate(event),String(eventDate(event)||'').length>10))+'</time><div class="fleet-event-content"><strong>'+esc(title)+'</strong>'+ (showAsset?'<p><button class="fleet-event-asset" data-open-asset="'+esc(event.asset_id||'')+'">'+esc(asset?assetLabel(asset):event.placa_identificador||event.asset_label||'Ativo')+'</button></p>':'')+(hasDiff?'<p class="fleet-event-diff"><del>'+esc(display(before))+'</del> → <ins>'+esc(display(after))+'</ins></p>':event.description?'<p>'+esc(event.description)+'</p>':'')+'<div class="fleet-event-meta"><span>'+icon('user-round')+esc(actor)+'</span><span>'+icon(origin==='excel_import'?'file-spreadsheet':'activity')+esc({excel_import:'Importação Excel',manual:'Manual',system:'Sistema'}[origin]||origin)+'</span>'+ (event.import_batch_id?'<span title="'+esc(event.import_batch_id)+'">Lote '+esc(String(event.import_batch_id).slice(0,8))+'</span>':'')+'</div></div></article>';
  }
  async function loadHistory(append=false) {
    if(state.historyLoading)return;
    state.historyLoading=true;$('#history-more').disabled=true;
    if(!append)$('#history-content').innerHTML='<div class="fleet-loading-inline"><div class="spinner"></div>Consultando eventos registrados</div>';
    try {
      const result=await api.history(state.historyFilters,append?state.history.length:0,100);
      const events=Array.isArray(result?.events)?result.events:[];
      state.history=append?state.history.concat(events):events;state.historyTotal=Number(result?.total??state.history.length);state.historyLoaded=true;
      $('#history-content').innerHTML=state.history.length?state.history.map(event=>historyEventHTML(event)).join(''):'<div class="fleet-empty">'+empty('Nenhum evento encontrado','Os eventos aparecerão após cadastros, movimentações ou atualizações publicadas.','','history')+'</div>';
      $('#history-count').textContent=number(state.historyTotal)+' evento(s)';
      $('#history-more').classList.toggle('hidden',state.history.length>=state.historyTotal);
    } catch(error) {
      $('#history-content').innerHTML='<div class="fleet-empty">'+empty('Histórico indisponível',errorMessage(error),'<button class="fleet-button" data-action="history-retry">'+icon('refresh-cw')+' Tentar novamente</button>','cloud-off')+'</div>';
      $('#history-count').textContent='—';$('#history-more').classList.add('hidden');
    } finally {state.historyLoading=false;$('#history-more').disabled=false;icons();}
  }
  function modalHead(title,subtitle='',eyebrow='') {return '<header class="fleet-modal-head"><div>'+ (eyebrow?'<p class="eyebrow">'+esc(eyebrow)+'</p>':'')+'<h2 id="modal-title">'+esc(title)+'</h2>'+ (subtitle?'<p>'+esc(subtitle)+'</p>':'')+'</div><button class="fleet-icon-button" data-close-modal aria-label="Fechar janela">'+icon('x')+'</button></header>';}
  function openModal(html,large=false) {state.lastFocus=document.activeElement;$('#fleet-modal').classList.toggle('large',large);$('#modal-content').innerHTML=html;$('#fleet-modal-overlay').classList.remove('hidden');document.body.style.overflow='hidden';icons();$('#fleet-modal').focus();}
  function closeModal() {$('#fleet-modal-overlay').classList.add('hidden');$('#modal-content').innerHTML='';state.modalClose=null;restoreScroll();state.lastFocus?.focus?.();}
  function restoreScroll() {if($('#fleet-modal-overlay').classList.contains('hidden')&&$('#fleet-drawer-overlay').classList.contains('hidden')&&$('#fleet-confirm-overlay').classList.contains('hidden'))document.body.style.overflow='';}
  function confirmAction(title,message,label='Confirmar',tone='primary') {
    return new Promise(resolve=>{
      state.confirmResolve=resolve;$('#confirm-content').innerHTML='<div class="fleet-confirm-content">'+icon(tone==='danger'?'log-out':'circle-check')+'<h2 id="confirm-title">'+esc(title)+'</h2><p>'+esc(message)+'</p><div class="fleet-form-actions"><button class="fleet-button" data-confirm="cancel">Voltar</button><button class="fleet-button '+tone+'" data-confirm="ok">'+esc(label)+'</button></div></div>';
      $('#fleet-confirm-overlay').classList.remove('hidden');document.body.style.overflow='hidden';icons();$('[data-confirm="cancel"]').focus();
    });
  }
  function answerConfirm(confirmed) {$('#fleet-confirm-overlay').classList.add('hidden');const resolve=state.confirmResolve;state.confirmResolve=null;restoreScroll();resolve?.(confirmed);}
  function unlock(afterUnlock) {
    if(editing()){afterUnlock?.();return;}
    openModal(modalHead('Liberar edição','Informe a senha master para abrir uma sessão temporária de edição.','ACESSO PROTEGIDO')+'<div class="fleet-modal-body"><form id="unlock-form" class="fleet-form"><label>Seu nome / responsável pela alteração<input name="actor" autocomplete="name" required maxlength="120" placeholder="Nome para o histórico de auditoria"></label><label>Senha master<input name="password" type="password" autocomplete="off" required placeholder="Senha de edição"></label><p class="fleet-form-note">A validação ocorre no Supabase. A sessão é encerrada ao sair desta página ou ao expirar.</p><div class="fleet-form-error hidden" id="unlock-error" role="alert"></div><div class="fleet-form-actions"><button class="fleet-button" type="button" data-close-modal>Cancelar</button><button class="fleet-button primary" type="submit">'+icon('unlock-keyhole')+' Liberar edição</button></div></form></div>');
    $('#unlock-form').onsubmit=async event=>{
      event.preventDefault();const form=event.currentTarget,button=$('[type="submit"]',form);button.disabled=true;$('#unlock-error').classList.add('hidden');
      try {await api.unlock(form.elements.password.value,form.elements.actor.value);form.elements.password.value='';closeModal();toast('Edição liberada temporariamente. As alterações serão registradas no histórico.');afterUnlock?.();}
      catch(error){form.elements.password.value='';$('#unlock-error').textContent=errorMessage(error);$('#unlock-error').classList.remove('hidden');}
      finally {button.disabled=false;}
    };$('input[name="actor"]').focus();
  }
  function updateEditing() {
    const enabled=editing(); const expiry=api.expiresAt();
    $('#edit-mode').classList.toggle('editing',enabled);
    $('#edit-mode').innerHTML=icon(enabled?'unlock-keyhole':'lock-keyhole')+(enabled?'Edição até '+fmt(expiry,true).split(', ').pop():'Somente leitura');
    $('#unlock-button').title=enabled?'Encerrar sessão de edição':'Liberar edição';$('#unlock-button').setAttribute('aria-label',$('#unlock-button').title);$('#unlock-button').innerHTML=icon(enabled?'lock-keyhole':'pencil');
    $$('.edit-only').forEach(el=>el.classList.toggle('hidden',!enabled));
    $('#import-publish')?.toggleAttribute('disabled',!canPublish());
    icons();
  }
  async function openAsset(id,tab='resumo',edit=false) {
    if(!id)return;
    state.lastFocus=document.activeElement;state.drawerTab=tab;state.detail=null;const request=(state.drawerRequest||0)+1;state.drawerRequest=request;
    $('#drawer-content').innerHTML='<header class="fleet-drawer-head"><div><p class="eyebrow">FICHA DO ATIVO</p><h2 id="drawer-title">Consultando ativo</h2></div><button class="fleet-icon-button" data-close-drawer aria-label="Fechar ficha">'+icon('x')+'</button></header><div class="fleet-loading-inline"><div class="spinner"></div>Carregando cadastro e histórico</div>';
    $('#fleet-drawer-overlay').classList.remove('hidden');document.body.style.overflow='hidden';icons();$('#fleet-drawer').focus();
    try {
      const detail=await api.detail(id);
      if(!detail?.asset)throw new Error('O ativo não foi encontrado. Atualize a visão da frota.');
      if(request!==state.drawerRequest||$('#fleet-drawer-overlay').classList.contains('hidden'))return;
      state.detail=detail;
      if(edit)renderAssetForm(detail.asset);else renderDetail();
    } catch(error) {if(request!==state.drawerRequest)return;$('#drawer-content').innerHTML='<header class="fleet-drawer-head"><div><h2 id="drawer-title">Ficha indisponível</h2></div><button class="fleet-icon-button" data-close-drawer aria-label="Fechar ficha">'+icon('x')+'</button></header><div class="fleet-empty">'+empty('Não foi possível consultar o ativo',errorMessage(error),'<button class="fleet-button" data-open-asset="'+esc(id)+'">'+icon('refresh-cw')+' Tentar novamente</button>','cloud-off')+'</div>';icons();}
  }
  function closeDrawer() {$('#fleet-drawer-overlay').classList.add('hidden');state.detail=null;state.drawerRequest=(state.drawerRequest||0)+1;restoreScroll();state.lastFocus?.focus?.();}
  function fullAsset(detail) {return {...detail.asset,ptrans:detail.ptrans||[],inspections:detail.inspections||[],maintenance:detail.maintenance||[],documents:detail.documents||[]};}
  function detailHeader(asset,title='FICHA DO ATIVO') {return '<header class="fleet-drawer-head fleet-drawer-head-visual"><span class="fleet-drawer-vehicle"><img src="'+esc(vehicleThumb(asset))+'" alt="" loading="lazy"></span><div class="fleet-drawer-title-copy"><p class="eyebrow">'+esc(title)+'</p><h2 id="drawer-title">'+esc(assetLabel(asset))+'</h2><p>'+esc(asset.categoria||'Categoria não informada')+' • '+esc(asset.empresa||'Empresa não informada')+'</p></div><button class="fleet-icon-button" data-close-drawer aria-label="Fechar ficha">'+icon('x')+'</button></header>';}
  function recordSummary(asset,kind) {
    const records=asset[kind]||[];if(!records.length)return {label:'Não cadastrado',tone:'gray'};
    if(kind==='ptrans'){const p=latest(asset,kind);return {label:p?.status||'Revisar status',tone:p?.data_validade&&dateTone(p.data_validade)==='red'?'red':statusTone(p?.status)};}
    const alerts=core.situation(asset).alerts.filter(a=>({inspections:'Inspeção',maintenance:'Revisão',documents:'Documento'}[kind])===a.type);
    return {label:alerts.some(a=>a.tone==='red')?'Requer ação':alerts.length?'Prazo próximo':'Registrado',tone:alerts.some(a=>a.tone==='red')?'red':alerts.length?'yellow':'green'};
  }
  function renderDetail() {
    const detail=state.detail;if(!detail)return;
    const asset=fullAsset(detail),situation=core.situation(asset);
    const statusCards=[{title:'Situação geral',value:situation.label,icon:'activity',tone:situation.tone},...['ptrans','inspections','maintenance','documents'].map(kind=>{const summary=recordSummary(asset,kind);return {title:kindNames[kind],value:summary.label,icon:{ptrans:'file-check-2',inspections:'clipboard-check',maintenance:'wrench',documents:'files'}[kind],tone:summary.tone};})];
    const tabs=[['resumo','Resumo'],['ptrans','PTRAN'],['inspections','Inspeções'],['maintenance','Manutenção'],['documents','Documentos'],['movements','Movimentações'],['audit','Histórico']];
    $('#drawer-content').innerHTML=detailHeader(asset)+'<div class="fleet-drawer-status">'+statusCards.map(card=>'<div class="fleet-status-card" data-tone="'+card.tone+'">'+icon(card.icon)+'<small>'+esc(card.title)+'</small><strong>'+esc(card.value)+'</strong></div>').join('')+'</div><div class="fleet-drawer-actions"><button class="fleet-button" data-action="edit-current">'+icon('pencil')+' Editar ativo</button><button class="fleet-button success edit-only '+(editing()?'':'hidden')+'" data-movement="entrada">'+icon('log-in')+' Registrar entrada</button><button class="fleet-button danger edit-only '+(editing()?'':'hidden')+'" data-movement="saída">'+icon('log-out')+' Registrar saída</button></div><div class="fleet-drawer-tabs" role="tablist" aria-label="Ficha do ativo">'+tabs.map(([key,label])=>'<button data-drawer-tab="'+key+'" role="tab" aria-selected="'+(state.drawerTab===key)+'" class="'+(state.drawerTab===key?'active':'')+'">'+label+'</button>').join('')+'</div><div class="fleet-drawer-body" id="drawer-body"></div>';
    renderDetailTab();icons();
  }
  function detailItem(field,value,full=false) {return '<div class="fleet-detail-item'+(full?' full':'')+'"><dt>'+esc(fieldLabel(field))+'</dt><dd>'+esc(display(value))+'</dd></div>';}
  function renderDetailTab() {
    const detail=state.detail;if(!detail)return;const asset=fullAsset(detail),tab=state.drawerTab;
    if(tab==='resumo') {
      const situation=core.situation(asset);
      const list=['asset_code','placa_identificador','tipo','categoria','modelo','marca','ano','cor','empresa','gerencia','responsavel_cpl','status_operacional','ativo_no_contrato'];
      $('#drawer-body').innerHTML='<div class="fleet-detail-callout" data-tone="'+situation.tone+'"><strong>'+esc(situation.label)+'</strong>'+ (situation.reasons.length?'<ul>'+situation.reasons.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul>':'<ul><li>Nenhuma restrição identificada nos registros atuais informados.</li></ul>')+'</div><dl class="fleet-detail-grid">'+list.map(field=>detailItem(field,field==='ativo_no_contrato'&&asset[field]==null?'Não confirmado':asset[field])).join('')+detailItem('data_entrada',fmt(asset.data_entrada))+detailItem('data_saida',fmt(asset.data_saida))+ (asset.quilometragem!=null?detailItem('quilometragem',number(asset.quilometragem)+' km'):'')+(asset.horimetro!=null?detailItem('horimetro',number(asset.horimetro)+' h'):'')+detailItem('observacao_atual',asset.observacao_atual,true)+detailItem('Última atualização',fmt(asset.updated_at,true))+detailItem('UUID interno',asset.id)+'</dl>';
    } else if(tab==='audit') {
      const events=assetTimeline(detail);
      $('#drawer-body').innerHTML='<div class="fleet-detail-section-head"><h3>Linha do tempo do ativo</h3><span class="fleet-chip">'+number(events.length)+' eventos</span></div><p class="fleet-history-note">PTRANs, inspeções, manutenções, documentos, movimentações e alterações de cadastro em ordem cronológica.</p><div class="fleet-timeline">'+ (events.length?events.map(event=>historyEventHTML(event,false)).join(''):'<div class="fleet-empty">'+empty('Nenhum evento registrado','Os novos registros e alterações serão preservados nesta linha do tempo.','','history')+'</div>')+'</div>';
    } else {
      const records=[...(detail[tab]||[])].sort((a,b)=>String(b.created_at||b.data||'').localeCompare(String(a.created_at||a.data||'')));
      const currentIds=new Set(core.currentRecords(records).map(r=>r.id));
      $('#drawer-body').innerHTML='<div class="fleet-detail-section-head"><h3>'+kindNames[tab]+' <span class="fleet-chip">'+records.length+' registros</span></h3><button class="fleet-button edit-only '+(editing()?'':'hidden')+'" data-new-record="'+tab+'">'+icon('plus')+' '+(tab==='movements'?'Registrar':'Adicionar')+'</button></div><p class="fleet-history-note">Novos registros preservam os anteriores. A correção de um registro cria uma versão vinculada ao original.</p><div class="fleet-records">'+ (records.length?records.map(record=>recordHTML(tab,record,!currentIds.has(record.id))).join(''):'<div class="fleet-empty">'+empty('Nenhum registro de '+kindNames[tab].toLowerCase(),'Use a edição protegida para incluir informações reais do ativo.','','folder-open')+'</div>')+'</div>';
    } icons();
  }
  function recordHTML(kind,record,superseded) {
    const title={ptrans:'PTRAN '+(record.numero_ptran||'sem número'),inspections:record.tipo_inspecao||'Inspeção',maintenance:[record.categoria,record.tipo].filter(Boolean).join(' • ')||'Manutenção',documents:record.tipo_documento||'Documento',movements:record.tipo_movimento||'Movimentação'}[kind];
    const keys={ptrans:['numero_isc','data_recebimento','data_solicitacao','data_emissao','data_validade','tipo_ptran','provisoria','responsavel'],inspections:['data_inspecao','validade','proxima_inspecao','inspetor','resultado','quilometragem','horimetro'],maintenance:['data_abertura','data_execucao','proxima_revisao_data','km_atual','proxima_revisao_km','horimetro_atual','proxima_revisao_horas','oficina_fornecedor','numero_os','valor'],documents:['numero_documento','emissao','validade'],movements:['data','origem','destino','responsavel_anterior','responsavel_novo']}[kind];
    const dateKeys=new Set(['data_recebimento','data_solicitacao','data_emissao','data_validade','data_inspecao','validade','proxima_inspecao','data_abertura','data_execucao','proxima_revisao_data','emissao','data']);
    const link=safeURL(record.anexo_url||record.arquivo_url);
    return '<article class="fleet-record'+(superseded?' superseded':'')+'"><header><div><h4>'+esc(title)+'</h4><small>Registrado em '+fmt(record.created_at,true)+'</small></div><div class="fleet-record-tools">'+ (superseded?badge('Versão anterior','gray'):record.status?badge(record.status,statusTone(record.status)):'')+'<button class="fleet-icon-button edit-only '+(editing()&&!superseded?'':'hidden')+'" data-edit-record="'+esc(record.id)+'" data-record-kind="'+kind+'" aria-label="Corrigir registro" title="Corrigir registro preservando a versão anterior">'+icon('pencil')+'</button></div></header><div class="fleet-record-meta">'+keys.filter(key=>record[key]!=null&&record[key]!=='').map(key=>'<div><span>'+esc(fieldLabel(key))+'</span><b>'+esc(dateKeys.has(key)?fmt(record[key],key==='data'):key==='valor'?Number(record[key]).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):display(record[key]))+'</b></div>').join('')+'</div>'+ (record.descricao?'<p class="fleet-record-notes">'+esc(record.descricao)+'</p>':'')+(record.observacao?'<div class="fleet-record-notes">'+esc(record.observacao)+'</div>':'')+(link?'<a class="fleet-record-link" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+icon('paperclip')+' Abrir documento / anexo</a>':'')+'</article>';
  }
  function assetTimeline(detail) {
    const events=[];
    const defs={ptrans:{date:r=>r.data_emissao||r.data_recebimento,title:r=>'PTRAN '+(r.numero_ptran||'sem número')+' • '+(r.status||'status não informado'),description:r=>[r.numero_isc?'ISC '+r.numero_isc:'',r.responsavel?'Responsável: '+r.responsavel:'',r.observacao].filter(Boolean).join(' • ')},inspections:{date:r=>r.data_inspecao,title:r=>'Inspeção '+(r.tipo_inspecao||'')+' registrada',description:r=>[r.resultado?'Resultado: '+r.resultado:'',r.inspetor?'Inspetor: '+r.inspetor:'',r.observacao].filter(Boolean).join(' • ')},maintenance:{date:r=>r.data_execucao||r.data_abertura,title:r=>'Manutenção '+(r.categoria||r.tipo||'')+' registrada',description:r=>[r.numero_os?'OS '+r.numero_os:'',r.status,r.descricao].filter(Boolean).join(' • ')},documents:{date:r=>r.emissao,title:r=>'Documento '+(r.tipo_documento||'')+' registrado',description:r=>[r.numero_documento,r.status,r.observacao].filter(Boolean).join(' • ')},movements:{date:r=>r.data,title:r=>'Movimentação • '+(r.tipo_movimento||''),description:r=>[r.origem||r.destino?[r.origem||'—',r.destino||'—'].join(' → '):'',r.responsavel_anterior||r.responsavel_novo?[r.responsavel_anterior||'—',r.responsavel_novo||'—'].join(' → '):'',r.observacao].filter(Boolean).join(' • ')}};
    Object.entries(defs).forEach(([kind,def])=>(detail[kind]||[]).forEach(record=>events.push({asset_id:detail.asset.id,created_at:def.date(record)||record.created_at,kind,title:def.title(record),description:def.description(record),actor:record.actor||record.responsavel||record.inspetor,origin:record.origin||record.origem_alteracao||record.import_batch_id&&'excel_import'||'manual',import_batch_id:record.import_batch_id})));
    (detail.audit||[]).filter(event=>event.field_name||event.campo||event.action!=='insert').forEach(event=>events.push(event));
    return events.sort((a,b)=>String(eventDate(b)||'').localeCompare(String(eventDate(a)||'')));
  }
  function inputField(name,value='',options={}) {
    const {type='text',values,required=false,full=false,placeholder='',readonly=false}=options;
    const attrs=' name="'+name+'"'+(required?' required':'')+(readonly?' readonly':'');
    const content=type==='nullableBoolean'?'<select'+attrs+'><option value=""'+(value==null?' selected':'')+'>Não informado</option><option value="true"'+(value===true?' selected':'')+'>Sim</option><option value="false"'+(value===false?' selected':'')+'>Não</option></select>':values?'<select'+attrs+'><option value="">Não informado</option>'+[...new Set([...values,...(value&&!values.includes(value)?[value]:[])])].map(v=>'<option value="'+esc(v)+'"'+(String(v)===String(value)?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select>':type==='textarea'?'<textarea'+attrs+' rows="3" maxlength="6000">'+esc(value||'')+'</textarea>':type==='checkbox'?'<input type="checkbox"'+attrs+(value?' checked':'')+'>':'<input type="'+type+'"'+attrs+' value="'+esc(value??'')+'"'+(placeholder?' placeholder="'+esc(placeholder)+'"':'')+(type==='number'?' min="0" step="'+(name==='ano'?'1':'any')+'"':'')+(type==='text'?' maxlength="500"':'')+'>';
    return '<label class="'+(full?'full ':'')+(type==='checkbox'?'fleet-check':'')+'">'+(type==='checkbox'?content+esc(fieldLabel(name)):esc(fieldLabel(name))+ (required?' *':'')+content)+'</label>';
  }
  function group(title,content) {return '<section class="fleet-form-group"><h3>'+esc(title)+'</h3><div class="fleet-form-grid">'+content+'</div></section>';}
  function contractField(asset,isNew) {
    if(isNew)return '<label class="full">Situação no contrato<select name="ativo_no_contrato"><option value="">Não confirmado</option><option value="true">No contrato</option><option value="false">Fora do contrato</option></select></label>';
    return '<p class="fleet-form-note full">Situação no contrato: <strong>'+ (asset.ativo_no_contrato===true?'No contrato':asset.ativo_no_contrato===false?'Fora do contrato':'Não confirmado')+'</strong>. Use Registrar entrada / Registrar saída na ficha para registrar formalmente a movimentação.</p>';
  }
  function renderAssetForm(asset={}) {
    if(!editing()){unlock(()=>asset.id?openAsset(asset.id,'resumo',true):renderAssetForm({}));return;}
    const isNew=!asset.id;
    if(isNew){state.lastFocus=document.activeElement;$('#fleet-drawer-overlay').classList.remove('hidden');document.body.style.overflow='hidden';}
    $('#drawer-content').innerHTML=detailHeader(asset,isNew?'CADASTRAR ATIVO':'EDITAR ATIVO')+'<div class="fleet-drawer-body fleet-drawer-edit"><form id="asset-form" class="fleet-form"><p class="fleet-form-note">Máquinas podem usar serial, patrimônio ou número interno. O UUID identifica o ativo e permanece imutável.</p>'+group('Identificação e classificação',inputField('asset_code',asset.asset_code)+inputField('placa_identificador',asset.placa_identificador,{placeholder:'Placa, patrimônio ou serial'})+inputField('modelo',asset.modelo,{required:true})+inputField('tipo',asset.tipo,{values:types})+inputField('categoria',asset.categoria,{values:core.CATEGORIES})+inputField('marca',asset.marca)+inputField('ano',asset.ano,{type:'number'})+inputField('cor',asset.cor))+group('Responsabilidade e operação',inputField('empresa',asset.empresa)+inputField('gerencia',asset.gerencia)+inputField('responsavel_cpl',asset.responsavel_cpl)+inputField('status_operacional',asset.status_operacional,{values:operational})+inputField('quilometragem',asset.quilometragem,{type:'number'})+inputField('horimetro',asset.horimetro,{type:'number'})+contractField(asset,isNew))+group('Observações',inputField('observacao_atual',asset.observacao_atual,{type:'textarea',full:true}))+'<div id="asset-form-error" class="fleet-form-error hidden" role="alert"></div><div class="fleet-form-actions"><button type="button" class="fleet-button" data-action="cancel-asset-edit">Cancelar</button><button type="submit" class="fleet-button primary">'+icon('save')+' '+(isNew?'Cadastrar ativo':'Salvar alterações')+'</button></div></form></div>';
    $('#drawer-title').textContent=isNew?'Novo ativo de frota':assetLabel(asset);
    $('#asset-form').onsubmit=event=>saveAssetForm(event,asset);icons();
    if(isNew)$('[name="modelo"]',$('#asset-form')).focus();
  }
  function formData(form) {
    const result={};[...form.elements].forEach(el=>{if(!el.name||el.disabled)return;const value=el.type==='checkbox'?el.checked:el.value.trim();result[el.name]=['ativo_no_contrato','provisoria'].includes(el.name)?(value==='true'?true:value==='false'?false:null):el.type==='number'?(value===''?null:Number(value)):value===''?null:value;});return result;
  }
  async function saveAssetForm(event,asset) {
    event.preventDefault();const form=event.currentTarget,button=$('[type="submit"]',form),payload=formData(form);if(asset.id)payload.id=asset.id;
    if(payload.ano!=null&&(payload.ano<1900||payload.ano>new Date().getFullYear()+2)){showFormError('asset-form-error','Informe um ano válido ou deixe o campo vazio.');return;}
    if(!await confirmAction(asset.id?'Salvar alterações do ativo?':'Cadastrar este ativo?',asset.id?'As alterações serão registradas com os valores anteriores no histórico de auditoria.':'O cadastro será publicado no banco e aparecerá na frota.',asset.id?'Salvar alterações':'Cadastrar'))return;
    button.disabled=true;$('#asset-form-error').classList.add('hidden');
    try {const result=await api.saveAsset(payload,asset.updated_at||null);const id=result?.asset?.id||result?.id||asset.id;await refreshAsset(id);toast(asset.id?'Alterações salvas com sucesso.':'Ativo cadastrado com sucesso.');}
    catch(error){showFormError('asset-form-error',errorMessage(error));}
    finally {button.disabled=false;}
  }
  function showFormError(id,message) {const element=$('#'+id);if(!element){toast(message,'red');return;}element.textContent=message;element.classList.remove('hidden');}
  async function refreshAsset(id) {
    if(!id){await loadAssets();closeDrawer();return;}
    const detail=await api.detail(id);const asset=fullAsset(detail);const index=state.assets.findIndex(a=>a.id===id);
    if(index<0)state.assets.push(asset);else state.assets[index]=asset;
    state.detail=detail;state.loaded=true;state.connected=true;state.lastUpdate=asset.updated_at||state.lastUpdate;
    $('#last-update').textContent='Última atualização: '+fmt(state.lastUpdate,true);setConnection('online');state.historyLoaded=false;populateFilters();recalculate();renderDetail();
  }
  function recordForm(kind,existing=null,preset={}) {
    if(!state.detail)return;
    if(!editing()){unlock(()=>recordForm(kind,existing,preset));return;}
    const record={...(existing||{}),...preset};const correcting=Boolean(existing?.id);let content='';
    if(kind==='ptrans')content=inputField('numero_ptran',record.numero_ptran)+inputField('numero_isc',record.numero_isc)+inputField('status',record.status,{values:core.PTRAN_STATUSES,required:true})+inputField('tipo_ptran',record.tipo_ptran)+inputField('data_recebimento',record.data_recebimento,{type:'date'})+inputField('data_solicitacao',record.data_solicitacao,{type:'date'})+inputField('data_emissao',record.data_emissao,{type:'date'})+inputField('data_validade',record.data_validade,{type:'date'})+inputField('responsavel',record.responsavel||state.detail.asset.responsavel_cpl)+inputField('provisoria',record.provisoria,{type:'nullableBoolean'});
    if(kind==='inspections')content=inputField('tipo_inspecao',record.tipo_inspecao,{values:inspectionTypes,required:true})+inputField('status',record.status,{values:['Programada','Pendente','Aprovado','Reprovado','Cancelado'],required:true})+inputField('data_inspecao',record.data_inspecao,{type:'date'})+inputField('validade',record.validade,{type:'date'})+inputField('proxima_inspecao',record.proxima_inspecao,{type:'date'})+inputField('inspetor',record.inspetor)+inputField('resultado',record.resultado,{values:['Aprovado','Aprovado com ressalvas','Reprovado','Pendente']})+inputField('quilometragem',record.quilometragem,{type:'number'})+inputField('horimetro',record.horimetro,{type:'number'})+inputField('anexo_url',record.anexo_url,{type:'url',placeholder:'https://...'});
    if(kind==='maintenance')content=inputField('tipo',record.tipo,{values:['Manutenção','Revisão','Serviço']})+inputField('categoria',record.categoria,{values:maintenanceCategories,required:true})+inputField('status',record.status,{values:['Programada','Aberta','Em andamento','Concluído','Cancelado'],required:true})+inputField('numero_os',record.numero_os)+inputField('data_abertura',record.data_abertura,{type:'date'})+inputField('data_execucao',record.data_execucao,{type:'date'})+inputField('proxima_revisao_data',record.proxima_revisao_data,{type:'date'})+inputField('km_atual',record.km_atual,{type:'number'})+inputField('proxima_revisao_km',record.proxima_revisao_km,{type:'number'})+inputField('horimetro_atual',record.horimetro_atual,{type:'number'})+inputField('proxima_revisao_horas',record.proxima_revisao_horas,{type:'number'})+inputField('oficina_fornecedor',record.oficina_fornecedor)+inputField('valor',record.valor,{type:'number'})+inputField('descricao',record.descricao,{type:'textarea',full:true});
    if(kind==='documents')content=inputField('tipo_documento',record.tipo_documento,{values:documentTypes,required:true})+inputField('numero_documento',record.numero_documento)+inputField('emissao',record.emissao,{type:'date'})+inputField('validade',record.validade,{type:'date'})+inputField('status',record.status,{values:['Válido','Pendente','Em renovação','Vencido','Cancelado'],required:true})+inputField('arquivo_url',record.arquivo_url,{type:'url',placeholder:'https://...'});
    if(kind==='movements')content=inputField('tipo_movimento',record.tipo_movimento,{values:movements,required:true})+inputField('data',record.data?record.data.slice(0,10):core.todayISO(),{type:'date',required:true})+inputField('origem',record.origem)+inputField('destino',record.destino)+inputField('responsavel_anterior',record.responsavel_anterior||state.detail.asset.responsavel_cpl)+inputField('responsavel_novo',record.responsavel_novo);
    content+=inputField('observacao',record.observacao,{type:'textarea',full:true});
    const title=(correcting?'Corrigir registro • ':'Novo registro • ')+kindNames[kind];
    const subtitle=kind==='movements'&&['entrada','saída'].includes(record.tipo_movimento)?'A movimentação e a situação do ativo no contrato serão atualizadas juntas.':correcting?'A versão anterior será preservada e vinculada à correção.':assetLabel(state.detail.asset);
    openModal(modalHead(title,subtitle,'FICHA DO ATIVO')+'<div class="fleet-modal-body"><form id="record-form" class="fleet-form"><div class="fleet-form-grid">'+content+'</div>'+ (kind==='documents'||kind==='inspections'?'<p class="fleet-form-note">Anexos: informe a URL de um arquivo publicado ou autorizado. Campos sem dados podem permanecer vazios.</p>':'')+'<div id="record-form-error" class="fleet-form-error hidden" role="alert"></div><div class="fleet-form-actions"><button class="fleet-button" type="button" data-close-modal>Cancelar</button><button class="fleet-button primary" type="submit">'+icon('save')+' '+(correcting?'Salvar correção':'Registrar')+'</button></div></form></div>');
    $('#record-form').onsubmit=event=>saveRecordForm(event,kind,existing);
  }
  async function saveRecordForm(event,kind,existing) {
    event.preventDefault();const form=event.currentTarget,button=$('[type="submit"]',form),record=formData(form);if(existing?.id)record.supersedes_id=existing.id;
    // A movement's effective date is a date in São Paulo; its audit timestamp comes
    // from the backend. Do not reinterpret the form's calendar day in host timezone.
    if(record.data)record.data=record.data.slice(0,10);
    const movement=kind==='movements'&&['entrada','saída'].includes(record.tipo_movimento);
    const confirmation=movement?(record.tipo_movimento==='saída'?'Registrar saída do contrato?':'Registrar entrada no contrato?'):existing?'Salvar correção do registro?':'Publicar este registro?';
    const message=movement?'A situação no contrato será alterada e a movimentação permanecerá no histórico do ativo.':'O registro será salvo no banco. Os registros anteriores e a auditoria serão preservados.';
    if(!await confirmAction(confirmation,message,'Registrar',record.tipo_movimento==='saída'?'danger':'primary'))return;
    button.disabled=true;$('#record-form-error').classList.add('hidden');
    try {const id=state.detail.asset.id;await api.addRecord(kind,id,record,state.detail.asset.updated_at);closeModal();state.drawerTab=kind;await refreshAsset(id);toast({ptrans:'PTRAN cadastrado.',inspections:'Inspeção registrada.',maintenance:'Manutenção registrada.',documents:'Documento cadastrado.',movements:'Movimentação registrada.'}[kind]);}
    catch(error){showFormError('record-form-error',errorMessage(error));}
    finally {button.disabled=false;}
  }
  async function importFile(file) {
    if(!file)return;
    openModal(modalHead('Conferindo a planilha',file.name,'IMPORTAÇÃO EXCEL')+'<div class="fleet-loading-inline"><div class="spinner"></div>Lendo Planilha1 e comparando com o banco</div>',true);
    try {
      if(!window.FleetImport)throw new Error('A biblioteca de importação não foi carregada. Atualize a página.');
      const parsed=await FleetImport.read(file);
      prepareImport(parsed,file,crypto.randomUUID());
      renderImport();
    } catch(error) {$('#modal-content').innerHTML=modalHead('Não foi possível importar',file.name,'IMPORTAÇÃO EXCEL')+'<div class="fleet-modal-body"><div class="fleet-form-error">'+esc(errorMessage(error))+'</div><div class="fleet-form-actions"><button class="fleet-button" data-close-modal>Fechar</button><button class="fleet-button primary" data-action="import">Selecionar outro arquivo</button></div></div>';icons();}
  }
  function prepareImport(parsed,file,batchId,requireAllReview=false) {
    state.import=FleetImport.compare(parsed,state.assets);state.importFile=file;state.importBatch=batchId;
    state.import.requireAllReview=requireAllReview;
    state.import.sourceRows=parsed.rows;state.import.rows.forEach(row=>{row._originalAsset=JSON.parse(JSON.stringify(parsed.rows.find(r=>r.row_number===row.row_number)?.asset||row.asset));row._originalPtran=JSON.parse(JSON.stringify(parsed.rows.find(r=>r.row_number===row.row_number)?.ptran||row.ptran));row._choiceMade=!row.issues.some(i=>['duplicidade','correspondência'].includes(i.type));row._ignored=false;});
  }
  function reviewPendingImport() {
    if(!state.pendingDraft)return;
    unlock(async()=>{
      openModal(modalHead('Abrindo carga inicial','A fonte desta carga é privada e exige edição liberada.','CONFERÊNCIA LINHA A LINHA')+'<div class="fleet-loading-inline"><div class="spinner"></div>Consultando a carga inicial pendente</div>',true);
      try {
        const draft=await api.pendingImport(state.pendingDraft.id);
        if(!draft?.parsed?.rows?.length)throw new Error('A carga inicial não foi encontrada ou já foi publicada. Atualize o banco.');
        prepareImport(draft.parsed,{name:draft.file_name},draft.draft_id||state.pendingDraft.id,true);renderImport();
      } catch(error) {$('#modal-content').innerHTML=modalHead('Carga inicial indisponível','','CONFERÊNCIA LINHA A LINHA')+'<div class="fleet-modal-body"><div class="fleet-form-error">'+esc(errorMessage(error))+'</div><div class="fleet-form-actions"><button class="fleet-button" data-close-modal>Fechar</button></div></div>';icons();}
    });
  }
  function importSummary() {
    const rows=state.import.rows;const selected=rows.filter(r=>r.decision!=='ignore');
    return [['Registros encontrados',rows.length],['Novos ativos',selected.filter(r=>r.decision==='new').length],['Ativos existentes',selected.filter(r=>r.decision==='update').length],['PTRANs novos / versões',selected.filter(r=>r.ptran).length],['Alterações',selected.reduce((sum,r)=>sum+r.changes.length,0)],['Inconsistências',rows.filter(r=>r.issues.length).length],['Ignorados',rows.filter(r=>r.decision==='ignore').length+(state.import.ignored||0)]];
  }
  function importNeedsReview(row) {return state.import?.requireAllReview||row.issues.length>0;}
  function canPublish() {return Boolean(state.import&&editing()&&state.connected&&!state.loading&&state.import.rows.some(row=>row.decision!=='ignore')&&state.import.rows.every(row=>row._choiceMade&&(!importNeedsReview(row)||row.reviewed)));}
  function renderImport() {
    const imp=state.import;if(!imp)return;
    const previousScroll=$('.fleet-import-rows')?.scrollTop||0;
    $('#fleet-modal').classList.add('large');
    const selection='<div class="fleet-import-selection" aria-label="Conferência em lote"><div class="fleet-import-selection-actions"><button class="fleet-button" type="button" id="import-select-all">'+icon('check')+' Selecionar todos</button><button class="fleet-button" type="button" id="import-deselect-all">'+icon('square')+' Desselecionar todos</button></div><span id="import-selection-count" role="status" aria-live="polite"></span><p>Marque ou desmarque “Registro conferido” em lote. Linhas com destino indefinido precisam de uma escolha antes de serem selecionadas.</p></div>';
    $('#modal-content').innerHTML=modalHead('Resumo da importação','Banco atual × Excel importado • '+state.importFile.name,'CONFERÊNCIA ANTES DA PUBLICAÇÃO')+'<div class="fleet-modal-body"><div class="fleet-import-summary" id="import-summary">'+importSummary().map(([label,value])=>'<div><strong>'+number(value)+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div><div class="fleet-import-info">'+ (state.connected?'Selecione o vínculo dos identificadores ambíguos e marque a revisão humana dos registros sinalizados. A publicação preserva o histórico e nunca exclui ativos ausentes no Excel.':'O banco não respondeu. Esta é uma conferência local do arquivo; a publicação exige uma consulta atual do banco e edição liberada. Atualize o banco e selecione novamente o arquivo para recalcular as diferenças.')+'<br>Lote: <span class="fleet-number">'+esc(state.importBatch)+'</span></div><div class="fleet-import-rows">'+imp.rows.map((row,index)=>importRowHTML(row,index)).join('')+'</div><div class="fleet-form-error hidden" id="import-error" role="alert"></div><div class="fleet-import-footer"><span id="import-progress">'+importProgress()+'</span><button class="fleet-button primary" id="import-publish" '+(canPublish()?'':'disabled')+'>'+icon('upload-cloud')+' Publicar atualização</button></div>'+(!editing()?'<div class="fleet-form-actions"><button class="fleet-button" data-action="unlock-import">'+icon('pencil')+' Liberar edição para publicar</button></div>':'')+'</div>';
    $('#fleet-modal-overlay').classList.remove('hidden');document.body.style.overflow='hidden';
    $('.fleet-import-rows').insertAdjacentHTML('beforebegin',selection);
    bindImportEvents();updateImportFooter();icons();$('.fleet-import-rows').scrollTop=previousScroll;
  }
  function importProgress() {const rows=state.import.rows;const pending=rows.filter(row=>!row._choiceMade||importNeedsReview(row)&&!row.reviewed).length;return pending?pending+' registro(s) aguardando decisão ou revisão humana.':'Conferência completa. '+rows.filter(r=>r.decision!=='ignore').length+' registro(s) selecionado(s) para publicação.';}
  const ptranCorrectionFields=['status','data_recebimento','data_solicitacao','numero_ptran','numero_isc','provisoria'];
  function reviewedPtran(row) {
    // A no-op against the current database can omit its PTRAN write. Human decisions
    // must still survive a later field edit, destination change or session renewal.
    return {...row._originalPtran,...Object.fromEntries(Object.entries(row.raw.human_corrections||{}).filter(([key])=>ptranCorrectionFields.includes(key)))};
  }
  function importFieldValue(row,field) {
    if(Object.prototype.hasOwnProperty.call(row.raw.human_corrections||{},field))return row.raw.human_corrections[field];
    return (ptranCorrectionFields.includes(field)?row.ptran||row._originalPtran:row.asset)[field];
  }
  function importRowHTML(row,index) {
    const choice=row._choiceMade?(row.asset_id||row.decision):'';
    const target='<select data-import-target="'+index+'"><option value="" '+(!choice?'selected':'')+'>Escolha o vínculo / decisão</option><option value="new" '+(choice==='new'?'selected':'')+'>Cadastrar como ativo distinto</option><option value="ignore" '+(choice==='ignore'?'selected':'')+'>Ignorar nesta importação</option>'+state.assets.map(a=>'<option value="'+esc(a.id)+'"'+(choice===a.id?' selected':'')+'>'+esc(assetLabel(a))+'</option>').join('')+'</select>';
    const issueFields=[...new Set(row.issues.map(i=>i.field).filter(Boolean))];
    let corrections=issueFields.filter(field=>['status','data_recebimento','data_solicitacao','placa_identificador','modelo','numero_ptran','numero_isc','responsavel_cpl','observacao_atual'].includes(field)).map(field=>{
      const value=importFieldValue(row,field);
      if(field==='status')return '<label>Status PTRAN (revisão)<select data-import-field="'+field+'" data-import-index="'+index+'"><option value="'+esc(value||'')+'">Preservar: '+esc(value||'não informado')+'</option>'+core.PTRAN_STATUSES.filter(s=>s!==value).map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('')+'</select></label>';
      return '<label>'+esc(fieldLabel(field))+(field.startsWith('data_')?' (vazio preserva fonte original)':'')+'<input type="'+(field.startsWith('data_')?'date':'text')+'" value="'+esc(value||'')+'" data-import-field="'+field+'" data-import-index="'+index+'"></label>';
    }).join('');
    if(row.issues.some(issue=>issue.type==='provisório')){const provisional=importFieldValue(row,'provisoria');corrections+='<label>PTRAN provisória (confirmar)<select data-import-field="provisoria" data-import-index="'+index+'"><option value="" '+(provisional==null?'selected':'')+'>Não informado</option><option value="true" '+(provisional===true?'selected':'')+'>Sim</option><option value="false" '+(provisional===false?'selected':'')+'>Não</option></select></label>';}
    const changes=row.changes.map(change=>'<div class="fleet-import-diff"><strong>'+esc(fieldLabel(change.field))+'</strong><del>'+esc(display(change.before))+'</del><span>→</span><ins>'+esc(display(change.after))+'</ins></div>').join('');
    return '<details class="fleet-import-row '+(row.issues.length?'has-issues':'')+'" '+(importNeedsReview(row)?'open':'')+' data-import-row="'+index+'"><summary><strong>'+esc(assetLabel(row.asset))+'<small>Linha '+row.row_number+' • '+(row.asset_id?'Ativo existente':'Novo cadastro proposto')+'</small></strong>'+badge(row._choiceMade?(row.decision==='ignore'?'Ignorar':row.decision==='update'?'Atualizar':'Novo'):'Vínculo a definir',!row._choiceMade?'yellow':row.decision==='ignore'?'gray':'green')+(row.issues.length?badge(row.issues.length+' alerta(s)','yellow'):'')+'</summary><div class="fleet-import-row-body">'+(row.issues.length?'<ul class="fleet-import-issues">'+row.issues.map(issue=>'<li>'+esc(issue.message||issue)+'</li>').join(''):'')+'<div class="fleet-form-grid"><label>Destino do registro'+target+'</label><label class="fleet-check"><input type="checkbox" data-import-reviewed="'+index+'" '+(row.reviewed?'checked':'')+' '+(!row._choiceMade?'disabled':'')+'> '+(row.issues.length?'Revisei as inconsistências desta linha':'Registro conferido')+'</label></div><div class="fleet-import-diffs" data-import-diffs="'+index+'">'+(changes||'<p class="fleet-form-note">'+(row.decision==='new'?'Cadastro inicial com os valores da fonte.':'Nenhuma alteração de campos identificada.')+'</p>')+'</div>'+(corrections?'<div class="fleet-import-corrections">'+corrections+'</div>':'')+'<details style="margin-top:14px"><summary class="fleet-form-note">Ver valores originais da planilha</summary><pre class="fleet-import-raw">'+esc(JSON.stringify(row.raw,null,2))+'</pre></details></div></details>';
  }
  function bindImportEvents() {
    $('#import-select-all').onclick=()=>setImportReviewed(true);
    $('#import-deselect-all').onclick=()=>setImportReviewed(false);
    $$('[data-import-target]').forEach(select=>select.onchange=()=>{
      const row=state.import.rows[Number(select.dataset.importTarget)],choice=select.value;
      row._choiceMade=Boolean(choice);row.reviewed=false;
      if(!choice){renderImport();return;}
      row.ptran=reviewedPtran(row);
      row.decision=['new','ignore'].includes(choice)?choice:'update';row.asset_id=row.decision==='update'?choice:null;
      const asset=state.assets.find(a=>a.id===row.asset_id);row.expected_updated_at=asset?.updated_at||null;
      if(row.decision==='new'&&!row.asset.categoria)row.asset.categoria=core.suggestCategory(row.asset.modelo);
      recomputeImportRow(row,asset);renderImport();
    });
    $$('[data-import-reviewed]').forEach(input=>input.onchange=()=>{const row=state.import.rows[Number(input.dataset.importReviewed)];row.reviewed=input.checked;updateImportFooter();});
    $$('[data-import-field]').forEach(input=>input.onchange=()=>{
      const row=state.import.rows[Number(input.dataset.importIndex)],field=input.dataset.importField;
      const ptran=ptranCorrectionFields.includes(field);
      if(ptran&&!row.ptran)row.ptran=reviewedPtran(row);
      const value=field==='provisoria'?(input.value==='true'?true:input.value==='false'?false:null):input.type==='checkbox'?input.checked:input.value||null;
      (ptran?row.ptran:row.asset)[field]=value;
      row.raw.human_corrections={...(row.raw.human_corrections||{}),[field]:value};row.reviewed=false;
      recomputeImportRow(row,state.assets.find(a=>a.id===row.asset_id));
      const check=$('[data-import-reviewed="'+input.dataset.importIndex+'"]');if(check)check.checked=false;
      const diffs=$('[data-import-diffs="'+input.dataset.importIndex+'"]');diffs.innerHTML=row.changes.map(change=>'<div class="fleet-import-diff"><strong>'+esc(fieldLabel(change.field))+'</strong><del>'+esc(display(change.before))+'</del><span>→</span><ins>'+esc(display(change.after))+'</ins></div>').join('');updateImportFooter();
    });
    $('#import-publish').onclick=publishImport;
  }
  function recomputeImportRow(row,asset) {
    row.changes=[];
    if(!asset){if(row.ptran)delete row.ptran.supersedes_id;return;}
    delete row.asset.categoria;
    Object.entries(row.asset).forEach(([field,value])=>{if(value!==''&&value!=null&&display(asset[field])!==display(value))row.changes.push({field,before:asset[field],after:value});});
    if(!row.ptran)return;
    const matching=core.currentRecords(asset.ptrans||[]).find(p=>row.ptran.numero_ptran?String(p.numero_ptran)===String(row.ptran.numero_ptran):row.ptran.numero_isc&&norm(p.numero_isc)===norm(row.ptran.numero_isc));
    if(matching){row.ptran.supersedes_id=matching.id;Object.entries(row.ptran).filter(([key])=>key!=='supersedes_id').forEach(([field,value])=>{if(value!==''&&value!=null&&display(matching[field])!==display(value))row.changes.push({field:'PTRAN.'+field,before:matching[field],after:value});});if(!row.changes.some(change=>change.field.startsWith('PTRAN.')))row.ptran=null;}
    else delete row.ptran.supersedes_id;
  }
  function setImportReviewed(checked) {
    state.import.rows.forEach(row=>{row.reviewed=checked&&row._choiceMade;});
    $$('[data-import-reviewed]').forEach(input=>{input.checked=state.import.rows[Number(input.dataset.importReviewed)].reviewed;});
    updateImportFooter();
  }
  function updateImportFooter() {
    $('#import-summary').innerHTML=importSummary().map(([label,value])=>'<div><strong>'+number(value)+'</strong><span>'+esc(label)+'</span></div>').join('');
    $('#import-progress').textContent=importProgress();$('#import-publish').disabled=!canPublish();
    const rows=state.import.rows,reviewed=rows.filter(row=>row.reviewed).length;
    $('#import-selection-count').textContent=reviewed+' de '+rows.length+' registros conferidos';
    $('#import-select-all').disabled=rows.every(row=>!row._choiceMade||row.reviewed);
    $('#import-deselect-all').disabled=reviewed===0;
  }
  async function publishImport() {
    if(!canPublish())return;
    if(!await confirmAction('Publicar atualização da frota?',state.import.rows.filter(row=>row.decision!=='ignore').length+' registro(s) serão consolidados no banco. O lote preservará a fonte original, as decisões de revisão e o histórico dos campos alterados.','Publicar atualização'))return;
    const button=$('#import-publish');button.disabled=true;$('#import-error').classList.add('hidden');
    try {
      const rows=state.import.rows.map(row=>({row_number:row.row_number,raw:row.raw,asset_id:row.asset_id,expected_updated_at:row.expected_updated_at,asset:row.asset,ptran:row.ptran,decision:row.decision,reviewed:row.reviewed}));
      const result=await api.publishImport(state.importBatch,state.importFile.name,rows);
      closeModal();await loadAssets();toast('Importação concluída: '+number(result?.updated_assets??result?.updated??rows.filter(r=>r.decision==='update').length)+' ativos atualizados e '+number(result?.new_assets??result?.created??rows.filter(r=>r.decision==='new').length)+' incluídos.');
      state.import=null;state.importFile=null;state.importBatch=null;
    } catch(error) {showFormError('import-error',errorMessage(error));}
    finally {if(button.isConnected)button.disabled=!canPublish();}
  }
  function exportView() {
    if(!state.filtered.length)return;
    const rows=state.filtered.map(asset=>{const p=latest(asset,'ptrans'),s=core.situation(asset);return {'UUID':asset.id,'Código':asset.asset_code||'','Identificação':asset.placa_identificador||'','Modelo':asset.modelo||'','Tipo':asset.tipo||'','Categoria':asset.categoria||'','Empresa':asset.empresa||'','Gerência':asset.gerencia||'','Responsável CPL':asset.responsavel_cpl||'','No contrato':asset.ativo_no_contrato===true?'Sim':asset.ativo_no_contrato===false?'Não':'Não confirmado','Status operacional':asset.status_operacional||'','Número PTRAN':p?.numero_ptran||'','ISC':p?.numero_isc||'','Status PTRAN':p?.status||'','Validade PTRAN':p?.data_validade||'','Situação':s.label,'Motivos':s.reasons.join('; '),'Atualização':asset.updated_at||''};});
    const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows),'Frota filtrada');XLSX.writeFile(workbook,'CPL-Frota-'+core.todayISO()+'.xlsx');toast('Visão filtrada exportada.');
  }
  document.addEventListener('error',event=>{
    const img=event.target;
    if(!(img instanceof HTMLImageElement)||!img.closest('.fleet-asset-thumb,.fleet-drawer-vehicle'))return;
    if(img.dataset.fallbackApplied)return;
    img.dataset.fallbackApplied='1';
    img.src='assets/frota/default-truck.svg';
  },true);
  document.addEventListener('click',event=>{
    const button=event.target.closest('button,a');
    if(button?.dataset.focus){focusDashboard(button.dataset.focus);return;}
    if(button?.dataset.kpiAction){
      const action=button.dataset.kpiAction;
      if(action==='all'){clearFilters();focusDashboard('assets');}
      if(action==='operational'){setFilter('situation','green');focusDashboard('assets');}
      if(action==='alerts'){setFilter('only_pending',true);focusDashboard('assets');}
      if(action==='documents')focusDashboard('documents');
      if(action==='maintenance')focusDashboard('maintenance');
      return;
    }
    if(button?.dataset.situationFilter){setFilter('situation',button.dataset.situationFilter);focusDashboard('assets');return;}
    if(button?.dataset.view){showView(button.dataset.view);return;}
    if(button?.hasAttribute('data-close-modal')){closeModal();return;}
    if(button?.hasAttribute('data-close-drawer')){closeDrawer();return;}
    if(button?.dataset.confirm){answerConfirm(button.dataset.confirm==='ok');return;}
    if(button?.dataset.openAsset){openAsset(button.dataset.openAsset);return;}
    if(button?.dataset.editAsset){const id=button.dataset.editAsset;unlock(()=>openAsset(id,'resumo',true));return;}
    if(button?.dataset.drawerTab){state.drawerTab=button.dataset.drawerTab;renderDetail();return;}
    if(button?.dataset.newRecord){recordForm(button.dataset.newRecord);return;}
    if(button?.dataset.editRecord){const kind=button.dataset.recordKind,record=state.detail?.[kind]?.find(r=>r.id===button.dataset.editRecord);recordForm(kind,record);return;}
    if(button?.dataset.movement){recordForm('movements',null,{tipo_movimento:button.dataset.movement});return;}
    if(button?.dataset.action){
      const action=button.dataset.action;
      if(action==='new-asset')unlock(()=>renderAssetForm({}));
      if(action==='pending-import')reviewPendingImport();
      if(action==='import')$('#fleet-import-file').click();
      if(action==='history-retry')loadHistory();
      if(action==='edit-current')unlock(()=>renderAssetForm(state.detail.asset));
      if(action==='cancel-asset-edit'){if(state.detail)renderDetail();else closeDrawer();}
      if(action==='unlock-import')unlock(()=>renderImport());
      return;
    }
    const row=event.target.closest('tr[data-asset]');if(row&&!event.target.closest('button'))openAsset(row.dataset.asset);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(!$('#fleet-confirm-overlay').classList.contains('hidden'))answerConfirm(false);else if(!$('#fleet-modal-overlay').classList.contains('hidden'))closeModal();else if(!$('#fleet-drawer-overlay').classList.contains('hidden'))closeDrawer();return;}
    const row=event.target.closest('tr[data-asset]');if(row&&event.target===row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openAsset(row.dataset.asset);}
    if(event.key==='Tab'){
      const overlay=!$('#fleet-confirm-overlay').classList.contains('hidden')?$('#fleet-confirm-overlay'):!$('#fleet-modal-overlay').classList.contains('hidden')?$('#fleet-modal-overlay'):!$('#fleet-drawer-overlay').classList.contains('hidden')?$('#fleet-drawer-overlay'):null;
      if(overlay){const focusables=$$('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',overlay).filter(el=>el.offsetParent!==null);if(!focusables.length)return;const first=focusables[0],last=focusables.at(-1);if(event.shiftKey&&(document.activeElement===first||!overlay.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    }
  });
  ['fleet-drawer-overlay','fleet-modal-overlay','fleet-confirm-overlay'].forEach(id=>$('#'+id).addEventListener('click',event=>{if(event.target!==event.currentTarget)return;if(id==='fleet-confirm-overlay')answerConfirm(false);else if(id==='fleet-modal-overlay')closeModal();else closeDrawer();}));
  let searchTimer;
  $$('[data-filter]').forEach(el=>el.addEventListener(el.tagName==='INPUT'&&el.type!=='checkbox'?'input':'change',()=>{clearTimeout(searchTimer);if(el.type==='search'||el.dataset.filter==='placa_identificador')searchTimer=setTimeout(readFilters,180);else readFilters();}));
  $('#filter-toggle').onclick=()=>{const expanded=$('#filter-toggle').getAttribute('aria-expanded')==='true';$('#filter-toggle').setAttribute('aria-expanded',String(!expanded));$('#fleet-advanced-filters').classList.toggle('hidden',expanded);};
  $('#analytics-toggle').onclick=()=>{const wrap=$('#fleet-secondary-analytics'),expanded=!wrap.classList.contains('hidden');wrap.classList.toggle('hidden',expanded);$('#analytics-toggle').setAttribute('aria-expanded',String(!expanded));$('#analytics-toggle').innerHTML=icon('chart-no-axes-combined')+(expanded?' Ver análises detalhadas ':' Ocultar análises detalhadas ')+icon(expanded?'chevron-down':'chevron-up');if(!expanded)requestAnimationFrame(()=>Object.values(state.charts).forEach(c=>c.resize()));icons();};
  $('#clear-filters').onclick=clearFilters;
  $('#refresh-button').onclick=loadAssets;
  $('#unlock-button').onclick=async()=>{if(editing()){if(await confirmAction('Encerrar edição?','O painel voltará ao modo somente leitura.','Encerrar sessão')){try{await api.lock();toast('Sessão de edição encerrada.');}catch(error){toast('A edição foi encerrada nesta página. '+errorMessage(error),'yellow');}}}else unlock();};
  $('#new-asset-button').onclick=()=>renderAssetForm({});$('#import-button').onclick=()=>$('#fleet-import-file').click();
  $('#pending-import-button').onclick=reviewPendingImport;
  $('#fleet-import-file').onchange=event=>{const file=event.target.files[0];event.target.value='';importFile(file);};
  $('#table-prev').onclick=()=>{state.page--;renderTable();icons();};$('#table-next').onclick=()=>{state.page++;renderTable();icons();};$('#export-button').onclick=exportView;
  $('#quality-type').onchange=renderQuality;$('#history-more').onclick=()=>loadHistory(true);
  $('#history-filters').onsubmit=event=>{event.preventDefault();state.historyFilters=formData(event.currentTarget);loadHistory();};
  $('#history-filters').onreset=()=>setTimeout(()=>{state.historyFilters={};loadHistory();},0);
  window.addEventListener('fleet-edit-change',()=>{
    const enabled=editing();updateEditing();
    if(!enabled&&$('#record-form'))closeModal();
    if(state.detail&&(!enabled||$('#asset-form')==null))renderDetail();
    if(!enabled&&!state.detail&&$('#asset-form'))closeDrawer();
    if(state.import&&$('#import-publish')){renderImport();(enabled?$('#fleet-modal'):$('[data-action="unlock-import"]'))?.focus();}
  });
  // FleetAPI owns pagehide revocation with fetch keepalive. Clearing its token in
  // beforeunload would prevent that best-effort backend revocation from running.
  icons();renderDashboard();renderAlerts();renderQuality();loadAssets();
}());
