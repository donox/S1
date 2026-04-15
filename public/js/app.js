const PAGES = {
  home:      { partial: '/pages/home.html',       module: '/js/home.js'      },
  projects:  { partial: '/pages/projects.html',   module: '/js/projects.js'  },
  sessions:  { partial: '/pages/sessions.html',   module: '/js/sessions.js'  },
  settings:  { partial: '/pages/settings.html',   module: '/js/settings.js'  },
  docs:      { partial: '/pages/docs.html',        module: '/js/docs.js'      },
  notes:     { partial: '/pages/notes.html',       module: '/js/notes.js'     },
  files:     { partial: '/pages/files.html',       module: '/js/files.js'     },
  users:     { partial: '/pages/users.html',       module: '/js/users.js'     },
  reference: { partial: '/pages/reference.html',   module: null               },
};

const content = document.getElementById('content');
const loadedModules = {};

function pageFromPath(pathname) {
  const part = pathname.replace(/^\//, '') || 'home';
  return PAGES[part] ? part : 'home';
}

async function navigate(page, push = true) {
  document.querySelectorAll('#sidebar a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  content.innerHTML = '<p class="loading">Loading…</p>';
  if (push) history.pushState({ page }, '', `/${page}`);

  try {
    const html = await fetch(PAGES[page].partial).then(r => r.text());
    content.innerHTML = html;

    const modPath = PAGES[page].module;
    if (modPath) {
      if (!loadedModules[page]) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = modPath;
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
        loadedModules[page] = true;
      }
      if (window[`${page}Init`]) window[`${page}Init`](content);
    }
  } catch (e) {
    content.innerHTML = `<div class="banner banner-error">Failed to load page: ${e.message}</div>`;
  }
}

// Intercept sidebar clicks
document.getElementById('sidebar').addEventListener('click', e => {
  const a = e.target.closest('a[data-page]');
  if (!a) return;
  e.preventDefault();
  navigate(a.dataset.page);
});

// Browser back/forward
window.addEventListener('popstate', e => {
  navigate(e.state?.page || pageFromPath(location.pathname), false);
});

// Initial load
navigate(pageFromPath(location.pathname), false);
