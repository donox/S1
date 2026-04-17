window.sessionsInit = async function () {
  const activeWrap  = document.getElementById('active-session-wrap');
  const tbody       = document.getElementById('sessions-body');
  const stats       = document.getElementById('session-stats');
  const detailWrap  = document.getElementById('session-detail-wrap');
  let elapsedTimer  = null;
  let currentDetailSessionId = null;
  let cachedRunSettings  = [];
  let cachedRunMaterials = [];
  let cachedArtifacts    = [];

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
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

  const TYPE_CLASS = {
    note: 'text-muted', discovery: 'text-success',
    issue: 'text-primary', question: 'text-warning',
  };
  const OUTCOME_CLASS = {
    success: 'text-success', partial: 'text-warning', failed: 'text-danger',
  };
  const OBS_OUTCOME_CLASS = {
    positive: 'text-success', negative: 'text-danger',
    neutral: 'text-muted', unexpected: 'text-warning',
  };
  const STATUS_BS = {
    in_progress: 'text-bg-danger', completed: 'text-bg-success',
    aborted: 'text-bg-secondary', planned: 'text-bg-warning',
  };
  const STATUS_LABEL = {
    in_progress: '● Active', completed: 'Done', aborted: 'Aborted', planned: 'Planned',
  };

  function outcomeBadge(outcome) {
    if (!outcome) return '';
    const cls = OBS_OUTCOME_CLASS[outcome] ?? 'text-muted';
    return `<span class="${cls} small text-uppercase fw-semibold ms-2">${outcome}</span>`;
  }

  function fmtLinkedSetting(settingId) {
    if (!settingId) return '';
    const s = cachedRunSettings.find(r => r.id === settingId);
    if (!s) return '';
    return `<span class="text-muted small ms-2">[${s.material} / ${s.operation}]</span>`;
  }

  function fmtParam(runOverride, base, delta, unit) {
    if (runOverride != null) return `<strong>${runOverride}${unit}</strong>`;
    if (base == null) return null;
    if (!delta) return `${base}${unit}`;
    const effective = base + delta;
    const sign = delta > 0 ? '+' : '';
    return `${base}${unit}<span class="text-warning" style="font-size:0.75em"> ${sign}${delta}→</span><strong>${effective}${unit}</strong>`;
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
      <div class="card active-session-card mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <div class="d-flex align-items-center gap-2 mb-1">
                <span class="text-success fs-5">●</span>
                <strong>Session in progress</strong>
              </div>
              ${session.project_name_resolved ? `<div class="text-muted small">Project: ${session.project_name_resolved}</div>` : ''}
              ${session.user_name ? `<div class="text-muted small">User: ${session.user_name}</div>` : ''}
              <div class="text-muted small">
                Started: ${fmtTime(session.started_at)} &nbsp;·&nbsp;
                Elapsed: <span id="elapsed-display">${elapsed(session.started_at)}</span>
              </div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-primary btn-sm" id="btn-complete-session" data-id="${session.id}">Complete</button>
              <button class="btn btn-danger btn-sm" id="btn-abort-session" data-id="${session.id}">Abort</button>
            </div>
          </div>

          <div class="mt-3 pt-3 border-top">
            <div class="d-flex gap-2 mb-2 align-items-center flex-wrap">
              <select class="form-select form-select-sm flex-shrink-0" id="obs-type" style="width:auto">
                <option value="note">Note</option>
                <option value="discovery">Discovery</option>
                <option value="issue">Issue</option>
                <option value="question">Question</option>
              </select>
              <select class="form-select form-select-sm flex-shrink-0" id="obs-outcome" style="width:auto">
                <option value="">outcome…</option>
                <option value="positive">positive</option>
                <option value="negative">negative</option>
                <option value="neutral">neutral</option>
                <option value="unexpected">unexpected</option>
              </select>
              <input class="form-control form-control-sm flex-grow-1" id="obs-input" type="text"
                placeholder="Note anything worth remembering…" style="min-width:200px">
              <button class="btn btn-primary btn-sm flex-shrink-0" id="btn-add-obs">Add →</button>
            </div>
            <div id="obs-feedback" class="small min-h-feedback mb-1"></div>
            <div id="obs-list" class="small">
              ${renderObsList(obs, session.id)}
            </div>
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
    function setObsFeedback(msg, type = '') {
      const el = document.getElementById('obs-feedback');
      if (!el) return;
      el.textContent = msg;
      el.className = `small min-h-feedback mb-1 ${
        type === 'success' ? 'text-success' : type === 'error' ? 'text-danger' : 'text-muted'
      }`;
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
        input.classList.add('is-invalid');
        setObsFeedback('Enter something before clicking Add.', 'error');
        input.focus();
        setTimeout(() => { input.classList.remove('is-invalid'); setObsFeedback(''); }, 2500);
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
        setObsFeedback('✓ Added', 'success');
        setTimeout(() => setObsFeedback(''), 2000);
        const updated = await apiFetch(`/api/observations?session_id=${session.id}&dismissed=false`);
        document.getElementById('obs-list').innerHTML = renderObsList(updated, session.id);
      } catch (e) {
        setObsFeedback('Error: ' + e.message, 'error');
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
      } catch (e) { window.showToast(e.message); }
    };
    document.getElementById('obs-list').addEventListener('click', async e => {
      if (!e.target.classList.contains('dismiss-obs')) return;
      const id = e.target.dataset.id;
      try {
        await apiFetch(`/api/observations/${id}/dismiss`, { method: 'PUT' });
        const updated = await apiFetch(`/api/observations?session_id=${session.id}&dismissed=false`);
        document.getElementById('obs-list').innerHTML = renderObsList(updated, session.id);
      } catch (err) { window.showToast(err.message); }
    });
  }

  function renderObsList(obs, sessionId) {
    if (!obs.length) return '<p class="text-muted mb-0">No observations yet.</p>';
    return obs.map(o => `
      <div class="d-flex justify-content-between align-items-start py-2 border-bottom gap-2">
        <div>
          <span class="${TYPE_CLASS[o.type] ?? 'text-muted'} small text-uppercase fw-semibold">${o.type}</span>
          ${outcomeBadge(o.outcome)}
          <span class="ms-2">${o.content}</span>
        </div>
        <button class="btn btn-secondary btn-sm flex-shrink-0 dismiss-obs" data-id="${o.id}">Dismiss</button>
      </div>`).join('');
  }

  function showCompleteForm(session) {
    activeWrap.querySelector('.card').insertAdjacentHTML('beforeend', `
      <div id="complete-form" class="mt-3 pt-3 border-top">
        <h3 class="h6 mb-3">Complete Session</h3>
        <div class="row g-2 align-items-end mb-2">
          <div class="col-auto">
            <label class="form-label small">Outcome</label>
            <select class="form-select form-select-sm" id="comp-outcome">
              <option value="success">Success</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div class="col">
            <label class="form-label small">Final notes</label>
            <input class="form-control form-control-sm" id="comp-notes" type="text" placeholder="Optional summary">
          </div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm" id="confirm-complete">Confirm Complete</button>
          <button class="btn btn-secondary btn-sm" id="cancel-complete">Cancel</button>
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
      } catch (e) { window.showToast(e.message); }
    };
  }

  // ── Runs section ──────────────────────────────────────────────────

  function fmtParam(runOverride, base, delta, unit) {
    if (runOverride != null) return `<strong>${runOverride}${unit}</strong>`;
    if (base == null) return null;
    if (!delta) return `${base}${unit}`;
    const effective = base + delta;
    const sign = delta > 0 ? '+' : '';
    return `${base}${unit}<span class="text-warning" style="font-size:0.75em"> ${sign}${delta}→</span><strong>${effective}${unit}</strong>`;
  }

  function renderRunSettingRow(s, runId, artifact) {
    const op     = s.effective_operation;
    const params = [];
    const pwr = fmtParam(s.power, s.setting_power, artifact?.power_delta, '%');
    const spd = fmtParam(s.speed, s.setting_speed, artifact?.speed_delta, 'mm/sec');
    const lpiVal = s.lines_per_inch ?? s.setting_lpi;
    const passes = s.passes ?? s.setting_passes;
    const foc = fmtParam(s.focus_offset_mm, s.setting_focus, artifact?.focus_delta, 'mm');
    const passDelta = artifact?.passes_delta;
    const passBase  = passes;
    let passStr = null;
    if (passBase != null) {
      if (passDelta) {
        const eff  = passBase + passDelta;
        const sign = passDelta > 0 ? '+' : '';
        passStr = `×${passBase}<span class="text-warning" style="font-size:0.75em"> ${sign}${passDelta}→</span><strong>×${eff}</strong>`;
      } else if (passBase > 1) {
        passStr = `×${passBase}`;
      }
    }
    if (pwr    != null) params.push(pwr);
    if (spd    != null) params.push(spd);
    if (lpiVal != null) params.push(`${lpiVal} LPI`);
    if (passStr != null) params.push(passStr);
    if (foc    != null && (s.focus_offset_mm ?? s.setting_focus) !== 0) params.push(`focus ${foc}`);
    return `
      <div class="d-flex align-items-center gap-2 flex-wrap small mb-1 py-1">
        <span class="text-muted">↳</span>
        ${op ? `<span class="badge bg-secondary">${op}</span>` : '<span class="text-muted">—</span>'}
        ${params.length ? `<span class="text-muted">${params.join(' · ')}</span>` : ''}
        ${s.purpose ? `<em>${s.purpose}</em>` : ''}
        <div class="d-flex gap-1 ms-auto">
          <button class="btn btn-secondary btn-xs run-setting-edit"
            data-run-id="${runId}" data-sid="${s.id}">Edit</button>
          <button class="btn btn-danger btn-xs run-setting-del"
            data-run-id="${runId}" data-sid="${s.id}">×</button>
        </div>
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
      <div class="card card-body p-2 my-2 small">
        <div class="fw-semibold text-muted mb-2">${isEdit ? 'Edit setting' : 'Add setting'}</div>
        <div class="row g-2 align-items-end mb-2">
          <div class="col">
            <label class="form-label small mb-1">Setting</label>
            <select class="form-select form-select-sm rss-setting" data-run-id="${runId}">
              <option value="">— Custom params —</option>
              ${settingOpts}
            </select>
          </div>
          <div class="col-auto">
            <label class="form-label small mb-1">Operation</label>
            <select class="form-select form-select-sm rss-operation" data-run-id="${runId}">
              <option value="">—</option>
              <option value="engrave" ${selOp('engrave')}>Engrave</option>
              <option value="score"   ${selOp('score')}>Score</option>
              <option value="cut"     ${selOp('cut')}>Cut</option>
            </select>
          </div>
          <div class="col">
            <label class="form-label small mb-1">Purpose <span class="text-muted fw-normal">(optional)</span></label>
            <input class="form-control form-control-sm rss-purpose" data-run-id="${runId}" type="text"
              value="${e.purpose ?? ''}" placeholder="e.g. fill, score outline">
          </div>
        </div>
        <div class="row g-2 align-items-end mb-2">
          <div class="col-auto">
            <label class="form-label small mb-1">Power %</label>
            <input class="form-control form-control-sm rss-power" data-run-id="${runId}"
              type="number" min="0" max="100" value="${e.power ?? ''}" style="width:70px" placeholder="—">
          </div>
          <div class="col-auto">
            <label class="form-label small mb-1">Speed mm/s</label>
            <input class="form-control form-control-sm rss-speed" data-run-id="${runId}"
              type="number" min="1" value="${e.speed ?? ''}" style="width:80px" placeholder="—">
          </div>
          <div class="col-auto">
            <label class="form-label small mb-1">LPI</label>
            <input class="form-control form-control-sm rss-lpi" data-run-id="${runId}"
              type="number" min="1" value="${e.lines_per_inch ?? ''}" style="width:65px" placeholder="—">
          </div>
          <div class="col-auto">
            <label class="form-label small mb-1">Passes</label>
            <input class="form-control form-control-sm rss-passes" data-run-id="${runId}"
              type="number" min="1" value="${e.passes ?? ''}" style="width:60px" placeholder="—">
          </div>
          <div class="col-auto">
            <label class="form-label small mb-1">Focus mm</label>
            <input class="form-control form-control-sm rss-focus" data-run-id="${runId}"
              type="number" step="0.1" value="${e.focus_offset_mm ?? ''}" style="width:70px" placeholder="—">
          </div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm rss-save"
            data-run-id="${runId}" data-mode="${isEdit ? 'edit' : 'add'}"
            data-sid="${e.id ?? ''}">${isEdit ? 'Save' : 'Add'}</button>
          <button class="btn btn-secondary btn-sm rss-cancel" data-run-id="${runId}">Cancel</button>
        </div>
      </div>`;
  }

  function renderRunRow(run) {
    const hasSettings = run.settings && run.settings.length > 0;
    return `
      <div id="run-row-${run.id}" class="card mb-2">
        <div class="card-body p-2">
          <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
            <span class="badge bg-secondary">#${run.run_number}</span>
            ${run.material ? `<strong class="small">${run.material}</strong>` : '<em class="text-muted small">no material</em>'}
            ${run.artifact_name ? `<span class="badge text-bg-warning">${run.artifact_name}</span>` : ''}
            ${run.outcome ? `<span class="${OUTCOME_CLASS[run.outcome] ?? ''} small">${run.outcome}</span>` : ''}
            <div class="d-flex gap-1 ms-auto flex-shrink-0">
              <button class="btn btn-secondary btn-xs run-toggle-obs" data-run-id="${run.id}">Obs ▾</button>
              <button class="btn btn-secondary btn-xs run-edit-btn"   data-run-id="${run.id}">Edit</button>
              <button class="btn btn-danger    btn-xs run-del-btn"    data-run-id="${run.id}">Del</button>
            </div>
          </div>

          <div id="run-settings-${run.id}" class="ps-2">
            ${hasSettings
              ? run.settings.map(s => renderRunSettingRow(s, run.id, run)).join('')
              : '<span class="text-muted small">No settings yet.</span>'}
          </div>

          <div id="run-setting-form-${run.id}"></div>

          <div class="d-flex align-items-center gap-2 flex-wrap small pt-2 mt-1 border-top">
            ${run.file_used ? `<span class="text-muted">${run.file_used}</span>` : ''}
            ${run.notes     ? `<em class="text-muted">${run.notes}</em>` : ''}
            <button class="btn btn-secondary btn-xs run-add-setting ms-auto" data-run-id="${run.id}">+ Setting</button>
          </div>

          <div id="run-obs-${run.id}" class="d-none pt-2 border-top mt-1"></div>
        </div>
      </div>`;
  }

  function renderRunObsSection(obs, runId) {
    const undismissed = obs.filter(o => !o.dismissed_at);
    return `
      <div id="run-obs-list-${runId}">
        ${undismissed.length
          ? undismissed.map(o => `
              <div class="d-flex justify-content-between align-items-start py-1 border-bottom gap-2 small">
                <div>
                  <span class="${TYPE_CLASS[o.type] ?? 'text-muted'} small text-uppercase fw-semibold">${o.type}</span>
                  ${outcomeBadge(o.outcome)}
                  <span class="ms-2">${o.content}</span>
                </div>
                <button class="btn btn-secondary btn-xs run-obs-dismiss flex-shrink-0"
                  data-id="${o.id}" data-run-id="${runId}">Dismiss</button>
              </div>`).join('')
          : '<p class="text-muted small mb-1">No observations for this run.</p>'}
      </div>
      <div class="d-flex gap-2 mt-2 flex-wrap align-items-center">
        <select class="form-select form-select-sm run-obs-type flex-shrink-0" data-run-id="${runId}" style="width:auto">
          <option value="note">Note</option>
          <option value="discovery">Discovery</option>
          <option value="issue">Issue</option>
          <option value="question">Question</option>
        </select>
        <select class="form-select form-select-sm run-obs-outcome flex-shrink-0" data-run-id="${runId}" style="width:auto">
          <option value="">outcome…</option>
          <option value="positive">positive</option>
          <option value="negative">negative</option>
          <option value="neutral">neutral</option>
          <option value="unexpected">unexpected</option>
        </select>
        <input class="form-control form-control-sm flex-grow-1 run-obs-input" data-run-id="${runId}"
          type="text" style="min-width:150px" placeholder="Observation for this run…">
        <button class="btn btn-primary btn-sm run-obs-add" data-run-id="${runId}">Add</button>
      </div>`;
  }

  function buildRunForm(sessionId, run = null) {
    const isEdit    = !!run;
    const artifactOpts = cachedArtifacts.map(a =>
      `<option value="${a.id}" ${a.id === run?.artifact_id ? 'selected' : ''}>${a.name}</option>`
    ).join('');
    return `
      <div class="card card-body mt-2">
        <strong class="small">${isEdit ? `Edit Run #${run.run_number}` : 'Add Run'}</strong>
        <div class="row g-2 align-items-end mt-1 mb-2">
          <div class="col-md-3">
            <label class="form-label small">Material <abbr title="Never PVC, vinyl, or chlorine-containing materials">⚠</abbr></label>
            <input class="form-control form-control-sm" id="rf-material" type="text" list="rf-mat-list"
              value="${run?.material ?? ''}" placeholder="e.g. Glass">
            <datalist id="rf-mat-list">
              ${cachedRunMaterials.map(m => `<option value="${m}">`).join('')}
            </datalist>
          </div>
          <div class="col-md-3">
            <label class="form-label small">Artifact <span class="text-muted fw-normal">(optional)</span></label>
            <select class="form-select form-select-sm" id="rf-artifact">
              <option value="">— None —</option>
              ${artifactOpts}
            </select>
          </div>
          <div class="col-md">
            <label class="form-label small">File used</label>
            <input class="form-control form-control-sm" id="rf-file" type="text"
              value="${run?.file_used ?? ''}" placeholder="filename.svg">
          </div>
          <div class="col-md-2">
            <label class="form-label small">Outcome</label>
            <select class="form-select form-select-sm" id="rf-outcome">
              <option value="">—</option>
              <option value="success" ${run?.outcome==='success'?'selected':''}>Success</option>
              <option value="partial" ${run?.outcome==='partial'?'selected':''}>Partial</option>
              <option value="failed"  ${run?.outcome==='failed' ?'selected':''}>Failed</option>
            </select>
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col">
            <label class="form-label small">Notes</label>
            <input class="form-control form-control-sm" id="rf-notes" type="text" value="${run?.notes ?? ''}">
          </div>
        </div>
        <p class="text-muted small mb-2">
          Settings (operation, power, speed, passes, focus) are added per-setting below the run row.
        </p>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm" id="rf-save">${isEdit ? 'Save' : 'Add Run'}</button>
          <button class="btn btn-secondary btn-sm" id="rf-cancel">Cancel</button>
        </div>
      </div>`;
  }

  // ── Session detail panel ──────────────────────────────────────────
  async function showSessionDetail(sessionId) {
    currentDetailSessionId = sessionId;
    detailWrap.innerHTML = '<p class="text-muted mt-3">Loading…</p>';
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
        <div class="card session-detail-card mt-3">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-3 gap-3">
              <div>
                <h2 class="h5 mb-1">Session — ${session.job_date}</h2>
                ${session.project_name_resolved
                  ? `<div class="text-muted small">Project: <strong>${session.project_name_resolved}</strong></div>`
                  : `<div class="text-muted small">Standalone session</div>`}
              </div>
              <button class="btn btn-secondary btn-sm flex-shrink-0" id="close-detail">✕ Close</button>
            </div>

            <div class="row g-2 align-items-end mb-2">
              <div class="col-auto">
                <label class="form-label small">Date</label>
                <input class="form-control form-control-sm" id="det-date" type="date" value="${session.job_date ?? ''}">
              </div>
              <div class="col-auto">
                <label class="form-label small">User</label>
                <select class="form-select form-select-sm" id="det-user">
                  <option value="">— None —</option>
                  ${users.map(u => `<option value="${u.id}" ${u.id === session.user_id ? 'selected' : ''}>${u.name}</option>`).join('')}
                </select>
              </div>
              <div class="col">
                <label class="form-label small">Project</label>
                <select class="form-select form-select-sm" id="det-project">
                  <option value="">— Standalone —</option>
                  ${projects.map(p => `<option value="${p.id}" ${p.id === session.project_id ? 'selected' : ''}>${p.name} (${p.status})</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="row g-2 align-items-end mb-3">
              <div class="col-auto">
                <label class="form-label small">Duration (min)</label>
                <input class="form-control form-control-sm" id="det-duration" type="number" min="1"
                  value="${session.duration_min ?? ''}" style="width:90px">
              </div>
              <div class="col">
                <label class="form-label small">Session notes</label>
                <input class="form-control form-control-sm" id="det-notes" type="text" value="${session.notes ?? ''}">
              </div>
            </div>
            <div class="d-flex gap-2 mb-3">
              <button class="btn btn-primary btn-sm" id="det-save">Save</button>
              <button class="btn btn-danger btn-sm"  id="det-delete">Delete Session</button>
            </div>

            <!-- Runs -->
            <div class="border-top pt-3 mb-2">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h3 class="h6 mb-0">Runs (${runs.length})</h3>
                <button class="btn btn-primary btn-sm" id="btn-add-run">+ Add Run</button>
              </div>
              <div id="det-runs-list" class="grid-wide mb-2">
                ${runs.length
                  ? runs.map(r => renderRunRow(r)).join('')
                  : '<p class="text-muted small">No runs yet.</p>'}
              </div>
              <div id="det-run-form-wrap"></div>
            </div>

            <!-- Session-level observations -->
            <div class="border-top pt-3">
              <h3 class="h6 mb-3">Session Observations (${undismissed.length} open${dismissed.length ? ', ' + dismissed.length + ' dismissed' : ''})</h3>
              <div class="card card-body mb-3 d-flex flex-row gap-2 align-items-center flex-wrap">
                <select class="form-select form-select-sm flex-shrink-0" id="det-obs-type" style="width:auto">
                  <option value="note">Note</option>
                  <option value="discovery">Discovery</option>
                  <option value="issue">Issue</option>
                  <option value="question">Question</option>
                </select>
                <select class="form-select form-select-sm flex-shrink-0" id="det-obs-outcome" style="width:auto">
                  <option value="">outcome…</option>
                  <option value="positive">positive</option>
                  <option value="negative">negative</option>
                  <option value="neutral">neutral</option>
                  <option value="unexpected">unexpected</option>
                </select>
                <select class="form-select form-select-sm flex-shrink-0" id="det-obs-setting" style="min-width:160px">
                  <option value="">— no setting —</option>
                  ${cachedRunSettings.map(s => `<option value="${s.id}">${s.material} / ${s.operation} (P:${s.power ?? '?'} S:${s.speed ?? '?'})</option>`).join('')}
                </select>
                <input class="form-control form-control-sm flex-grow-1" id="det-obs-input"
                  style="min-width:180px" placeholder="Add a session-level observation…">
                <button class="btn btn-primary btn-sm flex-shrink-0" id="det-add-obs">Add</button>
                <span id="det-obs-feedback" class="small w-100 min-h-feedback"></span>
              </div>
              <div id="review-obs-list">
                ${undismissed.length
                  ? undismissed.map(o => renderObsRow(o, true)).join('')
                  : '<p class="text-muted small">No open observations.</p>'}
              </div>
              ${dismissed.length ? `
                <details class="mt-2">
                  <summary class="text-muted small" style="cursor:pointer">Show ${dismissed.length} dismissed</summary>
                  <div class="mt-2 opacity-75">
                    ${dismissed.map(o => renderObsRow(o, false)).join('')}
                  </div>
                </details>` : ''}
            </div>
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
          job_date:     document.getElementById('det-date').value           || null,
          user_id:     +document.getElementById('det-user').value           || null,
          project_id:  +document.getElementById('det-project').value        || null,
          duration_min:+document.getElementById('det-duration').value       || null,
          notes:        document.getElementById('det-notes').value.trim()   || null,
        };
        try {
          await apiFetch(`/api/usage/${sessionId}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
          });
          window.showToast('Saved.', 'success');
          await loadSessions();
        } catch (e) {
          window.showToast(e.message, 'error');
        }
      };

      document.getElementById('det-delete').onclick = async () => {
        if (!confirm(`Delete session ${session.job_date}? This cannot be undone.`)) return;
        try {
          await apiFetch(`/api/usage/${sessionId}`, { method: 'DELETE' });
          detailWrap.innerHTML = '';
          currentDetailSessionId = null;
          await loadSessions();
        } catch (e) { window.showToast(e.message); }
      };

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
          input.classList.add('is-invalid');
          fb.textContent = 'Enter something first.';
          fb.className = 'small w-100 min-h-feedback text-danger';
          setTimeout(() => { input.classList.remove('is-invalid'); fb.textContent = ''; }, 2500);
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
          fb.textContent = '✓ Added';
          fb.className = 'small w-100 min-h-feedback text-success';
          setTimeout(() => { fb.textContent = ''; }, 2000);
          const updated   = await apiFetch(`/api/observations?session_id=${sessionId}`);
          const fresh_u   = updated.filter(o => !o.dismissed_at && !o.run_id);
          document.getElementById('review-obs-list').innerHTML = fresh_u.length
            ? fresh_u.map(o => renderObsRow(o, true)).join('')
            : '<p class="text-muted small">No open observations.</p>';
        } catch (e) {
          fb.textContent = 'Error: ' + e.message;
          fb.className = 'small w-100 min-h-feedback text-danger';
        } finally { btn.disabled = false; }
      }
      document.getElementById('det-add-obs').onclick = submitDetObs;
      document.getElementById('det-obs-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') submitDetObs();
      });

    } catch (e) {
      detailWrap.innerHTML = `<div class="alert alert-danger mt-3" role="alert">${e.message}</div>`;
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
      } catch (e) { window.showToast(e.message); }
    };
  }

  function renderObsRow(o, showActions = true) {
    return `
      <div id="rev-obs-${o.id}" class="d-flex justify-content-between align-items-start py-2 border-bottom gap-2">
        <div>
          <span class="${TYPE_CLASS[o.type] ?? 'text-muted'} small text-uppercase fw-semibold">${o.type}</span>
          ${outcomeBadge(o.outcome)}
          ${fmtLinkedSetting(o.setting_id)}
          <span class="ms-2 small">${o.content}</span>
          ${o.promoted_to ? `<span class="ms-2 small text-success">→ ${o.promoted_to.replace('_',' ')}</span>` : ''}
        </div>
        ${showActions ? `
          <div class="obs-actions d-flex gap-2 flex-shrink-0 align-items-center flex-wrap">
            <button class="btn btn-secondary btn-sm rev-promote-note" data-id="${o.id}">→ Note</button>
            <button class="btn btn-secondary btn-sm rev-dismiss" data-id="${o.id}">Dismiss</button>
          </div>` : ''}
      </div>`;
  }

  // ── Delegated click handler for detail panel ──────────────────────
  detailWrap.addEventListener('click', async e => {
    const sessionId = currentDetailSessionId;

    if (e.target.classList.contains('run-toggle-obs')) {
      const runId  = e.target.dataset.runId;
      const obsDiv = document.getElementById(`run-obs-${runId}`);
      if (!obsDiv) return;
      if (obsDiv.classList.contains('d-none')) {
        const runObs = await apiFetch(`/api/observations?run_id=${runId}`);
        obsDiv.innerHTML = renderRunObsSection(runObs, runId);
        obsDiv.classList.remove('d-none');
        e.target.textContent = 'Obs ▴';
      } else {
        obsDiv.classList.add('d-none');
        e.target.textContent = 'Obs ▾';
      }
      return;
    }

    if (e.target.classList.contains('run-edit-btn')) {
      const runId = e.target.dataset.runId;
      try {
        const run = await apiFetch(`/api/runs/${runId}`);
        document.getElementById('det-run-form-wrap').innerHTML = buildRunForm(sessionId, run);
        wireRunForm(sessionId, run);
        document.getElementById('det-run-form-wrap').scrollIntoView({ behavior: 'smooth' });
      } catch (err) { window.showToast(err.message); }
      return;
    }

    if (e.target.classList.contains('run-del-btn')) {
      const runId = e.target.dataset.runId;
      if (!confirm('Delete this run and its observations?')) return;
      try {
        await apiFetch(`/api/runs/${runId}`, { method: 'DELETE' });
        await showSessionDetail(sessionId);
      } catch (err) { window.showToast(err.message); }
      return;
    }

    if (e.target.classList.contains('run-add-setting')) {
      const runId  = e.target.dataset.runId;
      const formDiv = document.getElementById(`run-setting-form-${runId}`);
      if (!formDiv) return;
      if (formDiv.innerHTML) { formDiv.innerHTML = ''; return; }
      formDiv.innerHTML = buildRunSettingForm(runId);
      return;
    }

    if (e.target.classList.contains('run-setting-edit')) {
      const runId  = e.target.dataset.runId;
      const sid    = e.target.dataset.sid;
      const formDiv = document.getElementById(`run-setting-form-${runId}`);
      if (!formDiv) return;
      try {
        const run      = await apiFetch(`/api/runs/${runId}`);
        const existing = run.settings.find(s => String(s.id) === String(sid));
        if (!existing) { window.showToast('Setting not found'); return; }
        formDiv.innerHTML = buildRunSettingForm(runId, existing);
        formDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) { window.showToast(err.message); }
      return;
    }

    if (e.target.classList.contains('rss-save')) {
      const runId  = e.target.dataset.runId;
      const mode   = e.target.dataset.mode;
      const sid    = e.target.dataset.sid;
      const q      = sel => detailWrap.querySelector(`${sel}[data-run-id="${runId}"]`);
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
        const url    = mode === 'edit' ? `/api/runs/${runId}/settings/${sid}` : `/api/runs/${runId}/settings`;
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
            : '<span class="text-muted small">No settings yet.</span>';
        }
        const formDiv = document.getElementById(`run-setting-form-${runId}`);
        if (formDiv) formDiv.innerHTML = '';
      } catch (err) {
        window.showToast(err.message);
        btn.disabled = false; btn.textContent = mode === 'edit' ? 'Save' : 'Add';
      }
      return;
    }

    if (e.target.classList.contains('rss-cancel')) {
      const runId   = e.target.dataset.runId;
      const formDiv = document.getElementById(`run-setting-form-${runId}`);
      if (formDiv) formDiv.innerHTML = '';
      return;
    }

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
            : '<span class="text-muted small">No settings yet.</span>';
        }
      } catch (err) { window.showToast(err.message); }
      return;
    }

    if (e.target.classList.contains('run-obs-add')) {
      const runId  = e.target.dataset.runId;
      const input  = detailWrap.querySelector(`.run-obs-input[data-run-id="${runId}"]`);
      const type   = detailWrap.querySelector(`.run-obs-type[data-run-id="${runId}"]`)?.value;
      const outcome = detailWrap.querySelector(`.run-obs-outcome[data-run-id="${runId}"]`)?.value || null;
      const content = input?.value.trim();
      if (!content) {
        if (input) { input.classList.add('is-invalid'); setTimeout(() => input.classList.remove('is-invalid'), 2000); }
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
      } catch (err) { window.showToast(err.message); }
      return;
    }

    if (e.target.classList.contains('run-obs-dismiss')) {
      const id    = e.target.dataset.id;
      const runId = e.target.dataset.runId;
      try {
        await apiFetch(`/api/observations/${id}/dismiss`, { method: 'PUT' });
        const updated = await apiFetch(`/api/observations?run_id=${runId}`);
        const obsDiv  = document.getElementById(`run-obs-${runId}`);
        if (obsDiv) obsDiv.innerHTML = renderRunObsSection(updated, runId);
      } catch (err) { window.showToast(err.message); }
      return;
    }

    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains('rev-dismiss')) {
      try {
        await apiFetch(`/api/observations/${id}/dismiss`, { method: 'PUT' });
        await showSessionDetail(sessionId);
      } catch (err) { window.showToast(err.message); }

    } else if (e.target.classList.contains('rev-promote-note')) {
      const row        = document.getElementById(`rev-obs-${id}`);
      if (!row) return;
      const actionsDiv = row.querySelector('.obs-actions');
      if (!actionsDiv) return;
      actionsDiv.innerHTML = `
        <input id="promote-topic-${id}" type="text"
          class="form-control form-control-sm" style="width:220px"
          placeholder="Topic (e.g. Glass engraving)">
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
        if (inp) { inp.classList.add('is-invalid'); inp.focus(); }
        return;
      }
      try {
        await apiFetch(`/api/observations/${id}/promote/note`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ topic }),
        });
        await showSessionDetail(sessionId);
      } catch (err) { window.showToast(err.message); }
    }
  });

  // ── Session table ─────────────────────────────────────────────────
  async function loadSessions() {
    const params    = new URLSearchParams();
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

      stats.innerHTML = [
        { val: counts.planned,    lbl: 'Planned' },
        { val: counts.in_progress, lbl: 'In Progress' },
        { val: counts.completed,  lbl: 'Completed' },
        { val: counts.aborted,    lbl: 'Aborted' },
        { val: rate + '%',        lbl: 'Success Rate' },
      ].map(s => `
        <div class="col">
          <div class="card text-center py-3">
            <div class="h3 fw-bold mb-0">${s.val}</div>
            <div class="small text-muted mt-1">${s.lbl}</div>
          </div>
        </div>`).join('');

      tbody.innerHTML = rows.map(r => `
        <tr data-id="${r.id}">
          <td>${r.job_date}</td>
          <td>${r.project_name_resolved ?? '—'}</td>
          <td class="text-center">${r.run_count ?? 0}</td>
          <td>${r.duration_min != null ? r.duration_min + ' min' : '—'}</td>
          <td class="${OUTCOME_CLASS[r.outcome] ?? ''}">${r.outcome ?? '—'}</td>
          <td><span class="badge ${STATUS_BS[r.status] ?? 'bg-secondary'}">${STATUS_LABEL[r.status] ?? r.status}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm view-session" data-id="${r.id}">Edit</button>
            <button class="btn btn-danger btn-sm del-session" data-id="${r.id}">Del</button>
          </td>
        </tr>`).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-danger">${e.message}</td></tr>`;
    }
  }

  tbody.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('del-session')) {
      if (!confirm('Delete this session?')) return;
      try { await apiFetch(`/api/usage/${id}`, { method: 'DELETE' }); await refresh(); }
      catch (err) { window.showToast(err.message); }
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
    } catch (e) { window.showToast(e.message); }
  };

  document.getElementById('btn-filter-sessions').onclick = loadSessions;

  async function refresh() {
    const active = await apiFetch('/api/usage?status=in_progress');
    const currentSession = active[0] ?? null;
    document.getElementById('start-session-wrap').classList.toggle('d-none', !!currentSession);
    await renderActiveSession(currentSession);
    await loadSessions();
  }

  try { await populateDropdowns(); } catch (e) { window.showToast('Could not load dropdowns: ' + e.message); }
  await refresh();
};
