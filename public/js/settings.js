window.settingsInit = async function () {
  const content         = document.getElementById('settings-content');
  const matSel          = document.getElementById('filter-material');
  const opSel           = document.getElementById('filter-operation');
  const familySel       = document.getElementById('filter-family');
  const archCb          = document.getElementById('filter-archived');
  const sumCb           = document.getElementById('view-summary');
  const formWrap        = document.getElementById('setting-form-wrap');
  const profilesSection = document.getElementById('profiles-section');

  let cachedFamilies = [];

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  const ROLE_BADGE = {
    confirmed: '<span class="badge text-bg-success">✓ confirmed</span>',
    candidate: '<span class="badge bg-transparent border text-muted">candidate</span>',
    archived:  '<span class="badge bg-transparent border text-secondary opacity-50">archived</span>',
  };

  function renderParams(r) {
    return `<span class="text-muted small">` +
      `${r.power ?? '—'}% &nbsp;·&nbsp; ${r.speed ?? '—'} mm/sec` +
      `${r.lines_per_inch ? ` &nbsp;·&nbsp; ${r.lines_per_inch} LPI` : ''}` +
      `${r.passes > 1 ? ` &nbsp;·&nbsp; ${r.passes} passes` : ''}` +
      `${r.focus_offset_mm ? ` &nbsp;·&nbsp; focus ${r.focus_offset_mm}mm` : ''}` +
      `</span>`;
  }

  function renderLineage(r) {
    if (!r.parent_id) return '';
    return `<span class="text-muted small" title="Derived from #${r.parent_id}">↳ #${r.parent_id}</span>`;
  }

  // ── Materials dropdown ────────────────────────────────────────────
  async function loadMaterials() {
    const rows = await apiFetch('/api/settings?archived=1');
    const mats = [...new Set(rows.map(r => r.material))].sort();
    const cur  = matSel.value;
    matSel.innerHTML = '<option value="">All</option>' +
      mats.map(m => `<option value="${escHtml(m)}" ${m === cur ? 'selected' : ''}>${escHtml(m)}</option>`).join('');
  }

  // ── Families ──────────────────────────────────────────────────────
  async function loadFamilies() {
    cachedFamilies = await apiFetch('/api/families');
    renderProfilesSection(cachedFamilies);
    updateFamilyFilter();
  }

  function updateFamilyFilter() {
    const mat  = matSel.value;
    const list = mat ? cachedFamilies.filter(f => f.material === mat) : cachedFamilies;
    familySel.innerHTML = '<option value="">All profiles</option>' +
      list.map(f =>
        `<option value="${f.id}">${escHtml(f.material)} — ${escHtml(f.profile_name)}</option>`
      ).join('');
  }

  function renderProfilesSection(families) {
    const byMat = {};
    families.forEach(f => {
      if (!byMat[f.material]) byMat[f.material] = [];
      byMat[f.material].push(f);
    });

    const famRows = Object.keys(byMat).sort().map(mat => `
      <div class="mb-3">
        <div class="fw-semibold mb-2 small">${escHtml(mat)}</div>
        ${byMat[mat].map(f => `
          <div class="profile-row d-flex align-items-center gap-2 py-1 border-bottom" data-fid="${f.id}">
            <span class="flex-grow-1 small">${escHtml(f.profile_name)}${f.description
              ? ` <span class="text-muted"> — ${escHtml(f.description)}</span>` : ''}</span>
            <button class="btn btn-secondary btn-sm profile-rename-btn" data-fid="${f.id}">Rename</button>
            <button class="btn btn-danger btn-sm profile-del-btn" data-fid="${f.id}">Del</button>
          </div>`).join('')}
      </div>`).join('');

    const hasExisting = families.length > 0;
    profilesSection.innerHTML = `
      <details class="mb-3">
        <summary class="text-muted small fw-bold text-uppercase clickable" style="letter-spacing:0.06em;list-style:none;padding:8px 0;user-select:none">
          ▶ Material Profiles (${families.length})
        </summary>
        <div class="card card-body mt-2">
          ${famRows || '<p class="text-muted small mb-3">No profiles yet.</p>'}
          <div class="${hasExisting ? 'mt-3 pt-3 border-top' : ''}">
            <strong class="small">Add Profile</strong>
            <div class="row g-2 align-items-end mt-1">
              <div class="col-auto">
                <label class="form-label small">Material</label>
                <input class="form-control form-control-sm" id="pf-material" type="text" placeholder="e.g. Walnut">
              </div>
              <div class="col">
                <label class="form-label small">Profile Name</label>
                <input class="form-control form-control-sm" id="pf-name" type="text" placeholder="e.g. 5mm stock">
              </div>
              <div class="col">
                <label class="form-label small">Description <span class="text-muted fw-normal">(optional)</span></label>
                <input class="form-control form-control-sm" id="pf-desc" type="text">
              </div>
              <div class="col-auto">
                <button class="btn btn-primary btn-sm" id="pf-add-btn">Add</button>
              </div>
            </div>
          </div>
        </div>
      </details>`;

    document.getElementById('pf-add-btn').onclick = async () => {
      const mat  = document.getElementById('pf-material').value.trim();
      const name = document.getElementById('pf-name').value.trim();
      const desc = document.getElementById('pf-desc').value.trim();
      if (!mat || !name) return window.showToast('Material and profile name are required');
      try {
        await apiFetch('/api/families', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ material: mat, profile_name: name, description: desc || null }),
        });
        await loadFamilies();
      } catch (e) { window.showToast(e.message); }
    };
  }

  // Profile rename / delete via event delegation
  profilesSection.addEventListener('click', async e => {
    const fid = e.target.dataset.fid;
    if (!fid) return;

    if (e.target.classList.contains('profile-rename-btn')) {
      const row = e.target.closest('.profile-row');
      const fam = cachedFamilies.find(f => f.id == fid);
      row.innerHTML = `
        <input class="form-control form-control-sm flex-grow-1" type="text" id="rn-input-${fid}"
               value="${escHtml(fam?.profile_name ?? '')}">
        <button class="btn btn-primary btn-sm profile-rename-save" data-fid="${fid}">Save</button>
        <button class="btn btn-secondary btn-sm profile-rename-cancel" data-fid="${fid}">Cancel</button>`;
      document.getElementById(`rn-input-${fid}`)?.focus();
      return;
    }
    if (e.target.classList.contains('profile-rename-save')) {
      const newName = document.getElementById(`rn-input-${fid}`)?.value.trim();
      if (!newName) return window.showToast('Name is required');
      try {
        await apiFetch(`/api/families/${fid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_name: newName }),
        });
        await loadFamilies();
        await loadData();
      } catch (e) { window.showToast(e.message); }
      return;
    }
    if (e.target.classList.contains('profile-rename-cancel')) {
      await loadFamilies();
      return;
    }
    if (e.target.classList.contains('profile-del-btn')) {
      const fam = cachedFamilies.find(f => f.id == fid);
      if (!confirm(`Delete profile "${fam?.profile_name}"?\nSettings assigned to it will be detached (kept but ungrouped).`)) return;
      try {
        await apiFetch(`/api/families/${fid}`, { method: 'DELETE' });
        await loadFamilies();
        await loadData();
      } catch (e) { window.showToast(e.message); }
    }
  });

  // ── Form: New / Edit / Improve ────────────────────────────────────
  function buildFamilyOptions(mat, selectedId) {
    const list = mat
      ? cachedFamilies.filter(f => f.material.toLowerCase() === mat.toLowerCase())
      : cachedFamilies;
    return '<option value="">— no profile —</option>' +
      list.map(f =>
        `<option value="${f.id}" ${f.id == selectedId ? 'selected' : ''}>${escHtml(f.profile_name)}</option>`
      ).join('');
  }

  function renderForm(row = null, mode = 'new') {
    const isImprove = mode === 'improve';
    const isEdit    = mode === 'edit';
    const title = isImprove ? 'Improve Setting' : isEdit ? 'Edit Setting' : 'New Setting';
    const mat   = row?.material ?? '';

    formWrap.innerHTML = `
      <div class="card card-body mb-4">
        <h2 class="h5 mb-1">${title}${row
          ? ` <small class="text-muted fw-normal" style="font-size:0.65em">&nbsp;#${row.id} &nbsp;${escHtml(row.material)} / ${row.operation}</small>`
          : ''}</h2>
        ${isImprove ? `<p class="text-muted small mt-0 mb-3">Creates a new candidate from this setting. The confirmed setting will be archived.</p>` : '<div class="mb-2"></div>'}
        <div class="row g-2 mb-2">
          <div class="col-md">
            <label class="form-label small">Material <small title="Never laser PVC/vinyl">⚠</small></label>
            ${isImprove
              ? `<input class="form-control form-control-sm" type="text" value="${escHtml(mat)}" disabled>`
              : `<input class="form-control form-control-sm" id="f-material" type="text" value="${escHtml(mat)}" placeholder="e.g. Walnut">`}
          </div>
          <div class="col-md-auto">
            <label class="form-label small">Operation</label>
            ${isImprove
              ? `<input class="form-control form-control-sm" type="text" value="${row.operation}" disabled>`
              : `<select class="form-select form-select-sm" id="f-operation">
                  <option value="engrave" ${row?.operation === 'engrave' ? 'selected' : ''}>Engrave</option>
                  <option value="score"   ${row?.operation === 'score'   ? 'selected' : ''}>Score</option>
                  <option value="cut"     ${row?.operation === 'cut'     ? 'selected' : ''}>Cut</option>
                </select>`}
          </div>
          <div class="col-md-auto">
            <label class="form-label small">Profile</label>
            <select class="form-select form-select-sm" id="f-family">${buildFamilyOptions(mat, row?.family_id)}</select>
          </div>
          <div class="col-auto">
            <label class="form-label small">Power %</label>
            <input class="form-control form-control-sm" id="f-power" type="number" min="0" max="100" value="${row?.power ?? ''}" style="width:80px">
          </div>
          <div class="col-auto">
            <label class="form-label small">Speed (mm/s)</label>
            <input class="form-control form-control-sm" id="f-speed" type="number" min="1" value="${row?.speed ?? ''}" style="width:90px">
          </div>
          <div class="col-auto">
            <label class="form-label small">LPI</label>
            <input class="form-control form-control-sm" id="f-lpi" type="number" min="1" value="${row?.lines_per_inch ?? ''}" style="width:70px">
          </div>
          <div class="col-auto">
            <label class="form-label small">Passes</label>
            <input class="form-control form-control-sm" id="f-passes" type="number" min="1" value="${row?.passes ?? 1}" style="width:70px">
          </div>
          <div class="col-auto">
            <label class="form-label small">Focus Offset (mm)</label>
            <input class="form-control form-control-sm" id="f-focus" type="number" step="0.5" value="${row?.focus_offset_mm ?? 0}" style="width:90px">
          </div>
        </div>
        <div class="row g-2 mb-3">
          <div class="col-md">
            <label class="form-label small">Notes</label>
            <input class="form-control form-control-sm" id="f-notes" type="text" value="${escHtml(row?.notes ?? '')}">
          </div>
          ${!isImprove ? `
          <div class="col-md-auto">
            <label class="form-label small">Role</label>
            <select class="form-select form-select-sm" id="f-role">
              <option value="candidate" ${!row || row.role === 'candidate' ? 'selected' : ''}>Candidate</option>
              <option value="confirmed" ${row?.role === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            </select>
          </div>` : ''}
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm" id="f-save">${isImprove ? 'Improve' : isEdit ? 'Save' : 'Create'}</button>
          <button class="btn btn-secondary btn-sm" id="f-cancel">Cancel</button>
        </div>
      </div>`;

    // Keep family picker in sync with typed material (new/edit only)
    if (!isImprove) {
      const matInput  = document.getElementById('f-material');
      const famPicker = document.getElementById('f-family');
      matInput?.addEventListener('input', () => {
        famPicker.innerHTML = buildFamilyOptions(matInput.value.trim(), null);
      });
    }

    document.getElementById('f-cancel').onclick = () => { formWrap.innerHTML = ''; };
    document.getElementById('f-save').onclick = async () => {
      const familyVal = document.getElementById('f-family')?.value;
      try {
        if (isImprove) {
          const payload = {
            power:           +document.getElementById('f-power').value   || null,
            speed:           +document.getElementById('f-speed').value   || null,
            lines_per_inch:  +document.getElementById('f-lpi').value     || null,
            passes:          +document.getElementById('f-passes').value  || 1,
            focus_offset_mm: +document.getElementById('f-focus').value   || 0,
            notes:           document.getElementById('f-notes').value.trim() || null,
            family_id:       familyVal ? +familyVal : null,
          };
          await apiFetch(`/api/settings/${row.id}/improve`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
        } else {
          const payload = {
            material:        document.getElementById('f-material').value.trim(),
            operation:       document.getElementById('f-operation').value,
            power:           +document.getElementById('f-power').value   || null,
            speed:           +document.getElementById('f-speed').value   || null,
            lines_per_inch:  +document.getElementById('f-lpi').value     || null,
            passes:          +document.getElementById('f-passes').value  || 1,
            focus_offset_mm: +document.getElementById('f-focus').value   || 0,
            notes:           document.getElementById('f-notes').value.trim() || null,
            role:            document.getElementById('f-role').value,
            family_id:       familyVal ? +familyVal : null,
          };
          if (isEdit) {
            if (payload.role === 'confirmed' && row.role !== 'confirmed') {
              const { role, ...rest } = payload;
              await apiFetch(`/api/settings/${row.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rest) });
              await apiFetch(`/api/settings/${row.id}/confirm`, { method: 'PUT' });
            } else {
              await apiFetch(`/api/settings/${row.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            }
          } else {
            await apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          }
        }
        formWrap.innerHTML = '';
        await loadMaterials();
        await loadData();
      } catch (e) { window.showToast(e.message); }
    };
  }

  // ── Compact setting row (used in tree view) ───────────────────────
  function renderSettingRow(r) {
    const isArchived = r.role === 'archived';
    return `
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 py-2 border-bottom${isArchived ? ' opacity-50' : ''}">
        <div class="d-flex align-items-center gap-2 flex-wrap small">
          <span class="badge text-bg-secondary">${r.operation}</span>
          ${ROLE_BADGE[r.role]}
          ${renderLineage(r)}
          ${renderParams(r)}
          ${r.notes ? `<span class="text-muted fst-italic" style="font-size:0.8rem">${escHtml(r.notes)}</span>` : ''}
        </div>
        ${!isArchived ? `
        <div class="d-flex gap-1">
          ${r.role === 'confirmed'
            ? `<button class="btn btn-primary btn-sm improve-btn" data-id="${r.id}">Improve</button>`
            : `<button class="btn btn-secondary btn-sm confirm-btn" data-id="${r.id}" title="Mark confirmed">✓</button>
               <button class="btn btn-secondary btn-sm edit-btn" data-id="${r.id}">Edit</button>`}
          <button class="btn btn-danger btn-sm del-btn" data-id="${r.id}">Del</button>
        </div>` : ''}
      </div>`;
  }

  // ── Tree summary view ─────────────────────────────────────────────
  function renderSummary(rows) {
    if (!rows.length) {
      content.innerHTML = '<p class="text-muted">No settings found.</p>';
      return;
    }

    // Group: material → { profiles: {fid → {name, rows[]}}, ungrouped: [] }
    const matGroups = {};
    rows.forEach(r => {
      if (!matGroups[r.material]) matGroups[r.material] = { profiles: {}, ungrouped: [] };
      const mg = matGroups[r.material];
      if (r.family_id) {
        if (!mg.profiles[r.family_id]) mg.profiles[r.family_id] = { name: r.family_name || '(profile)', rows: [] };
        mg.profiles[r.family_id].rows.push(r);
      } else {
        mg.ungrouped.push(r);
      }
    });

    const roleOrder = { confirmed: 0, candidate: 1, archived: 2 };
    const sortRows  = arr => [...arr].sort((a, b) =>
      (roleOrder[a.role] ?? 1) - (roleOrder[b.role] ?? 1) || a.operation.localeCompare(b.operation));

    const autoExpand = matSel.value;

    const html = Object.keys(matGroups).sort().map(mat => {
      const mg           = matGroups[mat];
      const profileCount = Object.keys(mg.profiles).length;
      const totalCount   = rows.filter(r => r.material === mat).length;
      const summary      = `${totalCount} setting${totalCount !== 1 ? 's' : ''}` +
                           (profileCount ? ` · ${profileCount} profile${profileCount !== 1 ? 's' : ''}` : '');
      const matKey       = `mat_${mat.replace(/\W/g, '_')}`;
      const isOpen       = autoExpand === mat;

      const profileHtml = Object.values(mg.profiles)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(pg => `
          <div class="ms-3 ps-2 border-start my-2">
            <div class="text-muted fw-bold text-uppercase mb-1" style="font-size:0.78rem;letter-spacing:0.05em">
              ${escHtml(pg.name)}
            </div>
            ${sortRows(pg.rows).map(r => renderSettingRow(r)).join('')}
          </div>`).join('');

      const ungroupedHtml = mg.ungrouped.length
        ? (profileCount ? `<div class="text-muted ms-3 mt-2 mb-1" style="font-size:0.78rem">no profile</div>` : '') +
          sortRows(mg.ungrouped).map(r => renderSettingRow(r)).join('')
        : '';

      return `
        <div class="border rounded mb-1 overflow-hidden">
          <div class="mat-header d-flex align-items-center gap-2 px-3 py-2 clickable" data-matkey="${matKey}">
            <span class="mat-arrow text-muted" data-matkey="${matKey}" style="font-size:0.7rem;width:10px">${isOpen ? '▾' : '▶'}</span>
            <strong class="small">${escHtml(mat)}</strong>
            <span class="text-muted small">${summary}</span>
          </div>
          <div class="mat-body px-3 pb-3 border-top${isOpen ? '' : ' d-none'}" data-matkey="${matKey}">
            ${profileHtml}${ungroupedHtml}
          </div>
        </div>`;
    }).join('');

    content.innerHTML = html || '<p class="text-muted">No settings found.</p>';
  }

  // ── Flat table view ───────────────────────────────────────────────
  function renderTable(rows) {
    if (!rows.length) { content.innerHTML = '<p class="text-muted">No settings found.</p>'; return; }
    content.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover table-sm">
          <thead><tr>
            <th>Material</th><th>Op</th><th>Profile</th><th>Role</th>
            <th>Power</th><th>Speed</th><th>LPI</th><th>Passes</th><th>Focus</th><th>Notes</th><th></th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr class="${r.role === 'archived' ? 'opacity-50' : ''}">
                <td>${escHtml(r.material)}</td>
                <td><span class="badge text-bg-secondary">${r.operation}</span></td>
                <td class="text-muted small">${r.family_name ? escHtml(r.family_name) : '—'}</td>
                <td>${ROLE_BADGE[r.role]}</td>
                <td>${r.power ?? '—'}</td><td>${r.speed ?? '—'}</td>
                <td>${r.lines_per_inch ?? '—'}</td><td>${r.passes}</td>
                <td>${r.focus_offset_mm}</td>
                <td class="text-nowrap" style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${escHtml(r.notes ?? '')}</td>
                <td class="text-nowrap">
                  ${r.role === 'confirmed'
                    ? `<button class="btn btn-primary btn-sm improve-btn" data-id="${r.id}">Improve</button>`
                    : r.role === 'candidate'
                      ? `<button class="btn btn-secondary btn-sm confirm-btn" data-id="${r.id}">✓</button>
                         <button class="btn btn-secondary btn-sm edit-btn" data-id="${r.id}">Edit</button>`
                      : ''}
                  ${r.role !== 'archived' ? `<button class="btn btn-danger btn-sm del-btn" data-id="${r.id}">Del</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── Load & render ─────────────────────────────────────────────────
  async function loadData() {
    const params = new URLSearchParams();
    if (matSel.value)    params.set('material',  matSel.value);
    if (opSel.value)     params.set('operation', opSel.value);
    if (familySel.value) params.set('family_id', familySel.value);
    if (archCb.checked)  params.set('archived',  '1');
    try {
      const rows = await apiFetch(`/api/settings?${params}`);
      if (sumCb.checked) renderSummary(rows);
      else renderTable(rows);
    } catch (e) {
      content.innerHTML = `<div class="alert alert-danger">${escHtml(e.message)}</div>`;
    }
  }

  // ── Event delegation on settings content ─────────────────────────
  content.addEventListener('click', async e => {
    // Material row expand/collapse
    const matHeader = e.target.closest('.mat-header');
    if (matHeader) {
      const key  = matHeader.dataset.matkey;
      const body  = content.querySelector(`.mat-body[data-matkey="${key}"]`);
      const arrow = content.querySelector(`.mat-arrow[data-matkey="${key}"]`);
      if (body) {
        const isHidden = body.classList.contains('d-none');
        body.classList.toggle('d-none');
        if (arrow) arrow.textContent = isHidden ? '▾' : '▶';
      }
      return;
    }

    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains('improve-btn')) {
      try {
        const row = await apiFetch(`/api/settings/${id}`);
        renderForm(row, 'improve');
        window.scrollTo(0, 0);
      } catch (err) { window.showToast(err.message); }
    }
    if (e.target.classList.contains('confirm-btn')) {
      try { await apiFetch(`/api/settings/${id}/confirm`, { method: 'PUT' }); await loadData(); }
      catch (err) { window.showToast(err.message); }
    }
    if (e.target.classList.contains('unconfirm-btn')) {
      try { await apiFetch(`/api/settings/${id}/unconfirm`, { method: 'PUT' }); await loadData(); }
      catch (err) { window.showToast(err.message); }
    }
    if (e.target.classList.contains('edit-btn')) {
      try {
        const row = await apiFetch(`/api/settings/${id}`);
        renderForm(row, 'edit');
        window.scrollTo(0, 0);
      } catch (err) { window.showToast(err.message); }
    }
    if (e.target.classList.contains('del-btn')) {
      if (!confirm('Delete this setting?')) return;
      try { await apiFetch(`/api/settings/${id}`, { method: 'DELETE' }); await loadData(); }
      catch (err) { window.showToast(err.message); }
    }
  });

  // ── Wire up filter controls ───────────────────────────────────────
  document.getElementById('btn-filter').onclick      = loadData;
  document.getElementById('btn-new-setting').onclick = () => renderForm(null, 'new');
  matSel.addEventListener('change', updateFamilyFilter);
  sumCb.addEventListener('change', loadData);
  archCb.addEventListener('change', loadData);

  // ── Init ──────────────────────────────────────────────────────────
  await Promise.all([loadMaterials(), loadFamilies()]);
  await loadData();
};
