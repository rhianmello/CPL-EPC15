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

  async function rpc(name, args) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase ainda não está configurado.');
    if (!hasCredentials()) throw new Error('Informe o login do BI para acessar a versão publicada.');
    const { data, error } = await supabase.rpc(name, {
      p_username: credentials.username,
      p_password: credentials.password,
      ...args
    });
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
    const data = await rpc('verify_coordination_master', {
      p_master_password: String(masterPassword || ''),
      p_week_no: Number(weekNo)
    });
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
    const args = {
      p_week_no: Number(payload.weekNo),
      p_excel_file_name: payload.excelFileName || null,
      p_excel_data_base: dataBase,
      p_schema_version: 'epc15_coordination_excel_v1',
      p_dataset: dataset,
      p_pb_manual: payload.pbManual || {}
    };

    for (let attempt=0; attempt<2; attempt+=1) {
      try {
        const data=await rpc('save_coordination_excel_week',args);
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

  async function saveCoordinationManualWeek(weekNo, pbManual) {
    const data = await rpc('save_coordination_manual_week', {
      p_week_no:Number(weekNo),
      p_pb_manual:pbManual || {}
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function loadCoordinationLayout() {
    const data = await rpc('get_coordination_layout', {});
    return typeof data === 'string' ? JSON.parse(data) : (data || {});
  }

  async function saveCoordinationLayout({weekNo,layout,masterPassword}) {
    const data = await rpc('save_coordination_layout', {
      p_master_password:String(masterPassword || ''),
      p_week_no:Number(weekNo),
      p_layout:layout || {}
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function photoRequest(method, payload, formData) {
    if (!ready()) throw new Error('Supabase ainda não está configurado.');
    if (!hasCredentials()) throw new Error('Informe o login do BI para acessar as fotos.');
    const url = cfg.url.replace(/\/$/,'') + '/functions/v1/coordination-photos';
    let response;
    if (formData) {
      formData.set('username', credentials.username);
      formData.set('password', credentials.password);
      response = await fetch(url, { method, body:formData });
    } else {
      response = await fetch(url, {
        method,
        headers:{'Content-Type':'application/json','apikey':cfg.publishableKey},
        body:JSON.stringify({ username:credentials.username, password:credentials.password, ...payload })
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

  async function uploadCoordinationPhoto({weekNo,scope,file}) {
    if (!(file instanceof File)) throw new Error('Arquivo de foto inválido.');
    const form=new FormData();
    form.set('action','upload');
    form.set('week_no',String(Number(weekNo)));
    form.set('unit_name',String(scope.unitName || ''));
    form.set('unit_key',String(scope.unitKey || ''));
    form.set('phase_name',String(scope.phaseName || ''));
    form.set('phase_key',String(scope.phaseKey || ''));
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
