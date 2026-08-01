// 1. Dynamic API Base URL logic for switching between environments
const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:5000"
    : "https://habit-tracker-9v4p.onrender.com";
const API_URL = API_BASE_URL;

let accessToken = null;
let refreshToken = null;

// ============================================================
// VIEW TOGGLING: landing page <-> login/register (single page, no navigation)
// ============================================================

function showAuth(tab) {
    const nav = document.getElementById('nav');
    const landingMain = document.getElementById('landingMain');
    const landingFooter = document.getElementById('landingFooter');
    const growthTrail = document.getElementById('growthTrail');
    const authView = document.getElementById('authView');

    if (nav) nav.style.display = 'none';
    if (landingMain) landingMain.style.display = 'none';
    if (landingFooter) landingFooter.style.display = 'none';
    if (growthTrail) growthTrail.style.display = 'none';
    if (authView) authView.style.display = 'flex';

    const targetTab = tab === 'register' ? 'register' : 'login';
    const tabEl = document.querySelector(`.tab[data-tab="${targetTab}"]`);
    switchTab(targetTab, tabEl);

    const focusField = document.getElementById(targetTab === 'register' ? 'registerUsername' : 'loginUsername');
    if (focusField) focusField.focus();

    window.scrollTo(0, 0);
}

function showLanding() {
    const nav = document.getElementById('nav');
    const landingMain = document.getElementById('landingMain');
    const landingFooter = document.getElementById('landingFooter');
    const growthTrail = document.getElementById('growthTrail');
    const authView = document.getElementById('authView');

    if (authView) authView.style.display = 'none';
    if (nav) nav.style.display = '';
    if (landingMain) landingMain.style.display = '';
    if (landingFooter) landingFooter.style.display = '';
    if (growthTrail) growthTrail.style.display = '';

    window.scrollTo(0, 0);
}

// ============================================================
// PAGE LOAD
// ============================================================

window.addEventListener('DOMContentLoaded', function () {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
    if (accessToken) {
        window.location.href = 'dashboard-v2.html';
        return;
    }

    // ---- Auth form wiring ----
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');

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
        input.addEventListener('keyup', function (e) {
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

    // ---- Mobile nav toggle ----
    const navBurger = document.getElementById('navBurger');
    const navMobile = document.getElementById('navMobile');

    if (navBurger && navMobile) {
        navBurger.addEventListener('click', function () {
            const isOpen = navMobile.classList.toggle('open');
            navBurger.setAttribute('aria-expanded', isOpen);
            navBurger.classList.toggle('open', isOpen);
        });

        navMobile.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                navMobile.classList.remove('open');
                navBurger.setAttribute('aria-expanded', false);
            });
        });
    }

    // ---- Scroll-reveal animations ----
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion && 'IntersectionObserver' in window) {
        const revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        document.querySelectorAll('.reveal').forEach(function (el) {
            revealObserver.observe(el);
        });
    } else {
        document.querySelectorAll('.reveal').forEach(function (el) {
            el.classList.add('visible');
        });
    }

    // ---- Growth trail: fills as the page scrolls, nodes light up per section ----
    const trailFill = document.getElementById('trailFill');
    const trailNodes = document.querySelectorAll('.trail-node');
    const sectionIds = ['hero', 'philosophy', 'features', 'how', 'stories', 'close'];
    const sections = sectionIds
        .map(function (id) { return document.getElementById(id); })
        .filter(Boolean);

    function updateTrail() {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;

        if (trailFill) {
            trailFill.style.height = (progress * 100) + '%';
        }

        let activeIndex = 0;
        sections.forEach(function (section, i) {
            const rect = section.getBoundingClientRect();
            if (rect.top <= window.innerHeight * 0.5) {
                activeIndex = i;
            }
        });

        trailNodes.forEach(function (node, i) {
            node.classList.toggle('active', i <= activeIndex);
        });
    }

    let ticking = false;
    window.addEventListener('scroll', function () {
        if (!ticking) {
            window.requestAnimationFrame(function () {
                updateTrail();
                ticking = false;
            });
            ticking = true;
        }
    });

    updateTrail();

    trailNodes.forEach(function (node) {
        node.addEventListener('click', function () {
            const targetId = node.getAttribute('data-target');
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
            }
        });
    });

    // Default focus for the login field if the auth view happens to already be visible
    if (loginUsername) loginUsername.focus();
});

// ============================================================
// AUTH: password visibility, tabs, messages, login/register
// ============================================================

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

function switchTab(tab, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    } else {
        const fallback = document.querySelector(`.tab[data-tab="${tab}"]`);
        if (fallback) fallback.classList.add('active');
    }

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
                switchTab('login', document.querySelector('.tab[data-tab="login"]'));
                const userInp = document.getElementById('loginUsername');
                const logBtn = document.getElementById('loginBtn');
                if (userInp) userInp.value = username;
                if (logBtn) logBtn.disabled = false;
            }, 1500);
        }
    } catch (error) {
        showMessage('Network error. Please try again.', 'error');
    } finally {
        setLoading(btn, false, 'Register');
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
