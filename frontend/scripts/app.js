// ===============================
// TAB SWITCHING
// ===============================
const navItems = document.querySelectorAll(".nav-item[data-tab]");
const tabPanels = document.querySelectorAll(".tab-panel");

navItems.forEach(item => {
    item.addEventListener("click", () => {
        const tab = item.dataset.tab;

        if (tab === "logout") {
            alert("Logging out...");
            return;
        }

        if (tab === "settings") {
            alert("Settings coming soon");
            return;
        }

        navItems.forEach(n => n.classList.remove("active"));
        item.classList.add("active");

        tabPanels.forEach(p => p.classList.remove("active"));
        document.getElementById(`tab-${tab}`).classList.add("active");
    });
});

// ===============================
// CHART DATA + RENDERING
// ===============================
const ctx = document.getElementById("financeChart").getContext("2d");

const chartRanges = {
    day: {
        labels: ["6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM"],
        checking: [2400, 2420, 2435, 2430, 2440, 2444],
        savings: [8800, 8800, 8805, 8810, 8815, 8820],
        expenses: [0, 20, 40, 60, 80, 90],
        credit: [540, 540, 545, 550, 550, 550]
    },
    week: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        checking: [2300, 2320, 2350, 2370, 2400, 2430, 2430],
        savings: [8700, 8750, 8800, 8820, 8850, 8870, 8900],
        expenses: [300, 340, 390, 430, 490, 520, 550],
        credit: [500, 510, 520, 530, 540, 540, 550]
    },
    month: {
        labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
        checking: [2200, 2250, 2350, 2430],
        savings: [8600, 8700, 8800, 8920],
        expenses: [850, 1020, 1180, 1290],
        credit: [480, 490, 510, 540]
    },
    year: {
        labels: ["Jan", "Mar", "May", "Jul", "Sep", "Nov"],
        checking: [1800, 2050, 2200, 2350, 2450, 2430],
        savings: [6000, 6800, 7500, 8100, 8600, 8920],
        expenses: [650, 910, 1030, 1180, 1320, 1410],
        credit: [720, 640, 620, 590, 565, 540]
    }
};

let financeChart;

function renderFinanceChart(range = "day") {
    const data = chartRanges[range];

    if (financeChart) financeChart.destroy();

    financeChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: data.labels,
            datasets: [
                { label: "Checking", data: data.checking, borderColor: "#c084ff", tension: 0.35, borderWidth: 2 },
                { label: "Savings", data: data.savings, borderColor: "#00ff9d", tension: 0.35, borderWidth: 2 },
                { label: "Expenses", data: data.expenses, borderColor: "#ff6b6b", tension: 0.35, borderWidth: 2 },
                { label: "Credit Card", data: data.credit, borderColor: "#38bdf8", tension: 0.35, borderWidth: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

renderFinanceChart("day");

// FILTER BUTTONS
document.querySelectorAll(".filter-btn").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        button.classList.add("active");

        renderFinanceChart(button.dataset.range);
    });
});
