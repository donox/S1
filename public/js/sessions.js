window.sessionsInit = async function () {
  const activeWrap  = document.getElementById('active-session-wrap');
  const banner      = document.getElementById('sessions-banner');
  const tbody       = document.getElementById('sessions-body');
  const stats       = document.getElementById('session-stats');
  const detailWrap  = document.getElementById('session-detail-wrap');
  let elapsedTimer  = null;
  let currentDetailSessionId = null;  // tracks which session the detail panel is showing
  let cachedRunSettings  = [];        // all material_settings rows, for run form setting picker
  let cachedRunMaterials = [];        // sorted unique material names, for run form datalist
  let cachedArtifacts    = [];        // all artifacts, for run form artifact picker

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

  const TYPE_COLOR = {
    note: 'var(--text-muted)', discovery: '#27ae60',
    issue: 'var(--accent)', question: 'var(--accent2)',
  };
  const OUTCOME_COLOR = { success: 'var(--success)', partial: 'var(--accent2)', failed: 'var(--accent)' };
  const OBS_OUTCOME_COLOR = {
    positive: 'var(--success)', negative: 'var(--danger)',
    neutral: 'var(--text-muted)', unexpected: 'var(--accent2)',
  };

  function outcomeBadge(outcome) {
    if (!outcome) return '';
    const c = OBS_OUTCOME_COLOR[outcome] || 'var(--text-muted)';
    return `<span style="color:${c};font-size:0.7rem;text-transform:uppercase;font-weight:600;margin-left:6px">${outcome}</span>`;
  }

  // Returns a short "setting: material/op" label for observations linked to a saved setting.
  function fmtLinkedSetting(settingId) {
    if (!settingId) return '';
    const s = cachedRunSettings.find(r => r.id === settingId);
    if (!s) return '';
    return `<span style="font-size:0.75rem;color:var(--text-muted);margin-left:6px">[${s.material} / ${s.operation}]</span>`;
  }

  // ── Populate dropdowns ────────────────────────────────────────────
  async function populateDropdowns() {
    const [projects, allProjects, settings, users] = await Promise.all([
      apiFetch('/api/projects?status=active'),
      apiFetch('/api/projects'),
      apiFetch('/api/settings'),
      apiFetch('/api/users'),
    ]);
    cachedRunSettings  = settings;
    cachedRunMaterials = [...new Set(settings.map(s => s.material))].sort();
    try { cachedArtifacts = await apiFetch('/api/artifacts'); } catch (_) { cachedArtifacts = []; }
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
      o.textContent = `${s.material} / ${s.operation} — ${s.power}% ${s.speed}mm/sec${s.role==='confirmed' ? ' ✓' : ''}`;
      settingSel.appendChild(o);
    });
    const userSel = document.getElementById('ss-user');
    users.forEach(u => {
      const o = document.createElement('option');
      o.value = u.id; o.textContent = u.name;
      if (u.is_default) o.selected = true;
      userSel.appendChild(o);
    });
  }

  // ── Active session card ───────────────────────────────────────────
  async function renderActiveSession(session) {
    if (elapsedTimer) clearInterval(elapsedTimer);
    if (!session) { activeWrap.innerHTML = ''; return; }

    const obs = await apiFetch(`/api/observations?session_id=${session.id}&dismissed=false`);

    activeWrap.innerHTML = `
      <div class="card active-session-card" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="color:var(--accent);font-size:1.1rem">●</span>
              <strong>Session in progress</strong>
            </div>
            ${session.project_name_resolved ? `<div style="font-size:0.85rem;color:var(--text-muted)">Project: ${session.project_name_resolved}</div>` : ''}
            ${session.user_name ? `<div style="font-size:0.85rem;color:var(--text-muted)">User: ${session.user_name}</div>` : ''}
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

        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
          <div style="display:flex;gap:8px;margin-bottom:8px;align-items:stretch;flex-wrap:wrap">
            <select id="obs-type" style="min-width:100px;flex-shrink:0">
              <option value="note">Note</option>
              <option value="discovery">Discovery</option>
              <option value="issue">Issue</option>
              <option value="question">Question</option>
            </select>
            <select id="obs-outcome" style="min-width:110px;flex-shrink:0">
              <option value="">outcome…</option>
              <option value="positive">positive</option>
              <option value="negative">negative</option>
              <option value="neutral">neutral</option>
              <option value="unexpected">unexpected</option>
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

    elapsedTimer = setInterval(() => {
      const el = document.getElementById('elapsed-display');
      if (el) el.textContent = elapsed(session.started_at);
      else clearInterval(elapsedTimer);
    }, 1000);

    const OBS_PLACEHOLDERS = {
      note: 'Note anything worth remembering…', discovery: 'What did you discover or learn?',
      issue: 'Describe the problem you encountered…', question: 'What do you need to find out?',
    };
    function setObsFeedback(msg, color = 'var(--text-muted)') {
      const el = document.getElementById('obs-feedback');
      if (el) { el.textContent = msg; el.style.color = color; }
    }
    document.getElementById('obs-type').addEventListener('change', () => {
      const input = document.getElementById('obs-input');
      if (input) input.placeholder = OBS_PLACEHOLDERS[document.getElementById('obs-type').value] ?? 'Capture an observation…';
      setObsFeedback('');
    });

    async function submitObservation() {
      const input   = document.getElementById('obs-input');
      const content = input.value.trim();
      const type    = document.getElementById('obs-type').value;
      const outcome = document.getElementById('obs-outcome').value || null;
      if (!content) {
        input.style.borderColor = 'var(--accent)';
        setObsFeedback('Enter something before clicking Add.', 'var(--accent)');
        input.focus();
        setTimeout(() => { input.style.borderColor = ''; setObsFeedback(''); }, 2500);
        return;
      }
      const btn = document.getElementById('btn-add-obs');
      btn.disabled = true; btn.textContent = '…';
      try {
        await apiFetch('/api/observations', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ session_id: session.id, content, type, outcome }),
        });
        input.value = '';
        setObsFeedback('✓ Added', 'var(--success)');
        setTimeout(() => setObsFeedback(''), 2000);
        const updated = await apiFetch(`/api/observations?session_id=${session.id}&dismissed=false`);
        document.getElementById('obs-list').innerHTML = renderObsList(updated, session.id);
      } catch (e) {
        setObsFeedback('Error: ' + e.message, 'var(--accent)');
      } finally {
        btn.disabled = false; btn.textContent = 'Add →';
      }
    }
    document.getElementById('btn-add-obs').onclick = submitObservation;
    document.getElementById('obs-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') submitObservation();
    });
    document.getElementById('btn-complete-session').onclick = () => showCompleteForm(session);
    document.getElementById('btn-abort-session').onclick = async () => {
      if (!confirm('Abort this session?')) return;
      try {
        await apiFetch(`/api/usage/${session.id}/abort`, { method: 'PUT' });
        clearInterval(elapsedTimer);
        await refresh();
      } catch (e) { showBanner(e.message); }
    };
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
    if (!obs.length) return '<p style="color:var(--text-muted)">No observations yet.</p>';
    return obs.map(o => `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border);gap:8px">
        <div>
          <span style="color:${TYPE_COLOR[o.type]};font-size:0.75rem;text-transform:uppercase;font-weight:600">${o.type}</span>
          ${outcomeBadge(o.outcome)}
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
          <button class="btn btn-primary" id="confirm-complete">Confirm Complete</button>
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

  // ── Runs section ──────────────────────────────────────────────────

  // fmtParam: show run override, or base+delta→effective, or plain base
  function fmtParam(runOverride, base, delta, unit) {
    if (runOverride != null) return `<strong>${runOverride}${unit}</strong>`;
    if (base == null) return null;
    if (!delta) return `${base}${unit}`;
    const effective = base + delta;
    const sign = delta > 0 ? '+' : '';
    return `${base}${unit}<span style="color:var(--accent2);font-size:0.75em"> ${sign}${delta}→</span><strong>${effective}${unit}</strong>`;
  }

  function renderRunSettingRow(s, runId, artifact) {
    // effective_operation is pre-computed by the API (COALESCE(rs.operation, ms.operation))
    const op     = s.effective_operation;
    const params = [];
    const pwr = fmtParam(s.power, s.setting_power, artifact?.power_delta, '%');
    const spd = fmtParam(s.speed, s.setting_speed, artifact?.speed_delta, 'mm/sec');
    const lpiVal = s.lines_per_inch ?? s.setting_lpi;
    const passes = s.passes ?? s.setting_passes;
    const foc = fmtParam(s.focus_offset_mm, s.setting_focus, artifact?.focus_delta, 'mm');
    const passDelta = artifact?.passes_delta;
    const passBase = passes;
    let passStr = null;
    if (passBase != null) {
      if (passDelta) {
        const eff = passBase + passDelta;
        const sign = passDelta > 0 ? '+' : '';
        passStr = `×${passBase}<span style="color:var(--accent2);font-size:0.75em"> ${sign}${passDelta}→</span><strong>×${eff}</strong>`;
      } else if (passBase > 1) {
        passStr = `×${passBase}`;
      }
    }
    if (pwr  != null) params.push(pwr);
    if (spd  != null) params.push(spd);
    if (lpiVal != null) params.push(`${lpiVal} LPI`);
    if (passStr != null) params.push(passStr);
    if (foc  != null && (s.focus_offset_mm ?? s.setting_focus) !== 0) params.push(`focus ${foc}`);
    return `
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;
                  font-size:0.82rem;margin-bottom:3px;padding:2px 0">
        <span style="color:var(--text-muted)">↳</span>
        ${op ? `<span class="badge" style="font-size:0.72rem">${op}</span>` : '<span style="color:var(--text-muted);font-size:0.72rem">—</span>'}
        ${params.length ? `<span style="color:var(--text-muted)">${params.join(' · ')}</span>` : ''}
        ${s.purpose ? `<span style="font-style:italic;color:var(--text)">${s.purpose}</span>` : ''}
        <button class="btn btn-secondary btn-sm run-setting-edit"
                data-run-id="${runId}" data-sid="${s.id}"
                style="font-size:0.7rem;padding:1px 5px;margin-left:auto">Edit</button>
        <button class="btn btn-danger btn-sm run-setting-del"
                data-run-id="${runId}" data-sid="${s.id}"
                style="font-size:0.7rem;padding:1px 5px">×</button>
      </div>`;
  }

  function buildRunSettingForm(runId, existing = null) {
    const isEdit = !!existing;
    const e      = existing ?? {};
    const settingOpts = cachedRunSettings.map(s =>
      `<option value="${s.id}"
         data-material="${s.material.replace(/"/g, '&quot;')}"
         data-op="${s.operation}"
         ${s.id === e.setting_id ? 'selected' : ''}>
         ${s.material} / ${s.operation} — ${s.power ?? '?'}% ${s.speed ?? '?'}mm/sec${s.role === 'confirmed' ? ' ✓' : ''}
       </option>`
    ).join('');
    const selOp = v => v === e.operation ? 'selected' : '';
    return `
      <div style="background:var(--surface2);padding:8px 10px;border-radius:4px;
                  margin:4px 0 6px;font-size:0.85rem">
        <div style="font-size:0.8rem;font-weight:600;margin-bottom:6px;color:var(--text-muted)">
          ${isEdit ? 'Edit setting' : 'Add setting'}
        </div>
        <div class="form-row" style="margin-bottom:6px">
          <div style="flex:1">
            <label style="font-size:0.78rem">Setting</label>
            <select class="rss-setting" data-run-id="${runId}">
              <option value="">— Custom params —</option>
              ${settingOpts}
            </select>
          </div>
          <div>
            <label style="font-size:0.78rem">Operation</label>
            <select class="rss-operation" data-run-id="${runId}" style="font-size:0.85rem">
              <option value="">—</option>
              <option value="engrave" ${selOp('engrave')}>Engrave</option>
              <option value="score"   ${selOp('score')}>Score</option>
              <option value="cut"     ${selOp('cut')}>Cut</option>
            </select>
          </div>
          <div style="flex:1">
            <label style="font-size:0.78rem">Purpose <small style="color:var(--text-muted)">(optional)</small></label>
            <input class="rss-purpose" data-run-id="${runId}" type="text"
                   value="${e.purpose ?? ''}"
                   placeholder="e.g. fill, score outline" style="font-size:0.85rem">
          </div>
        </div>
        <div class="form-row" style="margin-bottom:8px">
          <div>
            <label style="font-size:0.78rem">Power %</label>
            <input class="rss-power" data-run-id="${runId}" type="number" min="0" max="100"
                   value="${e.power ?? ''}" style="width:70px;font-size:0.85rem" placeholder="—">
          </div>
          <div>
            <label style="font-size:0.78rem">Speed mm/sec</label>
            <input class="rss-speed" data-run-id="${runId}" type="number" min="1"
                   value="${e.speed ?? ''}" style="width:80px;font-size:0.85rem" placeholder="—">
          </div>
          <div>
            <label style="font-size:0.78rem">LPI</label>
            <input class="rss-lpi" data-run-id="${runId}" type="number" min="1"
                   value="${e.lines_per_inch ?? ''}" style="width:65px;font-size:0.85rem" placeholder="—">
          </div>
          <div>
            <label style="font-size:0.78rem">Passes</label>
            <input class="rss-passes" data-run-id="${runId}" type="number" min="1"
                   value="${e.passes ?? ''}" style="width:60px;font-size:0.85rem" placeholder="—">
          </div>
          <div>
            <label style="font-size:0.78rem">Focus mm</label>
            <input class="rss-focus" data-run-id="${runId}" type="number" step="0.1"
                   value="${e.focus_offset_mm ?? ''}" style="width:70px;font-size:0.85rem" placeholder="—">
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm rss-save"
                  data-run-id="${runId}"
                  data-mode="${isEdit ? 'edit' : 'add'}"
                  data-sid="${e.id ?? ''}">${isEdit ? 'Save' : 'Add'}</button>
          <button class="btn btn-secondary btn-sm rss-cancel" data-run-id="${runId}">Cancel</button>
        </div>
      </div>`;
  }

  function renderRunRow(run) {
    const hasSettings = run.settings && run.settings.length > 0;
    return `
      <div id="run-row-${run.id}"
           style="background:var(--surface2);border:1px solid var(--border);
                  border-radius:var(--radius);padding:10px 12px;display:flex;flex-direction:column;gap:6px">

        <!-- Card header: run number + material + outcome + action buttons -->
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="color:var(--text-muted);font-size:0.75rem;font-weight:700;
                       background:var(--surface);border:1px solid var(--border);
                       border-radius:3px;padding:1px 5px">#${run.run_number}</span>
          ${run.material ? `<strong style="font-size:0.9rem">${run.material}</strong>` : '<em style="color:var(--text-muted);font-size:0.85rem">no material</em>'}
          ${run.artifact_name ? `<span style="font-size:0.78rem;color:var(--accent2);background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:1px 5px">${run.artifact_name}</span>` : ''}
          ${run.outcome  ? `<span style="color:${OUTCOME_COLOR[run.outcome]??'inherit'};font-size:0.82rem">${run.outcome}</span>` : ''}
          <div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0">
            <button class="btn btn-secondary btn-sm run-toggle-obs" data-run-id="${run.id}">Obs ▾</button>
            <button class="btn btn-secondary btn-sm run-edit-btn"   data-run-id="${run.id}">Edit</button>
            <button class="btn btn-danger    btn-sm run-del-btn"    data-run-id="${run.id}">Del</button>
          </div>
        </div>

        <!-- Per-setting parameter rows -->
        <div id="run-settings-${run.id}" style="padding-left:4px">
          ${hasSettings
            ? run.settings.map(s => renderRunSettingRow(s, run.id, run)).join('')
            : '<span style="color:var(--text-muted);font-size:0.8rem">No settings yet.</span>'}
        </div>

        <!-- Add/edit setting form slot -->
        <div id="run-setting-form-${run.id}"></div>

        <!-- Footer: file, notes, + Setting button -->
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:0.8rem;
                    padding-top:4px;border-top:1px solid var(--border)">
          ${run.file_used ? `<span style="color:var(--text-muted)">${run.file_used}</span>` : ''}
          ${run.notes     ? `<em style="color:var(--text-muted)">${run.notes}</em>` : ''}
          <button class="btn btn-secondary btn-sm run-add-setting"
                  data-run-id="${run.id}"
                  style="font-size:0.75rem;padding:2px 7px;margin-left:auto">+ Setting</button>
        </div>

        <!-- Observations panel (hidden until toggled) -->
        <div id="run-obs-${run.id}"
             style="display:none;padding-top:8px;border-top:1px solid var(--border)">
        </div>
      </div>`;
  }

  function renderRunObsSection(obs, runId) {
    const undismissed = obs.filter(o => !o.dismissed_at);
    return `
      <div id="run-obs-list-${runId}">
        ${undismissed.length
          ? undismissed.map(o => `
              <div style="display:flex;justify-content:space-between;align-items:flex-start;
                          padding:5px 0;border-bottom:1px solid var(--border);gap:8px;font-size:0.85rem">
                <div>
                  <span style="color:${TYPE_COLOR[o.type]};font-size:0.72rem;text-transform:uppercase;font-weight:600">${o.type}</span>
                  ${outcomeBadge(o.outcome)}
                  <span style="margin-left:6px">${o.content}</span>
                </div>
                <button class="btn btn-secondary btn-sm run-obs-dismiss" data-id="${o.id}" data-run-id="${runId}" style="flex-shrink:0">Dismiss</button>
              </div>`).join('')
          : '<p style="color:var(--text-muted);font-size:0.8rem;margin:4px 0">No observations for this run.</p>'}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
        <select class="run-obs-type" data-run-id="${runId}" style="font-size:0.85rem;flex-shrink:0">
          <option value="note">Note</option>
          <option value="discovery">Discovery</option>
          <option value="issue">Issue</option>
          <option value="question">Question</option>
        </select>
        <select class="run-obs-outcome" data-run-id="${runId}" style="font-size:0.85rem;flex-shrink:0">
          <option value="">outcome…</option>
          <option value="positive">positive</option>
          <option value="negative">negative</option>
          <option value="neutral">neutral</option>
          <option value="unexpected">unexpected</option>
        </select>
        <input class="run-obs-input" data-run-id="${runId}" type="text"
               style="flex:1;min-width:150px;font-size:0.85rem"
               placeholder="Observation for this run…">
        <button class="btn btn-primary btn-sm run-obs-add" data-run-id="${runId}">Add</button>
      </div>`;
  }

  function buildRunForm(sessionId, run = null) {
    const isEdit = !!run;
    const artifactOpts = cachedArtifacts.map(a =>
      `<option value="${a.id}" ${a.id === run?.artifact_id ? 'selected' : ''}>${a.name}</option>`
    ).join('');
    return `
      <div style="margin-top:10px;padding:12px;background:var(--surface2);border-radius:var(--radius)">
        <strong style="font-size:0.9rem">${isEdit ? `Edit Run #${run.run_number}` : 'Add Run'}</strong>
        <div class="form-row" style="margin-top:8px">
          <div>
            <label>Material <abbr title="Never PVC, vinyl, or chlorine-containing materials">⚠</abbr></label>
            <input id="rf-material" type="text" list="rf-mat-list"
                   value="${run?.material ?? ''}" placeholder="e.g. Glass">
            <datalist id="rf-mat-list">
              ${cachedRunMaterials.map(m => `<option value="${m}">`).join('')}
            </datalist>
          </div>
          <div>
            <label>Artifact <small style="color:var(--text-muted)">(optional)</small></label>
            <select id="rf-artifact">
              <option value="">— None —</option>
              ${artifactOpts}
            </select>
          </div>
          <div style="flex:1">
            <label>File used</label>
            <input id="rf-file" type="text" value="${run?.file_used ?? ''}" placeholder="filename.svg">
          </div>
          <div>
            <label>Outcome</label>
            <select id="rf-outcome">
              <option value="">—</option>
              <option value="success" ${run?.outcome==='success'?'selected':''}>Success</option>
              <option value="partial" ${run?.outcome==='partial'?'selected':''}>Partial</option>
              <option value="failed"  ${run?.outcome==='failed' ?'selected':''}>Failed</option>
            </select>
          </div>
        </div>
        <div class="form-row" style="margin-top:6px">
          <div style="flex:1">
            <label>Notes</label>
            <input id="rf-notes" type="text" value="${run?.notes ?? ''}">
          </div>
        </div>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:8px 0 0">
          Settings (operation, power, speed, passes, focus) are added per-setting below the run row.
        </p>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-primary btn-sm" id="rf-save">${isEdit ? 'Save' : 'Add Run'}</button>
          <button class="btn btn-secondary btn-sm" id="rf-cancel">Cancel</button>
        </div>
      </div>`;
  }

  // ── Session detail panel ──────────────────────────────────────────
  async function showSessionDetail(sessionId) {
    currentDetailSessionId = sessionId;
    detailWrap.innerHTML = '<p class="loading" style="margin-top:16px">Loading…</p>';
    document.querySelectorAll('#sessions-body tr').forEach(r => r.classList.remove('row-selected'));
    document.querySelector(`#sessions-body tr[data-id="${sessionId}"]`)?.classList.add('row-selected');
    detailWrap.scrollIntoView({ behavior: 'smooth' });

    try {
      const [session, projects, obs, users, runs] = await Promise.all([
        apiFetch(`/api/usage/${sessionId}`),
        apiFetch('/api/projects'),
        apiFetch(`/api/observations?session_id=${sessionId}`),
        apiFetch('/api/users'),
        apiFetch(`/api/runs?session_id=${sessionId}`),
      ]);

      const undismissed = obs.filter(o => !o.dismissed_at && !o.run_id);
      const dismissed   = obs.filter(o =>  o.dismissed_at && !o.run_id);

      detailWrap.innerHTML = `
        <div class="card session-detail-card" style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:12px">
            <div>
              <h2 style="margin:0 0 2px">Session — ${session.job_date}</h2>
              ${session.project_name_resolved
                ? `<div style="font-size:0.875rem;color:var(--text-muted)">
                     Project: <strong style="color:var(--text)">${session.project_name_resolved}</strong>
                   </div>`
                : `<div style="font-size:0.875rem;color:var(--text-muted)">Standalone session</div>`}
            </div>
            <button class="btn btn-secondary btn-sm" id="close-detail" style="flex-shrink:0">✕ Close</button>
          </div>

          <div class="form-row" style="margin-bottom:10px">
            <div>
              <label>Date</label>
              <input id="det-date" type="date" value="${session.job_date ?? ''}">
            </div>
            <div>
              <label>User</label>
              <select id="det-user">
                <option value="">— None —</option>
                ${users.map(u => `<option value="${u.id}" ${u.id === session.user_id ? 'selected' : ''}>${u.name}</option>`).join('')}
              </select>
            </div>
            <div style="flex:1">
              <label>Project</label>
              <select id="det-project">
                <option value="">— Standalone —</option>
                ${projects.map(p => `<option value="${p.id}" ${p.id === session.project_id ? 'selected' : ''}>${p.name} (${p.status})</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row" style="margin-bottom:16px">
            <div>
              <label>Duration (min)</label>
              <input id="det-duration" type="number" min="1" value="${session.duration_min ?? ''}" style="width:90px">
            </div>
            <div style="flex:2">
              <label>Session notes</label>
              <input id="det-notes" type="text" value="${session.notes ?? ''}">
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:20px;align-items:center">
            <button class="btn btn-primary btn-sm" id="det-save">Save</button>
            <button class="btn btn-danger btn-sm"  id="det-delete">Delete Session</button>
          </div>
          <div id="det-save-banner"></div>

          <!-- Runs -->
          <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:4px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <h3 style="margin:0">Runs (${runs.length})</h3>
              <button class="btn btn-primary btn-sm" id="btn-add-run">+ Add Run</button>
            </div>
            <div id="det-runs-list"
                 style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:4px">
              ${runs.length
                ? runs.map(r => renderRunRow(r)).join('')
                : '<p style="color:var(--text-muted);font-size:0.875rem">No runs yet.</p>'}
            </div>
            <div id="det-run-form-wrap"></div>
          </div>

          <!-- Session-level observations -->
          <div style="border-top:1px solid var(--border);padding-top:14px">
            <h3 style="margin-top:0">Session Observations (${undismissed.length} open${dismissed.length ? ', ' + dismissed.length + ' dismissed' : ''})</h3>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;
                        padding:10px 12px;background:var(--surface2);border-radius:var(--radius)">
              <select id="det-obs-type" style="flex-shrink:0;min-width:100px">
                <option value="note">Note</option>
                <option value="discovery">Discovery</option>
                <option value="issue">Issue</option>
                <option value="question">Question</option>
              </select>
              <select id="det-obs-outcome" style="flex-shrink:0;min-width:110px">
                <option value="">outcome…</option>
                <option value="positive">positive</option>
                <option value="negative">negative</option>
                <option value="neutral">neutral</option>
                <option value="unexpected">unexpected</option>
              </select>
              <select id="det-obs-setting" style="flex-shrink:0;min-width:160px">
                <option value="">— no setting —</option>
                ${cachedRunSettings.map(s => `<option value="${s.id}">${s.material} / ${s.operation} (P:${s.power ?? '?'} S:${s.speed ?? '?'})</option>`).join('')}
              </select>
              <input id="det-obs-input" type="text" style="flex:1;min-width:180px"
                placeholder="Add a session-level observation…">
              <button class="btn btn-primary btn-sm" id="det-add-obs" style="flex-shrink:0">Add</button>
              <span id="det-obs-feedback" style="font-size:0.8rem;width:100%;min-height:1em"></span>
            </div>
            <div id="review-obs-list">
              ${undismissed.length
                ? undismissed.map(o => renderObsRow(o, true)).join('')
                : '<p style="color:var(--text-muted);font-size:0.875rem">No open observations.</p>'}
            </div>
            ${dismissed.length ? `
              <details style="margin-top:8px">
                <summary style="cursor:pointer;font-size:0.8rem;color:var(--text-muted)">Show ${dismissed.length} dismissed</summary>
                <div style="margin-top:8px;opacity:0.6">
                  ${dismissed.map(o => renderObsRow(o, false)).join('')}
                </div>
              </details>` : ''}
          </div>
        </div>`;

      // ── Wire up detail panel handlers ─────────────────────────────
      document.getElementById('close-detail').onclick = () => {
        detailWrap.innerHTML = '';
        currentDetailSessionId = null;
        document.querySelectorAll('#sessions-body tr').forEach(r => r.classList.remove('row-selected'));
      };

      document.getElementById('det-save').onclick = async () => {
        const payload = {
          job_date:    document.getElementById('det-date').value           || null,
          user_id:    +document.getElementById('det-user').value           || null,
          project_id: +document.getElementById('det-project').value        || null,
          duration_min:+document.getElementById('det-duration').value      || null,
          notes:       document.getElementById('det-notes').value.trim()   || null,
        };
        try {
          await apiFetch(`/api/usage/${sessionId}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
          });
          document.getElementById('det-save-banner').innerHTML =
            '<div class="banner banner-success">Saved.</div>';
          setTimeout(() => {
            const b = document.getElementById('det-save-banner');
            if (b) b.innerHTML = '';
          }, 3000);
          await loadSessions();
        } catch (e) {
          document.getElementById('det-save-banner').innerHTML =
            `<div class="banner banner-error">${e.message}</div>`;
        }
      };

      document.getElementById('det-delete').onclick = async () => {
        if (!confirm(`Delete session ${session.job_date}? This cannot be undone.`)) return;
        try {
          await apiFetch(`/api/usage/${sessionId}`, { method: 'DELETE' });
          detailWrap.innerHTML = '';
          currentDetailSessionId = null;
          await loadSessions();
        } catch (e) { showBanner(e.message); }
      };

      // Add run button
      document.getElementById('btn-add-run').onclick = () => {
        document.getElementById('det-run-form-wrap').innerHTML = buildRunForm(sessionId);
        wireRunForm(sessionId, null);
      };

      // Session observation add
      async function submitDetObs() {
        const input      = document.getElementById('det-obs-input');
        const content    = input.value.trim();
        const type       = document.getElementById('det-obs-type').value;
        const outcome    = document.getElementById('det-obs-outcome').value || null;
        const setting_id = +document.getElementById('det-obs-setting').value || null;
        const fb         = document.getElementById('det-obs-feedback');
        if (!content) {
          input.style.borderColor = 'var(--accent)';
          fb.textContent = 'Enter something first.'; fb.style.color = 'var(--accent)';
          setTimeout(() => { input.style.borderColor = ''; fb.textContent = ''; }, 2500);
          return;
        }
        const btn = document.getElementById('det-add-obs');
        btn.disabled = true;
        try {
          await apiFetch('/api/observations', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ session_id: sessionId, content, type, outcome, setting_id }),
          });
          input.value = '';
          fb.textContent = '✓ Added'; fb.style.color = 'var(--success)';
          setTimeout(() => { fb.textContent = ''; }, 2000);
          const updated = await apiFetch(`/api/observations?session_id=${sessionId}`);
          const fresh_u = updated.filter(o => !o.dismissed_at && !o.run_id);
          document.getElementById('review-obs-list').innerHTML = fresh_u.length
            ? fresh_u.map(o => renderObsRow(o, true)).join('')
            : '<p style="color:var(--text-muted);font-size:0.875rem">No open observations.</p>';
        } catch (e) {
          fb.textContent = 'Error: ' + e.message; fb.style.color = 'var(--accent)';
        } finally { btn.disabled = false; }
      }
      document.getElementById('det-add-obs').onclick = submitDetObs;
      document.getElementById('det-obs-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') submitDetObs();
      });

    } catch (e) {
      detailWrap.innerHTML = `<div class="banner banner-error" style="margin-top:12px">${e.message}</div>`;
    }
  }

  function wireRunForm(sessionId, run) {
    document.getElementById('rf-cancel').onclick = () => {
      document.getElementById('det-run-form-wrap').innerHTML = '';
    };
    document.getElementById('rf-save').onclick = async () => {
      const payload = {
        session_id:  sessionId,
        material:    document.getElementById('rf-material').value.trim() || null,
        artifact_id: +document.getElementById('rf-artifact').value       || null,
        file_used:   document.getElementById('rf-file').value.trim()     || null,
        outcome:     document.getElementById('rf-outcome').value         || null,
        notes:       document.getElementById('rf-notes').value.trim()    || null,
      };
      try {
        if (run) {
          await apiFetch(`/api/runs/${run.id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
          });
        } else {
          await apiFetch('/api/runs', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
          });
        }
        await showSessionDetail(sessionId);
      } catch (e) { showBanner(e.message); }
    };
  }

  function renderObsRow(o, showActions = true) {
    return `
      <div id="rev-obs-${o.id}" style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);gap:8px">
        <div>
          <span style="color:${TYPE_COLOR[o.type]};font-size:0.75rem;text-transform:uppercase;font-weight:600">${o.type}</span>
          ${outcomeBadge(o.outcome)}
          ${fmtLinkedSetting(o.setting_id)}
          <span style="margin-left:8px;font-size:0.875rem">${o.content}</span>
          ${o.promoted_to ? `<span style="margin-left:8px;font-size:0.75rem;color:var(--success)">→ ${o.promoted_to.replace('_',' ')}</span>` : ''}
        </div>
        ${showActions ? `
          <div class="obs-actions" style="display:flex;gap:6px;flex-shrink:0;align-items:center;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm rev-promote-note" data-id="${o.id}">→ Note</button>
            <button class="btn btn-secondary btn-sm rev-dismiss" data-id="${o.id}">Dismiss</button>
          </div>` : ''}
      </div>`;
  }

  // ── Delegated click handler for detail panel ──────────────────────
  detailWrap.addEventListener('click', async e => {
    const sessionId = currentDetailSessionId;

    // Run toggle observations
    if (e.target.classList.contains('run-toggle-obs')) {
      const runId  = e.target.dataset.runId;
      const obsDiv = document.getElementById(`run-obs-${runId}`);
      if (!obsDiv) return;
      if (obsDiv.style.display === 'none') {
        const runObs = await apiFetch(`/api/observations?run_id=${runId}`);
        obsDiv.innerHTML  = renderRunObsSection(runObs, runId);
        obsDiv.style.display = 'block';
        e.target.textContent = 'Obs ▴';
      } else {
        obsDiv.style.display = 'none';
        e.target.textContent = 'Obs ▾';
      }
      return;
    }

    // Run edit
    if (e.target.classList.contains('run-edit-btn')) {
      const runId = e.target.dataset.runId;
      try {
        const run = await apiFetch(`/api/runs/${runId}`);
        document.getElementById('det-run-form-wrap').innerHTML = buildRunForm(sessionId, run);
        wireRunForm(sessionId, run);
        document.getElementById('det-run-form-wrap').scrollIntoView({ behavior: 'smooth' });
      } catch (err) { showBanner(err.message); }
      return;
    }

    // Run delete
    if (e.target.classList.contains('run-del-btn')) {
      const runId = e.target.dataset.runId;
      if (!confirm('Delete this run and its observations?')) return;
      try {
        await apiFetch(`/api/runs/${runId}`, { method: 'DELETE' });
        await showSessionDetail(sessionId);
      } catch (err) { showBanner(err.message); }
      return;
    }

    // Show add-setting form for a run
    if (e.target.classList.contains('run-add-setting')) {
      const runId = e.target.dataset.runId;
      const formDiv = document.getElementById(`run-setting-form-${runId}`);
      if (!formDiv) return;
      if (formDiv.innerHTML) { formDiv.innerHTML = ''; return; } // toggle off
      formDiv.innerHTML = buildRunSettingForm(runId);
      return;
    }

    // Show edit form for an existing setting
    if (e.target.classList.contains('run-setting-edit')) {
      const runId = e.target.dataset.runId;
      const sid   = e.target.dataset.sid;
      const formDiv = document.getElementById(`run-setting-form-${runId}`);
      if (!formDiv) return;
      try {
        // Find the setting in the current DOM data by fetching the run
        const run = await apiFetch(`/api/runs/${runId}`);
        const existing = run.settings.find(s => String(s.id) === String(sid));
        if (!existing) { showBanner('Setting not found'); return; }
        formDiv.innerHTML = buildRunSettingForm(runId, existing);
        formDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) { showBanner(err.message); }
      return;
    }

    // Save (add or edit) a setting on a run
    if (e.target.classList.contains('rss-save')) {
      const runId = e.target.dataset.runId;
      const mode  = e.target.dataset.mode;   // 'add' | 'edit'
      const sid   = e.target.dataset.sid;    // set when mode === 'edit'
      const q     = sel => detailWrap.querySelector(`${sel}[data-run-id="${runId}"]`);
      const power  = q('.rss-power')?.value  ?? '';
      const speed  = q('.rss-speed')?.value  ?? '';
      const lpi    = q('.rss-lpi')?.value    ?? '';
      const passes = q('.rss-passes')?.value ?? '';
      const focus  = q('.rss-focus')?.value  ?? '';
      const payload = {
        setting_id:      +q('.rss-setting')?.value  || null,
        operation:        q('.rss-operation')?.value || null,
        purpose:          q('.rss-purpose')?.value.trim() || null,
        power:           power  !== '' ? +power  : null,
        speed:           speed  !== '' ? +speed  : null,
        lines_per_inch:  lpi    !== '' ? +lpi    : null,
        passes:          passes !== '' ? +passes : null,
        focus_offset_mm: focus  !== '' ? +focus  : null,
      };
      const btn = e.target;
      btn.disabled = true; btn.textContent = '…';
      try {
        const url    = mode === 'edit'
          ? `/api/runs/${runId}/settings/${sid}`
          : `/api/runs/${runId}/settings`;
        const method = mode === 'edit' ? 'PUT' : 'POST';
        const updatedSettings = await apiFetch(url, {
          method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
        });
        const settingsDiv = document.getElementById(`run-settings-${runId}`);
        if (settingsDiv) {
          let runArtifact = null;
          try { const rr = await apiFetch(`/api/runs/${runId}`); runArtifact = rr; } catch (_) {}
          settingsDiv.innerHTML = updatedSettings.length
            ? updatedSettings.map(s => renderRunSettingRow(s, +runId, runArtifact)).join('')
            : '<span style="color:var(--text-muted);font-size:0.8rem">No settings yet.</span>';
        }
        const formDiv = document.getElementById(`run-setting-form-${runId}`);
        if (formDiv) formDiv.innerHTML = '';
      } catch (err) {
        showBanner(err.message);
        btn.disabled = false; btn.textContent = mode === 'edit' ? 'Save' : 'Add';
      }
      return;
    }

    // Cancel add-setting form
    if (e.target.classList.contains('rss-cancel')) {
      const runId  = e.target.dataset.runId;
      const formDiv = document.getElementById(`run-setting-form-${runId}`);
      if (formDiv) formDiv.innerHTML = '';
      return;
    }

    // Remove a setting from a run
    if (e.target.classList.contains('run-setting-del')) {
      const runId = e.target.dataset.runId;
      const sid   = e.target.dataset.sid;
      if (!confirm('Remove this setting from the run?')) return;
      try {
        const updatedSettings = await apiFetch(`/api/runs/${runId}/settings/${sid}`, { method: 'DELETE' });
        const settingsDiv = document.getElementById(`run-settings-${runId}`);
        if (settingsDiv) {
          let runArtifact = null;
          try { const rr = await apiFetch(`/api/runs/${runId}`); runArtifact = rr; } catch (_) {}
          settingsDiv.innerHTML = updatedSettings.length
            ? updatedSettings.map(s => renderRunSettingRow(s, runId, runArtifact)).join('')
            : '<span style="color:var(--text-muted);font-size:0.8rem">No settings yet.</span>';
        }
      } catch (err) { showBanner(err.message); }
      return;
    }

    // Run observation add
    if (e.target.classList.contains('run-obs-add')) {
      const runId  = e.target.dataset.runId;
      const input  = detailWrap.querySelector(`.run-obs-input[data-run-id="${runId}"]`);
      const type    = detailWrap.querySelector(`.run-obs-type[data-run-id="${runId}"]`)?.value;
      const outcome = detailWrap.querySelector(`.run-obs-outcome[data-run-id="${runId}"]`)?.value || null;
      const content = input?.value.trim();
      if (!content) {
        if (input) { input.style.borderColor = 'var(--accent)'; setTimeout(() => { input.style.borderColor = ''; }, 2000); }
        return;
      }
      try {
        await apiFetch('/api/observations', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ run_id: +runId, content, type: type ?? 'note', outcome }),
        });
        if (input) input.value = '';
        const updated = await apiFetch(`/api/observations?run_id=${runId}`);
        const obsDiv  = document.getElementById(`run-obs-${runId}`);
        if (obsDiv) obsDiv.innerHTML = renderRunObsSection(updated, runId);
      } catch (err) { showBanner(err.message); }
      return;
    }

    // Run observation dismiss
    if (e.target.classList.contains('run-obs-dismiss')) {
      const id    = e.target.dataset.id;
      const runId = e.target.dataset.runId;
      try {
        await apiFetch(`/api/observations/${id}/dismiss`, { method: 'PUT' });
        const updated = await apiFetch(`/api/observations?run_id=${runId}`);
        const obsDiv  = document.getElementById(`run-obs-${runId}`);
        if (obsDiv) obsDiv.innerHTML = renderRunObsSection(updated, runId);
      } catch (err) { showBanner(err.message); }
      return;
    }

    // Session observation handlers
    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains('rev-dismiss')) {
      try {
        await apiFetch(`/api/observations/${id}/dismiss`, { method: 'PUT' });
        await showSessionDetail(sessionId);
      } catch (err) { showBanner(err.message); }

    } else if (e.target.classList.contains('rev-promote-note')) {
      const row = document.getElementById(`rev-obs-${id}`);
      if (!row) return;
      const actionsDiv = row.querySelector('.obs-actions');
      if (!actionsDiv) return;
      actionsDiv.innerHTML = `
        <input id="promote-topic-${id}" type="text"
          placeholder="Topic (e.g. Glass engraving)"
          style="font-size:0.825rem;padding:4px 8px;border:1px solid var(--border);
                 background:var(--surface2);color:var(--text);border-radius:4px;width:220px">
        <button class="btn btn-primary btn-sm promote-save" data-id="${id}">Save note</button>
        <button class="btn btn-secondary btn-sm promote-cancel" data-id="${id}">✕</button>`;
      document.getElementById(`promote-topic-${id}`)?.focus();
      document.getElementById(`promote-topic-${id}`)?.addEventListener('keydown', async ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          document.querySelector(`.promote-save[data-id="${id}"]`)?.click();
        }
      });

    } else if (e.target.classList.contains('promote-cancel')) {
      await showSessionDetail(sessionId);

    } else if (e.target.classList.contains('promote-save')) {
      const topic = document.getElementById(`promote-topic-${id}`)?.value.trim();
      if (!topic) {
        const inp = document.getElementById(`promote-topic-${id}`);
        if (inp) { inp.style.borderColor = 'var(--accent)'; inp.focus(); }
        return;
      }
      try {
        await apiFetch(`/api/observations/${id}/promote/note`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ topic }),
        });
        await showSessionDetail(sessionId);
      } catch (err) { showBanner(err.message); }
    }
  });

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

      const counts = { planned: 0, in_progress: 0, completed: 0, aborted: 0 };
      rows.forEach(r => { if (r.status in counts) counts[r.status]++; });
      const completed = rows.filter(r => r.status === 'completed');
      const rate = completed.length
        ? Math.round(completed.filter(r => r.outcome === 'success').length / completed.length * 100)
        : 0;

      stats.innerHTML = `
        <div class="stat-box"><div class="stat-val">${counts.planned}</div><div class="stat-lbl">Planned</div></div>
        <div class="stat-box"><div class="stat-val">${counts.in_progress}</div><div class="stat-lbl">In Progress</div></div>
        <div class="stat-box"><div class="stat-val">${counts.completed}</div><div class="stat-lbl">Completed</div></div>
        <div class="stat-box"><div class="stat-val">${counts.aborted}</div><div class="stat-lbl">Aborted</div></div>
        <div class="stat-box"><div class="stat-val">${rate}%</div><div class="stat-lbl">Success Rate</div></div>`;

      const STATUS_BADGE = { in_progress: '🔴 Active', completed: 'Done', aborted: 'Aborted', planned: 'Planned' };

      tbody.innerHTML = rows.map(r => `
        <tr data-id="${r.id}">
          <td>${r.job_date}</td>
          <td>${r.project_name_resolved ?? '—'}</td>
          <td style="text-align:center">${r.run_count ?? 0}</td>
          <td>${r.duration_min != null ? r.duration_min + ' min' : '—'}</td>
          <td style="color:${OUTCOME_COLOR[r.outcome]??'inherit'}">${r.outcome ?? '—'}</td>
          <td><span class="badge">${STATUS_BADGE[r.status] ?? r.status}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm view-session" data-id="${r.id}">Edit</button>
            <button class="btn btn-danger    btn-sm del-session"  data-id="${r.id}">Del</button>
          </td>
        </tr>`).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="banner banner-error">${e.message}</td></tr>`;
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
    const project_id = +document.getElementById('ss-project').value  || null;
    const material   = document.getElementById('ss-material').value.trim() || null;
    const operation  = document.getElementById('ss-operation').value  || null;
    const setting_id = +document.getElementById('ss-setting').value   || null;
    const file_used  = document.getElementById('ss-file').value.trim()|| null;
    const user_id    = +document.getElementById('ss-user').value      || null;
    try {
      await apiFetch('/api/usage/start', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ project_id, material, operation, setting_id, file_used, user_id }),
      });
      await refresh();
    } catch (e) { showBanner(e.message); }
  };

  document.getElementById('btn-filter-sessions').onclick = loadSessions;

  async function refresh() {
    const active = await apiFetch('/api/usage?status=in_progress');
    const currentSession = active[0] ?? null;
    document.getElementById('start-session-wrap').style.display = currentSession ? 'none' : 'block';
    await renderActiveSession(currentSession);
    await loadSessions();
  }

  try { await populateDropdowns(); } catch (e) { showBanner('Could not load dropdowns: ' + e.message); }
  await refresh();
};
