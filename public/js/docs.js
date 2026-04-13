window.docsInit = async function () {
  const results = document.getElementById('docs-results');
  const searchInput = document.getElementById('docs-search');
  const sectionSel  = document.getElementById('docs-section');

  async function apiFetch(url) {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function renderDocs(rows) {
    if (!rows.length) { results.innerHTML = '<p style="color:var(--text-muted)">No results.</p>'; return; }
    results.innerHTML = rows.map(r => `
      <div class="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="badge">${r.section}</span>
          <span class="card-title">${r.title}</span>
        </div>
        <div class="doc-body" data-id="${r.id}" style="color:var(--text-muted);font-size:0.875rem;cursor:pointer">
          ${r.body.slice(0, 140)}${r.body.length > 140 ? '… <span style="color:var(--accent)">show more</span>' : ''}
        </div>
        ${r.tags ? `<div style="margin-top:8px">${r.tags.split(',').map(t => `<span class="badge">${t.trim()}</span>`).join('')}</div>` : ''}
      </div>`).join('');

    // Expand on click
    results.querySelectorAll('.doc-body').forEach((el, i) => {
      if (rows[i].body.length <= 140) return;
      el.addEventListener('click', () => {
        el.innerHTML = rows[i].body.replace(/\n/g, '<br>');
        el.style.cursor = 'default';
        el.style.color  = 'var(--text)';
      });
    });
  }

  async function load() {
    const q       = searchInput.value.trim();
    const section = sectionSel.value;
    try {
      let rows;
      if (q) {
        rows = await apiFetch(`/api/docs/search?q=${encodeURIComponent(q)}`);
      } else {
        const params = section ? `?section=${encodeURIComponent(section)}` : '';
        rows = await apiFetch(`/api/docs${params}`);
      }
      renderDocs(rows);
    } catch (e) {
      results.innerHTML = `<div class="banner banner-error">${e.message}</div>`;
    }
  }

  document.getElementById('docs-go').onclick = load;
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') load(); });

  await load();
};
