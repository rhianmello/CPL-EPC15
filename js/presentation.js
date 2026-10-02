(function () {
  let current = 0;
  let mode = 'gerencial';
  const fmt = () => Dashboard.format;
  const moneyWhole = new Intl.NumberFormat('pt-BR', {
    style:'currency', currency:'BRL', maximumFractionDigits:0, minimumFractionDigits:0
  });

  function currencyWhole(value) {
    return Number.isFinite(value) ? moneyWhole.format(value) : '—';
  }

  function bar(label, value, kind) {
    const numeric=Number.isFinite(value) ? value : 0;
    const width=Math.min(100,Math.max(0,Math.abs(numeric)*100));
    const formatted=kind==='deviation' ? fmt().pp(value) : fmt().percent(value);
    const tone=kind==='deviation' ? (numeric<0?'negative':'positive') : '';
    return '<div class="slide-progress-row '+tone+'"><div class="slide-bar-label"><span>'+label+'</span><strong>'+formatted+'</strong></div><div class="progress-track"><span class="bar '+kind+' '+tone+'" style="width:'+width+'%"></span></div></div>';
  }

  function titleClass(title) {
    const len=String(title||'').length;
    if(len>=44) return 'slide-title-xlong';
    if(len>=32) return 'slide-title-long';
    return '';
  }

  function slideShell(title, subtitle, kpis, body, extraClass='') {
    const model = Dashboard.getModel();
    return '<article class="slide '+extraClass+'">'+
      '<div class="slide-head">'+
        '<div class="slide-head-copy"><p class="eyebrow">'+fmt().escapeHtml(subtitle)+'</p><h2 class="'+titleClass(title)+'">'+fmt().escapeHtml(title)+'</h2></div>'+
        '<div class="slide-date">BI EPC-15<br>Data-base '+fmt().date(model.dataBase)+'</div>'+
      '</div>'+
      '<div class="slide-kpis">'+kpis+'</div>'+
      body+
    '</article>';
  }

  function kpi(label, value, accent='#60a5fa') {
    return '<div class="slide-kpi" style="--slide-kpi-accent:'+accent+'"><span>'+fmt().escapeHtml(label)+'</span><strong>'+value+'</strong></div>';
  }

  function deviationAccent(value) {
    if(!Number.isFinite(value)) return '#64748b';
    return value < 0 ? '#ef4444' : '#22c55e';
  }

  function curveSvg(curve) {
    if(!curve?.series?.length) return '';
    const labels=curve.labels || curve.series.find(s=>s.categories?.length)?.categories || [];
    const allValues=curve.series.flatMap(s=>s.values || []).filter(Number.isFinite);
    if(!allValues.length) return '';

    const asPercent = curve.source === 'financial-sheets' ||
      curve.source === 'blplanataq-direct' ||
      Math.max(...allValues.map(v=>Math.abs(v))) <= 1.5;

    const width=720, height=220, left=42, right=10, top=14, bottom=34;
    const plotW=width-left-right, plotH=height-top-bottom;
    const maxRaw=Math.max(...allValues.map(v=>Math.abs(v)));
    const yMax=asPercent ? 100 : Math.max(1,Math.ceil(maxRaw/10)*10);
    const colors={
      planAttack:'#69a9e7',
      contractual:'#2563eb',
      real:'#22c55e',
      projected:'#f2b700'
    };
    const fallback=['#60a5fa','#8b5cf6','#22c55e','#f59e0b','#ef4444'];
    const x=i=>left+(labels.length<=1?0:(i/(labels.length-1))*plotW);
    const y=v=>top+plotH-(Math.max(0,Math.min(yMax,v))/yMax)*plotH;

    const grid=[0,.25,.5,.75,1].map(r=>{
      const val=yMax*r;
      const yy=y(val);
      const label=asPercent ? Math.round(val)+'%' : Number(val).toLocaleString('pt-BR',{maximumFractionDigits:0});
      return '<line x1="'+left+'" y1="'+yy+'" x2="'+(width-right)+'" y2="'+yy+'" stroke="rgba(148,163,184,.16)" stroke-width="1"/>'+
             '<text x="'+(left-7)+'" y="'+(yy+3)+'" fill="#8fa4bd" font-size="9" text-anchor="end">'+label+'</text>';
    }).join('');

    function segments(values) {
      const out=[]; let seg=[];
      (values||[]).forEach((raw,i)=>{
        if(Number.isFinite(raw)){
          const v=asPercent ? raw*100 : raw;
          seg.push(x(i).toFixed(1)+','+y(v).toFixed(1));
        } else if(seg.length){
          out.push(seg); seg=[];
        }
      });
      if(seg.length) out.push(seg);
      return out;
    }

    const lines=curve.series.map((s,i)=>{
      const color=colors[s.key] || fallback[i%fallback.length];
      const dash=s.key==='projected'?'7 5':'';
      return segments(s.values).map(seg=>
        '<polyline points="'+seg.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="'+(s.key==='real'?2.8:2.2)+'" stroke-linejoin="round" stroke-linecap="round"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>'
      ).join('');
    }).join('');

    const tickIndexes=[];
    const maxTicks=Math.min(7,labels.length);
    for(let n=0;n<maxTicks;n++){
      const index=maxTicks===1?0:Math.round(n*(labels.length-1)/(maxTicks-1));
      if(!tickIndexes.includes(index)) tickIndexes.push(index);
    }
    const xTicks=tickIndexes.map(i=>
      '<text x="'+x(i)+'" y="'+(height-8)+'" fill="#8fa4bd" font-size="9" text-anchor="middle">'+fmt().escapeHtml(labels[i]||'')+'</text>'
    ).join('');

    const legend=curve.series.map((s,i)=>{
      const color=colors[s.key] || fallback[i%fallback.length];
      return '<span><i style="background:'+color+'"></i>'+fmt().escapeHtml(s.name || s.key || 'Série')+'</span>';
    }).join('');

    return '<div class="slide-curve-block">'+
      '<div class="slide-curve-label">Curva Física</div>'+
      '<div class="slide-curve-legend">'+legend+'</div>'+
      '<div class="slide-curve-wrap"><svg class="slide-curve-svg" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none" aria-label="Curva Física">'+
        grid+lines+xTicks+
      '</svg></div>'+
    '</div>';
  }

  function progressAndCurve(title, planned, actual, deviation, curve) {
    const resolvedDeviation=Number.isFinite(deviation)
      ? deviation
      : (Number.isFinite(planned)&&Number.isFinite(actual) ? actual-planned : null);
    return '<div class="slide-panel slide-panel-with-curve">'+
      '<h3>'+fmt().escapeHtml(title)+'</h3>'+
      '<div class="slide-bars slide-bars-compact">'+
        bar('Previsto',planned,'planned')+
        bar('Realizado',actual,'actual')+
        bar('Desvio',resolvedDeviation,'deviation')+
      '</div>'+
      (curveSvg(curve) || '<div class="slide-no-curve">Curva Física não disponível para esta seleção.</div>')+
    '</div>';
  }

  function rankingPanel(title, rows, labelKey='label', valueKey='value') {
    const html=(rows||[]).map(row=>
      '<div class="slide-ranking-row"><span>'+fmt().escapeHtml(row[labelKey] ?? '')+'</span><strong>'+fmt().escapeHtml(row[valueKey] ?? '')+'</strong></div>'
    ).join('');
    return '<div class="slide-panel"><h3>'+fmt().escapeHtml(title)+'</h3><div class="slide-ranking">'+(html || '<span class="muted">Sem dados comparáveis.</span>')+'</div></div>';
  }

  function renderGerencial() {
    const model = Dashboard.getModel();
    const c = model.contract;
    const worst = [...model.units]
      .filter(u=>Number.isFinite(u.variance))
      .sort((a,b) => a.variance - b.variance)
      .slice(0,5)
      .map(u=>({label:u.code,value:fmt().pp(u.variance)}));

    const summaryBody='<div class="slide-grid">'+
      progressAndCurve('Avanço físico',c.planned,c.actual,c.variance,c.curve)+
      rankingPanel('Maiores desvios',worst)+
    '</div>';

    const summary = slideShell(
      'Resumo geral',
      'CONTRATO EPC-15',
      kpi('Valor do contrato', currencyWhole(c.plannedValue), '#8b5cf6')+
      kpi('Previsto', fmt().percent(c.planned), '#3b82f6')+
      kpi('Realizado', fmt().percent(c.actual), '#22d3ee')+
      kpi('Desvio', fmt().pp(c.variance), deviationAccent(c.variance)),
      summaryBody,
      'slide-gerencial'
    );

    const unitSlides = model.units.map(unit => {
      const phases = [...(unit.phases||[])]
        .filter(p=>Number.isFinite(p.variance))
        .sort((a,b) => a.variance - b.variance)
        .slice(0,5)
        .map(p=>({label:p.phase,value:fmt().pp(p.variance)}));

      return slideShell(
        unit.rawName,
        'UNIDADE',
        kpi('Previsto',fmt().percent(unit.planned), '#3b82f6')+
        kpi('Realizado',fmt().percent(unit.actual), '#22d3ee')+
        kpi('Desvio',fmt().pp(unit.variance), deviationAccent(unit.variance))+
        kpi('Valor total',currencyWhole(unit.plannedValue), '#8b5cf6'),
        '<div class="slide-grid">'+
          progressAndCurve('Avanço da unidade',unit.planned,unit.actual,unit.variance,unit.curve)+
          rankingPanel('Principais fases e desvios',phases)+
        '</div>',
        'slide-gerencial slide-unit'
      );
    });

    return summary + unitSlides.join('');
  }

  function renderCoordination() {
    const data=window.PBDashboard?.getPresentationData?.();
    if(!data){
      return slideShell(
        'Reunião de Coordenação',
        'COORDENAÇÃO EPC-15',
        kpi('Previsto','—','#3b82f6')+kpi('Realizado','—','#22d3ee')+kpi('Desvio ponderado','—','#64748b')+kpi('Semana','—','#8b5cf6'),
        '<div class="slide-panel slide-empty-presentation">Abra a Reunião de Coordenação e carregue os dados para montar esta apresentação.</div>',
        'slide-coordination'
      );
    }

    const scope=data.scope || {};
    const deviation=Number.isFinite(scope.weightedVariance) ? scope.weightedVariance : scope.variance;
    const pareto=(data.pareto||[]).map(row=>({
      label:row.grouping || row.label || 'Agrupamento',
      value:fmt().pp(row.weightedVariance)
    }));
    const title=data.title || 'Contrato EPC-15';

    const overview=slideShell(
      title,
      'REUNIÃO DE COORDENAÇÃO',
      kpi('Previsto',fmt().percent(scope.planned), '#3b82f6')+
      kpi('Realizado',fmt().percent(scope.actual), '#22d3ee')+
      kpi('Desvio ponderado (AB)',fmt().pp(deviation), deviationAccent(deviation))+
      kpi('Semana',data.selection?.week ? 'Semana '+data.selection.week : 'Atual', '#8b5cf6'),
      '<div class="slide-grid">'+
        progressAndCurve('Avanço físico',scope.planned,scope.actual,deviation,data.curve)+
        rankingPanel('Principais desvios ponderados',pareto)+
      '</div>',
      'slide-coordination'
    );

    const highlights=data.highlights || [];
    if(!highlights.length) return overview;

    const highlightRows=highlights.slice(0,8).map((item,index)=>
      '<div class="coordination-highlight-row"><span>'+String(index+1).padStart(2,'0')+'</span><div><strong>'+fmt().escapeHtml(item.title||'Destaque')+'</strong>'+
      (item.subtitle?'<small>'+fmt().escapeHtml(item.subtitle)+'</small>':'')+'</div></div>'
    ).join('');

    const highlightsSlide=slideShell(
      'Destaques da Semana',
      'REUNIÃO DE COORDENAÇÃO',
      kpi('Unidade',data.selection?.unit ? fmt().escapeHtml(data.selection.unit) : 'Todas', '#3b82f6')+
      kpi('Fase',data.selection?.phase ? fmt().escapeHtml(data.selection.phase) : 'Todas', '#22d3ee')+
      kpi('Destaques',String(highlights.length), '#22c55e')+
      kpi('Semana',data.selection?.week ? 'Semana '+data.selection.week : 'Atual', '#8b5cf6'),
      '<div class="slide-panel coordination-highlights-panel"><div class="coordination-highlight-list">'+highlightRows+'</div></div>',
      'slide-coordination slide-highlights'
    );

    return overview + highlightsSlide;
  }

  function render() {
    const host=document.getElementById('slides');
    host.innerHTML = mode==='coordination' ? renderCoordination() : renderGerencial();
    current = 0;
    update();
  }

  function update() {
    const slides = [...document.querySelectorAll('.slide')];
    current = Math.max(0, Math.min(current, slides.length - 1));
    slides.forEach((slide,index) => slide.classList.toggle('active', index === current));
    document.getElementById('slide-counter').textContent = (current + 1)+' / '+slides.length;
  }

  function open(nextMode='gerencial') {
    mode=nextMode==='coordination'?'coordination':'gerencial';
    render();
    const el=document.getElementById('presentation');
    el.dataset.presentationMode=mode;
    el.classList.remove('hidden');
    document.body.style.overflow='hidden';
  }

  function close() {
    document.getElementById('presentation').classList.add('hidden');
    document.body.style.overflow='';
  }

  function next() { current += 1; update(); }
  function previous() { current -= 1; update(); }
  async function fullscreen() {
    const el=document.getElementById('presentation');
    if(!document.fullscreenElement) await el.requestFullscreen?.();
    else await document.exitFullscreen?.();
  }
  function onKey(event) {
    if (document.getElementById('presentation').classList.contains('hidden')) return;
    if(event.key==='ArrowRight') next();
    if(event.key==='ArrowLeft') previous();
    if(event.key==='Escape'&&!document.fullscreenElement) close();
  }

  window.Presentation = { open, close, next, previous, fullscreen, onKey };
}());
