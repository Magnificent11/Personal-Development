const API_URL = 'http://localhost:5000';
let accessToken = null;
let refreshToken = null;
let currentUser = null;

// Data storage - now fetched from MongoDB
let goals = [];
let habits = [];
let journal = [];

// Check authentication on page load
window.onload = function() {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
    
    if (!accessToken) {
        window.location.href = 'index.html';
        return;
    }
    
    verifyTokenAndLoadData();
    updateDate();
    setupNavigation();
};

// Verify token and load user data
async function verifyTokenAndLoadData() {
    try {
        const response = await fetch(`${API_URL}/api/protected/profile`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            displayUserInfo();
            loadDashboardData();
        } else {
            // Token expired, redirect to login
            localStorage.clear();
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.clear();
        window.location.href = 'index.html';
    }
}

// Display user information
function displayUserInfo() {
    if (!currentUser) return;
    
    const fullName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
    const username = currentUser.username || '';
    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase() || username[0].toUpperCase();
    
    document.getElementById('sidebarUserName').textContent = fullName || username;
    document.getElementById('sidebarUsername').textContent = `@${username}`;
    document.getElementById('userAvatar').textContent = initials;
}

// Update current date
function updateDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', options);
}

// Setup navigation
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            switchSection(section);
        });
    });
}

// Switch between sections
function switchSection(sectionName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === sectionName) {
            item.classList.add('active');
        }
    });

    // Update content
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionName).classList.add('active');

    // Update page title
    const titles = {
        overview: 'Overview',
        goals: 'My Goals',
        habits: 'Daily Habits',
        journal: 'Journal',
        progress: 'Progress'
    };
    
    const subtitles = {
        overview: "Welcome back! Here's your progress today.",
        goals: 'Set and track your personal goals',
        habits: 'Build positive habits day by day',
        journal: 'Reflect on your journey',
        progress: 'See how far you\'ve come'
    };

    document.getElementById('pageTitle').textContent = titles[sectionName] || sectionName;
    document.getElementById('pageSubtitle').textContent = subtitles[sectionName] || '';
}

// Load dashboard data from MongoDB
async function loadDashboardData() {
    await Promise.all([
        loadGoals(),
        loadHabits(),
        loadJournal()
    ]);
    
    updateStats();
}

// Update statistics
function updateStats() {
    document.getElementById('activeGoals').textContent = goals.filter(g => !g.completed).length;
    
    // Check which habits are completed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const completedToday = habits.filter(habit => {
        return habit.completedDates && habit.completedDates.some(date => {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
        });
    }).length;
    
    document.getElementById('habitsCompleted').textContent = completedToday;
    document.getElementById('currentStreak').textContent = calculateStreak();
    document.getElementById('journalEntries').textContent = journal.length;
}

// Calculate habit streak
function calculateStreak() {
    if (habits.length === 0) return 0;
    
    // Simple streak calculation - count consecutive days with at least one habit completed
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if any habit was completed today
    const completedToday = habits.some(habit => {
        return habit.completedDates && habit.completedDates.some(date => {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
        });
    });
    
    if (completedToday) streak = 1;
    
    // Check previous days
    for (let i = 1; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        
        const completedOnDate = habits.some(habit => {
            return habit.completedDates && habit.completedDates.some(date => {
                const d = new Date(date);
                d.setHours(0, 0, 0, 0);
                return d.getTime() === checkDate.getTime();
            });
        });
        
        if (completedOnDate) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}

// API Helper function
async function apiCall(endpoint, method = 'GET', body = null) {
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
            // Token expired, redirect to login
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

// Load Goals from MongoDB
async function loadGoals() {
    const data = await apiCall('/api/goals');
    if (data) {
        goals = data.goals;
        renderGoals();
    }
}

// Load Habits from MongoDB
async function loadHabits() {
    const data = await apiCall('/api/habits');
    if (data) {
        habits = data.habits;
        renderHabits();
    }
}

// Load Journal from MongoDB
async function loadJournal() {
    const data = await apiCall('/api/journals');
    if (data) {
        journal = data.journals;
        renderJournal();
    }
}

// Goal Management
function openGoalModal() {
    document.getElementById('goalModal').classList.add('active');
}

function closeGoalModal() {
    document.getElementById('goalModal').classList.remove('active');
    document.getElementById('goalTitle').value = '';
    document.getElementById('goalDescription').value = '';
    document.getElementById('goalDeadline').value = '';
}

function handleAddGoal(event) {
    event.preventDefault();
    
    const goalData = {
        title: document.getElementById('goalTitle').value,
        description: document.getElementById('goalDescription').value,
        deadline: document.getElementById('goalDeadline').value
    };
    
    apiCall('/api/goals', 'POST', goalData).then(data => {
        if (data) {
            loadGoals();
            updateStats();
            closeGoalModal();
        }
    });
}

function renderGoals() {
    const container = document.getElementById('goalsGrid');
    
    if (goals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🎯</span>
                <p>No goals yet. Create your first goal!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = goals.map(goal => `
        <div class="goal-card">
            <div class="goal-header">
                <h3 class="goal-title">${goal.title}</h3>
                <span class="goal-status ${goal.completed ? 'completed' : 'active'}">
                    ${goal.completed ? 'Completed' : 'Active'}
                </span>
            </div>
            <p class="goal-description">${goal.description || 'No description'}</p>
            <p class="goal-deadline">Target: ${new Date(goal.deadline).toLocaleDateString()}</p>
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                ${!goal.completed ? `
                    <button class="btn-primary" style="flex: 1; padding: 8px;" onclick="toggleGoalComplete('${goal._id}')">
                        Mark Complete
                    </button>
                ` : ''}
                <button class="btn-secondary" style="flex: 1; padding: 8px;" onclick="deleteGoal('${goal._id}')">
                    Delete
                </button>
            </div>
        </div>
    `).join('');
}

function toggleGoalComplete(id) {
    const goal = goals.find(g => g._id === id);
    if (goal) {
        apiCall(`/api/goals/${id}`, 'PUT', { completed: !goal.completed }).then(data => {
            if (data) {
                loadGoals();
                updateStats();
            }
        });
    }
}

function deleteGoal(id) {
    if (confirm('Are you sure you want to delete this goal?')) {
        apiCall(`/api/goals/${id}`, 'DELETE').then(data => {
            if (data) {
                loadGoals();
                updateStats();
            }
        });
    }
}

// Habit Management
function openHabitModal() {
    document.getElementById('habitModal').classList.add('active');
}

function closeHabitModal() {
    document.getElementById('habitModal').classList.remove('active');
    document.getElementById('habitName').value = '';
}

function handleAddHabit(event) {
    event.preventDefault();
    
    const habitData = {
        name: document.getElementById('habitName').value,
        frequency: document.getElementById('habitFrequency').value
    };
    
    apiCall('/api/habits', 'POST', habitData).then(data => {
        if (data) {
            loadHabits();
            updateStats();
            closeHabitModal();
        }
    });
}

function renderHabits() {
    const container = document.getElementById('habitsList');
    
    if (habits.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">✅</span>
                <p>No habits yet. Start building good habits!</p>
            </div>
        `;
        return;
    }
    
    // Check if completed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    container.innerHTML = habits.map(habit => {
        const completedToday = habit.completedDates && habit.completedDates.some(date => {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
        });
        
        return `
            <div class="habit-item">
                <div class="habit-info">
                    <div class="habit-name">${habit.name}</div>
                    <div class="habit-frequency">${habit.frequency}</div>
                </div>
                <div class="habit-check ${completedToday ? 'completed' : ''}" onclick="toggleHabit('${habit._id}')">
                    ${completedToday ? '✓' : ''}
                </div>
            </div>
        `;
    }).join('');
}

function toggleHabit(id) {
    apiCall(`/api/habits/${id}/toggle`, 'POST').then(data => {
        if (data) {
            loadHabits();
            updateStats();
        }
    });
}

// Journal Management
function openJournalModal() {
    document.getElementById('journalModal').classList.add('active');
}

function closeJournalModal() {
    document.getElementById('journalModal').classList.remove('active');
    document.getElementById('journalTitle').value = '';
    document.getElementById('journalContent').value = '';
}

function handleAddJournal(event) {
    event.preventDefault();
    
    const journalData = {
        title: document.getElementById('journalTitle').value,
        content: document.getElementById('journalContent').value
    };
    
    apiCall('/api/journals', 'POST', journalData).then(data => {
        if (data) {
            loadJournal();
            updateStats();
            closeJournalModal();
        }
    });
}

function renderJournal() {
    const container = document.getElementById('journalList');
    
    if (journal.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📝</span>
                <p>No journal entries yet. Start writing!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = journal.map(entry => `
        <div class="journal-card">
            <div class="journal-header">
                <h3 class="journal-title">${entry.title}</h3>
                <span class="journal-date">${new Date(entry.date).toLocaleDateString()}</span>
            </div>
            <p class="journal-preview">${entry.content.substring(0, 150)}${entry.content.length > 150 ? '...' : ''}</p>
            <button class="btn-secondary" style="margin-top: 12px; padding: 8px 16px;" onclick="deleteJournal('${entry._id}')">
                Delete
            </button>
        </div>
    `).join('');
}

function deleteJournal(id) {
    if (confirm('Are you sure you want to delete this journal entry?')) {
        apiCall(`/api/journals/${id}`, 'DELETE').then(data => {
            if (data) {
                loadJournal();
                updateStats();
            }
        });
    }
}

// Logout
async function handleLogout() {
    try {
        await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    localStorage.clear();
    window.location.href = 'index.html';
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}