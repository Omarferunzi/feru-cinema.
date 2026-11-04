(() => {
  'use strict';
  const PROJECT_KEY = 'feru-cinema-local-projects-v1';
  const DB_NAME = 'feru-cinema-local-db';
  const DB_VERSION = 1;
  const $ = (id) => document.getElementById(id);
  let projects = loadProjects();
  let deferredInstall = null;
  let toastTimer = 0;

  function loadProjects() {
    try {
      const value = JSON.parse(localStorage.getItem(PROJECT_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }
  function saveProjects() {
    try { localStorage.setItem(PROJECT_KEY, JSON.stringify(projects)); }
    catch { showToast('Storage is full. Export a backup and remove unused items.'); }
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB is unavailable in this browser.'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local asset storage.'));
    });
  }
  async function assetTransaction(mode, operation) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', mode);
      const store = tx.objectStore('assets');
      let result;
      try { result = operation(store); } catch (error) { db.close(); reject(error); return; }
      tx.oncomplete = () => { db.close(); resolve(result && result.result !== undefined ? result.result : result); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Asset storage failed.')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Asset storage was interrupted.')); };
    });
  }
  async function getAssets() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readonly');
      const request = tx.objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function formatProject(project) {
    return project.kind === 'Film'
      ? `${project.runtime} min feature`
      : `${project.episodes} episodes · ${project.episodeRuntime} min each`;
  }
  function projectCard(project, index) {
    const posterClass = project.kind === 'Series' ? 'poster series' : 'poster';
    const runtime = formatProject(project);
    return `<button class="project-card" data-open-project="${safeText(project.id)}"><div class="${posterClass}"><small>${project.kind === 'Film' ? 'FEATURE FILM' : 'ORIGINAL SERIES'}</small><b>${safeText(project.title)}</b><span>${safeText(project.genre || 'Uncategorised')} · ${safeText(runtime)}</span></div><div class="card-meta"><b>${safeText(project.title)}</b><small>${safeText(project.status || 'Development')} · ${Number(project.progress || 0)}% complete</small></div><div class="progress"><span style="width:${Math.max(0, Math.min(100, Number(project.progress || 0)))}%"></span></div></button>`;
  }
  function renderProjects() {
    const query = ($('project-search')?.value || '').trim().toLowerCase();
    const visible = projects.filter(p => `${p.title} ${p.genre} ${p.kind}`.toLowerCase().includes(query));
    $('recent-projects').innerHTML = projects.length
      ? projects.slice(0, 3).map(projectCard).join('')
      : '<div class="empty">Your production slate is empty. Create your first film or series to begin.</div>';
    $('all-projects').innerHTML = visible.length
      ? visible.map(projectCard).join('')
      : '<div class="empty">No productions found. Try another search or create a new production.</div>';
    $('production-count').textContent = `${visible.length} production${visible.length === 1 ? '' : 's'}`;
    const minutes = projects.reduce((sum, p) => sum + (p.kind === 'Film' ? Number(p.runtime || 0) : Number(p.episodeRuntime || 0) * Number(p.episodes || 0)), 0);
    $('stat-projects').textContent = String(projects.length).padStart(2, '0');
    $('stat-runtime').textContent = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  async function renderAssets() {
    try {
      const assets = await getAssets();
      $('stat-assets').textContent = String(assets.length).padStart(2, '0');
      $('asset-list').innerHTML = assets.length ? assets.sort((a, b) => b.addedAt - a.addedAt).map(asset => {
        const extension = asset.name.split('.').pop().toUpperCase().slice(0, 5);
        return `<article class="asset-card"><div class="asset-icon">${safeText(extension || 'FILE')}</div><b>${safeText(asset.name)}</b><small>${safeText(asset.type)} · ${safeText(asset.sizeLabel)}</small><small>Imported ${safeText(new Date(asset.addedAt).toLocaleDateString())}</small><button class="danger" data-delete-asset="${safeText(asset.id)}">Remove from library</button></article>`;
      }).join('') : '<div class="empty">No assets yet. Import files you own or have permission to use.</div>';
    } catch (error) {
      $('asset-list').innerHTML = `<div class="empty">${safeText(error.message)}</div>`;
      $('stat-assets').textContent = '—';
    }
  }
  function navigate(view) {
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    if (view === 'assets') renderAssets();
    $('main').focus({ preventScroll: true });
  }
  function openProject(id) {
    const project = projects.find(item => item.id === id);
    if (!project) return;
    $('detail-content').innerHTML = `<div class="dialog-head"><div><p class="eyebrow">PRODUCTION DETAILS</p><h2>${safeText(project.title)}</h2></div><button class="close" id="close-detail" aria-label="Close">×</button></div><div class="detail-row"><span>Format</span><b>${safeText(project.kind)}</b></div><div class="detail-row"><span>Runtime</span><b>${safeText(formatProject(project))}</b></div><div class="detail-row"><span>Genre</span><b>${safeText(project.genre || 'Not set')}</b></div><div class="detail-row"><span>Status</span><b>${safeText(project.status || 'Development')}</b></div><div class="detail-row"><span>Synopsis</span><b>${safeText(project.synopsis || 'No synopsis added.')}</b></div><label>Production status<select id="detail-status"><option>Development</option><option>Pre-production</option><option>In production</option><option>Post-production</option><option>Complete</option></select></label><label>Progress · <span id="progress-label">${Number(project.progress || 0)}%</span><input id="detail-progress" type="range" min="0" max="100" value="${Number(project.progress || 0)}"></label><div class="dialog-actions"><button class="danger" id="delete-project">Delete project</button><button class="primary" id="save-detail">Save changes</button></div>`;
    $('detail-dialog').showModal();
    $('detail-status').value = project.status || 'Development';
    $('detail-progress').addEventListener('input', e => $('progress-label').textContent = `${e.target.value}%`);
    $('close-detail').addEventListener('click', () => $('detail-dialog').close());
    $('save-detail').addEventListener('click', () => {
      project.status = $('detail-status').value;
      project.progress = Number($('detail-progress').value);
      saveProjects(); renderProjects(); $('detail-dialog').close(); showToast('Production updated on this device.');
    });
    $('delete-project').addEventListener('click', () => {
      if (!confirm(`Delete “${project.title}” from this device? This cannot be undone unless you have a backup.`)) return;
      projects = projects.filter(item => item.id !== id); saveProjects(); renderProjects(); $('detail-dialog').close(); showToast('Production deleted.');
    });
  }
  function openCreate() {
    $('project-form').reset();
    $('project-kind').value = 'Film';
    toggleProjectFields();
    $('form-error').textContent = '';
    $('project-dialog').showModal();
    $('project-title').focus();
  }
  function toggleProjectFields() {
    const series = $('project-kind').value === 'Series';
    $('film-fields').hidden = series;
    $('series-fields').hidden = !series;
  }
  function createProject(event) {
    event.preventDefault();
    const kind = $('project-kind').value;
    const title = $('project-title').value.trim();
    const runtime = Number(kind === 'Film' ? $('project-runtime').value : $('episode-runtime').value);
    const episodes = Number($('episode-count').value);
    let error = '';
    if (!title) error = 'Enter a production title.';
    else if (kind === 'Film' && (!Number.isInteger(runtime) || runtime < 40)) error = 'Feature films must be at least 40 minutes.';
    else if (kind === 'Series' && (!Number.isInteger(runtime) || runtime < 25 || !Number.isInteger(episodes) || episodes < 6)) error = 'Series need at least 6 episodes, each at least 25 minutes.';
    if (error) { $('form-error').textContent = error; return; }
    projects.unshift({ id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, kind, genre: $('project-genre').value.trim(), synopsis: $('project-synopsis').value.trim(), runtime: kind === 'Film' ? runtime : 0, episodeRuntime: kind === 'Series' ? runtime : 0, episodes: kind === 'Series' ? episodes : 0, status: 'Development', progress: 0, createdAt: Date.now() });
    saveProjects(); renderProjects(); $('project-dialog').close(); navigate('productions'); showToast('Production created and saved locally.');
  }
  async function importFiles(files) {
    if (!files?.length) return;
    let added = 0;
    try {
      for (const file of files) {
        const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const record = { id, name: file.name, type: classifyFile(file), size: file.size, sizeLabel: formatBytes(file.size), mime: file.type || 'application/octet-stream', addedAt: Date.now(), blob: file };
        await assetTransaction('readwrite', store => store.put(record));
        added++;
      }
      await renderAssets(); showToast(`${added} file${added === 1 ? '' : 's'} added to your local library.`);
    } catch (error) { showToast(`Import stopped: ${error.message}`); }
  }
  function classifyFile(file) {
    const name = file.name.toLowerCase();
    if (/\.(glb|gltf|obj|fbx)$/.test(name)) return '3D model';
    if (/\.(png|jpe?g|webp|tif?f)$/.test(name)) return 'Image / texture';
    if (/\.(wav|mp3|ogg|flac)$/.test(name)) return 'Audio';
    if (/\.(mp4|mov|webm)$/.test(name)) return 'Video reference';
    return 'Production file';
  }
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }
  async function deleteAsset(id) {
    if (!confirm('Remove this file from the FERU asset library?')) return;
    try { await assetTransaction('readwrite', store => store.delete(id)); await renderAssets(); showToast('Asset removed from library.'); }
    catch (error) { showToast(error.message); }
  }
  async function exportBackup() {
    try {
      const assets = await getAssets();
      const packed = [];
      for (const asset of assets) {
        const buffer = await asset.blob.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        packed.push({ id: asset.id, name: asset.name, type: asset.type, size: asset.size, sizeLabel: asset.sizeLabel, mime: asset.mime, addedAt: asset.addedAt, data: btoa(binary) });
      }
      const backup = { app: 'FERU CINEMA', formatVersion: 1, exportedAt: new Date().toISOString(), projects, assets: packed };
      downloadBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `feru-cinema-backup-${new Date().toISOString().slice(0, 10)}.json`);
      showToast('Backup exported. Keep a copy somewhere safe.');
    } catch (error) { showToast(`Backup failed: ${error.message}`); }
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function restoreBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'FERU CINEMA' || data.formatVersion !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.assets)) throw new Error('This is not a supported FERU CINEMA backup.');
      if (!confirm(`Restore ${data.projects.length} productions and ${data.assets.length} assets? Existing workspace data will be replaced.`)) return;
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('assets', 'readwrite'); const store = tx.objectStore('assets'); store.clear();
        for (const item of data.assets) {
          const binary = atob(item.data); const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          store.put({ ...item, blob: new Blob([bytes], { type: item.mime || 'application/octet-stream' }) });
        }
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close(); projects = data.projects; saveProjects(); renderProjects(); await renderAssets(); showToast('Backup restored on this device.');
    } catch (error) { showToast(`Restore failed: ${error.message}`); }
  }
  function updateConnection() {
    $('connection-label').textContent = navigator.onLine ? 'LOCAL WORKSPACE' : 'OFFLINE MODE';
  }
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
  document.querySelectorAll('[data-goto]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.goto)));
  $('new-project').addEventListener('click', openCreate);
  $('new-project-top').addEventListener('click', openCreate);
  $('project-kind').addEventListener('change', toggleProjectFields);
  $('project-form').addEventListener('submit', createProject);
  $('project-search').addEventListener('input', renderProjects);
  $('import-asset').addEventListener('click', () => $('asset-input').click());
  $('asset-input').addEventListener('change', event => { importFiles(event.target.files); event.target.value = ''; });
  $('backup-btn').addEventListener('click', exportBackup);
  $('restore-input').addEventListener('change', event => { if (event.target.files[0]) restoreBackup(event.target.files[0]); event.target.value = ''; });
  document.body.addEventListener('click', event => {
    const projectButton = event.target.closest('[data-open-project]');
    if (projectButton) openProject(projectButton.dataset.openProject);
    const assetButton = event.target.closest('[data-delete-asset]');
    if (assetButton) deleteAsset(assetButton.dataset.deleteAsset);
  });
  // Long-press is not required: use the Backup button menu via a second action on the same control.
  $('backup-btn').addEventListener('contextmenu', event => { event.preventDefault(); $('restore-input').click(); });
  $('backup-btn').title = 'Tap to export a backup. Long-press or right-click to restore one.';
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; $('install-btn').hidden = false; });
  $('install-btn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('install-btn').hidden = true;
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => showToast('Offline caching could not be enabled in this browser.')));
  }
  const initialView = location.hash.replace('#', '');
  navigate(['overview', 'productions', 'assets', 'standards'].includes(initialView) ? initialView : 'overview');
  renderProjects(); renderAssets(); updateConnection();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();
