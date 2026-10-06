(function () {
  let model = null;
  let fileName = '';
  let liveModel = null;
  let liveFileName = '';
  let paretoChart = null;
  let initialized = false;
  const PAGE_SIZE = 6;
  const pageState = { lookahead:0, offenders:0, metrics:0 };
  let lastScopeKey = '';
  let focusedSourceIndex = null;
  let curationMode = false;
  let curationMasterPassword = '';
  let photos = [];
  let pendingPhotos = [];
  let photosWeek = null;
  let photosUnitKey = '';
  let photosPhaseKey = '';
  let photosGroupingKey = '';
  let photoReplaceTarget = null;
  let metricGroupAll = true;
  const metricSelectedGroups = new Set();
  let metricStepAll = true;
  const metricSelectedSteps = new Set();
  let metricTreeStructureKey = null;
  let metricSelectionsByScope = {};
  let activeMetricScopeKey = '';
  let importedWeekPayload = {};

  let draggedLayoutCard = null;
  let layoutDirty = false;
  let layoutLoaded = false;
  const PB_LAYOUT_STORAGE_KEY = 'epc15_pb_layout_v1';
  const PB_LAYOUT_CARDS = [
    { id:'physical', selector:'.pb-physical-card', defaultColumn:'left' },
    { id:'offenders', selector:'.pb-offenders-card', defaultColumn:'left' },
    { id:'photos', selector:'.pb-photo-card', defaultColumn:'right' },
    { id:'highlights', selector:'.pb-week-highlights-card', defaultColumn:'right' },
    { id:'metrics', selector:'.pb-metrics-card', defaultColumn:'right' },
    { id:'focus', selector:'.pb-focus-card', defaultColumn:'full' }
  ];
  const PB_DEFAULT_LAYOUT = {
    left:['physical','offenders'],
    right:['photos','highlights','metrics'],
    full:['focus']
  };

  const pt1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const pt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pt0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const money = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const pct = value => Number.isFinite(value) ? pt1.format(value * 100) + '%' : 'N/D';
  const pts = value => Number.isFinite(value) ? (value > 0 ? '+' : '') + pt1.format(value * 100) + '%' : 'N/D'; // desvios sempre exibidos com símbolo %
  const deviationTone = value => !Number.isFinite(value) || value === 0 ? 'neutral' : value > 0 ? 'positive' : 'negative';
  function applyDeviationTone(element, value, container) {
    const tone=deviationTone(value);
    [element,container].filter(Boolean).forEach(node=>{
      node.classList.remove('positive','negative','neutral');
      node.classList.add(tone);
    });
    return tone;
  }
  const qty = value => Number.isFinite(value) ? pt0.format(value) : '—';
  const brl = value => Number.isFinite(value) ? money.format(value) : 'N/D';

  const FILTERS = [
    { id:'pb-level-filter', field:'level', label:'Nível', all:'Todos' },
    { id:'pb-unit-filter', field:'unit', label:'Entrega', all:'Todas as Entregas' },
    { id:'pb-phase-filter', field:'phase', label:'Fase', all:'Todas as Fases' },
    { id:'pb-subphase-filter', field:'subphase', label:'Subfase', all:'Todas as Subfases' },
    { id:'pb-grouping-filter', field:'grouping', label:'Agrupamento', all:'Todos os Agrupamentos' },
    { id:'pb-component-filter', field:'component', label:'Componente', all:'Todos os Componentes' },
    { id:'pb-step-filter', field:'step', label:'Etapa', all:'Todas as Etapas' }
  ];

  function dateFull(date) {
    if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return 'N/D';
    return new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(date);
  }

  function selection() {
    const out = {};
    FILTERS.forEach(def => {
      const value = document.getElementById(def.id)?.value || '';
      out[def.field] = def.field === 'level' && value !== '' ? Number(value) : value;
    });
    out.week = Number(document.getElementById('pb-week-filter')?.value) || window.CoordinationWeek?.getSelectedWeek?.() || null;
    return out;
  }

  function allRows() {
    if (Array.isArray(model?.coordinationRows) && model.coordinationRows.length) return model.coordinationRows;
    if (!model?.units) return [];
    const rows=[];
    model.units.forEach(unit => {
      rows.push({
        sourceIndex:unit.sourceIndex,level:1,unit:unit.rawName||unit.unit||unit.name,
        phase:'',subphase:'',grouping:'',component:'',step:'',criterion:'',
        weight:unit.weight,plannedValue:unit.plannedValue,actualValue:unit.actualValue,
        attackPlannedValue:unit.attackPlannedValue,attackActualValue:unit.attackActualValue,
        attackValueVariance:unit.attackValueVariance,
        attackPlannedQuantity:unit.attackPlannedQuantity,attackActualQuantity:unit.attackActualQuantity,
        attackQuantityVariance:unit.attackQuantityVariance,
        measureUnit:unit.measureUnit,planned:unit.planned,actual:unit.actual,variance:unit.variance,weightedVariance:unit.weightedVariance
      });
      (unit.phases||[]).forEach(row=>rows.push({...row,unit:unit.rawName||row.unit}));
      (unit.details||[]).forEach(row=>rows.push({...row,unit:unit.rawName||row.unit}));
    });
    const seen=new Set();
    return rows.filter(row => {
      const key=String(row.sourceIndex)+'|'+String(row.level)+'|'+String(row.unit)+'|'+String(row.phase)+'|'+String(row.criterion);
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function hierarchyLevels(sourceModel=model) {
    const rows = Array.isArray(sourceModel?.coordinationRows) ? sourceModel.coordinationRows : [];
    return [...new Set(rows.map(r=>Number(r.level)).filter(Number.isFinite))].sort((a,b)=>a-b);
  }

  function hasCompleteHierarchy(sourceModel=model) {
    const levels=hierarchyLevels(sourceModel);
    return [1,2,3,4,5,6].every(level=>levels.includes(level));
  }

  function fieldValue(row, field) {
    if (field === 'level') return Number(row.level);
    return String(row[field] || '').trim();
  }

  function matches(row, sel, fields=FILTERS.map(f=>f.field)) {
    return fields.every(field => {
      const selected=sel[field];
      if (selected === '' || selected == null || (field==='level' && !Number.isFinite(selected))) return true;
      return fieldValue(row,field) === selected;
    });
  }

  function hasPhysicalData(row) {
    // Só entra nos filtros quando Y (Previsto) E Z (Realizado) possuem valor numérico.
    // Zero continua sendo um valor válido.
    return Number.isFinite(row?.planned) && Number.isFinite(row?.actual);
  }

  function rowsWithPhysicalData() {
    return allRows().filter(hasPhysicalData);
  }

  function populateHierarchyFilters() {
    // Os dropdowns exibem somente opções cujas linhas possuem dado em Y (Previsto) E em Z (Realizado).
    // Zero é dado válido; se qualquer uma das duas células estiver vazia/sem número, a opção é descartada.
    const rows=rowsWithPhysicalData();
    const selected=selection();
    const prior=[];
    FILTERS.forEach(def => {
      const el=document.getElementById(def.id);
      if(!el) return;
      const prev=selected[def.field];
      const candidates=rows.filter(row => matches(row,selected,prior));
      let values;
      if (def.field === 'level') {
        values=[...new Set(candidates.map(row=>Number(row.level)).filter(Number.isFinite))]
          .sort((a,b)=>a-b);
      } else {
        values=[...new Set(candidates.map(row=>fieldValue(row,def.field)).filter(Boolean))]
          .sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
      }
      el.innerHTML='<option value="">'+esc(def.all)+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(def.field==='level'?'Nível '+v:v)+'</option>').join('');
      const prevString=prev == null ? '' : String(prev);
      if([...el.options].some(o=>o.value===prevString)) el.value=prevString;
      else el.value='';
      selected[def.field]=def.field==='level' && el.value!=='' ? Number(el.value) : el.value;
      prior.push(def.field);
    });
  }

  function filteredRows() {
    const sel=selection();
    return allRows().filter(row=>matches(row,sel));
  }

  function hierarchyDepth(sel) {
    if (sel.step) return 6;
    if (sel.component) return 5;
    if (sel.grouping) return 4;
    if (sel.subphase) return 3;
    if (sel.phase) return 2;
    if (sel.unit) return 1;
    return 0;
  }

  function hasCoordinationDetailSelection(sel=selection()) {
    // A análise detalhada começa assim que houver uma Entrega + Fase específicas.
    // Subfase, Agrupamento, Componente e Etapa apenas refinam essa mesma visão.
    return Boolean(sel.unit && sel.phase);
  }

  function updateCoordinationDetailMode() {
    const page=document.getElementById('page-pb');
    if(!page) return false;
    const active=hasCoordinationDetailSelection();
    page.classList.toggle('pb-detail-mode',active);
    return active;
  }

  function hasDeviation(row) {
    return Number.isFinite(row?.variance) && Math.abs(row.variance) > 0.0000005;
  }

  function presentationRows() {
    const rows=filteredRows();
    if(!rows.length) return [];
    return rows
      .filter(row=>Number(row.level)===5 && hasPhysicalData(row))
      .sort((a,b)=>(a.sourceIndex??0)-(b.sourceIndex??0));
  }

  function rowLabel(row) {
    return row?.criterion || row?.step || row?.component || row?.grouping || row?.subphase || row?.phase || row?.unit || 'Item';
  }

  function rowPath(row) {
    if(!row) return '';
    return [
      row.unit,
      row.phase,
      row.subphase,
      row.grouping,
      row.component,
      row.step,
      row.criterion
    ].filter(Boolean).join(' › ');
  }

  function normalizePhotoPhase(value) {
    return String(value || '').trim().toLocaleLowerCase('pt-BR');
  }

  function photoFilterContext() {
    const sel=selection();
    const unitName=String(sel.unit || '').trim();
    const phaseName=String(sel.phase || '').trim();
    const groupingName=String(sel.grouping || '').trim();
    return {
      unitName,
      unitKey:unitName ? normalizePhotoPhase(unitName) : '',
      phaseName,
      phaseKey:phaseName ? normalizePhotoPhase(phaseName) : '',
      groupingName,
      groupingKey:groupingName ? normalizePhotoPhase(groupingName) : ''
    };
  }

  function photoUploadScope() {
    const scope=photoFilterContext();
    return scope.unitName && scope.phaseName ? scope : null;
  }

  function aggregate(rows) {
    if(!rows.length) return null;
    const weighted=field=>{
      let sum=0, wsum=0;
      rows.forEach(row=>{
        if(!Number.isFinite(row[field])) return;
        const w=Number.isFinite(row.weight)&&row.weight>0 ? row.weight :
          Number.isFinite(row.plannedValue)&&row.plannedValue>0 ? row.plannedValue : 1;
        sum+=row[field]*w; wsum+=w;
      });
      return wsum?sum/wsum:null;
    };
    const planned=weighted('planned');
    const actual=weighted('actual');
    return {
      level:Math.min(...rows.map(r=>Number(r.level)).filter(Number.isFinite)),
      planned,actual,
      variance:Number.isFinite(planned)&&Number.isFinite(actual)?actual-planned:null,
      weightedVariance:rows.reduce((a,r)=>a+(Number.isFinite(r.weightedVariance)?r.weightedVariance:0),0),
      weight:rows.reduce((a,r)=>a+(Number.isFinite(r.weight)?r.weight:0),0),
      plannedValue:rows.reduce((a,r)=>a+(Number.isFinite(r.plannedValue)?r.plannedValue:0),0),
      actualValue:rows.reduce((a,r)=>a+(Number.isFinite(r.actualValue)?r.actualValue:0),0),
      attackPlannedValue:rows.reduce((a,r)=>a+(Number.isFinite(r.attackPlannedValue)?r.attackPlannedValue:0),0),
      attackActualValue:rows.reduce((a,r)=>a+(Number.isFinite(r.attackActualValue)?r.attackActualValue:0),0)
    };
  }

  function scopeSummary() {
    const sel=selection();
    if(!Object.values(sel).some((v,i)=>i<FILTERS.length && v!=='' && v!=null)) return model?.contract || null;
    const rows=filteredRows();
    if(!rows.length) return null;
    const desired=Number.isFinite(sel.level)?sel.level:hierarchyDepth(sel);
    if(desired>0) {
      const exact=rows.filter(r=>Number(r.level)===desired);
      if(exact.length===1) return exact[0];
      if(exact.length>1) return aggregate(exact);
    }
    return aggregate(presentationRows());
  }

  function currentHierarchyRow() {
    const sel=selection();
    const depth=hierarchyDepth(sel);
    if(depth<=0) return null;
    const exact=filteredRows().filter(row=>Number(row.level)===depth);
    return exact.length===1 ? exact[0] : null;
  }

  function focusCandidates() {
    const current=currentHierarchyRow();
    const children=presentationVisibleRows(presentationRows()).filter(hasPhysicalData);
    const rows=[];
    if(current && (curationMode || !isHidden(current))) rows.push(current);
    children.forEach(row=>{
      if(!rows.some(existing=>Number(existing.sourceIndex)===Number(row.sourceIndex))) rows.push(row);
    });
    return rows;
  }

  function populateRowFilter() {
    const el=document.getElementById('pb-row-filter');
    if(!el) return;
    const prev=el.value;
    const current=currentHierarchyRow();
    const rows=focusCandidates();
    el.innerHTML='<option value="">Selecione um item</option>'+rows.map(row=>{
      const isCurrent=current && Number(current.sourceIndex)===Number(row.sourceIndex);
      const label=(isCurrent?'Selecionado • ':'')+rowLabel(row);
      const line=Number.isFinite(row.sourceIndex)?' • linha '+(row.sourceIndex+1):'';
      return '<option value="'+esc(row.sourceIndex)+'">'+esc(label+line)+'</option>';
    }).join('');
    const focused = Number.isFinite(focusedSourceIndex) ? String(focusedSourceIndex) : '';
    if(focused && [...el.options].some(o=>o.value===focused)) el.value=focused;
    else if(prev && [...el.options].some(o=>o.value===prev)) el.value=prev;
    else if(current) el.value=String(current.sourceIndex);
    else if(rows.length===1) el.value=String(rows[0].sourceIndex);
    else el.value='';
  }

  function focusedRow() {
    if (Number.isFinite(focusedSourceIndex)) {
      const explicit=allRows().find(r=>Number(r.sourceIndex)===Number(focusedSourceIndex));
      if(explicit) return explicit;
    }
    const rawId=document.getElementById('pb-row-filter')?.value || '';
    const id=rawId === '' ? NaN : Number(rawId);
    if(Number.isFinite(id)) return allRows().find(r=>Number(r.sourceIndex)===id) || null;
    const current=currentHierarchyRow();
    if(current && (curationMode || !isHidden(current))) return current;
    const rows=focusCandidates();
    return rows.length===1 ? rows[0] : null;
  }

  function notesKey(weekNo) {
    const week=Number(weekNo || selection().week || window.CoordinationWeek?.getSelectedWeek?.());
    return 'epc15_coordination_excel_notes_v1::W'+(Number.isFinite(week)?week:'NOW');
  }

  function readJson(key,fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch(_) { return fallback; }
  }

  function writeJson(key,value) {
    try { localStorage.setItem(key,JSON.stringify(value)); } catch(_) {}
  }

  function notes(weekNo) {
    return readJson(notesKey(weekNo),{});
  }

  function noteFor(row) {
    if(!row || !Number.isFinite(row.sourceIndex)) return {};
    return notes()[String(row.sourceIndex)] || {};
  }

  function isHidden(row) {
    return Boolean(noteFor(row).hidden);
  }

  function presentationVisibleRows(rows) {
    return curationMode ? rows : rows.filter(row => !isHidden(row));
  }

  function setHidden(row, hidden) {
    if (!curationMode || !row || !Number.isFinite(row.sourceIndex)) return;
    const all=notes();
    const id=String(row.sourceIndex);
    all[id]=all[id]||{};
    all[id].hidden=Boolean(hidden);
    all[id].hiddenUpdatedAt=new Date().toISOString();
    writeJson(notesKey(),all);
    if (hidden && Number(focusedSourceIndex)===Number(row.sourceIndex)) focusedSourceIndex=null;
    metricTreeStructureKey=null;
    renderFocus();
    renderActivities();
    renderWeekHighlights();
    renderOffenders();
    renderMetrics();
    renderPareto();
    saveManualOnly().catch(console.error);
    const feedback=document.getElementById('pb-save-feedback');
    if(feedback){
      feedback.textContent=hidden ? 'Item ocultado da apresentação' : 'Item reexibido';
      feedback.dataset.tone='ok';
    }
  }

  function normalizePbLayout(layout) {
    const known=new Set(PB_LAYOUT_CARDS.map(item=>item.id));
    const seen=new Set();
    const clean={left:[],right:[],full:[]};
    ['left','right','full'].forEach(column=>{
      const values=Array.isArray(layout?.[column]) ? layout[column] : [];
      values.forEach(id=>{
        if(known.has(id) && !seen.has(id)){
          clean[column].push(id);
          seen.add(id);
        }
      });
    });
    PB_LAYOUT_CARDS.forEach(item=>{
      if(!seen.has(item.id)){
        clean[item.defaultColumn].push(item.id);
        seen.add(item.id);
      }
    });
    return clean;
  }

  function readLocalPbLayout() {
    try{
      const raw=localStorage.getItem(PB_LAYOUT_STORAGE_KEY);
      return raw ? normalizePbLayout(JSON.parse(raw)) : normalizePbLayout(PB_DEFAULT_LAYOUT);
    }catch(_){
      return normalizePbLayout(PB_DEFAULT_LAYOUT);
    }
  }

  function storeLocalPbLayout(layout) {
    try{ localStorage.setItem(PB_LAYOUT_STORAGE_KEY,JSON.stringify(normalizePbLayout(layout))); }catch(_){}
  }

  function pbLayoutCardById(id) {
    const def=PB_LAYOUT_CARDS.find(item=>item.id===id);
    return def ? document.querySelector('#page-pb '+def.selector) : null;
  }

  function capturePbLayout() {
    const left=document.querySelector('#page-pb .pb-column-left');
    const right=document.querySelector('#page-pb .pb-column-right');
    const full=document.querySelector('#page-pb .pb-column-full');
    const ids=column=>[...(column?.children || [])]
      .filter(el=>el.matches?.('[data-pb-layout-card]'))
      .map(el=>el.dataset.pbLayoutCard)
      .filter(Boolean);
    return normalizePbLayout({left:ids(left),right:ids(right),full:ids(full)});
  }

  function syncDelayContributionPlacement() {
    const offenders=document.querySelector('#page-pb .pb-offenders-card');
    const contribution=document.querySelector('#page-pb .pb-delay-contribution-card');
    if(!offenders || !contribution || !offenders.parentElement) return;
    if(contribution.parentElement!==offenders.parentElement || offenders.nextElementSibling!==contribution){
      offenders.insertAdjacentElement('afterend',contribution);
    }
  }

  function applyPbLayout(layout,{store=true}={}) {
    const normalized=normalizePbLayout(layout);
    const columns={
      left:document.querySelector('#page-pb .pb-column-left'),
      right:document.querySelector('#page-pb .pb-column-right'),
      full:document.querySelector('#page-pb .pb-column-full')
    };
    if(!columns.left || !columns.right || !columns.full) return normalized;
    ['left','right','full'].forEach(column=>{
      normalized[column].forEach(id=>{
        const card=pbLayoutCardById(id);
        if(card) columns[column].appendChild(card);
      });
    });
    syncDelayContributionPlacement();
    if(store) storeLocalPbLayout(normalized);
    return normalized;
  }

  function preparePbLayoutEditor() {
    PB_LAYOUT_CARDS.forEach(def=>{
      const card=document.querySelector('#page-pb '+def.selector);
      if(!card) return;
      card.dataset.pbLayoutCard=def.id;
      const head=card.querySelector(':scope > .pb-card-head');
      if(head && !head.querySelector('[data-pb-drag-handle]')){
        const handle=document.createElement('span');
        handle.className='pb-layout-drag-handle';
        handle.dataset.pbDragHandle='1';
        handle.setAttribute('role','button');
        handle.setAttribute('tabindex','0');
        handle.setAttribute('aria-label','Arrastar bloco');
        handle.title='Arraste para mudar este bloco de posição';
        handle.textContent='⠿ Arrastar';
        head.appendChild(handle);
      }
    });

    const actions=document.getElementById('pb-topbar-week-tools');
    if(actions && !document.getElementById('pb-layout-reset')){
      const reset=document.createElement('button');
      reset.id='pb-layout-reset';
      reset.type='button';
      reset.className='pb-layout-reset hidden';
      reset.textContent='↶ Voltar layout';
      reset.title='Restaurar a posição padrão das caixas da Reunião de Coordenação';
      reset.addEventListener('click',async()=>{
        if(!curationMode) return;
        if(!confirm('Voltar todas as caixas para o layout padrão da Reunião de Coordenação?')) return;
        applyPbLayout(PB_DEFAULT_LAYOUT);
        storeLocalPbLayout(PB_DEFAULT_LAYOUT);
        await persistPbLayout();
        render();
        const feedback=document.getElementById('pb-save-feedback');
        if(feedback){
          feedback.textContent='Layout padrão restaurado';
          feedback.dataset.tone='ok';
        }
      });
      const editButton=document.getElementById('pb-curation-edit');
      if(editButton?.nextSibling) actions.insertBefore(reset,editButton.nextSibling);
      else actions.appendChild(reset);
    }
  }

  async function persistPbLayout() {
    const layout=capturePbLayout();
    storeLocalPbLayout(layout);
    if(!curationMode || !curationMasterPassword || !window.CloudSync?.saveCoordinationLayout) return;
    const week=Number(window.CoordinationWeek?.getSelectedWeek?.());
    try{
      await window.CloudSync.saveCoordinationLayout({
        weekNo:week,
        layout,
        masterPassword:curationMasterPassword
      });
      const feedback=document.getElementById('pb-save-feedback');
      if(feedback){
        feedback.textContent='Layout salvo e sincronizado';
        feedback.dataset.tone='ok';
      }
    }catch(error){
      console.error('Falha ao salvar layout',error);
      const feedback=document.getElementById('pb-save-feedback');
      if(feedback){
        feedback.textContent='Layout mantido neste PC • falha ao sincronizar';
        feedback.dataset.tone='warning';
      }
    }
  }

  async function loadPbLayout() {
    preparePbLayoutEditor();
    applyPbLayout(readLocalPbLayout(),{store:false});
    if(layoutLoaded || !window.CloudSync?.ready?.() || !window.CloudSync?.loadCoordinationLayout) return;
    layoutLoaded=true;
    try{
      const remote=await window.CloudSync.loadCoordinationLayout();
      if(remote && Object.keys(remote).length){
        applyPbLayout(remote);
      }else{
        storeLocalPbLayout(capturePbLayout());
      }
    }catch(error){
      layoutLoaded=false;
      console.error('Falha ao carregar layout da coordenação',error);
    }
  }

  function enablePbLayoutDragEvents() {
    const page=document.getElementById('page-pb');
    if(!page || page.dataset.pbLayoutBound==='1') return;
    page.dataset.pbLayoutBound='1';

    page.addEventListener('dragstart',event=>{
      const handle=event.target.closest?.('[data-pb-drag-handle]');
      if(!handle || !curationMode){
        event.preventDefault();
        return;
      }
      const card=handle.closest('[data-pb-layout-card]');
      if(!card){
        event.preventDefault();
        return;
      }
      draggedLayoutCard=card;
      layoutDirty=false;
      card.classList.add('pb-layout-dragging');
      event.dataTransfer.effectAllowed='move';
      try{event.dataTransfer.setData('text/plain',card.dataset.pbLayoutCard||'');}catch(_){}
    });

    page.addEventListener('dragover',event=>{
      if(!curationMode || !draggedLayoutCard) return;
      const column=event.target.closest?.('.pb-column');
      if(!column || !column.closest('#page-pb')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect='move';

      const target=event.target.closest?.('[data-pb-layout-card]');
      if(target && target!==draggedLayoutCard && target.parentElement===column){
        const rect=target.getBoundingClientRect();
        const before=event.clientY < rect.top + rect.height/2;
        column.insertBefore(draggedLayoutCard,before ? target : target.nextSibling);
      }else if(!target){
        column.appendChild(draggedLayoutCard);
      }
      layoutDirty=true;
      document.querySelectorAll('#page-pb .pb-column').forEach(el=>el.classList.toggle('pb-layout-dropzone',el===column));
    });

    page.addEventListener('drop',event=>{
      if(!curationMode || !draggedLayoutCard) return;
      event.preventDefault();
      layoutDirty=true;
    });

    page.addEventListener('dragend',()=>{
      document.querySelectorAll('#page-pb .pb-column').forEach(el=>el.classList.remove('pb-layout-dropzone'));
      draggedLayoutCard?.classList.remove('pb-layout-dragging');
      draggedLayoutCard=null;
      syncDelayContributionPlacement();
      if(layoutDirty) persistPbLayout();
      layoutDirty=false;
    });
  }

  function closeCurationModal() {
    document.getElementById('pb-curation-master-modal')?.classList.add('hidden');
    const input=document.getElementById('pb-curation-password');
    if(input) input.value='';
    document.getElementById('pb-curation-error')?.classList.add('hidden');
  }

  function openCurationModal() {
    if (curationMode) {
      curationMode=false;
      curationMasterPassword='';
      updateCurationUI();
      render();
      return;
    }
    if(window.CoordinationWeek?.isLocked?.() && window.CoordinationWeek?.isMasterUnlocked?.()){
      curationMode=true;
      curationMasterPassword=window.CoordinationWeek?.getMasterPassword?.() || '';
      updateCurationUI();
      render();
      return;
    }
    document.getElementById('pb-curation-master-modal')?.classList.remove('hidden');
    setTimeout(()=>document.getElementById('pb-curation-password')?.focus(),0);
  }

  async function unlockCuration() {
    const password=document.getElementById('pb-curation-password')?.value || '';
    const week=selection().week || window.CoordinationWeek?.getSelectedWeek?.();
    const error=document.getElementById('pb-curation-error');
    try {
      const result=await window.CloudSync?.verifyCoordinationMaster?.(password,week);
      if(!result?.ok){
        if(error){
          error.textContent='Senha master incorreta.';
          error.classList.remove('hidden');
        }
        return;
      }
      window.CoordinationWeek?.unlockWeek?.(week,password);
      curationMode=true;
      curationMasterPassword=password;
      closeCurationModal();
      updateCurationUI();
      render();
    } catch(err) {
      if(error){
        error.textContent=err.message || 'Não foi possível liberar a edição.';
        error.classList.remove('hidden');
      }
    }
  }

  function finishCuration() {
    curationMode=false;
    curationMasterPassword='';
    updateCurationUI();
    render();
  }

  function updateCurationUI() {
    document.getElementById('pb-metric-stage-filter')?.classList.toggle('hidden',!curationMode);
    const metricDetails=document.getElementById('pb-metric-filter-details');
    if(metricDetails && !curationMode) metricDetails.open=false;
    const button=document.getElementById('pb-curation-edit');
    if(button){
      button.classList.toggle('active',curationMode);
      button.textContent=curationMode ? '✓' : '✎';
      button.title=curationMode ? 'Sair do modo de edição da exibição' : 'Editar exibição (senha master)';
    }
    document.getElementById('page-pb')?.classList.toggle('pb-curation-mode',curationMode);
    preparePbLayoutEditor();
    document.querySelectorAll('#page-pb [data-pb-drag-handle]').forEach(handle=>{
      handle.draggable=curationMode;
      handle.setAttribute('aria-disabled',curationMode?'false':'true');
    });
    document.getElementById('pb-layout-reset')?.classList.toggle('hidden',!curationMode);
    window.Dashboard?.refreshUnitNavigation?.();
  }

  function canEdit() {
    return window.CoordinationWeek?.canEdit?.() ?? true;
  }

  async function saveManualOnly() {
    const week=Number(window.CoordinationWeek?.getSelectedWeek?.());
    if(!Number.isFinite(week) || !window.CloudSync?.saveCoordinationManualWeek) return;
    const payload=exportWeekData(week);
    const masterPassword=window.CoordinationWeek?.getMasterPassword?.(week) || curationMasterPassword || '';
    const saved=await window.CloudSync.saveCoordinationManualWeek(week,payload,masterPassword);
    window.CoordinationWeek?.noteManualSaved?.(saved);
  }

  function saveFocusNote(field,value) {
    if(!canEdit()) return;
    const row=focusedRow();
    if(!row || !Number.isFinite(row.sourceIndex)) return;
    const all=notes();
    const id=String(row.sourceIndex);
    all[id]=all[id]||{};
    all[id][field]=String(value||'').trim();
    all[id].updatedAt=new Date().toISOString();
    writeJson(notesKey(),all);
    renderOffenders();
  }

  async function saveHighlightField(sourceIndex,field,value) {
    if(!canEdit() || !curationMode) return;
    const row=allRows().find(r=>Number(r.sourceIndex)===Number(sourceIndex));
    if(!row) return;

    const all=notes();
    const id=String(row.sourceIndex);
    all[id]=all[id]||{};
    const clean=String(value||'').trim();

    if(field==='title'){
      if(clean && clean!==rowLabel(row)) all[id].highlightTitle=clean;
      else delete all[id].highlightTitle;
    } else if(field==='subtitle'){
      if(clean) all[id].highlightSubtitle=clean;
      else delete all[id].highlightSubtitle;
    }

    all[id].updatedAt=new Date().toISOString();
    writeJson(notesKey(),all);
    renderWeekHighlights();

    const feedback=document.getElementById('pb-save-feedback');
    if(feedback){
      feedback.textContent='Destaque atualizado • salvando semana...';
      feedback.dataset.tone='info';
    }

    try{
      await saveManualOnly();
    }catch(error){
      console.error('Falha ao salvar destaque',error);
    }
  }

  function manualHighlights() {
    const all=notes();
    return Array.isArray(all.__manualHighlights) ? all.__manualHighlights : [];
  }

  function manualHighlightMatchesSelection(item) {
    const sel=selection();
    const itemUnit=String(item?.unit || '').trim();
    const itemPhase=String(item?.phase || '').trim();
    if(sel.unit && itemUnit && itemUnit!==sel.unit) return false;
    if(sel.phase && itemPhase && itemPhase!==sel.phase) return false;
    return true;
  }

  function manualHighlightText(item) {
    return String(item?.description || item?.title || '').trim();
  }

  function manualHighlightEvent(item) {
    const raw=String(item?.event || 'Destaque').trim();
    const key=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(key.includes('proxim')) return {key:'next-action',label:'Próxima Ação'};
    if(key.includes('atenc')) return {key:'attention',label:'Ponto de Atenção'};
    return {key:'highlight',label:'Destaque'};
  }

  async function persistManualHighlights(items) {
    const all=notes();
    all.__manualHighlights=items;
    all.__manualHighlightsUpdatedAt=new Date().toISOString();
    writeJson(notesKey(),all);
    renderWeekHighlights();
    try{
      await saveManualOnly();
    }catch(error){
      console.error('Falha ao salvar destaque manual',error);
    }
  }

  async function addManualHighlight(titleValue,subtitleValue) {
    if(!canEdit() || !curationMode) return;
    const title=String(titleValue||'').trim();
    const subtitle=String(subtitleValue||'').trim();
    if(!title && !subtitle) return;
    const items=manualHighlights().slice();
    items.push({
      id:'mh-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
      title:title || 'Novo destaque',
      subtitle,
      event:'Destaque'
    });
    await persistManualHighlights(items);
  }

  async function updateManualHighlight(id,field,value) {
    if(!canEdit() || !curationMode) return;
    const clean=String(value||'').trim();
    const items=manualHighlights().map(item=>{
      if(item.id!==id) return item;
      if(field==='description') return {...item,description:clean};
      if(field==='title') return {...item,title:clean||item.title||'Novo destaque'};
      if(field==='subtitle') return {...item,subtitle:clean};
      if(field==='event'){
        const allowed=['Destaque','Pontos de Atenção','Próximas Ações'];
        return {...item,event:allowed.includes(clean)?clean:'Destaque'};
      }
      return item;
    });
    await persistManualHighlights(items);
  }

  async function deleteManualHighlight(id) {
    if(!canEdit() || !curationMode) return;
    const items=manualHighlights().filter(item=>item.id!==id);
    await persistManualHighlights(items);
  }

  async function setAutomaticHighlightHidden(sourceIndex,hidden) {
    if(!canEdit() || !curationMode) return;
    const row=allRows().find(r=>Number(r.sourceIndex)===Number(sourceIndex));
    if(!row) return;
    const all=notes();
    const id=String(row.sourceIndex);
    all[id]=all[id]||{};
    all[id].highlightHidden=Boolean(hidden);
    all[id].updatedAt=new Date().toISOString();
    writeJson(notesKey(),all);
    renderWeekHighlights();
    try{
      await saveManualOnly();
    }catch(error){
      console.error('Falha ao salvar exclusão do destaque',error);
    }
  }

  async function saveMetricTitle(sourceIndex,value) {
    if(!curationMode || !canEdit()) return;
    const row=allRows().find(r=>Number(r.sourceIndex)===Number(sourceIndex));
    if(!row) return;
    const all=notes();
    const id=String(row.sourceIndex);
    all[id]=all[id]||{};
    const clean=String(value||'').trim();
    if(clean && clean!==rowLabel(row)) all[id].metricTitle=clean;
    else delete all[id].metricTitle;
    all[id].updatedAt=new Date().toISOString();
    writeJson(notesKey(),all);
    metricTreeStructureKey=null;
    renderMetrics();
    await saveManualOnly();
  }

  async function setMetricHidden(sourceIndex,hidden) {
    if(!curationMode || !canEdit()) return;
    const row=allRows().find(r=>Number(r.sourceIndex)===Number(sourceIndex));
    if(!row) return;
    const all=notes();
    const id=String(row.sourceIndex);
    all[id]=all[id]||{};
    all[id].metricHidden=Boolean(hidden);
    all[id].updatedAt=new Date().toISOString();
    writeJson(notesKey(),all);
    metricTreeStructureKey=null;
    renderMetrics();
    await saveManualOnly();
  }

  function metricHierarchyRows() {
    const rows=[...allRows()].sort((a,b)=>(a.sourceIndex??0)-(b.sourceIndex??0));
    const ctx={unit:'',phase:'',subphase:'',grouping:'',component:'',step:''};
    return rows.map(row=>{
      const level=Number(row.level);
      if(level<=1){ctx.phase='';ctx.subphase='';ctx.grouping='';ctx.component='';ctx.step='';}
      if(level<=2){ctx.subphase='';ctx.grouping='';ctx.component='';ctx.step='';}
      if(level<=3){ctx.grouping='';ctx.component='';ctx.step='';}
      if(level<=4){ctx.component='';ctx.step='';}
      if(level<=5){ctx.step='';}
      if(row.unit) ctx.unit=String(row.unit).trim();
      if(row.phase) ctx.phase=String(row.phase).trim();
      if(row.subphase) ctx.subphase=String(row.subphase).trim();
      if(row.grouping) ctx.grouping=String(row.grouping).trim();
      if(row.component) ctx.component=String(row.component).trim();
      if(row.step) ctx.step=String(row.step).trim();
      return {
        ...row,
        __metricUnit:String(row.unit||ctx.unit||'').trim(),
        __metricPhase:String(row.phase||ctx.phase||'').trim(),
        __metricSubphase:String(row.subphase||ctx.subphase||'').trim(),
        __metricGrouping:String(row.grouping||ctx.grouping||'').trim(),
        __metricComponent:String(row.component||ctx.component||'').trim(),
        __metricStep:String(row.step||ctx.step||'').trim()
      };
    });
  }

  function metricContextValue(row,field) {
    const map={
      unit:'__metricUnit',
      phase:'__metricPhase',
      subphase:'__metricSubphase',
      grouping:'__metricGrouping',
      component:'__metricComponent',
      step:'__metricStep'
    };
    return String(row?.[map[field]] || row?.[field] || '').trim();
  }

  function metricMatches(row,sel,fields) {
    return fields.every(field=>{
      const selected=sel[field];
      if(selected==='' || selected==null) return true;
      return metricContextValue(row,field)===String(selected);
    });
  }

  function metricGroupKey(row) {
    return [
      metricContextValue(row,'unit'),
      metricContextValue(row,'phase'),
      metricContextValue(row,'subphase'),
      metricContextValue(row,'grouping')
    ].join('||');
  }

  function metricSelectedGroupKeys() {
    if (metricGroupAll) return null;
    const groups=metricGroupRows();
    const valid=new Set(groups.map(metricGroupKey));
    const selected=new Set([...metricSelectedGroups].filter(key=>valid.has(key)));
    if(!metricStepAll){
      metricStageRows().forEach(row=>{
        if(metricSelectedSteps.has(String(row.sourceIndex))){
          const key=metricGroupKey(row);
          if(valid.has(key)) selected.add(key);
        }
      });
    }
    return selected;
  }

  function metricContextBySource() {
    const map = new Map();
    for (const row of metricHierarchyRows()) map.set(Number(row.sourceIndex), row);
    return map;
  }

  function metricRowMatchesSelection(row, keySet, contextBySource) {
    if (!keySet) return true;
    const source = contextBySource?.get(Number(row.sourceIndex)) || row;
    return keySet.has(metricGroupKey(source));
  }

  function metricHasExecution(row) {
    const executedValues=[
      row?.actual,
      row?.actualValue,
      row?.actualQuantity,
      row?.attackActualValue,
      row?.attackActualQuantity
    ];
    return executedValues.some(value=>Number.isFinite(Number(value)) && Number(value)>0);
  }

  function metricGroupRows() {
    const sel=selection();
    const hierarchy=metricHierarchyRows();
    const executedGroupKeys=new Set(
      hierarchy
        .filter(row=>Number(row.level)===6 && metricHasExecution(row))
        .map(metricGroupKey)
    );
    return hierarchy
      .filter(row=>Number(row.level)===4)
      .filter(row=>metricMatches(row,sel,['unit','phase','subphase','grouping']))
      .filter(row=>hasPhysicalData(row) || Number.isFinite(row.weightedVariance))
      .filter(row=>curationMode || metricHasExecution(row) || executedGroupKeys.has(metricGroupKey(row)))
      .filter(row=>curationMode || !isHidden(row))
      .sort((a,b)=>(a.sourceIndex??0)-(b.sourceIndex??0));
  }

  function metricStageRows() {
    const sel=selection();
    return metricHierarchyRows()
      .filter(row=>Number(row.level)===6)
      .filter(row=>metricMatches(row,sel,['unit','phase','subphase','grouping','component','step']))
      .filter(row=>
        Number.isFinite(row.attackPlannedQuantity) ||
        Number.isFinite(row.attackActualQuantity) ||
        Number.isFinite(row.attackQuantityVariance) ||
        Number.isFinite(row.planned) ||
        Number.isFinite(row.actual) ||
        Number.isFinite(row.weightedVariance)
      )
      .filter(row=>curationMode || metricHasExecution(row))
      .sort((a,b)=>(a.sourceIndex??0)-(b.sourceIndex??0));
  }

  function resetPagination() {
    pageState.lookahead=0;
    pageState.offenders=0;
    pageState.metrics=0;
  }

  function paged(items,key) {
    const pageSize=key==='offenders' ? 10 : PAGE_SIZE;
    const total=items.length;
    const totalPages=Math.max(1,Math.ceil(total/pageSize));
    pageState[key]=Math.max(0,Math.min(pageState[key]||0,totalPages-1));
    const start=pageState[key]*pageSize;
    return {items:items.slice(start,start+pageSize),total,totalPages,page:pageState[key],start};
  }

  function renderPager(id,key,info) {
    const host=document.getElementById(id);
    if(!host) return;
    if(!info||info.totalPages<=1){host.classList.add('hidden');host.innerHTML='';return;}
    host.classList.remove('hidden');
    host.innerHTML=
      '<button type="button" data-pb-page-key="'+key+'" data-pb-page-dir="-1"'+(info.page<=0?' disabled':'')+'>← Anterior</button>'+
      '<span>'+(info.page+1)+' / '+info.totalPages+' • '+info.total+' itens</span>'+
      '<button type="button" data-pb-page-key="'+key+'" data-pb-page-dir="1"'+(info.page>=info.totalPages-1?' disabled':'')+'>Próxima →</button>';
  }

  function renderFocus() {
    populateRowFilter();
    const row=focusedRow();
    const title=document.getElementById('pb-focus-title');
    const path=document.getElementById('pb-focus-path');
    const line=document.getElementById('pb-focus-row');
    const cause=document.getElementById('pb-focus-cause');
    const mitigation=document.getElementById('pb-focus-mitigation');

    if(!row) {
      if(title) title.textContent='Refine os filtros ou escolha um item';
      if(path) path.textContent='Avanço PLATAQ';
      if(line) line.textContent='Linha Excel: —';
      ['pb-focus-planned','pb-focus-actual','pb-focus-variance','pb-focus-weight'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='N/D';});
      applyDeviationTone(document.getElementById('pb-focus-variance'),null);
      if(cause){cause.value='';cause.disabled=true;}
      if(mitigation){mitigation.value='';mitigation.disabled=true;}
      return;
    }

    const note=noteFor(row);
    if(title) title.textContent=rowLabel(row);
    if(path) path.textContent=rowPath(row);
    if(line) line.textContent='Linha Excel: '+(Number(row.sourceIndex)+1)+' • Nível '+row.level;
    document.getElementById('pb-focus-planned').textContent=pct(row.planned);
    document.getElementById('pb-focus-actual').textContent=pct(row.actual);
    const focusVariance=document.getElementById('pb-focus-variance');
    focusVariance.textContent=pts(row.variance);
    applyDeviationTone(focusVariance,row.variance);
    document.getElementById('pb-focus-weight').textContent=Number.isFinite(row.weight)?pct(row.weight):'N/D';
    const editable=canEdit();
    if(cause){
      cause.value=note.cause||'';
      cause.disabled=!editable;
      cause.placeholder=editable ? 'Informe a causa do desvio para este item...' : 'Semana encerrada — somente leitura';
      cause.title=editable ? 'Digite a causa raiz deste item.' : 'Esta semana está encerrada e não pode mais ser alterada.';
    }
    if(mitigation){
      mitigation.value=note.mitigation||'';
      mitigation.disabled=!editable;
      mitigation.placeholder=editable ? 'Informe o que será feito para mitigar ou recuperar o desvio...' : 'Semana encerrada — somente leitura';
      mitigation.title=editable ? 'Digite o plano de mitigação deste item.' : 'Esta semana está encerrada e não pode mais ser alterada.';
    }
  }

  function renderPhysical() {
    const summary=scopeSummary();
    const sel=selection();
    const level=Number.isFinite(sel.level)?sel.level:hierarchyDepth(sel);
    const plannedValue=Number.isFinite(summary?.attackPlannedValue)?summary.attackPlannedValue:summary?.plannedValue;
    const actualValue=Number.isFinite(summary?.attackActualValue)?summary.attackActualValue:summary?.actualValue;

    document.getElementById('pb-wbs').textContent=level?'Nível '+level:'Contrato EPC-15';
    document.getElementById('pb-context-date').textContent='Avanço PLATAQ • Data Base: '+dateFull(model?.dataBase);
    document.getElementById('pb-file-info').textContent='';
    document.getElementById('pb-planned').textContent=pct(summary?.planned);
    document.getElementById('pb-actual').textContent=pct(summary?.actual);
    const gap=Number.isFinite(summary?.planned) && Number.isFinite(summary?.actual)
      ? summary.actual-summary.planned
      : summary?.variance;
    const gapElement=document.getElementById('pb-gap');
    if(gapElement){
      gapElement.textContent=pts(gap);
      applyDeviationTone(gapElement,gap,gapElement.closest('.pb-deviation-box'));
    }
    document.getElementById('pb-gap-days').textContent='';

    const note=document.getElementById('pb-summary-note');
    if(note){
      note.textContent='';
      note.classList.add('hidden');
    }
    renderPareto();
  }

  function paretoGroupingRows() {
    const sel=selection();
    const fields=['unit','phase','subphase','grouping'];
    const keySet=metricSelectedGroupKeys();
    const contextBySource=keySet ? metricContextBySource() : null;
    return allRows()
      .filter(row=>Number(row.level)===4)
      .filter(row=>matches(row,sel,fields))
      .filter(row=>metricRowMatchesSelection(row,keySet,contextBySource))
      .filter(row=>Number.isFinite(row.weightedVariance) && row.weightedVariance<0)
      .map(row=>({...row,__impact:Math.abs(row.weightedVariance)}))
      .sort((a,b)=>b.__impact-a.__impact)
      .slice(0,8);
  }

  function paretoAxisLabel(value) {
    const words=String(value||'').trim().split(/\s+/).filter(Boolean);
    const lines=[];
    let line='';
    for(const word of words){
      const next=(line+' '+word).trim();
      if(next.length<=18 || !line){
        line=next;
      }else{
        lines.push(line);
        line=word;
      }
      if(lines.length===2) break;
    }
    if(line && lines.length<2) lines.push(line);
    const consumed=lines.join(' ').length;
    if(String(value||'').trim().length>consumed && lines.length){
      lines[lines.length-1]=lines[lines.length-1].replace(/[.…]*$/,'')+'…';
    }
    return lines.length ? lines : ['—'];
  }

  function renderPareto() {
    const canvas=document.getElementById('pb-pareto-chart');
    const empty=document.getElementById('pb-pareto-empty');
    const rows=paretoGroupingRows();

    if(paretoChart){paretoChart.destroy();paretoChart=null;}
    if(!canvas||!rows.length){
      empty?.classList.remove('hidden');
      if(empty) empty.textContent='Sem desvio ponderado (AB) nos agrupamentos desta seleção.';
      document.getElementById('pb-pareto-marker').textContent='Sem desvios ponderados';
      return;
    }
    empty?.classList.add('hidden');
    const total=rows.reduce((a,r)=>a+r.__impact,0)||1;
    let acc=0;
    const cumulative=rows.map(r=>{acc+=r.__impact;return acc/total*100;});
    document.getElementById('pb-pareto-marker').textContent=pt0.format((cumulative[Math.min(cumulative.length-1,1)]||0))+'% em '+Math.min(rows.length,2)+' agrupamentos';

    paretoChart=new Chart(canvas,{
      data:{
        labels:rows.map(r=>paretoAxisLabel(r.grouping || rowLabel(r))),
        datasets:[
          {type:'bar',label:'Desvio ponderado',data:rows.map(r=>r.__impact*100),backgroundColor:'#ef5350',borderWidth:0,yAxisID:'y'},
          {type:'line',label:'Acumulado',data:cumulative,borderColor:'#4caf65',backgroundColor:'#4caf65',pointRadius:2,tension:.18,yAxisID:'y1'}
        ]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        layout:{padding:{top:2,right:2,bottom:2,left:0}},
        plugins:{
          legend:{display:false},
          tooltip:{
            callbacks:{
              title:items=>{
                const index=items?.[0]?.dataIndex;
                return Number.isFinite(index) ? (rows[index]?.grouping || rowLabel(rows[index])) : '';
              },
              label:ctx=>ctx.datasetIndex===0
                ? 'Desvio ponderado (AB): '+pt2.format(ctx.parsed.y)+'%'
                : 'Acumulado: '+pt0.format(ctx.parsed.y)+'%'
            }
          }
        },
        scales:{
          x:{
            grid:{display:false},
            ticks:{
              display:true,
              color:'#93a8bd',
              font:{size:10,weight:'800'},
              autoSkip:false,
              maxRotation:0,
              minRotation:0,
              padding:5
            },
            border:{display:false}
          },
          y:{
            beginAtZero:true,
            grid:{color:'rgba(148,163,184,.12)'},
            ticks:{color:'#7890aa',font:{size:8},callback:v=>pt2.format(v)+'%'}
          },
          y1:{beginAtZero:true,max:100,position:'right',grid:{display:false},ticks:{display:false}}
        }
      }
    });
  }

  function delayContributionRows() {
    const sel=selection();
    let rows=[];

    if(!sel.grouping){
      // Mesmo universo do Pareto (Nível 4 / AB negativo).
      // O AB define relevância/ordenação; o número exibido é o desvio real (Real - Previsto).
      rows=paretoGroupingRows().map(row=>({
        label:String(row.grouping || rowLabel(row)).trim() || 'Agrupamento',
        impact:Math.abs(row.weightedVariance),
        deviation:Number.isFinite(row.variance) ? row.variance : null,
        level:4
      }));
    }else{
      // Dentro de um agrupamento, detalha as etapas Nível 6.
      const fields=['unit','phase','subphase','grouping','component','step'];
      rows=allRows()
        .filter(row=>Number(row.level)===6)
        .filter(row=>matches(row,sel,fields))
        .filter(row=>Number.isFinite(row.weightedVariance) && row.weightedVariance<0)
        .map(row=>({
          label:String(row.step || row.component || row.criterion || rowLabel(row)).trim() || 'Etapa',
          impact:Math.abs(row.weightedVariance),
          deviation:Number.isFinite(row.variance) ? row.variance : null,
          level:6
        }));

      if(!rows.length){
        rows=paretoGroupingRows().map(row=>({
          label:String(row.grouping || rowLabel(row)).trim() || 'Agrupamento',
          impact:Math.abs(row.weightedVariance),
          deviation:Number.isFinite(row.variance) ? row.variance : null,
          level:4
        }));
      }
    }

    // Se houver rótulos repetidos, mantém a ocorrência de maior contribuição ponderada.
    const byLabel=new Map();
    rows.forEach(item=>{
      const current=byLabel.get(item.label);
      if(!current || item.impact>current.impact) byLabel.set(item.label,item);
    });

    const items=[...byLabel.values()]
      .sort((a,b)=>b.impact-a.impact)
      .slice(0,5);

    const maxImpact=Math.max(0,...items.map(item=>item.impact));
    return items.map(item=>({
      ...item,
      barRatio:maxImpact>0 ? item.impact/maxImpact*100 : 0
    }));
  }

  function renderDelayContribution() {
    const host=document.getElementById('pb-delay-contribution-list');
    const totalEl=document.getElementById('pb-delay-contribution-total');
    if(!host) return;

    if(!hasCoordinationDetailSelection()){
      host.innerHTML='';
      if(totalEl) totalEl.textContent='0 itens';
      return;
    }

    const rows=delayContributionRows();
    const sel=selection();
    const scopeEl=document.getElementById('pb-delay-contribution-scope');
    if(scopeEl){
      scopeEl.textContent=sel.grouping
        ? 'Detalhamento: '+sel.grouping+' • número = desvio real (Real − Previsto)'
        : 'Número = desvio real (Real − Previsto) • barras ordenadas pela contribuição ponderada (AB)';
    }
    if(totalEl) totalEl.textContent=rows.length+' '+(rows.length===1?'item':'itens');

    if(!rows.length){
      host.innerHTML='<div class="pb-empty-light">Nenhuma contribuição negativa para o desvio nesta seleção.</div>';
      return;
    }

    host.innerHTML=rows.map(row=>
      '<div class="pb-delay-contribution-row">'+
        '<span class="pb-delay-contribution-label" title="'+esc(row.label)+'">'+esc(row.label)+'</span>'+
        '<div class="pb-delay-contribution-track" title="Magnitude da contribuição ponderada (AB)"><i style="width:'+Math.max(2,Math.min(100,row.barRatio))+'%"></i></div>'+
        '<strong class="pb-delay-real-deviation '+deviationTone(row.deviation)+'" title="Desvio real = Real − Previsto">'+esc(pts(row.deviation))+'</strong>'+
      '</div>'
    ).join('');
  }

  function importPhotoFiles(fileList) {
    const scope=photoUploadScope();
    if(!scope){
      alert('Selecione primeiro uma ENTREGA e uma FASE específicas. Cada foto será salva vinculada à Entrega, Fase e Semana selecionadas.');
      return;
    }
    if(!canEdit()){
      alert('Esta semana está encerrada e não pode mais ser alterada.');
      return;
    }
    const files=[...Array.from(fileList||[])].filter(file=>String(file?.type||'').startsWith('image/'));
    if(!files.length) return;
    const invalid=files.find(file=>file.size>10*1024*1024);
    if(invalid){
      alert('Cada foto deve ter no máximo 10 MB.');
      return;
    }
    const currentWeek=Number(window.CoordinationWeek?.getSelectedWeek?.());
    files.forEach((file,index)=>{
      pendingPhotos.push({
        id:'pending-'+Date.now()+'-'+index+'-'+Math.random().toString(36).slice(2,7),
        pending:true,
        file,
        week_no:currentWeek,
        unit_name:scope.unitName,
        unit_key:scope.unitKey,
        phase_name:scope.phaseName,
        phase_key:scope.phaseKey,
        grouping_name:scope.groupingName || '',
        grouping_key:scope.groupingKey || '',
        signed_url:URL.createObjectURL(file)
      });
    });
    pageState.lookahead=0;
    renderActivities();
    const feedback=document.getElementById('pb-save-feedback');
    if(feedback){
      feedback.textContent=files.length+(files.length===1?' foto pronta para salvar em '+scope.phaseName:' fotos prontas para salvar em '+scope.phaseName);
      feedback.dataset.tone='info';
    }
  }

  async function loadPhotos(weekNo, force=false) {
    const week=Number(weekNo || window.CoordinationWeek?.getSelectedWeek?.());
    const scope=photoFilterContext();
    if(!Number.isFinite(week) || !window.CloudSync?.ready?.()){
      photos=[];
      photosWeek=week;
      photosUnitKey=scope.unitKey;
      photosPhaseKey=scope.phaseKey;
      photosGroupingKey=scope.groupingKey;
      renderActivities();
      return [];
    }
    if(!force && photosWeek===week && photosUnitKey===scope.unitKey && photosPhaseKey===scope.phaseKey && photosGroupingKey===scope.groupingKey){
      renderActivities();
      return photos;
    }
    try{
      const rows=await window.CloudSync.listCoordinationPhotos(week,scope.unitKey,scope.phaseKey,scope.groupingKey);
      photos=rows;
      photosWeek=week;
      photosUnitKey=scope.unitKey;
      photosPhaseKey=scope.phaseKey;
      photosGroupingKey=scope.groupingKey;
      renderActivities();
      return rows;
    } catch(error){
      console.error('Falha ao carregar registro fotográfico',error);
      photos=[];
      photosWeek=week;
      photosUnitKey=scope.unitKey;
      photosPhaseKey=scope.phaseKey;
      photosGroupingKey=scope.groupingKey;
      renderActivities();
      return [];
    }
  }

  async function savePendingPhotos(weekNo) {
    const week=Number(weekNo || window.CoordinationWeek?.getSelectedWeek?.());
    const queue=pendingPhotos.filter(photo=>Number(photo.week_no)===week);
    if(!queue.length){
      await loadPhotos(week,true);
      return {saved:0};
    }
    let saved=0;
    const failed=[];
    for(const photo of queue){
      try{
        await window.CloudSync.uploadCoordinationPhoto({
          weekNo:week,
          scope:{
            unitName:photo.unit_name,unitKey:photo.unit_key,
            phaseName:photo.phase_name,phaseKey:photo.phase_key,
            groupingName:photo.grouping_name || '',groupingKey:photo.grouping_key || ''
          },
          file:photo.file,
          masterPassword:window.CoordinationWeek?.getMasterPassword?.(week) || curationMasterPassword || ''
        });
        saved++;
        try{URL.revokeObjectURL(photo.signed_url);}catch(_){}
      }catch(error){
        console.error('Falha ao salvar foto da fase',error);
        failed.push(photo);
      }
    }
    pendingPhotos=pendingPhotos.filter(photo=>!queue.includes(photo)).concat(failed);
    await loadPhotos(week,true);
    if(failed.length) throw new Error(failed.length+' foto(s) não puderam ser salvas. Tente novamente.');
    return {saved};
  }

  async function deletePhoto(photoId) {
    if(!curationMode || !curationMasterPassword) return;
    const week=Number(window.CoordinationWeek?.getSelectedWeek?.());
    if(!confirm('Excluir esta foto definitivamente?')) return;
    try{
      await window.CloudSync.deleteCoordinationPhoto({
        weekNo:week,photoId,masterPassword:curationMasterPassword
      });
      await loadPhotos(week,true);
    }catch(error){
      alert(error.message || 'Não foi possível excluir a foto.');
    }
  }

  async function replacePhoto(photoId,file) {
    if(!curationMode || !curationMasterPassword || !(file instanceof File)) return;
    const existing=photos.find(item=>String(item.id)===String(photoId));
    const selectedScope=photoUploadScope();
    const scope=existing?.unit_name && existing?.phase_name
      ? {
          unitName:String(existing.unit_name),
          unitKey:String(existing.unit_key || normalizePhotoPhase(existing.unit_name)),
          phaseName:String(existing.phase_name),
          phaseKey:String(existing.phase_key || normalizePhotoPhase(existing.phase_name)),
          groupingName:String(existing.grouping_name || ''),
          groupingKey:String(existing.grouping_key || normalizePhotoPhase(existing.grouping_name || ''))
        }
      : selectedScope;
    if(!scope){
      alert('Esta foto não possui Entrega/Fase identificadas. Selecione uma Entrega e uma Fase específicas antes de substituir.');
      return;
    }
    try{
      await window.CloudSync.replaceCoordinationPhoto({
        weekNo:Number(window.CoordinationWeek?.getSelectedWeek?.()),
        photoId,
        scope,
        file,
        masterPassword:curationMasterPassword
      });
      await loadPhotos(window.CoordinationWeek?.getSelectedWeek?.(),true);
    }catch(error){
      alert(error.message || 'Não foi possível substituir a foto.');
    }
  }

  async function savePhotoCaption(photoId,value) {
    if(!curationMode || !curationMasterPassword) return;
    const week=Number(window.CoordinationWeek?.getSelectedWeek?.());
    const caption=String(value||'').trim();
    try{
      await window.CloudSync.updateCoordinationPhotoCaption({
        weekNo:week,
        photoId,
        caption,
        masterPassword:curationMasterPassword
      });
      const photo=photos.find(item=>String(item.id)===String(photoId));
      if(photo) photo.caption=caption;
      renderActivities();
    }catch(error){
      alert(error.message || 'Não foi possível salvar a legenda.');
    }
  }

  function renderActivities() {
    const scope=photoFilterContext();
    const uploadScope=photoUploadScope();
    const host=document.getElementById('pb-lookahead-list');
    const count=document.getElementById('pb-lookahead-count');
    const importButton=document.getElementById('pb-photo-import');
    if(importButton){
      importButton.disabled=!uploadScope || !canEdit();
      importButton.title=uploadScope
        ? 'Importar fotos para '+uploadScope.unitName+' / '+uploadScope.phaseName
        : 'Selecione uma ENTREGA e uma FASE específicas para importar fotos';
    }
    if(!host) return;

    const currentWeek=Number(window.CoordinationWeek?.getSelectedWeek?.());
    const remote=(photosWeek===currentWeek && photosUnitKey===scope.unitKey && photosPhaseKey===scope.phaseKey && photosGroupingKey===scope.groupingKey ? photos : []);
    const pending=pendingPhotos.filter(photo=>{
      if(Number(photo.week_no)!==currentWeek) return false;
      if(scope.unitKey && photo.unit_key!==scope.unitKey) return false;
      if(scope.phaseKey && photo.phase_key!==scope.phaseKey) return false;
      if(scope.groupingKey && photo.grouping_key!==scope.groupingKey) return false;
      return true;
    });
    const items=remote.concat(pending);
    const info=paged(items,'lookahead');

    if(count) count.textContent=items.length+(items.length===1?' foto':' fotos');
    renderPager('pb-lookahead-pager','lookahead',info);

    if(!items.length){
      let message='Nenhuma foto registrada nesta semana.';
      if(scope.unitName && scope.phaseName){
        message='Nenhuma foto registrada para <strong>'+esc(scope.unitName)+' / '+esc(scope.phaseName)+'</strong> nesta semana.';
      }else if(scope.unitName){
        message='Nenhuma foto registrada para <strong>'+esc(scope.unitName)+'</strong> nesta semana.';
      }else if(scope.phaseName){
        message='Nenhuma foto registrada em <strong>'+esc(scope.phaseName)+'</strong> nesta semana.';
      }
      if(uploadScope && canEdit()) message+=' Use “Importar fotos” para adicionar.';
      host.innerHTML='<div class="pb-empty-light pb-photo-empty">'+message+'</div>';
      return;
    }

    host.innerHTML=info.items.map((photo,index)=>{
      const src=photo.signed_url || '';
      const admin=curationMode && !photo.pending
        ? '<div class="pb-photo-admin"><button type="button" data-replace-photo="'+esc(photo.id)+'">Substituir</button><button type="button" class="danger" data-delete-photo="'+esc(photo.id)+'">Excluir</button></div>'
        : '';
      const pendingBadge=photo.pending ? '<span class="pb-photo-pending">AGUARDANDO SALVAR</span>' : '';
      const fallback='Foto '+String(info.start+index+1).padStart(2,'0');
      const caption=String(photo.caption||'').trim() || fallback;
      const showUnit=!scope.unitKey && photo.unit_name;
      const showPhase=!scope.phaseKey && photo.phase_name;
      const showGrouping=!scope.groupingKey && photo.grouping_name;
      const contextLabel=[showUnit ? photo.unit_name : '',showPhase ? photo.phase_name : '',showGrouping ? photo.grouping_name : ''].filter(Boolean).join(' • ');
      const contextMarkup=contextLabel
        ? '<div class="pb-photo-unit-label">'+esc(contextLabel)+'</div>'
        : '';
      const captionMarkup=curationMode && !photo.pending
        ? '<figcaption><input class="pb-photo-caption-input" type="text" value="'+esc(caption)+'" data-photo-caption="'+esc(photo.id)+'" maxlength="500" aria-label="Legenda da foto"></figcaption>'
        : '<figcaption class="pb-photo-caption">'+esc(caption)+'</figcaption>';
      return '<figure class="pb-photo-item'+(photo.pending?' pb-photo-item-pending':'')+'">'+
        '<img src="'+esc(src)+'" alt="Registro fotográfico de '+esc(photo.unit_name || scope.unitName || 'todas as entregas')+' / '+esc(photo.phase_name || scope.phaseName || 'todas as fases')+'">'+
        contextMarkup+pendingBadge+admin+captionMarkup+
      '</figure>';
    }).join('');
  }

  function renderWeekHighlights() {
    const host=document.getElementById('pb-week-highlights-list');
    const count=document.getElementById('pb-week-highlights-count');
    const heading=document.getElementById('pb-week-highlights-title');
    if(!host) return;

    const allNotes=notes();
    const periodLabel=String(allNotes.__highlightPeriodLabel || '').trim();
    if(heading) heading.textContent='EVENTOS DA SEMANA'+(periodLabel ? ' — '+periodLabel : '');

    const hideAutomatic=Boolean(allNotes.__hideAutomaticHighlights);
    const automaticRows=hideAutomatic ? [] : presentationVisibleRows(presentationRows())
      .filter(hasDeviation)
      .sort((a,b)=>(a.sourceIndex??0)-(b.sourceIndex??0))
      .slice(0,4);

    const visibleAuto=automaticRows.filter(row=>!noteFor(row).highlightHidden);
    const hiddenAuto=automaticRows.filter(row=>noteFor(row).highlightHidden);
    const manual=manualHighlights()
      .filter(manualHighlightMatchesSelection)
      .filter(item=>manualHighlightText(item));

    const groups={
      highlight:[],
      attention:[],
      'next-action':[]
    };

    visibleAuto.forEach(row=>{
      groups.highlight.push({type:'auto',row,eventInfo:{key:'highlight',label:'Destaque'}});
    });
    manual.forEach(item=>{
      const eventInfo=manualHighlightEvent(item);
      groups[eventInfo.key]?.push({type:'manual',item,eventInfo});
    });

    const total=Object.values(groups).reduce((sum,items)=>sum+items.length,0);
    if(count) count.textContent=total+(total===1?' item':' itens');

    function renderEntry(entry,index) {
      const eventInfo=entry.eventInfo || {key:'highlight',label:'Destaque'};

      if(entry.type==='auto'){
        const row=entry.row;
        const isFocused=Number(focusedSourceIndex)===Number(row.sourceIndex);
        const note=noteFor(row);
        const title=note.highlightTitle || rowLabel(row);
        const subtitle=note.highlightSubtitle || '';
        const copy=curationMode
          ? '<div class="pb-highlight-edit-stack">'+
              '<label><span>H1</span><input class="pb-highlight-title-input" type="text" value="'+esc(title)+'" data-highlight-title="'+esc(row.sourceIndex)+'" aria-label="Título H1 do destaque"></label>'+
              '<label><span>H2</span><input class="pb-highlight-subtitle-input" type="text" value="'+esc(subtitle)+'" data-highlight-subtitle="'+esc(row.sourceIndex)+'" placeholder="Digite o subtítulo" aria-label="Subtítulo H2 do destaque"></label>'+
            '</div>'
          : '<div class="pb-highlight-display"><strong class="pb-highlight-title">'+esc(title)+'</strong>'+
              (subtitle?'<small class="pb-highlight-subtitle">'+esc(subtitle)+'</small>':'')+
            '</div>';
        const remove=curationMode
          ? '<button type="button" class="pb-highlight-delete" data-delete-auto-highlight="'+esc(row.sourceIndex)+'">Excluir</button>'
          : '';

        return '<article class="pb-activity pb-highlight-row pb-highlight-event-'+esc(eventInfo.key)+(isFocused?' pb-activity-focused':'')+'">'+
          '<span class="pb-activity-icon pb-highlight-number">'+String(index+1).padStart(2,'0')+'</span>'+
          '<div class="pb-activity-copy pb-highlight-copy">'+copy+'</div>'+
          '<button type="button" class="pb-focus-row-button'+(isFocused?' active':'')+'" data-focus-row="'+esc(row.sourceIndex)+'">'+(isFocused?'Detalhando':'Detalhar')+'</button>'+
          remove+
        '</article>';
      }

      const item=entry.item;
      const description=manualHighlightText(item);
      const subtitle=String(item.subtitle || '').trim();
      const copy=curationMode
        ? '<div class="pb-highlight-edit-stack">'+
            '<div class="pb-event-edit-row">'+
              '<label class="pb-event-edit-label"><span>EVENTO</span>'+
                '<select class="pb-event-edit-select" data-manual-event-select="'+esc(item.id)+'" aria-label="Tipo de evento">'+
                  '<option value="Destaque"'+(eventInfo.key==='highlight'?' selected':'')+'>Destaque</option>'+
                  '<option value="Pontos de Atenção"'+(eventInfo.key==='attention'?' selected':'')+'>Ponto de Atenção</option>'+
                  '<option value="Próximas Ações"'+(eventInfo.key==='next-action'?' selected':'')+'>Próxima Ação</option>'+
                '</select>'+
              '</label>'+
              '<button type="button" class="pb-event-edit-confirm" data-confirm-manual-event="'+esc(item.id)+'" title="Confirmar alteração do evento" aria-label="Confirmar alteração do evento">✓</button>'+
            '</div>'+
            '<label><span>DESCRIÇÃO</span><input class="pb-highlight-title-input" type="text" value="'+esc(description)+'" data-manual-highlight="'+esc(item.id)+'" data-manual-field="description" aria-label="Descrição do item"></label>'+
          '</div>'
        : '<div class="pb-highlight-display"><strong class="pb-highlight-title">'+esc(description)+'</strong>'+
            (subtitle?'<small class="pb-highlight-subtitle">'+esc(subtitle)+'</small>':'')+
          '</div>';
      const remove=curationMode
        ? '<button type="button" class="pb-highlight-delete" data-delete-manual-highlight="'+esc(item.id)+'">Excluir</button>'
        : '';

      return '<article class="pb-activity pb-highlight-row pb-manual-highlight pb-highlight-event-'+esc(eventInfo.key)+'">'+
        '<span class="pb-activity-icon pb-highlight-number">'+String(index+1).padStart(2,'0')+'</span>'+
        '<div class="pb-activity-copy pb-highlight-copy">'+copy+'</div>'+
        remove+
      '</article>';
    }

    const groupDefs=[
      {key:'highlight',title:'Destaques',tone:'highlight'},
      {key:'attention',title:'Ponto de Atenção',tone:'attention'},
      {key:'next-action',title:'Próxima Ação',tone:'next-action'}
    ];

    let html=groupDefs.map(def=>{
      const items=groups[def.key] || [];
      const rows=items.length
        ? items.map((entry,index)=>renderEntry(entry,index)).join('')
        : '<div class="pb-event-group-empty">Nenhum item nesta seleção.</div>';
      return '<section class="pb-event-group pb-event-group-'+def.tone+'">'+
        '<header class="pb-event-group-head">'+
          '<div class="pb-event-group-title"><i></i><strong>'+esc(def.title)+'</strong></div>'+
          '<span>'+items.length+(items.length===1?' item':' itens')+'</span>'+
        '</header>'+
        '<div class="pb-event-group-list">'+rows+'</div>'+
      '</section>';
    }).join('');

    if(!total && !curationMode){
      html='<div class="pb-empty-light">Nenhum evento cadastrado para esta unidade/fase na Semana '+esc(window.CoordinationWeek?.getSelectedWeek?.() || '')+'.</div>';
    }

    if(curationMode){
      html += '<div class="pb-highlight-master-actions">'+
        '<div class="pb-manual-highlight-add">'+
          '<input id="pb-new-highlight-title" type="text" placeholder="Digite a descrição do destaque">'+
          '<input id="pb-new-highlight-subtitle" type="hidden" value="">'+
          '<button type="button" data-add-manual-highlight>+ Inserir destaque</button>'+
        '</div>'+
        (hiddenAuto.length
          ? '<button type="button" class="pb-highlight-restore-all" data-restore-auto-highlights>Restaurar '+hiddenAuto.length+' removido'+(hiddenAuto.length===1?'':'s')+'</button>'
          : '')+
      '</div>';
    }

    host.innerHTML=html;
  }
  function renderOffenders() {
    const keySet=metricSelectedGroupKeys();
    const contextBySource=keySet ? metricContextBySource() : null;
    const rows=presentationVisibleRows(presentationRows())
      .filter(row=>metricRowMatchesSelection(row,keySet,contextBySource))
      .filter(r=>hasDeviation(r)&&r.variance<0)
      .sort((a,b)=>a.variance-b.variance);
    const info=paged(rows,'offenders');
    const host=document.getElementById('pb-offenders-list');
    const visibleCount=rows.filter(row=>!isHidden(row)).length;
    const hiddenCount=rows.length-visibleCount;
    document.getElementById('pb-offender-count').textContent=curationMode && hiddenCount
      ? visibleCount+' visíveis • '+hiddenCount+' ocultos'
      : visibleCount+(visibleCount===1?' Ofensor':' Ofensores');
    document.getElementById('pb-cpm-note').textContent=curationMode ? 'Modo edição • use Ocultar/Reexibir • senha master' : 'Somente Etapas de Nível 5 • ordenado pelo desvio da aba Avanço PLATAQ';
    renderPager('pb-offenders-pager','offenders',info);
    if(!rows.length){host.innerHTML='<div class="pb-empty-light">Nenhuma Etapa de Nível 5 com desvio negativo nesta seleção.</div>';return;}

    host.innerHTML=info.items.map((row,index)=>{
      const note=noteFor(row);
      const cause=note.cause?'<div><span>CAUSA</span><p>'+esc(note.cause)+'</p></div>':'';
      const mitigation=note.mitigation?'<div><span>MITIGAÇÃO</span><p>'+esc(note.mitigation)+'</p></div>':'';
      const isFocused=Number(focusedSourceIndex)===Number(row.sourceIndex);
      const hidden=isHidden(row);
      const curationButton=curationMode
        ? '<button type="button" class="pb-hide-row-button' + (hidden?' restore':'') + '" data-hide-row="'+esc(row.sourceIndex)+'" data-hidden="'+(hidden?'1':'0')+'">' + (hidden?'Reexibir':'Ocultar') + '</button>'
        : '';
      return '<article class="pb-offender pb-offender-critical' + (isFocused?' pb-offender-focused':'') + (hidden?' pb-offender-hidden-admin':'') + '">'+
        '<div class="pb-offender-head">'+
          '<span class="pb-offender-number">'+String(info.start+index+1).padStart(2,'0')+'</span>'+
          '<div class="pb-offender-title"><strong>'+esc(rowLabel(row))+'</strong><span>'+esc(rowPath(row))+'</span></div>'+
          '<span class="pb-offender-impact">'+esc(pts(row.variance))+'</span>'+
          '<button type="button" class="pb-focus-row-button' + (isFocused?' active':'') + '" data-focus-row="'+esc(row.sourceIndex)+'">' + (isFocused?'Detalhando':'Detalhar') + '</button>'+
          curationButton+
        '</div>'+
        ((cause||mitigation)?'<div class="pb-offender-note-preview">'+cause+mitigation+'</div>':'')+
      '</article>';
    }).join('');
  }

  function syncMetricCheckboxDom(host,groups,steps,filterLocked) {
    const activeKeys=metricSelectedGroupKeys();
    const groupActive=key=>metricGroupAll || Boolean(activeKeys?.has(key));
    const stepActive=row=>groupActive(metricGroupKey(row)) && (metricStepAll || metricSelectedSteps.has(String(row.sourceIndex)));
    const activeStepCount=steps.filter(stepActive).length;
    const activeGroupCount=metricGroupAll ? groups.length : (activeKeys?.size || 0);

    const allInput=host.querySelector('[data-metric-group-all]');
    if(allInput){
      const everything=groups.length>0 && activeGroupCount===groups.length && activeStepCount===steps.length;
      const anything=activeGroupCount>0 || activeStepCount>0;
      allInput.checked=everything;
      allInput.indeterminate=!everything && anything;
      allInput.disabled=filterLocked;
    }

    host.querySelectorAll('[data-metric-group-key]').forEach(input=>{
      const key=String(input.dataset.metricGroupKey || '');
      const children=steps.filter(step=>metricGroupKey(step)===key);
      const selectedChildren=children.filter(stepActive).length;
      const active=groupActive(key);
      input.checked=children.length ? active && selectedChildren===children.length : active;
      input.indeterminate=active && selectedChildren>0 && selectedChildren<children.length;
      input.disabled=filterLocked;
    });

    host.querySelectorAll('[data-metric-step-source]').forEach(input=>{
      const id=String(input.dataset.metricStepSource || '');
      const row=steps.find(step=>String(step.sourceIndex)===id);
      input.checked=Boolean(row && stepActive(row));
      input.disabled=filterLocked;
    });
  }

  function renderMetricFilterOptions(groups,steps) {
    const host=document.getElementById('pb-metric-filter-options');
    const summary=document.getElementById('pb-metric-filter-summary');
    if(!host || !summary) return;
    const previousScroll=host.scrollTop;
    const groupKeys=new Set(groups.map(metricGroupKey));
    [...metricSelectedGroups].forEach(key=>{if(!groupKeys.has(key)) metricSelectedGroups.delete(key);});
    const stepIds=new Set(steps.map(row=>String(row.sourceIndex)));
    [...metricSelectedSteps].forEach(id=>{if(!stepIds.has(id)) metricSelectedSteps.delete(id);});

    const activeKeys=metricSelectedGroupKeys();
    const groupCount=metricGroupAll ? groups.length : (activeKeys?.size || 0);
    const activeSteps=steps.filter(row=>
      (metricGroupAll || activeKeys?.has(metricGroupKey(row))) &&
      (metricStepAll || metricSelectedSteps.has(String(row.sourceIndex)))
    );
    const filterLocked=!canEdit();
    summary.textContent=groupCount+' agrup. • '+activeSteps.length+' etapas'+(filterLocked?' • 🔒 somente leitura':'');

    const structure=groups.length+':'+steps.length+':'+groups.map(metricGroupKey).join('|')+'#'+steps.map(row=>row.sourceIndex).join('|');
    if(metricTreeStructureKey===structure && host.querySelector('.pb-metric-tree')){
      syncMetricCheckboxDom(host,groups,steps,filterLocked);
      host.scrollTop=previousScroll;
      return;
    }

    metricTreeStructureKey=structure;
    const lockAttr=filterLocked?' disabled':'';
    host.innerHTML='<div class="pb-metric-tree">'+
      '<label class="pb-metric-check-all"><input type="checkbox" data-metric-group-all="1"'+lockAttr+'><span>Selecionar todos os agrupamentos e etapas</span></label>'+
      groups.map(row=>{
        const key=metricGroupKey(row);
        const note=noteFor(row);
        const title=note.metricTitle || metricContextValue(row,'grouping') || rowLabel(row);
        const children=steps.filter(step=>metricGroupKey(step)===key);
        return '<section class="pb-metric-tree-group">'+
          '<label class="pb-metric-check-option pb-metric-tree-parent">'+
            '<input type="checkbox" data-metric-group-key="'+esc(key)+'"'+lockAttr+'>'+
            '<span><strong>'+esc((note.metricHidden?'OCULTO • ':'')+title)+'</strong><small>L'+(Number(row.sourceIndex)+1)+'</small></span></label>'+
          '<div class="pb-metric-tree-children">'+children.map(step=>{
            const name=metricContextValue(step,'step') || rowLabel(step);
            return '<label class="pb-metric-check-option pb-metric-tree-child">'+
              '<input type="checkbox" data-metric-step-source="'+esc(step.sourceIndex)+'"'+lockAttr+'>'+
              '<span><strong title="'+esc(name)+'">'+esc(compactMetricStageTitle(name))+'</strong><small>L'+(Number(step.sourceIndex)+1)+'</small></span></label>';
          }).join('')+'</div></section>';
      }).join('')+'</div>';
    syncMetricCheckboxDom(host,groups,steps,filterLocked);
    host.scrollTop=previousScroll;
  }

  function materializeMetricSelection() {
    const groups=metricGroupRows();
    const steps=metricStageRows();
    if(metricGroupAll){
      groups.forEach(row=>metricSelectedGroups.add(metricGroupKey(row)));
      metricGroupAll=false;
    }
    if(metricStepAll){
      steps.filter(row=>metricSelectedGroups.has(metricGroupKey(row))).forEach(row=>metricSelectedSteps.add(String(row.sourceIndex)));
      metricStepAll=false;
    }
  }

  function metricValueCell(column,label,value,formatter) {
    const display=Number.isFinite(value) ? formatter(value) : '—';
    return '<div class="pb-stage-value"><small>'+column+' • '+label+'</small><strong>'+esc(display)+'</strong></div>';
  }

  function compactMetricStageTitle(value) {
    return String(value || '').replace(/\bIMPERMEABILIZAÇÃO\b/giu,'Impermeab.')
      .replace(/\bFABRICAÇÃO\b/giu,'Fabric.')
      .replace(/\bTRANSPORTE\b/giu,'Transp.')
      .replace(/\bPOSICIONAMENTO\b/giu,'Posicion.')
      .replace(/\bACABAMENTO\b/giu,'Acab.')
      .replace(/\bCONCRETAGEM\b/giu,'Concret.')
      .replace(/\bARMAÇÃO\b/giu,'Arm.');
  }

  function closeMetricFilterOutside(event) {
    const details=document.getElementById('pb-metric-filter-details');
    if(details?.open && !details.contains(event.target)) details.open=false;
  }

  function renderMetricStageRow(row) {
    const title=metricContextValue(row,'step') || rowLabel(row);
    const weighted=row.weightedVariance;
    const tone=Number.isFinite(weighted)?(weighted>=0?'good':weighted>=-.03?'attention':'critical'):'attention';
    const unit=row.measureUnit ? ' '+row.measureUnit : '';
    const plannedQty=Number.isFinite(row.attackPlannedQuantity) ? qty(row.attackPlannedQuantity)+unit : '—';
    const actualQty=Number.isFinite(row.attackActualQuantity) ? qty(row.attackActualQuantity)+unit : '—';
    const completed=Number.isFinite(row.actual) && row.actual>=.999;
    const executionLabel=completed ? 'CONCLUÍDO' : 'EM EXECUÇÃO';
    const executionClass=completed ? 'done' : 'running';
    return '<tr class="pb-stage-table-row pb-stage-table-row-'+tone+'">'+
      '<th scope="row" title="'+esc(title)+' • Linha '+(Number(row.sourceIndex)+1)+'"><span class="pb-stage-title-copy">'+esc(compactMetricStageTitle(title))+'</span><span class="pb-execution-badge '+executionClass+'">'+executionLabel+'</span></th>'+
      '<td><strong>'+esc(plannedQty)+'</strong></td>'+
      '<td><strong>'+esc(actualQty)+'</strong></td>'+
      '<td><strong>'+esc(pct(row.planned))+'</strong></td>'+
      '<td><strong>'+esc(pct(row.actual))+'</strong></td>'+
      '<td class="pb-stage-table-deviation"><strong>'+esc(pts(weighted))+'</strong></td>'+
    '</tr>';
  }

  function renderMetrics() {
    const allGroups=metricGroupRows();
    const allSteps=metricStageRows();

    renderMetricFilterOptions(allGroups,allSteps);

    const groupKeys=new Set(allGroups.map(metricGroupKey));
    const activeSelection=metricSelectedGroupKeys();
    const selectedGroupKeys=activeSelection===null
      ? groupKeys
      : new Set([...activeSelection].filter(key=>groupKeys.has(key)));

    let groups=allGroups.filter(row=>selectedGroupKeys.has(metricGroupKey(row)));

    const selectedStepIds=metricStepAll
      ? null
      : new Set(metricSelectedSteps);

    const info=paged(groups,'metrics');
    const host=document.getElementById('pb-metrics-grid');
    const visibleSteps=allSteps.filter(row=>
      selectedGroupKeys.has(metricGroupKey(row)) &&
      (metricStepAll || selectedStepIds.has(String(row.sourceIndex)))
    );

    document.getElementById('pb-metric-count').textContent=
      groups.length+' '+(groups.length===1?'agrupamento':'agrupamentos')+
      ' • '+visibleSteps.length+' '+(visibleSteps.length===1?'etapa':'etapas');

    renderPager('pb-metrics-pager','metrics',info);

    if(!groups.length){
      host.innerHTML='<div class="pb-empty-light pb-metrics-empty">'+(curationMode ? 'Nenhum agrupamento de Nível 4 selecionado para esta visão.' : 'Nenhum agrupamento com execução registrada nesta seleção.')+'</div>';
      return;
    }

    host.innerHTML=info.items.map((row,index)=>{
      const note=noteFor(row);
      const hidden=Boolean(note.metricHidden);
      const metricValue=row.weightedVariance;
      const tone=Number.isFinite(metricValue)?(metricValue>=0?'good':metricValue>=-.03?'attention':'critical'):'attention';
      const title=note.metricTitle || metricContextValue(row,'grouping') || rowLabel(row);
      const ratio=Number.isFinite(row.planned)&&row.planned>0&&Number.isFinite(row.actual)
        ? Math.max(0,Math.min(1,row.actual/row.planned))
        : 0;
      const completed=Number.isFinite(row.actual) && row.actual>=.999;
      const executionBadge=curationMode
        ? ''
        : '<span class="pb-execution-badge '+(completed?'done':'running')+'">'+(completed?'CONCLUÍDO':'EM EXECUÇÃO')+'</span>';
      const titleMarkup=curationMode
        ? '<input class="pb-metric-title-input" type="text" value="'+esc(title)+'" data-metric-title="'+esc(row.sourceIndex)+'" aria-label="Título do agrupamento">'
        : '<span class="pb-metric-title-line"><strong>'+esc(title)+'</strong>'+executionBadge+'</span>';
      const actions=curationMode
        ? '<div class="pb-metric-admin">'+
            '<button type="button" class="'+(hidden?'restore':'')+'" data-metric-hidden="'+esc(row.sourceIndex)+'" data-hidden-value="'+(hidden?'0':'1')+'">'+(hidden?'Reexibir':'Ocultar')+'</button>'+
          '</div>'
        : '';
      const groupKey=metricGroupKey(row);
      const stages=allSteps.filter(stage=>
        metricGroupKey(stage)===groupKey &&
        (metricStepAll || selectedStepIds.has(String(stage.sourceIndex)))
      );

      return '<section class="pb-metric-group'+(hidden?' pb-metric-hidden-admin':'')+'">'+
        '<div class="pb-metric pb-metric-'+tone+'">'+

          '<div class="pb-metric-head">'+titleMarkup+'<b title="Desvio ponderado • coluna AB">'+esc(pts(metricValue))+'</b></div>'+
          '<div class="pb-metric-track"><span style="width:'+Math.min(100,ratio*100)+'%"></span></div>'+
          '<div class="pb-metric-foot"><span>Prev. <strong>'+esc(pct(row.planned))+'</strong> • Real <strong>'+esc(pct(row.actual))+'</strong></span><b>L'+(Number(row.sourceIndex)+1)+'</b></div>'+
          '<small class="pb-metric-context"><span>Qtd. prev.: '+qty(row.attackPlannedQuantity)+'</span><span>Qtd. real.: '+qty(row.attackActualQuantity)+(row.measureUnit?' '+esc(row.measureUnit):'')+'</span></small>'+
          actions+
        '</div>'+
        '<div class="pb-stage-list">'+

          (stages.length
            ? '<table class="pb-stage-table"><thead><tr><th scope="col">Etapa</th><th scope="col">Previsto<br>(Qtd.)</th><th scope="col">Realizado<br>(Qtd.)</th><th scope="col">Previsto<br>(%)</th><th scope="col">Realizado<br>(%)</th><th scope="col">Desvio<br>(AB)</th></tr></thead><tbody>'+stages.map(renderMetricStageRow).join('')+'</tbody></table>'
            : '<div class="pb-stage-empty">Nenhuma etapa de Nível 6 selecionada para este agrupamento.</div>')+
        '</div>'+
      '</section>';
    }).join('');
  }

  function render() {
    if(!model) return;
    populateHierarchyFilters();
    updateCoordinationDetailMode();
    const scopeKey=JSON.stringify(selection());
    if(scopeKey!==lastScopeKey){resetPagination();lastScopeKey=scopeKey;}
    renderFocus();
    renderPhysical();
    renderActivities();
    renderDelayContribution();
    renderWeekHighlights();
    renderOffenders();
    renderMetrics();
    window.CoordinationWeek?.refreshStatus?.();
  }

  function onFilterChange() {
    focusedSourceIndex=null;
    rememberMetricSelection();
    resetPagination();
    populateHierarchyFilters();
    populateRowFilter();
    restoreMetricSelectionForScope(metricScopeKey());
    render();
    loadPhotos(window.CoordinationWeek?.getSelectedWeek?.());
  }

  function bind() {
    if(initialized) return;
    initialized=true;
    document.addEventListener('pointerdown',closeMetricFilterOutside);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        const details=document.getElementById('pb-metric-filter-details');
        if(details) details.open=false;
      }
    });
    preparePbLayoutEditor();
    enablePbLayoutDragEvents();
    FILTERS.forEach(def=>document.getElementById(def.id)?.addEventListener('change',onFilterChange));
    document.getElementById('pb-curation-edit')?.addEventListener('click',openCurationModal);
    document.getElementById('pb-curation-cancel')?.addEventListener('click',closeCurationModal);
    document.getElementById('pb-curation-submit')?.addEventListener('click',unlockCuration);
    document.getElementById('pb-curation-password')?.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();unlockCuration();}
    });
    document.getElementById('pb-curation-master-modal')?.addEventListener('click',event=>{
      if(event.target.id==='pb-curation-master-modal') closeCurationModal();
    });
    document.getElementById('pb-photo-import')?.addEventListener('click',()=>{
      document.getElementById('pb-photo-input')?.click();
    });
    document.getElementById('pb-photo-input')?.addEventListener('change',event=>{
      importPhotoFiles(event.target.files);
      event.target.value='';
    });
    document.getElementById('pb-photo-replace-input')?.addEventListener('change',event=>{
      const file=event.target.files?.[0] || null;
      const target=photoReplaceTarget;
      photoReplaceTarget=null;
      event.target.value='';
      if(target && file) replacePhoto(target,file);
    });

    document.getElementById('pb-row-filter')?.addEventListener('change',event=>{
      const rawId=event.target.value || '';
      const id=rawId === '' ? NaN : Number(rawId);
      focusedSourceIndex=Number.isFinite(id) ? id : null;
      pageState.lookahead=0;
      renderFocus();
      renderActivities();
      renderWeekHighlights();
    });
    document.getElementById('pb-focus-cause')?.addEventListener('input',event=>saveFocusNote('cause',event.target.value));
    document.getElementById('pb-focus-mitigation')?.addEventListener('input',event=>saveFocusNote('mitigation',event.target.value));

    document.getElementById('page-pb')?.addEventListener('change',event=>{
      if(event.target.closest('#pb-metric-stage-filter') && !canEdit()) return;
      const metricGroupAllInput=event.target.closest('[data-metric-group-all]');
      if(metricGroupAllInput){
        metricGroupAll=Boolean(metricGroupAllInput.checked);
        metricSelectedGroups.clear();
        metricStepAll=metricGroupAll;
        metricSelectedSteps.clear();
        pageState.metrics=0;
        renderMetrics();
        renderOffenders();
        renderPareto();
        rememberMetricSelection();
        saveManualOnly().catch(console.error);
        return;
      }

      const metricGroupInput=event.target.closest('[data-metric-group-key]');
      if(metricGroupInput){
        materializeMetricSelection();
        const key=String(metricGroupInput.dataset.metricGroupKey || '');
        const children=metricStageRows().filter(row=>metricGroupKey(row)===key);
        if(metricGroupInput.checked){
          metricSelectedGroups.add(key);
          children.forEach(row=>metricSelectedSteps.add(String(row.sourceIndex)));
        }else{
          metricSelectedGroups.delete(key);
          children.forEach(row=>metricSelectedSteps.delete(String(row.sourceIndex)));
        }
        pageState.metrics=0;
        renderMetrics();
        renderOffenders();
        renderPareto();
        rememberMetricSelection();
        saveManualOnly().catch(console.error);
        return;
      }

      const metricStepAllInput=event.target.closest('[data-metric-step-all]');
      if(metricStepAllInput){
        metricStepAll=Boolean(metricStepAllInput.checked);
        metricSelectedSteps.clear();
        pageState.metrics=0;
        renderMetrics();
        renderOffenders();
        renderPareto();
        rememberMetricSelection();
        saveManualOnly().catch(console.error);
        return;
      }

      const metricStepInput=event.target.closest('[data-metric-step-source]');
      if(metricStepInput){
        materializeMetricSelection();
        const id=String(metricStepInput.dataset.metricStepSource || '');
        const row=metricStageRows().find(row=>String(row.sourceIndex)===id);
        if(metricStepInput.checked){
          metricSelectedSteps.add(id);
          if(row){
            const key=metricGroupKey(row);
            const siblings=metricStageRows().filter(step=>metricGroupKey(step)===key);
            if(siblings.length && siblings.every(step=>metricSelectedSteps.has(String(step.sourceIndex))))
              metricSelectedGroups.add(key);
          }
        }else{
          metricSelectedSteps.delete(id);
          if(row) metricSelectedGroups.delete(metricGroupKey(row));
        }
        pageState.metrics=0;
        renderMetrics();
        renderOffenders();
        renderPareto();
        rememberMetricSelection();
        saveManualOnly().catch(console.error);
        return;
      }

      const metricTitle=event.target.closest('[data-metric-title]');
      if(metricTitle){
        saveMetricTitle(metricTitle.dataset.metricTitle,metricTitle.value).catch(console.error);
        return;
      }
      const photoCaption=event.target.closest('[data-photo-caption]');
      if(photoCaption){
        savePhotoCaption(photoCaption.dataset.photoCaption,photoCaption.value);
        return;
      }
      const titleInput=event.target.closest('[data-highlight-title]');
      if(titleInput){
        saveHighlightField(titleInput.dataset.highlightTitle,'title',titleInput.value);
        return;
      }
      const subtitleInput=event.target.closest('[data-highlight-subtitle]');
      if(subtitleInput){
        saveHighlightField(subtitleInput.dataset.highlightSubtitle,'subtitle',subtitleInput.value);
        return;
      }
      const manual=event.target.closest('[data-manual-highlight]');
      if(manual){
        updateManualHighlight(manual.dataset.manualHighlight,manual.dataset.manualField || 'title',manual.value);
      }
    });

    document.getElementById('page-pb')?.addEventListener('click',event=>{
      const metricHidden=event.target.closest('[data-metric-hidden]');
      if(metricHidden){
        setMetricHidden(metricHidden.dataset.metricHidden,metricHidden.dataset.hiddenValue==='1').catch(console.error);
        return;
      }

      const addManual=event.target.closest('[data-add-manual-highlight]');
      if(addManual){
        const titleInput=document.getElementById('pb-new-highlight-title');
        const subtitleInput=document.getElementById('pb-new-highlight-subtitle');
        addManualHighlight(titleInput?.value || '',subtitleInput?.value || '');
        return;
      }
      const confirmEvent=event.target.closest('[data-confirm-manual-event]');
      if(confirmEvent){
        const id=String(confirmEvent.dataset.confirmManualEvent || '');
        const select=document.querySelector('[data-manual-event-select="'+CSS.escape(id)+'"]');
        if(select) updateManualHighlight(id,'event',select.value);
        return;
      }
      const deleteManual=event.target.closest('[data-delete-manual-highlight]');
      if(deleteManual){
        deleteManualHighlight(deleteManual.dataset.deleteManualHighlight);
        return;
      }
      const deleteAuto=event.target.closest('[data-delete-auto-highlight]');
      if(deleteAuto){
        setAutomaticHighlightHidden(deleteAuto.dataset.deleteAutoHighlight,true);
        return;
      }
      const restoreAuto=event.target.closest('[data-restore-auto-highlights]');
      if(restoreAuto){
        const rows=presentationVisibleRows(presentationRows())
          .filter(hasDeviation)
          .sort((a,b)=>(a.sourceIndex??0)-(b.sourceIndex??0))
          .slice(0,4)
          .filter(row=>noteFor(row).highlightHidden);
        rows.forEach(row=>{
          const all=notes();
          const id=String(row.sourceIndex);
          all[id]=all[id]||{};
          all[id].highlightHidden=false;
          all[id].updatedAt=new Date().toISOString();
          writeJson(notesKey(),all);
        });
        renderWeekHighlights();
        saveManualOnly().catch(console.error);
        return;
      }

      const deletePhotoButton=event.target.closest('[data-delete-photo]');
      if(deletePhotoButton){
        deletePhoto(deletePhotoButton.dataset.deletePhoto);
        return;
      }
      const replacePhotoButton=event.target.closest('[data-replace-photo]');
      if(replacePhotoButton){
        photoReplaceTarget=replacePhotoButton.dataset.replacePhoto;
        document.getElementById('pb-photo-replace-input')?.click();
        return;
      }

      const hide=event.target.closest('[data-hide-row]');
      if(hide){
        const row=allRows().find(r=>Number(r.sourceIndex)===Number(hide.dataset.hideRow));
        if(row) setHidden(row,hide.dataset.hidden!=='1');
        return;
      }

      const focus=event.target.closest('[data-focus-row]');
      if(focus){
        const select=document.getElementById('pb-row-filter');
        if(select){
          const id=String(focus.dataset.focusRow);
          if(![...select.options].some(o=>o.value===id)){
            const row=allRows().find(r=>String(r.sourceIndex)===id);
            if(row) select.insertAdjacentHTML('beforeend','<option value="'+esc(id)+'">'+esc(rowLabel(row)+' • linha '+(Number(row.sourceIndex)+1))+'</option>');
          }
          focusedSourceIndex=Number(id);
          select.value=id;
          renderFocus();
          renderActivities();
          renderWeekHighlights();
          renderOffenders();
          const card=document.querySelector('.pb-focus-card');
          if(card){
            card.classList.remove('pb-focus-flash');
            void card.offsetWidth;
            card.classList.add('pb-focus-flash');
            card.scrollIntoView({behavior:'smooth',block:'center'});
            setTimeout(()=>card.classList.remove('pb-focus-flash'),1400);
          }
        }
      }
      const pager=event.target.closest('[data-pb-page-key]');
      if(pager){
        const key=pager.dataset.pbPageKey;
        const dir=Number(pager.dataset.pbPageDir)||0;
        if(Object.prototype.hasOwnProperty.call(pageState,key)){
          pageState[key]=Math.max(0,(pageState[key]||0)+dir);
          if(key==='lookahead') renderActivities();
          if(key==='offenders') renderOffenders();
          if(key==='metrics') renderMetrics();
        }
      }
    });
  }

  function init(data, importedFileName) {
    liveModel=data;
    liveFileName=importedFileName||'';
    if(!window.CoordinationWeek?.hasActiveSnapshot?.()){
      model=data;
      fileName=liveFileName;
    }
    bind();
    if(window.CoordinationWeek?.fillWeekOptions) window.CoordinationWeek.fillWeekOptions(document.getElementById('pb-week-filter'));
    applyPbLayout(readLocalPbLayout());
    if(!activeMetricScopeKey) activeMetricScopeKey=metricScopeKey();
    render();
    loadPbLayout();
    if(window.CloudSync?.ready?.()){
      loadPhotos(window.CoordinationWeek?.getSelectedWeek?.());
    }
  }

  function useSnapshot(data, importedFileName) {
    if(!data) return;
    if (!hasCompleteHierarchy(data) && hasCompleteHierarchy(liveModel)) {
      model=liveModel;
      fileName=liveFileName || importedFileName || 'Excel atual';
    } else {
      model=data;
      fileName=importedFileName||'Semana salva';
    }
    focusedSourceIndex=null;
    curationMode=false;
    curationMasterPassword='';
    photos=[];
    photosWeek=null;
    photosUnitKey='';
    photosPhaseKey='';
    updateCurationUI();
    resetPagination();
    lastScopeKey='';
    render();
  }

  function useLive() {
    if(!liveModel) return;
    model=liveModel;
    fileName=liveFileName;
    focusedSourceIndex=null;
    curationMode=false;
    curationMasterPassword='';
    updateCurationUI();
    resetPagination();
    lastScopeKey='';
    render();
  }

  function getPresentationData() {
    const sel=selection();
    const scope=scopeSummary();
    const auto=notes().__hideAutomaticHighlights ? [] : presentationVisibleRows(presentationRows())
      .filter(hasDeviation)
      .sort((a,b)=>(a.sourceIndex??0)-(b.sourceIndex??0))
      .slice(0,4)
      .filter(row=>!noteFor(row).highlightHidden)
      .map(row=>{
        const note=noteFor(row);
        return {
          title:note.highlightTitle || rowLabel(row),
          subtitle:note.highlightSubtitle || ''
        };
      });
    const manual=manualHighlights()
      .filter(manualHighlightMatchesSelection)
      .filter(item=>manualHighlightText(item))
      .map(item=>({
        title:manualHighlightText(item),
        subtitle:item.subtitle || '',
        event:item.event || 'Destaque'
      }));
    const selectedUnit=sel.unit
      ? (model?.units||[]).find(unit=>unit.rawName===sel.unit || unit.unit===sel.unit || unit.code===sel.unit)
      : null;
    const context=[sel.unit,sel.phase,sel.subphase,sel.grouping,sel.component,sel.step].filter(Boolean);
    return {
      selection:{...sel},
      scope:scope ? {
        planned:scope.planned,
        actual:scope.actual,
        variance:scope.variance,
        weightedVariance:scope.weightedVariance
      } : null,
      pareto:paretoGroupingRows().map(row=>({
        grouping:row.grouping || rowLabel(row),
        weightedVariance:row.weightedVariance
      })),
      highlights:auto.concat(manual),
      curve:selectedUnit?.curve || (!sel.unit ? model?.contract?.curve : null),
      title:context.length ? context[context.length-1] : 'Contrato EPC-15',
      dataBase:model?.dataBase || null
    };
  }

  function getViewInfo() {
    return {fileName,dataBase:model?.dataBase||null,liveFileName,liveDataBase:liveModel?.dataBase||null};
  }

  function getCurrentModel() { return model; }
  function isCurationMode() { return curationMode; }

  function savedFilterSelection() {
    const sel=selection();
    return Object.fromEntries(FILTERS.map(def=>[def.field,sel[def.field] ?? '']));
  }

  function restoreFilterSelection(saved) {
    FILTERS.forEach(def=>{
      const el=document.getElementById(def.id);
      if(el) el.value='';
    });
    populateHierarchyFilters();
    if(!saved || typeof saved!=='object') return;

    FILTERS.forEach(def=>{
      const el=document.getElementById(def.id);
      if(!el) return;
      const desired=saved[def.field];
      const desiredValue=desired==null ? '' : String(desired);
      if([...el.options].some(option=>option.value===desiredValue)) el.value=desiredValue;
      populateHierarchyFilters();
    });
  }

  function metricScopeKey(sel=selection()) {
    return [String(sel.unit||'*'),String(sel.phase||'*')].join('||');
  }

  function metricSelectionPayload() {
    return {
      groupAll:metricGroupAll,
      groups:[...metricSelectedGroups],
      stepAll:metricStepAll,
      steps:[...metricSelectedSteps]
    };
  }

  function resetMetricSelection() {
    metricGroupAll=true;
    metricSelectedGroups.clear();
    metricStepAll=true;
    metricSelectedSteps.clear();
    metricTreeStructureKey=null;
  }

  function applyMetricSelection(selected) {
    resetMetricSelection();
    if(selected && typeof selected==='object'){
      metricGroupAll=selected.groupAll!==false;
      metricStepAll=selected.stepAll!==false;
      (Array.isArray(selected.groups)?selected.groups:[]).forEach(key=>metricSelectedGroups.add(String(key)));
      (Array.isArray(selected.steps)?selected.steps:[]).forEach(id=>metricSelectedSteps.add(String(id)));
    }
  }

  function rememberMetricSelection(scopeKey=activeMetricScopeKey || metricScopeKey()) {
    if(!scopeKey) return;
    metricSelectionsByScope[scopeKey]=metricSelectionPayload();
  }

  function restoreMetricSelectionForScope(scopeKey=metricScopeKey(),fallback=null) {
    activeMetricScopeKey=scopeKey;
    applyMetricSelection(metricSelectionsByScope[scopeKey] || fallback);
  }

  function exportWeekData(weekNo) {
    rememberMetricSelection();
    return {
      ...(importedWeekPayload && typeof importedWeekPayload==='object' ? importedWeekPayload : {}),
      coordinationNotes:notes(weekNo),
      filterSelection:savedFilterSelection(),
      metricSelection:metricSelectionPayload(),
      metricSelectionsByScope:{...metricSelectionsByScope}
    };
  }

  function importWeekData(payload,weekNo) {
    importedWeekPayload=payload && typeof payload==='object'
      ? JSON.parse(JSON.stringify(payload))
      : {};
    metricSelectionsByScope=payload?.metricSelectionsByScope && typeof payload.metricSelectionsByScope==='object'
      ? JSON.parse(JSON.stringify(payload.metricSelectionsByScope))
      : {};

    if(payload?.coordinationNotes && typeof payload.coordinationNotes==='object'){
      writeJson(notesKey(weekNo),payload.coordinationNotes);
    }

    if(model){
      restoreFilterSelection(payload?.filterSelection);
      const scopeKey=metricScopeKey();
      restoreMetricSelectionForScope(scopeKey,payload?.metricSelection || null);
      if(!metricSelectionsByScope[scopeKey]) rememberMetricSelection(scopeKey);
      resetPagination();
      lastScopeKey='';
      render();
    } else {
      applyMetricSelection(payload?.metricSelection || null);
      activeMetricScopeKey='';
    }
  }

  function exportManualData(){ return {}; }
  function importManualData(){}

  window.PBDashboard={
    init,render,useSnapshot,useLive,getViewInfo,getCurrentModel,isCurationMode,finishCuration,getPresentationData,
    exportWeekData,importWeekData,exportManualData,importManualData,
    loadPhotos,savePendingPhotos
  };
}());
