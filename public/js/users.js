window.usersInit = async function () {
  const banner = document.getElementById('users-banner');
  const list   = document.getElementById('users-list');

  async function apiFetch(url, opts) {
    const r = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function showBanner(msg, type = 'error') {
    banner.innerHTML = `<div class="banner banner-${type}">${msg}</div>`;
    if (type !== 'error') setTimeout(() => { banner.innerHTML = ''; }, 4000);
  }

  function renderUsers(users) {
    if (!users.length) {
      list.innerHTML = '<p style="color:var(--text-muted)">No users yet. Add one to get started.</p>';
      return;
    }
    list.innerHTML = users.map(u => `
      <div class="card" data-id="${u.id}" style="margin-bottom:10px"
           data-projects="${u.project_count}" data-sessions="${u.session_count}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <strong id="user-name-${u.id}">${u.name}</strong>
              ${u.is_default ? '<span class="badge" style="color:var(--success);border:1px solid var(--success)">default</span>' : ''}
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">
              ${u.project_count} project${u.project_count !== 1 ? 's' : ''}
              &nbsp;·&nbsp;
              ${u.session_count} session${u.session_count !== 1 ? 's' : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap" id="user-actions-${u.id}">
            ${!u.is_default ? `<button class="btn btn-secondary btn-sm set-default-user" data-id="${u.id}">Set default</button>` : ''}
            <button class="btn btn-secondary btn-sm rename-user" data-id="${u.id}">Rename</button>
            <button class="btn btn-danger    btn-sm delete-user" data-id="${u.id}">Delete</button>
          </div>
        </div>
      </div>`).join('');
  }

  async function loadUsers() {
    try {
      renderUsers(await apiFetch('/api/users'));
    } catch (e) {
      list.innerHTML = `<div class="banner banner-error">${e.message}</div>`;
    }
  }

  // ── Add user ──────────────────────────────────────────────────────
  document.getElementById('btn-add-user').onclick = async () => {
    const input     = document.getElementById('nu-name');
    const name      = input.value.trim();
    const isDefault = document.getElementById('nu-default').checked;
    if (!name) {
      input.style.borderColor = 'var(--accent)'; input.focus();
      setTimeout(() => { input.style.borderColor = ''; }, 2500);
      return;
    }
    const btn = document.getElementById('btn-add-user');
    btn.disabled = true;
    try {
      await apiFetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, is_default: isDefault ? 1 : 0 }),
      });
      input.value = '';
      document.getElementById('nu-default').checked = false;
      showBanner('User added.', 'success');
      await loadUsers();
    } catch (e) { showBanner(e.message); }
    finally { btn.disabled = false; }
  };

  document.getElementById('nu-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-add-user').click();
  });

  // ── Delegated actions ─────────────────────────────────────────────
  list.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    if (!id) return;

    // Set default
    if (e.target.classList.contains('set-default-user')) {
      try {
        await apiFetch(`/api/users/${id}/set-default`, { method: 'PUT' });
        await loadUsers();
      } catch (err) { showBanner(err.message); }
    }

    // Rename — inline form
    if (e.target.classList.contains('rename-user')) {
      const nameEl     = document.getElementById(`user-name-${id}`);
      const actionsDiv = document.getElementById(`user-actions-${id}`);
      const current    = nameEl.textContent.trim();
      actionsDiv.innerHTML = `
        <input id="rename-input-${id}" type="text" value="${current}"
          style="font-size:0.9rem;padding:4px 8px;border:1px solid var(--border);
                 background:var(--surface2);color:var(--text);border-radius:4px;min-width:160px">
        <button class="btn btn-primary   btn-sm rename-save"   data-id="${id}">Save</button>
        <button class="btn btn-secondary btn-sm rename-cancel" data-id="${id}">✕</button>`;
      const inp = document.getElementById(`rename-input-${id}`);
      inp?.focus();
      inp?.addEventListener('keydown', ev => {
        if (ev.key === 'Enter')  { ev.preventDefault(); document.querySelector(`.rename-save[data-id="${id}"]`)?.click(); }
        if (ev.key === 'Escape') { document.querySelector(`.rename-cancel[data-id="${id}"]`)?.click(); }
      });
    }

    if (e.target.classList.contains('rename-save')) {
      const newName = document.getElementById(`rename-input-${id}`)?.value.trim();
      if (!newName) return;
      try {
        await apiFetch(`/api/users/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
        await loadUsers();
      } catch (err) { showBanner(err.message); }
    }

    if (e.target.classList.contains('rename-cancel')) {
      await loadUsers();
    }

    // Delete — always show inline confirm; warn if they own data
    if (e.target.classList.contains('delete-user')) {
      const card   = e.target.closest('[data-id]');
      const projN  = parseInt(card?.dataset.projects ?? '0', 10);
      const sessN  = parseInt(card?.dataset.sessions  ?? '0', 10);
      const actionsDiv = document.getElementById(`user-actions-${id}`);
      const warning = (projN > 0 || sessN > 0)
        ? `<span style="font-size:0.8rem;color:var(--accent2)">Owns ${projN} project(s) &amp; ${sessN} session(s) — ownership will be removed.</span>`
        : `<span style="font-size:0.8rem;color:var(--text-muted)">Delete this user?</span>`;
      actionsDiv.innerHTML = `
        ${warning}
        <button class="btn btn-danger    btn-sm force-delete-user"  data-id="${id}">Confirm delete</button>
        <button class="btn btn-secondary btn-sm cancel-delete-user" data-id="${id}">Cancel</button>`;
    }

    if (e.target.classList.contains('force-delete-user')) {
      try {
        await apiFetch(`/api/users/${id}?force=1`, { method: 'DELETE' });
        showBanner('User deleted.', 'success');
        await loadUsers();
      } catch (err) { showBanner(err.message); }
    }

    if (e.target.classList.contains('cancel-delete-user')) {
      await loadUsers();
    }
  });

  await loadUsers();
};
