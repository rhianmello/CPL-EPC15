(function () {
  let current = 0;
  let mode = 'gerencial';
  let reportWeek = null;
  let reportModel = null;
  const fmt = () => Dashboard.format;
  const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || window.innerWidth <= 760;
  const presentationModel = () => reportModel || window.Dashboard?.getPresentationModel?.() || window.Dashboard?.getModel?.();
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

  function slideShell(title, subtitle, kpis, body, extraClass='', sourceModel=null) {
    const model = sourceModel || presentationModel();
    return '<article class="slide '+extraClass+'">'+
      '<div class="slide-head">'+
        '<div class="slide-head-copy"><p class="eyebrow">'+fmt().escapeHtml(subtitle)+'</p><h2 class="'+titleClass(title)+'">'+fmt().escapeHtml(title)+'</h2></div>'+
        '<div class="slide-brand" style="display:flex;align-items:center;justify-content:flex-end;gap:14px"><img src="assets/logo-cpl-epc15.png" alt="Logo CPL" style="max-width:110px;max-height:46px;object-fit:contain;background:#fff;border-radius:6px;padding:4px"/><div class="slide-date">BI EPC-15<br>Data-base '+fmt().date(model.dataBase)+'</div></div>'+ 
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

  function curveSvg(curve, dataBase=null) {
    const normalized=window.DashboardCharts?.normalizeFinancialCurve?.(curve,{dataBase});
    if(!normalized) return '';

    const {labels,series,asPercent}=normalized;
    const allValues=series.flatMap(s=>s.values || []).filter(Number.isFinite);
    if(!allValues.length) return '';

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
      (values||[]).forEach((v,i)=>{
        if(Number.isFinite(v)){
          seg.push(x(i).toFixed(1)+','+y(v).toFixed(1));
        } else if(seg.length){
          out.push(seg); seg=[];
        }
      });
      if(seg.length) out.push(seg);
      return out;
    }

    const lines=series.map((s,i)=>{
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

    const legend=series.map((s,i)=>{
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

  function progressAndCurve(title, planned, actual, deviation, curve, dataBase=null) {
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
      (curveSvg(curve,dataBase) || '<div class="slide-no-curve">Curva Física não disponível para esta seleção.</div>')+
    '</div>';
  }

  function rankingPanel(title, rows, labelKey='label', valueKey='value') {
    const html=(rows||[]).map(row=>
      '<div class="slide-ranking-row"><span>'+fmt().escapeHtml(row[labelKey] ?? '')+'</span><strong>'+fmt().escapeHtml(row[valueKey] ?? '')+'</strong></div>'
    ).join('');
    return '<div class="slide-panel"><h3>'+fmt().escapeHtml(title)+'</h3><div class="slide-ranking">'+(html || '<span class="muted">Sem dados comparáveis.</span>')+'</div></div>';
  }

  function renderGerencial() {
    const model = presentationModel();
    const c = model.contract;
    const worst = [...model.units]
      .filter(u=>Number.isFinite(u.variance))
      .sort((a,b) => a.variance - b.variance)
      .slice(0,5)
      .map(u=>({label:u.code,value:fmt().pp(u.variance)}));

    const summaryBody='<div class="slide-grid">'+
      progressAndCurve('Avanço físico',c.planned,c.actual,c.variance,c.curve,model.dataBase)+
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
          progressAndCurve('Avanço da unidade',unit.planned,unit.actual,unit.variance,unit.curve,model.dataBase)+
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
      label:(row.unit ? row.unit+' — ' : 'Unidade não informada — ')+(row.grouping || row.label || 'Agrupamento'),
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
        progressAndCurve('Avanço físico',scope.planned,scope.actual,deviation,data.curve,data.dataBase)+
        rankingPanel('Principais desvios ponderados',pareto)+
      '</div>',
      'slide-coordination',
      {dataBase:data.dataBase}
    );

    const highlights=data.highlights || [];
    if(!highlights.length) return overview;

    const highlightRows=highlights.slice(0,8).map((item,index)=>
      '<div class="coordination-highlight-row"><span>'+String(index+1).padStart(2,'0')+'</span><div><small style="display:block;color:#67e8f9;font-weight:700;margin-bottom:4px">'+fmt().escapeHtml(item.unit || 'Unidade não informada')+(item.phase ? ' · '+fmt().escapeHtml(item.phase) : '')+'</small><strong>'+fmt().escapeHtml(item.title||'Destaque')+'</strong>'+
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
      'slide-coordination slide-highlights',
      {dataBase:data.dataBase}
    );

    return overview + highlightsSlide;
  }

  function photoSlides() {
    const data=window.PBDashboard?.getPresentationData?.();
    const photos=window.PBDashboard?.getPresentationPhotos?.() || [];
    if(!photos.length) return '';
    const slides=[];
    for(let offset=0;offset<photos.length;offset+=4){
      const batch=photos.slice(offset,offset+4);
      const cards=batch.map(photo=>{
        const src=String(photo.signed_url || '');
        if(!src || !/^https:\/\//i.test(src)) return '';
        const unit=photo.unit_name || 'Unidade não informada';
        const phase=photo.phase_name || 'Fase não informada';
        const caption=photo.caption || 'Registro fotográfico';
        return '<figure style="margin:0;min-width:0;background:#0b1b2d;border:1px solid #24354c;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:5px">'+
          '<img crossorigin="anonymous" src="'+fmt().escapeHtml(src)+'" style="width:100%;height:120px;object-fit:contain;background:#050e19;border-radius:7px" alt="Registro fotográfico"/>'+
          '<figcaption style="font-size:12px;color:#f8fafc;font-weight:700">'+fmt().escapeHtml(caption)+'</figcaption>'+
          '<span style="font-size:10px;color:#67e8f9">'+fmt().escapeHtml(unit)+' · '+fmt().escapeHtml(phase)+'</span></figure>';
      }).join('');
      slides.push(slideShell(
        'Registros fotográficos',
        'REUNIÃO DE COORDENAÇÃO',
        kpi('Semana',data?.selection?.week ? 'Semana '+data.selection.week : 'Atual','#8b5cf6')+
        kpi('Fotografias',String(photos.length),'#22c55e')+
        kpi('Página',String(Math.floor(offset/4)+1)+' / '+Math.ceil(photos.length/4),'#3b82f6')+
        kpi('Origem','Registro fotográfico','#22d3ee'),
        '<div class="slide-panel"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">'+cards+'</div></div>',
        'slide-coordination slide-photos',
        {dataBase:data?.dataBase}
      ));
    }
    return slides.join('');
  }

  function render() {
    const host=document.getElementById('slides');
    host.innerHTML = mode==='weekly'
      ? renderGerencial()+renderCoordination()+photoSlides()
      : (mode==='coordination' ? renderCoordination()+photoSlides() : renderGerencial());
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
    reportWeek=null;
    reportModel=null;
    mode=nextMode==='coordination'?'coordination':'gerencial';
    render();
    const el=document.getElementById('presentation');
    el.dataset.presentationMode=mode;
    delete el.dataset.reportWeek;
    el.classList.remove('hidden');
    document.body.style.overflow='hidden';
  }

  async function openWeeklyReport(autoExport=false) {
    const trigger=document.getElementById('executive-week-report');
    const weekSelect=document.getElementById('executive-week-filter');
    const rawWeek=String(weekSelect?.value || '').trim();
    const week=Number(rawWeek);
    if(!rawWeek || !Number.isFinite(week) || week<1){
      alert('Selecione no filtro SEMANA uma semana salva antes de emitir o relatório.');
      return false;
    }
    if(!window.CloudSync?.ready?.()){
      alert('A nuvem não está disponível para carregar o histórico desta semana.');
      return false;
    }

    const originalText=trigger?.textContent || '';
    if(trigger){
      trigger.disabled=true;
      trigger.textContent='Preparando PDF...';
    }

    try{
      const result=await window.CloudSync.loadCoordinationWeek(week);
      const snapshot=result?.snapshot;
      if(!snapshot?.dataset?.model){
        throw new Error('A Semana '+week+' ainda não possui um snapshot salvo.');
      }

      reportWeek=week;
      reportModel=snapshot.dataset.model;

      const pbWeekSelect=document.getElementById('pb-week-filter');
      if(pbWeekSelect) pbWeekSelect.value=String(week);
      window.PBDashboard?.useSnapshot?.(
        reportModel,
        snapshot.excel_file_name || ('Semana '+week)
      );
      window.PBDashboard?.importWeekData?.(snapshot.pb_manual || {},week);

      await window.PBDashboard?.loadPhotos?.(week,true);
      mode='weekly';
      render();
      const el=document.getElementById('presentation');
      el.dataset.presentationMode='weekly';
      el.dataset.reportWeek=String(week);
      el.classList.remove('hidden');
      document.body.style.overflow='hidden';

      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

      const exportButton=document.getElementById('export-pdf');
      if(exportButton){
        exportButton.textContent=isMobileDevice() ? 'Compartilhar PDF' : 'Exportar PDF';
        exportButton.title=isMobileDevice()
          ? 'No celular, abre o compartilhamento para salvar em Arquivos, Drive, WhatsApp ou outro app.'
          : 'Gerar o PDF desta apresentação';
      }

      if(autoExport && !isMobileDevice()){
        if(!window.PDFExport?.exportPDF) throw new Error('O módulo de PDF não foi carregado.');
        await window.PDFExport.exportPDF();
      }
      return true;
    }catch(error){
      console.error('Falha ao preparar relatório semanal',error);
      alert(error?.message || 'Não foi possível preparar o relatório da semana.');
      return false;
    }finally{
      if(trigger){
        trigger.disabled=false;
        trigger.textContent=originalText;
      }
    }
  }

  function close() {
    document.getElementById('presentation').classList.add('hidden');
    document.body.style.overflow='';
    reportWeek=null;
    reportModel=null;
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

  document.getElementById('executive-week-report')?.addEventListener('click',()=>openWeeklyReport(!isMobileDevice()));

  window.Presentation = { open, openWeeklyReport, close, next, previous, fullscreen, onKey };
}());
