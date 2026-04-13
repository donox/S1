window.usageInit = async function () {
  const tbody  = document.getElementById('usage-body');
  const stats  = document.getElementById('usage-stats');
  const banner = document.getElementById('usage-banner');

  // Set today's date as default
  document.getElementById('u-date').value = new Date().toISOString().slice(0, 10);

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function showBanner(msg, type = 'error') {
    banner.innerHTML = `<div class="banner banner-${type}">${msg}</div>`;
    setTimeout(() => { banner.innerHTML = ''; }, 4000);
  }

  // Populate setting dropdown
  const settings = await apiFetch('/api/settings');
  const uSetting = document.getElementById('u-setting');
  settings.forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${s.material} / ${s.operation} / ${s.power}% / ${s.speed}mm`;
    uSetting.appendChild(o);
  });

  async function loadData() {
    const rows = await apiFetch('/api/usage');

    // Stats
    const total = rows.length;
    const matCounts = {};
    let successes = 0;
    rows.forEach(r => {
      if (r.material) matCounts[r.material] = (matCounts[r.material] || 0) + 1;
      if (r.outcome === 'success') successes++;
    });
    const topMat = Object.entries(matCounts).sort((a,b) => b[1]-a[1])[0];
    const rate   = total ? Math.round(successes / total * 100) : 0;
    stats.innerHTML = `
      <div class="stat-box"><div class="stat-val">${total}</div><div class="stat-lbl">Total Sessions</div></div>
      <div class="stat-box"><div class="stat-val">${topMat?.[0] ?? '—'}</div><div class="stat-lbl">Top Material</div></div>
      <div class="stat-box"><div class="stat-val">${rate}%</div><div class="stat-lbl">Success Rate</div></div>`;

    // Table
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.job_date}</td>
        <td>${r.material ?? '—'}</td>
        <td>${r.operation ? `<span class="badge">${r.operation}</span>` : '—'}</td>
        <td>${r.project_name ?? '—'}</td>
        <td>${r.duration_min != null ? r.duration_min + ' min' : '—'}</td>
        <td>${r.outcome ?? '—'}</td>
        <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.notes ?? ''}</td>
        <td><button class="btn btn-danger btn-sm del-btn" data-id="${r.id}">Del</button></td>
      </tr>`).join('');
  }

  document.getElementById('u-save').onclick = async () => {
    const payload = {
      job_date:     document.getElementById('u-date').value,
      material:     document.getElementById('u-material').value.trim() || null,
      operation:    document.getElementById('u-operation').value || null,
      project_name: document.getElementById('u-project').value.trim() || null,
      duration_min: +document.getElementById('u-duration').value || null,
      file_used:    document.getElementById('u-file').value.trim() || null,
      setting_id:   +uSetting.value || null,
      outcome:      document.getElementById('u-outcome').value || null,
      notes:        document.getElementById('u-notes').value.trim() || null,
    };
    try {
      await apiFetch('/api/usage', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      showBanner('Session logged.', 'success');
      await loadData();
    } catch (e) { showBanner(e.message); }
  };

  tbody.addEventListener('click', async e => {
    if (!e.target.classList.contains('del-btn')) return;
    if (!confirm('Delete this log entry?')) return;
    try {
      await apiFetch(`/api/usage/${e.target.dataset.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) { showBanner(err.message); }
  });

  await loadData();
};
