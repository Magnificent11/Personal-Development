// 1. Dynamic API Base URL logic for switching between environments
const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:5000" 
    : "https://habit-tracker-9v4p.onrender.com";
const API_URL = API_BASE_URL;

let accessToken = null;
let refreshToken = null;

window.onload = function() {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
    if (accessToken) {
        window.location.href = 'dashboard-v2.html';
        return;
    }

    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');

    // Only auto-focus on the dedicated login page — on the homepage the
    // card sits further down next to the hero, so jumping focus there
    // would yank the page away from the hero on load.
    if (loginUsername && document.body.classList.contains('auth-page')) {
        loginUsername.focus();
    }

    // Land on the right tab when arriving via a link like
    // login.html?tab=register (used by the homepage's nav/CTA buttons).
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab === 'login' || requestedTab === 'register') {
        switchTab(requestedTab);
        if (requestedTab === 'login' && loginUsername) loginUsername.focus();
    }

    function updateLoginBtn() {
        const btn = document.getElementById('loginBtn');
        if (btn && loginUsername && loginPassword) {
            btn.disabled = !loginUsername.value.trim() || !loginPassword.value.trim();
        }
    }
    if (loginUsername) loginUsername.addEventListener('input', updateLoginBtn);
    if (loginPassword) loginPassword.addEventListener('input', updateLoginBtn);

    // Caps Lock detection on all password fields (Production Hardened against browser autofills)
    document.querySelectorAll('input[type="password"]').forEach(input => {
        input.addEventListener('keyup', function(e) {
            const warning = document.getElementById(
                this.id === 'loginPassword' ? 'loginCapsWarning' : 'registerCapsWarning'
            );
            if (warning) {
                if (typeof e.getModifierState === 'function') {
                    warning.classList.toggle('visible', e.getModifierState('CapsLock'));
                } else {
                    warning.classList.remove('visible');
                }
            }
        });
    });

    // Draw the "How it works" connecting line in once it scrolls into view,
    // instead of having it sit there fully drawn from the start.
    const stepsPath = document.querySelector('.steps-path');
    if (stepsPath && 'IntersectionObserver' in window) {
        const stepsObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    stepsPath.classList.add('in-view');
                    stepsObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });
        stepsObserver.observe(stepsPath);
    }
};

// Password visibility toggle
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input || !btn) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    btn.innerHTML = isHidden
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

// tab: 'login' | 'register'. el: the clicked tab element (optional — falls
// back to looking up by data-tab so this can also be called programmatically).
function switchTab(tab, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const target = el || document.querySelector(`.tab[data-tab="${tab}"]`);
    if (target) target.classList.add('active');

    const indicator = document.querySelector('.tab-indicator');
    if (indicator) indicator.classList.toggle('right', tab === 'register');

    document.querySelectorAll('.form-container').forEach(f => f.classList.remove('active'));
    const targetedForm = document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm');
    if (targetedForm) targetedForm.classList.add('active');

    hideMessage();
    clearFieldErrors();
}

function showMessage(message, type) {
    const el = document.getElementById('message');
    if (el) {
        el.textContent = message;
        el.className = `message ${type}`;
    }
}

function hideMessage() {
    const el = document.getElementById('message');
    if (el) el.className = 'message';
}

function showFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const error = document.getElementById(fieldId + 'Error');
    if (input) input.classList.add('invalid');
    if (error) { error.textContent = message; error.classList.add('visible'); }
}

function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(el => {
        el.textContent = '';
        el.classList.remove('visible');
    });
    document.querySelectorAll('input.invalid').forEach(el => el.classList.remove('invalid'));
}

function setLoading(btn, isLoading, label) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle('loading', isLoading);
    const textEl = btn.querySelector('.btn-text');
    if (textEl) textEl.textContent = label;
}

async function handleRegister(event) {
    event.preventDefault();
    clearFieldErrors();

    const btn = document.getElementById('registerBtn');
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const firstName = document.getElementById('registerFirstName').value.trim();
    const lastName = document.getElementById('registerLastName').value.trim();

    let hasError = false;
    if (username.length < 3) {
        showFieldError('registerUsername', 'Must be at least 3 characters');
        hasError = true;
    }
    if (password.length < 6) {
        showFieldError('registerPassword', 'Must be at least 6 characters');
        hasError = true;
    }
    if (hasError) return;

    setLoading(btn, true, 'Creating account...');

    try {
        const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, firstName, lastName }),
        });

        const registerData = await registerResponse.json();

        if (!registerResponse.ok) {
            if (registerData.error?.toLowerCase().includes('username')) {
                showFieldError('registerUsername', registerData.error);
            } else {
                showMessage(registerData.error || 'Registration failed', 'error');
            }
            return;
        }

        setLoading(btn, true, 'Signing in...');

        const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const loginData = await loginResponse.json();

        if (loginResponse.ok) {
            localStorage.setItem('accessToken', loginData.accessToken);
            localStorage.setItem('refreshToken', loginData.refreshToken);
            localStorage.setItem('user', JSON.stringify(loginData.user));
            showMessage('Account created! Redirecting...', 'success');
            setTimeout(() => { window.location.href = 'dashboard-v2.html'; }, 500);
        } else {
            showMessage('Account created! Please sign in.', 'success');
            setTimeout(() => {
                switchTab('login');
                const userInp = document.getElementById('loginUsername');
                const logBtn = document.getElementById('loginBtn');
                if (userInp) userInp.value = username;
                if (logBtn) logBtn.disabled = false;
            }, 1500);
        }
    } catch (error) {
        showMessage('Network error. Please try again.', 'error');
    } finally {
        setLoading(btn, false, 'Start Becoming Consistent');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    clearFieldErrors();

    const btn = document.getElementById('loginBtn');
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    setLoading(btn, true, 'Signing in...');

    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            accessToken = data.accessToken;
            refreshToken = data.refreshToken;
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('user', JSON.stringify(data.user));
            showMessage('Welcome back!', 'success');
            setTimeout(() => { window.location.href = 'dashboard-v2.html'; }, 500);
        } else {
            if (response.status === 429) {
                showMessage('Too many attempts. Please try again in a moment.', 'error');
            } else if (data.error?.toLowerCase().includes('password')) {
                showFieldError('loginPassword', 'Incorrect password');
            } else if (data.error?.toLowerCase().includes('user')) {
                showFieldError('loginUsername', 'Username not found');
            } else {
                showMessage(data.error || 'Login failed', 'error');
            }
        }
    } catch (error) {
        showMessage('Network error. Please try again.', 'error');
    } finally {
        setLoading(btn, false, 'Login');

        const u = document.getElementById('loginUsername');
        const p = document.getElementById('loginPassword');
        if (u && p && btn) {
            btn.disabled = !u.value.trim() || !p.value.trim();
        }
    }
}