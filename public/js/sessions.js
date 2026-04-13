window.sessionsInit = async function () {
  const activeWrap  = document.getElementById('active-session-wrap');
  const banner      = document.getElementById('sessions-banner');
  const tbody       = document.getElementById('sessions-body');
  const stats       = document.getElementById('session-stats');
  const detailWrap  = document.getElementById('session-detail-wrap');
  let elapsedTimer  = null;

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

  function elapsed(startedAt) {
    if (!startedAt) return 'unknown';
    const diff = Math.floor((Date.now() - new Date(startedAt + 'Z').getTime()) / 1000);
    if (isNaN(diff) || diff < 0) return 'unknown';
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function fmtTime(startedAt) {
    if (!startedAt) return 'unknown';
    const d = new Date(startedAt + 'Z');
    return isNaN(d) ? 'unknown' : d.toLocaleTimeString();
  }

  // ── Populate dropdowns ────────────────────────────────────────────
  async function populateDropdowns() {
    const [projects, allProjects, settings] = await Promise.all([
      apiFetch('/api/projects?status=active'),
      apiFetch('/api/projects'),
      apiFetch('/api/settings'),
    ]);
    const projSel = document.getElementById('ss-project');
    projects.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      projSel.appendChild(o);
    });
    const filterProjSel = document.getElementById('sf-project');
    allProjects.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = `${p.name} (${p.status})`;
      filterProjSel.appendChild(o);
    });
    const settingSel = document.getElementById('ss-setting');
    settings.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.material} / ${s.operation} — ${s.power}% ${s.speed}mm/min${s.role==='confirmed' ? ' ✓' : ''}`;
      settingSel.appendChild(o);
    });
  }

  // ── Active session card ───────────────────────────────────────────
  async function renderActiveSession(session) {
    if (elapsedTimer) clearInterval(elapsedTimer);
    if (!session) { activeWrap.innerHTML = ''; return; }

    const obs = await apiFetch(`/api/observations?session_id=${session.id}&dismissed=false`);

    activeWrap.innerHTML = `
      <div class="card" style="border-color:var(--accent);margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="color:var(--accent);font-size:1.1rem">●</span>
              <strong>Session in progress</strong>
              ${session.material ? `<span class="badge">${session.material}</span>` : ''}
              ${session.operation ? `<span class="badge">${session.operation}</span>` : ''}
            </div>
            ${session.project_name_resolved ? `<div style="font-size:0.85rem;color:var(--text-muted)">Project: ${session.project_name_resolved}</div>` : ''}
            <div style="font-size:0.85rem;color:var(--text-muted)">
              Started: ${fmtTime(session.started_at)} &nbsp;·&nbsp;
              Elapsed: <span id="elapsed-display">${elapsed(session.started_at)}</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btn-complete-session" data-id="${session.id}">Complete</button>
            <button class="btn btn-danger btn-sm" id="btn-abort-session" data-id="${session.id}">Abort</button>
          </div>
        </div>

        <!-- Observation capture -->
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
          <div style="display:flex;gap:8px;margin-bottom:8px;align-items:stretch;flex-wrap:wrap">
            <select id="obs-type" style="min-width:120px;flex-shrink:0">
              <option value="note">Note</option>
              <option value="discovery">Discovery</option>
              <option value="issue">Issue</option>
              <option value="question">Question</option>
            </select>
            <input id="obs-input" type="text"
              placeholder="Note anything worth remembering…"
              style="flex:1;min-width:200px">
            <button class="btn btn-primary btn-sm" id="btn-add-obs" style="flex-shrink:0">Add →</button>
          </div>
          <div id="obs-feedback" style="font-size:0.8rem;min-height:1.2em;margin-bottom:6px"></div>
          <div id="obs-list" style="font-size:0.85rem">
            ${renderObsList(obs, session.id)}
          </div>
        </div>
      </div>`;

    // Elapsed timer
    elapsedTimer = setInterval(() => {
      const el = document.getElementById('elapsed-display');
      if (el) el.textContent = elapsed(session.started_at);
      else clearInterval(elapsedTimer);
    }, 1000);

    // Type-specific placeholder text
    const OBS_PLACEHOLDERS = {
      note:      'Note anything worth remembering…',
      discovery: 'What did you discover or learn?',
      issue:     'Describe the problem you encountered…',
      question:  'What do you need to find out?',
    };

    function setObsFeedback(msg, color = 'var(--text-muted)') {
      const el = document.getElementById('obs-feedback');
      if (el) { el.textContent = msg; el.style.color = color; }
    }

    document.getElementById('obs-type').addEventListener('change', () => {
      const type  = document.getElementById('obs-type').value;
      const input = document.getElementById('obs-input');
      if (input) input.placeholder = OBS_PLACEHOLDERS[type] ?? 'Capture an observation…';
      setObsFeedback('');
    });

    async function submitObservation() {
      const input   = document.getElementById('obs-input');
      const content = input.value.trim();
      const type    = document.getElementById('obs-type').value;
      if (!content) {
        input.style.borderColor = 'var(--accent)';
        setObsFeedback('Enter something before clicking Add.', 'var(--accent)');
        input.focus();
        setTimeout(() => { input.style.borderColor = ''; setObsFeedback(''); }, 2500);
        return;
      }
      const btn = document.getElementById('btn-add-obs');
      btn.disabled = true;
      btn.textContent = '…';
      try {
        await apiFetch('/api/observations', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ session_id: session.id, content, type }),
        });
        input.value = '';
        setObsFeedback('✓ Added', 'var(--success)');
        setTimeout(() => setObsFeedback(''), 2000);
        const updated = await apiFetch(`/api/observations?session_id=${session.id}&dismissed=false`);
        document.getElementById('obs-list').innerHTML = renderObsList(updated, session.id);
      } catch (e) {
        setObsFeedback('Error: ' + e.message, 'var(--accent)');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Add →';
      }
    }

    document.getElementById('btn-add-obs').onclick = submitObservation;

    document.getElementById('obs-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') submitObservation();
    });

    // Complete
    document.getElementById('btn-complete-session').onclick = () => showCompleteForm(session);

    // Abort
    document.getElementById('btn-abort-session').onclick = async () => {
      if (!confirm('Abort this session?')) return;
      try {
        await apiFetch(`/api/usage/${session.id}/abort`, { method: 'PUT' });
        clearInterval(elapsedTimer);
        await refresh();
      } catch (e) { showBanner(e.message); }
    };

    // Observation dismiss (delegated)
    document.getElementById('obs-list').addEventListener('click', async e => {
      if (!e.target.classList.contains('dismiss-obs')) return;
      const id = e.target.dataset.id;
      try {
        await apiFetch(`/api/observations/${id}/dismiss`, { method: 'PUT' });
        const updated = await apiFetch(`/api/observations?session_id=${session.id}&dismissed=false`);
        document.getElementById('obs-list').innerHTML = renderObsList(updated, session.id);
      } catch (err) { showBanner(err.message); }
    });
  }

  function renderObsList(obs, sessionId) {
    const TYPE_COLOR = { note: 'var(--text-muted)', discovery: '#27ae60', issue: 'var(--accent)', question: 'var(--accent2)' };
    if (!obs.length) return '<p style="color:var(--text-muted)">No observations yet.</p>';
    return obs.map(o => `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border);gap:8px">
        <div>
          <span style="color:${TYPE_COLOR[o.type]};font-size:0.75rem;text-transform:uppercase;font-weight:600">${o.type}</span>
          <span style="margin-left:8px">${o.content}</span>
        </div>
        <button class="btn btn-secondary btn-sm dismiss-obs" data-id="${o.id}" style="flex-shrink:0">Dismiss</button>
      </div>`).join('');
  }

  function showCompleteForm(session) {
    activeWrap.querySelector('.card').insertAdjacentHTML('beforeend', `
      <div id="complete-form" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
        <h3>Complete Session</h3>
        <div class="form-row" style="margin-top:10px">
          <div><label>Outcome</label>
            <select id="comp-outcome">
              <option value="success">Success</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
            </select></div>
          <div style="flex:1"><label>Final notes</label>
            <input id="comp-notes" type="text" placeholder="Optional summary"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary" id="confirm-complete" data-id="${session.id}">Confirm Complete</button>
          <button class="btn btn-secondary" id="cancel-complete">Cancel</button>
        </div>
      </div>`);

    document.getElementById('cancel-complete').onclick = () =>
      document.getElementById('complete-form').remove();

    document.getElementById('confirm-complete').onclick = async () => {
      const outcome = document.getElementById('comp-outcome').value;
      const notes   = document.getElementById('comp-notes').value.trim();
      try {
        await apiFetch(`/api/usage/${session.id}/complete`, {
          method: 'PUT', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ outcome, notes: notes || undefined }),
        });
        clearInterval(elapsedTimer);
        await refresh();
        await showSessionDetail(session.id);
      } catch (e) { showBanner(e.message); }
    };
  }

  async function showSessionDetail(sessionId) {
    detailWrap.innerHTML = '<p class="loading" style="margin-top:16px">Loading…</p>';
    detailWrap.scrollIntoView({ behavior: 'smooth' });

    try {
      const [session, projects, obs] = await Promise.all([
        apiFetch(`/api/usage/${sessionId}`),
        apiFetch('/api/projects'),
        apiFetch(`/api/observations?session_id=${sessionId}`),
      ]);

      const TYPE_COLOR = { note: 'var(--text-muted)', discovery: '#27ae60', issue: 'var(--accent)', question: 'var(--accent2)' };
      const undismissed = obs.filter(o => !o.dismissed_at);
      const dismissed   = obs.filter(o =>  o.dismissed_at);

      detailWrap.innerHTML = `
        <div class="card" style="margin-top:16px;border-color:var(--accent2)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h2 style="margin:0">Session Detail — ${session.material ?? 'Unknown'} / ${session.operation ?? '—'} / ${session.job_date}</h2>
            <button class="btn btn-secondary btn-sm" id="close-detail">✕ Close</button>
          </div>

          <!-- Edit fields -->
          <div class="form-row" style="margin-bottom:16px">
            <div style="flex:1">
              <label>Project</label>
              <select id="det-project">
                <option value="">— Standalone —</option>
                ${projects.map(p => `<option value="${p.id}" ${p.id === session.project_id ? 'selected' : ''}>${p.name} (${p.status})</option>`).join('')}
              </select>
            </div>
            <div>
              <label>Outcome</label>
              <select id="det-outcome">
                <option value="">—</option>
                <option value="success"  ${session.outcome==='success' ?'selected':''}>Success</option>
                <option value="partial"  ${session.outcome==='partial' ?'selected':''}>Partial</option>
                <option value="failed"   ${session.outcome==='failed'  ?'selected':''}>Failed</option>
              </select>
            </div>
            <div>
              <label>Duration (min)</label>
              <input id="det-duration" type="number" min="1" value="${session.duration_min ?? ''}" style="width:90px">
            </div>
            <div style="flex:2">
              <label>Notes</label>
              <input id="det-notes" type="text" value="${session.notes ?? ''}">
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:20px;align-items:center">
            <button class="btn btn-primary btn-sm" id="det-save" data-id="${session.id}">Save Changes</button>
            <button class="btn btn-danger btn-sm" id="det-delete" data-id="${session.id}">Delete Session</button>
          </div>
          <div id="det-save-banner"></div>

          <!-- Observations -->
          <div style="border-top:1px solid var(--border);padding-top:14px">
            <h3 style="margin-top:0">Observations (${undismissed.length} open${dismissed.length ? ', ' + dismissed.length + ' dismissed' : ''})</h3>
            <div id="review-obs-list">
              ${undismissed.length
                ? undismissed.map(o => renderObsRow(o, TYPE_COLOR)).join('')
                : '<p style="color:var(--text-muted);font-size:0.875rem">No open observations.</p>'}
            </div>
            ${dismissed.length ? `
              <details style="margin-top:8px">
                <summary style="cursor:pointer;font-size:0.8rem;color:var(--text-muted)">Show ${dismissed.length} dismissed</summary>
                <div style="margin-top:8px;opacity:0.6">
                  ${dismissed.map(o => renderObsRow(o, TYPE_COLOR, true)).join('')}
                </div>
              </details>` : ''}
          </div>
        </div>`;

      document.getElementById('close-detail').onclick = () => { detailWrap.innerHTML = ''; };

      document.getElementById('det-delete').onclick = async () => {
        if (!confirm(`Delete this session (${session.job_date} · ${session.material ?? 'no material'})? This cannot be undone.`)) return;
        try {
          await apiFetch(`/api/usage/${session.id}`, { method: 'DELETE' });
          detailWrap.innerHTML = '';
          await loadSessions();
        } catch (e) { showBanner(e.message); }
      };

      document.getElementById('det-save').onclick = async () => {
        const payload = {
          project_id:  +document.getElementById('det-project').value  || null,
          outcome:     document.getElementById('det-outcome').value   || null,
          duration_min:+document.getElementById('det-duration').value || null,
          notes:       document.getElementById('det-notes').value.trim() || null,
        };
        try {
          await apiFetch(`/api/usage/${session.id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
          });
          document.getElementById('det-save-banner').innerHTML =
            '<div class="banner banner-success">Saved.</div>';
          setTimeout(() => { document.getElementById('det-save-banner').innerHTML = ''; }, 3000);
          await loadSessions(); // refresh table row
        } catch (e) {
          document.getElementById('det-save-banner').innerHTML =
            `<div class="banner banner-error">${e.message}</div>`;
        }
      };

      // Observation actions (delegated)
      detailWrap.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        if (!id) return;
        if (e.target.classList.contains('rev-dismiss')) {
          try {
            await apiFetch(`/api/observations/${id}/dismiss`, { method: 'PUT' });
            await showSessionDetail(sessionId);
          } catch (err) { showBanner(err.message); }
        }
        if (e.target.classList.contains('rev-promote-note')) {
          const topic = prompt('Topic for learning note:', session.material ?? '');
          if (!topic) return;
          try {
            await apiFetch(`/api/observations/${id}/promote/note`, {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ topic }),
            });
            showBanner('Added to learning notes.', 'success');
            await showSessionDetail(sessionId);
          } catch (err) { showBanner(err.message); }
        }
      });

    } catch (e) {
      detailWrap.innerHTML = `<div class="banner banner-error" style="margin-top:12px">${e.message}</div>`;
    }
  }

  function renderObsRow(o, TYPE_COLOR, isDismissed = false) {
    return `
      <div id="rev-obs-${o.id}" style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);gap:8px">
        <div>
          <span style="color:${TYPE_COLOR[o.type]};font-size:0.75rem;text-transform:uppercase;font-weight:600">${o.type}</span>
          <span style="margin-left:8px;font-size:0.875rem">${o.content}</span>
          ${o.promoted_to ? `<span style="margin-left:8px;font-size:0.75rem;color:var(--success)">→ ${o.promoted_to.replace('_',' ')}</span>` : ''}
        </div>
        ${!isDismissed ? `
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-secondary btn-sm rev-promote-note" data-id="${o.id}">→ Note</button>
            <button class="btn btn-secondary btn-sm rev-dismiss" data-id="${o.id}">Dismiss</button>
          </div>` : ''}
      </div>`;
  }

  // ── Session table ─────────────────────────────────────────────────
  async function loadSessions() {
    const params = new URLSearchParams();
    const from      = document.getElementById('sf-from').value;
    const to        = document.getElementById('sf-to').value;
    const status    = document.getElementById('sf-status').value;
    const outcome   = document.getElementById('sf-outcome').value;
    const projectId = document.getElementById('sf-project').value;
    if (from)      params.set('from', from);
    if (to)        params.set('to', to);
    if (status)    params.set('status', status);
    if (outcome)   params.set('outcome', outcome);
    if (projectId) params.set('project_id', projectId);

    try {
      const rows = await apiFetch(`/api/usage?${params}`);

      // Status breakdown (always fetch all for counts unless filters narrow it)
      const counts = { planned: 0, in_progress: 0, completed: 0, aborted: 0 };
      rows.forEach(r => { if (r.status in counts) counts[r.status]++; });

      const completed = rows.filter(r => r.status === 'completed');
      const successes = completed.filter(r => r.outcome === 'success').length;
      const rate = completed.length ? Math.round(successes / completed.length * 100) : 0;
      const matCounts = {};
      rows.forEach(r => { if (r.material) matCounts[r.material] = (matCounts[r.material]||0)+1; });
      const topMat = Object.entries(matCounts).sort((a,b)=>b[1]-a[1])[0];
      stats.innerHTML = `
        <div class="stat-box"><div class="stat-val">${counts.planned}</div><div class="stat-lbl">Planned</div></div>
        <div class="stat-box"><div class="stat-val">${counts.in_progress}</div><div class="stat-lbl">In Progress</div></div>
        <div class="stat-box"><div class="stat-val">${counts.completed}</div><div class="stat-lbl">Completed</div></div>
        <div class="stat-box"><div class="stat-val">${counts.aborted}</div><div class="stat-lbl">Aborted</div></div>
        <div class="stat-box"><div class="stat-val">${rate}%</div><div class="stat-lbl">Success Rate</div></div>
        ${topMat ? `<div class="stat-box"><div class="stat-val">${topMat[0]}</div><div class="stat-lbl">Top Material</div></div>` : ''}`;

      const OUTCOME_COLOR = { success: 'var(--success)', partial: 'var(--accent2)', failed: 'var(--accent)' };
      const STATUS_BADGE  = { in_progress: '🔴 Active', completed: 'Done', aborted: 'Aborted', planned: 'Planned' };

      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${r.job_date}</td>
          <td>${r.project_name_resolved ?? r.project_name ?? '—'}</td>
          <td>${r.material ?? '—'}</td>
          <td>${r.operation ? `<span class="badge">${r.operation}</span>` : '—'}</td>
          <td>${r.duration_min != null ? r.duration_min + ' min' : '—'}</td>
          <td style="color:${OUTCOME_COLOR[r.outcome]??'inherit'}">${r.outcome ?? '—'}</td>
          <td><span class="badge">${STATUS_BADGE[r.status] ?? r.status}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm view-session" data-id="${r.id}">View</button>
            <button class="btn btn-danger btn-sm del-session" data-id="${r.id}">Del</button>
          </td>
        </tr>`).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="banner banner-error">${e.message}</td></tr>`;
    }
  }

  tbody.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('del-session')) {
      if (!confirm('Delete this session?')) return;
      try { await apiFetch(`/api/usage/${id}`, { method: 'DELETE' }); await refresh(); }
      catch (err) { showBanner(err.message); }
    }
    if (e.target.classList.contains('view-session')) {
      await showSessionDetail(+id);
    }
  });

  // ── Start session ─────────────────────────────────────────────────
  document.getElementById('btn-start-session').onclick = async () => {
    const project_id = +document.getElementById('ss-project').value || null;
    const material   = document.getElementById('ss-material').value.trim() || null;
    const operation  = document.getElementById('ss-operation').value || null;
    const setting_id = +document.getElementById('ss-setting').value || null;
    const file_used  = document.getElementById('ss-file').value.trim() || null;
    try {
      await apiFetch('/api/usage/start', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ project_id, material, operation, setting_id, file_used }),
      });
      await refresh();
    } catch (e) { showBanner(e.message); }
  };

  document.getElementById('btn-filter-sessions').onclick = loadSessions;

  async function refresh() {
    const active = await apiFetch('/api/usage?status=in_progress');
    const currentSession = active[0] ?? null;

    // Show/hide start form
    document.getElementById('start-session-wrap').style.display = currentSession ? 'none' : 'block';

    await renderActiveSession(currentSession);
    await loadSessions();
  }

  try { await populateDropdowns(); } catch (e) { showBanner('Could not load project/setting dropdowns: ' + e.message); }
  await refresh();
};
