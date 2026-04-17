window.projectsInit = async function () {
  const list      = document.getElementById('projects-list');
  const formWrap  = document.getElementById('project-form-wrap');
  const statusSel = document.getElementById('proj-status-filter');

  let cachedUsers = [];

  const MILESTONE_LABELS = {
    design:            'Design complete',
    material_acquired: 'Material acquired',
    test_run:          'Test run done',
    production:        'Production run',
    finishing:         'Finishing work',
    documented:        'Photographed / documented',
  };

  const STATUS_BS = {
    active:    'text-bg-success',
    paused:    'text-bg-warning',
    complete:  'text-bg-secondary',
    abandoned: 'text-bg-danger',
  };

  const STATUS_OUTLINE = {
    active:    'text-success border-success',
    paused:    'text-warning border-warning',
    complete:  'text-secondary border-secondary',
    abandoned: 'text-danger border-danger',
  };

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function milestoneProgress(milestones) {
    try {
      const m = typeof milestones === 'string' ? JSON.parse(milestones) : milestones;
      const total = Object.keys(m).length;
      const done  = Object.values(m).filter(Boolean).length;
      return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
    } catch { return { done: 0, total: 0, pct: 0 }; }
  }

  function renderForm(project = null) {
    const isEdit = !!project;
    const m = project?.milestones
      ? (typeof project.milestones === 'string' ? JSON.parse(project.milestones) : project.milestones)
      : {};
    const defaultUserId = cachedUsers.find(u => u.is_default)?.id ?? '';

    formWrap.innerHTML = `
      <div class="card card-body mb-4">
        <h2 class="h5 mb-3">${isEdit ? 'Edit Project' : 'New Project'}</h2>
        <div class="row g-2 mb-2">
          <div class="col-md">
            <label class="form-label small">Name</label>
            <input class="form-control form-control-sm" id="pf-name" type="text"
              value="${project?.name ?? ''}" placeholder="e.g. Walnut Coaster Set">
          </div>
          <div class="col-md-auto">
            <label class="form-label small">Status</label>
            <select class="form-select form-select-sm" id="pf-status">
              <option value="active"    ${project?.status==='active'   ?'selected':''}>Active</option>
              <option value="paused"    ${project?.status==='paused'   ?'selected':''}>Paused</option>
              <option value="complete"  ${project?.status==='complete' ?'selected':''}>Complete</option>
              <option value="abandoned" ${project?.status==='abandoned'?'selected':''}>Abandoned</option>
            </select>
          </div>
          <div class="col-md-auto">
            <label class="form-label small">Owner</label>
            <select class="form-select form-select-sm" id="pf-owner">
              <option value="">— None —</option>
              ${cachedUsers.map(u => `<option value="${u.id}" ${(project?.owner_id ?? defaultUserId) == u.id ? 'selected' : ''}>${u.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="mb-2">
          <label class="form-label small">Goal</label>
          <textarea class="form-control form-control-sm" id="pf-goal" rows="2">${project?.goal ?? ''}</textarea>
        </div>
        ${isEdit ? `
        <div class="mb-3">
          <label class="form-label small d-block mb-2">Milestones</label>
          <div class="d-flex flex-wrap gap-3">
            ${Object.entries(MILESTONE_LABELS).map(([key, label]) => `
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="ms-${key}" data-milestone="${key}" ${m[key] ? 'checked' : ''}>
                <label class="form-check-label small" for="ms-${key}">${label}</label>
              </div>`).join('')}
          </div>
        </div>
        <div class="mb-2">
          <label class="form-label small">Outcome notes</label>
          <textarea class="form-control form-control-sm" id="pf-outcome" rows="2">${project?.outcome ?? ''}</textarea>
        </div>` : ''}
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-primary btn-sm" id="pf-save">${isEdit ? 'Save' : 'Create'}</button>
          <button class="btn btn-secondary btn-sm" id="pf-cancel">Cancel</button>
        </div>
      </div>`;

    if (isEdit) {
      list.classList.add('d-none');
      formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function closeForm() {
      formWrap.innerHTML = '';
      list.classList.remove('d-none');
    }

    document.getElementById('pf-cancel').onclick = () => { closeForm(); };
    document.getElementById('pf-save').onclick = async () => {
      const nameInput = document.getElementById('pf-name');
      const payload = {
        name:     nameInput.value.trim(),
        goal:     document.getElementById('pf-goal').value.trim() || null,
        status:   document.getElementById('pf-status').value,
        owner_id: +document.getElementById('pf-owner').value || null,
      };
      if (!payload.name) {
        nameInput.classList.add('is-invalid');
        window.showToast('Name is required.');
        return;
      }
      nameInput.classList.remove('is-invalid');

      if (isEdit) {
        const milestones = {};
        formWrap.querySelectorAll('[data-milestone]').forEach(cb => {
          milestones[cb.dataset.milestone] = cb.checked;
        });
        payload.milestones = milestones;
        payload.outcome = document.getElementById('pf-outcome').value.trim() || null;
      }

      try {
        if (isEdit) {
          await apiFetch(`/api/projects/${project.id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        } else {
          await apiFetch('/api/projects', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        }
        closeForm();
        await loadData();
      } catch (e) { window.showToast(e.message); }
    };
  }

  async function loadData() {
    const status = statusSel.value;
    try {
      const all      = await apiFetch('/api/projects');
      const projects = status ? all.filter(p => p.status === status) : all;

      // Status count badges
      const counts = {};
      all.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
      document.getElementById('proj-status-counts').innerHTML =
        Object.entries(counts).map(([s, n]) =>
          `<span class="badge border ${STATUS_OUTLINE[s] || 'text-secondary border-secondary'} clickable" data-filter="${s}">${n} ${s}</span>`
        ).join('') + (all.length ? `<span class="badge border text-secondary border-secondary clickable" data-filter="">all ${all.length}</span>` : '');

      if (!projects.length) {
        list.innerHTML = '<p class="text-muted">No projects found. Create one to get started.</p>';
        return;
      }

      list.innerHTML = projects.map(p => {
        const prog = milestoneProgress(p.milestones);
        return `
          <div class="card mb-2 project-card" data-id="${p.id}">
            <div class="card-body py-2">
              <div class="d-flex justify-content-between align-items-start gap-3">
                <div class="flex-grow-1 min-width-0">
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <strong>${p.name}</strong>
                    <span class="badge ${STATUS_BS[p.status] || 'text-bg-secondary'}">${p.status}</span>
                  </div>
                  ${p.goal ? `<div class="text-muted small mt-1">${p.goal}</div>` : ''}
                  ${p.owner_name ? `<div class="text-muted" style="font-size:0.78rem">Owner: ${p.owner_name}</div>` : ''}
                  <div class="mt-2">
                    <div class="text-muted small mb-1">Milestones: ${prog.done}/${prog.total}</div>
                    <div class="progress progress-thin" style="width:200px;max-width:100%">
                      <div class="progress-bar bg-primary" style="width:${prog.pct}%"></div>
                    </div>
                  </div>
                </div>
                <div class="d-flex gap-1 flex-shrink-0">
                  <button class="btn btn-secondary btn-sm edit-proj" data-id="${p.id}">Edit</button>
                  <button class="btn btn-secondary btn-sm expand-proj" data-id="${p.id}">Details ▾</button>
                  <button class="btn btn-danger btn-sm del-proj" data-id="${p.id}">Del</button>
                </div>
              </div>
              <div class="proj-detail d-none mt-3 pt-3 border-top" data-id="${p.id}"></div>
            </div>
          </div>`;
      }).join('');

      // Auto-expand a project when navigated from home page
      const autoId = window._autoExpandProjectId;
      if (autoId) {
        window._autoExpandProjectId = null;
        const expandBtn = list.querySelector(`.expand-proj[data-id="${autoId}"]`);
        if (expandBtn) {
          expandBtn.click();
          setTimeout(() => {
            list.querySelector(`.project-card[data-id="${autoId}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 150);
        }
      }
    } catch (e) {
      list.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  }

  async function loadDetail(projectId, detailEl) {
    try {
      const p = await apiFetch(`/api/projects/${projectId}`);
      const m = typeof p.milestones === 'string' ? JSON.parse(p.milestones) : p.milestones;

      const OUTCOME_CLASS = { success: 'text-success', partial: 'text-warning', failed: 'text-danger' };

      detailEl.innerHTML = `
        <div class="row g-3">
          <div class="col-md-6">
            <h3 class="h6 fw-semibold mb-2">Milestones</h3>
            ${Object.entries(MILESTONE_LABELS).map(([key, label]) => `
              <div class="d-flex align-items-center gap-2 py-1 small">
                <span class="${m[key] ? 'text-success' : 'text-muted'}">${m[key] ? '✓' : '○'}</span>
                <span class="${m[key] ? '' : 'text-muted'}">${label}</span>
              </div>`).join('')}
          </div>
          <div class="col-md-6">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h3 class="h6 fw-semibold mb-0">Sessions (${p.sessions.length})</h3>
              ${p.sessions.length ? `<button class="btn btn-secondary btn-sm proj-go-sessions" data-project-id="${p.id}">View all →</button>` : ''}
            </div>
            ${p.sessions.length ? p.sessions.slice(0, 5).map(s => `
              <div class="d-flex align-items-center gap-1 py-1 border-bottom small flex-wrap">
                <span class="text-muted">${s.job_date}</span>
                <span class="badge text-bg-secondary ms-1">${s.status}</span>
                ${s.material ? `<span class="text-muted">· ${s.material}</span>` : ''}
                ${s.operation ? `<span class="badge text-bg-secondary">${s.operation}</span>` : ''}
                ${s.outcome ? `<span class="${OUTCOME_CLASS[s.outcome] || 'text-muted'}">${s.outcome}</span>` : ''}
              </div>`).join('') + (p.sessions.length > 5 ? `<div class="text-muted pt-1" style="font-size:0.75rem">+ ${p.sessions.length-5} more</div>` : '')
            : '<p class="text-muted small">No sessions yet.</p>'}
          </div>
        </div>
        ${p.outcome ? `<div class="mt-3"><span class="small fw-semibold">Outcome:</span> <span class="text-muted small">${p.outcome}</span></div>` : ''}`;
    } catch (e) {
      detailEl.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  }

  try { cachedUsers = await apiFetch('/api/users'); } catch (_) { cachedUsers = []; }

  document.getElementById('btn-new-project').onclick = () => renderForm();
  statusSel.addEventListener('change', loadData);

  // Status count badges act as filter shortcuts
  document.getElementById('proj-status-counts').addEventListener('click', e => {
    const badge = e.target.closest('[data-filter]');
    if (!badge) return;
    statusSel.value = badge.dataset.filter;
    loadData();
  });

  list.addEventListener('click', async e => {
    // proj-go-sessions uses data-project-id, not data-id, so check it first
    if (e.target.classList.contains('proj-go-sessions')) {
      const projId = e.target.dataset.projectId;
      if (typeof navigate === 'function') {
        navigate('sessions');
        setTimeout(() => {
          const sel = document.getElementById('sf-project');
          if (sel) { sel.value = projId; document.getElementById('btn-filter-sessions')?.click(); }
        }, 300);
      }
      return;
    }

    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains('edit-proj')) {
      try { const p = await apiFetch(`/api/projects/${id}`); renderForm(p); }
      catch (err) { window.showToast(err.message); }
    }

    if (e.target.classList.contains('del-proj')) {
      if (!confirm('Delete this project? Sessions will be detached but not deleted.')) return;
      try { await apiFetch(`/api/projects/${id}`, { method: 'DELETE' }); await loadData(); }
      catch (err) { window.showToast(err.message); }
    }

    if (e.target.classList.contains('expand-proj')) {
      const detail = list.querySelector(`.proj-detail[data-id="${id}"]`);
      const isHidden = detail.classList.contains('d-none');
      if (isHidden) {
        detail.classList.remove('d-none');
        e.target.textContent = 'Details ▴';
        if (!detail.dataset.loaded) {
          detail.innerHTML = '<p class="text-muted small">Loading…</p>';
          await loadDetail(id, detail);
          detail.dataset.loaded = '1';
        }
      } else {
        detail.classList.add('d-none');
        e.target.textContent = 'Details ▾';
      }
    }
  });

  await loadData();
};
