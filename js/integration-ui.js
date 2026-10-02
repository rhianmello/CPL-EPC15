(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const fmt = value => Number(value || 0).toLocaleString('pt-BR');
  const state = { planning:null, eap:null, quality:null, files:{}, audit:null, aliases:[] };

  async function readFile(file) {
    const buffer = await file.arrayBuffer();
    return XLSX.read(buffer, { type:'array', cellDates:true, cellFormula:false });
  }

  function setStatus(text, tone = 'neutral') {
    const el = $('integration-status');
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  }

  function statusClass(status) {
    if (status === 'CONFIRMED') return 'status-good';
    if (status === 'SOURCE_ERROR' || status === 'AMBIGUOUS') return 'status-critical';
    if (status === 'UNMATCHED') return 'status-attention';
    return 'status-unknown';
  }

  function renderKpis(audit) {
    const s = audit.summary;
    const kpis = [
      ['Planning rows', s.planningRows, 'Avanço PLATAQ'],
      ['EAP ESTHC', s.eapEsthcReportRows, 'relatórios ESTHC'],
      ['Quality rows', s.qualityRows, 'Estaqueamento'],
      ['Confirmados', s.eapQualityStatus.CONFIRMED || 0, 'EAP x Qualidade'],
      ['Alias manual', s.eapQualityStatus.MANUAL_ALIAS || 0, 'corrigido sem editar Excel'],
      ['Sem vínculo', s.eapQualityStatus.UNMATCHED || 0, 'exigem análise'],
      ['Erro de origem', s.sourceErrors, 'não aceitar automático']
    ];
    $('integration-kpis').innerHTML = kpis.map(([label,value,note]) => `
      <article class="kpi"><span class="kpi-label">${escapeHtml(label)}</span><strong class="kpi-value">${fmt(value)}</strong><span class="kpi-note">${escapeHtml(note)}</span></article>
    `).join('');
  }

  function renderUnits(audit) {
    const units = Object.keys(audit.summary.qualityByUnit || {}).sort();
    $('integration-unit-body').innerHTML = units.map(unit => `
      <tr>
        <td><strong>${escapeHtml(unit)}</strong></td>
        <td class="numeric">${fmt(audit.summary.qualityByUnit[unit])}</td>
        <td class="numeric">${fmt(audit.summary.qualityExecutedByUnit[unit])}</td>
        <td class="numeric">${fmt(audit.summary.qualityNotExecutedByUnit[unit])}</td>
        <td class="numeric">${fmt(audit.summary.eapEsthcByUnit[unit])}</td>
      </tr>
    `).join('');
  }

  function renderAuditRows(audit) {
    const rows = audit.links.eapQualityLinks.filter(link => link.status !== 'CONFIRMED').slice(0, 120);
    $('integration-audit-body').innerHTML = rows.map(link => {
      const q = link.quality || {};
      const e = link.eap || link.candidates?.[0] || {};
      return `
        <tr>
          <td><span class="status-pill ${statusClass(link.status)}">${escapeHtml(link.status)}</span></td>
          <td>${escapeHtml(q.unit)}</td>
          <td>${escapeHtml(e.activityId || '—')}</td>
          <td>${escapeHtml(e.reportRaw || '—')}</td>
          <td>${escapeHtml(q.reportRaw || '—')}</td>
          <td>${escapeHtml(q.tag || e.tag || '—')}</td>
          <td>${escapeHtml(link.reason)}</td>
          <td>${escapeHtml([e.sourceRow && 'EAP ' + e.sourceRow, q.sourceRow && 'Q ' + q.sourceRow].filter(Boolean).join(' / '))}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="8" class="muted">Nenhuma divergência encontrada.</td></tr>';
  }

  function dateLabel(value) {
    if (!value) return '—';
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toLocaleDateString('pt-BR', { timeZone:'UTC' });
    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
      const d = XLSX.SSF.parse_date_code(value);
      return d ? String(d.d).padStart(2,'0') + '/' + String(d.m).padStart(2,'0') + '/' + d.y : '—';
    }
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10).split('-').reverse().join('/');
    return raw || '—';
  }

  function hasValue(value) {
    return value != null && String(value).trim() !== '';
  }

  function statusForPile(row) {
    if (hasValue(row.rnc)) return 'Crítico';
    if (!hasValue(row.executionDate)) return 'A executar';
    if (hasValue(row.pitStatus) && !/INTEGRA/i.test(window.IntegrationNormalizer.fold(row.pitStatus))) return 'Atenção PIT';
    if (!hasValue(row.pitStatus) || !hasValue(row.strength28)) return 'Pendente';
    return 'Completa';
  }

  function renderUnitQuality(unit, phase) {
    const panel = $('unit-quality-panel');
    if (!panel) return;
    const empty = $('unit-quality-empty');
    const content = $('unit-quality-content');
    const status = $('unit-quality-status');
    const title = $('unit-quality-title');
    if (title) title.textContent = unit?.rawName || unit?.code || 'Estacas relacionadas';
    if (!state.audit) {
      if (status) status.textContent = 'Auditoria não carregada';
      empty.classList.remove('hidden');
      content.classList.add('hidden');
      empty.textContent = 'Carregue e corrija a auditoria para ver as estacas vinculadas nesta unidade.';
      return;
    }
    const unitCode = unit?.code || '';
    const links = state.audit.links.eapQualityLinks.filter(link =>
      ['CONFIRMED','MANUAL_ALIAS'].includes(link.status) &&
      link.eap?.unit === unitCode &&
      (!phase || link.eap?.hierarchy?.fase === phase)
    );
    if (status) status.textContent = links.length ? links.length + ' estacas vinculadas' : 'Sem estacas vinculadas';
    if (!links.length) {
      empty.classList.remove('hidden');
      content.classList.add('hidden');
      empty.textContent = phase
        ? 'Nenhuma estaca vinculada para esta fase depois da auditoria.'
        : 'Nenhuma estaca vinculada para esta unidade depois da auditoria.';
      return;
    }
    const piles = links.map(link => ({ ...link.quality, linkStatus:link.status, activityId:link.eap?.activityId || '', hierarchy:link.eap?.hierarchy || {} }));
    const executed = piles.filter(row => hasValue(row.executionDate));
    const pit = executed.filter(row => hasValue(row.pitStatus));
    const pce = executed.filter(row => hasValue(row.pceStatus));
    const critical = piles.filter(row => statusForPile(row).startsWith('Crítico') || statusForPile(row).startsWith('Atenção'));
    $('unit-quality-kpis').innerHTML = [
      ['Estacas cadastradas', piles.length, 'Vínculo EAP x Qualidade'],
      ['Executadas', executed.length, piles.length ? Math.round(executed.length / piles.length * 100) + '%' : '0%'],
      ['A executar', piles.length - executed.length, 'Sem data de execução'],
      ['Cobertura PIT', pit.length, executed.length ? Math.round(pit.length / executed.length * 100) + '%' : '0%'],
      ['PCE', pce.length, 'Ensaios registrados'],
      ['Críticas', critical.length, 'RNC ou achado técnico']
    ].map(([label,value,note]) => `<div><span>${escapeHtml(label)}</span><strong>${fmt(value)}</strong><small>${escapeHtml(note)}</small></div>`).join('');
    $('unit-quality-body').innerHTML = piles.slice(0, 300).map(row => `
      <tr>
        <td><strong>${escapeHtml(row.tag || row.tagRaw || '—')}</strong></td>
        <td>${escapeHtml(row.reportRaw || '—')}</td>
        <td>${escapeHtml(row.activityId || '—')}</td>
        <td>${escapeHtml(row.hierarchy.fase || '—')}</td>
        <td>${escapeHtml(row.hierarchy.etapa || '—')}</td>
        <td>${escapeHtml(dateLabel(row.executionDate))}</td>
        <td>${escapeHtml(row.pitStatus || '—')}</td>
        <td>${escapeHtml(row.pceStatus || '—')}</td>
        <td><span class="status-pill ${row.linkStatus === 'MANUAL_ALIAS' ? 'status-attention' : 'status-good'}">${escapeHtml(row.linkStatus === 'MANUAL_ALIAS' ? 'Alias manual' : statusForPile(row))}</span></td>
      </tr>
    `).join('');
    empty.classList.add('hidden');
    content.classList.remove('hidden');
  }

  function renderCase(audit) {
    const c = audit.summary.u8226E003;
    const e = c.eapContext[0] || {};
    const q = c.quality[0] || {};
    const hasAlias = state.aliases.some(alias => Number(alias.sourceRow) === Number(e.sourceRow));
    $('integration-case').innerHTML = `
      <div class="integration-case-grid">
        <div><span>Qualidade</span><strong>${escapeHtml(q.reportRaw || 'não encontrado')}</strong><small>Linha ${escapeHtml(q.sourceRow || '—')} • ${escapeHtml(q.unit || '—')}</small></div>
        <div><span>EAP contexto</span><strong>${escapeHtml(e.activityId || 'não encontrado')}</strong><small>${escapeHtml(e.unit || '—')} • ${escapeHtml(e.hierarchy?.criterio || 'sem critério')}</small></div>
        <div><span>Classificação</span><strong>${hasAlias ? 'MANUAL_ALIAS' : 'SOURCE_ERROR'}</strong><small>${hasAlias ? 'Correção aplicada sem alterar a planilha original.' : 'AO diverge do contexto U-8226; resolver via alias manual.'}</small></div>
      </div>
      <button id="integration-apply-u8226-alias" class="integration-alias-button" type="button" ${hasAlias ? 'disabled' : ''}>${hasAlias ? 'Correção aplicada' : 'Corrigir U-8226 / E003'}</button>
    `;
    $('integration-apply-u8226-alias')?.addEventListener('click', applyU8226Alias);
  }

  function render(audit) {
    renderKpis(audit);
    renderUnits(audit);
    renderAuditRows(audit);
    renderCase(audit);
    $('integration-results').classList.remove('hidden');
  }

  async function handleFile(kind, file) {
    if (!file) return;
    state[kind] = await readFile(file);
    state.files[kind] = file;
    const missing = missingKinds();
    setStatus(
      missing.length
        ? file.name + ' carregado. Falta carregar: ' + missing.join(', ') + '.'
        : 'Três arquivos carregados. Auditoria executada automaticamente.',
      missing.length ? 'local' : 'cloud'
    );
    if (!missing.length) runAudit();
  }

  function missingKinds() {
    return ['planning','eap','quality'].filter(kind => !state[kind]);
  }

  function runAudit() {
    state.audit = window.IntegrationMatcher.audit({
      planningWorkbook:state.planning,
      eapWorkbook:state.eap,
      qualityWorkbook:state.quality,
      files:state.files,
      aliases:state.aliases
    });
    render(state.audit);
    setStatus('Auditoria concluída com os três arquivos reais carregados.', 'cloud');
  }

  function applyU8226Alias() {
    const eapRow = state.audit?.summary?.u8226E003?.eapContext?.find(row => row.reportNormalized === 'ESTHCU8224E003');
    if (!eapRow) {
      setStatus('Não encontrei a linha EAP do caso U-8226/E003 para aplicar o alias.', 'error');
      return;
    }
    state.aliases = state.aliases.filter(alias => Number(alias.sourceRow) !== Number(eapRow.sourceRow));
    state.aliases.push({
      sourceType:'eap_report',
      sourceRow:eapRow.sourceRow,
      sourceValueRaw:eapRow.reportRaw,
      sourceValueNormalized:eapRow.reportNormalized,
      correctedValueRaw:'ESTHC_U-8226-E003',
      correctedValueNormalized:'ESTHCU8226E003',
      reason:'inconsistência entre relatório e contexto da atividade'
    });
    runAudit();
    setStatus('Alias manual aplicado: ESTHC_U-8224-E003=0 → ESTHC_U-8226-E003.', 'cloud');
  }

  async function publish() {
    if (!state.audit) return;
    setStatus('Publicando auditoria...', 'local');
    try {
      const result = await window.IntegrationRepository.publishAudit(state.audit);
      setStatus('Auditoria publicada • V' + result.version_no, 'cloud');
    } catch (error) {
      setStatus('Falha ao publicar auditoria: ' + error.message, 'error');
    }
  }

  function init() {
    if (!$('integration-planning-file')) return;
    $('integration-planning-file').addEventListener('change', event => handleFile('planning', event.target.files?.[0]).catch(error => setStatus(error.message, 'error')));
    $('integration-eap-file').addEventListener('change', event => handleFile('eap', event.target.files?.[0]).catch(error => setStatus(error.message, 'error')));
    $('integration-quality-file').addEventListener('change', event => handleFile('quality', event.target.files?.[0]).catch(error => setStatus(error.message, 'error')));
    $('integration-run')?.addEventListener('click', () => {
      if (missingKinds().length) setStatus('Carregue os três arquivos antes de reprocessar a auditoria.', 'warning');
      else runAudit();
    });
    $('integration-publish')?.addEventListener('click', publish);
  }

  window.IntegrationUI = { init, getAudit: () => state.audit, renderUnitQuality };
  document.addEventListener('DOMContentLoaded', init);
}());
