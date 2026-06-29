/* ─── DATA ────────────────────────────────────────────────── */

const HABIT_COLORS = [
    '#34d399', // emerald
    '#60a5fa', // blue
    '#f59e0b', // amber
    '#a78bfa', // purple
    '#22d3ee', // cyan
    '#f472b6', // pink
    '#fb923c', // orange
    '#facc15', // yellow
    '#e879f9', // fuchsia
    '#4ade80', // lime
    '#f87171', // red
    '#38bdf8', // sky
    '#818cf8', // indigo
    '#34d399', // teal (distinct shade)
    '#fb7185', // rose
    '#a3e635', // yellow-green
    '#2dd4bf', // teal
    '#c084fc', // violet
    '#fdba74', // peach
    '#6ee7b7', // mint
];

// Deduplicate in case of any overlap
const UNIQUE_COLORS = [...new Set(HABIT_COLORS)];

let HABITS = [
    { id: 'gym',    label: 'Go to the gym', color: '#34d399' },
    { id: 'lunch',  label: 'Eat lunch',     color: '#60a5fa' },
    { id: 'dinner', label: 'Cook dinner',   color: '#f59e0b' },
    { id: 'read',   label: 'Read 10 pages', color: '#a78bfa' },
    { id: 'water',  label: 'Drink water',   color: '#22d3ee' },
];

const checked = new Set();
let weekOffset = 0;

// Modal state
let addSelectedColor  = null;
let editSelectedColor = null;
let editingHabitId    = null;

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

function getWeekDates() {
    const t = today();
    const dayOfWeek = t.getDay();
    const distToMonday = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
    const monday = addDays(t, distToMonday + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function uniqueId() {
    return 'habit-' + Date.now();
}

const DAY_NAMES   = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ─── COLOR HELPERS ─────────────────────────────────────── */

// Colors not used by any habit (optionally exclude one habit's own color for edit mode)
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
        cell.innerHTML = `
            <span class="habit-dot" style="background:${habit.color}"></span>
            <span class="habit-name-text">${habit.label}</span>
            <svg class="habit-edit-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M9 2l2 2-6.5 6.5L2 11l.5-2.5L9 2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        cell.addEventListener('click', () => openEditModal(habit.id));
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
    grid.style.gridTemplateColumns = `repeat(7, 1fr)`;

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
            const cell = document.createElement('div');
            cell.className = `day-cell${isChecked ? ' checked' : ' empty'}`;

            const fill = document.createElement('div');
            fill.className = 'cell-fill';
            fill.style.background = habit.color;
            cell.appendChild(fill);

            cell.addEventListener('click', () => {
                if (checked.has(key)) checked.delete(key);
                else checked.add(key);
                render();
            });

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
        const done = countCheckedThisWeek(habit.id, dates);
        const pct  = Math.round((done / 7) * 100);

        const row = document.createElement('div');
        row.className = 'progress-row';
        row.innerHTML = `
            <div class="progress-track">
                <div class="progress-fill" style="width:${pct}%; background:${habit.color}"></div>
            </div>
            <span class="progress-label">${done}/7</span>
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

/* ─── SWATCH BUILDER ────────────────────────────────────── */

function buildSwatches(containerId, availableColors, currentSelected, onSelect) {
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

/* ─── ADD MODAL ─────────────────────────────────────────── */

function openAddModal() {
    document.getElementById('add-name-input').value = '';
    const available = getAvailableColors();
    addSelectedColor = available[0] || null;
    buildSwatches('add-color-swatches', available, addSelectedColor, (color) => {
        addSelectedColor = color;
        buildSwatches('add-color-swatches', available, addSelectedColor, arguments.callee);
    });
    // Rebuild with proper closure
    refreshAddSwatches();
    document.getElementById('add-modal-overlay').classList.add('open');
    document.getElementById('add-name-input').focus();
}

function refreshAddSwatches() {
    const available = getAvailableColors();
    buildSwatches('add-color-swatches', available, addSelectedColor, (color) => {
        addSelectedColor = color;
        refreshAddSwatches();
    });
}

function closeAddModal() {
    document.getElementById('add-modal-overlay').classList.remove('open');
}

function confirmAddHabit() {
    const nameInput = document.getElementById('add-name-input');
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    if (!addSelectedColor) return;
    HABITS.push({ id: uniqueId(), label: name, color: addSelectedColor });
    closeAddModal();
    render();
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

    document.getElementById('edit-name-input').value = habit.label;

    // Available = unused colors + this habit's own current color
    refreshEditSwatches();

    document.getElementById('edit-modal-overlay').classList.add('open');
    document.getElementById('edit-name-input').focus();
}

function refreshEditSwatches() {
    // Exclude this habit's id so its own color shows as available
    const available = getAvailableColors(editingHabitId);
    // Always include the habit's current color at the front
    const habit = HABITS.find(h => h.id === editingHabitId);
    const fullList = habit && !available.includes(habit.color)
        ? [habit.color, ...available]
        : available;

    buildSwatches('edit-color-swatches', fullList, editSelectedColor, (color) => {
        editSelectedColor = color;
        refreshEditSwatches();
    });
}

function closeEditModal() {
    document.getElementById('edit-modal-overlay').classList.remove('open');
    editingHabitId = null;
}

function confirmEditHabit() {
    const nameInput = document.getElementById('edit-name-input');
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    const habit = HABITS.find(h => h.id === editingHabitId);
    if (!habit) return;

    habit.label = name;
    habit.color = editSelectedColor;

    closeEditModal();
    render();
}

function confirmDeleteHabit() {
    if (!editingHabitId) return;
    // Remove all checked entries for this habit
    for (const key of [...checked]) {
        if (key.startsWith(editingHabitId + '|')) checked.delete(key);
    }
    HABITS = HABITS.filter(h => h.id !== editingHabitId);
    closeEditModal();
    render();
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

/* ─── INIT ──────────────────────────────────────────────── */
render();