window.artifactsInit = async function () {
  const formWrap = document.getElementById('artifact-form-wrap');
  const listDiv  = document.getElementById('artifacts-list');

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function fmtDelta(v, unit = '') {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + v + unit;
  }

  // ── Form ─────────────────────────────────────────────────────────
  async function showForm(existing = null) {
    const isEdit = !!existing;
    const e = existing ?? {};

    let families = [];
    try { families = await apiFetch('/api/families'); } catch (_) {}

    const famOpts = families.map(f =>
      `<option value="${f.id}" ${f.id === e.default_family_id ? 'selected' : ''}>${f.material} — ${f.profile_name}</option>`
    ).join('');

    formWrap.innerHTML = `
      <div class="card card-body mb-3">
        <h3 class="h5 mb-3">${isEdit ? `Edit: ${e.name}` : 'New Artifact'}</h3>
        <div class="row g-2 mb-2">
          <div class="col-md">
            <label class="form-label small">Name</label>
            <input class="form-control form-control-sm" id="af-name" type="text"
                   value="${e.name ?? ''}" placeholder="e.g. Coaster, Pendant">
          </div>
          <div class="col-md">
            <label class="form-label small">Description <span class="text-muted fw-normal">(optional)</span></label>
            <input class="form-control form-control-sm" id="af-desc" type="text"
                   value="${e.description ?? ''}" placeholder="What is this artifact?">
          </div>
        </div>
        <div class="row g-2 mb-3">
          <div class="col-md">
            <label class="form-label small">Default material profile <span class="text-muted fw-normal">(optional)</span></label>
            <select class="form-select form-select-sm" id="af-family">
              <option value="">— None —</option>
              ${famOpts}
            </select>
          </div>
        </div>
        <h4 class="small fw-semibold text-muted mb-2">Parameter deltas — applied on top of the run's material setting</h4>
        <div class="row g-2 mb-3">
          <div class="col-auto">
            <label class="form-label small">Power delta %</label>
            <input class="form-control form-control-sm" id="af-power" type="number"
                   style="width:90px" value="${e.power_delta ?? ''}" placeholder="+5 or −10">
          </div>
          <div class="col-auto">
            <label class="form-label small">Speed delta mm/s</label>
            <input class="form-control form-control-sm" id="af-speed" type="number"
                   style="width:100px" value="${e.speed_delta ?? ''}" placeholder="+20">
          </div>
          <div class="col-auto">
            <label class="form-label small">Focus delta mm</label>
            <input class="form-control form-control-sm" id="af-focus" type="number"
                   step="0.1" style="width:90px" value="${e.focus_delta ?? ''}" placeholder="−0.5">
          </div>
          <div class="col-auto">
            <label class="form-label small">Passes delta</label>
            <input class="form-control form-control-sm" id="af-passes" type="number"
                   style="width:80px" value="${e.passes_delta ?? ''}" placeholder="+1">
          </div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm" id="af-save">${isEdit ? 'Save' : 'Create'}</button>
          <button class="btn btn-secondary btn-sm" id="af-cancel">Cancel</button>
        </div>
      </div>`;

    document.getElementById('af-cancel').onclick = () => { formWrap.innerHTML = ''; };
    document.getElementById('af-save').onclick = async () => {
      const nameInput = document.getElementById('af-name');
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.classList.add('is-invalid');
        window.showToast('Name is required.');
        return;
      }
      nameInput.classList.remove('is-invalid');
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
        window.showToast(err.message);
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
    const cls = val > 0 ? 'text-success' : val < 0 ? 'text-primary' : 'text-muted';
    return `<span class="me-3 small">
      <span class="text-muted">${label}:</span>
      <span class="${cls} fw-semibold">${fmtDelta(val, unit)}</span>
    </span>`;
  }

  async function loadList() {
    try {
      const artifacts = await apiFetch('/api/artifacts');
      if (!artifacts.length) {
        listDiv.innerHTML = '<p class="text-muted">No artifacts yet. Create one to get started.</p>';
        return;
      }
      listDiv.innerHTML = artifacts.map(a => `
        <div class="card mb-2" id="artifact-card-${a.id}">
          <div class="card-body py-2">
            <div class="d-flex justify-content-between align-items-start gap-3">
              <div class="flex-grow-1">
                <div class="fw-bold mb-1">${a.name}</div>
                ${a.description ? `<div class="text-muted small mb-1">${a.description}</div>` : ''}
                ${a.default_profile_name
                  ? `<div class="text-muted small mb-1">Default profile: <strong>${a.default_material} — ${a.default_profile_name}</strong></div>`
                  : ''}
                <div class="mt-1">
                  ${renderDelta('Power', a.power_delta, '%')}
                  ${renderDelta('Speed', a.speed_delta, 'mm/s')}
                  ${renderDelta('Focus', a.focus_delta, 'mm')}
                  ${renderDelta('Passes', a.passes_delta)}
                  ${[a.power_delta, a.speed_delta, a.focus_delta, a.passes_delta].every(v => v == null)
                    ? '<span class="text-muted small">No deltas set</span>' : ''}
                </div>
              </div>
              <div class="d-flex gap-1 flex-shrink-0">
                <button class="btn btn-secondary btn-sm art-edit" data-id="${a.id}">Edit</button>
                <button class="btn btn-danger btn-sm art-del" data-id="${a.id}">Del</button>
              </div>
            </div>
          </div>
        </div>`).join('');
    } catch (e) {
      listDiv.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
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
      } catch (err) { window.showToast(err.message); }
    }
    if (e.target.classList.contains('art-del')) {
      if (!confirm('Delete this artifact? Runs that reference it will be unaffected (artifact_id set to null).')) return;
      try {
        await apiFetch(`/api/artifacts/${id}`, { method: 'DELETE' });
        await loadList();
      } catch (err) { window.showToast(err.message); }
    }
  });

  await loadList();
};
