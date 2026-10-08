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

  function slideShell(title, subtitle, kpis, body, extraClass='', sourceModel=null, unitName='') {
    const model = sourceModel || presentationModel();
    return '<article class="slide '+extraClass+'">'+
      '<div class="slide-head">'+
        '<div class="slide-head-copy"><p class="eyebrow">'+fmt().escapeHtml(subtitle)+'</p><h2 class="'+titleClass(title)+'">'+fmt().escapeHtml(title)+'</h2></div>'+
        '<div class="slide-brand" style="display:flex;align-items:center;justify-content:flex-end;gap:14px"><img src="assets/logo-cpl-epc15.png" alt="Logo CPL" style="max-width:110px;max-height:46px;object-fit:contain;background:#fff;border-radius:6px;padding:4px"/><div class="slide-date">BI EPC-15<br>Data-base '+fmt().date(model.dataBase)+'</div></div>'+ 
      '</div>'+
      (unitName ? '<div class="slide-report-unit">'+fmt().escapeHtml(unitName)+'</div>' : '')+
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

    return overview;
  }


  function reportUnitKey(name) {
    const raw=String(name||'').trim();
    const match=raw.match(/\bU[-\s]?(\d{4,6})\b/i);
    return match ? 'U-'+match[1] : raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  }

  function reportUnitSections() {
    const week=Number(reportWeek || window.CoordinationWeek?.getSelectedWeek?.());
    const highlights=window.PBDashboard?.getReportHighlights?.(week) || [];
    const photos=window.PBDashboard?.getReportPhotos?.() || [];
    const groups=new Map();
    const add=(name,type,item)=>{
      const key=reportUnitKey(name || 'Unidade não informada');
      if(!groups.has(key)) groups.set(key,{key,name:name||'Unidade não informada',highlights:[],photos:[]});
      groups.get(key)[type].push(item);
    };
    highlights.forEach(item=>add(item.unit,'highlights',item));
    photos.forEach(item=>add(item.unit_name,'photos',item));
    const data=window.PBDashboard?.getPresentationData?.();
    return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true})).map(group=>{
      const sectionSlides=[];
      const highlightsPerPage=10;
      const chunks=Math.max(1,Math.ceil(group.highlights.length/highlightsPerPage));
      const totalUnitPages=chunks+Math.ceil(group.photos.length/2);
      for(let page=0;page<chunks;page++){
        const batch=group.highlights.slice(page*highlightsPerPage,(page+1)*highlightsPerPage);
        const rows=batch.map((item,index)=>'<div class="coordination-highlight-row"><span>'+String(page*highlightsPerPage+index+1).padStart(2,'0')+'</span><div>'+
          '<small style="display:block;color:#67e8f9;font-weight:700;margin-bottom:4px">'+fmt().escapeHtml(item.phase||'Destaque')+'</small>'+
          '<strong>'+fmt().escapeHtml(item.title||'Destaque')+'</strong>'+
          (item.subtitle?'<small>'+fmt().escapeHtml(item.subtitle)+'</small>':'')+
          '</div></div>').join('');
        sectionSlides.push(slideShell(
          'Destaques da Semana',
          'REUNIÃO DE COORDENAÇÃO',
          kpi('Semana','Semana '+week,'#3b82f6')+
          kpi('Destaques',String(group.highlights.length),'#22c55e')+
          kpi('Fotografias',String(group.photos.length),'#8b5cf6')+
          kpi('Página',String(page+1)+' / '+totalUnitPages,'#22d3ee'),
          '<div class="slide-panel coordination-highlights-panel"><div class="coordination-highlight-list">'+
          (rows||'<div style="padding:20px;color:#cbd5e1">Sem destaques registrados para esta unidade na semana.</div>')+
          '</div></div>',
          'slide-coordination slide-highlights',
          {dataBase:data?.dataBase},group.name
        ));
      }
      sectionSlides.push(photoSlides(group.key,group.name,group.highlights.length,chunks,totalUnitPages));
      return sectionSlides.join('');
    }).join('');
  }

  function photoSlides(unitFilter=null,unitName='',highlightCount=0,previousPages=0,totalUnitPages=null) {
    const data=window.PBDashboard?.getPresentationData?.();
    const allPhotos=window.PBDashboard?.getReportPhotos?.() || [];
    const photos=unitFilter===null ? allPhotos : allPhotos.filter(photo=>reportUnitKey(photo.unit_name)===unitFilter);
    if(!photos.length) return '';
    const totalPages=totalUnitPages ?? (previousPages+Math.ceil(photos.length/2));
    const slides=[];
    for(let offset=0;offset<photos.length;offset+=2){
      const batch=photos.slice(offset,offset+2);
      const cards=batch.map(photo=>{
        const src=String(photo.signed_url || '');
        const unit=photo.unit_name || 'Unidade não informada';
        const phase=photo.phase_name || 'Fase não informada';
        const caption=photo.caption || 'Registro fotográfico';
        return '<figure class="report-photo-card" style="margin:0;min-width:0;min-height:0;background:#0b1b2d;border:1px solid #24354c;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;overflow:hidden">'+
          '<div class="report-photo-frame" style="width:100%;height:320px;flex:none;overflow:hidden;border-radius:8px;background:#050e19;display:flex;align-items:center;justify-content:center">'+
          (src && /^https:\/\//i.test(src) ? '<img class="report-photo-zoomable" tabindex="0" role="button" title="Clique para ampliar a fotografia" crossorigin="anonymous" src="'+fmt().escapeHtml(src)+'" style="display:block;width:100%;height:100%;object-fit:contain;object-position:center;cursor:zoom-in" alt="Ampliar foto de '+fmt().escapeHtml(unit)+'"/>' : '<span>Fotografia indisponível</span>')+
          '</div>'+
          '<figcaption style="font-size:14px;line-height:1.35;color:#f8fafc;font-weight:800">'+fmt().escapeHtml(caption)+'</figcaption>'+
          '<span style="font-size:11px;line-height:1.3;color:#67e8f9">'+fmt().escapeHtml(unit)+' · '+fmt().escapeHtml(phase)+'</span></figure>';
      }).join('');
      slides.push(slideShell(
        'Registros fotográficos',
        'REUNIÃO DE COORDENAÇÃO',
        kpi('Semana',reportWeek ? 'Semana '+reportWeek : (data?.selection?.week ? 'Semana '+data.selection.week : 'Atual'),'#3b82f6')+
        kpi('Destaques',String(highlightCount),'#22c55e')+
        kpi('Fotografias',String(photos.length),'#8b5cf6')+
        kpi('Página',String(previousPages+Math.floor(offset/2)+1)+' / '+totalPages,'#22d3ee'),
        '<div class="slide-panel"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">'+cards+'</div></div>',
        'slide-coordination slide-photos',
        {dataBase:data?.dataBase},unitName
      ));
    }
    return slides.join('');
  }

  function photoZoomLayer() {
    let layer=document.getElementById('report-photo-zoom');
    if(layer) return layer;
    layer=document.createElement('div');
    layer.id='report-photo-zoom';
    layer.setAttribute('role','dialog');
    layer.setAttribute('aria-modal','true');
    layer.setAttribute('aria-label','Fotografia ampliada');
    layer.setAttribute('data-html2canvas-ignore','true');
    layer.style.cssText='position:absolute;inset:0;z-index:99999;background:rgba(0,0,0,.86);display:none;align-items:center;justify-content:center;padding:28px;box-sizing:border-box;overflow:auto';
    layer.innerHTML='<div style="position:relative;max-width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center;gap:10px">'+
      '<button type="button" class="report-photo-zoom-close" aria-label="Fechar imagem ampliada" style="position:absolute;right:0;top:0;transform:translate(35%,-35%);border:0;border-radius:50%;background:#172b42;color:white;font-size:24px;width:42px;height:42px;cursor:pointer;z-index:1">×</button>'+
      '<img alt="Fotografia ampliada" style="display:block;max-width:100%;max-height:75vh;object-fit:contain;border-radius:8px;box-shadow:0 12px 50px rgba(0,0,0,.45)"/>'+
      '<div class="report-photo-zoom-caption" style="color:#fff;font-size:16px;font-weight:700;text-align:center;max-width:90vw"></div>'+
      '<div class="report-photo-zoom-meta" style="color:#67e8f9;font-size:12px;text-align:center;max-width:90vw"></div></div>';
    document.getElementById('presentation').appendChild(layer);
    layer.addEventListener('click',event=>{
      if(event.target===layer || event.target.closest('.report-photo-zoom-close')) hidePhotoZoom();
    });
    return layer;
  }

  let photoZoomFocus=null;
  function showPhotoZoom(img) {
    if(!img?.src) return;
    const layer=photoZoomLayer();
    const card=img.closest('.report-photo-card');
    layer.querySelector('img').src=img.src;
    layer.querySelector('.report-photo-zoom-caption').textContent=card?.querySelector('figcaption')?.textContent || '';
    layer.querySelector('.report-photo-zoom-meta').textContent=card?.querySelector('span')?.textContent || '';
    photoZoomFocus=document.activeElement;
    layer.style.display='flex';
    layer.querySelector('button').focus();
  }
  function hidePhotoZoom() {
    const layer=document.getElementById('report-photo-zoom');
    if(!layer || layer.style.display==='none') return false;
    layer.style.display='none';
    layer.querySelector('img').removeAttribute('src');
    if(photoZoomFocus?.isConnected) photoZoomFocus.focus();
    photoZoomFocus=null;
    return true;
  }

  document.getElementById('slides')?.addEventListener('click',event=>{
    const img=event.target.closest('.report-photo-zoomable');
    if(img) showPhotoZoom(img);
  });
  document.getElementById('slides')?.addEventListener('keydown',event=>{
    if((event.key==='Enter' || event.key===' ') && event.target.matches('.report-photo-zoomable')){
      event.preventDefault();
      showPhotoZoom(event.target);
    }
  });

  function render() {
    const host=document.getElementById('slides');
    host.innerHTML = mode==='weekly'
      ? renderGerencial()+renderCoordination()+reportUnitSections()
      : (mode==='coordination' ? renderCoordination()+reportUnitSections() : renderGerencial());
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

      await window.PBDashboard?.loadReportPhotos?.(week,true);
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
    hidePhotoZoom();
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
    if(document.getElementById('report-photo-zoom')?.style.display==='flex') {
      if(event.key==='Escape'){ event.preventDefault(); hidePhotoZoom(); }
      return;
    }
    if(event.key==='ArrowRight') next();
    if(event.key==='ArrowLeft') previous();
    if(event.key==='Escape'&&!document.fullscreenElement) close();
  }

  document.getElementById('executive-week-report')?.addEventListener('click',()=>openWeeklyReport(!isMobileDevice()));

  window.Presentation = { open, openWeeklyReport, close, next, previous, fullscreen, onKey };
}());
