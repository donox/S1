window.filesInit = async function () {
  const list       = document.getElementById('files-list');
  const scanResult = document.getElementById('scan-result');

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
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
      if (!rows.length) { list.innerHTML = '<p class="text-muted">No files indexed. Click Scan Directory.</p>'; return; }
      list.innerHTML = rows.map(r => `
        <div class="card mb-2">
          <div class="card-body py-2 d-flex gap-3 align-items-start">
            <div class="flex-grow-1 min-width-0">
              <div class="d-flex gap-2 align-items-center flex-wrap">
                <span class="badge text-bg-secondary">${r.ext || '?'}</span>
                <strong class="text-break">${r.filename}</strong>
                <span class="text-muted" style="font-size:0.75rem">${fmt(r.size_bytes)}</span>
              </div>
              <div class="text-muted text-break mt-1" style="font-size:0.75rem">${r.filepath}</div>
            </div>
            <div class="d-flex flex-column gap-1 flex-shrink-0">
              <select class="form-select form-select-sm tag-sel" data-id="${r.id}">
                <option value="keep"   ${r.tag==='keep'  ?'selected':''}>Keep</option>
                <option value="review" ${r.tag==='review'?'selected':''}>Review</option>
                <option value="delete" ${r.tag==='delete'?'selected':''}>Delete</option>
              </select>
              <button class="btn btn-danger btn-sm del-file" data-id="${r.id}">Delete File</button>
              <button class="btn btn-secondary btn-sm rm-index" data-id="${r.id}">Remove Index</button>
            </div>
          </div>
        </div>`).join('');
    } catch (e) {
      list.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  }

  document.getElementById('btn-scan').onclick = async () => {
    try {
      const { scanned } = await apiFetch('/api/files/scan', { method: 'POST' });
      scanResult.textContent = `Scanned ${scanned} file(s)`;
      await loadData();
    } catch (e) { window.showToast(e.message); }
  };

  document.getElementById('btn-filter-files').onclick = loadData;

  list.addEventListener('change', async e => {
    if (!e.target.classList.contains('tag-sel')) return;
    const id  = e.target.dataset.id;
    const tag = e.target.value;
    try {
      await apiFetch(`/api/files/${id}/tag`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ tag }) });
    } catch (err) { window.showToast(err.message); }
  });

  list.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('del-file')) {
      if (!confirm('Permanently delete this file from disk? This cannot be undone.')) return;
      try {
        await apiFetch(`/api/files/${id}/delete-file`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ confirm: true }) });
        window.showToast('File deleted from disk.', 'success');
        await loadData();
      } catch (err) { window.showToast(err.message); }
    }
    if (e.target.classList.contains('rm-index')) {
      try {
        await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
        await loadData();
      } catch (err) { window.showToast(err.message); }
    }
  });

  await loadData();
};
