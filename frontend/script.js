const API_URL = 'http://localhost:5000';
let accessToken = null;
let refreshToken = null;

window.onload = function() {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
    if (accessToken) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Auto-focus username and enable/disable login button on input
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    loginUsername.focus();

    function updateLoginBtn() {
        const btn = document.getElementById('loginBtn');
        btn.disabled = !loginUsername.value.trim() || !loginPassword.value.trim();
    }
    loginUsername.addEventListener('input', updateLoginBtn);
    loginPassword.addEventListener('input', updateLoginBtn);

    // Caps Lock detection on all password fields
    document.querySelectorAll('input[type="password"]').forEach(input => {
        input.addEventListener('keyup', function(e) {
            const warningId = this.id.replace('Password', 'CapsWarning')
                .replace('loginP', 'loginCapsW')
                .replace('registerP', 'registerCapsW');
            const warning = document.getElementById(
                this.id === 'loginPassword' ? 'loginCapsWarning' : 'registerCapsWarning'
            );
            if (warning) {
                warning.classList.toggle('visible', e.getModifierState('CapsLock'));
            }
        });
    });
};

// Password visibility toggle
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    btn.innerHTML = isHidden
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelector('.tab-indicator').classList.toggle('right', tab === 'register');
    document.querySelectorAll('.form-container').forEach(f => f.classList.remove('active'));
    document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm').classList.add('active');
    hideMessage();
    clearFieldErrors();
}

function showMessage(message, type) {
    const el = document.getElementById('message');
    el.textContent = message;
    el.className = `message ${type}`;
}

function hideMessage() {
    document.getElementById('message').className = 'message';
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
    btn.disabled = isLoading;
    btn.classList.toggle('loading', isLoading);
    btn.querySelector('.btn-text').textContent = label;
}

async function handleRegister(event) {
    event.preventDefault();
    clearFieldErrors();

    const btn = document.getElementById('registerBtn');
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const firstName = document.getElementById('registerFirstName').value.trim();
    const lastName = document.getElementById('registerLastName').value.trim();

    // Inline validation
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
        const response = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, firstName, lastName }),
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('Account created! Please sign in.', 'success');
            setTimeout(() => {
                switchTab('login');
                document.getElementById('loginUsername').value = username;
                document.getElementById('loginBtn').disabled = false;
            }, 1500);
        } else {
            if (data.error?.toLowerCase().includes('username')) {
                showFieldError('registerUsername', data.error);
            } else {
                showMessage(data.error || 'Registration failed', 'error');
            }
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
            showMessage('Welcome back!', 'success');
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
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
        // Re-check disabled state after loading
        const u = document.getElementById('loginUsername').value.trim();
        const p = document.getElementById('loginPassword').value.trim();
        btn.disabled = !u || !p;
    }
}