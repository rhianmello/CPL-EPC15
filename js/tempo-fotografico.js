(function(){
  const $=id=>document.getElementById(id);
  const state={weeks:[],photosByWeek:new Map(),selectedWeek:null,unit:'',phase:'',grouping:''};

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v||'').trim().toLocaleLowerCase('pt-BR');
  const dmy=v=>{const d=new Date(String(v||'')+'T12:00:00');return Number.isNaN(d.valueOf())?'—':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});};
  const weekByNo=no=>state.weeks.find(w=>Number(w.week_no)===Number(no));
  const selectedFilters=()=>({unit:$('tf-unit-select').value,phase:$('tf-phase-select').value,grouping:$('tf-grouping-select').value});

  function photoMatches(photo,filters=selectedFilters()){
    if(filters.unit && norm(photo.unit_key||photo.unit_name)!==filters.unit) return false;
    if(filters.phase && norm(photo.phase_key||photo.phase_name)!==filters.phase) return false;
    if(filters.grouping==='__none__' && photo.grouping_name) return false;
    if(filters.grouping && filters.grouping!=='__none__' && norm(photo.grouping_key||photo.grouping_name)!==filters.grouping) return false;
    return true;
  }

  function windowWeeks(center=state.selectedWeek){
    const current=Math.max(1,Number(center)||1);
    const min=Math.max(1,current-4);
    return state.weeks.filter(w=>Number(w.week_no)>=min && Number(w.week_no)<=current);
  }

  async function ensureWeekPhotos(weekNo){
    const n=Number(weekNo);
    if(state.photosByWeek.has(n)) return state.photosByWeek.get(n);
    try{
      const photos=await window.CloudSync.listCoordinationPhotos(n,'','','');
      state.photosByWeek.set(n,Array.isArray(photos)?photos:[]);
    }catch(error){
      console.error('Tempo Fotográfico: falha ao ler semana',n,error);
      state.photosByWeek.set(n,[]);
    }
    return state.photosByWeek.get(n);
  }

  async function ensureWindow(){
    await Promise.all(windowWeeks().map(w=>ensureWeekPhotos(w.week_no)));
  }

  function allWindowPhotos(){
    return windowWeeks().flatMap(w=>(state.photosByWeek.get(Number(w.week_no))||[]));
  }

  function setOptions(select,items,allLabel,valueOf,labelOf){
    const current=select.value;
    select.innerHTML='<option value="">'+allLabel+'</option>'+items.map(item=>'<option value="'+esc(valueOf(item))+'">'+esc(labelOf(item))+'</option>').join('');
    if([...select.options].some(o=>o.value===current)) select.value=current;
  }

  function populateFilters(){
    const photos=allWindowPhotos();
    const units=[...new Map(photos.filter(p=>p.unit_name).map(p=>[norm(p.unit_key||p.unit_name),p.unit_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
    setOptions($('tf-unit-select'),units,'Todas as Entregas',x=>x[0],x=>x[1]);

    const uf=$('tf-unit-select').value;
    const phases=[...new Map(photos.filter(p=>(!uf||norm(p.unit_key||p.unit_name)===uf)&&p.phase_name).map(p=>[norm(p.phase_key||p.phase_name),p.phase_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
    setOptions($('tf-phase-select'),phases,'Todas as Fases',x=>x[0],x=>x[1]);

    const pf=$('tf-phase-select').value;
    const scoped=photos.filter(p=>(!uf||norm(p.unit_key||p.unit_name)===uf)&&(!pf||norm(p.phase_key||p.phase_name)===pf));
    const groups=[...new Map(scoped.filter(p=>p.grouping_name).map(p=>[norm(p.grouping_key||p.grouping_name),p.grouping_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
    const hasLegacy=scoped.some(p=>!p.grouping_name);
    $('tf-grouping-select').innerHTML='<option value="">Todos os Agrupamentos</option>'+
      groups.map(x=>'<option value="'+esc(x[0])+'">'+esc(x[1])+'</option>').join('')+
      (hasLegacy?'<option value="__none__">Sem agrupamento (fotos antigas)</option>':'');
  }

  function renderTimeline(){
    const filters=selectedFilters();
    $('tf-timeline').innerHTML=windowWeeks().map(w=>{
      const no=Number(w.week_no);
      const has=(state.photosByWeek.get(no)||[]).some(p=>photoMatches(p,filters));
      return '<button class="tf-week-node '+(has?'has-photo ':'')+(no===Number(state.selectedWeek)?'selected':'')+'" data-week="'+no+'" type="button">'+
        (has?'<i class="dot"></i>':'')+
        '<span><strong>S-'+no+'</strong><small>'+esc(dmy(w.start_date))+'</small></span>'+
      '</button>';
    }).join('');
    $('tf-timeline').querySelectorAll('[data-week]').forEach(btn=>btn.addEventListener('click',async()=>{
      state.selectedWeek=Number(btn.dataset.week);
      $('tf-week-select').value=String(state.selectedWeek);
      await ensureWindow();
      populateFilters(); renderAll();
    }));
  }

  function photoContext(photo){
    return [photo.phase_name,photo.grouping_name].filter(Boolean).join(' • ');
  }

  function renderGallery(){
    const photos=(state.photosByWeek.get(Number(state.selectedWeek))||[]).filter(p=>photoMatches(p));
    const host=$('tf-gallery'),empty=$('tf-gallery-empty');
    if(!photos.length){host.innerHTML='';empty.classList.remove('hidden');return;}
    empty.classList.add('hidden');
    host.innerHTML=photos.slice(0,9).map(photo=>
      '<figure class="tf-photo"><img src="'+esc(photo.signed_url||'')+'" alt="Registro fotográfico">'+
      '<figcaption><strong>'+esc(photo.unit_name||'Entrega')+'</strong>'+
      '<small>'+esc(photoContext(photo)||'Registro da semana')+'</small>'+
      (photo.caption?'<p>'+esc(photo.caption)+'</p>':'')+
      '</figcaption></figure>'
    ).join('');
  }

  function filteredHistoryPhotos(){
    return windowWeeks().flatMap(w=>(state.photosByWeek.get(Number(w.week_no))||[]).filter(photoMatches).map(p=>({...p,_week:Number(w.week_no),_weekInfo:w})))
      .sort((a,b)=>a._week-b._week || Number(a.sort_order||0)-Number(b.sort_order||0));
  }

  function renderCompare(){
    const photos=filteredHistoryPhotos();
    const host=$('tf-compare');
    if(!photos.length){host.innerHTML='<div class="tf-empty">Ainda não há fotos suficientes para comparação nesta seleção.</div>';return;}
    const first=photos[0],last=photos[photos.length-1];
    const card=(p,label)=>'<div class="tf-compare-card"><header><span>'+label+' • S-'+p._week+'</span></header>'+
      '<img src="'+esc(p.signed_url||'')+'" alt="'+label+'">'+
      '<footer><strong>'+esc(p.unit_name||'Entrega')+'</strong>'+esc(p.caption||photoContext(p)||'Registro fotográfico')+'</footer></div>';
    host.innerHTML=card(first,'ANTES')+card(last,'AGORA');
  }

  function renderMemory(){
    const photos=filteredHistoryPhotos();
    const units=new Set(photos.map(p=>p.unit_key||p.unit_name).filter(Boolean));
    const groups=new Set(photos.map(p=>p.grouping_key||p.grouping_name).filter(Boolean));
    const weeks=new Set(photos.map(p=>p._week));
    const latest=photos.at(-1);
    $('tf-memory').innerHTML=
      '<div class="tf-stat">'+
        '<div><b>'+photos.length+'</b>registros fotográficos</div>'+
        '<div><b>'+weeks.size+'</b>semanas com evidência</div>'+
        '<div><b>'+units.size+'</b>entregas acompanhadas</div>'+
        '<div><b>'+groups.size+'</b>agrupamentos identificados</div>'+
      '</div>'+
      (latest?'<p><strong>Último registro:</strong> S-'+latest._week+' • '+esc(latest.unit_name||'Entrega')+(latest.phase_name?' • '+esc(latest.phase_name):'')+'</p>':'')+
      '<p>A linha do tempo preserva as fotos por <strong>semana, entrega e fase</strong>. Fotos novas também passam a guardar o <strong>agrupamento selecionado</strong> no momento da importação.</p>'+
      (photos.some(p=>!p.grouping_name)?'<p><strong>Observação:</strong> existem fotos antigas salvas antes do vínculo por agrupamento; elas continuam disponíveis em “Todos os Agrupamentos”.</p>':'');
  }

  function renderAll(){renderTimeline();renderGallery();renderCompare();renderMemory();}

  async function changeWeek(){
    state.selectedWeek=Number($('tf-week-select').value);
    await ensureWindow();
    populateFilters();
    renderAll();
  }

  async function init(){
    try{
      if(!window.CloudSync?.ready?.()) throw new Error('Supabase indisponível.');
      const weeks=await window.CloudSync.listCoordinationWeeks();
      state.weeks=(Array.isArray(weeks)?weeks:[]).filter(w=>Number(w.week_no)>0);
      const current=state.weeks.find(w=>w.is_current) || state.weeks.filter(w=>w.has_snapshot).at(-1) || state.weeks.at(-1);
      state.selectedWeek=Number(current?.week_no||1);

      $('tf-week-select').innerHTML=state.weeks.filter(w=>Number(w.week_no)<=Number(state.selectedWeek)+4).map(w=>
        '<option value="'+Number(w.week_no)+'">S-'+Number(w.week_no)+' • '+esc(dmy(w.start_date))+'–'+esc(dmy(w.end_date))+(w.is_current?' • ATUAL':'')+'</option>'
      ).join('');
      $('tf-week-select').value=String(state.selectedWeek);

      await ensureWindow();
      populateFilters();
      renderAll();

      $('tf-week-select').addEventListener('change',changeWeek);
      $('tf-unit-select').addEventListener('change',()=>{populateFilters();renderAll();});
      $('tf-phase-select').addEventListener('change',()=>{populateFilters();renderAll();});
      $('tf-grouping-select').addEventListener('change',renderAll);
      $('tf-compare-button').addEventListener('click',()=>$('tf-compare-panel').scrollIntoView({behavior:'smooth',block:'start'}));
    }catch(error){
      console.error(error);
      $('tf-memory').innerHTML='<div class="tf-empty">Não foi possível carregar o Tempo Fotográfico. '+esc(error.message||error)+'</div>';
    }
  }

  document.addEventListener('DOMContentLoaded',init);
})();