(function(){
  const $=id=>document.getElementById(id);
  const state={weeks:[],photos:[],selectedWeek:null,compareUnit:'',compareBefore:null,compareAfter:null};

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v||'').trim().toLocaleLowerCase('pt-BR');
  const dmy=v=>{
    if(!v) return '—';
    const d=new Date(String(v)+'T12:00:00');
    return Number.isNaN(d.valueOf())?'—':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  };
  const weekByNo=no=>state.weeks.find(w=>Number(w.week_no)===Number(no)) || {week_no:Number(no),start_date:null,end_date:null,is_current:false};
  const selectedFilters=()=>({
    unit:$('tf-unit-select')?.value||'',
    phase:$('tf-phase-select')?.value||'',
    grouping:$('tf-grouping-select')?.value||''
  });

  function photoMatches(photo,filters=selectedFilters()){
    if(filters.unit && norm(photo.unit_key||photo.unit_name)!==filters.unit) return false;
    if(filters.phase && norm(photo.phase_key||photo.phase_name)!==filters.phase) return false;
    if(filters.grouping==='__none__' && photo.grouping_name) return false;
    if(filters.grouping && filters.grouping!=='__none__' && norm(photo.grouping_key||photo.grouping_name)!==filters.grouping) return false;
    return true;
  }

  function allFilteredPhotos(){
    return state.photos
      .filter(photo=>photoMatches(photo))
      .map(p=>({...p,_week:Number(p.week_no),_weekInfo:weekByNo(p.week_no)}))
      .filter(p=>Number.isFinite(p._week))
      .sort((a,b)=>a._week-b._week || Number(a.sort_order||0)-Number(b.sort_order||0));
  }

  function evidenceWeeks(){
    const unique=[...new Set(allFilteredPhotos().map(p=>p._week))];
    return unique.sort((a,b)=>a-b).map(weekByNo);
  }

  function setOptions(select,items,allLabel,valueOf,labelOf){
    if(!select) return;
    const current=select.value;
    select.innerHTML='<option value="">'+esc(allLabel)+'</option>'+
      items.map(item=>'<option value="'+esc(valueOf(item))+'">'+esc(labelOf(item))+'</option>').join('');
    if([...select.options].some(o=>o.value===current)) select.value=current;
  }

  function populateFilters(){
    const photos=state.photos;
    const units=[...new Map(
      photos.filter(p=>p.unit_name)
        .map(p=>[norm(p.unit_key||p.unit_name),p.unit_name])
    ).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
    setOptions($('tf-unit-select'),units,'Todas as Entregas',x=>x[0],x=>x[1]);

    const uf=$('tf-unit-select')?.value||'';
    const phases=[...new Map(
      photos.filter(p=>(!uf||norm(p.unit_key||p.unit_name)===uf)&&p.phase_name)
        .map(p=>[norm(p.phase_key||p.phase_name),p.phase_name])
    ).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
    setOptions($('tf-phase-select'),phases,'Todas as Fases',x=>x[0],x=>x[1]);

    const pf=$('tf-phase-select')?.value||'';
    const scoped=photos.filter(p=>
      (!uf||norm(p.unit_key||p.unit_name)===uf) &&
      (!pf||norm(p.phase_key||p.phase_name)===pf)
    );
    const groups=[...new Map(
      scoped.filter(p=>p.grouping_name)
        .map(p=>[norm(p.grouping_key||p.grouping_name),p.grouping_name])
    ).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
    const hasLegacy=scoped.some(p=>!p.grouping_name);
    const select=$('tf-grouping-select');
    if(select){
      const current=select.value;
      select.innerHTML='<option value="">Todos os Agrupamentos</option>'+
        groups.map(x=>'<option value="'+esc(x[0])+'">'+esc(x[1])+'</option>').join('')+
        (hasLegacy?'<option value="__none__">Sem agrupamento (fotos antigas)</option>':'');
      if([...select.options].some(o=>o.value===current)) select.value=current;
    }
  }

  function syncWeekChoices(){
    const weeks=evidenceWeeks();
    const select=$('tf-week-select');
    if(!select) return;

    const selected=Number.isFinite(Number(state.selectedWeek)) && state.selectedWeek!==null
      ? Number(state.selectedWeek)
      : null;
    const available=new Set(weeks.map(w=>Number(w.week_no)));
    if(selected!==null && !available.has(selected)) state.selectedWeek=null;

    select.innerHTML=
      '<option value="">Todas as semanas com fotos ('+weeks.length+')</option>'+
      weeks.map(w=>
        '<option value="'+Number(w.week_no)+'">S-'+Number(w.week_no)+
        (w.start_date?' • '+esc(dmy(w.start_date))+(w.end_date?'–'+esc(dmy(w.end_date)):''):'')+
        (w.is_current?' • ATUAL':'')+
        '</option>'
      ).join('');
    select.value=state.selectedWeek===null?'':String(state.selectedWeek);
  }

  function renderTimeline(){
    const host=$('tf-timeline');
    if(!host) return;
    const weeks=evidenceWeeks();
    const photos=allFilteredPhotos();

    if(!weeks.length){
      host.innerHTML='<div class="tf-timeline-empty">Nenhuma semana com registro fotográfico nesta seleção.</div>';
      return;
    }

    const counts=new Map();
    photos.forEach(photo=>counts.set(photo._week,(counts.get(photo._week)||0)+1));

    host.innerHTML=
      '<button class="tf-week-node tf-week-node-all '+(state.selectedWeek===null?'selected':'')+'" data-week="" type="button">'+
        '<span><strong>TODAS</strong><small>'+photos.length+' foto'+(photos.length===1?'':'s')+' • '+weeks.length+' semana'+(weeks.length===1?'':'s')+'</small></span>'+
      '</button>'+
      weeks.map(w=>{
        const no=Number(w.week_no);
        const total=counts.get(no)||0;
        return '<button class="tf-week-node has-photo '+(no===Number(state.selectedWeek)?'selected':'')+'" data-week="'+no+'" type="button" title="Mostrar somente a Semana '+no+'">'+
          '<i class="dot"></i>'+
          '<span><strong>S-'+no+'</strong><small>'+total+' foto'+(total===1?'':'s')+(w.start_date?' • '+esc(dmy(w.start_date)):'')+'</small></span>'+
        '</button>';
      }).join('');

    host.querySelectorAll('[data-week]').forEach(btn=>btn.addEventListener('click',()=>{
      const raw=btn.dataset.week;
      state.selectedWeek=raw===''?null:Number(raw);
      syncWeekChoices();
      renderAll();
      document.querySelector('#page-photo-time .tf-gallery')?.scrollIntoView({behavior:'smooth',block:'nearest'});
    }));
  }

  function photoContext(photo){
    return [photo.phase_name,photo.grouping_name].filter(Boolean).join(' • ');
  }

  function openPhotoLightbox(img){
    if(!img?.src) return;
    let overlay=$('tf-photo-lightbox');
    if(!overlay){
      overlay=document.createElement('div');
      overlay.id='tf-photo-lightbox';
      overlay.setAttribute('role','dialog');
      overlay.setAttribute('aria-modal','true');
      overlay.setAttribute('aria-label','Fotografia ampliada');
      overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.84);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box';
      overlay.innerHTML='<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;max-width:100%;max-height:100%">'+
        '<button type="button" aria-label="Fechar fotografia" style="position:absolute;right:0;top:0;transform:translate(35%,-35%);border:0;background:#14283e;color:white;border-radius:50%;font-size:24px;width:42px;height:42px;cursor:pointer">×</button>'+
        '<img alt="Fotografia ampliada" style="display:block;max-width:95vw;max-height:78vh;object-fit:contain;border-radius:10px;box-shadow:0 14px 55px rgba(0,0,0,.5)">'+
        '<div class="tf-lightbox-caption" style="color:white;font-size:16px;font-weight:700;text-align:center"></div>'+
        '<div class="tf-lightbox-info" style="color:#67e8f9;font-size:13px;text-align:center"></div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click',e=>{
        if(e.target===overlay || e.target.closest('button')) closePhotoLightbox();
      });
    }
    overlay.querySelector('img').src=img.src;
    const card=img.closest('.tf-photo,.tf-compare-card');
    overlay.querySelector('.tf-lightbox-caption').textContent=card?.querySelector('figcaption strong')?.textContent||'Registro fotográfico';
    overlay.querySelector('.tf-lightbox-info').textContent=card?.querySelector('figcaption small')?.textContent||'';
    overlay.style.display='flex';
    overlay.querySelector('button').focus();
  }
  function closePhotoLightbox(){
    const overlay=$('tf-photo-lightbox');
    if(!overlay || overlay.style.display==='none') return;
    overlay.style.display='none';
    overlay.querySelector('img').removeAttribute('src');
  }
  document.addEventListener('click',e=>{
    const img=e.target.closest('#page-photo-time .tf-photo img,#page-photo-time .tf-compare-card img');
    if(img) openPhotoLightbox(img);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && $('tf-photo-lightbox')?.style.display==='flex'){
      e.stopImmediatePropagation();
      closePhotoLightbox();
    }
  },true);

  function photoCard(photo){
    return '<figure class="tf-photo">'+
      '<img src="'+esc(photo.signed_url||'')+'" alt="Registro fotográfico — clique para ampliar" style="cursor:zoom-in">'+
      '<figcaption>'+
        '<strong>'+esc(photo.caption||'Registro fotográfico')+'</strong>'+
        '<small>'+esc(photo.unit_name||'Entrega não identificada')+'</small>'+
      '</figcaption>'+
    '</figure>';
  }

  function renderGallery(){
    const host=$('tf-gallery'),empty=$('tf-gallery-empty');
    if(!host||!empty) return;

    let photos=allFilteredPhotos();
    if(state.selectedWeek!==null){
      photos=photos.filter(p=>p._week===Number(state.selectedWeek));
    }

    if(!photos.length){
      host.innerHTML='';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    const grouped=new Map();
    photos.forEach(photo=>{
      if(!grouped.has(photo._week)) grouped.set(photo._week,[]);
      grouped.get(photo._week).push(photo);
    });

    const weekNos=[...grouped.keys()].sort((a,b)=>b-a);
    const gallerySummary=state.selectedWeek===null
      ? '<div class="tf-gallery-summary"><strong>'+photos.length+' foto'+(photos.length===1?'':'s')+'</strong><span>em '+weekNos.length+' semana'+(weekNos.length===1?'':'s')+' com evidência</span></div>'
      : '<div class="tf-gallery-summary"><strong>S-'+Number(state.selectedWeek)+'</strong><span>'+photos.length+' foto'+(photos.length===1?'':'s')+' nesta semana</span></div>';
    host.innerHTML=gallerySummary+weekNos.map(no=>{
      const list=grouped.get(no)||[];
      const w=weekByNo(no);
      const dateLabel=w.start_date
        ? dmy(w.start_date)+(w.end_date?' a '+dmy(w.end_date):'')
        : 'registro histórico';
      return '<section class="tf-gallery-week">'+
        '<header class="tf-gallery-week-head">'+
          '<div><strong>S-'+no+'</strong><span>'+esc(dateLabel)+'</span></div>'+
          '<b>'+list.length+' foto'+(list.length===1?'':'s')+'</b>'+
        '</header>'+
        '<div class="tf-gallery-week-grid">'+list.map(photoCard).join('')+'</div>'+
      '</section>';
    }).join('');
  }

  function filteredHistoryPhotos(){
    return allFilteredPhotos();
  }

  function renderCompare(){
    const photos=filteredHistoryPhotos();
    const host=$('tf-compare');
    if(!host) return;
    if(!photos.length){
      host.innerHTML='<div class="tf-empty">Não há fotos para comparar nesta seleção.</div>';
      return;
    }
    const units=[...new Map(photos.map(p=>[norm(p.unit_key||p.unit_name),p.unit_name])).entries()].filter(([key])=>key);
    const preferred=units.find(([key])=>key===state.compareUnit);
    const withPairs=units.find(([key])=>new Set(photos.filter(p=>norm(p.unit_key||p.unit_name)===key).map(p=>p._week)).size>=2);
    const [unitKey]=preferred||withPairs||units[0]||[''];
    state.compareUnit=unitKey;
    const unitPhotos=photos.filter(p=>norm(p.unit_key||p.unit_name)===unitKey);
    const weekNos=[...new Set(unitPhotos.map(p=>p._week))].sort((a,b)=>a-b);
    const firstWeek=weekNos[0],lastWeek=weekNos[weekNos.length-1];
    if(!weekNos.includes(state.compareBefore))state.compareBefore=firstWeek;
    if(!weekNos.includes(state.compareAfter))state.compareAfter=lastWeek;
    const before=unitPhotos.find(p=>p._week===state.compareBefore);
    const after=unitPhotos.find(p=>p._week===state.compareAfter);
    const unitSelect='<label>Unidade <select id="tf-compare-unit">'+units.map(([key,name])=>
      '<option value="'+esc(key)+'"'+(key===unitKey?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>';
    const selectWeek=(id,label,selected)=>'<label>'+label+' <select id="'+id+'">'+
      weekNos.map(no=>'<option value="'+no+'"'+(no===selected?' selected':'')+'>S-'+no+'</option>').join('')+'</select></label>';
    const card=(p,label)=>p?
      '<div class="tf-compare-card"><header><span>'+label+' • S-'+p._week+'</span></header>'+
      '<img src="'+esc(p.signed_url||'')+'" alt="'+label+'">'+
      '<footer><strong>'+esc(p.unit_name||'Entrega')+'</strong>'+esc(p.caption||photoContext(p)||'Registro fotográfico')+'</footer></div>':
      '<div class="tf-empty">Sem registro nesta semana.</div>';
    host.innerHTML='<div class="tf-compare-controls" style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px">'+
      unitSelect+selectWeek('tf-compare-before','ANTES',state.compareBefore)+selectWeek('tf-compare-after','AGORA',state.compareAfter)+'</div>'+
      (weekNos.length<2?'<p style="grid-column:1/-1">Esta unidade tem fotos em apenas uma semana. Selecione outra unidade para comparar a evolução.</p>':'')+
      card(before,'ANTES')+card(after,'AGORA');
    const controls=host.querySelector('.tf-compare-controls');
    controls.querySelectorAll('select').forEach(el=>{
      el.style.cssText='display:block;max-width:100%;min-width:150px;padding:9px;background:#091827;color:#f0f7ff;border:1px solid #35506b;border-radius:8px;margin-top:5px';
    });
    $('tf-compare-unit')?.addEventListener('change',e=>{
      state.compareUnit=e.target.value;state.compareBefore=null;state.compareAfter=null;renderCompare();
    });
    $('tf-compare-before')?.addEventListener('change',e=>{state.compareBefore=Number(e.target.value);renderCompare();});
    $('tf-compare-after')?.addEventListener('change',e=>{state.compareAfter=Number(e.target.value);renderCompare();});
  }

  function renderMemory(){
    const photos=filteredHistoryPhotos();
    const units=new Set(photos.map(p=>p.unit_key||p.unit_name).filter(Boolean));
    const groups=new Set(photos.map(p=>p.grouping_key||p.grouping_name).filter(Boolean));
    const weeks=new Set(photos.map(p=>p._week));
    const latest=photos.at(-1);
    const host=$('tf-memory');
    if(!host) return;

    host.innerHTML=
      '<div class="tf-stat">'+
        '<div><b>'+photos.length+'</b>registros fotográficos</div>'+
        '<div><b>'+weeks.size+'</b>semanas com evidência</div>'+
        '<div><b>'+units.size+'</b>entregas acompanhadas</div>'+
        '<div><b>'+groups.size+'</b>agrupamentos identificados</div>'+
      '</div>'+
      (latest?'<p><strong>Último registro:</strong> S-'+latest._week+' • '+esc(latest.unit_name||'Entrega')+(latest.phase_name?' • '+esc(latest.phase_name):'')+'</p>':'')+
      '<p>Ao filtrar uma entrega ou fase, a galeria mostra <strong>todo o histórico disponível</strong>. A linha do tempo exibe somente as semanas que possuem fotos para a seleção atual.</p>'+
      (photos.some(p=>!p.grouping_name)?'<p><strong>Observação:</strong> existem fotos antigas salvas antes do vínculo por agrupamento; elas continuam disponíveis em “Todos os Agrupamentos”.</p>':'');
  }

  function renderAll(){
    syncWeekChoices();
    renderTimeline();
    renderGallery();
    renderCompare();
    renderMemory();
  }

  function resetWeekAndRender(){
    state.selectedWeek=null;
    syncWeekChoices();
    renderAll();
  }

  function bindFilters(){
    $('tf-week-select')?.addEventListener('change',()=>{
      const raw=$('tf-week-select').value;
      state.selectedWeek=raw===''?null:Number(raw);
      renderAll();
    });

    $('tf-unit-select')?.addEventListener('change',()=>{
      if($('tf-phase-select')) $('tf-phase-select').value='';
      if($('tf-grouping-select')) $('tf-grouping-select').value='';
      populateFilters();
      resetWeekAndRender();
    });

    $('tf-phase-select')?.addEventListener('change',()=>{
      if($('tf-grouping-select')) $('tf-grouping-select').value='';
      populateFilters();
      resetWeekAndRender();
    });

    $('tf-grouping-select')?.addEventListener('change',resetWeekAndRender);
    $('tf-compare-button')?.addEventListener('click',()=>$('tf-compare-panel')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  async function loadHistory(){
    if(window.CloudSync.listCoordinationPhotoHistory){
      return window.CloudSync.listCoordinationPhotoHistory();
    }
    const rows=await Promise.all(state.weeks.map(async w=>{
      try{return await window.CloudSync.listCoordinationPhotos(Number(w.week_no),'','','');}
      catch(_){return [];}
    }));
    return rows.flat();
  }

  async function init(){
    try{
      if(!window.CloudSync?.ready?.()) throw new Error('Supabase indisponível.');

      const weeks=await window.CloudSync.listCoordinationWeeks();
      state.weeks=(Array.isArray(weeks)?weeks:[])
        .filter(w=>Number(w.week_no)>0)
        .sort((a,b)=>Number(a.week_no)-Number(b.week_no));

      const history=await loadHistory();
      state.photos=Array.isArray(history)?history:[];
      state.selectedWeek=null;

      populateFilters();
      bindFilters();
      renderAll();
    }catch(error){
      console.error(error);
      const host=$('tf-memory');
      if(host) host.innerHTML='<div class="tf-empty">Não foi possível carregar o Tempo Fotográfico. '+esc(error.message||error)+'</div>';
    }
  }

  document.addEventListener('DOMContentLoaded',init);
})();