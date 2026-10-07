(function () {
  let model;
  let executiveBaseModel;
  let executiveModel;
  let executiveUnitCode = '';
  let executiveWeek = '';
  let executiveFilterBusy = false;
  let currentUnit;
  let currentPhase = '';
  let analysisPhase = '';
  let unitSortAscending = true;
  const pt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const moneyWhole = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits:0, minimumFractionDigits:0 });
  const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const percent = value => Number.isFinite(value) ? `${pt.format(value * 100)}%` : '—';
  const pp = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${pt.format(value * 100)}%` : '—';
  const currency = value => Number.isFinite(value) ? money.format(value) : '—';
  const currencyWhole = value => Number.isFinite(value) ? moneyWhole.format(value) : '—';
  const quantity = value => Number.isFinite(value) ? integer.format(value) : '—';
  const date = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(value) : '—';
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const status = item => `<span class="status-pill status-${item.status.key}">${item.status.label}</span>`;

  function kpi(label, value, note, accent) {
    return `<article class="kpi" style="--accent:${accent}"><span class="kpi-label">${label}</span><strong class="kpi-value">${value}</strong><span class="kpi-note">${note || ''}</span></article>`;
  }

  function init(data, fileName) {
    model = data;
    executiveBaseModel = data;
    executiveModel = data;
    executiveUnitCode = '';
    executiveWeek = '';
    document.getElementById('file-name').textContent = fileName;
    document.getElementById('header-date').textContent = date(model.dataBase);
    renderUnitNavigation();
    setupExecutiveFilters();
    renderExecutive();
    buildAnalysisPhaseFilter();
    renderAnalyses();
    if (window.PBDashboard) window.PBDashboard.init(model, fileName);
  }

  function titleCaseUnit(raw) {
    const match = String(raw || '').match(/^(U-\d{4})\s*[-–]\s*(.+)$/i);
    if (!match) return raw || '';
    const small = new Set(['de','da','do','das','dos','e']);
    const name = match[2].toLocaleLowerCase('pt-BR').split(/\s+/).map((word,i) =>
      i > 0 && small.has(word) ? word : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
    ).join(' ');
    return match[1].toUpperCase() + ' - ' + name;
  }

  function unitHasExecution(unit) {
    const rows=[unit,...(unit?.phases||[]),...(unit?.details||[])];
    return rows.some(row=>[
      row?.actual,
      row?.actualValue,
      row?.actualQuantity,
      row?.attackActualValue,
      row?.attackActualQuantity
    ].some(value=>Number.isFinite(Number(value)) && Number(value)>0));
  }

  function canInspectNotStartedUnit() {
    return Boolean(window.PBDashboard?.isCurationMode?.());
  }

  function renderUnitNavigation() {
    document.getElementById('unit-nav').innerHTML = model.units.map((unit, index) => {
      const started=unitHasExecution(unit);
      const locked=!started && !canInspectNotStartedUnit();
      const title=locked
        ? titleCaseUnit(unit.rawName)+' • Unidade não iniciada'
        : unit.rawName;
      return `<button class="nav-item unit-nav-item${locked?' unit-nav-item-not-started':''}" data-unit-index="${index}" data-unit-started="${started?'1':'0'}" aria-disabled="${locked?'true':'false'}" title="${escapeHtml(title)}">${escapeHtml(titleCaseUnit(unit.rawName))}${locked?'<span class="unit-not-started-badge">NÃO INICIADA</span>':''}</button>`;
    }).join('');
  }

  function executiveUnits() {
    const source=executiveModel || executiveBaseModel || model;
    if(!source?.units) return [];
    if(!executiveUnitCode) return source.units;
    return source.units.filter(unit=>String(unit.code||'')===String(executiveUnitCode));
  }

  function executiveScope() {
    const source=executiveModel || executiveBaseModel || model;
    if(!source) return null;
    if(!executiveUnitCode) return source.contract;
    return source.units?.find(unit=>String(unit.code||'')===String(executiveUnitCode)) || null;
  }

  function executiveUnitLabel() {
    const unit=(executiveModel?.units || []).find(item=>String(item.code||'')===String(executiveUnitCode));
    return unit ? titleCaseUnit(unit.rawName || unit.code) : 'Todas as unidades';
  }

  function executiveFilterStatus() {
    const el=document.getElementById('executive-filter-status');
    if(!el) return;
    if(executiveFilterBusy){
      el.textContent='Carregando histórico...';
      el.dataset.tone='loading';
      return;
    }
    const source=executiveModel || executiveBaseModel || model;
    const weekText=executiveWeek ? 'Semana '+executiveWeek : 'Versão atual';
    const unitText=executiveUnitCode ? executiveUnitLabel() : 'Todas as unidades';
    el.textContent=weekText+' • '+unitText+' • Data-base '+date(source?.dataBase);
    el.dataset.tone='ok';
  }

  function populateExecutiveUnitFilter() {
    const select=document.getElementById('executive-unit-filter');
    if(!select) return;
    const source=executiveModel || executiveBaseModel || model;
    const units=source?.units || [];
    const previous=executiveUnitCode;
    select.innerHTML='<option value="">Todas as unidades</option>'+
      units.map(unit=>'<option value="'+escapeHtml(unit.code)+'">'+escapeHtml(titleCaseUnit(unit.rawName || unit.code))+'</option>').join('');
    executiveUnitCode=units.some(unit=>String(unit.code||'')===String(previous)) ? previous : '';
    select.value=executiveUnitCode;
  }

  async function populateExecutiveWeekFilter() {
    const select=document.getElementById('executive-week-filter');
    if(!select) return;
    const currentLabel='Atual • '+date(executiveBaseModel?.dataBase || model?.dataBase);
    select.innerHTML='<option value="">'+escapeHtml(currentLabel)+'</option>';
    if(!window.CloudSync?.ready?.()) return;
    try{
      const weeks=await window.CloudSync.listCoordinationWeeks();
      const available=(weeks||[])
        .filter(w=>Boolean(w.has_snapshot))
        .sort((a,b)=>Number(b.week_no)-Number(a.week_no));
      select.innerHTML='<option value="">'+escapeHtml(currentLabel)+'</option>'+
        available.map(w=>{
          const rawBase=String(w.excel_data_base || '').trim();
          const parsedBase=rawBase ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(rawBase) ? rawBase+'T00:00:00Z' : rawBase) : null;
          const db=parsedBase && !Number.isNaN(parsedBase.valueOf()) ? ' • base '+date(parsedBase) : '';
          return '<option value="'+Number(w.week_no)+'">Semana '+Number(w.week_no)+db+'</option>';
        }).join('');
      select.value=executiveWeek ? String(executiveWeek) : '';
    }catch(error){
      console.error('Falha ao carregar semanas do Painel Gerencial',error);
    }
  }

  async function setExecutiveWeek(value) {
    const week=Number(value);
    executiveFilterBusy=true;
    executiveFilterStatus();
    const weekSelect=document.getElementById('executive-week-filter');
    const unitSelect=document.getElementById('executive-unit-filter');
    if(weekSelect) weekSelect.disabled=true;
    if(unitSelect) unitSelect.disabled=true;
    try{
      if(!value || !Number.isFinite(week)){
        executiveWeek='';
        executiveModel=executiveBaseModel || model;
      }else{
        const result=await window.CloudSync?.loadCoordinationWeek?.(week);
        const snapshot=result?.snapshot;
        if(!snapshot?.dataset?.model) throw new Error('A Semana '+week+' não possui snapshot do Excel.');
        executiveWeek=week;
        executiveModel=snapshot.dataset.model;
      }
      populateExecutiveUnitFilter();
      renderExecutive();
    }catch(error){
      console.error('Falha ao carregar semana no Painel Gerencial',error);
      executiveWeek='';
      executiveModel=executiveBaseModel || model;
      if(weekSelect) weekSelect.value='';
      populateExecutiveUnitFilter();
      renderExecutive();
      alert(error?.message || 'Não foi possível carregar a semana selecionada.');
    }finally{
      executiveFilterBusy=false;
      if(weekSelect) weekSelect.disabled=false;
      if(unitSelect) unitSelect.disabled=false;
      executiveFilterStatus();
    }
  }

  function setExecutiveUnit(value) {
    executiveUnitCode=String(value || '');
    renderExecutive();
  }

  function setupExecutiveFilters() {
    populateExecutiveUnitFilter();
    populateExecutiveWeekFilter();
    const weekSelect=document.getElementById('executive-week-filter');
    const unitSelect=document.getElementById('executive-unit-filter');
    if(weekSelect && !weekSelect.dataset.bound){
      weekSelect.addEventListener('change',event=>setExecutiveWeek(event.target.value));
      weekSelect.dataset.bound='1';
    }
    if(unitSelect && !unitSelect.dataset.bound){
      unitSelect.addEventListener('change',event=>setExecutiveUnit(event.target.value));
      unitSelect.dataset.bound='1';
    }
    executiveFilterStatus();
  }

  function renderExecutive() {
    const c = executiveScope();
    if(!c) return;
    const selectedUnit=Boolean(executiveUnitCode);
    document.getElementById('executive-kpis').innerHTML = [
      kpi(selectedUnit?'Valor previsto da unidade':'Valor total do contrato', currency(c.plannedValue), selectedUnit?executiveUnitLabel():'Base consolidada', '#3b82f6'),
      kpi('Previsto', percent(c.planned), selectedUnit?'Avanço físico da unidade':'Avanço físico', '#60a5fa'),
      kpi('Realizado', percent(c.actual), selectedUnit?'Avanço físico da unidade':'Avanço físico', '#22d3ee'),
      kpi('Desvio', pp(c.variance), 'Realizado − previsto', c.variance >= 0 ? '#22c55e' : '#ef4444')
    ].join('');

    renderUnitsTable();
    renderExecutivePhases();
    DashboardCharts.unitProgress(executiveUnits(), 'units-progress-chart', 'executiveUnits');
    executiveFilterStatus();
  }

  function renderUnitsTable() {
    const sorted = [...executiveUnits()].sort((a,b) => unitSortAscending ? (a.variance ?? 0) - (b.variance ?? 0) : (b.variance ?? 0) - (a.variance ?? 0));
    document.getElementById('units-table').innerHTML = sorted.map(unit => `<tr data-unit-code="${escapeHtml(unit.code)}">
      <td><strong>${escapeHtml(unit.code)}</strong><br><span class="muted">${escapeHtml(unit.rawName)}</span></td>
      <td class="numeric">${percent(unit.planned)}</td><td class="numeric">${percent(unit.actual)}</td>
      <td class="numeric">${pp(unit.variance)}</td><td class="numeric">${currency(unit.plannedValue)}</td><td>${status(unit)}</td></tr>`).join('');
  }

  function renderExecutivePhases() {
    const groups = new Map();
    executiveUnits().forEach(unit => (unit.phases || []).forEach(row => {
      if (!row.phase) return;
      if (!groups.has(row.phase)) groups.set(row.phase, []);
      groups.get(row.phase).push(row);
    }));
    const weighted = (rows, field) => {
      const valid = rows.filter(row => Number.isFinite(row[field]));
      if (!valid.length) return null;
      const basis = valid.every(row => Number.isFinite(row.plannedValue) && row.plannedValue > 0)
        ? 'plannedValue' : valid.every(row => Number.isFinite(row.weight) && row.weight > 0) ? 'weight' : null;
      if (!basis) return valid.length === 1 ? valid[0][field] : null;
      const total = valid.reduce((sum, row) => sum + row[basis], 0);
      return valid.reduce((sum, row) => sum + row[field] * row[basis], 0) / total;
    };
    const phases = [...groups].map(([phase, rows]) => ({
      code: phase, planned: weighted(rows, 'planned'), actual: weighted(rows, 'actual')
    }));
    DashboardCharts.unitProgress(phases, 'executive-phases-chart', 'executivePhases');
  }

  function showPage(page) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
    document.getElementById('page-title').textContent = page === 'executive' ? 'Painel Gerencial' : page === 'pb' ? 'Reunião de Coordenação' : page === 'analysis' ? 'Análises' : page === 'photo-time' ? 'Tempo Fotográfico' : currentUnit?.rawName || 'Unidade';
    const topbar=document.querySelector('.topbar');
    topbar?.querySelector(':scope > div:first-child')?.classList.toggle('hidden', page === 'pb');
    topbar?.classList.toggle('pb-mode', page === 'pb');
    document.getElementById('pb-topbar-week-tools')?.classList.toggle('hidden', page !== 'pb');
    if (page === 'executive') executiveFilterStatus();
    if (page === 'pb' && window.PBDashboard) window.PBDashboard.render();
    if (page === 'analysis') {
      buildAnalysisPhaseFilter();
      renderAnalyses();
    }
  }

  function unitScope(unit) {
    if (!currentPhase) return unit;
    return unit.phases.find(p => p.phase === currentPhase) || unit;
  }

  function buildPhaseSelector(unit) {
    const select = document.getElementById('unit-phase-filter');
    if (!select) return;
    const phases = [...new Set(unit.phases.map(p => p.phase).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    select.innerHTML = '<option value="">Todas as fases</option>' + phases.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    select.value = currentPhase;
  }

  function rowLabel(row) {
    return row.criterion || row.step || row.component || row.grouping || row.subphase || row.phase || 'Item sem identificação';
  }

  function renderDelayedItems(unit) {
    const levelSelect = document.getElementById('delay-level-filter');
    const subphaseSelect = document.getElementById('delay-subphase-filter');
    const level = Number(levelSelect?.value || 3);
    const nextUnit = model.units.find(item => item.sourceIndex > unit.sourceIndex);
    const scope = (model.coordinationRows || []).filter(row =>
      row.sourceIndex > unit.sourceIndex && (!nextUnit || row.sourceIndex < nextUnit.sourceIndex) &&
      (!currentPhase || row.phase === currentPhase));
    const subphases = [...new Set(scope.filter(row => row.level === 3).map(row => row.subphase).filter(Boolean))];
    if (subphaseSelect) {
      const previous = subphaseSelect.value;
      subphaseSelect.innerHTML = '<option value="">Todas as subfases</option>' +
        subphases.map(value => '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>').join('');
      subphaseSelect.value = subphases.includes(previous) ? previous : '';
      subphaseSelect.disabled = level === 2;
    }
    const rows = scope.filter(row => row.level === level &&
      (level !== 3 || !subphaseSelect?.value || row.subphase === subphaseSelect.value) &&
      Number.isFinite(row.variance) && row.variance < 0).sort((a,b) => a.variance - b.variance);
    document.getElementById('delay-count').textContent = integer.format(rows.length) + ' em atraso';
    const list = document.getElementById('delay-list');
    list.innerHTML = rows.map((row,index) => {
      const label = level === 2 ? row.phase : row.subphase;
      return '<div class="delay-item"><span class="delay-rank">' + String(index+1).padStart(2,'0') +
        '</span><div class="delay-copy"><strong>' + escapeHtml(label || 'Sem identificação') +
        '</strong><span>' + escapeHtml(level === 3 ? row.phase : 'Fase') +
        '</span></div><div class="delay-metrics"><b>' + pp(row.variance) +
        '</b><small>' + percent(row.actual) + ' / ' + percent(row.planned) + '</small></div></div>';
    }).join('') || '<div class="delay-empty">Nenhuma fase ou subfase com desvio negativo para esta seleção.</div>';
    [levelSelect, subphaseSelect].forEach(select => {
      if (select && !select.dataset.bound) {
        select.addEventListener('change', () => renderDelayedItems(currentUnit));
        select.dataset.bound = '1';
      }
    });
  }

  function renderFinancialHeader(unit, curve) {
    const title = document.getElementById('unit-curve-unit');
    const dateEl = document.getElementById('unit-curve-date');
    const summaryEl = document.getElementById('unit-financial-summary');
    const sourceEl = document.getElementById('unit-curve-source');
    if (title) title.textContent = titleCaseUnit(unit.rawName).toUpperCase();
    if (dateEl) dateEl.textContent = 'Data-base: ' + date(model.dataBase);
    if (sourceEl) {
      if (curve?.source === 'blplanataq-summary' || curve?.source === 'blplanataq-direct') {
        const rows = curve.sourceRows ? Object.values(curve.sourceRows).filter(Number.isFinite) : [];
        sourceEl.textContent = rows.length
          ? 'Fonte: BLPlanAtaq • linhas ' + Math.min(...rows) + '–' + Math.max(...rows)
          : 'Fonte: BLPlanAtaq • blocos financeiros';
      } else if (curve?.source === 'curvas-chart') {
        sourceEl.textContent = 'Fonte: gráfico original da aba CURVAS';
      } else if (curve?.source === 'financial-sheets') {
        sourceEl.textContent = 'Fonte: dados consolidados da curva';
      } else {
        sourceEl.textContent = 'Fonte: CURVAS';
      }
    }
    if (!summaryEl) return;
    const s = curve?.summary;
    if (!s) {
      summaryEl.innerHTML = '<div class="financial-summary-empty">Resumo financeiro não disponível para esta unidade.</div>';
      return;
    }
    const diffClass = v => Number.isFinite(v) && v >= 0 ? 'positive' : 'negative';
    const realMonth = s.realMonth;
    const contractMonthDiff = Number.isFinite(realMonth)&&Number.isFinite(s.contractualMonth) ? realMonth-s.contractualMonth : null;
    const planMonthDiff = Number.isFinite(realMonth)&&Number.isFinite(s.planMonth) ? realMonth-s.planMonth : null;
    summaryEl.innerHTML = `
      <div class="financial-summary-row financial-summary-head financial-summary-seven">
        <span>Referência</span><span>Previsto Mês</span><span>Real Mês</span><span>Diferença</span><span>Previsto Acum.</span><span>Real Acum.</span><span>Diferença</span>
      </div>
      <div class="financial-summary-row financial-summary-seven">
        <strong>BL Contratual</strong><span>${currency(s.contractualMonth)}</span><span>${currency(realMonth)}</span><b class="${diffClass(contractMonthDiff)}">${currency(contractMonthDiff)}</b><span>${currency(s.contractualValue)}</span><span>${currency(s.actualValue)}</span><b class="${diffClass(s.contractualDifference)}">${currency(s.contractualDifference)}</b>
      </div>
      <div class="financial-summary-row financial-summary-seven attack">
        <strong>Plano de Ataque</strong><span>${currency(s.planMonth)}</span><span>${currency(realMonth)}</span><b class="${diffClass(planMonthDiff)}">${currency(planMonthDiff)}</b><span>${currency(s.planValue)}</span><span>${currency(s.actualValue)}</span><b class="${diffClass(s.planDifference)}">${currency(s.planDifference)}</b>
      </div>`;
  }

  function renderUnitSummary() {
    if (!currentUnit) return;
    const u = currentUnit;
    const scope = unitScope(u);
    const phaseRows = currentPhase ? u.phases.filter(p => p.phase === currentPhase) : u.phases;

    document.getElementById('unit-kpis').innerHTML = [
      kpi('Previsto', percent(scope.planned), currentPhase ? currentPhase : 'Avanço físico da unidade', '#60a5fa'),
      kpi('Realizado', percent(scope.actual), currentPhase ? currentPhase : 'Avanço físico da unidade', '#22d3ee'),
      kpi('Desvio', pp(scope.variance), 'Previsto x realizado', scope.variance >= 0 ? '#22c55e' : '#ef4444'),
      kpi(
        'Valor total',
        currencyWhole(scope.plannedValue),
        Number.isFinite(scope.plannedValue) && Number.isFinite(model?.contract?.plannedValue) && model.contract.plannedValue>0
          ? integer.format(scope.plannedValue/model.contract.plannedValue*100)+'% do contrato EPC-15'
          : 'Participação no contrato EPC-15',
        '#8b5cf6'
      )
    ].join('');

    document.getElementById('phase-table').innerHTML = phaseRows.map(p => {
      const s = DataModel.statusFor(p.variance);
      return `<tr><td>${escapeHtml(p.phase)}</td><td class="numeric">${percent(p.planned)}</td><td class="numeric">${percent(p.actual)}</td><td class="numeric">${pp(p.variance)}</td><td>${status({status:s})}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Sem fases disponíveis.</td></tr>';

    DashboardCharts.phaseProgress(phaseRows);
    renderDelayedItems(u);

    renderFinancialHeader(u, u.curve);
    const empty = document.getElementById('unit-curve-empty');
    let curveOk = false;
    if (currentPhase) {
      DashboardCharts.financialCurve(null);
      if (empty) {
        empty.textContent = 'Sem curva disponível para a fase selecionada.';
        empty.classList.remove('hidden');
      }
      const sourceEl = document.getElementById('unit-curve-source');
      if (sourceEl) sourceEl.textContent = 'A Curva Física é exibida apenas na visão geral da unidade.';
    } else {
      curveOk = DashboardCharts.financialCurve(u.curve);
      if (empty) {
        empty.textContent = 'Curva Física não disponível para esta unidade.';
        empty.classList.toggle('hidden', curveOk);
      }
    }
  }

  function renderUnit(index) {
    currentUnit = model.units[index];
    currentPhase = '';
    const subphaseSelect = document.getElementById('delay-subphase-filter');
    if (subphaseSelect) subphaseSelect.value = '';
    buildPhaseSelector(currentUnit);
    renderUnitSummary();
    showPage('unit');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-unit-index="${index}"]`)?.classList.add('active');
    document.getElementById('page-title').textContent = currentUnit.rawName;
  }

  function setPhaseFilter(value) {
    currentPhase = value || '';
    const select = document.getElementById('unit-phase-filter');
    if (select && select.value !== currentPhase) select.value = currentPhase;
    renderUnitSummary();
  }

  function buildFilters(unit) {
    const fields = [['subphase','Subfase'],['grouping','Agrupamento'],['component','Componente'],['step','Etapa']];
    document.getElementById('unit-filters').innerHTML = `<input id="detail-search" type="search" placeholder="Pesquisar no detalhamento...">` + fields.map(([key,label]) => {
      const values = [...new Set(unit.details.filter(r => !currentPhase || r.phase === currentPhase).map(r => r[key]).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
      return `<select data-filter="${key}"><option value="">${label}: todos</option>${values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>`;
    }).join('');
  }

  function renderDetails() {
    if (!currentUnit) return;
    const query = (document.getElementById('detail-search')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const selections = Object.fromEntries([...document.querySelectorAll('#unit-filters select')].map(el => [el.dataset.filter, el.value]));
    const rows = currentUnit.details.filter(row => {
      if (currentPhase && row.phase !== currentPhase) return false;
      const selected = Object.entries(selections).every(([key,value]) => !value || row[key] === value);
      const haystack = [row.phase,row.subphase,row.grouping,row.component,row.step,row.criterion].join(' ').toLocaleLowerCase('pt-BR');
      return selected && (!query || haystack.includes(query));
    });
    document.getElementById('detail-count').textContent = `${integer.format(rows.length)} itens`;
    document.getElementById('detail-body').innerHTML = rows.slice(0,750).map(row => `<tr>
      <td>${escapeHtml(row.phase)}</td><td>${escapeHtml(row.subphase)}</td><td>${escapeHtml(row.grouping)}</td><td>${escapeHtml(row.component)}</td><td>${escapeHtml(row.step)}</td><td>${escapeHtml(row.criterion)}</td>
      <td class="numeric">${percent(row.planned)}</td><td class="numeric">${percent(row.actual)}</td><td class="numeric">${pp(row.variance)}</td>
      <td class="numeric">${quantity(row.plannedQuantity)}</td><td class="numeric">${quantity(row.actualQuantity)}</td><td>${escapeHtml(row.measureUnit)}</td></tr>`).join('');
    if (rows.length > 750) document.getElementById('detail-count').textContent += ' (750 exibidos)';
  }

  function analysisPhases() {
    return [...new Set(
      model.units.flatMap(unit => (unit.phases || [])
        .filter(phase => Number.isFinite(phase.planned) && Number.isFinite(phase.actual) && Number.isFinite(phase.weightedVariance))
        .map(phase => phase.phase)
        .filter(Boolean))
    )].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  }

  function buildAnalysisPhaseFilter() {
    const select=document.getElementById('analysis-phase-filter');
    if(!select) return;
    const previous=analysisPhase;
    const phases=analysisPhases();
    select.innerHTML='<option value="">Todas as fases</option>'+
      phases.map(phase=>'<option value="'+escapeHtml(phase)+'">'+escapeHtml(phase)+'</option>').join('');
    analysisPhase=phases.includes(previous) ? previous : '';
    select.value=analysisPhase;
    if(!select.dataset.bound){
      select.addEventListener('change',event=>{
        analysisPhase=event.target.value || '';
        renderAnalyses();
      });
      select.dataset.bound='1';
    }
  }

  function analysisUnits() {
    if(!analysisPhase) return model.units;
    return model.units.map(unit=>{
      const phase=(unit.phases || []).find(item=>item.phase===analysisPhase);
      return phase ? {...phase,code:unit.code,rawName:unit.rawName} : null;
    }).filter(Boolean);
  }

  function renderAnalyses() {
    const units=analysisUnits();
    const status=document.getElementById('analysis-phase-status');
    if(status){
      status.textContent=analysisPhase
        ? analysisPhase+' • '+units.length+' unidade'+(units.length===1?'':'s')+' com dados'
        : 'Comparativo geral por unidade • desvio ponderado pela coluna AB';
    }
    DashboardCharts.unitProgress(units, 'analysis-progress-chart', 'analysisProgress');
    DashboardCharts.variance(
      units.map(unit=>({...unit,variance:unit.weightedVariance})),
      'Desvio ponderado (AB)'
    );
  }

  function toggleSort() { unitSortAscending = !unitSortAscending; renderUnitsTable(); }

  window.Dashboard = {
    init, showPage, renderUnit, setPhaseFilter, toggleSort, setExecutiveWeek, setExecutiveUnit,
    refreshUnitNavigation:renderUnitNavigation, unitHasExecution,
    format: { percent, pp, currency, quantity, date, escapeHtml },
    getModel: () => model,
    getPresentationModel: () => executiveModel || executiveBaseModel || model,
    getExecutiveWeek: () => executiveWeek
  };
}());
