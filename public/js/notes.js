window.notesInit = async function () {
  const list   = document.getElementById('notes-list');
  const banner = document.getElementById('notes-banner');
  const STATUS_CYCLE = ['note', 'try', 'learned', 'note'];
  let currentFilter = '';

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function showBanner(msg, type = 'error') {
    banner.innerHTML = `<div class="banner banner-${type}">${msg}</div>`;
    setTimeout(() => { banner.innerHTML = ''; }, 4000);
  }

  const STATUS_LABEL = { note: 'Note', question: 'Question', try: 'Try This', learned: 'Learned ✓' };
  const STATUS_COLOR = { note: '#9a9aaa', question: '#f5a623', try: '#e94560', learned: '#27ae60' };

  async function loadData() {
    const url = currentFilter ? `/api/notes?status=${currentFilter}` : '/api/notes';
    try {
      const rows = await apiFetch(url);
      list.innerHTML = rows.map(r => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted)">${r.topic}</span>
              <div class="card-title" style="margin-top:2px">${r.content}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;margin-left:12px">
              <button class="btn btn-secondary btn-sm status-btn" data-id="${r.id}" data-status="${r.status}"
                style="color:${STATUS_COLOR[r.status]};border-color:${STATUS_COLOR[r.status]}">
                ${STATUS_LABEL[r.status]}
              </button>
              <button class="btn btn-danger btn-sm del-note" data-id="${r.id}">Del</button>
            </div>
          </div>
        </div>`).join('') || '<p style="color:var(--text-muted)">No notes yet.</p>';
    } catch (e) {
      list.innerHTML = `<div class="banner banner-error">${e.message}</div>`;
    }
  }

  document.getElementById('n-save').onclick = async () => {
    const payload = {
      topic:   document.getElementById('n-topic').value.trim(),
      content: document.getElementById('n-content').value.trim(),
      status:  document.getElementById('n-status').value,
    };
    if (!payload.topic || !payload.content) { showBanner('Topic and content are required.'); return; }
    try {
      await apiFetch('/api/notes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      document.getElementById('n-topic').value = '';
      document.getElementById('n-content').value = '';
      await loadData();
    } catch (e) { showBanner(e.message); }
  };

  document.getElementById('n-export').onclick = async () => {
    try {
      const rows = await apiFetch('/api/notes');
      const md = rows.map(r => `## [${STATUS_LABEL[r.status]}] ${r.topic}\n\n${r.content}`).join('\n\n---\n\n');
      await navigator.clipboard.writeText(md);
      showBanner('Copied to clipboard!', 'success');
    } catch (e) { showBanner(e.message); }
  };

  document.getElementById('notes-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
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
      catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('status-btn')) {
      const cur  = e.target.dataset.status;
      const next = STATUS_CYCLE[STATUS_CYCLE.indexOf(cur) + 1] || 'note';
      try {
        await apiFetch(`/api/notes/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: next }) });
        await loadData();
      } catch (err) { showBanner(err.message); }
    }
  });

  await loadData();
};
