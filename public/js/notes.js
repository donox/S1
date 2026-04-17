window.notesInit = async function () {
  const list   = document.getElementById('notes-list');
  const STATUS_CYCLE = ['note', 'try', 'learned', 'note'];
  let currentFilter = '';

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  const STATUS_LABEL = { note: 'Note', question: 'Question', try: 'Try This', learned: 'Learned ✓' };
  const STATUS_BS    = { note: 'text-bg-secondary', question: 'text-bg-warning', try: 'text-bg-danger', learned: 'text-bg-success' };

  async function loadData() {
    const url = currentFilter ? `/api/notes?status=${currentFilter}` : '/api/notes';
    try {
      const rows = await apiFetch(url);
      list.innerHTML = rows.map(r => `
        <div class="card mb-2">
          <div class="card-body py-2">
            <div class="d-flex justify-content-between align-items-start gap-3">
              <div class="flex-grow-1">
                <div class="text-muted" style="font-size:0.75rem">${r.topic}</div>
                <div class="small mt-1">${r.content}</div>
              </div>
              <div class="d-flex gap-1 align-items-center flex-shrink-0">
                <button class="btn btn-sm ${STATUS_BS[r.status] || 'btn-secondary'} status-btn"
                        data-id="${r.id}" data-status="${r.status}">
                  ${STATUS_LABEL[r.status]}
                </button>
                <button class="btn btn-danger btn-sm del-note" data-id="${r.id}">Del</button>
              </div>
            </div>
          </div>
        </div>`).join('') || '<p class="text-muted">No notes yet.</p>';
    } catch (e) {
      list.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  }

  document.getElementById('n-save').onclick = async () => {
    const payload = {
      topic:   document.getElementById('n-topic').value.trim(),
      content: document.getElementById('n-content').value.trim(),
      status:  document.getElementById('n-status').value,
    };
    if (!payload.topic || !payload.content) { window.showToast('Topic and content are required.'); return; }
    try {
      await apiFetch('/api/notes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      document.getElementById('n-topic').value = '';
      document.getElementById('n-content').value = '';
      await loadData();
    } catch (e) { window.showToast(e.message); }
  };

  document.getElementById('n-export').onclick = async () => {
    try {
      const rows = await apiFetch('/api/notes');
      const md = rows.map(r => `## [${STATUS_LABEL[r.status]}] ${r.topic}\n\n${r.content}`).join('\n\n---\n\n');
      await navigator.clipboard.writeText(md);
      window.showToast('Copied to clipboard!', 'success');
    } catch (e) { window.showToast(e.message); }
  };

  document.getElementById('notes-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.nav-link');
    if (!btn) return;
    document.querySelectorAll('#notes-tabs .nav-link').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    loadData();
  });

  list.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('del-note')) {
      if (!confirm('Delete this note?')) return;
      try { await apiFetch(`/api/notes/${id}`, { method: 'DELETE' }); await loadData(); }
      catch (err) { window.showToast(err.message); }
    }
    if (e.target.classList.contains('status-btn')) {
      const cur  = e.target.dataset.status;
      const next = STATUS_CYCLE[STATUS_CYCLE.indexOf(cur) + 1] || 'note';
      try {
        await apiFetch(`/api/notes/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: next }) });
        await loadData();
      } catch (err) { window.showToast(err.message); }
    }
  });

  await loadData();
};
