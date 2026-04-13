window.filesInit = async function () {
  const list   = document.getElementById('files-list');
  const banner = document.getElementById('files-banner');
  const scanResult = document.getElementById('scan-result');

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function showBanner(msg, type = 'error') {
    banner.innerHTML = `<div class="banner banner-${type}">${msg}</div>`;
    setTimeout(() => { banner.innerHTML = ''; }, 5000);
  }

  function fmt(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1024/1024).toFixed(1)} MB`;
  }

  async function loadData() {
    const ext = document.getElementById('f-ext').value;
    const tag = document.getElementById('f-tag').value;
    const params = new URLSearchParams();
    if (ext) params.set('ext', ext);
    if (tag) params.set('tag', tag);
    try {
      const rows = await apiFetch(`/api/files?${params}`);
      if (!rows.length) { list.innerHTML = '<p style="color:var(--text-muted)">No files indexed. Click Scan Directory.</p>'; return; }
      list.innerHTML = rows.map(r => `
        <div class="card" style="display:flex;gap:16px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="badge">${r.ext || '?'}</span>
              <strong style="word-break:break-all">${r.filename}</strong>
              <span style="font-size:0.75rem;color:var(--text-muted)">${fmt(r.size_bytes)}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;word-break:break-all">${r.filepath}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
            <select class="tag-sel" data-id="${r.id}" style="font-size:0.8rem;padding:4px 8px">
              <option value="keep"   ${r.tag==='keep'  ?'selected':''}>Keep</option>
              <option value="review" ${r.tag==='review'?'selected':''}>Review</option>
              <option value="delete" ${r.tag==='delete'?'selected':''}>Delete</option>
            </select>
            <button class="btn btn-danger btn-sm del-file" data-id="${r.id}">Delete File</button>
            <button class="btn btn-secondary btn-sm rm-index" data-id="${r.id}">Remove Index</button>
          </div>
        </div>`).join('');
    } catch (e) {
      list.innerHTML = `<div class="banner banner-error">${e.message}</div>`;
    }
  }

  document.getElementById('btn-scan').onclick = async () => {
    try {
      const { scanned } = await apiFetch('/api/files/scan', { method: 'POST' });
      scanResult.textContent = `Scanned ${scanned} file(s)`;
      await loadData();
    } catch (e) { showBanner(e.message); }
  };

  document.getElementById('btn-filter-files').onclick = loadData;

  list.addEventListener('change', async e => {
    if (!e.target.classList.contains('tag-sel')) return;
    const id  = e.target.dataset.id;
    const tag = e.target.value;
    try {
      await apiFetch(`/api/files/${id}/tag`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ tag }) });
    } catch (err) { showBanner(err.message); }
  });

  list.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('del-file')) {
      if (!confirm('Permanently delete this file from disk? This cannot be undone.')) return;
      try {
        await apiFetch(`/api/files/${id}/delete-file`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ confirm: true }) });
        showBanner('File deleted from disk.', 'success');
        await loadData();
      } catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('rm-index')) {
      try {
        await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
        await loadData();
      } catch (err) { showBanner(err.message); }
    }
  });

  await loadData();
};
