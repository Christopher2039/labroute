/**
 * LabRoute — Admin authentication and the community moments inbox.
 *
 * The server issues a signed, HttpOnly admin cookie on successful login. The
 * original browser-only check is kept as a fallback for purely static
 * deployments, where the /api endpoints do not exist.
 */

// 1. Password visibility toggle
const togglePasswordBtn = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');
const toggleIcon = document.getElementById('toggleIcon');

if (togglePasswordBtn && passwordInput && toggleIcon) {
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleIcon.textContent = isPassword ? 'visibility_off' : 'visibility';
  });
}

// 2. Hash encoder (Web Crypto API SHA-256)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// 3. Login
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const message = document.getElementById('message');

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = 'Verifying...';
    }
    hideMessage();

    const serverResult = await loginWithServer(email, password);

    if (serverResult.unavailable) {
      const fallback = await loginWithBrowserData(email, password);

      if (fallback.ok) {
        completeLogin(fallback.email);
      } else {
        showMessage(fallback.message, 'error');
        resetLoginBtn();
      }
      return;
    }

    if (serverResult.ok) {
      completeLogin(serverResult.email);
    } else {
      showMessage(serverResult.message, 'error');
      resetLoginBtn();
    }
  });
}

async function loginWithServer(email, password) {
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { unavailable: true };
    }

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.ok) {
      return { ok: true, email: data.email || email };
    }

    if (response.status === 404 || response.status === 405 || response.status === 501) {
      return { unavailable: true };
    }

    return {
      ok: false,
      message: data.message || 'Incorrect institutional email or security key.'
    };
  } catch {
    return { unavailable: true };
  }
}

async function loginWithBrowserData(email, password) {
  try {
    const response = await fetch('../data/admins.json');

    if (!response.ok) {
      throw new Error('Could not load the admin database.');
    }

    const data = await response.json();
    const enteredPasswordHash = await hashPassword(password);

    const admin = data.admins.find(
      (candidate) =>
        candidate.email === email && candidate.passwordCrypt === enteredPasswordHash
    );

    if (!admin) {
      return {
        ok: false,
        message: 'Incorrect institutional email or security key.'
      };
    }

    return { ok: true, email: admin.email };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      message: 'Unable to authenticate. Check the server data path.'
    };
  }
}

function completeLogin(email) {
  sessionStorage.setItem('isAdmin', 'true');
  sessionStorage.setItem('adminEmail', email);
  showMessage('Authentication verified. Redirecting...', 'success');

  window.setTimeout(() => {
    window.location.href = 'dashboard.html';
  }, 700);
}

function resetLoginBtn() {
  if (loginBtn) {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Authenticate';
  }
}

function showMessage(text, type) {
  if (!message) return;
  message.textContent = text;
  message.className = `auth-alert ${type}`;
}

function hideMessage() {
  if (!message) return;
  message.className = 'auth-alert hidden';
}

// 4. Protect the dashboard and verify the server session
const dashboard = document.getElementById('dashboard');

if (dashboard) {
  guardDashboard();
}

async function guardDashboard() {
  const localSession = sessionStorage.getItem('isAdmin') === 'true';
  const server = await getServerSession();

  if (server.available && server.authenticated) {
    sessionStorage.setItem('isAdmin', 'true');
    if (server.email) sessionStorage.setItem('adminEmail', server.email);
    updateAdminEmailDisplay();
    loadMomentsInbox();
    return;
  }

  if (server.available && server.authenticated === false) {
    sessionStorage.removeItem('isAdmin');
    sessionStorage.removeItem('adminEmail');
    window.location.href = 'login.html';
    return;
  }

  // Static deployment: the API is unavailable, so keep the browser check.
  if (!localSession) {
    window.location.href = 'login.html';
    return;
  }

  updateAdminEmailDisplay();
  loadMomentsInbox();
}

async function getServerSession() {
  try {
    const response = await fetch('/api/admin/session', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      return { available: false };
    }

    const data = await response.json();
    return {
      available: true,
      authenticated: Boolean(data.authenticated),
      email: data.email || null
    };
  } catch {
    return { available: false };
  }
}

// 5. Display the signed-in admin's email
function updateAdminEmailDisplay() {
  const adminEmailElement = document.getElementById('adminEmail');
  if (!adminEmailElement) return;

  const adminEmail = sessionStorage.getItem('adminEmail');
  if (adminEmail) adminEmailElement.textContent = adminEmail;
}

// 6. Community moments inbox
async function loadMomentsInbox() {
  const container = document.getElementById('momentsInbox');
  const countElement = document.getElementById('momentsInboxCount');
  if (!container) return;

  try {
    const response = await fetch('/api/admin/moments?limit=8', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (response.status === 401) {
      sessionStorage.removeItem('isAdmin');
      sessionStorage.removeItem('adminEmail');
      window.location.href = 'login.html';
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error('The moments service is not available.');
    }

    const data = await response.json();
    renderMomentsInbox(container, countElement, data.moments || [], data.total || 0);
  } catch (error) {
    if (countElement) countElement.textContent = '—';
    container.innerHTML = `
      <div class="moments-inbox-state is-error">
        <span class="material-symbols-outlined">cloud_off</span>
        <p>Live moments need the LabRoute upload service. Start it with <code>npm start</code> to see visitor uploads here.</p>
      </div>`;
  }
}

function renderMomentsInbox(container, countElement, moments, total) {
  if (countElement) countElement.textContent = String(total);

  if (!moments.length) {
    container.innerHTML = `
      <div class="moments-inbox-state">
        <span class="material-symbols-outlined">photo_camera_back</span>
        <p>No community uploads yet. The first photo shared from the gallery will appear here.</p>
        <a href="upload.html" target="_blank" rel="noopener">Open the upload page</a>
      </div>`;
    return;
  }

  container.innerHTML = moments
    .map((moment, index) => {
      const image = safeImageSource(moment.image);
      const caption = escapeHtml(moment.caption || 'Untitled lab moment');
      const contributor = escapeHtml(moment.contributor || 'Anonymous contributor');
      const date = formatDate(moment.uploadedAt);
      const notification = moment.notification;
      const notificationLabel = notificationStatusLabel(notification);
      const emailLine = moment.uploaderEmail
        ? `<p class="moments-meta moments-email">${escapeHtml(moment.uploaderEmail)}</p>`
        : '';

      return `
        <article class="moments-card">
          <img src="${escapeHtml(image)}" alt="${caption}" loading="lazy" />
          <div class="moments-card-body">
            <div class="moments-card-top">
              <span class="moments-position">Image ${index + 1}</span>
              <span class="moments-notify ${notificationStatusClass(notification)}">${notificationLabel}</span>
            </div>
            <h3 class="moments-caption">${caption}</h3>
            <p class="moments-meta">${contributor}${date ? ` · ${date}` : ''}</p>
            ${emailLine}
          </div>
        </article>`;
    })
    .join('');
}

function notificationStatusClass(notification) {
  if (!notification) return 'unknown';
  if (notification.status === 'sent') return 'sent';
  if (notification.status === 'failed') return 'failed';
  return 'skipped';
}

function notificationStatusLabel(notification) {
  if (!notification) return 'No alert';
  if (notification.status === 'sent') return 'Email sent';
  if (notification.status === 'failed') return 'Email failed';
  if (notification.status === 'skipped') return 'Email logged';
  return 'No alert';
}

function safeImageSource(value) {
  const source = String(value || '');
  if (/^assets\/[A-Za-z0-9/._-]+$/.test(source)) return source;
  if (/^https:\/\//.test(source)) return source;
  return 'assets/other_images/labroute_favicon.png';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

// 7. Logout
const logoutButton = document.getElementById('logoutButton');

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    fetch('/api/admin/logout', {
      method: 'POST',
      headers: { Accept: 'application/json' }
    }).catch(() => {});

    sessionStorage.removeItem('isAdmin');
    sessionStorage.removeItem('adminEmail');
    window.location.href = 'login.html';
  });
}
