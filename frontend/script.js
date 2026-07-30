// Redirect signed-in users straight to the dashboard
window.addEventListener('DOMContentLoaded', function () {
    const token = localStorage.getItem('accessToken');
    if (token) {
        window.location.href = 'dashboard-v2.html';
    }
});

// Mobile nav toggle
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

// Scroll-reveal animations
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

// Growth trail: fills as the page scrolls, nodes light up per section
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

// Growth trail node click -> smooth scroll to section
trailNodes.forEach(function (node) {
    node.addEventListener('click', function () {
        const targetId = node.getAttribute('data-target');
        const target = document.getElementById(targetId);
        if (target) {
            target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
    });
    node.style.cursor = 'pointer';
});
