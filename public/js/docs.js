window.docsInit = async function () {
  const results    = document.getElementById('docs-results');
  const searchInput = document.getElementById('docs-search');
  const sectionSel  = document.getElementById('docs-section');
  const sourceSel   = document.getElementById('docs-source');

  async function apiFetch(url) {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  // Returns a coloured badge for non-personal sources; empty string for personal.
  function sourceBadge(source) {
    if (!source || source === 'personal') return '';
    const styles = {
      'xtool-official': 'color:#4a9eff;border:1px solid #4a9eff',
      'community':      'color:var(--accent2);border:1px solid var(--accent2)',
      'other':          'color:var(--text-muted);border:1px solid var(--border)',
    };
    const labels = {
      'xtool-official': 'xTool',
      'community':      'community',
      'other':          'other',
    };
    const style = styles[source] || '';
    const label = labels[source] || source;
    return `<span class="badge" style="${style}">${label}</span>`;
  }

  function renderDocs(rows) {
    if (!rows.length) { results.innerHTML = '<p style="color:var(--text-muted)">No results.</p>'; return; }
    results.innerHTML = rows.map(r => `
      <div class="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <span class="badge">${r.section}</span>
          <span class="card-title">${r.title}</span>
          ${sourceBadge(r.source)}
        </div>
        <div class="doc-body" data-id="${r.id}" style="color:var(--text-muted);font-size:0.875rem;cursor:pointer">
          ${r.body.slice(0, 140)}${r.body.length > 140 ? '… <span style="color:var(--accent)">show more</span>' : ''}
        </div>
        ${r.tags ? `<div style="margin-top:8px">${r.tags.split(',').map(t => `<span class="badge">${t.trim()}</span>`).join('')}</div>` : ''}
        ${r.source_url ? `<div style="margin-top:6px;font-size:0.8rem"><a href="${r.source_url}" target="_blank" rel="noopener" style="color:var(--text-muted)">Source ↗</a></div>` : ''}
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
    const source  = sourceSel.value;
    try {
      let rows;
      if (q) {
        // FTS search — source filter applied client-side since FTS MATCH doesn't support
        // additional WHERE clauses cleanly; the result set is small enough that this is fine.
        rows = await apiFetch(`/api/docs/search?q=${encodeURIComponent(q)}`);
        if (source) rows = rows.filter(r => r.source === source);
      } else {
        const params = new URLSearchParams();
        if (section) params.set('section', section);
        if (source)  params.set('source', source);
        const qs = params.toString() ? `?${params}` : '';
        rows = await apiFetch(`/api/docs${qs}`);
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
