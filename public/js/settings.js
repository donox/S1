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

  function showBanner(msg, type = 'error') {
    const b = document.createElement('div');
    b.className = `banner banner-${type}`;
    b.textContent = msg;
    formWrap.prepend(b);
    if (type !== 'error') setTimeout(() => b.remove(), 4000);
  }

  const ROLE_BADGE = {
    confirmed: '<span class="badge" style="color:#27ae60;border:1px solid #27ae60">✓ confirmed</span>',
    candidate: '<span class="badge" style="color:var(--text-muted)">candidate</span>',
    archived:  '<span class="badge" style="color:var(--border)">archived</span>',
  };

  function renderParams(r) {
    return `<span style="font-size:0.875rem;color:var(--text-muted)">` +
      `${r.power ?? '—'}% &nbsp;·&nbsp; ${r.speed ?? '—'} mm/min` +
      `${r.lines_per_inch ? ` &nbsp;·&nbsp; ${r.lines_per_inch} LPI` : ''}` +
      `${r.passes > 1 ? ` &nbsp;·&nbsp; ${r.passes} passes` : ''}` +
      `${r.focus_offset_mm ? ` &nbsp;·&nbsp; focus ${r.focus_offset_mm}mm` : ''}` +
      `</span>`;
  }

  function renderLineage(r) {
    if (!r.parent_id) return '';
    return `<span style="font-size:0.8rem;color:var(--text-muted)" title="Derived from #${r.parent_id}">↳ #${r.parent_id}</span>`;
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
      <div style="margin-bottom:14px">
        <div style="font-weight:600;margin-bottom:6px;font-size:0.9rem">${escHtml(mat)}</div>
        ${byMat[mat].map(f => `
          <div class="profile-row" data-fid="${f.id}"
               style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
            <span style="flex:1">${escHtml(f.profile_name)}${f.description
              ? ` <small style="color:var(--text-muted)"> — ${escHtml(f.description)}</small>` : ''}</span>
            <button class="btn btn-secondary btn-sm profile-rename-btn" data-fid="${f.id}">Rename</button>
            <button class="btn btn-danger btn-sm profile-del-btn" data-fid="${f.id}">Del</button>
          </div>`).join('')}
      </div>`).join('');

    const hasExisting = families.length > 0;
    profilesSection.innerHTML = `
      <details style="margin-bottom:16px">
        <summary style="cursor:pointer;font-weight:600;padding:8px 0;color:var(--text-muted);
                        font-size:0.85rem;letter-spacing:0.06em;text-transform:uppercase;user-select:none">
          Material Profiles (${families.length})
        </summary>
        <div class="card" style="margin-top:8px">
          ${famRows || '<p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:12px">No profiles yet.</p>'}
          <div style="${hasExisting ? 'margin-top:14px;border-top:1px solid var(--border);padding-top:12px' : ''}">
            <strong style="font-size:0.875rem">Add Profile</strong>
            <div class="form-row" style="margin-top:8px">
              <div><label>Material</label>
                <input id="pf-material" type="text" placeholder="e.g. Walnut"></div>
              <div style="flex:1"><label>Profile Name</label>
                <input id="pf-name" type="text" placeholder="e.g. 5mm stock"></div>
              <div style="flex:2"><label>Description (optional)</label>
                <input id="pf-desc" type="text"></div>
              <div style="display:flex;align-items:flex-end">
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
      if (!mat || !name) return showBanner('Material and profile name are required');
      try {
        await apiFetch('/api/families', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ material: mat, profile_name: name, description: desc || null }),
        });
        await loadFamilies();
      } catch (e) { showBanner(e.message); }
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
        <input type="text" id="rn-input-${fid}" value="${escHtml(fam?.profile_name ?? '')}"
               style="flex:1;margin-right:4px">
        <button class="btn btn-primary btn-sm profile-rename-save" data-fid="${fid}">Save</button>
        <button class="btn btn-secondary btn-sm profile-rename-cancel" data-fid="${fid}">Cancel</button>`;
      document.getElementById(`rn-input-${fid}`)?.focus();
      return;
    }
    if (e.target.classList.contains('profile-rename-save')) {
      const newName = document.getElementById(`rn-input-${fid}`)?.value.trim();
      if (!newName) return showBanner('Name is required');
      try {
        await apiFetch(`/api/families/${fid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_name: newName }),
        });
        await loadFamilies();
        await loadData();
      } catch (e) { showBanner(e.message); }
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
      } catch (e) { showBanner(e.message); }
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
      <div class="inline-form">
        <h2>${title}${row
          ? ` <small style="color:var(--text-muted);font-weight:normal;font-size:0.65em">&nbsp;#${row.id} &nbsp;${escHtml(row.material)} / ${row.operation}</small>`
          : ''}</h2>
        ${isImprove ? `<p style="color:var(--text-muted);font-size:0.875rem;margin-top:0">
          Creates a new candidate from this setting. The confirmed setting will be archived.</p>` : ''}
        <div class="form-row">
          <div style="flex:1">
            <label>Material <small title="Never laser PVC/vinyl">⚠</small></label>
            ${isImprove
              ? `<input type="text" value="${escHtml(mat)}" disabled style="opacity:0.6">`
              : `<input id="f-material" type="text" value="${escHtml(mat)}" placeholder="e.g. Walnut">`}
          </div>
          <div>
            <label>Operation</label>
            ${isImprove
              ? `<input type="text" value="${row.operation}" disabled style="opacity:0.6">`
              : `<select id="f-operation">
                  <option value="engrave" ${row?.operation === 'engrave' ? 'selected' : ''}>Engrave</option>
                  <option value="score"   ${row?.operation === 'score'   ? 'selected' : ''}>Score</option>
                  <option value="cut"     ${row?.operation === 'cut'     ? 'selected' : ''}>Cut</option>
                </select>`}
          </div>
          <div>
            <label>Profile</label>
            <select id="f-family">${buildFamilyOptions(mat, row?.family_id)}</select>
          </div>
          <div><label>Power %</label>
            <input id="f-power" type="number" min="0" max="100" value="${row?.power ?? ''}"></div>
          <div><label>Speed (mm/min)</label>
            <input id="f-speed" type="number" min="1" value="${row?.speed ?? ''}"></div>
          <div><label>LPI</label>
            <input id="f-lpi" type="number" min="1" value="${row?.lines_per_inch ?? ''}"></div>
          <div><label>Passes</label>
            <input id="f-passes" type="number" min="1" value="${row?.passes ?? 1}"></div>
          <div><label>Focus Offset (mm)</label>
            <input id="f-focus" type="number" step="0.5" value="${row?.focus_offset_mm ?? 0}"></div>
        </div>
        <div class="form-row">
          <div style="flex:1"><label>Notes</label>
            <input id="f-notes" type="text" value="${escHtml(row?.notes ?? '')}"></div>
          ${!isImprove ? `
          <div><label>Role</label>
            <select id="f-role">
              <option value="candidate" ${!row || row.role === 'candidate' ? 'selected' : ''}>Candidate</option>
              <option value="confirmed" ${row?.role === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            </select>
          </div>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="f-save">${isImprove ? 'Improve' : isEdit ? 'Save' : 'Create'}</button>
          <button class="btn btn-secondary" id="f-cancel">Cancel</button>
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
      } catch (e) { showBanner(e.message); }
    };
  }

  // ── Summary view helpers ──────────────────────────────────────────
  // ── Compact setting row (used in tree view) ──────────────────────
  function renderSettingRow(r) {
    const isArchived = r.role === 'archived';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;
                  gap:6px;padding:5px 0;border-bottom:1px solid var(--border);
                  opacity:${isArchived ? '0.45' : '1'}">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:0.875rem">
          <span class="badge">${r.operation}</span>
          ${ROLE_BADGE[r.role]}
          ${renderLineage(r)}
          ${renderParams(r)}
          ${r.notes ? `<span style="color:var(--text-muted);font-style:italic;font-size:0.8rem">${escHtml(r.notes)}</span>` : ''}
        </div>
        ${!isArchived ? `
        <div style="display:flex;gap:4px">
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
      content.innerHTML = '<p style="color:var(--text-muted)">No settings found.</p>';
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

    // Auto-expand when filtered to a single material
    const autoExpand = matSel.value;

    const html = Object.keys(matGroups).sort().map(mat => {
      const mg           = matGroups[mat];
      const profileCount = Object.keys(mg.profiles).length;
      const totalCount   = rows.filter(r => r.material === mat).length;
      const summary      = `${totalCount} setting${totalCount !== 1 ? 's' : ''}` +
                           (profileCount ? ` · ${profileCount} profile${profileCount !== 1 ? 's' : ''}` : '');
      const matKey       = `mat_${mat.replace(/\W/g, '_')}`;
      const isOpen       = autoExpand === mat;

      // Profile sub-groups (sorted by name)
      const profileHtml = Object.values(mg.profiles)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(pg => `
          <div style="margin:6px 0 6px 12px;padding-left:10px;border-left:2px solid var(--border)">
            <div style="font-size:0.78rem;font-weight:600;text-transform:uppercase;
                        letter-spacing:0.05em;color:var(--text-muted);margin-bottom:2px">
              ${escHtml(pg.name)}
            </div>
            ${sortRows(pg.rows).map(r => renderSettingRow(r)).join('')}
          </div>`).join('');

      // Ungrouped settings
      const ungroupedHtml = mg.ungrouped.length
        ? (profileCount
            ? `<div style="font-size:0.78rem;color:var(--text-muted);margin:8px 0 2px 12px">no profile</div>`
            : '') +
          sortRows(mg.ungrouped).map(r => renderSettingRow(r)).join('')
        : '';

      return `
        <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:4px;overflow:hidden">
          <div class="mat-header" data-matkey="${matKey}"
               style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;user-select:none">
            <span class="mat-arrow" data-matkey="${matKey}"
                  style="font-size:0.7rem;color:var(--text-muted);width:10px">${isOpen ? '▾' : '▶'}</span>
            <strong>${escHtml(mat)}</strong>
            <span style="font-size:0.8rem;color:var(--text-muted)">${summary}</span>
          </div>
          <div class="mat-body" data-matkey="${matKey}"
               style="display:${isOpen ? 'block' : 'none'};padding:4px 12px 10px;
                      border-top:1px solid var(--border)">
            ${profileHtml}${ungroupedHtml}
          </div>
        </div>`;
    }).join('');

    content.innerHTML = html || '<p style="color:var(--text-muted)">No settings found.</p>';
  }

  // ── Flat table view ───────────────────────────────────────────────
  function renderTable(rows) {
    if (!rows.length) { content.innerHTML = '<p style="color:var(--text-muted)">No settings found.</p>'; return; }
    content.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Material</th><th>Op</th><th>Profile</th><th>Role</th>
            <th>Power</th><th>Speed</th><th>LPI</th><th>Passes</th><th>Focus</th><th>Notes</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr style="opacity:${r.role === 'archived' ? '0.5' : '1'}">
                <td>${escHtml(r.material)}</td>
                <td><span class="badge">${r.operation}</span></td>
                <td style="color:var(--text-muted);font-size:0.85rem">${r.family_name ? escHtml(r.family_name) : '—'}</td>
                <td>${ROLE_BADGE[r.role]}</td>
                <td>${r.power ?? '—'}</td><td>${r.speed ?? '—'}</td>
                <td>${r.lines_per_inch ?? '—'}</td><td>${r.passes}</td>
                <td>${r.focus_offset_mm}</td>
                <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.notes ?? '')}</td>
                <td style="white-space:nowrap">
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
      content.innerHTML = `<div class="banner banner-error">${escHtml(e.message)}</div>`;
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
        const open = body.style.display !== 'none';
        body.style.display  = open ? 'none' : 'block';
        if (arrow) arrow.textContent = open ? '▶' : '▾';
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
      } catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('confirm-btn')) {
      try { await apiFetch(`/api/settings/${id}/confirm`, { method: 'PUT' }); await loadData(); }
      catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('unconfirm-btn')) {
      try { await apiFetch(`/api/settings/${id}/unconfirm`, { method: 'PUT' }); await loadData(); }
      catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('edit-btn')) {
      try {
        const row = await apiFetch(`/api/settings/${id}`);
        renderForm(row, 'edit');
        window.scrollTo(0, 0);
      } catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('del-btn')) {
      if (!confirm('Delete this setting?')) return;
      try { await apiFetch(`/api/settings/${id}`, { method: 'DELETE' }); await loadData(); }
      catch (err) { showBanner(err.message); }
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
