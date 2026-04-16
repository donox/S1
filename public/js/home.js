window.homeInit = async function () {

  // ── Quick nav ─────────────────────────────────────────────────────
  const NAV_CARDS = [
    { page: 'projects',  label: 'Projects',       abbr: 'PRJ', color: '#27ae60', desc: 'Multi-session work' },
    { page: 'sessions',  label: 'Sessions',        abbr: 'SES', color: '#3498db', desc: 'Log & track sessions' },
    { page: 'settings',  label: 'Materials',       abbr: 'MAT', color: '#e94560', desc: 'Power, speed, LPI' },
    { page: 'artifacts', label: 'Artifacts',       abbr: 'ART', color: '#8e44ad', desc: 'Named pieces + param deltas' },
    { page: 'docs',      label: 'Docs',            abbr: 'DOC', color: '#f5a623', desc: 'Search the manual' },
    { page: 'notes',     label: 'Notes',           abbr: 'NTS', color: '#9b59b6', desc: 'Tips & learning' },
    { page: 'files',     label: 'Files',           abbr: 'FIL', color: '#1abc9c', desc: 'Project files' },
    { page: 'reference', label: 'Quick Ref',       abbr: 'REF', color: '#e67e22', desc: 'Safety & workflow' },
  ];

  document.getElementById('home-nav').innerHTML = NAV_CARDS.map(c => `
    <a href="/${c.page}" data-page="${c.page}" style="text-decoration:none">
      <div class="card" style="cursor:pointer;transition:border-color 0.15s"
        onmouseover="this.style.borderColor='${c.color}'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="width:40px;height:40px;border-radius:8px;
          background:${c.color}22;border:2px solid ${c.color};
          display:flex;align-items:center;justify-content:center;
          font-size:0.7rem;font-weight:700;letter-spacing:0.06em;color:${c.color};
          margin-bottom:10px">${c.abbr}</div>
        <div style="font-weight:700;font-size:0.9rem;margin-bottom:2px;color:#fff">${c.label}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${c.desc}</div>
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
    const ul    = document.getElementById(ulId);
    if (!ul) return;
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    ul.innerHTML = items.map((text, i) => `
      <li style="list-style:none;display:flex;align-items:flex-start;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
        <input type="checkbox" id="${storageKey}-${i}" ${saved[i] ? 'checked' : ''} ${readonly ? 'disabled' : ''}
          style="margin-top:3px;accent-color:var(--accent);width:16px;height:16px;flex-shrink:0">
        <label for="${storageKey}-${i}" style="font-size:0.875rem;cursor:${readonly?'default':'pointer'};
          color:${saved[i] ? 'var(--text-muted)' : 'var(--text)'};
          text-decoration:${saved[i] ? 'line-through' : 'none'}">${text}</label>
      </li>`).join('');

    if (!readonly) {
      ul.onchange = e => {
        if (e.target.type !== 'checkbox') return;
        const idx   = +e.target.id.split('-').pop();
        const label = e.target.closest('li').querySelector('label');
        label.style.textDecoration = e.target.checked ? 'line-through' : 'none';
        label.style.color = e.target.checked ? 'var(--text-muted)' : 'var(--text)';
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

  function updateRunReady(sessionId, changedKey) {
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
      ctx.innerHTML = `<div class="banner banner-error">${e.message}</div>`;
    }
  }

  function renderNone() {
    ctx.innerHTML = `
      <div class="card" style="border-style:dashed">
        <p style="color:var(--text-muted);margin-bottom:14px">No session planned or in progress.</p>
        <button class="btn btn-primary btn-sm" id="btn-plan-session">Plan a Session</button>
        <div id="plan-session-form" style="display:none;margin-top:16px"></div>
      </div>`;
    document.getElementById('btn-plan-session').onclick = showPlanForm;
  }

  async function showPlanForm() {
    const projects  = await fetch('/api/projects?status=active').then(r => r.json());
    const settings  = await fetch('/api/settings').then(r => r.json());
    const formEl    = document.getElementById('plan-session-form');
    document.getElementById('btn-plan-session').style.display = 'none';
    formEl.style.display = 'block';
    formEl.innerHTML = `
      <div class="form-row">
        <div style="flex:1">
          <label>Project <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
          <select id="ps-project">
            <option value="">— Standalone —</option>
            ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Material <small title="Never laser PVC/vinyl">⚠</small></label>
          <input id="ps-material" type="text" placeholder="e.g. Walnut" style="min-width:120px">
        </div>
        <div>
          <label>Operation</label>
          <select id="ps-operation">
            <option value="">—</option>
            <option value="engrave">Engrave</option>
            <option value="score">Score</option>
            <option value="cut">Cut</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
        <div style="flex:1">
          <label>Setting <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
          <select id="ps-setting">
            <option value="">—</option>
            ${settings.map(s => `<option value="${s.id}">${s.material} / ${s.operation} — ${s.power}%${s.role==='confirmed'?' ✓':''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary btn-sm" id="ps-create">Create Plan</button>
        <button class="btn btn-secondary btn-sm" id="ps-cancel">Cancel</button>
      </div>
      <div id="ps-banner"></div>`;

    document.getElementById('ps-cancel').onclick = loadSessionContext;
    document.getElementById('ps-create').onclick = async () => {
      const payload = {
        project_id:  +document.getElementById('ps-project').value  || null,
        material:    document.getElementById('ps-material').value.trim() || null,
        operation:   document.getElementById('ps-operation').value || null,
        setting_id:  +document.getElementById('ps-setting').value  || null,
        status:      'planned',
      };
      try {
        // Create as planned session (status field via direct INSERT)
        const r = await fetch('/api/usage', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ ...payload, job_date: new Date().toISOString().slice(0, 10), status: 'planned' }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        // Clear checklists for new session
        localStorage.removeItem(checklistKey(data.id, 'setup'));
        localStorage.removeItem(checklistKey(data.id, 'run'));
        await loadSessionContext();
      } catch (e) {
        document.getElementById('ps-banner').innerHTML = `<div class="banner banner-error">${e.message}</div>`;
      }
    };
  }

  function renderPlanned(session) {
    const setupKey = checklistKey(session.id, 'setup');
    const runKey   = checklistKey(session.id, 'run');
    const runDone  = allChecked(runKey, RUN_ITEMS.length);

    ctx.innerHTML = `
      <div class="card" style="border-color:var(--accent2)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:16px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="badge" style="color:var(--accent2)">Planned</span>
              ${session.material ? `<strong>${session.material}</strong>` : ''}
              ${session.operation ? `<span class="badge">${session.operation}</span>` : ''}
            </div>
            ${session.project_name_resolved ? `<div style="font-size:0.95rem;font-weight:600;margin-top:6px">Project: ${session.project_name_resolved}</div>` : ''}
            <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px">
              Work through both checklists. When the pre-run checklist is complete,
              "Start Laser Run" becomes active and records your start time.
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <button class="btn btn-primary btn-sm" id="btn-begin-session" data-id="${session.id}"
              ${runDone ? '' : 'disabled'} title="${runDone ? '' : 'Complete the pre-run checklist first'}">
              Start Laser Run
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-cancel-plan" data-id="${session.id}">Cancel Plan</button>
            <button class="btn btn-danger btn-sm" id="btn-discard-session" data-id="${session.id}" title="Permanently delete this planned session">Delete</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" id="checklist-grid">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <strong style="font-size:0.9rem">Setup Checklist</strong>
              <span style="display:flex;align-items:center;gap:8px">
                <span id="setup-cleared" style="font-size:0.75rem;color:var(--success);display:none">✓ Cleared</span>
                <button class="btn btn-secondary btn-sm" id="reset-setup" title="Uncheck all setup items">Clear</button>
              </span>
            </div>
            <ul id="setup-items" style="padding:0"></ul>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <strong style="font-size:0.9rem">Pre-Run Checklist</strong>
              <span style="display:flex;align-items:center;gap:8px">
                <span id="run-cleared" style="font-size:0.75rem;color:var(--success);display:none">✓ Cleared</span>
                <button class="btn btn-secondary btn-sm" id="reset-run" title="Uncheck all pre-run items">Clear</button>
              </span>
            </div>
            <ul id="run-items" style="padding:0"></ul>
          </div>
        </div>
      </div>`;

    buildChecklist(SETUP_ITEMS, 'setup-items', setupKey, session.id);
    buildChecklist(RUN_ITEMS,   'run-items',   runKey,   session.id);
    updateRunReady(session.id);  // set initial button state

    function flashCleared(spanId) {
      const el = document.getElementById(spanId);
      if (!el) return;
      el.style.display = 'inline';
      setTimeout(() => { el.style.display = 'none'; }, 2000);
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
        ctx.querySelector('.card').insertAdjacentHTML('beforeend',
          `<div class="banner banner-error">${e.message}</div>`);
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
      <div class="card" style="border-color:var(--accent)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:16px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="color:var(--accent)">●</span>
              <strong>Session in progress</strong>
              ${session.material ? `<span class="badge">${session.material}</span>` : ''}
              ${session.operation ? `<span class="badge">${session.operation}</span>` : ''}
            </div>
            ${session.project_name_resolved ? `<div style="font-size:0.95rem;font-weight:600;margin-top:6px">Project: ${session.project_name_resolved}</div>` : ''}
            <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px">
              Started: ${startedDisplay}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btn-continue-session">Continue →</button>
            <button class="btn btn-secondary btn-sm" id="btn-abort-session" data-id="${session.id}">Abort</button>
            <button class="btn btn-danger btn-sm" id="btn-delete-active" data-id="${session.id}" title="Permanently delete this session">Delete</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;opacity:0.6">
          <div>
            <strong style="font-size:0.9rem;display:block;margin-bottom:8px">Setup Checklist</strong>
            <ul id="setup-items" style="padding:0"></ul>
          </div>
          <div>
            <strong style="font-size:0.9rem;display:block;margin-bottom:8px">Pre-Run Checklist</strong>
            <ul id="run-items" style="padding:0"></ul>
          </div>
        </div>
      </div>`;

    // Show checklists read-only for reference
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
        el.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:16px">No active projects.</p>';
        return;
      }
      el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:20px">
        ${projects.map(p => {
          const m = typeof p.milestones === 'string' ? JSON.parse(p.milestones || '{}') : (p.milestones || {});
          const vals = Object.values(m);
          const pct  = vals.length ? Math.round(vals.filter(Boolean).length / vals.length * 100) : 0;
          return `
            <div class="card" style="cursor:pointer" onclick="if(typeof navigate==='function'){window._autoExpandProjectId='${p.id}';navigate('projects');}">
              <div class="card-title" style="margin-bottom:4px;font-size:0.9rem">${p.name}</div>
              ${p.goal ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px">${p.goal}</div>` : ''}
              <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px">Milestones ${pct}%</div>
              <div style="background:var(--border);border-radius:4px;height:4px">
                <div style="background:var(--accent);width:${pct}%;height:4px;border-radius:4px"></div>
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
      <div class="inline-form" style="margin-bottom:16px">
        <div class="form-row">
          <div style="flex:2"><label>Project Name</label>
            <input id="qp-name" type="text" placeholder="e.g. Angie's Heart Bowl"></div>
          <div style="flex:3"><label>Goal</label>
            <input id="qp-goal" type="text" placeholder="What are you making?"></div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" id="qp-save">Create</button>
          <button class="btn btn-secondary btn-sm" id="qp-cancel">Cancel</button>
        </div>
        <div id="qp-banner"></div>
      </div>`;

    document.getElementById('qp-cancel').onclick = () => { wrap.innerHTML = ''; };
    document.getElementById('qp-save').onclick   = async () => {
      const name = document.getElementById('qp-name').value.trim();
      const goal = document.getElementById('qp-goal').value.trim();
      if (!name) {
        document.getElementById('qp-banner').innerHTML = '<div class="banner banner-error">Name is required.</div>';
        return;
      }
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
        document.getElementById('qp-banner').innerHTML = `<div class="banner banner-error">${e.message}</div>`;
      }
    };
  };

  await loadProjects();

  // ── Recent sessions ────────────────────────────────────────────────
  try {
    const rows   = await fetch('/api/usage').then(r => r.json());
    const tbody  = document.getElementById('recent-sessions');
    const OUTCOME_COLOR = { success: '#27ae60', partial: '#f5a623', failed: '#c0392b' };
    tbody.innerHTML = rows.slice(0, 8).length
      ? rows.slice(0, 8).map(r => `
          <tr>
            <td>${r.job_date}</td>
            <td>${r.project_name_resolved ?? r.project_name ?? '—'}</td>
            <td>${r.material ?? '—'}</td>
            <td>${r.operation ? `<span class="badge">${r.operation}</span>` : '—'}</td>
            <td style="color:${OUTCOME_COLOR[r.outcome]??'inherit'}">${r.outcome ?? '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="color:var(--text-muted)">No sessions logged yet.</td></tr>';
  } catch (_) {}
};
