(function () {
  const PROJECT_START = '2026-03-29';
  const PROJECT_WEEKS = 134;

  let weeks = buildFallbackWeeks();
  let selectedWeek = null;
  let currentSnapshot = null;
  let activeSnapshot = false;
  let usingLiveDraft = false;
  let cloudWeeksLoaded = false;
  let loadingWeeks = false;
  let installed = false;
  let savingWeek = false;
  let manualSyncTimer = null;
  let manualSyncBusy = false;
  let lastManualSyncVersion = null;
  const masterUnlockedWeeks = new Map();

  function isoDateInSaoPaulo() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'
      }).format(new Date());
    } catch (_) {
      return new Date().toISOString().slice(0,10);
    }
  }

  function addDays(iso, days) {
    const [y,m,d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y,m-1,d + days));
    return dt.toISOString().slice(0,10);
  }

  function buildFallbackWeeks() {
    const today = isoDateInSaoPaulo();
    return Array.from({length:PROJECT_WEEKS}, (_,i) => {
      const start = addDays(PROJECT_START, i*7);
      const end = addDays(start,6);
      return {
        week_no:i+1,
        start_date:start,
        end_date:end,
        is_current:today>=start && today<=end,
        is_locked:end<today,
        has_snapshot:false,
        version_no:null,
        excel_data_base:null,
        saved_at:null
      };
    });
  }

  function weekByNo(no) {
    return weeks.find(w => Number(w.week_no) === Number(no)) || null;
  }

  function currentProjectWeek() {
    return weeks.find(w => w.is_current)?.week_no ||
      buildFallbackWeeks().find(w => w.is_current)?.week_no || 1;
  }

  function getSelectedWeek() {
    const select = document.getElementById('pb-week-filter');
    const fromUi = Number(select?.value);
    if (Number.isFinite(fromUi) && fromUi > 0) selectedWeek = fromUi;
    return selectedWeek || currentProjectWeek();
  }

  function fmtDate(iso) {
    if (!iso) return 'N/D';
    const s=String(iso).slice(0,10);
    const [y,m,d]=s.split('-');
    return y&&m&&d ? d+'/'+m+'/'+y : String(iso);
  }

  function shortDate(iso) {
    if (!iso) return 'N/D';
    const s=String(iso).slice(0,10);
    const [y,m,d]=s.split('-');
    return y&&m&&d ? d+'/'+m : String(iso);
  }

  function modelDate(value) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
    if (!value) return null;
    const raw=String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
    const m=raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? m[3]+'-'+m[2]+'-'+m[1] : null;
  }

  function fillWeekOptions(select) {
    if (!select) return;
    const previous = Number(select.value) || selectedWeek || currentProjectWeek();
    select.innerHTML = weeks.map(w => {
      const marks = [
        w.is_current ? 'ATUAL' : '',
        w.has_snapshot ? 'SALVA' : '',
        w.is_locked ? 'FECHADA' : ''
      ].filter(Boolean);
      return '<option value="'+w.week_no+'">Semana '+w.week_no+' • '+shortDate(w.start_date)+'–'+shortDate(w.end_date)+(marks.length?' • '+marks.join(' • '):'')+'</option>';
    }).join('');
    const target = weekByNo(previous) ? previous : currentProjectWeek();
    select.value=String(target);
    selectedWeek=target;
  }

  async function ensureCloudWeeks(force=false) {
    if (loadingWeeks || (cloudWeeksLoaded && !force)) return;
    if (!window.CloudSync?.ready?.()) return;
    loadingWeeks=true;
    try {
      const remote=await window.CloudSync.listCoordinationWeeks();
      if (remote?.length) {
        weeks=remote.map(w => ({
          ...w,
          week_no:Number(w.week_no),
          version_no:w.version_no==null?null:Number(w.version_no),
          is_current:Boolean(w.is_current),
          is_locked:Boolean(w.is_locked),
          has_snapshot:Boolean(w.has_snapshot)
        }));
        cloudWeeksLoaded=true;
        fillWeekOptions(document.getElementById('pb-week-filter'));
        if(!activeSnapshot && !usingLiveDraft && !savingWeek && weekByNo(getSelectedWeek())?.has_snapshot){
          await loadWeek(getSelectedWeek());
        }
      }
    } catch(error) {
      console.error('Falha ao carregar calendário EPC-15',error);
    } finally {
      loadingWeeks=false;
      refreshStatus();
    }
  }

  function hasActiveSnapshot() { return activeSnapshot; }
  function isLocked() { return Boolean(weekByNo(getSelectedWeek())?.is_locked); }
  function isMasterUnlocked(weekNo=getSelectedWeek()) {
    return masterUnlockedWeeks.has(Number(weekNo));
  }
  function getMasterPassword(weekNo=getSelectedWeek()) {
    return masterUnlockedWeeks.get(Number(weekNo)) || '';
  }
  function unlockWeek(weekNo,password) {
    const week=Number(weekNo);
    const clean=String(password || '');
    if(Number.isFinite(week) && clean) masterUnlockedWeeks.set(week,clean);
    refreshStatus();
  }
  function canEdit() { return !isLocked() || isMasterUnlocked(); }

  async function loadWeek(weekNo) {
    selectedWeek=Number(weekNo);
    currentSnapshot=null;
    activeSnapshot=false;
    usingLiveDraft=false;

    if (!window.CloudSync?.ready?.()) {
      window.PBDashboard?.useLive?.();
      window.PBDashboard?.render?.();
      refreshStatus();
      return;
    }

    try {
      const result=await window.CloudSync.loadCoordinationWeek(selectedWeek);
      const snapshot=result?.snapshot || null;
      if (snapshot?.dataset?.model) {
        currentSnapshot=snapshot;
        activeSnapshot=true;
        lastManualSyncVersion=(Number(snapshot.version_no)||'')+'|'+String(snapshot.saved_at||'');
        window.PBDashboard?.useSnapshot?.(snapshot.dataset.model, snapshot.excel_file_name || ('Semana '+selectedWeek));
        window.PBDashboard?.importWeekData?.(snapshot.pb_manual || {}, selectedWeek);
        await window.PBDashboard?.loadPhotos?.(selectedWeek);
      } else {
        window.PBDashboard?.useLive?.();
        window.PBDashboard?.importWeekData?.({},selectedWeek);
        await window.PBDashboard?.loadPhotos?.(selectedWeek);
      }
    } catch(error) {
      console.error('Falha ao carregar a Semana '+selectedWeek,error);
      window.PBDashboard?.useLive?.();
      window.PBDashboard?.importWeekData?.({},selectedWeek);
    } finally {
      refreshStatus();
    }
  }

  async function selectWeekFromUI() {
    const week=Number(document.getElementById('pb-week-filter')?.value);
    if (Number.isFinite(week)) await loadWeek(week);
  }

  function useLiveExcel() {
    if (!canEdit()) return;
    usingLiveDraft=true;
    activeSnapshot=false;
    currentSnapshot=null;
    window.PBDashboard?.useLive?.();
    refreshStatus();
  }

  async function saveWeek() {
    if(savingWeek) return;
    const week=getSelectedWeek();
    if (!canEdit()) {
      alert('A Semana '+week+' está encerrada. Use o lápis e informe a senha master para liberar a edição.');
      return;
    }

    const model=window.PBDashboard?.getCurrentModel?.() || window.EPC15State?.getCurrentModel?.();
    if(!model) {
      alert('Carregue o Excel antes de salvar a semana.');
      return;
    }

    const info=window.PBDashboard?.getViewInfo?.() || {};
    const appFile=window.EPC15State?.getCurrentFile?.() || {};
    const publication=window.EPC15State?.getCurrentPublication?.() || {};
    const saveButton=document.getElementById('pb-save-week');

    savingWeek=true;
    try {
      if(saveButton){saveButton.disabled=true;saveButton.textContent='Salvando...';}
      const pbManual=window.PBDashboard?.exportWeekData?.(week) || {};
      const masterPassword=isMasterUnlocked(week) ? getMasterPassword(week) : '';
      const saved=activeSnapshot && currentSnapshot?.dataset?.model === model && !usingLiveDraft
        ? {...currentSnapshot, ...await window.CloudSync.saveCoordinationManualWeek(week,pbManual,masterPassword)}
        : await window.CloudSync.saveCoordinationWeek({
        weekNo:week,
        model,
        excelFileName:info.fileName || appFile.name || publication.file_name || 'Versão publicada',
        pbManual,
        masterPassword
      });
      if(!saved || !Number.isFinite(Number(saved.version_no)) || Number(saved.version_no)<1){
        throw new Error('O banco não confirmou a versão salva.');
      }
      let photoSave={saved:0};
      let photoWarning='';
      try { photoSave=await window.PBDashboard?.savePendingPhotos?.(week) || photoSave; }
      catch(error){ photoWarning=' • Fotos pendentes: '+String(error?.message || 'falha no envio'); }

      usingLiveDraft=false;
      activeSnapshot=true;
      currentSnapshot={
        ...saved,
        dataset:{schema_version:'epc15_coordination_excel_v1',model},
        pb_manual:pbManual
      };
      lastManualSyncVersion=(Number(saved.version_no)||'')+'|'+String(saved.saved_at||'');
      window.PBDashboard?.finishCuration?.();

      await ensureCloudWeeks(true);
      const refreshed=weekByNo(week);
      if(refreshed){
        refreshed.has_snapshot=true;
        refreshed.version_no=saved.version_no;
        refreshed.excel_data_base=saved.excel_data_base;
      }

      const badge=document.getElementById('pb-save-feedback');
      if(badge){badge.textContent='Semana '+week+' salva • V'+saved.version_no+(photoSave.saved?' • '+photoSave.saved+' foto(s) salva(s)':'')+photoWarning;badge.dataset.tone=photoWarning?'error':'ok';}
    } catch(error) {
      const raw=String(error?.message || '');
      const timeout=/statement timeout|canceling statement/i.test(raw);
      const message=timeout
        ? 'A nuvem demorou para concluir o salvamento. Tente novamente em alguns segundos.'
        : (raw || 'Não foi possível salvar a semana.');
      alert(message);
      const badge=document.getElementById('pb-save-feedback');
      if(badge){badge.textContent=timeout?'Tempo excedido ao salvar':'Falha ao salvar';badge.dataset.tone='error';}
    } finally {
      savingWeek=false;
      if(saveButton) saveButton.textContent='Salvar semana';
      refreshStatus();
    }
  }

  async function syncManualFromCloud(force=false) {
    if(manualSyncBusy) return;
    if(document.hidden && !force) return;
    if(usingLiveDraft || savingWeek) return;
    if(window.PBDashboard?.isCurationMode?.()) return;
    if(!window.CloudSync?.ready?.()) return;

    const weekNo=getSelectedWeek();
    if(!Number.isFinite(Number(weekNo))) return;

    manualSyncBusy=true;
    try{
      const snapshot=await window.CloudSync.loadCoordinationManualWeek(weekNo);
      const remoteVersion=Number(snapshot?.version_no)||null;
      const remoteSavedAt=snapshot?.saved_at || null;
      if(!snapshot?.pb_manual || !remoteVersion) return;

      const remoteKey=remoteVersion+'|'+String(remoteSavedAt||'');
      if(force || remoteKey!==lastManualSyncVersion){
        window.PBDashboard?.importWeekData?.(snapshot.pb_manual || {},weekNo);
        lastManualSyncVersion=remoteKey;
        if(currentSnapshot){
          currentSnapshot={...currentSnapshot,version_no:remoteVersion,pb_manual:snapshot.pb_manual,saved_at:remoteSavedAt};
        }
        const badge=document.getElementById('pb-save-feedback');
        if(badge && !force){
          badge.textContent='Atualizado automaticamente • V'+remoteVersion;
          badge.dataset.tone='ok';
        }
        refreshStatus();
      }
    }catch(error){
      console.error('Falha ao sincronizar destaques da semana',error);
    }finally{
      manualSyncBusy=false;
    }
  }

  function startManualSync() {
    if(manualSyncTimer) clearInterval(manualSyncTimer);
    manualSyncTimer=setInterval(()=>syncManualFromCloud(false),10000);
  }

  function noteManualSaved(saved) {
    if(!saved) return;
    lastManualSyncVersion=(Number(saved.version_no)||'')+'|'+String(saved.saved_at||'');
    if(currentSnapshot){
      currentSnapshot={...currentSnapshot,saved_at:saved.saved_at||currentSnapshot.saved_at};
    }
    const badge=document.getElementById('pb-save-feedback');
    if(badge){
      badge.textContent='Alterações da semana sincronizadas';
      badge.dataset.tone='ok';
    }
  }

  function refreshStatus() {
    const info=window.PBDashboard?.getViewInfo?.() || {};
    const week=weekByNo(getSelectedWeek());
    const excelIso=modelDate(info.dataBase);

    const excel=document.getElementById('pb-excel-source-status');
    const sync=document.getElementById('pb-sync-source-status');
    const weekEl=document.getElementById('pb-week-source-status');

    if(excel) {
      excel.innerHTML='<span>FONTE DA REUNIÃO</span><strong>Avanço PLATAQ • '+fmtDate(excelIso)+'</strong><small></small>';
    }

    if(sync) {
      let tone='ok';
      let title='Dados vindos exclusivamente do Excel';
      let detail='';
      if (usingLiveDraft) {
        tone='info';
        title='Excel atual em preparação';
        detail='Clique em Salvar semana para registrar esta versão.';
      } else if (activeSnapshot && currentSnapshot?.version_no) {
        title='Versão semanal salva • V'+currentSnapshot.version_no;
        detail='Snapshot do Excel + anotações da reunião.';
      }
      sync.dataset.tone=tone;
      sync.innerHTML='<span>STATUS</span><strong>'+title+'</strong><small>'+detail+'</small>';
    }

    if(weekEl && week) {
      const state=week.is_locked
        ? (isMasterUnlocked(week.week_no) ? 'FECHADA • EDIÇÃO MASTER LIBERADA' : 'FECHADA • somente leitura')
        : (week.is_current?'SEMANA ATUAL':'ABERTA PARA PREPARAÇÃO');
      const saved=currentSnapshot?.version_no ? ' • V'+currentSnapshot.version_no : (week.has_snapshot?' • salva':' • ainda não salva');
      weekEl.innerHTML='<span>SEMANA EPC-15</span><strong>Semana '+week.week_no+' • '+shortDate(week.start_date)+'–'+shortDate(week.end_date)+'</strong><small>'+state+saved+'</small>';
    }

    updateEditState();
  }

  function updateEditState() {
    const locked=isLocked();
    const editable=canEdit();
    const save=document.getElementById('pb-save-week');
    const live=document.getElementById('pb-use-live-excel');
    if(save) save.disabled=savingWeek || !editable || !window.PBDashboard?.getCurrentModel?.();
    if(live) live.disabled=!editable || !window.EPC15State?.hasData?.();
    document.getElementById('page-pb')?.classList.toggle('coordination-readonly',locked && !editable);
    document.getElementById('page-pb')?.classList.toggle('coordination-master-unlocked',locked && editable);
  }

  function install() {
    if(installed) return;
    installed=true;
    const select=document.getElementById('pb-week-filter');
    fillWeekOptions(select);
    select?.addEventListener('change',selectWeekFromUI);
    document.getElementById('pb-save-week')?.addEventListener('click',saveWeek);
    document.getElementById('pb-use-live-excel')?.addEventListener('click',useLiveExcel);
    window.addEventListener('focus',()=>syncManualFromCloud(true));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden) syncManualFromCloud(true);});
    ensureCloudWeeks();
    startManualSync();
    refreshStatus();
  }

  window.CoordinationWeek={
    install,fillWeekOptions,ensureCloudWeeks,getSelectedWeek,selectWeekFromUI,
    canEdit,isLocked,isMasterUnlocked,getMasterPassword,unlockWeek,
    hasActiveSnapshot,refreshStatus,useLiveExcel,saveWeek,syncManualFromCloud,noteManualSaved
  };

  window.addEventListener('DOMContentLoaded',install);
  window.addEventListener('load',()=>{install();ensureCloudWeeks();refreshStatus();});
}());
