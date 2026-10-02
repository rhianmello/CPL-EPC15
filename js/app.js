(function () {
  const input = document.getElementById('excel-input');
  const upload = document.getElementById('upload-view');
  const app = document.getElementById('app-shell');
  const loading = document.getElementById('loading');
  const loadingTitle = document.getElementById('loading-title');
  const loadingDetail = document.getElementById('loading-detail');
  const errorBox = document.getElementById('upload-error');
  const openEpc = document.getElementById('open-epc-dashboard');
  const openRundown = document.getElementById('open-rundown-dashboard');
  const loginGate = document.getElementById('login-gate');
  const loginForm = document.getElementById('login-form');
  const loginUser = document.getElementById('login-user');
  const loginPass = document.getElementById('login-pass');
  const loginError = document.getElementById('login-error');
  const loginCancel = document.getElementById('login-cancel');
  const homeAvatar = document.getElementById('home-avatar');
  const historyToggle = document.getElementById('home-history-toggle');
  const historyList = document.getElementById('home-history-list');
  let historyLoaded = false;
  const selectDashboard = document.getElementById('select-excel-dashboard');
  const selectEmpty = document.getElementById('select-excel-empty');
  const emptyState = document.getElementById('dashboard-empty');
  const sourceStatus = document.getElementById('source-status');
  const publishButton = document.getElementById('publish-update');
  const publishedButton = document.getElementById('use-published');
  const AUTH_KEY = 'bi_epc15_basic_auth';

  let pendingAccess = null;
  let hasData = false;
  let currentModel = null;
  let currentFile = null;
  let currentPublication = null;

  // Autenticação direta no Supabase pelas RPCs protegidas do BI.
  (function syncLoginLabels() {
    const hint = loginGate?.querySelector('p');
    if (hint) hint.textContent = 'Informe usuário e senha para acessar o painel.';
    const userLabel = loginGate?.querySelector('label[for="login-user"]');
    if (userLabel) userLabel.textContent = 'Usuário';
    if (loginUser) loginUser.placeholder = 'Admin';
    if (loginError) loginError.textContent = 'Usuário ou senha incorretos.';
  })();

  function cloudReady() { return Boolean(window.CloudSync?.ready?.()); }

  function isAuthenticated() {
    if (sessionStorage.getItem(AUTH_KEY) !== '1') return false;
    return !cloudReady() || Boolean(window.CloudSync?.hasCredentials?.());
  }

  function setSource(text, tone = 'neutral') {
    if (!sourceStatus) return;
    sourceStatus.textContent = text;
    sourceStatus.dataset.tone = tone;
  }

  function setLoading(title, detail) {
    if (loadingTitle) loadingTitle.textContent = title;
    if (loadingDetail) loadingDetail.textContent = detail;
  }

  function showLoading(title, detail) {
    setLoading(title, detail);
    loading.classList.remove('hidden');
  }

  function hideLoading() { loading.classList.add('hidden'); }

  function requestAccess(action) {
    if (isAuthenticated()) {
      loginGate?.classList.add('hidden');
      Promise.resolve(action()).catch(console.error);
      return;
    }
    pendingAccess = action;
    loginError?.classList.add('hidden');
    loginGate?.classList.remove('hidden');
    setTimeout(() => loginUser?.focus(), 0);
  }

  function closeLogin() {
    pendingAccess = null;
    loginGate?.classList.add('hidden');
    if (loginPass) loginPass.value = '';
    if (loginError) loginError.classList.add('hidden');
  }

  function openDashboard() {
    upload.classList.add('hidden');
    app.classList.remove('hidden');
    Dashboard.showPage('executive');
  }

  function backToPortal() {
    Presentation?.close?.();
    app.classList.add('hidden');
    upload.classList.remove('hidden');
    window.scrollTo({top:0,left:0,behavior:'auto'});
  }

  function publicationLabel(publication) {
    if (!publication) return 'Fonte atual: versão publicada';
    const when = publication.published_at
      ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(publication.published_at))
      : '';
    const version = publication.version_no ? 'V' + publication.version_no : '';
    return ['Fonte atual: versão publicada', version, when].filter(Boolean).join(' • ');
  }

  function applyModel(model, fileMeta, options = {}) {
    currentModel = model;
    currentFile = fileMeta || {};
    currentPublication = options.publication || null;
    Dashboard.init(model, currentFile.name || options.publication?.file_name || 'Versão publicada');
    hasData = true;
    if (options.origin === 'local') {
      window.CoordinationWeek?.useLiveExcel?.();
    }
    emptyState?.classList.add('hidden');
    if (publishButton) publishButton.disabled = !cloudReady();

    if (options.origin === 'published') {
      setSource(publicationLabel(options.publication), 'cloud');
    } else {
      const name = currentFile.name || 'Excel local';
      setSource('Fonte atual: Excel local • ' + name + ' • ainda não publicado', 'local');
    }
  }

  async function loadPublished({ keepLocalOnError = true } = {}) {
    if (!cloudReady()) {
      setSource(hasData ? sourceStatus.textContent : 'Nuvem ainda não configurada • use o Excel local', 'warning');
      return false;
    }
    // Leitura anônima: não exige login.

    showLoading('Carregando versão publicada...', 'Buscando o snapshot atual na nuvem.');
    try {
      const result = await window.CloudSync.loadCurrent();
      if (!result) {
        if (!hasData) setSource('Nenhuma versão publicada na nuvem', 'warning');
        return false;
      }
      applyModel(result.model, {
        name: result.publication.file_name,
        size: result.publication.file_size,
        lastModified: result.publication.file_last_modified
      }, { origin:'published', publication:result.publication });
      openDashboard();
      return true;
    } catch (error) {
      if (!hasData || !keepLocalOnError) setSource('Nuvem indisponível • carregue o Excel local', 'error');
      else setSource('Nuvem indisponível • mantendo o Excel local já carregado', 'warning');
      console.error(error);
      return false;
    } finally {
      hideLoading();
    }
  }

  async function openEpcDashboard() {
    openDashboard();
    if (!hasData) await loadPublished();
  }

  async function load(file) {
    errorBox.classList.add('hidden');
    showLoading('Analisando o arquivo...', 'Validando abas, hierarquia, curvas e indicadores.');
    try {
      await new Promise(resolve => setTimeout(resolve, 30));
      const parsed = await ExcelReader.readWorkbook(file);
      const model = DataModel.buildDataModel(parsed);
      applyModel(model, {
        name:file.name,
        size:file.size,
        lastModified:file.lastModified
      }, { origin:'local' });
      openDashboard();
    } catch (error) {
      errorBox.textContent = error.message || 'Erro inesperado ao processar o arquivo.';
      errorBox.classList.remove('hidden');
      openDashboard();
    } finally {
      hideLoading();
      input.value='';
    }
  }

  async function publishCurrent() {
    if (!currentModel) return;
    if (!cloudReady()) {
      setSource('Nuvem ainda não configurada • publicação indisponível', 'warning');
      return;
    }
    showLoading('Publicando atualização...', 'Gravando uma nova versão sem apagar o histórico.');
    publishButton.disabled = true;
    try {
      const publication = await window.CloudSync.publish({
        model: currentModel,
        fileName: currentFile?.name || currentPublication?.file_name || 'dataset-local',
        fileSize: Number(currentFile?.size ?? currentPublication?.file_size),
        fileLastModified: currentFile?.lastModified || currentPublication?.file_last_modified || null,
        pbManual: {}
      });
      currentPublication = publication;
      setSource(publicationLabel(publication), 'cloud');
    } catch (error) {
      setSource('Falha ao publicar • os dados locais foram preservados', 'error');
      console.error(error);
    } finally {
      publishButton.disabled = !cloudReady();
      hideLoading();
    }
  }

  input.addEventListener('change', event => {
    const file=event.target.files?.[0];
    if(file) load(file);
  });

  // O Supabase protege leitura e escrita pelas mesmas credenciais do BI.
  openEpc?.addEventListener('click', () => requestAccess(openEpcDashboard));
  openRundown?.addEventListener('click', event => {
    event.preventDefault();
    const href = openRundown.href;
    requestAccess(() => { window.location.href = href; });
  });

  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const user = (loginUser?.value || '').trim();
    const pass = loginPass?.value || '';
    let valid = false;

    if (cloudReady()) {
      try {
        valid = await window.CloudSync.verifyAccess(user, pass);
      } catch (error) {
        valid = false;
        setSource('Não foi possível validar o acesso no Supabase', 'error');
        console.error(error);
      }
    } else {
      valid = false;
      setSource('Supabase não configurado • autenticação indisponível', 'error');
    }

    if (valid) {
      sessionStorage.setItem(AUTH_KEY, '1');
      loginGate?.classList.add('hidden');
      loginError?.classList.add('hidden');
      if (loginPass) loginPass.value = '';
      const action = pendingAccess;
      pendingAccess = null;
      if (action) await action();
    } else {
      loginError?.classList.remove('hidden');
      loginPass?.select();
    }
  });

  loginCancel?.addEventListener('click', closeLogin);

  homeAvatar?.addEventListener('click', () => requestAccess(openEpcDashboard));

  historyToggle?.addEventListener('click', async () => {
    const expanded = historyToggle.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      historyToggle.setAttribute('aria-expanded', 'false');
      historyList?.classList.add('hidden');
      return;
    }
    historyToggle.setAttribute('aria-expanded', 'true');
    historyList?.classList.remove('hidden');
    if (historyLoaded || !historyList) return;
    historyToggle.disabled = true;
    try {
      const items = cloudReady() ? await window.CloudSync.history(8) : [];
      historyLoaded = true;
      historyList.innerHTML = '';
      if (!items.length) {
        const li = document.createElement('li');
        li.textContent = cloudReady()
          ? 'Nenhuma publicação encontrada na nuvem.'
          : 'Nuvem ainda não configurada • o histórico aparece após a primeira publicação.';
        historyList.appendChild(li);
      } else {
        for (const item of items) {
          const li = document.createElement('li');
          const when = item.published_at
            ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.published_at))
            : '';
          const meta = document.createElement('small');
          meta.textContent = ['V' + (item.version_no ?? '?'), item.file_name, when].filter(Boolean).join(' • ');
          const open = document.createElement('button');
          open.type = 'button';
          open.className = 'btn-ghost';
          open.textContent = 'Abrir versão atual →';
          open.addEventListener('click', openEpcDashboard);
          li.appendChild(meta);
          li.appendChild(open);
          historyList.appendChild(li);
        }
      }
    } catch (error) {
      historyList.innerHTML = '';
      const li = document.createElement('li');
      li.textContent = 'Histórico indisponível • verifique a conexão com a nuvem.';
      historyList.appendChild(li);
      console.error(error);
    } finally {
      historyToggle.disabled = false;
    }
  });
  // Importar/publicar também usam o mesmo acesso do Supabase.
  selectDashboard?.addEventListener('click', () => requestAccess(() => input.click()));
  selectEmpty?.addEventListener('click', () => requestAccess(() => input.click()));
  document.getElementById('back-home')?.addEventListener('click', backToPortal);
  publishButton?.addEventListener('click', () => requestAccess(publishCurrent));
  publishedButton?.addEventListener('click', () => requestAccess(() => loadPublished({keepLocalOnError:true})));

  document.addEventListener('click', event => {
    const page = event.target.closest('[data-page]')?.dataset.page;
    const unitIndex = event.target.closest('[data-unit-index]')?.dataset.unitIndex;
    if (page) {
      if (!hasData && page !== 'executive') return;
      Dashboard.showPage(page);
    }
    if (unitIndex != null && hasData) Dashboard.renderUnit(Number(unitIndex));
    if (event.target.closest('[data-action="presentation-executive"]') && hasData) Presentation.open('gerencial');
    if (event.target.closest('[data-action="presentation-coordination"]') && hasData) Presentation.open('coordination');
  });

  document.getElementById('sort-units').addEventListener('click', () => { if (hasData) Dashboard.toggleSort(); });
  document.getElementById('unit-phase-filter')?.addEventListener('change', event => Dashboard.setPhaseFilter(event.target.value));
  document.getElementById('prev-slide').addEventListener('click', Presentation.previous);
  document.getElementById('next-slide').addEventListener('click', Presentation.next);
  document.getElementById('close-presentation').addEventListener('click', Presentation.close);
  document.getElementById('fullscreen').addEventListener('click', Presentation.fullscreen);
  document.getElementById('export-pdf').addEventListener('click', PDFExport.exportPDF);
  document.addEventListener('keydown', Presentation.onKey);

  window.EPC15State = {
    hasData: () => hasData,
    getCurrentModel: () => currentModel,
    getCurrentFile: () => currentFile ? { ...currentFile } : null,
    getCurrentPublication: () => currentPublication ? { ...currentPublication } : null
  };

  setSource(
    cloudReady()
      ? 'Pronto • Supabase conectado • entre para carregar ou publicar dados'
      : 'Nuvem ainda não configurada • Excel local disponível',
    cloudReady() ? 'cloud' : 'neutral'
  );
}());
