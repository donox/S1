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

  // ── Candidates ────────────────────────────────────────────────────
  const candidatesWrap = document.getElementById('doc-candidates-wrap');

  // Bookmarklet href — posts page title, url, and body text to local server
  const bookmarklet = `javascript:(()=>{const t=document.title,u=location.href,x=document.body.innerText;fetch('http://localhost:3000/api/docs/candidates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t,url:u,raw_text:x})}).then(r=>r.json()).then(d=>alert('Clipped! id='+d.id)).catch(()=>alert('Clip failed — is the xTool app running?'));})();`;

  const SECTIONS = ['Overview','Modes','Operating Params','Safety','Techniques','File Management'];

  const CLIP_SOURCES = [
    {
      label: 'xTool Official',
      links: [
        { title: 'xTool S1 product page & specs',             url: 'https://www.xtool.com/products/xtool-s1-laser-engraver' },
        { title: 'xTool Learning Center',                     url: 'https://www.xtool.com/pages/learning' },
        { title: 'xTool blog — tips & projects',              url: 'https://www.xtool.com/blogs/news' },
        { title: 'xTool YouTube channel',                     url: 'https://www.youtube.com/@xTool' },
      ],
    },
    {
      label: 'Community — wood engraving & settings',
      links: [
        { title: 'r/diodeLasers — Reddit',                    url: 'https://www.reddit.com/r/diodeLasers/' },
        { title: 'r/lasercutting — Reddit',                   url: 'https://www.reddit.com/r/lasercutting/' },
        { title: 'Diode Laser Nation — YouTube (settings, tips)', url: 'https://www.youtube.com/@DiodeLaserNation' },
        { title: 'Laser Everything — YouTube',                url: 'https://www.youtube.com/@LaserEverything' },
        { title: 'Makers Nook — YouTube (xTool focused)',     url: 'https://www.youtube.com/@MakersNook' },
        { title: 'Diode Laser Nation — website',              url: 'https://diodelaernation.com' },
      ],
    },
    {
      label: 'Techniques — wood prep & finishing',
      links: [
        { title: 'Wood finishing for laser — Woodworkers Guild', url: 'https://www.wwgoa.com/article/laser-engraving-wood/' },
        { title: 'Masking tape for clean edges — common technique', url: 'https://www.reddit.com/r/lasercutting/search/?q=masking+tape+wood' },
        { title: 'Baking soda pre-treatment — dark engraving',  url: 'https://www.reddit.com/r/diodeLasers/search/?q=baking+soda' },
      ],
    },
    {
      label: 'Software & files',
      links: [
        { title: 'LightBurn documentation',                   url: 'https://docs.lightburnsoftware.com' },
        { title: 'xTool Creative Space (XCS) help center',    url: 'https://support.xtool.com/hc/en-us' },
        { title: 'Inkscape tutorials (vectorization)',         url: 'https://inkscape.org/learn/tutorials/' },
      ],
    },
  ];

  async function loadCandidates() {
    const rows = await fetch('/api/docs/candidates').then(r => r.json()).catch(() => []);
    const count = rows.length;

    candidatesWrap.innerHTML = `
      <details ${count ? 'open' : ''}>
        <summary class="text-muted small fw-bold text-uppercase clickable mb-2"
                 style="letter-spacing:0.06em;list-style:none;padding:6px 0;user-select:none">
          ▶ Page Clips ${count ? `<span class="badge text-bg-warning ms-1">${count} pending</span>` : ''}
        </summary>
        <div class="card card-body mb-3">

          <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
            <span class="small text-muted">Bookmarklet (auto-clips any page):</span>
            <a class="btn btn-secondary btn-sm" href="${bookmarklet}">📎 Clip to xTool Guide</a>
            <span class="small text-muted">or paste text manually:</span>
            <button class="btn btn-outline-secondary btn-sm" id="paste-clip-toggle">Paste text…</button>
            <button class="btn btn-outline-info btn-sm ms-auto" id="clip-help-btn"
                    data-bs-toggle="modal" data-bs-target="#clipHelpModal">? How to clip</button>
          </div>

          <div id="paste-clip-form" class="d-none mb-3 border rounded p-3">
            <div class="row g-2 mb-2">
              <div class="col-md">
                <input class="form-control form-control-sm" id="paste-title" placeholder="Title (optional)">
              </div>
              <div class="col-md">
                <input class="form-control form-control-sm" id="paste-url" placeholder="Source URL (optional)">
              </div>
            </div>
            <textarea class="form-control form-control-sm mb-2" id="paste-body" rows="6"
                      placeholder="Paste copied text here…"></textarea>
            <div class="d-flex gap-2">
              <button class="btn btn-primary btn-sm" id="paste-clip-save">Add to Clips</button>
              <button class="btn btn-secondary btn-sm" id="paste-clip-cancel">Cancel</button>
            </div>
          </div>

          <details class="mb-3">
            <summary class="text-muted small clickable" style="list-style:none;user-select:none">
              ▶ Suggested sources to explore
            </summary>
            <div class="mt-2">
              ${CLIP_SOURCES.map(group => `
                <div class="mb-2">
                  <div class="text-muted small fw-semibold mb-1">${group.label}</div>
                  ${group.links.map(lk => `
                    <div class="d-flex align-items-center gap-2 mb-1">
                      <a href="${lk.url}" target="_blank" rel="noopener"
                         class="small text-truncate flex-grow-1" style="max-width:480px"
                         title="${lk.url}">${lk.title}</a>
                      <button class="btn btn-outline-secondary btn-sm py-0 px-1 copy-url-btn flex-shrink-0"
                              style="font-size:0.7rem" data-url="${lk.url}">Copy URL</button>
                    </div>`).join('')}
                </div>`).join('')}
            </div>
          </details>

          <div id="candidates-list">
            ${count ? '' : '<p class="text-muted small mb-0">No clips pending.</p>'}
          </div>
        </div>
      </details>`;

    // Help modal — inject once
    if (!document.getElementById('clipHelpModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="clipHelpModal" tabindex="-1">
          <div class="modal-dialog modal-lg">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">How to clip pages into your Docs</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body small">
                <h6>Goal</h6>
                <p>Pull useful tips, techniques, or settings from the web into your local guide so
                   they appear in keyword and semantic searches and in "Relevant docs" when you start
                   a session.</p>

                <h6>Method 1 — Bookmarklet (works on most sites)</h6>
                <ol>
                  <li>Drag the <strong>📎 Clip to xTool Guide</strong> button to your browser bookmarks bar
                      (do this once).</li>
                  <li>Navigate to the page you want to save.</li>
                  <li>Click the bookmark — an alert confirms the clip was saved.</li>
                  <li>Return here; the clip appears below for review.</li>
                </ol>
                <p class="text-warning-emphasis">Some sites (xTool, Facebook, etc.) block the
                   bookmarklet. Use Method 2 for those.</p>

                <h6>Method 2 — Copy / Paste</h6>
                <ol>
                  <li>On the source page, select all the useful text and copy it
                      (<kbd>Ctrl+A</kbd> / <kbd>Ctrl+C</kbd>, or select a section manually).</li>
                  <li>Click <strong>Paste text…</strong> above.</li>
                  <li>Paste into the text area. Optionally fill in a title and the source URL.</li>
                  <li>Click <strong>Add to Clips</strong>.</li>
                </ol>
                <p>LibreOffice is fine as an intermediate step if you want to clean the text up
                   before pasting — just paste from the document into the form here.</p>

                <h6>Reviewing a clip</h6>
                <ol>
                  <li><strong>Preview</strong> — shows the raw captured text so you can decide if
                      it's worth keeping.</li>
                  <li><strong>Import…</strong> — opens a form to set Section, Title, Source, body
                      text (trim / edit), and tags, then saves it as a searchable doc entry.</li>
                  <li><strong>Discard</strong> — deletes the clip without importing.</li>
                </ol>
                <p>After import, the entry is embedded (if Ollama is running) and will appear in
                   semantic searches and in session "Relevant docs" suggestions.</p>

                <h6>Where to look</h6>
                <p>See the <strong>Suggested sources</strong> list in the clips panel for curated
                   starting points. Open a link, read the page, clip what's useful.</p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              </div>
            </div>
          </div>
        </div>`);
    }

    // Copy-URL buttons in sources list
    candidatesWrap.querySelectorAll('.copy-url-btn').forEach(btn => {
      btn.onclick = () => {
        navigator.clipboard.writeText(btn.dataset.url).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        });
      };
    });

    // Wire paste form
    const pasteForm   = document.getElementById('paste-clip-form');
    const pasteToggle = document.getElementById('paste-clip-toggle');
    pasteToggle.onclick = () => pasteForm.classList.toggle('d-none');
    document.getElementById('paste-clip-cancel').onclick = () => pasteForm.classList.add('d-none');
    document.getElementById('paste-clip-save').onclick = async () => {
      const raw_text = document.getElementById('paste-body').value.trim();
      if (!raw_text) { window.showToast('Paste some text first.'); return; }
      const payload = {
        raw_text,
        title: document.getElementById('paste-title').value.trim() || null,
        url:   document.getElementById('paste-url').value.trim()   || null,
      };
      const r = await fetch('/api/docs/candidates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        window.showToast('Clip added.', 'success');
        await loadCandidates();
      } else {
        window.showToast('Failed to save clip.');
      }
    };

    if (!count) return;

    const listEl = document.getElementById('candidates-list');
    listEl.innerHTML = rows.map(c => `
      <div class="border rounded p-2 mb-2 candidate-card" data-id="${c.id}">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
          <div>
            <div class="fw-semibold small">${c.title}</div>
            ${c.url ? `<div class="text-muted" style="font-size:0.75rem">${c.url}</div>` : ''}
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            <button class="btn btn-primary btn-sm cand-import" data-id="${c.id}">Import…</button>
            <button class="btn btn-secondary btn-sm cand-preview" data-id="${c.id}">Preview</button>
            <button class="btn btn-danger btn-sm cand-discard" data-id="${c.id}">Discard</button>
          </div>
        </div>
        <div class="cand-preview-body d-none small text-muted border-top pt-2 mt-1"
             style="max-height:200px;overflow-y:auto;white-space:pre-wrap">${c.raw_text.slice(0, 2000)}${c.raw_text.length > 2000 ? '\n…' : ''}</div>
        <div class="cand-import-form d-none mt-2 pt-2 border-top"></div>
      </div>`).join('');

    listEl.addEventListener('click', async e => {
      const id   = e.target.dataset.id;
      const card = e.target.closest('.candidate-card');
      if (!id || !card) return;

      if (e.target.classList.contains('cand-preview')) {
        card.querySelector('.cand-preview-body').classList.toggle('d-none');
        return;
      }

      if (e.target.classList.contains('cand-discard')) {
        if (!confirm('Discard this clip?')) return;
        await fetch(`/api/docs/candidates/${id}`, { method: 'DELETE' });
        await loadCandidates();
        return;
      }

      if (e.target.classList.contains('cand-import')) {
        const formEl = card.querySelector('.cand-import-form');
        if (!formEl.classList.contains('d-none')) { formEl.classList.add('d-none'); return; }
        const raw = rows.find(r => r.id == id);
        formEl.classList.remove('d-none');
        formEl.innerHTML = `
          <div class="row g-2 mb-2">
            <div class="col-md-auto">
              <label class="form-label small">Section</label>
              <select class="form-select form-select-sm" id="ci-section-${id}">
                ${SECTIONS.map(s => `<option>${s}</option>`).join('')}
              </select>
            </div>
            <div class="col-md">
              <label class="form-label small">Title</label>
              <input class="form-control form-control-sm" id="ci-title-${id}"
                     value="${(raw?.title ?? '').replace(/"/g, '&quot;')}">
            </div>
            <div class="col-md-auto">
              <label class="form-label small">Source</label>
              <select class="form-select form-select-sm" id="ci-source-${id}">
                <option value="community" selected>Community</option>
                <option value="xtool-official">xTool Official</option>
                <option value="personal">Personal</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div class="mb-2">
            <label class="form-label small">Body <span class="text-muted fw-normal">(edit/trim the raw text)</span></label>
            <textarea class="form-control form-control-sm" id="ci-body-${id}" rows="6">${(raw?.raw_text ?? '').slice(0, 3000)}</textarea>
          </div>
          <div class="mb-3">
            <label class="form-label small">Tags <span class="text-muted fw-normal">(comma-separated)</span></label>
            <input class="form-control form-control-sm" id="ci-tags-${id}" placeholder="e.g. wood,technique,char">
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-primary btn-sm cand-import-save" data-id="${id}">Import into Docs</button>
            <button class="btn btn-secondary btn-sm" onclick="this.closest('.cand-import-form').classList.add('d-none')">Cancel</button>
          </div>`;
        return;
      }

      if (e.target.classList.contains('cand-import-save')) {
        const payload = {
          section: document.getElementById(`ci-section-${id}`).value,
          title:   document.getElementById(`ci-title-${id}`).value.trim(),
          body:    document.getElementById(`ci-body-${id}`).value.trim(),
          tags:    document.getElementById(`ci-tags-${id}`).value.trim() || null,
          source:  document.getElementById(`ci-source-${id}`).value,
        };
        if (!payload.title || !payload.body) { window.showToast('Title and body are required.'); return; }
        const btn = e.target;
        btn.disabled = true; btn.textContent = 'Importing…';
        try {
          const r = await fetch(`/api/docs/candidates/${id}/import`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          window.showToast(`Imported as doc #${data.id}${data.embedded ? ' (embedded)' : ''}`, 'success');
          await loadCandidates();
        } catch (err) {
          window.showToast(err.message);
          btn.disabled = false; btn.textContent = 'Import into Docs';
        }
      }
    });
  }

  await loadCandidates();

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
