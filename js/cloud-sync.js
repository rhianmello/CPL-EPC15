(function () {
  // Transporte Cloudflare (Task 6): Worker em POST /api/rpc/:name com Bearer.
  // Token/identidade em localStorage: epc15_cf_token, epc15_cf_email, epc15_cf_role.
  // Login via POST /api/auth/login {email,password}.
  // Assinaturas window.CloudSync.* e mensagens PT-BR de erro preservadas.
  const TOKEN_KEY = 'epc15_cf_token';
  const EMAIL_KEY = 'epc15_cf_email';
  const ROLE_KEY = 'epc15_cf_role';

  const cfCfg = window.EPC15_CLOUDFLARE_CONFIG || {};
  const apiBase = cfCfg.apiBase || window.__EPC15_API_BASE__ || 'http://127.0.0.1:8787';
  const schemaVersion = cfCfg.schemaVersion || 'epc15_snapshot_v1';

  // Leitura anônima: estes RPCs podem ser chamados sem Bearer. Todo o resto
  // (publish, save_*, upload/replace/delete, caption) exige login editor.
  const READ_ONLY_RPC = new Set([
    'verify_bi_access',
    'verify_coordination_master',
    'get_current_bi_snapshot',
    'list_bi_publications',
    'list_coordination_weeks',
    'get_coordination_week',
    'get_coordination_manual_week',
    'get_coordination_layout',
    'get_andaime_scenario',
    'list_andaime_scenarios'
  ]);

  let credentials = null;

  function storeGet(key) { try { return window.localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function storeSet(key, value) { try { window.localStorage.setItem(key, value); } catch (_) {} }
  function storeDel(key) { try { window.localStorage.removeItem(key); } catch (_) {} }

  function ready() {
    return Boolean(cfCfg.enabled !== false && apiBase);
  }

  function getToken() { return storeGet(TOKEN_KEY); }
  function hasToken() { return Boolean(getToken()); }
  function currentEmail() { return storeGet(EMAIL_KEY); }
  function currentRole() { return storeGet(ROLE_KEY); }

  function setCredentials(email, password) {
    credentials = { email: String(email || '').trim(), password: String(password || '') };
  }

  function clearCredentials() {
    storeDel(TOKEN_KEY);
    storeDel(EMAIL_KEY);
    storeDel(ROLE_KEY);
    credentials = null;
  }
  // Gate honesto: só há credencial válida com token em storage.
  function hasCredentials() { return hasToken(); }

  function safeParse(text, fallback) {
    try { return JSON.parse(text); } catch (_) { return fallback; }
  }

  function mapRpcError(data, fallbackMessage) {
    const code = data && data.code;
    let message = (data && data.error) || fallbackMessage || 'Falha de comunicação com a nuvem.';
    if (code === 'AUTH_REQUIRED') message = 'Informe o login do BI para continuar.';
    const error = new Error(message);
    if (code) error.code = code;
    return error;
  }

  async function apiPost(path, body, options) {
    const withAuth = !options || options.auth !== false;
    const headers = { 'Content-Type': 'application/json' };
    if (withAuth) {
      const token = getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
    }
    let response;
    try {
      response = await fetch(String(apiBase).replace(/\/$/, '') + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body || {})
      });
    } catch (_) {
      throw new Error('Falha de comunicação com a nuvem.');
    }
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw mapRpcError(data);
    return data;
  }

  async function login(email, password) {
    if (!ready()) throw new Error('Nuvem ainda não configurada.');
    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !password) {
      const validation = new Error('Informe email e senha.');
      validation.code = 'VALIDATION';
      throw validation;
    }
    let data;
    try {
      data = await apiPost('/api/auth/login', { email: cleanEmail, password: String(password) }, { auth: false });
    } catch (error) {
      clearCredentials();
      throw error;
    }
    if (!data || !data.token) {
      clearCredentials();
      const missing = new Error('Informe o login do BI para continuar.');
      missing.code = 'AUTH_REQUIRED';
      throw missing;
    }
    storeSet(TOKEN_KEY, data.token);
    storeSet(EMAIL_KEY, data.email || cleanEmail);
    storeSet(ROLE_KEY, data.role || '');
    setCredentials(cleanEmail, String(password));
    return { email: data.email || cleanEmail, role: data.role || '' };
  }

  async function logout() {
    if (getToken()) {
      try { await apiPost('/api/auth/logout', {}); } catch (_) {}
    }
    clearCredentials();
    return true;
  }

  async function rpc(name, args) {
    if (!ready()) throw new Error('Nuvem ainda não configurada.');
    if (!READ_ONLY_RPC.has(String(name))) {
      if (!hasCredentials()) throw new Error('Informe o login do BI para continuar.');
      if (!getToken()) throw new Error('Informe o login do BI para continuar.');
    }
    const data = await apiPost('/api/rpc/' + encodeURIComponent(name), args || {});
    return (typeof data === 'string') ? safeParse(data, data) : data;
  }

  async function verifyAccess(email, password) {
    if (!ready()) return null;
    setCredentials(email, password);
    try {
      await login(email, password);
      return true;
    } catch (error) {
      clearCredentials();
      if (error && error.code === 'AUTH_REQUIRED') return false;
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
      schema_version: schemaVersion,
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
      p_schema_version: schemaVersion,
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
    const result = (typeof data === 'string') ? safeParse(data, data) : data;
    // Senha master aposentada no Worker (sempre retorna {retired:true}).
    // O frontend ignora o master: a escrita continua protegida no servidor
    // por papel (só editor) e trava de semana (WEEK_LOCKED).
    if (result && result.retired) return { ok: true, retired: true, password_ok: true };
    return result;
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
    throw new Error('A nuvem demorou para concluir o salvamento. Tente novamente.');
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


  function formOr(formData, payload, keys) {
    for (const key of keys) {
      if (formData && typeof formData.get === 'function') {
        const value = formData.get(key);
        if (value !== null && value !== undefined && value !== '') return value;
      }
      if (payload && payload[key] !== undefined && payload[key] !== null && payload[key] !== '') return payload[key];
    }
    return undefined;
  }

  function fileToBase64(file) {
    return file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      return btoa(binary);
    });
  }

  async function photoRequest(method, payload, formData) {
    if (!ready()) throw new Error('Nuvem ainda não configurada.');
    if (!hasCredentials()) throw new Error('Informe o login do BI para acessar as fotos.');
    // Metadados das fotos via RPC (assinaturas list/upload/replace/delete/
    // caption inalteradas); os bytes saem pelo GET /api/photos/file/:id
    // no Worker (com Bearer).
    const action = String(
      (formData && typeof formData.get === 'function' && formData.get('action')) ||
      (payload && payload.action) ||
      (String(method || '').toUpperCase() === 'DELETE' ? 'delete' : 'list')
    ).toLowerCase();
    const weekNo = Number(formOr(formData, payload, ['week_no']));
    const unitKey = formOr(formData, payload, ['unit_key']);
    const unitName = formOr(formData, payload, ['unit_name']);
    const phaseKey = formOr(formData, payload, ['phase_key']);
    const phaseName = formOr(formData, payload, ['phase_name']);
    const photoId = String(formOr(formData, payload, ['photo_id', 'id']) || '');

    if (action === 'list') {
      const data = await rpc('list_coordination_photos', {
        week_no: weekNo,
        unit_key: unitKey === undefined ? undefined : String(unitKey),
        phase_key: phaseKey === undefined ? undefined : String(phaseKey)
      });
      const photos = Array.isArray(data) ? data : (Array.isArray(data && data.photos) ? data.photos : []);
      return { photos };
    }

    if (action === 'upload' || action === 'replace') {
      const file = (formData && typeof formData.get === 'function') ? formData.get('file') : null;
      if (!(file instanceof File)) throw new Error('Arquivo de foto inválido.');
      const fileBase64 = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';
      const scope = {
        unit_key: unitKey === undefined ? undefined : String(unitKey),
        unit_name: unitName === undefined ? undefined : String(unitName),
        phase_key: phaseKey === undefined ? undefined : String(phaseKey),
        phase_name: phaseName === undefined ? undefined : String(phaseName)
      };
      if (action === 'upload') {
        return rpc('upload_coordination_photo', {
          week_no: weekNo,
          ...scope,
          mime_type: mimeType,
          file_base64: fileBase64
        });
      }
      if (!photoId) throw new Error('Foto não encontrada.');
      return rpc('replace_coordination_photo', {
        photo_id: photoId,
        ...scope,
        mime_type: mimeType,
        file_base64: fileBase64
      });
    }

    if (action === 'caption') {
      if (!photoId) throw new Error('Foto não encontrada.');
      return rpc('set_coordination_photo_caption', {
        photo_id: photoId,
        caption: String(formOr(formData, payload, ['caption']) || '')
      });
    }

    if (!photoId) throw new Error('Foto não encontrada.');
    return rpc('delete_coordination_photo', { photo_id: photoId });
  }

  // Download de bytes da foto (Worker GET /api/photos/file/:id, Bearer,
  // retorna bytes + Content-Type). objectURLs ativos são revogados a cada
  // nova lista para não vazar memória entre trocas de semana/fase.
  let activePhotoUrls = [];
  function photoFileUrl(id) {
    return String(apiBase).replace(/\/$/, '') + '/api/photos/file/' + encodeURIComponent(String(id ?? ''));
  }
  function revokePhotoUrls() {
    for (const url of activePhotoUrls) {
      try { if (url && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(url); } catch (_) {}
    }
    activePhotoUrls = [];
  }
  async function fetchPhotoBytes(id) {
    if (!ready()) throw new Error('Nuvem ainda não configurada.');
    if (!hasCredentials()) throw new Error('Informe o login do BI para acessar as fotos.');
    if (id === undefined || id === null || id === '') throw new Error('Foto não encontrada.');
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    let response;
    try {
      response = await fetch(photoFileUrl(id), { method: 'GET', headers });
    } catch (_) {
      throw new Error('Falha de comunicação com a nuvem.');
    }
    if (!response.ok) {
      let code = '';
      try { code = (await response.clone().json()).code || ''; } catch (_) {}
      if (code === 'AUTH_REQUIRED') throw mapRpcError({ code, error: '' });
      const error = new Error(response.status === 404 ? 'Foto não encontrada.' : 'Falha de comunicação com a nuvem.');
      if (code) error.code = code;
      throw error;
    }
    const contentType = (response.headers && response.headers.get
      ? response.headers.get('content-type') : '') || '';
    let blob = null;
    try { blob = await response.blob(); }
    catch (_) {
      const buffer = await response.arrayBuffer();
      blob = new Blob([buffer], { type: contentType });
    }
    return { blob, contentType };
  }
  async function getPhotoUrl(id) {
    const { blob } = await fetchPhotoBytes(id);
    if (typeof URL === 'undefined' || !URL.createObjectURL) throw new Error('Falha de comunicação com a nuvem.');
    const url = URL.createObjectURL(blob);
    activePhotoUrls.push(url);
    return url;
  }

  async function listCoordinationPhotos(weekNo, unitKey, phaseKey) {
    const data = await photoRequest('POST', {
      action:'list',
      week_no:Number(weekNo),
      unit_key:String(unitKey || ''),
      phase_key:String(phaseKey || '')
    });
    const photos = Array.isArray(data?.photos) ? data.photos : [];
    // Hidrata o campo lido pelo <img> em pb-dashboard (photo.signed_url)
    // com os bytes de GET /api/photos/file/:id (Bearer) via objectURL.
    revokePhotoUrls();
    await Promise.all(photos.map(async (photo) => {
      try {
        photo.signed_url = await getPhotoUrl(photo?.id);
      } catch (_) {
        photo.signed_url = '';
      }
    }));
    return photos;
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
    void masterPassword;
    if (!(file instanceof File)) throw new Error('Arquivo de foto inválido.');
    const form=new FormData();
    form.set('action','replace');
    form.set('week_no',String(Number(weekNo)));
    form.set('photo_id',String(photoId||''));
    form.set('unit_name',String(scope.unitName || ''));
    form.set('unit_key',String(scope.unitKey || ''));
    form.set('phase_name',String(scope.phaseName || ''));
    form.set('phase_key',String(scope.phaseKey || ''));
    form.set('file',file,file.name || 'foto');
    return photoRequest('POST',null,form);
  }

  async function deleteCoordinationPhoto({weekNo,photoId,masterPassword}) {
    void weekNo;
    void masterPassword;
    return photoRequest('DELETE', {
      week_no:Number(weekNo),
      photo_id:String(photoId||'')
    });
  }

  async function updateCoordinationPhotoCaption({weekNo,photoId,caption,masterPassword}) {
    void weekNo;
    void masterPassword;
    return photoRequest('POST', {
      action:'caption',
      week_no:Number(weekNo),
      photo_id:String(photoId||''),
      caption:String(caption||'')
    });
  }

  window.CloudSync = {
    rpc,
    ready,
    login,
    logout,
    hasToken,
    currentEmail,
    currentRole,
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
    getPhotoUrl,
    fetchPhotoBytes,
    photoFileUrl,
    uploadCoordinationPhoto,
    replaceCoordinationPhoto,
    deleteCoordinationPhoto,
    updateCoordinationPhotoCaption,
    schemaVersion
  };
}());
