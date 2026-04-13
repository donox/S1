window.settingsInit = async function () {
  const content  = document.getElementById('settings-content');
  const matSel   = document.getElementById('filter-material');
  const opSel    = document.getElementById('filter-operation');
  const archCb   = document.getElementById('filter-archived');
  const sumCb    = document.getElementById('view-summary');
  const formWrap = document.getElementById('setting-form-wrap');

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
    setTimeout(() => b.remove(), 4000);
  }

  const ROLE_BADGE = {
    confirmed: '<span class="badge" style="color:#27ae60;border:1px solid #27ae60">✓ confirmed</span>',
    candidate: '<span class="badge" style="color:var(--text-muted)">candidate</span>',
    archived:  '<span class="badge" style="color:var(--border)">archived</span>',
  };

  async function loadMaterials() {
    const rows = await apiFetch('/api/settings?archived=1');
    const mats = [...new Set(rows.map(r => r.material))].sort();
    const cur  = matSel.value;
    matSel.innerHTML = '<option value="">All</option>' +
      mats.map(m => `<option value="${m}" ${m===cur?'selected':''}>${m}</option>`).join('');
  }

  function renderForm(row = null) {
    const isEdit = !!row;
    formWrap.innerHTML = `
      <div class="inline-form">
        <h2>${isEdit ? 'Edit Setting' : 'New Setting'}</h2>
        <div class="form-row">
          <div style="flex:1"><label>Material <small title="Never laser PVC/vinyl">⚠</small></label>
            <input id="f-material" type="text" value="${row?.material ?? ''}" placeholder="e.g. Walnut"></div>
          <div><label>Operation</label>
            <select id="f-operation">
              <option value="engrave" ${row?.operation==='engrave'?'selected':''}>Engrave</option>
              <option value="score"   ${row?.operation==='score'  ?'selected':''}>Score</option>
              <option value="cut"     ${row?.operation==='cut'    ?'selected':''}>Cut</option>
            </select></div>
          <div><label>Power %</label><input id="f-power" type="number" min="0" max="100" value="${row?.power??''}"></div>
          <div><label>Speed (mm/min)</label><input id="f-speed" type="number" min="1" value="${row?.speed??''}"></div>
          <div><label>LPI</label><input id="f-lpi" type="number" min="1" value="${row?.lines_per_inch??''}"></div>
          <div><label>Passes</label><input id="f-passes" type="number" min="1" value="${row?.passes??1}"></div>
          <div><label>Focus Offset (mm)</label><input id="f-focus" type="number" step="0.5" value="${row?.focus_offset_mm??0}"></div>
        </div>
        <div class="form-row">
          <div style="flex:1"><label>Notes</label><input id="f-notes" type="text" value="${row?.notes??''}"></div>
          <div><label>Role</label>
            <select id="f-role">
              <option value="candidate" ${row?.role==='candidate'?'selected':''}>Candidate</option>
              <option value="confirmed" ${row?.role==='confirmed'?'selected':''}>Confirmed</option>
            </select></div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="f-save">${isEdit ? 'Save' : 'Create'}</button>
          <button class="btn btn-secondary" id="f-cancel">Cancel</button>
        </div>
      </div>`;

    document.getElementById('f-cancel').onclick = () => { formWrap.innerHTML = ''; };
    document.getElementById('f-save').onclick = async () => {
      const payload = {
        material:        document.getElementById('f-material').value.trim(),
        operation:       document.getElementById('f-operation').value,
        power:           +document.getElementById('f-power').value   || null,
        speed:           +document.getElementById('f-speed').value   || null,
        lines_per_inch:  +document.getElementById('f-lpi').value     || null,
        passes:          +document.getElementById('f-passes').value  || 1,
        focus_offset_mm: +document.getElementById('f-focus').value   || 0,
        notes:           document.getElementById('f-notes').value.trim(),
        role:            document.getElementById('f-role').value,
      };
      try {
        if (isEdit) {
          const role = payload.role;
          // If confirming, use the dedicated endpoint to handle archive-previous
          if (role === 'confirmed' && row.role !== 'confirmed') {
            delete payload.role;
            await apiFetch(`/api/settings/${row.id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            await apiFetch(`/api/settings/${row.id}/confirm`, { method: 'PUT' });
          } else {
            await apiFetch(`/api/settings/${row.id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
          }
        } else {
          await apiFetch('/api/settings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        }
        formWrap.innerHTML = '';
        await loadData();
      } catch (e) { showBanner(e.message); }
    };
  }

  // ── Grouped summary view ──────────────────────────────────────────
  function renderSummary(rows) {
    // Group by material+operation, confirmed first within each group
    const groups = {};
    rows.forEach(r => {
      const key = `${r.material}||${r.operation}`;
      if (!groups[key]) groups[key] = { material: r.material, operation: r.operation, confirmed: null, candidates: [] };
      if (r.role === 'confirmed') groups[key].confirmed = r;
      else groups[key].candidates.push(r);
    });

    const keys = Object.keys(groups).sort();
    if (!keys.length) { content.innerHTML = '<p style="color:var(--text-muted)">No settings found.</p>'; return; }

    content.innerHTML = keys.map(key => {
      const g  = groups[key];
      const primary = g.confirmed ?? g.candidates[0];
      if (!primary) return '';
      const hasExtra = g.candidates.length > (g.confirmed ? 0 : 1);

      return `
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <strong>${primary.material}</strong>
              <span class="badge">${primary.operation}</span>
              ${ROLE_BADGE[primary.role]}
              <span style="font-size:0.875rem;color:var(--text-muted)">
                ${primary.power??'—'}% &nbsp;·&nbsp; ${primary.speed??'—'} mm/min
                ${primary.lines_per_inch ? `&nbsp;·&nbsp; ${primary.lines_per_inch} LPI` : ''}
                ${primary.passes > 1 ? `&nbsp;·&nbsp; ${primary.passes} passes` : ''}
                ${primary.focus_offset_mm ? `&nbsp;·&nbsp; focus ${primary.focus_offset_mm}mm` : ''}
              </span>
              ${primary.notes ? `<span style="font-size:0.8rem;color:var(--text-muted);font-style:italic">${primary.notes}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${primary.role !== 'confirmed' ? `<button class="btn btn-secondary btn-sm confirm-btn" data-id="${primary.id}" title="Mark as confirmed go-to setting">✓ Confirm</button>` : ''}
              ${primary.role === 'confirmed' ? `<button class="btn btn-secondary btn-sm unconfirm-btn" data-id="${primary.id}">Unconfirm</button>` : ''}
              <button class="btn btn-secondary btn-sm edit-btn" data-id="${primary.id}">Edit</button>
              <button class="btn btn-danger btn-sm del-btn" data-id="${primary.id}">Del</button>
              ${hasExtra || g.candidates.length > 0 ? `<button class="btn btn-secondary btn-sm expand-btn" data-key="${key}">+${g.candidates.length} more ▾</button>` : ''}
            </div>
          </div>
          <div class="expanded-rows" data-key="${key}" style="display:none;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
            ${[...g.candidates].map(r => renderCandidateRow(r, g.confirmed?.id)).join('')}
          </div>
        </div>`;
    }).join('');
  }

  function renderCandidateRow(r, confirmedId) {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:0.85rem;color:var(--text-muted)">
          ${ROLE_BADGE[r.role]}
          ${r.power??'—'}% &nbsp;·&nbsp; ${r.speed??'—'} mm/min
          ${r.lines_per_inch ? `&nbsp;·&nbsp; ${r.lines_per_inch} LPI` : ''}
          ${r.passes > 1 ? `&nbsp;·&nbsp; ${r.passes} passes` : ''}
          ${r.notes ? `&nbsp;·&nbsp; <em>${r.notes}</em>` : ''}
        </span>
        <div style="display:flex;gap:4px">
          ${r.role !== 'confirmed' ? `<button class="btn btn-secondary btn-sm confirm-btn" data-id="${r.id}">✓ Confirm</button>` : ''}
          <button class="btn btn-secondary btn-sm edit-btn" data-id="${r.id}">Edit</button>
          <button class="btn btn-danger btn-sm del-btn" data-id="${r.id}">Del</button>
        </div>
      </div>`;
  }

  // ── Flat table view ───────────────────────────────────────────────
  function renderTable(rows) {
    if (!rows.length) { content.innerHTML = '<p style="color:var(--text-muted)">No settings found.</p>'; return; }
    content.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Material</th><th>Op</th><th>Role</th><th>Power</th><th>Speed</th>
            <th>LPI</th><th>Passes</th><th>Focus</th><th>Notes</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr style="opacity:${r.role==='archived'?'0.5':'1'}">
                <td>${r.material}</td>
                <td><span class="badge">${r.operation}</span></td>
                <td>${ROLE_BADGE[r.role]}</td>
                <td>${r.power??'—'}</td><td>${r.speed??'—'}</td>
                <td>${r.lines_per_inch??'—'}</td><td>${r.passes}</td>
                <td>${r.focus_offset_mm}</td>
                <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.notes??''}</td>
                <td>
                  ${r.role!=='confirmed'?`<button class="btn btn-secondary btn-sm confirm-btn" data-id="${r.id}">✓</button>`:''}
                  ${r.role==='confirmed'?`<button class="btn btn-secondary btn-sm unconfirm-btn" data-id="${r.id}">−</button>`:''}
                  <button class="btn btn-secondary btn-sm edit-btn" data-id="${r.id}">Edit</button>
                  <button class="btn btn-danger btn-sm del-btn" data-id="${r.id}">Del</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function loadData() {
    const params = new URLSearchParams();
    if (matSel.value)  params.set('material',  matSel.value);
    if (opSel.value)   params.set('operation',  opSel.value);
    if (archCb.checked) params.set('archived',  '1');
    try {
      const rows = await apiFetch(`/api/settings?${params}`);
      if (sumCb.checked) renderSummary(rows);
      else renderTable(rows);
    } catch (e) {
      content.innerHTML = `<div class="banner banner-error">${e.message}</div>`;
    }
  }

  // ── Event delegation ──────────────────────────────────────────────
  content.addEventListener('click', async e => {
    const id = e.target.dataset.id;

    if (e.target.classList.contains('expand-btn')) {
      const key = e.target.dataset.key;
      const expanded = content.querySelector(`.expanded-rows[data-key="${key}"]`);
      if (expanded) {
        const open = expanded.style.display !== 'none';
        expanded.style.display = open ? 'none' : 'block';
        e.target.textContent = open
          ? e.target.textContent.replace('▴','▾')
          : e.target.textContent.replace('▾','▴');
      }
      return;
    }

    if (!id) return;

    if (e.target.classList.contains('confirm-btn')) {
      try { await apiFetch(`/api/settings/${id}/confirm`, { method: 'PUT' }); await loadData(); }
      catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('unconfirm-btn')) {
      try { await apiFetch(`/api/settings/${id}/unconfirm`, { method: 'PUT' }); await loadData(); }
      catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('edit-btn')) {
      try { const row = await apiFetch(`/api/settings/${id}`); renderForm(row); window.scrollTo(0,0); }
      catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('del-btn')) {
      if (!confirm('Delete this setting?')) return;
      try { await apiFetch(`/api/settings/${id}`, { method: 'DELETE' }); await loadData(); }
      catch (err) { showBanner(err.message); }
    }
  });

  document.getElementById('btn-filter').onclick     = loadData;
  document.getElementById('btn-new-setting').onclick = () => renderForm();
  document.getElementById('view-summary').addEventListener('change', loadData);
  document.getElementById('filter-archived').addEventListener('change', loadData);

  await loadMaterials();
  await loadData();
};
