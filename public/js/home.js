window.homeInit = async function () {

  // ── Quick nav ─────────────────────────────────────────────────────
  const NAV_CARDS = [
    { page: 'projects',  label: 'Projects',   abbr: 'PRJ', color: '#27ae60', desc: 'Multi-session work' },
    { page: 'sessions',  label: 'Sessions',   abbr: 'SES', color: '#3498db', desc: 'Log & track sessions' },
    { page: 'settings',  label: 'Materials',  abbr: 'MAT', color: '#e94560', desc: 'Power, speed, LPI' },
    { page: 'artifacts', label: 'Artifacts',  abbr: 'ART', color: '#8e44ad', desc: 'Named pieces + param deltas' },
    { page: 'docs',      label: 'Docs',       abbr: 'DOC', color: '#f5a623', desc: 'Search the manual' },
    { page: 'notes',     label: 'Notes',      abbr: 'NTS', color: '#9b59b6', desc: 'Tips & learning' },
    { page: 'files',     label: 'Files',      abbr: 'FIL', color: '#1abc9c', desc: 'Project files' },
    { page: 'reference', label: 'Quick Ref',  abbr: 'REF', color: '#e67e22', desc: 'Safety & workflow' },
  ];

  document.getElementById('home-nav').innerHTML = NAV_CARDS.map(c => `
    <a href="/${c.page}" data-page="${c.page}" class="text-decoration-none">
      <div class="card nav-card h-100" style="--card-accent:${c.color}">
        <div class="card-body">
          <div class="nav-card-badge mb-2"
            style="background:${c.color}22;border-color:${c.color};color:${c.color}">${c.abbr}</div>
          <div class="fw-bold small mb-1">${c.label}</div>
          <div class="text-muted small">${c.desc}</div>
        </div>
      </div>
    </a>`).join('');

  document.getElementById('home-nav').addEventListener('click', e => {
    const a = e.target.closest('a[data-page]');
    if (!a) return;
    e.preventDefault();
    if (typeof navigate === 'function') navigate(a.dataset.page);
  });

  document.getElementById('home-ref-link')?.addEventListener('click', e => {
    e.preventDefault();
    if (typeof navigate === 'function') navigate('reference');
  });

  // ── Checklists (scoped to a session) ─────────────────────────────
  const SETUP_ITEMS = [
    'Ventilation running / window open',
    'Material placed and secured on bed',
    'Material confirmed — NO PVC or vinyl',
    'Auto-focus run (or manual focus set)',
    'Red cross alignment verified on workpiece',
    'Lid closed / enclosure secured',
    'Fire extinguisher within reach',
  ];
  const RUN_ITEMS = [
    'File loaded in XCS / LightBurn',
    'Power, speed, LPI settings confirmed',
    'Framing preview run — bounds verified',
    'All clear around machine',
    'Ready to start — will not leave unattended',
  ];

  function checklistKey(sessionId, name) { return `cl-${sessionId}-${name}`; }

  function buildChecklist(items, ulId, storageKey, sessionId, readonly = false) {
    const ul = document.getElementById(ulId);
    if (!ul) return;
    if (readonly) ul.classList.add('checklist-readonly');
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    ul.innerHTML = items.map((text, i) => `
      <li class="d-flex align-items-start gap-2 py-2 border-bottom">
        <input type="checkbox" id="${storageKey}-${i}"
          class="form-check-input mt-1 flex-shrink-0"
          ${saved[i] ? 'checked' : ''} ${readonly ? 'disabled' : ''}>
        <label for="${storageKey}-${i}"
          class="form-check-label small${saved[i] ? ' text-muted text-decoration-line-through' : ''}">${text}</label>
      </li>`).join('');

    if (!readonly) {
      ul.onchange = e => {
        if (e.target.type !== 'checkbox') return;
        const idx   = +e.target.id.split('-').pop();
        const label = e.target.closest('li').querySelector('label');
        label.classList.toggle('text-muted', e.target.checked);
        label.classList.toggle('text-decoration-line-through', e.target.checked);
        const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
        state[idx] = e.target.checked;
        localStorage.setItem(storageKey, JSON.stringify(state));
        if (storageKey.endsWith('-run')) updateRunReady(sessionId);
      };
    }
  }

  function allChecked(storageKey, count) {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return [...Array(count).keys()].every(i => saved[i]);
  }

  function updateRunReady(sessionId) {
    const runKey = checklistKey(sessionId, 'run');
    const ready  = allChecked(runKey, RUN_ITEMS.length);
    const btn    = document.getElementById('btn-begin-session');
    if (btn) {
      btn.disabled = !ready;
      btn.title    = ready ? '' : 'Complete the pre-run checklist first';
    }
  }

  // ── Session context ───────────────────────────────────────────────
  const ctx = document.getElementById('session-context');

  async function loadSessionContext() {
    try {
      const sessions = await fetch('/api/usage?status=in_progress').then(r => r.json());
      const planned  = await fetch('/api/usage?status=planned').then(r => r.json());
      const active   = sessions[0] ?? planned[0] ?? null;

      if (!active) {
        renderNone();
      } else if (active.status === 'in_progress') {
        renderInProgress(active);
      } else {
        renderPlanned(active);
      }
    } catch (e) {
      ctx.innerHTML = `<div class="alert alert-danger" role="alert">${e.message}</div>`;
    }
  }

  function renderNone() {
    ctx.innerHTML = `
      <div class="card border-dashed">
        <div class="card-body">
          <p class="text-muted mb-3">No session planned or in progress.</p>
          <button class="btn btn-primary btn-sm" id="btn-plan-session">Plan a Session</button>
          <div id="plan-session-form" class="d-none mt-3"></div>
        </div>
      </div>`;
    document.getElementById('btn-plan-session').onclick = showPlanForm;
  }

  async function showPlanForm() {
    const projects = await fetch('/api/projects?status=active').then(r => r.json());
    const btn    = document.getElementById('btn-plan-session');
    const formEl = document.getElementById('plan-session-form');
    btn.classList.add('d-none');
    formEl.classList.remove('d-none');
    formEl.innerHTML = `
      <div class="row g-2 mb-2">
        <div class="col">
          <label class="form-label small">Project <span class="text-muted fw-normal">(optional)</span></label>
          <select class="form-select form-select-sm" id="ps-project">
            <option value="">— Standalone —</option>
            ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <p class="text-muted small mb-2">
        Add material, settings, and runs after beginning the session.
      </p>
      <div class="d-flex gap-2">
        <button class="btn btn-primary btn-sm" id="ps-create">Create Plan</button>
        <button class="btn btn-secondary btn-sm" id="ps-cancel">Cancel</button>
      </div>`;

    document.getElementById('ps-cancel').onclick = loadSessionContext;
    document.getElementById('ps-create').onclick = async () => {
      const payload = {
        project_id: +document.getElementById('ps-project').value || null,
        job_date:   new Date().toISOString().slice(0, 10),
        status:     'planned',
      };
      try {
        const r = await fetch('/api/usage', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        localStorage.removeItem(checklistKey(data.id, 'setup'));
        localStorage.removeItem(checklistKey(data.id, 'run'));
        await loadSessionContext();
      } catch (e) {
        window.showToast(e.message);
      }
    };
  }

  function renderPlanned(session) {
    const setupKey = checklistKey(session.id, 'setup');
    const runKey   = checklistKey(session.id, 'run');
    const runDone  = allChecked(runKey, RUN_ITEMS.length);

    ctx.innerHTML = `
      <div class="card border-warning">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
            <div>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="badge text-bg-warning">Planned</span>
              </div>
              ${session.project_name_resolved ? `<div class="fw-semibold mt-1">${session.project_name_resolved}</div>` : ''}
              <div class="text-muted small mt-1">
                Work through both checklists. When the pre-run checklist is complete,
                "Start Laser Run" becomes active and records your start time.
              </div>
            </div>
            <div class="d-flex gap-2 flex-wrap align-items-center">
              <button class="btn btn-primary btn-sm" id="btn-begin-session" data-id="${session.id}"
                ${runDone ? '' : 'disabled'} title="${runDone ? '' : 'Complete the pre-run checklist first'}">
                Start Laser Run
              </button>
              <button class="btn btn-secondary btn-sm" id="btn-cancel-plan" data-id="${session.id}">Cancel Plan</button>
              <button class="btn btn-danger btn-sm" id="btn-discard-session" data-id="${session.id}"
                title="Permanently delete this planned session">Delete</button>
            </div>
          </div>

          <div class="row g-3">
            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <strong class="small">Setup Checklist</strong>
                <span class="d-flex align-items-center gap-2">
                  <span id="setup-cleared" class="small text-success d-none">✓ Cleared</span>
                  <button class="btn btn-secondary btn-sm" id="reset-setup"
                    title="Uncheck all setup items">Clear</button>
                </span>
              </div>
              <ul id="setup-items" class="list-unstyled mb-0"></ul>
            </div>
            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <strong class="small">Pre-Run Checklist</strong>
                <span class="d-flex align-items-center gap-2">
                  <span id="run-cleared" class="small text-success d-none">✓ Cleared</span>
                  <button class="btn btn-secondary btn-sm" id="reset-run"
                    title="Uncheck all pre-run items">Clear</button>
                </span>
              </div>
              <ul id="run-items" class="list-unstyled mb-0"></ul>
            </div>
          </div>
        </div>
      </div>`;

    buildChecklist(SETUP_ITEMS, 'setup-items', setupKey, session.id);
    buildChecklist(RUN_ITEMS,   'run-items',   runKey,   session.id);
    updateRunReady(session.id);

    function flashCleared(spanId) {
      const el = document.getElementById(spanId);
      if (!el) return;
      el.classList.remove('d-none');
      setTimeout(() => el.classList.add('d-none'), 2000);
    }

    document.getElementById('reset-setup').onclick = () => {
      localStorage.removeItem(setupKey);
      buildChecklist(SETUP_ITEMS, 'setup-items', setupKey, session.id);
      flashCleared('setup-cleared');
    };
    document.getElementById('reset-run').onclick = () => {
      localStorage.removeItem(runKey);
      buildChecklist(RUN_ITEMS, 'run-items', runKey, session.id);
      updateRunReady(session.id);
      flashCleared('run-cleared');
    };

    document.getElementById('btn-begin-session').onclick = async () => {
      try {
        await fetch(`/api/usage/${session.id}/begin`, { method: 'PUT' });
        await loadSessionContext();
      } catch (e) {
        window.showToast(e.message);
      }
    };

    document.getElementById('btn-cancel-plan').onclick = async () => {
      if (!confirm('Mark this planned session as aborted?')) return;
      await fetch(`/api/usage/${session.id}/abort`, { method: 'PUT' });
      await loadSessionContext();
    };

    document.getElementById('btn-discard-session').onclick = async () => {
      if (!confirm('Permanently delete this session? This cannot be undone.')) return;
      await fetch(`/api/usage/${session.id}`, { method: 'DELETE' });
      await loadSessionContext();
    };
  }

  function renderInProgress(session) {
    const startedDisplay = session.started_at
      ? (() => { const d = new Date(session.started_at + 'Z'); return isNaN(d) ? 'unknown' : d.toLocaleTimeString(); })()
      : 'unknown';

    ctx.innerHTML = `
      <div class="card border-primary active-session-card">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
            <div>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="text-primary">●</span>
                <strong>Session in progress</strong>
              </div>
              ${session.project_name_resolved ? `<div class="fw-semibold mt-1">${session.project_name_resolved}</div>` : ''}
              <div class="text-muted small mt-1">Started: ${startedDisplay}</div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-primary btn-sm" id="btn-continue-session">Continue →</button>
              <button class="btn btn-secondary btn-sm" id="btn-abort-session" data-id="${session.id}">Abort</button>
              <button class="btn btn-danger btn-sm" id="btn-delete-active" data-id="${session.id}"
                title="Permanently delete this session">Delete</button>
            </div>
          </div>
          <div class="row g-3 opacity-75">
            <div class="col-md-6">
              <strong class="small d-block mb-2">Setup Checklist</strong>
              <ul id="setup-items" class="list-unstyled mb-0"></ul>
            </div>
            <div class="col-md-6">
              <strong class="small d-block mb-2">Pre-Run Checklist</strong>
              <ul id="run-items" class="list-unstyled mb-0"></ul>
            </div>
          </div>
        </div>
      </div>`;

    buildChecklist(SETUP_ITEMS, 'setup-items', checklistKey(session.id, 'setup'), session.id, true);
    buildChecklist(RUN_ITEMS,   'run-items',   checklistKey(session.id, 'run'),   session.id, true);

    document.getElementById('btn-continue-session').onclick = () => {
      if (typeof navigate === 'function') navigate('sessions');
    };
    document.getElementById('btn-abort-session').onclick = async () => {
      if (!confirm('Abort this session?')) return;
      await fetch(`/api/usage/${session.id}/abort`, { method: 'PUT' });
      await loadSessionContext();
    };
    document.getElementById('btn-delete-active').onclick = async () => {
      if (!confirm('Permanently delete this session? This cannot be undone.')) return;
      await fetch(`/api/usage/${session.id}`, { method: 'DELETE' });
      await loadSessionContext();
    };
  }

  await loadSessionContext();

  // ── Active projects ───────────────────────────────────────────────
  async function loadProjects() {
    try {
      const projects = await fetch('/api/projects?status=active').then(r => r.json());
      const el = document.getElementById('home-projects');
      if (!projects.length) {
        el.innerHTML = '<p class="text-muted small mb-3">No active projects.</p>';
        return;
      }
      el.innerHTML = `<div class="grid-auto mb-3">
        ${projects.map(p => {
          const m   = typeof p.milestones === 'string' ? JSON.parse(p.milestones || '{}') : (p.milestones || {});
          const vals = Object.values(m);
          const pct  = vals.length ? Math.round(vals.filter(Boolean).length / vals.length * 100) : 0;
          return `
            <div class="card clickable"
              onclick="if(typeof navigate==='function'){window._autoExpandProjectId='${p.id}';navigate('projects');}">
              <div class="card-body">
                <div class="fw-bold small mb-1">${p.name}</div>
                ${p.goal ? `<div class="text-muted small mb-2">${p.goal}</div>` : ''}
                <div class="text-muted small mb-1">Milestones ${pct}%</div>
                <div class="progress progress-thin">
                  <div class="progress-bar bg-primary" style="width:${pct}%"></div>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
    } catch (_) {}
  }

  // Quick new project form
  document.getElementById('btn-quick-project').onclick = () => {
    const wrap = document.getElementById('quick-project-form');
    if (wrap.innerHTML) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="card card-body mb-3">
        <div class="row g-2 mb-2">
          <div class="col-md-5">
            <label class="form-label small">Project Name</label>
            <input id="qp-name" type="text" class="form-control form-control-sm"
              placeholder="e.g. Angie's Heart Bowl">
          </div>
          <div class="col-md-7">
            <label class="form-label small">Goal</label>
            <input id="qp-goal" type="text" class="form-control form-control-sm"
              placeholder="What are you making?">
          </div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm" id="qp-save">Create</button>
          <button class="btn btn-secondary btn-sm" id="qp-cancel">Cancel</button>
        </div>
      </div>`;

    document.getElementById('qp-cancel').onclick = () => { wrap.innerHTML = ''; };
    document.getElementById('qp-save').onclick   = async () => {
      const name = document.getElementById('qp-name').value.trim();
      const goal = document.getElementById('qp-goal').value.trim();
      if (!name) { window.showToast('Name is required.', 'error'); return; }
      try {
        const r = await fetch('/api/projects', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ name, goal: goal || null, status: 'active' }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        wrap.innerHTML = '';
        await loadProjects();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    };
  };

  await loadProjects();

  // ── Stats strip + recent sessions ─────────────────────────────────
  try {
    const [rows, artifacts] = await Promise.all([
      fetch('/api/usage').then(r => r.json()),
      fetch('/api/artifacts').then(r => r.json()).catch(() => []),
    ]);
    const completed   = rows.filter(r => r.status === 'completed');
    const totalRuns   = rows.reduce((s, r) => s + (r.run_count ?? 0), 0);
    const successRate = completed.length
      ? Math.round(completed.filter(r => r.outcome === 'success').length / completed.length * 100)
      : 0;

    const statsEl = document.getElementById('home-stats');
    if (statsEl) {
      statsEl.innerHTML = [
        { val: rows.length,       lbl: 'Sessions' },
        { val: totalRuns,         lbl: 'Total Runs' },
        { val: completed.length,  lbl: 'Completed' },
        { val: successRate + '%', lbl: 'Success Rate' },
        { val: artifacts.length,  lbl: 'Artifacts' },
      ].map(s => `
        <div class="col">
          <div class="card text-center py-3">
            <div class="h3 fw-bold mb-0">${s.val}</div>
            <div class="small text-muted mt-1">${s.lbl}</div>
          </div>
        </div>`).join('');
    }

    const tbody = document.getElementById('recent-sessions');
    const OUTCOME_CLASS = { success: 'text-success', partial: 'text-warning', failed: 'text-danger' };
    const STATUS_BADGE  = { in_progress: '● Active', completed: 'Done', aborted: 'Aborted', planned: 'Planned' };
    const STATUS_BS     = {
      in_progress: 'text-bg-danger',
      completed:   'text-bg-success',
      aborted:     'text-bg-secondary',
      planned:     'text-bg-warning',
    };
    tbody.innerHTML = rows.slice(0, 8).length
      ? rows.slice(0, 8).map(r => `
          <tr>
            <td>${r.job_date}</td>
            <td>${r.project_name_resolved ?? '—'}</td>
            <td class="text-center">${r.run_count ?? 0}</td>
            <td class="${OUTCOME_CLASS[r.outcome] ?? ''}">${r.outcome ?? '—'}</td>
            <td><span class="badge ${STATUS_BS[r.status] ?? 'bg-secondary'}">${STATUS_BADGE[r.status] ?? r.status}</span></td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="text-muted text-center">No sessions logged yet.</td></tr>';
  } catch (_) {}
};
