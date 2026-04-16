window.artifactsInit = async function () {
  const banner   = document.getElementById('artifacts-banner');
  const formWrap = document.getElementById('artifact-form-wrap');
  const listDiv  = document.getElementById('artifacts-list');

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

  function fmtDelta(v, unit = '') {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + v + unit;
  }

  // ── Form ─────────────────────────────────────────────────────────
  async function showForm(existing = null) {
    const isEdit = !!existing;
    const e = existing ?? {};

    // Fetch families for the default profile picker
    let families = [];
    try { families = await apiFetch('/api/families'); } catch (_) {}

    const famOpts = families.map(f =>
      `<option value="${f.id}" ${f.id === e.default_family_id ? 'selected' : ''}>
         ${f.material} — ${f.profile_name}
       </option>`
    ).join('');

    formWrap.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <h3 style="margin-top:0">${isEdit ? `Edit: ${e.name}` : 'New Artifact'}</h3>
        <div class="form-row" style="margin-bottom:10px">
          <div style="flex:1">
            <label>Name</label>
            <input id="af-name" type="text" value="${e.name ?? ''}" placeholder="e.g. Coaster, Pendant">
          </div>
          <div style="flex:2">
            <label>Description <small style="color:var(--text-muted)">(optional)</small></label>
            <input id="af-desc" type="text" value="${e.description ?? ''}" placeholder="What is this artifact?">
          </div>
        </div>
        <div class="form-row" style="margin-bottom:10px">
          <div style="flex:1">
            <label>Default material profile <small style="color:var(--text-muted)">(optional)</small></label>
            <select id="af-family">
              <option value="">— None —</option>
              ${famOpts}
            </select>
          </div>
        </div>
        <h4 style="margin:4px 0 8px;font-size:0.85rem;color:var(--text-muted)">
          Parameter deltas — applied on top of the run's material setting
        </h4>
        <div class="form-row" style="margin-bottom:12px">
          <div>
            <label>Power delta %</label>
            <input id="af-power" type="number" style="width:90px"
                   value="${e.power_delta ?? ''}" placeholder="e.g. +5 or -10">
          </div>
          <div>
            <label>Speed delta mm/sec</label>
            <input id="af-speed" type="number" style="width:100px"
                   value="${e.speed_delta ?? ''}" placeholder="e.g. +20">
          </div>
          <div>
            <label>Focus delta mm</label>
            <input id="af-focus" type="number" step="0.1" style="width:90px"
                   value="${e.focus_delta ?? ''}" placeholder="e.g. -0.5">
          </div>
          <div>
            <label>Passes delta</label>
            <input id="af-passes" type="number" style="width:80px"
                   value="${e.passes_delta ?? ''}" placeholder="e.g. +1">
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="af-save">${isEdit ? 'Save' : 'Create'}</button>
          <button class="btn btn-secondary" id="af-cancel">Cancel</button>
        </div>
        <div id="af-form-banner" style="margin-top:8px"></div>
      </div>`;

    document.getElementById('af-cancel').onclick = () => { formWrap.innerHTML = ''; };
    document.getElementById('af-save').onclick = async () => {
      const name = document.getElementById('af-name').value.trim();
      if (!name) {
        document.getElementById('af-form-banner').innerHTML =
          '<div class="banner banner-error">Name is required.</div>';
        return;
      }
      const payload = {
        name,
        description:       document.getElementById('af-desc').value.trim()   || null,
        default_family_id: +document.getElementById('af-family').value        || null,
        power_delta:       numOrNull('af-power'),
        speed_delta:       numOrNull('af-speed'),
        focus_delta:       numOrNull('af-focus'),
        passes_delta:      numOrNull('af-passes'),
      };
      const btn = document.getElementById('af-save');
      btn.disabled = true; btn.textContent = '…';
      try {
        if (isEdit) {
          await apiFetch(`/api/artifacts/${e.id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload),
          });
        } else {
          await apiFetch('/api/artifacts', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload),
          });
        }
        formWrap.innerHTML = '';
        await loadList();
      } catch (err) {
        document.getElementById('af-form-banner').innerHTML =
          `<div class="banner banner-error">${err.message}</div>`;
        btn.disabled = false; btn.textContent = isEdit ? 'Save' : 'Create';
      }
    };
  }

  function numOrNull(id) {
    const v = document.getElementById(id).value;
    return v !== '' ? +v : null;
  }

  // ── List ──────────────────────────────────────────────────────────
  function renderDelta(label, val, unit = '') {
    if (val == null) return '';
    const color = val > 0 ? 'var(--success)' : val < 0 ? 'var(--accent)' : 'var(--text-muted)';
    return `<span style="font-size:0.8rem;margin-right:10px">
      <span style="color:var(--text-muted)">${label}:</span>
      <span style="color:${color};font-weight:600">${fmtDelta(val, unit)}</span>
    </span>`;
  }

  async function loadList() {
    try {
      const artifacts = await apiFetch('/api/artifacts');
      if (!artifacts.length) {
        listDiv.innerHTML = '<p style="color:var(--text-muted)">No artifacts yet. Create one to get started.</p>';
        return;
      }
      listDiv.innerHTML = artifacts.map(a => `
        <div class="card" style="margin-bottom:12px" id="artifact-card-${a.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="flex:1">
              <div style="font-weight:700;font-size:1rem;margin-bottom:2px">${a.name}</div>
              ${a.description ? `<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:6px">${a.description}</div>` : ''}
              ${a.default_profile_name
                ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px">
                     Default profile: <strong>${a.default_material} — ${a.default_profile_name}</strong>
                   </div>`
                : ''}
              <div style="margin-top:4px">
                ${renderDelta('Power', a.power_delta, '%')}
                ${renderDelta('Speed', a.speed_delta, 'mm/sec')}
                ${renderDelta('Focus', a.focus_delta, 'mm')}
                ${renderDelta('Passes', a.passes_delta)}
                ${[a.power_delta, a.speed_delta, a.focus_delta, a.passes_delta].every(v => v == null)
                  ? '<span style="font-size:0.8rem;color:var(--text-muted)">No deltas set</span>' : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn btn-secondary btn-sm art-edit" data-id="${a.id}">Edit</button>
              <button class="btn btn-danger btn-sm art-del"  data-id="${a.id}">Del</button>
            </div>
          </div>
        </div>`).join('');
    } catch (e) {
      listDiv.innerHTML = `<div class="banner banner-error">${e.message}</div>`;
    }
  }

  // ── Event wiring ──────────────────────────────────────────────────
  document.getElementById('btn-new-artifact').onclick = () => showForm();

  listDiv.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('art-edit')) {
      try {
        const artifact = await apiFetch(`/api/artifacts/${id}`);
        await showForm(artifact);
        formWrap.scrollIntoView({ behavior: 'smooth' });
      } catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('art-del')) {
      if (!confirm('Delete this artifact? Runs that reference it will be unaffected (artifact_id set to null).')) return;
      try {
        await apiFetch(`/api/artifacts/${id}`, { method: 'DELETE' });
        await loadList();
      } catch (err) { showBanner(err.message); }
    }
  });

  await loadList();
};
