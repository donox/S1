window.projectsInit = async function () {
  const list      = document.getElementById('projects-list');
  const formWrap  = document.getElementById('project-form-wrap');
  const banner    = document.getElementById('projects-banner');
  const statusSel = document.getElementById('proj-status-filter');

  const MILESTONE_LABELS = {
    design:            'Design complete',
    material_acquired: 'Material acquired',
    test_run:          'Test run done',
    production:        'Production run',
    finishing:         'Finishing work',
    documented:        'Photographed / documented',
  };

  const STATUS_COLOR = { active: '#27ae60', paused: '#f5a623', complete: '#9a9aaa', abandoned: '#c0392b' };

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function showBanner(msg, type = 'error') {
    // Errors are persistent — user must see them. Success messages auto-dismiss.
    banner.innerHTML = `<div class="banner banner-${type}">${msg}</div>`;
    if (type !== 'error') setTimeout(() => { banner.innerHTML = ''; }, 4000);
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

    formWrap.innerHTML = `
      <div class="inline-form" style="margin-bottom:20px">
        <h2>${isEdit ? 'Edit Project' : 'New Project'}</h2>
        <div class="form-row">
          <div style="flex:2"><label>Name</label>
            <input id="pf-name" type="text" value="${project?.name ?? ''}" placeholder="e.g. Walnut Coaster Set"></div>
          <div><label>Status</label>
            <select id="pf-status">
              <option value="active"    ${project?.status==='active'   ?'selected':''}>Active</option>
              <option value="paused"    ${project?.status==='paused'   ?'selected':''}>Paused</option>
              <option value="complete"  ${project?.status==='complete' ?'selected':''}>Complete</option>
              <option value="abandoned" ${project?.status==='abandoned'?'selected':''}>Abandoned</option>
            </select></div>
        </div>
        <div class="form-row">
          <div style="flex:1"><label>Goal</label>
            <textarea id="pf-goal" style="min-height:50px">${project?.goal ?? ''}</textarea></div>
        </div>
        ${isEdit ? `
        <div style="margin-bottom:14px">
          <label style="display:block;margin-bottom:8px">Milestones</label>
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            ${Object.entries(MILESTONE_LABELS).map(([key, label]) => `
              <label style="display:flex;align-items:center;gap:6px;font-size:0.875rem;color:var(--text)">
                <input type="checkbox" data-milestone="${key}" ${m[key] ? 'checked' : ''}
                  style="accent-color:var(--accent)">
                ${label}
              </label>`).join('')}
          </div>
        </div>
        <div class="form-row">
          <div style="flex:1"><label>Outcome notes</label>
            <textarea id="pf-outcome" style="min-height:50px">${project?.outcome ?? ''}</textarea></div>
        </div>` : ''}
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="pf-save">${isEdit ? 'Save' : 'Create'}</button>
          <button class="btn btn-secondary" id="pf-cancel">Cancel</button>
        </div>
      </div>`;

    if (isEdit) {
      list.style.display = 'none';
      formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function closeForm() {
      formWrap.innerHTML = '';
      list.style.display = '';
    }

    document.getElementById('pf-cancel').onclick = () => { closeForm(); };
    document.getElementById('pf-save').onclick = async () => {
      const payload = {
        name:   document.getElementById('pf-name').value.trim(),
        goal:   document.getElementById('pf-goal').value.trim() || null,
        status: document.getElementById('pf-status').value,
      };
      if (!payload.name) { showBanner('Name is required.'); return; }

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
      } catch (e) { showBanner(e.message); }
    };
  }

  async function loadData() {
    const status = statusSel.value;
    try {
      // Always fetch all for counts, then filter for display
      const all      = await apiFetch('/api/projects');
      const projects = status ? all.filter(p => p.status === status) : all;

      // Status count badges
      const counts = {};
      all.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
      const COLOR = { active: '#27ae60', paused: '#f5a623', complete: '#9a9aaa', abandoned: '#c0392b' };
      document.getElementById('proj-status-counts').innerHTML =
        Object.entries(counts).map(([s, n]) =>
          `<span class="badge" style="color:${COLOR[s]};border:1px solid ${COLOR[s]};cursor:pointer" data-filter="${s}">${n} ${s}</span>`
        ).join('') + (all.length ? `<span class="badge" style="cursor:pointer" data-filter="">all ${all.length}</span>` : '');

      if (!projects.length) {
        list.innerHTML = '<p style="color:var(--text-muted)">No projects found. Create one to get started.</p>';
        return;
      }

      list.innerHTML = projects.map(p => {
        const prog = milestoneProgress(p.milestones);
        const sessions = ''; // loaded on expand
        return `
          <div class="card project-card" data-id="${p.id}" style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <strong style="font-size:1rem">${p.name}</strong>
                  <span class="badge" style="color:${STATUS_COLOR[p.status]}">${p.status}</span>
                </div>
                ${p.goal ? `<div style="color:var(--text-muted);font-size:0.85rem;margin-top:4px">${p.goal}</div>` : ''}
                <div style="margin-top:10px">
                  <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">
                    Milestones: ${prog.done}/${prog.total}
                  </div>
                  <div style="background:var(--border);border-radius:4px;height:6px;width:200px;max-width:100%">
                    <div style="background:var(--accent);width:${prog.pct}%;height:6px;border-radius:4px;transition:width 0.3s"></div>
                  </div>
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0">
                <button class="btn btn-secondary btn-sm edit-proj" data-id="${p.id}">Edit</button>
                <button class="btn btn-secondary btn-sm expand-proj" data-id="${p.id}">Details ▾</button>
                <button class="btn btn-danger btn-sm del-proj" data-id="${p.id}">Del</button>
              </div>
            </div>
            <div class="proj-detail" data-id="${p.id}" style="display:none;margin-top:16px;border-top:1px solid var(--border);padding-top:14px"></div>
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
      list.innerHTML = `<div class="banner banner-error">${e.message}</div>`;
    }
  }

  async function loadDetail(projectId, detailEl) {
    try {
      const p = await apiFetch(`/api/projects/${projectId}`);
      const m = typeof p.milestones === 'string' ? JSON.parse(p.milestones) : p.milestones;

      detailEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
          <div>
            <h3>Milestones</h3>
            ${Object.entries(MILESTONE_LABELS).map(([key, label]) => `
              <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.875rem">
                <span style="color:${m[key] ? 'var(--success)' : 'var(--border)'}">
                  ${m[key] ? '✓' : '○'}
                </span>
                <span style="color:${m[key] ? 'var(--text)' : 'var(--text-muted)'}">${label}</span>
              </div>`).join('')}
          </div>
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <h3 style="margin:0">Sessions (${p.sessions.length})</h3>
              ${p.sessions.length ? `<button class="btn btn-secondary btn-sm proj-go-sessions" data-project-id="${p.id}">View all →</button>` : ''}
            </div>
            ${p.sessions.length ? p.sessions.slice(0, 5).map(s => `
              <div style="font-size:0.8rem;padding:4px 0;border-bottom:1px solid var(--border)">
                <span style="color:var(--text-muted)">${s.job_date}</span>
                <span class="badge" style="margin-left:4px">${s.status}</span>
                ${s.material ? ` · ${s.material}` : ''}
                ${s.operation ? ` · <span class="badge">${s.operation}</span>` : ''}
                ${s.outcome ? ` · <span style="color:${s.outcome==='success'?'var(--success)':'var(--accent)'}">${s.outcome}</span>` : ''}
              </div>`).join('') + (p.sessions.length > 5 ? `<div style="font-size:0.75rem;color:var(--text-muted);padding-top:4px">+ ${p.sessions.length-5} more</div>` : '')
            : '<p style="color:var(--text-muted);font-size:0.85rem">No sessions yet.</p>'}
          </div>
        </div>
        ${p.outcome ? `<div style="margin-top:14px"><strong style="font-size:0.85rem">Outcome:</strong> <span style="font-size:0.875rem;color:var(--text-muted)">${p.outcome}</span></div>` : ''}`;
    } catch (e) {
      detailEl.innerHTML = `<div class="banner banner-error">${e.message}</div>`;
    }
  }

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
      catch (err) { showBanner(err.message); }
    }

    if (e.target.classList.contains('del-proj')) {
      if (!confirm('Delete this project? Sessions will be detached but not deleted.')) return;
      try { await apiFetch(`/api/projects/${id}`, { method: 'DELETE' }); await loadData(); }
      catch (err) { showBanner(err.message); }
    }

    if (e.target.classList.contains('expand-proj')) {
      const detail = list.querySelector(`.proj-detail[data-id="${id}"]`);
      if (detail.style.display === 'none') {
        detail.style.display = 'block';
        e.target.textContent = 'Details ▴';
        if (!detail.dataset.loaded) {
          detail.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Loading…</p>';
          await loadDetail(id, detail);
          detail.dataset.loaded = '1';
        }
      } else {
        detail.style.display = 'none';
        e.target.textContent = 'Details ▾';
      }
    }
  });

  await loadData();
};
