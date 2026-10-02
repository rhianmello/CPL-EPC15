(function () {
  const cfg = window.EPC15_SUPABASE_CONFIG || {};
  let client = null;
  let credentials = cfg.testAccess
    ? { username:'__EPC15_TEST_MODE__', password:'__EPC15_TEST_MODE__' }
    : null;

  function ready() {
    return Boolean(cfg.enabled && cfg.url && cfg.publishableKey && window.supabase?.createClient);
  }

  function getClient() {
    if (!ready()) return null;
    if (!client) {
      client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    }
    return client;
  }

  function setCredentials(username, password) {
    credentials = { username: String(username || '').trim(), password: String(password || '') };
  }

  function clearCredentials() {
    credentials = cfg.testAccess
      ? { username:'__EPC15_TEST_MODE__', password:'__EPC15_TEST_MODE__' }
      : null;
  }
  function hasCredentials() { return Boolean(credentials?.username && credentials?.password); }

  const PUBLIC_READ_RPC = Object.freeze({
    get_current_bi_snapshot:'get_current_bi_snapshot_public',
    list_bi_publications:'list_bi_publications_public',
    list_coordination_weeks:'list_coordination_weeks_public',
    get_coordination_week:'get_coordination_week_public',
    get_coordination_manual_week:'get_coordination_manual_week_public',
    get_coordination_layout:'get_coordination_layout_public'
  });

  async function rpc(name, args={}) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase ainda não está configurado.');

    let rpcName=name;
    let payload={...args};
    if(hasCredentials()){
      payload={
        p_username:credentials.username,
        p_password:credentials.password,
        ...payload
      };
    }else if(PUBLIC_READ_RPC[name]){
      rpcName=PUBLIC_READ_RPC[name];
    }else{
      throw new Error('Entre como editor para executar esta ação.');
    }

    const { data, error } = await supabase.rpc(rpcName,payload);
    if (error) throw new Error(error.message || 'Falha de comunicação com o Supabase.');
    return data;
  }

  async function verifyAccess(username, password) {
    if (!ready()) return null;
    setCredentials(username, password);
    try {
      const data = await rpc('verify_bi_access', {});
      if (data !== true) {
        clearCredentials();
        return false;
      }
      return true;
    } catch (error) {
      clearCredentials();
      throw error;
    }
  }

  function reviveModel(model) {
    if (!model || typeof model !== 'object') return model;
    const copy = JSON.parse(JSON.stringify(model));
    if (copy.dataBase) {
      const d = new Date(copy.dataBase);
      copy.dataBase = Number.isNaN(d.valueOf()) ? null : d;
    }
    return copy;
  }

  async function loadCurrent() {
    const data = await rpc('get_current_bi_snapshot', { p_dataset_type: 'epc15' });
    if (!data) return null;
    const publication = typeof data === 'string' ? JSON.parse(data) : data;
    if (!publication?.dataset?.model) throw new Error('A publicação atual está incompleta ou incompatível.');
    return {
      publication,
      model: reviveModel(publication.dataset.model),
      pbManual: publication.pb_manual || null
    };
  }

  async function publish({ model, fileName, fileSize, fileLastModified, pbManual }) {
    if (!model) throw new Error('Nenhum dataset foi carregado para publicação.');
    const dataset = {
      schema_version: cfg.schemaVersion || 'epc15_snapshot_v1',
      generated_at: new Date().toISOString(),
      model
    };
    const dataBase = model.dataBase instanceof Date && !Number.isNaN(model.dataBase.valueOf())
      ? model.dataBase.toISOString().slice(0,10)
      : null;

    const data = await rpc('publish_bi_snapshot', {
      p_dataset_type: 'epc15',
      p_file_name: fileName || 'dataset-local',
      p_file_size: Number.isFinite(fileSize) ? fileSize : null,
      p_file_last_modified: fileLastModified ? new Date(fileLastModified).toISOString() : null,
      p_data_base: dataBase,
      p_schema_version: cfg.schemaVersion || 'epc15_snapshot_v1',
      p_dataset: dataset,
      p_pb_manual: pbManual || {}
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function history(limit = 10) {
    const data = await rpc('list_bi_publications', {
      p_dataset_type: 'epc15',
      p_limit: Math.max(1, Math.min(50, Number(limit) || 10))
    });
    return Array.isArray(data) ? data : [];
  }

  async function listCoordinationWeeks() {
    const data = await rpc('list_coordination_weeks', {});
    return Array.isArray(data) ? data : [];
  }

  async function verifyCoordinationMaster(masterPassword, weekNo) {
    const clean=String(masterPassword || '');
    const args={
      p_master_password:clean,
      p_week_no:Number(weekNo)
    };
    const supabase=getClient();
    if(!supabase) throw new Error('Supabase ainda não está configurado.');
    const rpcName=hasCredentials() ? 'verify_coordination_master' : 'verify_coordination_master_public';
    if(hasCredentials()){
      args.p_username=credentials.username;
      args.p_password=credentials.password;
    }
    const {data,error}=await supabase.rpc(rpcName,args);
    if(error) throw new Error(error.message || 'Falha ao validar a senha master.');
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function loadCoordinationWeek(weekNo) {
    const data = await rpc('get_coordination_week', { p_week_no:Number(weekNo) });
    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (result?.snapshot?.dataset?.model) {
      result.snapshot.dataset.model = reviveModel(result.snapshot.dataset.model);
    }
    return result;
  }

  function isStatementTimeoutError(error) {
    const message=String(error?.message || error || '').toLocaleLowerCase('en-US');
    return message.includes('statement timeout') || message.includes('canceling statement');
  }

  function wait(ms) {
    return new Promise(resolve=>setTimeout(resolve,ms));
  }

  async function saveCoordinationWeek(payload) {
    if (!payload?.model) throw new Error('Nenhum Excel carregado para salvar nesta semana.');
    const dataBase = payload.model.dataBase instanceof Date && !Number.isNaN(payload.model.dataBase.valueOf())
      ? payload.model.dataBase.toISOString().slice(0,10)
      : null;
    const dataset = {
      schema_version: 'epc15_coordination_excel_v1',
      generated_at: new Date().toISOString(),
      model: payload.model
    };
    const masterPassword = String(payload.masterPassword || '');
    const args = {
      p_week_no: Number(payload.weekNo),
      p_excel_file_name: payload.excelFileName || null,
      p_excel_data_base: dataBase,
      p_schema_version: 'epc15_coordination_excel_v1',
      p_dataset: dataset,
      p_pb_manual: payload.pbManual || {}
    };
    let rpcName='save_coordination_excel_week';
    if(masterPassword){
      rpcName=hasCredentials() ? 'save_coordination_excel_week_master' : 'save_coordination_excel_week_master_public';
      args.p_master_password=masterPassword;
    }

    for (let attempt=0; attempt<2; attempt+=1) {
      try {
        let data;
        if(masterPassword && !hasCredentials()){
          const supabase=getClient();
          const result=await supabase.rpc(rpcName,args);
          if(result.error) throw new Error(result.error.message || 'Falha ao salvar a semana.');
          data=result.data;
        }else{
          data=await rpc(rpcName,args);
        }
        return typeof data === 'string' ? JSON.parse(data) : data;
      } catch(error) {
        if (attempt===0 && isStatementTimeoutError(error)) {
          await wait(900);
          continue;
        }
        throw error;
      }
    }
    throw new Error('O Supabase demorou para concluir o salvamento. Tente novamente.');
  }

  async function loadCoordinationManualWeek(weekNo) {
    const data = await rpc('get_coordination_manual_week', { p_week_no:Number(weekNo) });
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function saveCoordinationManualWeek(weekNo, pbManual, masterPassword='') {
    const cleanMaster=String(masterPassword || '');
    const args={
      p_week_no:Number(weekNo),
      p_pb_manual:pbManual || {}
    };
    if(cleanMaster) args.p_master_password=cleanMaster;

    let data;
    if(cleanMaster && !hasCredentials()){
      const supabase=getClient();
      const {data:result,error}=await supabase.rpc('save_coordination_manual_week_master_public',args);
      if(error) throw new Error(error.message || 'Falha ao salvar as configurações da semana.');
      data=result;
    }else{
      data=await rpc(
        cleanMaster ? 'save_coordination_manual_week_master' : 'save_coordination_manual_week',
        args
      );
    }
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function loadCoordinationLayout() {
    const data = await rpc('get_coordination_layout', {});
    return typeof data === 'string' ? JSON.parse(data) : (data || {});
  }

  async function saveCoordinationLayout({weekNo,layout,masterPassword}) {
    const args={
      p_master_password:String(masterPassword || ''),
      p_week_no:Number(weekNo),
      p_layout:layout || {}
    };
    let data;
    if(!hasCredentials()){
      const supabase=getClient();
      const {data:result,error}=await supabase.rpc('save_coordination_layout_master_public',args);
      if(error) throw new Error(error.message || 'Falha ao salvar o layout.');
      data=result;
    }else{
      data=await rpc('save_coordination_layout',args);
    }
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function photoRequest(method, payload, formData) {
    if (!ready()) throw new Error('Supabase ainda não está configurado.');
    const publicList=Boolean(payload?.action==='list');
    const masterFromPayload=String(payload?.master_password || formData?.get?.('master_password') || '');
    if (!hasCredentials() && !publicList && !masterFromPayload) {
      throw new Error('Entre como editor ou use a senha master para alterar fotos.');
    }
    const url = cfg.url.replace(/\/$/,'') + '/functions/v1/coordination-photos';
    let response;
    if (formData) {
      formData.set('username', credentials?.username || '');
      formData.set('password', credentials?.password || '');
      response = await fetch(url, { method, body:formData });
    } else {
      response = await fetch(url, {
        method,
        headers:{'Content-Type':'application/json','apikey':cfg.publishableKey},
        body:JSON.stringify({
          username:credentials?.username || '',
          password:credentials?.password || '',
          ...payload
        })
      });
    }
    let data={};
    try { data=await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data?.error || 'Falha ao acessar o registro fotográfico.');
    return data;
  }

  async function listCoordinationPhotos(weekNo, unitKey, phaseKey) {
    const data = await photoRequest('POST', {
      action:'list',
      week_no:Number(weekNo),
      unit_key:String(unitKey || ''),
      phase_key:String(phaseKey || '')
    });
    return Array.isArray(data?.photos) ? data.photos : [];
  }

  async function uploadCoordinationPhoto({weekNo,scope,file,masterPassword=''}) {
    if (!(file instanceof File)) throw new Error('Arquivo de foto inválido.');
    const form=new FormData();
    form.set('action','upload');
    form.set('week_no',String(Number(weekNo)));
    form.set('unit_name',String(scope.unitName || ''));
    form.set('unit_key',String(scope.unitKey || ''));
    form.set('phase_name',String(scope.phaseName || ''));
    form.set('phase_key',String(scope.phaseKey || ''));
    form.set('master_password',String(masterPassword || ''));
    form.set('file',file,file.name || 'foto');
    return photoRequest('POST',null,form);
  }

  async function replaceCoordinationPhoto({weekNo,photoId,scope,file,masterPassword}) {
    if (!(file instanceof File)) throw new Error('Arquivo de foto inválido.');
    const form=new FormData();
    form.set('action','replace');
    form.set('week_no',String(Number(weekNo)));
    form.set('photo_id',String(photoId||''));
    form.set('unit_name',String(scope.unitName || ''));
    form.set('unit_key',String(scope.unitKey || ''));
    form.set('phase_name',String(scope.phaseName || ''));
    form.set('phase_key',String(scope.phaseKey || ''));
    form.set('master_password',String(masterPassword||''));
    form.set('file',file,file.name || 'foto');
    return photoRequest('POST',null,form);
  }

  async function deleteCoordinationPhoto({weekNo,photoId,masterPassword}) {
    return photoRequest('DELETE', {
      week_no:Number(weekNo),
      photo_id:String(photoId||''),
      master_password:String(masterPassword||'')
    });
  }

  async function updateCoordinationPhotoCaption({weekNo,photoId,caption,masterPassword}) {
    return photoRequest('POST', {
      action:'caption',
      week_no:Number(weekNo),
      photo_id:String(photoId||''),
      caption:String(caption||''),
      master_password:String(masterPassword||'')
    });
  }

  window.CloudSync = {
    rpc,
    ready,
    setCredentials,
    clearCredentials,
    hasCredentials,
    verifyAccess,
    loadCurrent,
    publish,
    history,
    listCoordinationWeeks,
    verifyCoordinationMaster,
    loadCoordinationWeek,
    saveCoordinationWeek,
    loadCoordinationManualWeek,
    saveCoordinationManualWeek,
    loadCoordinationLayout,
    saveCoordinationLayout,
    listCoordinationPhotos,
    uploadCoordinationPhoto,
    replaceCoordinationPhoto,
    deleteCoordinationPhoto,
    updateCoordinationPhotoCaption,
    schemaVersion: cfg.schemaVersion || 'epc15_snapshot_v1'
  };
}());
