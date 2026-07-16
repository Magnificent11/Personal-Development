const API_URL = 'http://localhost:5000';
let accessToken = null;
let refreshToken = null;

let isRefreshing = false;
let refreshPromise = null;

async function refreshAccessToken() {
    if (isRefreshing) return refreshPromise;

    isRefreshing = true;
    refreshPromise = (async () => {
        try {
            const response = await fetch(`${API_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });

            if (!response.ok) return false;

            const data = await response.json();
            accessToken = data.accessToken;
            localStorage.setItem('accessToken', accessToken);
            return true;
        } catch (error) {
            console.error('Token refresh error:', error);
            return false;
        } finally {
            isRefreshing = false;
        }
    })();

    return refreshPromise;
}

async function apiCall(endpoint, method = 'GET', body = null, isRetry = false) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, options);

        if (response.status === 401) {
            if (!isRetry) {
                const refreshed = await refreshAccessToken();
                if (refreshed) {
                    return apiCall(endpoint, method, body, true);
                }
            }
            localStorage.clear();
            window.location.href = 'index.html';
            return null;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API call error:', error);
        alert(error.message || 'An error occurred');
        return null;
    }
}

async function handleLogout() {
    try {
        await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    localStorage.clear();
    window.location.href = 'index.html';
}

/* ─── THEME TOGGLE (same pattern as dashboard-v2.js) ────── */
const htmlRoot = document.getElementById('html-root');

function applyTheme(theme) {
    if (theme === 'light') {
        htmlRoot.setAttribute('data-theme', 'light');
    } else {
        htmlRoot.removeAttribute('data-theme');
    }
    try {
        localStorage.setItem('theme', theme === 'light' ? 'light' : 'dark');
    } catch (e) {}
}

document.getElementById('theme-toggle').addEventListener('click', () => {
    const isLight = htmlRoot.getAttribute('data-theme') === 'light';
    applyTheme(isLight ? 'dark' : 'light');
});

document.getElementById('logout-btn').addEventListener('click', handleLogout);
document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'dashboard-v2.html';
});

/* ─── STATS ──────────────────────────────────────────────── */

async function loadStats() {
    const data = await apiCall('/api/admin/stats');
    if (!data) return;

    const grid = document.getElementById('admin-stats-grid');
    grid.innerHTML = '';

    const blocks = [
        { label: 'Total Users', value: data.users.total },
        { label: 'Active', value: data.users.active },
        { label: 'Banned', value: data.users.banned },
        { label: 'Admins', value: data.users.admins },
        { label: 'New This Week', value: data.users.newThisWeek },
        { label: 'New This Month', value: data.users.newThisMonth },
        { label: 'Total Habits', value: data.habits.total },
    ];

    blocks.forEach(b => {
        const block = document.createElement('div');
        block.className = 'admin-stat-block';
        block.innerHTML = `
            <span class="admin-stat-label">${b.label}</span>
            <span class="admin-stat-value">${b.value}</span>
        `;
        grid.appendChild(block);
    });
}

/* ─── USERS TABLE ────────────────────────────────────────── */

// The logged-in admin's own id — used to hide/disable self-targeting
// actions (can't demote or ban yourself; matches backend rules).
let currentUserId = null;

function formatJoinDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadUsers() {
    const data = await apiCall('/api/admin/users');
    if (!data) return;

    const tbody = document.getElementById('admin-users-body');
    tbody.innerHTML = '';

    if (data.users.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" class="admin-empty">No users found.</td>`;
        tbody.appendChild(row);
        return;
    }

    data.users.forEach(user => {
        const isSelf = user.id === currentUserId || user._id === currentUserId;
        const userId = user.id || user._id;
        const roleBadge = user.role === 'admin'
            ? '<span class="admin-badge admin-badge-admin">Admin</span>'
            : '<span class="admin-badge admin-badge-user">User</span>';
        const statusBadge = user.isActive
            ? '<span class="admin-badge admin-badge-active">Active</span>'
            : '<span class="admin-badge admin-badge-banned">Banned</span>';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.username}</td>
            <td>${user.firstName} ${user.lastName}</td>
            <td>${roleBadge}</td>
            <td>${statusBadge}</td>
            <td>${formatJoinDate(user.createdAt)}</td>
            <td>
                <div class="admin-row-actions">
                    <button class="admin-action-btn" data-action="view">
                        View
                    </button>
                    <button class="admin-action-btn" data-action="ban" ${isSelf ? 'disabled' : ''}>
                        ${user.isActive ? 'Ban' : 'Unban'}
                    </button>
                    <button class="admin-action-btn danger" data-action="delete" ${isSelf ? 'disabled' : ''}>
                        Delete
                    </button>
                </div>
            </td>
        `;

        row.querySelector('[data-action="view"]').addEventListener('click', () => openViewHabitsModal(userId, `${user.firstName} ${user.lastName}`));
        row.querySelector('[data-action="ban"]').addEventListener('click', () => toggleBan(userId, user.isActive));
        row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteUser(userId, user.username));

        tbody.appendChild(row);
    });
}

async function toggleBan(userId, currentlyActive) {
    const action = currentlyActive ? 'ban' : 'unban';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    const data = await apiCall(`/api/admin/users/${userId}/ban`, 'PUT', { isActive: !currentlyActive });
    if (!data) return;

    await loadUsers();
    await loadStats();
}

async function deleteUser(userId, username) {
    if (!confirm(`Permanently delete "${username}" and all their habits? This cannot be undone.`)) return;

    const data = await apiCall(`/api/admin/users/${userId}`, 'DELETE');
    if (!data) return;

    await loadUsers();
    await loadStats();
}

/* ─── VIEW USER HABITS MODAL ─────────────────────────────── */

// Same day-count math as dashboard-v2.js's getHabitMonthlyRate, but
// worked out here from the raw completedDates array the backend returns —
// this page doesn't have the frontend's `checked` Map to read from.
function calcHabitStats(habit) {
    const completedDates = habit.completedDates || [];
    const scheduledDays = (habit.scheduledDays && habit.scheduledDays.length > 0)
        ? habit.scheduledDays
        : [0, 1, 2, 3, 4, 5, 6];

    const completedSet = new Set(
        completedDates.map(d => new Date(d).toISOString().slice(0, 10))
    );

    // Scheduled days so far this calendar month, up to and including today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysSoFar = today.getDate();

    let totalScheduled = 0;
    let doneCount = 0;
    for (let day = 1; day <= daysSoFar; day++) {
        const date = new Date(year, month, day);
        if (!scheduledDays.includes(date.getDay())) continue;
        totalScheduled++;
        const key = date.toISOString().slice(0, 10);
        if (completedSet.has(key)) doneCount++;
    }

    const pct = totalScheduled > 0 ? Math.round((doneCount / totalScheduled) * 100) : 0;
    return { doneCount, totalScheduled, pct };
}

async function openViewHabitsModal(userId, displayName) {
    const data = await apiCall(`/api/admin/users/${userId}/habits`);
    if (!data) return;

    document.getElementById('view-habits-title').textContent = `${displayName}'s Habits`;

    const body = document.getElementById('view-habits-body');
    body.innerHTML = '';

    if (data.habits.length === 0) {
        body.innerHTML = `<p class="admin-empty">This user hasn't added any habits yet.</p>`;
    } else {
        data.habits.forEach(habit => {
            const { doneCount, totalScheduled, pct } = calcHabitStats(habit);

            const row = document.createElement('div');
            row.className = 'view-habit-row';
            row.innerHTML = `
                <span class="view-habit-icon">${habit.icon || ''}</span>
                <span class="view-habit-name">${habit.name}</span>
                <div class="view-habit-stats">
                    <span class="view-habit-pct">${pct}%</span>
                    <span class="view-habit-sub">${doneCount}/${totalScheduled} this month</span>
                </div>
            `;
            body.appendChild(row);
        });
    }

    document.getElementById('view-habits-modal-overlay').classList.add('open');
}

function closeViewHabitsModal() {
    document.getElementById('view-habits-modal-overlay').classList.remove('open');
}

document.getElementById('view-habits-close').addEventListener('click', closeViewHabitsModal);
document.getElementById('view-habits-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeViewHabitsModal();
});

/* ─── INIT ───────────────────────────────────────────────── */

async function init() {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');

    if (!accessToken) {
        window.location.href = 'index.html';
        return;
    }

    // Gate the whole page on role: a non-admin who types the URL directly
    // gets bounced back before any admin data is requested.
    try {
        const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
        if (!storedUser || storedUser.role !== 'admin') {
            window.location.href = 'dashboard-v2.html';
            return;
        }
        currentUserId = storedUser.id;
    } catch (e) {
        window.location.href = 'dashboard-v2.html';
        return;
    }

    await loadStats();
    await loadUsers();
}

init();