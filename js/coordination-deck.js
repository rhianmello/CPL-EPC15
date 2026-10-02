(function () {
  const KEY_PREFIX = 'epc15_coordination_deck_v3::W';
  const LEGACY_KEY = 'epc15_coordination_ppt_v1';
  let pageIndex = 0;
  let installed = false;

  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const norm = value => String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const clean = value => String(value == null ? '' : value).replace(/\s+/g,' ').trim();
  const isPlaceholder = value => {
    const raw = clean(value);
    if (!raw) return false;
    const compact = norm(raw).replace(/\s+/g,'');
    return /^X{3,}$/.test(compact) || /^PREENCHER$/i.test(raw);
  };

  function selectedWeek(explicitWeek) {
    const direct = Number(explicitWeek);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const manager = Number(window.CoordinationWeek?.getSelectedWeek?.());
    if (Number.isFinite(manager) && manager > 0) return manager;
    const select = Number(document.getElementById('pb-week-filter')?.value);
    return Number.isFinite(select) && select > 0 ? select : 26;
  }

  function storageKey(weekNo) {
    return KEY_PREFIX + selectedWeek(weekNo);
  }

  function read(weekNo) {
    try { return JSON.parse(localStorage.getItem(storageKey(weekNo)) || 'null'); } catch (_) { return null; }
  }

  function write(data, weekNo) {
    try { localStorage.setItem(storageKey(weekNo), JSON.stringify(data)); } catch (_) {}
    pageIndex = 0;
    render();
    document.dispatchEvent(new CustomEvent('coordinationdeckchange', { detail:{ weekNo:selectedWeek(weekNo) } }));
  }

  function clear(weekNo) {
    try { localStorage.removeItem(storageKey(weekNo)); localStorage.removeItem(LEGACY_KEY); } catch (_) {}
    pageIndex = 0;
    render();
    document.dispatchEvent(new CustomEvent('coordinationdeckchange', { detail:{ weekNo:selectedWeek(weekNo) } }));
  }

  function localChildren(node, name) {
    return [...node.getElementsByTagNameNS('*', name)];
  }

  function shapeBlocks(doc) {
    const out = [];
    const shapes = [...doc.getElementsByTagNameNS('*','sp')];
    shapes.forEach(sp => {
      const paragraphs = [...sp.getElementsByTagNameNS('*','p')];
      const paraTexts = paragraphs.map(p => [...p.getElementsByTagNameNS('*','t')].map(t => t.textContent || '').join('')).map(clean).filter(Boolean);
      const text = clean(paraTexts.join(' '));
      if (!text) return;
      const xfrm = sp.getElementsByTagNameNS('*','xfrm')[0];
      const off = xfrm?.getElementsByTagNameNS('*','off')[0];
      const ext = xfrm?.getElementsByTagNameNS('*','ext')[0];
      out.push({
        text,
        x: Number(off?.getAttribute('x')) || 0,
        y: Number(off?.getAttribute('y')) || 0,
        cx: Number(ext?.getAttribute('cx')) || 0,
        cy: Number(ext?.getAttribute('cy')) || 0
      });
    });
    return out.sort((a,b) => a.y - b.y || a.x - b.x);
  }

  function tableRows(doc) {
    const tables = [];
    [...doc.getElementsByTagNameNS('*','tbl')].forEach(tbl => {
      const rows = [];
      [...tbl.getElementsByTagNameNS('*','tr')].forEach(tr => {
        const row = [];
        [...tr.children].filter(el => el.localName === 'tc').forEach(tc => {
          const paragraphs = [...tc.getElementsByTagNameNS('*','p')];
          const text = paragraphs.map(p => [...p.getElementsByTagNameNS('*','t')].map(t => t.textContent || '').join('')).map(clean).filter(Boolean).join('\n');
          row.push(text);
        });
        if (row.some(Boolean)) rows.push(row);
      });
      if (rows.length) tables.push(rows);
    });
    return tables;
  }

  function parsePct(value) {
    const m = String(value || '').replace(/−/g,'-').match(/([+-]?\d+(?:[.,]\d+)?)\s*%/);
    return m ? Number(m[1].replace('.','').replace(',','.')) / 100 : null;
  }

  function metricBelow(blocks, labelPattern, parser) {
    const label = blocks.find(b => labelPattern.test(norm(b.text)));
    if (!label) return null;
    const candidates = blocks
      .filter(b => b.y > label.y && b.y < label.y + 600000 && Math.abs(b.x - label.x) < 2600000)
      .map(b => ({ b, v: parser(b.text) }))
      .filter(x => Number.isFinite(x.v))
      .sort((a,b) => (a.b.y - label.y) - (b.b.y - label.y) || Math.abs(a.b.x-label.x)-Math.abs(b.b.x-label.x));
    return candidates[0]?.v ?? null;
  }

  function looksLikeTopic(block) {
    const n = norm(block.text);
    if (!n || block.text.length > 120 || isPlaceholder(block.text)) return false;
    if (/CAUSA RAIZ|PLANO DE RECUPERACAO|PONTOS DE ATENCAO|REGISTRO FOTOGRAFICO|ACRESCENTAR DESTAQUES|REUNIAO DE COORDENACAO|RESUMO DA FASE|PREVISTO|REALIZADO|DESVIO|VALOR PREVISTO|DATA BASE|BL PLANO|ESCALA/.test(n)) return false;
    if (/^R\$|%/.test(block.text)) return false;
    const letters = block.text.replace(/[^A-Za-zÀ-ÿ]/g,'');
    if (!letters) return false;
    const uppercase = block.text.replace(/[^A-ZÀ-Ý]/g,'').length;
    return uppercase / Math.max(1, letters.length) > 0.55 || block.text.includes('·');
  }

  function uniqueText(blocks) {
    const seen = new Set();
    const out = [];
    blocks.forEach(b => {
      const t = clean(b.text);
      const n = norm(t);
      if (!t || isPlaceholder(t) || seen.has(n)) return;
      seen.add(n);
      out.push(t);
    });
    return out.join('\n');
  }

  function actionsFromAttention(blocks) {
    const head = blocks.find(b => norm(b.text).includes('PONTOS DE ATENCAO'));
    if (!head) return [];
    const region = blocks.filter(b => b.y > head.y + 150000);
    const topics = region
      .filter(b => b.x < 3500000 && looksLikeTopic(b))
      .sort((a,b)=>a.y-b.y);
    const actions = [];
    topics.forEach((topic, index) => {
      const nextY = topics[index+1]?.y ?? Infinity;
      const segment = region.filter(b => b.y >= topic.y && b.y < nextY && b !== topic);
      const causeLabel = segment.find(b => norm(b.text) === 'CAUSA RAIZ');
      const planLabel = segment.find(b => norm(b.text) === 'PLANO DE RECUPERACAO');
      if (!causeLabel && !planLabel) return;
      const cause = uniqueText(segment.filter(b =>
        b.x < 5500000 &&
        b.y > topic.y &&
        !/CAUSA RAIZ|PLANO DE RECUPERACAO/.test(norm(b.text)) &&
        !looksLikeTopic(b)
      ));
      const plan = uniqueText(segment.filter(b =>
        b.x >= 5500000 &&
        b.y > topic.y &&
        !/CAUSA RAIZ|PLANO DE RECUPERACAO/.test(norm(b.text))
      ));
      if (cause || plan) actions.push({ topic: clean(topic.text), cause, plan, source:'attention' });
    });
    return actions;
  }

  function actionsFromSituation(blocks) {
    const head = blocks.find(b => norm(b.text) === 'SITUACAO DA FASE');
    if (!head) return [];
    const region = blocks.filter(b => b.y > head.y && b.x > 10000000);
    const topics = region.filter(b => looksLikeTopic(b)).sort((a,b)=>a.y-b.y);
    const actions = [];
    topics.forEach((topic,index) => {
      const nextY = topics[index+1]?.y ?? Infinity;
      const segment = region.filter(b => b.y > topic.y && b.y < nextY && b !== topic);
      const planLabel = segment.find(b => norm(b.text) === 'PLANO DE RECUPERACAO');
      const content = segment.filter(b =>
        !/CAUSA RAIZ|PLANO DE RECUPERACAO/.test(norm(b.text)) &&
        !isPlaceholder(b.text)
      );
      const tolerance = 180000;
      const cause = uniqueText(content.filter(b => !planLabel || b.y < planLabel.y + tolerance));
      const plan = uniqueText(content.filter(b => planLabel && b.y >= planLabel.y - tolerance));
      if (cause || plan) actions.push({ topic: clean(topic.text), cause, plan, source:'situation' });
    });
    return actions;
  }

  function classifyTables(tables) {
    const disciplines = [];
    const deliveries = [];
    const actions = [];
    const equipment = [];
    tables.forEach(rows => {
      if (!rows.length) return;
      const headers = rows[0].map(norm);
      const first = headers[0] || '';
      const prevIdx = headers.findIndex(h => h.includes('PREVISTO'));
      const realIdx = headers.findIndex(h => h.includes('REALIZADO'));
      const causeIdx = headers.findIndex(h => h.includes('CAUSA') || h.includes('CAUSAL') || h.includes('EVIDENCIA'));
      const planIdx = headers.findIndex(h => h.includes('PLANO'));
      if (causeIdx >= 0 && planIdx >= 0) {
        rows.slice(1).forEach(row => {
          const topic = clean(row[0]);
          const rawCause = clean(row[causeIdx]);
          const rawPlan = clean(row[planIdx]);
          const cause = isPlaceholder(rawCause) ? '' : rawCause;
          const plan = isPlaceholder(rawPlan) ? '' : rawPlan;
          if (topic && (cause || plan)) actions.push({ topic, cause, plan, source:'table' });
        });
      } else if (first.includes('DISCIPLINA') && prevIdx >= 0 && realIdx >= 0) {
        rows.slice(1).forEach(row => {
          if (!clean(row[0])) return;
          disciplines.push({ name:clean(row[0]), planned:parsePct(row[prevIdx]), actual:parsePct(row[realIdx]) });
        });
      } else if (first.includes('ENTREGA') && prevIdx >= 0 && realIdx >= 0) {
        const devIdx = headers.findIndex(h => h.includes('DESVIO'));
        const statusIdx = headers.findIndex(h => h.includes('SITUACAO'));
        rows.slice(1).forEach(row => {
          if (!clean(row[0]) || norm(row[0]).startsWith('TOTAL')) return;
          deliveries.push({
            name:clean(row[0]), planned:parsePct(row[prevIdx]), actual:parsePct(row[realIdx]),
            variance:devIdx>=0?parsePct(row[devIdx]):null, status:statusIdx>=0?clean(row[statusIdx]):''
          });
        });
      } else if (first.includes('EQUIPAMENTO') || first.includes('MATERIAL')) {
        rows.slice(1).forEach(row => {
          if (!clean(row[0])) return;
          equipment.push({ name:clean(row[0]), application:clean(row[1]), qty:clean(row[2]), orderDate:clean(row[3]), delivery:clean(row[4]), status:clean(row[5]) });
        });
      }
    });
    return { disciplines, deliveries, actions, equipment };
  }

  function inferPhase(blocks) {
    const marker = blocks.find(b => norm(b.text) === 'RESUMO DA FASE');
    if (!marker) return '';
    const candidate = blocks
      .filter(b => b.y > marker.y && b.y < marker.y + 700000 && Math.abs(b.x-marker.x) < 2200000)
      .filter(b => !/RESUMO DA FASE|VALOR PREVISTO|REUNIAO DE COORDENACAO|DATA BASE|BL PLANO/.test(norm(b.text)))
      .sort((a,b)=>a.y-b.y)[0];
    return clean(candidate?.text);
  }

  function inferUnitName(blocks, unitBlock) {
    if (!unitBlock) return '';
    const candidate = blocks
      .filter(b => b.y > unitBlock.y && b.y < unitBlock.y + 800000 && Math.abs(b.x-unitBlock.x)<1800000)
      .filter(b => !/^U\s*-?\s*\d{4}/i.test(b.text))
      .sort((a,b)=>a.y-b.y)[0];
    return clean(candidate?.text);
  }

  function parseSlide(doc, number) {
    const blocks = shapeBlocks(doc);
    const tables = tableRows(doc);
    const structured = classifyTables(tables);
    const unitBlock = blocks.find(b => /U\s*-\s*\d{4}/i.test(b.text));
    const unitCode = unitBlock ? (unitBlock.text.match(/U\s*-\s*\d{4}/i)?.[0] || '').replace(/\s+/g,'').toUpperCase() : '';
    const unitName = inferUnitName(blocks, unitBlock);
    const phase = inferPhase(blocks);
    const dataBaseBlock = blocks.find(b => /DATA-?BASE\s+\d{2}\/\d{2}\/\d{4}/i.test(b.text));
    const dataBase = dataBaseBlock?.text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || '';
    const valueBlock = blocks.find(b => /^R\$\s*[\d.]+/i.test(b.text));
    const weightBlock = blocks.find(b => /%\s*DO\s*CONTRATO/i.test(norm(b.text)));
    const planned = metricBelow(blocks,/^PREVISTO/,parsePct);
    const actual = metricBelow(blocks,/^REALIZADO/,parsePct);
    const variance = metricBelow(blocks,/^DESVIO/,parsePct);
    const actionList = [...structured.actions, ...actionsFromAttention(blocks), ...actionsFromSituation(blocks)];
    const dedup = [];
    const seen = new Set();
    actionList.forEach(a => {
      const key = [norm(a.topic),norm(a.cause),norm(a.plan)].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      dedup.push({ ...a, sourceSlide:number });
    });
    const rawText = blocks.map(b=>b.text).join('\n');
    return {
      number, unitCode, unitName, phase, dataBase,
      value: clean(valueBlock?.text), weight: clean(weightBlock?.text),
      planned, actual, variance,
      disciplines: structured.disciplines,
      deliveries: structured.deliveries,
      equipment: structured.equipment,
      actions: dedup,
      rawText
    };
  }

  async function parse(file) {
    if (!window.JSZip) throw new Error('Leitor de PowerPoint indisponível.');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const files = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
    const parser = new DOMParser();
    const slides = [];
    for (const name of files) {
      const xml = await zip.file(name).async('text');
      const doc = parser.parseFromString(xml,'application/xml');
      slides.push(parseSlide(doc, Number(name.match(/slide(\d+)/)[1])));
    }
    return { version:4, fileName:file.name, importedAt:new Date().toISOString(), slides };
  }

  function scope() {
    return {
      unit: document.getElementById('pb-unit-filter')?.value || '',
      phase: document.getElementById('pb-phase-filter')?.value || ''
    };
  }

  function samePhase(a,b) {
    const na=norm(a), nb=norm(b);
    return !na || !nb ? !na && !nb : na===nb || na.includes(nb) || nb.includes(na);
  }

  function pagesFor(unit, phase) {
    const data = read();
    if (!data?.slides?.length) return [];
    let slides = data.slides;
    if (unit) slides = slides.filter(s => s.unitCode === unit);
    else slides = slides.filter(s => !s.unitCode);
    if (phase) slides = slides.filter(s => samePhase(s.phase, phase));
    return slides;
  }

  function summaryFor(unit, phase) {
    const data = read();
    if (!data?.slides?.length) return null;
    // Only an explicit summary of the selected scope can supply its totals.
    // In particular, do not average phase percentages across unrelated units.
    const candidates = data.slides.filter(slide =>
      (unit ? slide.unitCode === unit : !slide.unitCode) &&
      (phase ? samePhase(slide.phase, phase) : !slide.phase) &&
      (Number.isFinite(slide.planned) || Number.isFinite(slide.actual))
    );
    const slide = candidates.find(s => Number.isFinite(s.planned) && Number.isFinite(s.actual)) || candidates[0];
    const dates = [...new Set(data.slides.map(s => s.dataBase).filter(Boolean))];
    const planned = Number.isFinite(slide?.planned) ? slide.planned : null;
    const actual = Number.isFinite(slide?.actual) ? slide.actual : null;
    return {
      source:'ppt',
      planned,
      actual,
      variance:Number.isFinite(slide?.variance) ? slide.variance :
        (planned !== null && actual !== null ? actual - planned : null),
      dataBase:slide?.dataBase || (dates.length === 1 ? dates[0] : ''),
      sourceSlide:slide?.number ?? null,
      missingSummary:!slide,
      message:slide ? '' : (phase && !unit
        ? 'O PPT não traz um resumo consolidado desta fase para todas as unidades. Selecione uma unidade.'
        : 'O PPT não traz um resumo de avanço para esta seleção.')
    };
  }

  const stop = new Set(['DE','DA','DO','DAS','DOS','E','A','O','AS','OS','EM','COM','PARA','POR','NO','NA','NOS','NAS','FASE','PROJETO','SERVICOS','SERVICO','CONSTRUCAO']);
  function tokens(value) {
    return norm(value).split(' ').filter(t => t.length>=4 && !stop.has(t));
  }

  function matchAction(unit, phase, label, context) {
    const source = norm(label + ' ' + context);
    const st = new Set(tokens(source));
    let best = null;
    actionsFor(unit,phase).forEach(action => {
      const topic = norm(action.topic);
      const at = tokens(topic);
      let overlap = at.filter(t=>st.has(t)).length;
      let score = at.length ? overlap / at.length : 0;
      if (topic && source.includes(topic)) score += .8;
      if (source && topic.includes(source) && source.length>5) score += .5;
      if (!best || score > best.score) best = {...action,score};
    });
    return best && best.score >= .34 ? best : null;
  }

  function fmtPct(v) {
    return Number.isFinite(v) ? new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(v*100)+'%' : '—';
  }

  function metricRowsFor(unit, phase) {
    const data = read();
    if (!data?.slides?.length) return [];
    const rows = [];
    data.slides.forEach(slide => {
      if (!slide.unitCode) return;
      if (unit && slide.unitCode !== unit) return;
      if (phase && !samePhase(slide.phase, phase)) return;

      if ((Number.isFinite(slide.planned) || Number.isFinite(slide.actual)) && (slide.phase || !phase)) {
        rows.push({
          topic: slide.phase ? 'Resumo da fase — ' + slide.phase : (slide.unitCode + (slide.unitName ? ' — ' + slide.unitName : '')),
          planned:slide.planned,
          actual:slide.actual,
          variance:Number.isFinite(slide.variance) ? slide.variance :
            (Number.isFinite(slide.planned) && Number.isFinite(slide.actual) ? slide.actual-slide.planned : null),
          unitCode:slide.unitCode,
          unitName:slide.unitName,
          phase:slide.phase,
          dataBase:slide.dataBase,
          sourceSlide:slide.number,
          kind:slide.phase ? 'phase-summary' : 'unit-summary'
        });
      }

      (slide.disciplines || []).forEach(item => {
        if (!Number.isFinite(item.planned) && !Number.isFinite(item.actual)) return;
        rows.push({
          topic:item.name,
          planned:item.planned,
          actual:item.actual,
          variance:Number.isFinite(item.planned) && Number.isFinite(item.actual) ? item.actual-item.planned : null,
          unitCode:slide.unitCode,
          unitName:slide.unitName,
          phase:slide.phase,
          dataBase:slide.dataBase,
          sourceSlide:slide.number,
          kind:'discipline'
        });
      });
      (slide.deliveries || []).forEach(item => {
        if (!Number.isFinite(item.planned) && !Number.isFinite(item.actual)) return;
        rows.push({
          topic:item.name,
          planned:item.planned,
          actual:item.actual,
          variance:Number.isFinite(item.variance) ? item.variance :
            (Number.isFinite(item.planned) && Number.isFinite(item.actual) ? item.actual-item.planned : null),
          status:item.status || '',
          unitCode:slide.unitCode,
          unitName:slide.unitName,
          phase:slide.phase,
          dataBase:slide.dataBase,
          sourceSlide:slide.number,
          kind:'delivery'
        });
      });
    });
    const seen = new Set();
    return rows.filter(row => {
      const key=[row.unitCode,norm(row.phase),norm(row.topic),row.kind].join('|');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function actionsFor(unit, phase) {
    const data = read();
    if (!data?.slides?.length) return [];
    const metrics = metricRowsFor(unit,phase);
    const rows = [];
    data.slides.forEach(slide => {
      if (!slide.unitCode) return;
      if (unit && slide.unitCode !== unit) return;
      if (phase && !samePhase(slide.phase,phase)) return;
      (slide.actions || []).forEach(action => {
        const nt=norm(action.topic);
        const metric=metrics.find(m => m.unitCode===slide.unitCode && samePhase(m.phase,slide.phase) &&
          (norm(m.topic)===nt || norm(m.topic).includes(nt) || nt.includes(norm(m.topic))));
        rows.push({
          ...action,
          unitCode:slide.unitCode,
          unitName:slide.unitName,
          phase:slide.phase,
          dataBase:slide.dataBase,
          sourceSlide:slide.number,
          planned:metric?.planned ?? null,
          actual:metric?.actual ?? null,
          variance:metric?.variance ?? null
        });
      });
    });
    const seen = new Set();
    return rows.filter(row => {
      const key=[row.unitCode,norm(row.phase),norm(row.topic),norm(row.cause),norm(row.plan)].join('|');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function metricsFor(unit, phase) {
    return metricRowsFor(unit,phase)
      .filter(row => Number.isFinite(row.planned) || Number.isFinite(row.actual))
      .sort((a,b) => {
        const av=Number.isFinite(a.variance)?a.variance:0;
        const bv=Number.isFinite(b.variance)?b.variance:0;
        return av-bv;
      });
  }

  function lookaheadFor(unit, phase) {
    const rows = actionsFor(unit,phase).filter(row => clean(row.plan));
    const seen = new Set();
    return rows.filter(row => {
      const key=[row.unitCode,norm(row.phase),norm(row.topic),norm(row.plan)].join('|');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function audit(weekNo) {
    const data = read(weekNo);
    if (!data?.slides?.length) return null;
    const actions = data.slides.flatMap(slide => slide.actions || []);
    const metrics = metricRowsFor('', '');
    return {
      parserVersion:Number(data.version) || 0,
      slides:data.slides.length,
      unitSlides:data.slides.filter(s => s.unitCode).length,
      phaseSlides:data.slides.filter(s => s.unitCode && s.phase).length,
      actions:actions.length,
      causes:actions.filter(a => clean(a.cause)).length,
      plans:actions.filter(a => clean(a.plan)).length,
      metrics:metrics.length,
      disciplines:data.slides.reduce((n,s)=>n+(s.disciplines?.length||0),0),
      deliveries:data.slides.reduce((n,s)=>n+(s.deliveries?.length||0),0),
      equipment:data.slides.reduce((n,s)=>n+(s.equipment?.length||0),0)
    };
  }

  function status(weekNo) {
    const data=read(weekNo);
    if(!data?.slides?.length) return null;
    const dates=[...new Set(data.slides.map(s=>s.dataBase).filter(Boolean))];
    return {
      fileName:data.fileName || '',
      importedAt:data.importedAt || '',
      slides:data.slides.length,
      dataBase:dates.length===1?dates[0]:(dates[0]||''),
      parserVersion:Number(data.version) || 0,
      audit:audit(weekNo)
    };
  }

  function importedAfter(timestamp) {
    const data=read();
    const imported=Date.parse(data?.importedAt||'');
    const edited=Number(timestamp)||0;
    return Number.isFinite(imported) && imported > edited;
  }

  function render() {
    // O PowerPoint agora alimenta diretamente os cards existentes da Reunião de Coordenação.
    // Não existe mais um painel de texto separado no fim da página.
  }

  async function importFile(file, weekNo) {
    const data=await parse(file);
    write(data, weekNo);
    return data;
  }

  function exportData(weekNo){ return read(weekNo); }
  function importData(data, weekNo){ if(data?.slides?.length) write(data, weekNo); }
  function clearWeek(weekNo){ clear(weekNo); }

  function install() {
    if (installed) return;
    installed=true;
    const input=document.getElementById('ppt-input');
    const button=document.getElementById('select-ppt-dashboard');
    button?.addEventListener('click',()=>input?.click());
    input?.addEventListener('change',async event=>{
      const file=event.target.files?.[0];
      if(!file) return;
      try{
        if (window.CoordinationWeek && !window.CoordinationWeek.canEdit()) {
          throw new Error('Clique no lápis e informe a senha master antes de atualizar o PowerPoint.');
        }
        button.disabled=true;
        button.textContent='Lendo PowerPoint...';
        await importFile(file, selectedWeek());
        window.Dashboard?.showPage?.('pb');
        window.PBDashboard?.render?.();
        window.CoordinationWeek?.refreshStatus?.();
      }catch(error){
        alert(error.message||'Não foi possível ler o PowerPoint.');
        console.error(error);
      }finally{
        input.value='';
        button.disabled=false;
        button.textContent='Inserir PowerPoint';
      }
    });
    document.addEventListener('coordinationdeckchange',()=>window.PBDashboard?.render?.());
  }

  window.CoordinationDeck={
    install,render,parse,read,clear,clearWeek,exportData,importData,
    pagesFor,summaryFor,actionsFor,metricsFor,lookaheadFor,matchAction,status,audit,importedAfter
  };
  window.addEventListener('DOMContentLoaded',install);
  window.addEventListener('load',install);
}());
