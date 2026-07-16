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

async function apiCall(endpoint, method = 'GET', body = null, isRetry = false, silent = false) {
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
                    return apiCall(endpoint, method, body, true, silent);
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
        if (!silent) alert(error.message || 'An error occurred');
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

/* ─── USER GROWTH CHART ──────────────────────────────────────
   Entirely client-side — computed from `allUsers`' createdAt fields,
   which loadUsers() already fetches. No backend endpoint needed. */

const growthState = {
    view: 'cumulative',   // 'cumulative' | 'new'
    range: 'all',         // '30d' | '12w' | 'all'
    chartType: 'line',    // 'line' | 'bar'
};

function addDaysAdmin(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

// Monday-start week boundary, matching the convention used elsewhere in
// this app (dashboard-v2.js's weekly grid is also Mon-Sun).
function startOfWeekAdmin(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
}

// Builds the list of { label, start, end } buckets to plot, where `end`
// is exclusive. Granularity depends on range: daily for the 30-day view,
// weekly otherwise (12 fixed weeks, or however many weeks span from the
// very first signup through today for "All Time").
function getGrowthBuckets() {
    const buckets = [];

    if (growthState.range === '30d') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = 29; i >= 0; i--) {
            const start = addDaysAdmin(today, -i);
            const end = addDaysAdmin(start, 1);
            buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start, end });
        }
        return buckets;
    }

    if (growthState.range === '12w') {
        const thisWeekStart = startOfWeekAdmin(new Date());
        for (let i = 11; i >= 0; i--) {
            const start = addDaysAdmin(thisWeekStart, -7 * i);
            const end = addDaysAdmin(start, 7);
            buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start, end });
        }
        return buckets;
    }

    // 'all' — weekly buckets from the earliest signup's week through
    // the current week. Falls back to empty if there are no users yet.
    if (allUsers.length === 0) return buckets;
    const earliestTime = allUsers.reduce((min, u) => {
        const t = new Date(u.createdAt).getTime();
        return t < min ? t : min;
    }, Infinity);
    let cursor = startOfWeekAdmin(new Date(earliestTime));
    const thisWeekStart = startOfWeekAdmin(new Date());
    while (cursor <= thisWeekStart) {
        const end = addDaysAdmin(cursor, 7);
        buckets.push({ label: `${cursor.getMonth() + 1}/${cursor.getDate()}`, start: cursor, end });
        cursor = end;
    }
    return buckets;
}

// Returns { buckets, values } — values[i] is either the running total of
// users created before bucket[i] ends (cumulative) or the count of users
// created within bucket[i] (new signups), depending on growthState.view.
function getGrowthSeries() {
    const buckets = getGrowthBuckets();
    if (buckets.length === 0) return { buckets: [], values: [] };

    const createdTimes = allUsers.map(u => new Date(u.createdAt).getTime());

    const values = buckets.map(b => {
        const startT = b.start.getTime();
        const endT = b.end.getTime();
        if (growthState.view === 'new') {
            return createdTimes.filter(t => t >= startT && t < endT).length;
        }
        return createdTimes.filter(t => t < endT).length; // cumulative
    });

    return { buckets, values };
}

function renderGrowthSummary(buckets, values) {
    const el = document.getElementById('admin-growth-summary');
    if (!el) return;

    if (buckets.length === 0) {
        el.textContent = 'No signups yet.';
        return;
    }

    if (growthState.view === 'cumulative') {
        el.textContent = `${values[values.length - 1]} total users as of today.`;
    } else {
        const total = values.reduce((sum, v) => sum + v, 0);
        const rangeLabel = growthState.range === '30d' ? 'last 30 days'
            : growthState.range === '12w' ? 'last 12 weeks'
            : 'all time';
        el.textContent = `${total} new signup${total === 1 ? '' : 's'} over the ${rangeLabel}.`;
    }
}

// If a loading skeleton or error state previously replaced the chart
// wrap's contents, the <svg id="admin-growth-chart"> node itself is gone
// — recreate it before rendering into it.
function ensureGrowthSvg() {
    let svg = document.getElementById('admin-growth-chart');
    if (svg) return svg;

    const wrap = document.querySelector('.admin-growth-chart-wrap');
    if (!wrap) return null;
    wrap.innerHTML = '<svg id="admin-growth-chart" class="admin-growth-chart" viewBox="0 0 800 220" preserveAspectRatio="none"></svg>';
    return document.getElementById('admin-growth-chart');
}

function renderGrowthChart() {
    const { buckets, values } = getGrowthSeries();
    renderGrowthSummary(buckets, values);

    const svg = ensureGrowthSvg();
    if (!svg) return;
    svg.innerHTML = '';

    const svgNS = 'http://www.w3.org/2000/svg';
    const width = 800, height = 220;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    if (buckets.length === 0) {
        const emptyText = document.createElementNS(svgNS, 'text');
        emptyText.setAttribute('x', width / 2);
        emptyText.setAttribute('y', height / 2);
        emptyText.setAttribute('text-anchor', 'middle');
        emptyText.setAttribute('fill', 'var(--text-muted)');
        emptyText.setAttribute('font-size', '12');
        emptyText.textContent = 'No signups yet';
        svg.appendChild(emptyText);
        return;
    }

    const margin = { top: 16, right: 16, bottom: 32, left: 40 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const n = buckets.length;
    const maxVal = Math.max(1, ...values);

    const yFor = (v) => margin.top + plotH - (v / maxVal) * plotH;

    const isBar = growthState.chartType === 'bar';
    const slotW = plotW / n;
    const xForSlot = (i) => margin.left + slotW * (i + 0.5);
    const xForIndex = (i) => n > 1 ? margin.left + (i / (n - 1)) * plotW : margin.left + plotW / 2;
    const xFor = isBar ? xForSlot : xForIndex;

    // Horizontal gridlines + y-axis labels, rounded to whole numbers
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
        const val = Math.round((maxVal / steps) * s);
        const y = yFor(val);

        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', margin.left);
        line.setAttribute('x2', width - margin.right);
        line.setAttribute('y1', y);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', 'var(--overlay-2)');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);

        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', margin.left - 8);
        label.setAttribute('y', y + 3);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('fill', 'var(--text-muted)');
        label.setAttribute('font-size', '10');
        label.textContent = val;
        svg.appendChild(label);
    }

    // X-axis labels — thin out to at most ~8 so dense ranges (30 daily
    // buckets, or a long "all time" history) don't overlap into mush.
    const labelEvery = Math.max(1, Math.ceil(n / 8));
    buckets.forEach((b, i) => {
        if (i % labelEvery !== 0 && i !== n - 1) return;
        const x = xFor(i);
        const anchor = isBar ? 'middle' : (i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle'));

        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', height - 10);
        label.setAttribute('text-anchor', anchor);
        label.setAttribute('fill', 'var(--text-secondary)');
        label.setAttribute('font-size', '10');
        label.textContent = b.label;
        svg.appendChild(label);
    });

    if (isBar) {
        const barWidth = Math.max(3, slotW * 0.6);
        const baseline = yFor(0);
        values.forEach((v, i) => {
            const x = xFor(i) - barWidth / 2;
            const y = yFor(v);

            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', barWidth);
            rect.setAttribute('height', Math.max(0, baseline - y));
            rect.setAttribute('rx', 2);
            rect.setAttribute('fill', 'var(--gold, #c9a24b)');

            const title = document.createElementNS(svgNS, 'title');
            title.textContent = `${buckets[i].label}: ${v}`;
            rect.appendChild(title);

            svg.appendChild(rect);
        });
    } else {
        const points = values.map((v, i) => ({ x: xFor(i), y: yFor(v), v }));

        // Filled area under the line — purely decorative, makes cumulative
        // growth read as a "climb" at a glance.
        const areaPoints = [`${points[0].x},${yFor(0)}`, ...points.map(p => `${p.x},${p.y}`), `${points[n - 1].x},${yFor(0)}`];
        const area = document.createElementNS(svgNS, 'polygon');
        area.setAttribute('points', areaPoints.join(' '));
        area.setAttribute('fill', 'var(--gold, #c9a24b)');
        area.setAttribute('fill-opacity', '0.12');
        svg.appendChild(area);

        const path = document.createElementNS(svgNS, 'path');
        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--gold, #c9a24b)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);

        points.forEach((p, i) => {
            const dot = document.createElementNS(svgNS, 'circle');
            dot.setAttribute('cx', p.x);
            dot.setAttribute('cy', p.y);
            dot.setAttribute('r', '3');
            dot.setAttribute('fill', 'var(--gold, #c9a24b)');

            const title = document.createElementNS(svgNS, 'title');
            title.textContent = `${buckets[i].label}: ${p.v}`;
            dot.appendChild(title);

            svg.appendChild(dot);
        });
    }
}

function initGrowthChartControls() {
    document.querySelectorAll('#admin-growth-view-toggle .admin-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            growthState.view = btn.dataset.view;
            document.querySelectorAll('#admin-growth-view-toggle .admin-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
            renderGrowthChart();
        });
    });

    document.querySelectorAll('#admin-growth-chart-type-toggle .admin-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            growthState.chartType = btn.dataset.chartType;
            document.querySelectorAll('#admin-growth-chart-type-toggle .admin-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
            renderGrowthChart();
        });
    });

    const rangeSelect = document.getElementById('admin-growth-range-select');
    if (rangeSelect) {
        rangeSelect.value = growthState.range;
        rangeSelect.addEventListener('change', (e) => {
            growthState.range = e.target.value;
            renderGrowthChart();
        });
    }
}

/* ─── LOADING / ERROR STATE HELPERS ──────────────────────────
   Each of the four data sections (Stats, Growth, Users, Audit) tracks
   whether it has ever loaded successfully. The skeleton only appears on
   that very first load; if a later background refresh (the 30s interval)
   fails, we quietly keep showing whatever was last rendered instead of
   blanking the section out or alerting on every failed poll. */

let statsLoadedOnce = false;
let usersLoadedOnce = false;
let auditLoadedOnce = false;

function renderSkeletonBar(widthPct, heightPx, extraStyle = '') {
    return `<span class="admin-skeleton admin-skeleton-bar" style="width:${widthPct}%; height:${heightPx}px; ${extraStyle}"></span>`;
}

function renderErrorState({ message, onRetry, compact = false }) {
    const btnId = `admin-retry-${Math.random().toString(36).slice(2, 8)}`;
    const html = `
        <div class="admin-error-state${compact ? ' compact' : ''}">
            <span class="admin-error-icon">⚠️</span>
            <span>${message}</span>
            <button type="button" class="admin-retry-btn" id="${btnId}">Retry</button>
        </div>
    `;
    // Caller inserts `html` then must wire up the retry button itself
    // (querySelector by id right after insertion) — returning the id
    // rather than binding here keeps this helper markup-only.
    return { html, btnId, bind: () => document.getElementById(btnId)?.addEventListener('click', onRetry) };
}

/* ─── STATS ──────────────────────────────────────────────── */

function renderStatsSkeleton() {
    const grid = document.getElementById('admin-stats-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const block = document.createElement('div');
        block.className = 'admin-stat-block';
        block.innerHTML = `
            ${renderSkeletonBar(55, 10)}
            ${renderSkeletonBar(35, 22, 'margin-top:6px;')}
        `;
        grid.appendChild(block);
    }
}

function renderStatsError() {
    const grid = document.getElementById('admin-stats-grid');
    if (!grid) return;
    const { html, bind } = renderErrorState({ message: "Couldn't load stats.", onRetry: loadStats });
    grid.innerHTML = `<div style="grid-column: 1 / -1;">${html}</div>`;
    bind();
}

async function loadStats() {
    if (!statsLoadedOnce) renderStatsSkeleton();

    const data = await apiCall('/api/admin/stats', 'GET', null, false, true);
    if (!data) {
        if (!statsLoadedOnce) renderStatsError();
        return;
    }
    statsLoadedOnce = true;

    const grid = document.getElementById('admin-stats-grid');
    grid.innerHTML = '';

    const blocks = [
        { label: 'Total Users', value: data.users.total },
        { label: 'Active', value: data.users.active },
        { label: 'Banned', value: data.users.banned },
        { label: 'Admins', value: data.users.admins },
        { label: 'New This Week', value: data.users.newThisWeek },
        { label: 'New This Month', value: data.users.newThisMonth },
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

// Full user list as last fetched from the server. All search/filter/sort
// operates on this in memory — no refetch needed when the user types or
// changes a dropdown.
let allUsers = [];

// Ids of users currently selected for bulk actions. This is intentionally
// separate from `tableState` (pagination/filtering) — a selection persists
// across page changes and filter tweaks, since "select all" means "all
// users matching the current filter", not just the ones on screen.
let selectedIds = new Set();

// Whether the checkbox column is currently visible. Checkboxes are only
// shown once the admin opts in via the "Select" toggle — keeps the table
// clean the rest of the time.
let selectModeActive = false;

// Current search/filter/sort state, driven by the toolbar controls.
const tableState = {
    search: '',
    role: 'all',
    status: 'all',
    sortKey: null,   // 'username' | 'name' | 'role' | 'status' | 'joined'
    sortDir: 'asc',  // 'asc' | 'desc'
    page: 1,         // 1-indexed
    pageSize: 10,
};

// Current page/limit for the audit log table. Kept separate from
// `tableState` since the log is paginated server-side (it can grow
// indefinitely, unlike the user list) rather than filtered/sorted in
// memory.
const auditState = {
    page: 1,
    limit: 20,
};

const AUDIT_ACTION_LABELS = {
    ban: 'Banned',
    unban: 'Unbanned',
    delete: 'Deleted',
    role_change: 'Role Changed',
};

// Reuses the existing user-status badge palette rather than inventing new
// colors — ban/delete are both destructive (danger), unban is a restore
// (success), role_change is neutral/informational (gold).
const AUDIT_ACTION_BADGE_CLASS = {
    ban: 'admin-badge-banned',
    unban: 'admin-badge-active',
    delete: 'admin-badge-banned',
    role_change: 'admin-badge-admin',
};

function formatLogTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

function getUserId(user) {
    return user.id || user._id;
}

function formatJoinDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// A user counts as "online" if their lastSeen is within this window.
// Heartbeats fire every 60s from dashboard-v2.js, so 2 minutes gives a
// full grace period for a missed beat (tab briefly backgrounded, slow
// network, etc.) before flipping to offline.
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

function isUserOnline(lastSeen) {
    if (!lastSeen) return false;
    return (Date.now() - new Date(lastSeen).getTime()) < ONLINE_THRESHOLD_MS;
}

function renderUsersSkeleton() {
    const tbody = document.getElementById('admin-users-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const widths = [70, 60, 40, 45, 55, 30];
    for (let i = 0; i < 6; i++) {
        const row = document.createElement('tr');
        row.className = 'admin-skeleton-row';
        row.innerHTML = `
            <td class="admin-checkbox-col select-mode-only"></td>
            ${widths.map(w => `<td>${renderSkeletonBar(w, 13)}</td>`).join('')}
        `;
        tbody.appendChild(row);
    }
    const countEl = document.getElementById('admin-results-count');
    if (countEl) countEl.textContent = '';
    const paginationContainer = document.getElementById('admin-pagination-controls');
    if (paginationContainer) paginationContainer.innerHTML = '';
}

function renderUsersError() {
    const tbody = document.getElementById('admin-users-body');
    if (!tbody) return;
    const { html, bind } = renderErrorState({ message: "Couldn't load users.", onRetry: loadUsers });
    tbody.innerHTML = `<tr><td colspan="7">${html}</td></tr>`;
    bind();
}

function renderGrowthSkeleton() {
    const wrap = document.querySelector('.admin-growth-chart-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="admin-skeleton" style="height:220px; border-radius:10px;"></div>`;
    const summaryEl = document.getElementById('admin-growth-summary');
    if (summaryEl) summaryEl.textContent = '';
}

function renderGrowthError() {
    const wrap = document.querySelector('.admin-growth-chart-wrap');
    if (!wrap) return;
    const { html, bind } = renderErrorState({ message: "Couldn't load growth data.", onRetry: loadUsers });
    wrap.innerHTML = `<div style="height:220px; display:flex; align-items:center; justify-content:center;">${html}</div>`;
    bind();
}

// Fetches users from the server and stores them in `allUsers`, then
// triggers a render. Call this on init and after any action that changes
// the underlying data (ban/unban/delete). It does NOT need to run again
// just because the user searched, filtered, or sorted — renderUsers()
// handles that from the in-memory copy.
async function loadUsers() {
    if (!usersLoadedOnce) {
        renderUsersSkeleton();
        renderGrowthSkeleton();
    }

    const data = await apiCall('/api/admin/users', 'GET', null, false, true);
    if (!data) {
        if (!usersLoadedOnce) {
            renderUsersError();
            renderGrowthError();
        }
        return;
    }
    usersLoadedOnce = true;

    allUsers = data.users;

    // Drop any selected ids that no longer exist (deleted elsewhere,
    // e.g. by another admin tab) so the bulk bar count stays honest.
    const stillValid = new Set(allUsers.map(getUserId));
    selectedIds.forEach(id => { if (!stillValid.has(id)) selectedIds.delete(id); });

    renderUsers();
    renderGrowthChart();
}

// Applies the current search/filter/sort state to `allUsers` and returns
// a new array — never mutates `allUsers` itself.
function getFilteredSortedUsers() {
    const search = tableState.search.trim().toLowerCase();

    let result = allUsers.filter(user => {
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        const matchesSearch = !search
            || user.username.toLowerCase().includes(search)
            || fullName.includes(search);

        const matchesRole = tableState.role === 'all' || user.role === tableState.role;

        const matchesStatus = tableState.status === 'all'
            || (tableState.status === 'active' && user.isActive)
            || (tableState.status === 'banned' && !user.isActive);

        return matchesSearch && matchesRole && matchesStatus;
    });

    if (tableState.sortKey) {
        const dir = tableState.sortDir === 'asc' ? 1 : -1;
        result = result.slice().sort((a, b) => {
            let av, bv;
            switch (tableState.sortKey) {
                case 'username':
                    av = a.username.toLowerCase();
                    bv = b.username.toLowerCase();
                    break;
                case 'name':
                    av = `${a.firstName} ${a.lastName}`.toLowerCase();
                    bv = `${b.firstName} ${b.lastName}`.toLowerCase();
                    break;
                case 'role':
                    av = a.role;
                    bv = b.role;
                    break;
                case 'status':
                    av = a.isActive ? 1 : 0;
                    bv = b.isActive ? 1 : 0;
                    break;
                case 'joined':
                    av = new Date(a.createdAt).getTime();
                    bv = new Date(b.createdAt).getTime();
                    break;
                default:
                    av = bv = 0;
            }
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
    }

    return result;
}

// Rebuilds the table body (and results count) from `allUsers` filtered/
// sorted/paginated per `tableState`. Does not touch the network.
function renderUsers() {
    const filteredSorted = getFilteredSortedUsers();

    const totalPages = Math.max(1, Math.ceil(filteredSorted.length / tableState.pageSize));
    // Clamp: if a filter/pageSize change leaves the current page past the
    // end (e.g. was on page 4, now only 2 pages exist), snap back rather
    // than rendering an empty table with no way to tell why.
    if (tableState.page > totalPages) tableState.page = totalPages;
    if (tableState.page < 1) tableState.page = 1;

    const startIdx = (tableState.page - 1) * tableState.pageSize;
    const users = filteredSorted.slice(startIdx, startIdx + tableState.pageSize);

    const countEl = document.getElementById('admin-results-count');
    if (countEl) {
        countEl.textContent = `${filteredSorted.length} of ${allUsers.length}`;
    }

    updateSortArrows();
    renderPaginationControls(filteredSorted.length, totalPages);

    const tbody = document.getElementById('admin-users-body');
    tbody.innerHTML = '';

    if (users.length === 0) {
        const row = document.createElement('tr');
        const message = allUsers.length === 0
            ? 'No users found.'
            : 'No users match your search/filters.';
        row.innerHTML = `<td colspan="7" class="admin-empty">${message}</td>`;
        tbody.appendChild(row);
        updateSelectAllCheckbox(filteredSorted);
        updateBulkBar();
        return;
    }

    users.forEach(user => {
        const isSelf = user.id === currentUserId || user._id === currentUserId;
        const userId = getUserId(user);
        const isChecked = selectedIds.has(userId);
        const roleBadge = user.role === 'admin'
            ? '<span class="admin-badge admin-badge-admin">Admin</span>'
            : '<span class="admin-badge admin-badge-user">User</span>';
        const statusBadge = user.isActive
            ? '<span class="admin-badge admin-badge-active">Active</span>'
            : '<span class="admin-badge admin-badge-banned">Banned</span>';

        const row = document.createElement('tr');
        if (isChecked) row.classList.add('selected-row');
        row.innerHTML = `
            <td class="admin-checkbox-col select-mode-only">
                <input type="checkbox" class="admin-row-checkbox" ${isChecked ? 'checked' : ''} ${isSelf ? 'disabled title="You can\'t select your own account"' : ''}>
            </td>
            <td>
                <span class="presence-dot ${isUserOnline(user.lastSeen) ? 'presence-online' : 'presence-offline'}"
                      title="${isUserOnline(user.lastSeen) ? 'Online now' : 'Offline'}"></span>
                ${user.username}
            </td>
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

        // Clicking anywhere else on the row opens the same habits modal as
        // the View button — but not when the click landed on a checkbox,
        // a button, or one of the action buttons, since those already do
        // their own thing.
        row.addEventListener('click', (e) => {
            if (e.target.closest('.admin-row-actions, .admin-checkbox-col, button, input')) return;
            openViewHabitsModal(userId, `${user.firstName} ${user.lastName}`);
        });

        if (!isSelf) {
            row.querySelector('.admin-row-checkbox').addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedIds.add(userId);
                } else {
                    selectedIds.delete(userId);
                }
                row.classList.toggle('selected-row', e.target.checked);
                updateSelectAllCheckbox(filteredSorted);
                updateBulkBar();
            });
        }

        tbody.appendChild(row);
    });

    updateSelectAllCheckbox(filteredSorted);
    updateBulkBar();
}

// Reflects tableState.sortKey/sortDir onto the column header arrows.
function updateSortArrows() {
    document.querySelectorAll('.admin-table th.sortable').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (!arrow) return;
        if (th.dataset.sort === tableState.sortKey) {
            th.classList.add('sorted');
            arrow.textContent = tableState.sortDir === 'asc' ? '▲' : '▼';
        } else {
            th.classList.remove('sorted');
            arrow.textContent = '';
        }
    });
}

// Builds the list of page numbers to display, truncating with '…' once
// there are more pages than reasonably fit — e.g. for page 7 of 20:
// [1, '…', 6, 7, 8, '…', 20]. Always shows first, last, current, and one
// neighbor on each side of current.
function buildPageButtonList(current, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages = new Set([1, total, current, current - 1, current + 1]);
    const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);

    const result = [];
    let prev = null;
    sorted.forEach(p => {
        if (prev !== null && p - prev > 1) result.push('…');
        result.push(p);
        prev = p;
    });
    return result;
}

function renderPaginationControls(totalFiltered, totalPages) {
    const container = document.getElementById('admin-pagination-controls');
    if (!container) return;
    container.innerHTML = '';

    if (totalFiltered === 0) return;

    const goToPage = (p) => {
        tableState.page = p;
        renderUsers();
    };

    const prevBtn = document.createElement('button');
    prevBtn.className = 'admin-page-btn admin-page-nav';
    prevBtn.textContent = 'Prev';
    prevBtn.disabled = tableState.page <= 1;
    prevBtn.addEventListener('click', () => goToPage(tableState.page - 1));
    container.appendChild(prevBtn);

    buildPageButtonList(tableState.page, totalPages).forEach(p => {
        if (p === '…') {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'admin-page-ellipsis';
            ellipsis.textContent = '…';
            container.appendChild(ellipsis);
            return;
        }
        const btn = document.createElement('button');
        btn.className = 'admin-page-btn' + (p === tableState.page ? ' active' : '');
        btn.textContent = p;
        btn.addEventListener('click', () => goToPage(p));
        container.appendChild(btn);
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'admin-page-btn admin-page-nav';
    nextBtn.textContent = 'Next';
    nextBtn.disabled = tableState.page >= totalPages;
    nextBtn.addEventListener('click', () => goToPage(tableState.page + 1));
    container.appendChild(nextBtn);
}

/* ─── AUDIT / ACTIVITY LOG ───────────────────────────────── */

function renderAuditRow(log) {
    const label = AUDIT_ACTION_LABELS[log.action] || log.action;
    const badgeClass = AUDIT_ACTION_BADGE_CLASS[log.action] || 'admin-badge-user';

    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="admin-audit-time">${formatLogTime(log.createdAt)}</td>
        <td>${log.actorUsername}</td>
        <td><span class="admin-badge ${badgeClass}">${label}</span></td>
        <td>${log.targetUsername}</td>
        <td class="admin-audit-details">${log.details || '—'}</td>
    `;
    return row;
}

function renderAuditSkeleton() {
    const tbody = document.getElementById('admin-audit-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const widths = [50, 35, 30, 35, 45];
    for (let i = 0; i < 5; i++) {
        const row = document.createElement('tr');
        row.className = 'admin-skeleton-row';
        row.innerHTML = widths.map(w => `<td>${renderSkeletonBar(w, 13)}</td>`).join('');
        tbody.appendChild(row);
    }
    const countEl = document.getElementById('admin-audit-count');
    if (countEl) countEl.textContent = '';
    const paginationContainer = document.getElementById('admin-audit-pagination-controls');
    if (paginationContainer) paginationContainer.innerHTML = '';
}

function renderAuditError() {
    const tbody = document.getElementById('admin-audit-body');
    if (!tbody) return;
    const { html, bind } = renderErrorState({ message: "Couldn't load activity log.", onRetry: () => loadAuditLog() });
    tbody.innerHTML = `<tr><td colspan="5">${html}</td></tr>`;
    bind();
}

async function loadAuditLog(page = auditState.page) {
    if (!auditLoadedOnce) renderAuditSkeleton();

    const data = await apiCall(`/api/admin/audit-log?page=${page}&limit=${auditState.limit}`, 'GET', null, false, true);
    if (!data) {
        if (!auditLoadedOnce) renderAuditError();
        return;
    }
    auditLoadedOnce = true;

    auditState.page = data.page;

    const tbody = document.getElementById('admin-audit-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.logs.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5" class="admin-empty">No activity yet.</td>`;
        tbody.appendChild(row);
    } else {
        data.logs.forEach(log => tbody.appendChild(renderAuditRow(log)));
    }

    const countEl = document.getElementById('admin-audit-count');
    if (countEl) countEl.textContent = `${data.total} total`;

    renderAuditPaginationControls(data.total, data.page, data.totalPages);
}

function renderAuditPaginationControls(total, currentPage, totalPages) {
    const container = document.getElementById('admin-audit-pagination-controls');
    if (!container) return;
    container.innerHTML = '';

    if (total === 0) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'admin-page-btn admin-page-nav';
    prevBtn.textContent = 'Prev';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', () => loadAuditLog(currentPage - 1));
    container.appendChild(prevBtn);

    buildPageButtonList(currentPage, totalPages).forEach(p => {
        if (p === '…') {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'admin-page-ellipsis';
            ellipsis.textContent = '…';
            container.appendChild(ellipsis);
            return;
        }
        const btn = document.createElement('button');
        btn.className = 'admin-page-btn' + (p === currentPage ? ' active' : '');
        btn.textContent = p;
        btn.addEventListener('click', () => loadAuditLog(p));
        container.appendChild(btn);
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'admin-page-btn admin-page-nav';
    nextBtn.textContent = 'Next';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', () => loadAuditLog(currentPage + 1));
    container.appendChild(nextBtn);
}

async function toggleBan(userId, currentlyActive) {
    const action = currentlyActive ? 'ban' : 'unban';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    const data = await apiCall(`/api/admin/users/${userId}/ban`, 'PUT', { isActive: !currentlyActive });
    if (!data) return;

    await loadUsers();
    await loadStats();
    auditState.page = 1;
    await loadAuditLog();
}

async function deleteUser(userId, username) {
    if (!confirm(`Permanently delete "${username}" and all their habits? This cannot be undone.`)) return;

    const data = await apiCall(`/api/admin/users/${userId}`, 'DELETE');
    if (!data) return;

    selectedIds.delete(userId);
    await loadUsers();
    await loadStats();
    auditState.page = 1;
    await loadAuditLog();
}

/* ─── BULK SELECTION ─────────────────────────────────────── */

// "Select all" means all users matching the current search/filter,
// across every page — not just the rows currently rendered.
function getSelectableFilteredUsers() {
    return getFilteredSortedUsers().filter(u => getUserId(u) !== currentUserId);
}

// Syncs the header checkbox's checked/indeterminate state against
// whichever users currently match the filter.
function updateSelectAllCheckbox(filteredSorted) {
    const headerCheckbox = document.getElementById('admin-select-all-checkbox');
    if (!headerCheckbox) return;

    const selectable = filteredSorted.filter(u => getUserId(u) !== currentUserId);
    if (selectable.length === 0) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
        headerCheckbox.disabled = true;
        return;
    }

    headerCheckbox.disabled = false;
    const selectedCount = selectable.filter(u => selectedIds.has(getUserId(u))).length;
    headerCheckbox.checked = selectedCount === selectable.length;
    headerCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
}

function updateBulkBar() {
    const bar = document.getElementById('admin-bulk-bar');
    const text = document.getElementById('admin-bulk-bar-text');
    if (!bar || !text) return;

    const count = selectedIds.size;
    bar.classList.toggle('visible', count > 0);
    text.textContent = `${count} selected`;
}

// Turns the checkbox column on/off. Turning it off also clears whatever
// was selected — there's no way to act on a selection you can no longer
// see, so leaving stale ids around would just be confusing.
function setSelectMode(active) {
    selectModeActive = active;

    const table = document.getElementById('admin-users-table');
    if (table) table.classList.toggle('select-mode-active', active);

    const toggleBtn = document.getElementById('admin-select-toggle-btn');
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', active);
        toggleBtn.textContent = active ? 'Cancel' : 'Select';
    }

    if (!active) {
        selectedIds.clear();
    }

    renderUsers();
}

document.getElementById('admin-select-toggle-btn').addEventListener('click', () => {
    setSelectMode(!selectModeActive);
});

document.getElementById('admin-select-all-checkbox').addEventListener('change', (e) => {
    const selectable = getSelectableFilteredUsers();
    if (e.target.checked) {
        selectable.forEach(u => selectedIds.add(getUserId(u)));
    } else {
        selectable.forEach(u => selectedIds.delete(getUserId(u)));
    }
    renderUsers();
});

document.getElementById('admin-bulk-clear-btn').addEventListener('click', () => {
    selectedIds.clear();
    renderUsers();
});

document.getElementById('admin-bulk-delete-btn').addEventListener('click', openBulkDeleteModal);

/* ─── BULK DELETE CONFIRMATION MODAL ─────────────────────── */

const BULK_DELETE_LIST_LIMIT = 8;
const BULK_DELETE_CONFIRM_WORD = 'DELETE';

function openBulkDeleteModal() {
    if (selectedIds.size === 0) return;

    const selectedUsers = allUsers.filter(u => selectedIds.has(getUserId(u)));

    document.getElementById('bulk-delete-title').textContent = `Delete ${selectedUsers.length} User${selectedUsers.length === 1 ? '' : 's'}`;

    const list = document.getElementById('bulk-delete-list');
    list.innerHTML = '';
    selectedUsers.slice(0, BULK_DELETE_LIST_LIMIT).forEach(u => {
        const item = document.createElement('div');
        item.className = 'bulk-delete-item';
        item.innerHTML = `<span>${u.username} (${u.firstName} ${u.lastName})</span>`;
        list.appendChild(item);
    });
    if (selectedUsers.length > BULK_DELETE_LIST_LIMIT) {
        const more = document.createElement('div');
        more.className = 'bulk-delete-more';
        more.textContent = `+ ${selectedUsers.length - BULK_DELETE_LIST_LIMIT} more`;
        list.appendChild(more);
    }

    const input = document.getElementById('bulk-delete-confirm-input');
    input.value = '';
    document.getElementById('bulk-delete-confirm-btn').disabled = true;
    document.getElementById('bulk-delete-progress').textContent = '';

    document.getElementById('bulk-delete-modal-overlay').classList.add('open');
    input.focus();
}

function closeBulkDeleteModal() {
    document.getElementById('bulk-delete-modal-overlay').classList.remove('open');
}

document.getElementById('bulk-delete-confirm-input').addEventListener('input', (e) => {
    document.getElementById('bulk-delete-confirm-btn').disabled = e.target.value.trim() !== BULK_DELETE_CONFIRM_WORD;
});

document.getElementById('bulk-delete-cancel').addEventListener('click', closeBulkDeleteModal);
document.getElementById('bulk-delete-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBulkDeleteModal();
});

document.getElementById('bulk-delete-confirm-btn').addEventListener('click', async () => {
    const confirmBtn = document.getElementById('bulk-delete-confirm-btn');
    const cancelBtn = document.getElementById('bulk-delete-cancel');
    const progress = document.getElementById('bulk-delete-progress');

    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    confirmBtn.disabled = true;
    cancelBtn.disabled = true;

    // The backend only exposes a one-at-a-time DELETE endpoint, so a bulk
    // delete is N sequential requests. Fine at this app's current scale;
    // would want a batch endpoint if user counts grow much larger.
    const failures = [];
    for (let i = 0; i < idsToDelete.length; i++) {
        const id = idsToDelete[i];
        progress.textContent = `Deleting ${i + 1} of ${idsToDelete.length}…`;
        const user = allUsers.find(u => getUserId(u) === id);
        const result = await apiCall(`/api/admin/users/${id}`, 'DELETE');
        if (result) {
            selectedIds.delete(id);
        } else {
            failures.push(user ? user.username : id);
        }
    }

    cancelBtn.disabled = false;
    closeBulkDeleteModal();

    await loadUsers();
    await loadStats();
    auditState.page = 1;
    await loadAuditLog();

    if (failures.length > 0) {
        alert(`${idsToDelete.length - failures.length} user(s) deleted. Failed to delete: ${failures.join(', ')}`);
    }
});

/* ─── SEARCH / FILTER / SORT TOOLBAR ─────────────────────── */

function initTableToolbar() {
    const searchInput = document.getElementById('admin-search-input');
    const roleFilter = document.getElementById('admin-role-filter');
    const statusFilter = document.getElementById('admin-status-filter');
    const pageSizeSelect = document.getElementById('admin-pagesize-select');

    // Debounce so we don't re-render on every keystroke for larger lists.
    let searchDebounce = null;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            tableState.search = e.target.value;
            tableState.page = 1; // new result set — start back at page 1
            renderUsers();
        }, 150);
    });

    roleFilter.addEventListener('change', (e) => {
        tableState.role = e.target.value;
        tableState.page = 1;
        renderUsers();
    });

    statusFilter.addEventListener('change', (e) => {
        tableState.status = e.target.value;
        tableState.page = 1;
        renderUsers();
    });

    if (pageSizeSelect) {
        pageSizeSelect.value = String(tableState.pageSize);
        pageSizeSelect.addEventListener('change', (e) => {
            tableState.pageSize = parseInt(e.target.value, 10);
            tableState.page = 1; // page boundaries shifted — start over
            renderUsers();
        });
    }

    document.querySelectorAll('.admin-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (tableState.sortKey === key) {
                tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                tableState.sortKey = key;
                tableState.sortDir = 'asc';
            }
            renderUsers();
        });
    });
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

    initTableToolbar();
    initGrowthChartControls();
    await loadStats();
    await loadUsers();
    await loadAuditLog();

    // Presence dots go stale the moment they're rendered — refresh the
    // user list periodically (silently, in the background) so an admin
    // watching this page sees people go online/offline without having
    // to reload. Search/filter/sort state lives in tableState, not in
    // the fetch, so this doesn't disrupt anything the admin is doing.
    // The audit log is refreshed on the same interval (staying on
    // whatever page the admin is currently viewing) in case another
    // admin's actions land while this tab is open.
    setInterval(() => {
        loadUsers();
        loadAuditLog(auditState.page);
    }, 30 * 1000);
}

init();