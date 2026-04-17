window.docsInit = async function () {
  const results     = document.getElementById('docs-results');
  const searchInput = document.getElementById('docs-search');
  const sectionSel  = document.getElementById('docs-section');
  const sourceSel   = document.getElementById('docs-source');

  async function apiFetch(url) {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function sourceBadge(source) {
    if (!source || source === 'personal') return '';
    const cls = {
      'xtool-official': 'text-info border border-info',
      'community':      'text-warning border border-warning',
      'other':          'text-secondary border border-secondary',
    };
    const labels = {
      'xtool-official': 'xTool',
      'community':      'community',
      'other':          'other',
    };
    return `<span class="badge bg-transparent ${cls[source] || 'text-secondary border'}">${labels[source] || source}</span>`;
  }

  function renderDocs(rows) {
    if (!rows.length) { results.innerHTML = '<p class="text-muted">No results.</p>'; return; }
    results.innerHTML = rows.map(r => `
      <div class="card mb-2">
        <div class="card-body py-2">
          <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
            <span class="badge text-bg-secondary">${r.section}</span>
            <span class="fw-semibold small">${r.title}</span>
            ${sourceBadge(r.source)}
          </div>
          <div class="doc-body text-muted small clickable" data-id="${r.id}">
            ${r.body.slice(0, 140)}${r.body.length > 140 ? '… <span class="text-primary">show more</span>' : ''}
          </div>
          ${r.tags ? `<div class="mt-2 d-flex gap-1 flex-wrap">${r.tags.split(',').map(t => `<span class="badge bg-transparent border text-muted">${t.trim()}</span>`).join('')}</div>` : ''}
          ${r.source_url ? `<div class="mt-1" style="font-size:0.8rem"><a href="${r.source_url}" target="_blank" rel="noopener" class="text-muted">Source ↗</a></div>` : ''}
        </div>
      </div>`).join('');

    // Expand/collapse on click
    results.querySelectorAll('.doc-body').forEach((el, i) => {
      if (rows[i].body.length <= 140) return;
      const preview = `${rows[i].body.slice(0, 140)}… <span class="text-primary">show more</span>`;
      const full    = `${rows[i].body.replace(/\n/g, '<br>')} <span class="text-primary">show less</span>`;
      el.addEventListener('click', () => {
        const expanded = el.dataset.expanded === '1';
        el.innerHTML        = expanded ? preview : full;
        el.dataset.expanded = expanded ? '0' : '1';
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
      results.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  }

  document.getElementById('docs-go').onclick = load;
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') load(); });

  // ── Semantic search ───────────────────────────────────────────────
  const semanticInput  = document.getElementById('docs-semantic');
  const semanticStatus = document.getElementById('docs-semantic-status');

  async function loadSimilar() {
    const q = semanticInput.value.trim();
    if (!q) return;
    semanticStatus.textContent = 'Searching…';
    try {
      const rows = await apiFetch(`/api/docs/similar?context=${encodeURIComponent(q)}&limit=8`);
      if (!rows.length) {
        semanticStatus.textContent = 'No matches above threshold.';
        results.innerHTML = '';
        return;
      }
      semanticStatus.textContent = `${rows.length} result${rows.length !== 1 ? 's' : ''}`;
      renderDocs(rows);
    } catch (e) {
      semanticStatus.textContent = 'Ollama unavailable — semantic search requires ollama running.';
      results.innerHTML = '';
    }
  }

  document.getElementById('docs-semantic-go').onclick = loadSimilar;
  semanticInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSimilar(); });

  await load();
};
