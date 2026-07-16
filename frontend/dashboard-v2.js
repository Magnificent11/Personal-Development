/* ─── AUTH / API ──────────────────────────────────────────── */

const API_URL = 'http://localhost:5000';
let accessToken = null;
let refreshToken = null;

// Guards against firing multiple simultaneous refresh requests if several
// apiCall()s hit a 401 at the same time — they all await the same promise.
let isRefreshing = false;
let refreshPromise = null;

// Attempts to exchange the stored refreshToken for a new accessToken.
// Returns true on success (accessToken + localStorage updated in place),
// false if the refresh token itself is invalid/expired.
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

// isRetry guards against an infinite loop: if the retried call ALSO comes
// back 401 (meaning the refresh token itself is no good), we give up and
// log out rather than looping forever.
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
                // Access token expired or was rejected — try a silent refresh
                // before giving up. Most of the time the user never notices.
                const refreshed = await refreshAccessToken();
                if (refreshed) {
                    return apiCall(endpoint, method, body, true);
                }
            }
            // Either this was already a retry, or refresh itself failed —
            // the refresh token (7-day) is no longer valid, so log out for real.
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

/* ─── PRESENCE HEARTBEAT ─────────────────────────────────────
   Pings the server every 60s while a logged-in user has this tab open, so
   the admin dashboard can show a live online/offline indicator. Fire one
   immediately on load (don't make them wait a full interval to register
   as online), then repeat on a timer. Cleared on logout so a stale timer
   doesn't keep firing (and erroring) after localStorage is wiped. */
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
let heartbeatIntervalId = null;

function sendHeartbeat() {
    // Fire-and-forget — a missed heartbeat just means the admin view lags
    // by a cycle, not worth surfacing an error to the user for.
    apiCall('/api/auth/heartbeat', 'POST').catch(() => {});
}

function startHeartbeat() {
    sendHeartbeat();
    heartbeatIntervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
}

async function handleLogout() {
    stopHeartbeat();
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

/* ─── DATA ────────────────────────────────────────────────── */

const HABIT_COLORS = [
    '#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#22d3ee',
    '#f472b6', '#fb923c', '#facc15', '#e879f9', '#4ade80',
    '#f87171', '#38bdf8', '#818cf8', '#2dd4bf', '#fb7185',
    '#a3e635', '#c084fc', '#fdba74', '#6ee7b7', '#fde047',
];
const UNIQUE_COLORS = [...new Set(HABIT_COLORS)];

// Icon set based on the top 20 most-tracked habits (Coach.me 2020 data):
const HABIT_ICONS = [
    // ── Fitness / Health ──
    '🏃', // Run / Exercise
    '🏋️', // Gym / Strength training
    '🧘', // Yoga / Meditate
    '🚶', // Walk
    '💧', // Water / Hydration

    // ── Restrictions / Avoidance ──
    '🚭', // No smoking
    '🍺', // No alcohol
    '🍬', // No sugar / sweets
    '📱', // No phone / screen time
    '🍔', // No junk food

    // ── Creativity / Hobbies ──
    '🎨', // Art / Painting
    '🎸', // Music / Instrument
    '📷', // Photography
    '🎮', // Gaming
    '🧩', // Crafts / Puzzle

    // ── Learning / Reading / Writing ──
    '📚', // Read
    '📖', // Study
    '✍️', // Journal / Write
    '🎓', // Learn / Course
    '🗣️', // Language practice

    // ── Home / Chores ──
    '🧹', // Clean
    '🍳', // Cook
    '🧺', // Laundry
    '🌱', // Garden / Plants
    '🛏️', // Make bed
];

// Populated from the backend on load (see loadHabits()).
// Shape: { id, label, color, icon }  — id maps to the MongoDB _id.
let HABITS = [];

// checked: Map of "habitId|YYYY-MM-DD" -> ISO timestamp string (when it was checked)
const checked = new Map();

let weekOffset = 0;

// Weekly Summary trend chart state
let trendChartType = 'scatter'; // 'line' | 'scatter' | 'histogram' | 'radar'
let trendSelectedHabitId = 'all'; // 'all' or a specific habit's id
let trendMonthOffset = 0; // 0 = current month, -1 = last month, etc. Can't go positive (future).

/* ─── HABIT SCHEDULING (which days of the week a habit applies to) ───
   This has to come before "Add/Edit modal state" below — those lines
   read ALL_DAYS immediately when the script loads. With const/let,
   referencing a variable before its own declaration line runs throws
   "Cannot access before initialization" (the temporal dead zone) and
   halts the whole script — that's the bug that was breaking the page. */

// All 7 days — the default schedule for new habits and the fallback for
// any habit loaded from the backend before this field existed.
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Day-toggle pills are shown Mon..Sun (matches the weekly grid's layout),
// but the stored values are JS's native getDay() indices (0=Sun..6=Sat)
// so they compare directly against date.getDay() everywhere else.
const DAY_TOGGLE_ORDER  = [1, 2, 3, 4, 5, 6, 0];
const DAY_TOGGLE_LABELS = { 0: 'Su', 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa' };

function isScheduledDay(habit, date) {
    const scheduledDays = habit.scheduledDays || ALL_DAYS;
    return scheduledDays.includes(date.getDay());
}

// Add modal state
let addSelectedColor = null;
let addSelectedIcon  = null;
let addSelectedDays  = []; // start blank — user must explicitly pick days

// Edit modal state
let editSelectedColor = null;
let editSelectedIcon  = null;
let editSelectedDays  = [...ALL_DAYS];
let editingHabitId    = null;

// Drag state
let dragHabitId = null;

/* ─── HELPERS ───────────────────────────────────────────── */

function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function toKey(date) {
    return date.toISOString().slice(0, 10);
}

function isToday(date) {
    return toKey(date) === toKey(today());
}

function getWeekDatesForOffset(offset) {
    const t = today();
    const dayOfWeek = t.getDay();
    const distToMonday = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
    const monday = addDays(t, distToMonday + offset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function getWeekDates() {
    return getWeekDatesForOffset(weekOffset);
}

function formatTime(isoString) {
    const d = new Date(isoString);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes} ${ampm}`;
}

const DAY_NAMES   = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ─── COLOR / ICON HELPERS ──────────────────────────────── */

function getAvailableColors(excludeHabitId = null) {
    const usedColors = new Set(
        HABITS.filter(h => h.id !== excludeHabitId).map(h => h.color)
    );
    return UNIQUE_COLORS.filter(c => !usedColors.has(c));
}

/* ─── STATS ─────────────────────────────────────────────── */

function countCheckedThisWeek(habitId, dates) {
    return dates.filter(d => checked.has(`${habitId}|${toKey(d)}`)).length;
}

function countForDay(date) {
    return HABITS.filter(h => checked.has(`${h.id}|${toKey(date)}`)).length;
}

/* ─── BACKEND SYNC ──────────────────────────────────────── */

// Fetch habits + their completion history from the backend and
// populate the local HABITS array and `checked` map.
async function loadHabits() {
    const data = await apiCall('/api/habits');
    if (!data) return;

    HABITS = data.habits.map(h => ({
        id: h._id,
        label: h.name,
        color: h.color || UNIQUE_COLORS[0],
        icon: h.icon || HABIT_ICONS[0],
        scheduledDays: (h.scheduledDays && h.scheduledDays.length > 0) ? h.scheduledDays : [...ALL_DAYS],
    }));

    checked.clear();
    data.habits.forEach(h => {
        (h.completedDates || []).forEach(dateStr => {
            const key = `${h._id}|${new Date(dateStr).toISOString().slice(0, 10)}`;
            checked.set(key, dateStr);
        });
    });
}

// Persist the current HABITS array order to the backend.
// Fire-and-forget — reordering already reflects locally via render().
function persistHabitOrder() {
    HABITS.forEach((h, idx) => {
        apiCall(`/api/habits/${h.id}`, 'PUT', { order: idx });
    });
}

/* ─── RENDER ────────────────────────────────────────────── */

function render() {
    const dates = getWeekDates();
    const first = dates[0], last = dates[6];

    document.getElementById('week-label').textContent =
        `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;

    // ── LEFT PANEL ──────────────────────────────────────────
    const panelLeft = document.getElementById('panel-left');
    while (panelLeft.children.length > 1) panelLeft.removeChild(panelLeft.lastChild);

    HABITS.forEach(habit => {
        const cell = document.createElement('div');
        cell.className = 'habit-name-cell';
        cell.dataset.habitId = habit.id;

        cell.innerHTML = `
            <span class="drag-handle" draggable="true" title="Drag to reorder">
                <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
                    <circle cx="2" cy="2" r="1.3" fill="currentColor"/>
                    <circle cx="8" cy="2" r="1.3" fill="currentColor"/>
                    <circle cx="2" cy="7" r="1.3" fill="currentColor"/>
                    <circle cx="8" cy="7" r="1.3" fill="currentColor"/>
                    <circle cx="2" cy="12" r="1.3" fill="currentColor"/>
                    <circle cx="8" cy="12" r="1.3" fill="currentColor"/>
                </svg>
            </span>
            <span class="habit-icon">${habit.icon || ''}</span>
            <span class="habit-name-text">${habit.label}</span>
            <svg class="habit-edit-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M9 2l2 2-6.5 6.5L2 11l.5-2.5L9 2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;

        // Click anywhere except the drag handle opens edit
        cell.addEventListener('click', (e) => {
            if (e.target.closest('.drag-handle')) return;
            openEditModal(habit.id);
        });

        // Drag events — handle initiates, row receives
        const handle = cell.querySelector('.drag-handle');
        handle.addEventListener('dragstart', (e) => {
            dragHabitId = habit.id;
            cell.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        handle.addEventListener('dragend', () => {
            cell.classList.remove('dragging');
            clearDragOverStyles();
            dragHabitId = null;
        });

        cell.addEventListener('dragover', (e) => {
            if (!dragHabitId || dragHabitId === habit.id) return;
            e.preventDefault();
            const rect = cell.getBoundingClientRect();
            const isTopHalf = (e.clientY - rect.top) < rect.height / 2;
            clearDragOverStyles();
            cell.classList.add(isTopHalf ? 'drag-over-top' : 'drag-over-bottom');
        });

        cell.addEventListener('dragleave', () => {
            cell.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!dragHabitId || dragHabitId === habit.id) return;

            const rect = cell.getBoundingClientRect();
            const isTopHalf = (e.clientY - rect.top) < rect.height / 2;

            const fromIndex = HABITS.findIndex(h => h.id === dragHabitId);
            let toIndex = HABITS.findIndex(h => h.id === habit.id);
            if (fromIndex === -1 || toIndex === -1) return;

            const [moved] = HABITS.splice(fromIndex, 1);
            // Recompute toIndex after removal
            toIndex = HABITS.findIndex(h => h.id === habit.id);
            const insertAt = isTopHalf ? toIndex : toIndex + 1;
            HABITS.splice(insertAt, 0, moved);

            clearDragOverStyles();
            dragHabitId = null;
            render();
            persistHabitOrder();
        });

        panelLeft.appendChild(cell);
    });

    const addCell = document.createElement('div');
    addCell.className = 'add-habit-cell';
    addCell.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg> New Habit`;
    addCell.addEventListener('click', openAddModal);
    panelLeft.appendChild(addCell);

    const countLabel = document.createElement('div');
    countLabel.className = 'count-label-cell';
    countLabel.textContent = 'daily total';
    panelLeft.appendChild(countLabel);

    // ── CENTER PANEL ─────────────────────────────────────────
    const grid = document.getElementById('days-grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(7, minmax(52px, 1fr))`;

    dates.forEach(date => {
        const th = document.createElement('div');
        th.className = 'day-header' + (isToday(date) ? ' today' : '');
        th.innerHTML = `
            <span class="day-name">${DAY_NAMES[date.getDay()]}</span>
            <span class="day-date">${date.getDate()}</span>
        `;
        grid.appendChild(th);
    });

    HABITS.forEach(habit => {
        dates.forEach(date => {
            const key = `${habit.id}|${toKey(date)}`;
            const isChecked = checked.has(key);
            const isToday_  = isToday(date);
            const isFuture  = date > today();
            const scheduled = isScheduledDay(habit, date);
            // "active" = a day that can actually show/take a real check —
            // future days haven't happened yet, so they never count as checked
            const active = scheduled && !isFuture;

            const cell = document.createElement('div');
            let cls = `day-cell${(active && isChecked) ? ' checked' : ' empty'}${isToday_ ? ' today-col' : ''}`;
            if (isFuture) {
                cls += ' future';
            } else if (!scheduled) {
                cls += ' unscheduled';
            }
            cell.className = cls;

            const fill = document.createElement('div');
            fill.className = 'cell-fill';
            if (active && isChecked) {
                fill.style.background = habit.color;
            }
            cell.appendChild(fill);

            // Grey X mark: only for past/today days excluded from the schedule —
            // future days stay blank since nothing was skipped yet
            if (!isFuture && !scheduled) {
                const skipIcon = document.createElement('div');
                skipIcon.className = 'cell-skip-icon';
                skipIcon.title = 'Not scheduled for this habit';
                skipIcon.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>`;
                cell.appendChild(skipIcon);
            }

            // Off-schedule and future days aren't clickable at all
            if (active) {
                cell.addEventListener('click', async () => {
                    const wasChecked = checked.has(key);
                    const dateKey = toKey(date);

                    // Optimistic UI update
                    if (wasChecked) {
                        checked.delete(key);
                    } else {
                        checked.set(key, new Date().toISOString());
                    }
                    render();
                    if (typeof renderHeatmap === 'function') renderHeatmap();
                    if (typeof renderDonut === 'function') renderDonut();
                    if (typeof renderMonthlyProgress === 'function') renderMonthlyProgress();
                    if (typeof renderWeeklySummary === 'function') renderWeeklySummary();

                    const data = await apiCall(`/api/habits/${habit.id}/toggle`, 'POST', { date: dateKey });

                    if (!data) {
                        // Roll back on failure
                        if (wasChecked) {
                            checked.set(key, new Date().toISOString());
                        } else {
                            checked.delete(key);
                        }
                        render();
                        if (typeof renderHeatmap === 'function') renderHeatmap();
                        if (typeof renderDonut === 'function') renderDonut();
                        if (typeof renderMonthlyProgress === 'function') renderMonthlyProgress();
                        if (typeof renderWeeklySummary === 'function') renderWeeklySummary();
                    }
                });
            }

            grid.appendChild(cell);
        });
    });

    for (let i = 0; i < 7; i++) {
        const sp = document.createElement('div');
        sp.className = 'add-row-cell';
        grid.appendChild(sp);
    }

    dates.forEach(date => {
        const cnt = document.createElement('div');
        cnt.className = 'count-cell';
        const n = countForDay(date);
        cnt.textContent = n > 0 ? n : '';
        grid.appendChild(cnt);
    });

    // ── RIGHT PANEL ──────────────────────────────────────────
    const panelRight = document.getElementById('panel-right');
    while (panelRight.children.length > 1) panelRight.removeChild(panelRight.lastChild);

    HABITS.forEach(habit => {
        const scheduledDates = dates.filter(d => isScheduledDay(habit, d));
        const done = countCheckedThisWeek(habit.id, scheduledDates);
        const totalScheduled = scheduledDates.length;
        const pct = totalScheduled > 0 ? Math.round((done / totalScheduled) * 100) : 0;

        const row = document.createElement('div');
        row.className = 'progress-row';
        row.innerHTML = `
            <div class="progress-track">
                <div class="progress-fill" style="width:${pct}%; background:${habit.color}"></div>
            </div>
            <span class="progress-label">${done}/${totalScheduled}</span>
        `;
        panelRight.appendChild(row);
    });

    const footer1 = document.createElement('div');
    footer1.className = 'progress-footer';
    panelRight.appendChild(footer1);

    const footer2 = document.createElement('div');
    footer2.className = 'progress-count-footer';
    panelRight.appendChild(footer2);
}

function clearDragOverStyles() {
    document.querySelectorAll('.habit-name-cell').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
}

/* ─── SWATCH / ICON BUILDERS ────────────────────────────── */

function buildColorSwatches(containerId, availableColors, currentSelected, onSelect) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    availableColors.forEach(color => {
        const sw = document.createElement('div');
        sw.className = 'swatch' + (color === currentSelected ? ' selected' : '');
        sw.style.background = color;
        sw.addEventListener('click', () => onSelect(color));
        container.appendChild(sw);
    });
}

function buildIconOptions(containerId, currentSelected, onSelect) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    HABIT_ICONS.forEach(icon => {
        const opt = document.createElement('div');
        opt.className = 'icon-option' + (icon === currentSelected ? ' selected' : '');
        opt.textContent = icon;
        opt.addEventListener('click', () => onSelect(icon));
        container.appendChild(opt);
    });
}

function buildDayToggles(containerId, selectedDays, onToggle) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    DAY_TOGGLE_ORDER.forEach(dayIndex => {
        const pill = document.createElement('div');
        pill.className = 'day-toggle' + (selectedDays.includes(dayIndex) ? ' selected' : '');
        pill.textContent = DAY_TOGGLE_LABELS[dayIndex];
        pill.title = DAY_NAMES[dayIndex];
        pill.addEventListener('click', () => onToggle(dayIndex));
        container.appendChild(pill);
    });
}

/* ─── ADD MODAL ─────────────────────────────────────────── */

function openAddModal() {
    document.getElementById('add-name-input').value = '';
    const available = getAvailableColors();
    addSelectedColor = available[0] || null;
    addSelectedIcon  = HABIT_ICONS[0];
    addSelectedDays  = []; // start blank — user must explicitly pick days

    refreshAddSwatches();
    refreshAddIcons();
    refreshAddDayToggles();

    document.getElementById('add-modal-overlay').classList.add('open');
    document.getElementById('add-name-input').focus();
}

function refreshAddSwatches() {
    const available = getAvailableColors();
    buildColorSwatches('add-color-swatches', available, addSelectedColor, (color) => {
        addSelectedColor = color;
        refreshAddSwatches();
    });
}

function refreshAddIcons() {
    buildIconOptions('add-icon-swatches', addSelectedIcon, (icon) => {
        addSelectedIcon = icon;
        refreshAddIcons();
    });
}

function refreshAddDayToggles() {
    buildDayToggles('add-day-toggles', addSelectedDays, (dayIndex) => {
        addSelectedDays = addSelectedDays.includes(dayIndex)
            ? addSelectedDays.filter(d => d !== dayIndex)
            : [...addSelectedDays, dayIndex];
        refreshAddDayToggles();
    });
}

function closeAddModal() {
    document.getElementById('add-modal-overlay').classList.remove('open');
}

async function confirmAddHabit() {
    const nameInput = document.getElementById('add-name-input');
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    if (!addSelectedColor) return;
    if (addSelectedDays.length === 0) return; // must schedule at least one day

    const data = await apiCall('/api/habits', 'POST', {
        name,
        icon: addSelectedIcon,
        color: addSelectedColor,
        scheduledDays: [...addSelectedDays],
        order: HABITS.length,
    });
    if (!data) return;

    HABITS.push({
        id: data.habit._id,
        label: data.habit.name,
        color: data.habit.color,
        icon: data.habit.icon,
        scheduledDays: (data.habit.scheduledDays && data.habit.scheduledDays.length > 0) ? data.habit.scheduledDays : [...ALL_DAYS],
    });

    closeAddModal();
    render();
    renderHeatmap();
    renderDonut();
    renderMonthlyProgress();
    renderWeeklySummary();
}

document.getElementById('add-modal-cancel').addEventListener('click', closeAddModal);
document.getElementById('add-modal-confirm').addEventListener('click', confirmAddHabit);
document.getElementById('add-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAddModal();
});
document.getElementById('add-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAddHabit();
    if (e.key === 'Escape') closeAddModal();
});

/* ─── EDIT MODAL ────────────────────────────────────────── */

function openEditModal(habitId) {
    const habit = HABITS.find(h => h.id === habitId);
    if (!habit) return;

    editingHabitId    = habitId;
    editSelectedColor = habit.color;
    editSelectedIcon  = habit.icon || HABIT_ICONS[0];
    editSelectedDays  = habit.scheduledDays ? [...habit.scheduledDays] : [...ALL_DAYS];

    document.getElementById('edit-name-input').value = habit.label;

    refreshEditSwatches();
    refreshEditIcons();
    refreshEditDayToggles();

    document.getElementById('edit-modal-overlay').classList.add('open');
    document.getElementById('edit-name-input').focus();
}

function refreshEditSwatches() {
    const available = getAvailableColors(editingHabitId);
    const habit = HABITS.find(h => h.id === editingHabitId);
    const fullList = habit && !available.includes(habit.color)
        ? [habit.color, ...available]
        : available;

    buildColorSwatches('edit-color-swatches', fullList, editSelectedColor, (color) => {
        editSelectedColor = color;
        refreshEditSwatches();
    });
}

function refreshEditIcons() {
    buildIconOptions('edit-icon-swatches', editSelectedIcon, (icon) => {
        editSelectedIcon = icon;
        refreshEditIcons();
    });
}

function refreshEditDayToggles() {
    buildDayToggles('edit-day-toggles', editSelectedDays, (dayIndex) => {
        editSelectedDays = editSelectedDays.includes(dayIndex)
            ? editSelectedDays.filter(d => d !== dayIndex)
            : [...editSelectedDays, dayIndex];
        refreshEditDayToggles();
    });
}

function closeEditModal() {
    document.getElementById('edit-modal-overlay').classList.remove('open');
    editingHabitId = null;
}

async function confirmEditHabit() {
    const nameInput = document.getElementById('edit-name-input');
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    if (editSelectedDays.length === 0) return; // must schedule at least one day

    const habit = HABITS.find(h => h.id === editingHabitId);
    if (!habit) return;

    const data = await apiCall(`/api/habits/${editingHabitId}`, 'PUT', {
        name,
        icon: editSelectedIcon,
        color: editSelectedColor,
        scheduledDays: [...editSelectedDays],
    });
    if (!data) return;

    habit.label = name;
    habit.color = editSelectedColor;
    habit.icon  = editSelectedIcon;
    habit.scheduledDays = [...editSelectedDays];

    closeEditModal();
    render();
    renderHeatmap();
    renderDonut();
    renderMonthlyProgress();
    renderWeeklySummary();
}

async function confirmDeleteHabit() {
    if (!editingHabitId) return;

    const data = await apiCall(`/api/habits/${editingHabitId}`, 'DELETE');
    if (!data) return;

    for (const key of [...checked.keys()]) {
        if (key.startsWith(editingHabitId + '|')) checked.delete(key);
    }
    HABITS = HABITS.filter(h => h.id !== editingHabitId);
    closeEditModal();
    render();
    renderHeatmap();
    renderDonut();
    renderMonthlyProgress();
    renderWeeklySummary();
}

document.getElementById('edit-modal-cancel').addEventListener('click', closeEditModal);
document.getElementById('edit-modal-confirm').addEventListener('click', confirmEditHabit);
document.getElementById('edit-modal-delete').addEventListener('click', confirmDeleteHabit);
document.getElementById('edit-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
});
document.getElementById('edit-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmEditHabit();
    if (e.key === 'Escape') closeEditModal();
});

/* ─── NAV BUTTONS ──────────────────────────────────────── */
document.getElementById('prev-btn').addEventListener('click', () => { weekOffset--; render(); });
document.getElementById('next-btn').addEventListener('click', () => { weekOffset++; render(); });

/* ─── LOGOUT ─────────────────────────────────────────────── */
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

/* ─── THEME TOGGLE ──────────────────────────────────────── */
const htmlRoot = document.getElementById('html-root');

// Persists across visits: whatever theme the person leaves the app in is
// what they see next time they open it. The <head> inline script already
// applies this on load (before first paint) — this just keeps it saved.
function applyTheme(theme) {
    if (theme === 'light') {
        htmlRoot.setAttribute('data-theme', 'light');
    } else {
        htmlRoot.removeAttribute('data-theme');
    }
    try {
        localStorage.setItem('theme', theme === 'light' ? 'light' : 'dark');
    } catch (e) {
        // Storage unavailable (private browsing, etc.) — theme still works
        // for this session, it just won't persist to the next visit.
    }
}

document.getElementById('theme-toggle').addEventListener('click', () => {
    const isLight = htmlRoot.getAttribute('data-theme') === 'light';
    applyTheme(isLight ? 'dark' : 'light');
});

/* ─── MONTHLY OVERVIEW: HEATMAP + DONUT ─────────────────── */

let monthOffset = 0; // 0 = current month, -1 = last month, etc.

function getMonthDate() {
    const t = today();
    return new Date(t.getFullYear(), t.getMonth() + monthOffset, 1);
}

function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

// Semantic status for a given day, based on % of that day's SCHEDULED
// habits completed (habits that don't apply to this weekday are excluded
// entirely from both the count and the denominator). Returns:
//  - { future: true } for days that haven't happened yet
//  - { unscheduled: true } for past days where no habit was scheduled at all
//  - { status, doneCount, total } otherwise, where status is 'none' (0%),
//    'partial' (<75%), 'good' (75-99%), or 'full' (100%)
function getDayHeatInfo(date) {
    if (date > today()) return { future: true };

    const scheduledHabits = HABITS.filter(h => isScheduledDay(h, date));
    const total = scheduledHabits.length;

    if (total === 0) return { unscheduled: true };

    const doneCount = scheduledHabits.filter(h => checked.has(`${h.id}|${toKey(date)}`)).length;
    const fraction = doneCount / total;

    let status;
    if (fraction === 0) status = 'none';
    else if (fraction < 0.75) status = 'partial';
    else if (fraction < 1) status = 'good';
    else status = 'full';

    return { status, doneCount, total };
}

function renderHeatmap() {
    const monthDate = getMonthDate();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();

    document.getElementById('month-label').textContent =
        `${MONTH_NAMES[month]} ${year}`;

    // Weekday header (Mon..Sun)
    const weekdayRow = document.getElementById('heatmap-weekday-row');
    weekdayRow.innerHTML = '';
    ['MON','TUE','WED','THU','FRI','SAT','SUN'].forEach(d => {
        const span = document.createElement('span');
        span.textContent = d;
        weekdayRow.appendChild(span);
    });

    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';

    const firstOfMonth = new Date(year, month, 1);
    // Convert JS getDay() (0=Sun) to Mon-first index (0=Mon..6=Sun)
    const firstWeekdayIndex = (firstOfMonth.getDay() + 6) % 7;

    // Leading empty slots so day 1 lands in the correct weekday column
    for (let i = 0; i < firstWeekdayIndex; i++) {
        const empty = document.createElement('div');
        empty.className = 'heatmap-day empty-slot';
        grid.appendChild(empty);
    }

    const totalDays = daysInMonth(year, month);
    for (let day = 1; day <= totalDays; day++) {
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);
        const info = getDayHeatInfo(date);

        let levelClass, tooltip;
        if (info.future) {
            levelClass = 'status-future';
            tooltip = `${MONTH_NAMES[month]} ${day}, ${year} — upcoming`;
        } else if (info.unscheduled) {
            levelClass = 'status-unscheduled';
            tooltip = `${MONTH_NAMES[month]} ${day}, ${year} — no habits scheduled`;
        } else {
            levelClass = `status-${info.status}`;
            tooltip = `${MONTH_NAMES[month]} ${day}, ${year}: ${info.doneCount}/${info.total} habits done`;
        }

        const cell = document.createElement('div');
        cell.className = `heatmap-day ${levelClass}` + (toKey(date) === toKey(today()) ? ' is-today' : '');
        cell.textContent = day;
        cell.title = tooltip;
        grid.appendChild(cell);
    }
}

document.getElementById('month-prev-btn').addEventListener('click', () => {
    monthOffset--;
    renderHeatmap();
    renderDonut();
    renderMonthlyProgress();
    renderWeeklySummary();
});
document.getElementById('month-next-btn').addEventListener('click', () => {
    monthOffset++;
    renderHeatmap();
    renderDonut();
    renderMonthlyProgress();
    renderWeeklySummary();
});

/* ─── DONUT CHART ───────────────────────────────────────── */

// Each habit's own completion rate for the month currently shown:
// days completed ÷ SCHEDULED days in that month (only weekdays this habit
// applies to). A Mon/Wed/Fri habit in a 31-day month is judged out of
// however many Mon/Wed/Fri's fall in that month, not out of 31.
function getHabitMonthlyRate(habit) {
    const monthDate = getMonthDate();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const totalDaysInMonth = daysInMonth(year, month);

    let doneCount = 0;
    let totalScheduled = 0;
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const date = new Date(year, month, day);
        if (!isScheduledDay(habit, date)) continue;
        totalScheduled++;
        if (checked.has(`${habit.id}|${toKey(date)}`)) doneCount++;
    }

    const rate = totalScheduled > 0 ? doneCount / totalScheduled : 0;
    return { doneCount, totalDays: totalScheduled, rate };
}

function polarToCartesian(cx, cy, r, angleDeg) {
    const angleRad = (angleDeg - 90) * Math.PI / 180;
    return {
        x: cx + r * Math.cos(angleRad),
        y: cy + r * Math.sin(angleRad),
    };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = (endAngle - startAngle) <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function renderDonut() {
    const svg = document.getElementById('donut-chart');
    svg.innerHTML = '';

    const cx = 100, cy = 100, outerR = 90, innerR = 58;
    const trackThickness = outerR - innerR;
    const ringR = (outerR + innerR) / 2;

    if (HABITS.length === 0) {
        const emptyText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        emptyText.setAttribute('x', cx);
        emptyText.setAttribute('y', cy);
        emptyText.setAttribute('text-anchor', 'middle');
        emptyText.setAttribute('fill', 'var(--text-muted)');
        emptyText.setAttribute('font-size', '12');
        emptyText.textContent = 'No habits yet';
        svg.appendChild(emptyText);
    } else {
        // Background track
        const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        track.setAttribute('cx', cx);
        track.setAttribute('cy', cy);
        track.setAttribute('r', ringR);
        track.setAttribute('fill', 'none');
        track.setAttribute('stroke', 'var(--overlay-2)');
        track.setAttribute('stroke-width', trackThickness);
        svg.appendChild(track);

        // One arc segment per habit, sized by its own completion rate,
        // sequentially placed around the ring so each habit gets a slice
        // proportional to its rate relative to the combined total.
        const rates = HABITS.map(h => {
            const { rate } = getHabitMonthlyRate(h);
            return { habit: h, rate };
        });
        const totalRate = rates.reduce((sum, r) => sum + r.rate, 0);

        let angleCursor = 0;
        rates.forEach(({ habit, rate }) => {
            if (totalRate === 0 || rate === 0) return;
            const sweep = (rate / totalRate) * 360;
            const startAngle = angleCursor;
            const endAngle = angleCursor + sweep;
            angleCursor = endAngle;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', describeArc(cx, cy, ringR, startAngle, endAngle - 1.5));
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', habit.color);
            path.setAttribute('stroke-width', trackThickness);
            path.setAttribute('stroke-linecap', 'round');
            svg.appendChild(path);
        });

        // Center label: overall average completion across habits
        const avgPct = totalRate > 0
            ? Math.round((rates.reduce((s, r) => s + r.rate, 0) / rates.length) * 100)
            : 0;

        const centerPct = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        centerPct.setAttribute('x', cx);
        centerPct.setAttribute('y', cy - 2);
        centerPct.setAttribute('text-anchor', 'middle');
        centerPct.setAttribute('fill', 'var(--text-primary)');
        centerPct.setAttribute('font-size', '22');
        centerPct.setAttribute('font-weight', '700');
        centerPct.setAttribute('font-family', 'Sora, sans-serif');
        centerPct.textContent = `${avgPct}%`;
        svg.appendChild(centerPct);

        const centerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        centerLabel.setAttribute('x', cx);
        centerLabel.setAttribute('y', cy + 16);
        centerLabel.setAttribute('text-anchor', 'middle');
        centerLabel.setAttribute('fill', 'var(--text-secondary)');
        centerLabel.setAttribute('font-size', '10');
        centerLabel.textContent = 'avg complete';
        svg.appendChild(centerLabel);
    }

    // Vertical habit list: color dot + name + percentage
    const list = document.getElementById('donut-habit-list');
    list.innerHTML = '';

    HABITS.forEach(habit => {
        const { rate } = getHabitMonthlyRate(habit);
        const pct = Math.round(rate * 100);

        const row = document.createElement('div');
        row.className = 'donut-habit-row';
        row.innerHTML = `
            <span class="donut-habit-dot" style="background:${habit.color}"></span>
            <span class="donut-habit-name">${habit.label}</span>
            <span class="donut-habit-pct">${pct}%</span>
        `;
        list.appendChild(row);
    });
}

/* ─── MONTHLY PROGRESS BARS (under the Monthly Habits donut) ───
   One bar per habit, same formula as the donut: days completed ÷
   total days in the month currently shown. Sits inside the same
   monthly-donut-panel card, just below the donut + legend list. */
function renderMonthlyProgress() {
    const container = document.getElementById('monthly-progress-list');
    if (!container) return;
    container.innerHTML = '';

    if (HABITS.length === 0) return;

    HABITS.forEach(habit => {
        const { doneCount, totalDays, rate } = getHabitMonthlyRate(habit);
        const pct = Math.round(rate * 100);

        const row = document.createElement('div');
        row.className = 'monthly-progress-row';
        row.innerHTML = `
            <span class="monthly-progress-name">${habit.icon || ''} ${habit.label}</span>
            <div class="monthly-progress-track">
                <div class="monthly-progress-fill" style="width:${pct}%; background:${habit.color}"></div>
            </div>
            <span class="monthly-progress-count">${doneCount}/${totalDays}</span>
        `;
        container.appendChild(row);
    });
}

/* ─── WEEKLY SUMMARY ────────────────────────────────────── */

// Longest active streak for a single habit, counted backward from today
// using ALL checked history (not limited to the visible week/month window).
// Days that aren't part of the habit's schedule are skipped over rather
// than breaking the streak — only a missed SCHEDULED day ends it.
function getHabitCurrentStreak(habit) {
    let streak = 0;
    let cursor = today();

    while (true) {
        if (!isScheduledDay(habit, cursor)) {
            cursor = addDays(cursor, -1);
            continue;
        }
        if (checked.has(`${habit.id}|${toKey(cursor)}`)) {
            streak++;
            cursor = addDays(cursor, -1);
        } else {
            break;
        }
    }
    return streak;
}

// A habit's completion rate over a fixed rolling 7-calendar-day window
// ending today, counting only days that are part of the habit's schedule.
// A Mon/Wed/Fri habit is judged out of however many of those fall in the
// last 7 days, not out of 7.
function getHabitRolling7DayRate(habit) {
    let doneCount = 0;
    let totalScheduled = 0;
    for (let i = 0; i < 7; i++) {
        const date = addDays(today(), -i);
        if (!isScheduledDay(habit, date)) continue;
        totalScheduled++;
        if (checked.has(`${habit.id}|${toKey(date)}`)) doneCount++;
    }
    const rate = totalScheduled > 0 ? doneCount / totalScheduled : 0;
    return { doneCount, daysElapsed: totalScheduled, rate };
}

const NEEDS_ATTENTION_THRESHOLD = 0.5; // below 50% over the last 7 days = flagged

// Weeks for the trend chart: month-anchored, resetting each month —
// "Week 1" is the first Mon-Sun week touching the displayed month,
// through however many weeks that month actually spans (4 or 5). The
// CURRENT week (when viewing the actual current month) just reflects
// whatever's checked off so far, updating live day by day.
function getTrendMonthDate() {
    const t = today();
    return new Date(t.getFullYear(), t.getMonth() + trendMonthOffset, 1);
}

function getTrendWeekMetas() {
    const monthDate = getTrendMonthDate();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const lastOfMonth = new Date(year, month + 1, 0);

    const firstOfMonth = new Date(year, month, 1);
    const firstDow = firstOfMonth.getDay(); // 0=Sun..6=Sat
    const distToMonday = (firstDow === 0) ? -6 : 1 - firstDow;
    const week1Start = addDays(firstOfMonth, distToMonday);

    const metas = [];
    let weekStart = week1Start;
    let weekNum = 1;
    while (weekStart <= lastOfMonth) {
        metas.push({
            label: `Week ${weekNum}`,
            dates: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        });
        weekStart = addDays(weekStart, 7);
        weekNum++;
    }

    return metas;
}

// A single habit's completion rate for one set of 7 dates, respecting its
// own schedule (a Mon/Wed/Fri habit is judged out of its own scheduled
// days within that week, not out of 7).
function getHabitWeeklyRate(habit, dates) {
    const scheduledDates = dates.filter(d => isScheduledDay(habit, d));
    const done = countCheckedThisWeek(habit.id, scheduledDates);
    return scheduledDates.length > 0 ? done / scheduledDates.length : 0;
}

// Builds the series to plot: one entry per habit if "All Habits" is
// selected, or a single entry for just the selected habit. Each entry
// carries its own color and one percentage per week meta (count varies:
// "Last Week" plus however many weeks the current month spans, 4 or 5).
function getTrendSeries() {
    const weekMetas = getTrendWeekMetas();
    const targets = trendSelectedHabitId === 'all'
        ? HABITS
        : HABITS.filter(h => h.id === trendSelectedHabitId);

    return targets.map(habit => ({
        habit,
        points: weekMetas.map(w => Math.round(getHabitWeeklyRate(habit, w.dates) * 100)),
    }));
}

function renderWeeklySummary() {
    const container = document.getElementById('summary-stats-grid');
    container.innerHTML = '';

    if (HABITS.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'summary-stat';
        empty.innerHTML = `
            <div class="summary-stat-icon">👋</div>
            <div class="summary-stat-body">
                <span class="summary-stat-label">Get Started</span>
                <span class="summary-stat-value">No habits yet</span>
                <span class="summary-stat-sub">Add one to see your summary</span>
            </div>
        `;
        container.appendChild(empty);
        return;
    }

    // ── 1. Current Streak: best individual habit's active streak ──────
    const streaks = HABITS.map(h => ({ habit: h, streak: getHabitCurrentStreak(h) }));
    const topStreak = streaks.reduce((best, cur) => cur.streak > best.streak ? cur : best, streaks[0]);

    const streakBlock = document.createElement('div');
    streakBlock.className = 'summary-stat';
    streakBlock.innerHTML = topStreak.streak > 0 ? `
        <div class="summary-stat-icon icon-streak">🔥</div>
        <div class="summary-stat-body">
            <span class="summary-stat-label">Current Streak</span>
            <span class="summary-stat-value value-streak">${topStreak.streak} day${topStreak.streak === 1 ? '' : 's'}</span>
            <span class="summary-stat-sub">${topStreak.habit.icon || ''} ${topStreak.habit.label}</span>
        </div>
    ` : `
        <div class="summary-stat-icon icon-streak">🔥</div>
        <div class="summary-stat-body">
            <span class="summary-stat-label">Current Streak</span>
            <span class="summary-stat-value">No streak yet</span>
            <span class="summary-stat-sub">Check off a habit to start one</span>
        </div>
    `;
    container.appendChild(streakBlock);

    // ── 2. Best Habit: highest completion rate over the last 7 days ───
    const weekRates = HABITS.map(h => ({ habit: h, ...getHabitRolling7DayRate(h) }));
    const topHabit = weekRates.reduce((best, cur) => cur.rate > best.rate ? cur : best, weekRates[0]);
    const topPct = Math.round(topHabit.rate * 100);

    const bestBlock = document.createElement('div');
    bestBlock.className = 'summary-stat';
    bestBlock.innerHTML = topHabit.doneCount > 0 ? `
        <div class="summary-stat-icon icon-best">🏆</div>
        <div class="summary-stat-body">
            <span class="summary-stat-label">Best Habit</span>
            <span class="summary-stat-value value-best">${topPct}% past 7 days</span>
            <span class="summary-stat-sub">${topHabit.habit.icon || ''} ${topHabit.habit.label}</span>
        </div>
    ` : `
        <div class="summary-stat-icon icon-best">🏆</div>
        <div class="summary-stat-body">
            <span class="summary-stat-label">Best Habit</span>
            <span class="summary-stat-value">No data yet</span>
            <span class="summary-stat-sub">Check off a habit to see stats</span>
        </div>
    `;
    container.appendChild(bestBlock);

    // ── 3. Needs Attention: the single worst habit, if any, under threshold ──
    const laggingHabits = weekRates
        .filter(r => r.rate < NEEDS_ATTENTION_THRESHOLD)
        .sort((a, b) => a.rate - b.rate);
    const worst = laggingHabits[0];

    const attentionBlock = document.createElement('div');
    attentionBlock.className = 'summary-stat';

    if (!worst) {
        attentionBlock.innerHTML = `
            <div class="summary-stat-icon icon-ok">✅</div>
            <div class="summary-stat-body">
                <span class="summary-stat-label">Needs Attention</span>
                <span class="summary-stat-value value-ok">You're on track!</span>
                <span class="summary-stat-sub">All habits above 50% this week</span>
            </div>
        `;
    } else {
        const pct = Math.round(worst.rate * 100);
        attentionBlock.innerHTML = `
            <div class="summary-stat-icon icon-warn">⚠️</div>
            <div class="summary-stat-body">
                <span class="summary-stat-label">Needs Attention</span>
                <span class="summary-stat-value value-warn">${pct}% past 7 days</span>
                <span class="summary-stat-sub">${worst.habit.icon || ''} ${worst.habit.label}</span>
            </div>
        `;
    }
    container.appendChild(attentionBlock);

    renderTrendChart();
}

/* ─── 4-WEEK TREND CHART ─────────────────────────────────── */

// Keeps the habit dropdown's options current and falls back to "All
// Habits" if the previously-selected habit was deleted.
function refreshTrendHabitSelect() {
    const select = document.getElementById('trend-habit-select');
    if (!select) return;

    if (trendSelectedHabitId !== 'all' && !HABITS.some(h => h.id === trendSelectedHabitId)) {
        trendSelectedHabitId = 'all';
    }

    select.innerHTML = '<option value="all">All Habits</option>' +
        HABITS.map(h => `<option value="${h.id}">${h.icon || ''} ${h.label}</option>`).join('');
    select.value = trendSelectedHabitId;
}

// Color-key legend — only meaningful when multiple colored series share
// one chart (i.e. "All Habits" with more than one habit).
function renderTrendLegend(series) {
    const container = document.getElementById('trend-legend');
    if (!container) return;
    container.innerHTML = '';

    if (trendSelectedHabitId !== 'all' || series.length <= 1) return;

    series.forEach(s => {
        const item = document.createElement('span');
        item.className = 'trend-legend-item';
        item.innerHTML = `<span class="trend-legend-dot" style="background:${s.habit.color}"></span>${s.habit.icon || ''} ${s.habit.label}`;
        container.appendChild(item);
    });
}

// "vs last week" badge: most recent week minus the one before it,
// averaged across whatever series is currently displayed (so it stays
// meaningful whether "All Habits" or a single habit is selected). Uses
// the last two points dynamically since the chart's point count now
// varies (4 or 5 weeks depending on the month, plus the leading
// "Last Week" continuity point).
function renderTrendDelta(series) {
    const badge = document.getElementById('trend-delta');
    if (!badge) return;

    if (series.length === 0 || series[0].points.length < 2) {
        badge.textContent = '';
        badge.className = 'trend-delta';
        return;
    }

    const lastIdx = series[0].points.length - 1;
    const avgThisWeek = series.reduce((sum, s) => sum + s.points[lastIdx], 0) / series.length;
    const avgLastWeek = series.reduce((sum, s) => sum + s.points[lastIdx - 1], 0) / series.length;
    const delta = Math.round(avgThisWeek - avgLastWeek);

    if (delta > 0) {
        badge.textContent = `▲ ${delta}pp vs last week`;
        badge.className = 'trend-delta trend-delta-up';
    } else if (delta < 0) {
        badge.textContent = `▼ ${Math.abs(delta)}pp vs last week`;
        badge.className = 'trend-delta trend-delta-down';
    } else {
        badge.textContent = `— no change vs last week`;
        badge.className = 'trend-delta trend-delta-flat';
    }
}

function renderTrendChart() {
    refreshTrendHabitSelect();

    // Month nav: label + disable paging into the future
    const monthDate = getTrendMonthDate();
    const monthLabelEl = document.getElementById('trend-month-label');
    if (monthLabelEl) monthLabelEl.textContent = `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
    const nextBtn = document.getElementById('trend-month-next-btn');
    if (nextBtn) nextBtn.disabled = trendMonthOffset >= 0;

    const svg = document.getElementById('trend-chart');
    if (!svg) return;
    svg.innerHTML = '';

    const weekMetas = getTrendWeekMetas(); // this month's weeks, oldest to newest
    const series = getTrendSeries();
    renderTrendLegend(series);
    renderTrendDelta(series);

    const svgNS = 'http://www.w3.org/2000/svg';
    const isRadar = trendChartType === 'radar';
    const width = 440, height = isRadar ? 260 : 220;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    if (series.length === 0) {
        const emptyText = document.createElementNS(svgNS, 'text');
        emptyText.setAttribute('x', width / 2);
        emptyText.setAttribute('y', height / 2);
        emptyText.setAttribute('text-anchor', 'middle');
        emptyText.setAttribute('fill', 'var(--text-muted)');
        emptyText.setAttribute('font-size', '12');
        emptyText.textContent = 'No habits yet';
        svg.appendChild(emptyText);
        return;
    }

    if (isRadar) {
        renderRadarChart(svg, svgNS, weekMetas, series, width, height);
        return;
    }

    const margin = { top: 16, right: 16, bottom: 32, left: 40 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const n = weekMetas.length;

    const yForPct = (pct) => margin.top + plotH - (pct / 100) * plotH;
    // Point charts (line/scatter) anchor exactly at the plot edges.
    const xForIndex = (i) => margin.left + (i / (n - 1)) * plotW;
    // Histogram uses equal-width slots instead — bar GROUPS need edge
    // padding that a single point doesn't, or the first/last group
    // crowds the axis and drifts out from under its own week label.
    const slotW = plotW / n;
    const xForSlot = (i) => margin.left + slotW * (i + 0.5);
    const isHistogram = trendChartType === 'histogram';
    const xForWeek = isHistogram ? xForSlot : xForIndex;

    // Horizontal gridlines + y-axis % labels
    [0, 20, 40, 60, 80, 100].forEach(pct => {
        const y = yForPct(pct);

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
        label.textContent = `${pct}%`;
        svg.appendChild(label);
    });

    // X-axis week labels — point charts shift anchor at the ends so
    // "Week 1"/"Week N" don't clip off the canvas; histogram always
    // centers, since its slots already include edge padding.
    weekMetas.forEach((w, i) => {
        const x = xForWeek(i);
        const anchor = isHistogram ? 'middle' : (i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle'));

        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', height - 10);
        label.setAttribute('text-anchor', anchor);
        label.setAttribute('fill', 'var(--text-secondary)');
        label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', '500');
        label.textContent = w.label;
        svg.appendChild(label);
    });

    const showValueLabels = series.length === 1;

    if (trendChartType === 'histogram') {
        // Grouped bars: each week gets one bar per series, side by side.
        // (Stacking wouldn't make sense here — each habit's % is
        // independent, not part of a combined whole.)
        const barGap = 3;
        const groupMaxWidth = slotW * 0.7;
        const barWidth = Math.max(4, (groupMaxWidth - barGap * (series.length - 1)) / series.length);
        const baseline = yForPct(0);

        for (let i = 0; i < n; i++) {
            const groupWidth = series.length * barWidth + (series.length - 1) * barGap;
            const groupStartX = xForSlot(i) - groupWidth / 2;

            series.forEach((s, si) => {
                const pct = s.points[i];
                const barY = yForPct(pct);
                const barX = groupStartX + si * (barWidth + barGap);

                const rect = document.createElementNS(svgNS, 'rect');
                rect.setAttribute('x', barX);
                rect.setAttribute('y', barY);
                rect.setAttribute('width', barWidth);
                rect.setAttribute('height', Math.max(0, baseline - barY));
                rect.setAttribute('rx', 2);
                rect.setAttribute('fill', s.habit.color);

                const title = document.createElementNS(svgNS, 'title');
                title.textContent = `${s.habit.label} — ${weekMetas[i].label}: ${pct}%`;
                rect.appendChild(title);

                svg.appendChild(rect);

                if (showValueLabels) {
                    svg.appendChild(makeValueLabel(svgNS, barX + barWidth / 2, barY - 6, pct));
                }
            });
        }
    } else {
        // Scatter and line share the same per-series point math
        series.forEach(s => {
            const points = s.points.map((pct, i) => ({ x: xForIndex(i), y: yForPct(pct), pct }));

            if (trendChartType === 'line') {
                const path = document.createElementNS(svgNS, 'path');
                const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                path.setAttribute('d', d);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', s.habit.color);
                path.setAttribute('stroke-width', '2');
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                svg.appendChild(path);

                if (showValueLabels) {
                    points.forEach(p => svg.appendChild(makeValueLabel(svgNS, p.x, p.y - 10, p.pct)));
                }
            } else {
                // scatter
                points.forEach((p, i) => {
                    const dot = document.createElementNS(svgNS, 'circle');
                    dot.setAttribute('cx', p.x);
                    dot.setAttribute('cy', p.y);
                    dot.setAttribute('r', '5');
                    dot.setAttribute('fill', s.habit.color);
                    dot.setAttribute('stroke', 'var(--surface-bg)');
                    dot.setAttribute('stroke-width', '2');

                    const title = document.createElementNS(svgNS, 'title');
                    title.textContent = `${s.habit.label} — ${weekMetas[i].label}: ${p.pct}%`;
                    dot.appendChild(title);

                    svg.appendChild(dot);

                    if (showValueLabels) {
                        svg.appendChild(makeValueLabel(svgNS, p.x, p.y - 12, p.pct));
                    }
                });
            }
        });
    }
}

// Small "34%" text label used above bars/points — only shown when a single
// habit's series is on screen, since labeling every point with 6+ habits
// overlapping would just create clutter instead of clarity.
function makeValueLabel(svgNS, x, y, pct) {
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', y);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', 'var(--text-secondary)');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-weight', '600');
    label.textContent = `${pct}%`;
    return label;
}

// Radar/spider chart: one axis per week (evenly spaced around a circle),
// one polygon per series. Reuses polarToCartesian (already defined above
// for the donut chart) — angle 0 there points straight up, so axis i sits
// at (360/n)*i degrees around the circle.
function renderRadarChart(svg, svgNS, weekMetas, series, width, height) {
    const n = weekMetas.length;
    const cx = width / 2;
    const cy = height / 2 + 6;
    const maxRadius = Math.min(width, height) / 2 - 48;
    const showValueLabels = series.length === 1;

    // Concentric rings at 25/50/75/100%, with % labels stacked up the top axis
    [25, 50, 75, 100].forEach(pct => {
        const r = (pct / 100) * maxRadius;
        const ringPoints = [];
        for (let i = 0; i < n; i++) {
            const p = polarToCartesian(cx, cy, r, (360 / n) * i);
            ringPoints.push(`${p.x},${p.y}`);
        }
        const ring = document.createElementNS(svgNS, 'polygon');
        ring.setAttribute('points', ringPoints.join(' '));
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', 'var(--overlay-2)');
        ring.setAttribute('stroke-width', '1');
        svg.appendChild(ring);

        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', cx + 4);
        label.setAttribute('y', cy - r - 2);
        label.setAttribute('text-anchor', 'start');
        label.setAttribute('fill', 'var(--text-muted)');
        label.setAttribute('font-size', '9');
        label.textContent = `${pct}%`;
        svg.appendChild(label);
    });

    // Axis lines + week labels
    for (let i = 0; i < n; i++) {
        const angle = (360 / n) * i;
        const edge = polarToCartesian(cx, cy, maxRadius, angle);

        const axisLine = document.createElementNS(svgNS, 'line');
        axisLine.setAttribute('x1', cx);
        axisLine.setAttribute('y1', cy);
        axisLine.setAttribute('x2', edge.x);
        axisLine.setAttribute('y2', edge.y);
        axisLine.setAttribute('stroke', 'var(--overlay-2)');
        axisLine.setAttribute('stroke-width', '1');
        svg.appendChild(axisLine);

        const labelPos = polarToCartesian(cx, cy, maxRadius + 20, angle);
        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', labelPos.x);
        label.setAttribute('y', labelPos.y);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', 'var(--text-secondary)');
        label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', '500');
        label.textContent = weekMetas[i].label;
        svg.appendChild(label);
    }

    // One polygon (+ vertex dots) per series
    series.forEach(s => {
        const pts = s.points.map((pct, i) => polarToCartesian(cx, cy, (pct / 100) * maxRadius, (360 / n) * i));

        const polygon = document.createElementNS(svgNS, 'polygon');
        polygon.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
        polygon.setAttribute('fill', s.habit.color);
        polygon.setAttribute('fill-opacity', '0.15');
        polygon.setAttribute('stroke', s.habit.color);
        polygon.setAttribute('stroke-width', '2');
        polygon.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(polygon);

        pts.forEach((p, i) => {
            const dot = document.createElementNS(svgNS, 'circle');
            dot.setAttribute('cx', p.x);
            dot.setAttribute('cy', p.y);
            dot.setAttribute('r', '4');
            dot.setAttribute('fill', s.habit.color);
            dot.setAttribute('stroke', 'var(--surface-bg)');
            dot.setAttribute('stroke-width', '1.5');

            const title = document.createElementNS(svgNS, 'title');
            title.textContent = `${s.habit.label} — ${weekMetas[i].label}: ${s.points[i]}%`;
            dot.appendChild(title);

            svg.appendChild(dot);

            if (showValueLabels) {
                svg.appendChild(makeValueLabel(svgNS, p.x, p.y - 10, s.points[i]));
            }
        });
    });
}

const trendChartTypeSelectEl = document.getElementById('trend-chart-type-select');
if (trendChartTypeSelectEl) {
    trendChartTypeSelectEl.value = trendChartType;
    trendChartTypeSelectEl.addEventListener('change', (e) => {
        trendChartType = e.target.value;
        renderTrendChart();
    });
}

const trendHabitSelectEl = document.getElementById('trend-habit-select');
if (trendHabitSelectEl) {
    trendHabitSelectEl.addEventListener('change', (e) => {
        trendSelectedHabitId = e.target.value;
        renderTrendChart();
    });
}

const trendMonthPrevBtn = document.getElementById('trend-month-prev-btn');
if (trendMonthPrevBtn) {
    trendMonthPrevBtn.addEventListener('click', () => {
        trendMonthOffset--;
        renderTrendChart();
    });
}
const trendMonthNextBtn = document.getElementById('trend-month-next-btn');
if (trendMonthNextBtn) {
    trendMonthNextBtn.addEventListener('click', () => {
        if (trendMonthOffset < 0) {
            trendMonthOffset++;
            renderTrendChart();
        }
    });
}

/* ─── INIT ──────────────────────────────────────────────── */

async function init() {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');

    if (!accessToken) {
        window.location.href = 'index.html';
        return;
    }

    // Show the Admin button only for admins. Falls back to hidden if the
    // stored user object is missing/malformed rather than throwing.
    try {
        const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
        if (storedUser && storedUser.role === 'admin') {
            const adminBtn = document.getElementById('admin-btn');
            if (adminBtn) {
                adminBtn.style.display = 'flex';
                adminBtn.addEventListener('click', () => {
                    window.location.href = 'admin.html';
                });
            }
        }
    } catch (e) {
        // Malformed localStorage — just leave the button hidden.
    }

    startHeartbeat();

    await loadHabits();
    render();
    renderHeatmap();
    renderDonut();
    renderMonthlyProgress();
    renderWeeklySummary();
}

init();