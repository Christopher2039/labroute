const Layout = {
  // 1. Header Template
  renderHeader(activePage = 'home') {
    const navItems = [
      { id: 'home', label: 'Home', href: 'index.html' },
      { id: 'about', label: 'About', href: 'about.html' },
      { id: 'reports', label: 'Reports', href: 'report.html' },
      { id: 'donate', label: 'Donate', href: 'donate.html' },
      { id: 'suggest', label: 'Suggest', href: 'index.html#Suggest' },
      { id: 'others', label: 'Others', href: 'others.html' }
    ];


    const navLinksHTML = navItems
      .map(
        (item) => `
        <li>
          <a href="${item.href}" class="nav-link ${activePage === item.id ? 'active' : ''}">
            ${item.label}
          </a>
        </li>`
      )
      .join('');

    return `
      <div class="container header-container">
        <a href="index.html" class="brand-logo" aria-label="LabRoute Home">
          <svg class="brand-icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6m-5 0v6l-6 10a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2L14 9V3M7 15h10"/></svg>
          <span>LabRoute</span>
        </a>

        <nav aria-label="Main Navigation">
          <ul class="nav-menu" id="navMenu">
            ${navLinksHTML}
          </ul>
        </nav>

        <div class="header-actions">
          <form class="input-search-wrapper" id="navSearchForm" role="search">
            <button type="submit" class="search-btn-icon" aria-label="Submit search">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            <input type="search" class="input-search-nav" placeholder="Search resources..." id="navSearch" aria-label="Search resources" autocomplete="off" />
          </form>

          <button class="icon-btn" id="themeToggleBtn" aria-label="Toggle light/dark theme" title="Toggle theme" aria-pressed="false">
            <span id="themeIcon" aria-hidden="true">${this.themeIcon(false)}</span>
          </button>

          <button class="mobile-toggle" id="mobileToggle" aria-label="Toggle navigation menu" aria-controls="navMenu" aria-expanded="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
        </div>
      </div>
    `;
  },

  // Inline icons remain legible even if the web font cannot load.
  themeIcon(isDark) {
    const shape = isDark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
      : '<path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5A8.5 8.5 0 1 0 20.5 13Z"/>';
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`;
  },

  // 2. Footer Template
  renderFooter() {
    const currentYear = new Date().getFullYear();
    return `
      <div class="container footer-container">
        <div class="footer-left">
          <a href="index.html" class="brand-logo" aria-label="LabRoute Home">
            <span class="material-symbols-outlined">experiment</span>
            <span>LabRoute</span>
          </a>
          
        </div>

        <ul class="footer-links">
          <li><a href="#ethics">Research Ethics</a></li>
          <li><a href="#privacy">Privacy Policy</a></li>
        </ul>

        <p>&copy; ${currentYear} LabRoute Institutional Repository. All Rights Reserved.</p>
      </div>
    `;
  },

  // 3. Initialize & Mount
  init() {
    const activePage = document.body.dataset.page || 'home';

    const headerElement = document.getElementById('site-header');
    if (headerElement) {
      headerElement.className = 'site-header';
      headerElement.innerHTML = this.renderHeader(activePage);
    }

    const footerElement = document.getElementById('site-footer');
    if (footerElement) {
      footerElement.className = 'site-footer';
      footerElement.innerHTML = this.renderFooter();
    }

    this.bindEvents();
  },

  // 4. Attach Interactions
  bindEvents() {
    // Global Header Search Controller
    const navSearchForm = document.getElementById('navSearchForm');
    const navSearch = document.getElementById('navSearch');

    const executeNavSearch = () => {
      if (!navSearch) return;
      const query = navSearch.value.trim();
      if (!query) return;

      const isHome = document.body.dataset.page === 'home';
      if (isHome) {
        // If already on homepage, update search box and filter live
        const mainSearch = document.getElementById('reportSearchInput');
        if (mainSearch) {
          mainSearch.value = query;
          mainSearch.dispatchEvent(new Event('input'));
          document.getElementById('Reports')?.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        // If on another page (about, others, report, etc.), redirect to home search
        window.location.href = `index.html?search=${encodeURIComponent(query)}#Reports`;
      }
    };

    if (navSearchForm) {
      navSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        executeNavSearch();
      });
    }

    if (navSearch) {
      navSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          executeNavSearch();
        }
      });
    }


    // Theme Switcher Controller with LocalStorage Persistence
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');

    // 1. Sync theme state on load
    const currentTheme = localStorage.getItem('myela_theme') || 'light';
    if (currentTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (themeIcon) themeIcon.innerHTML = this.themeIcon(true);
      themeToggleBtn?.setAttribute('aria-pressed', 'true');
    }

    // 2. Toggle on click
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('myela_theme', newTheme);
        themeToggleBtn.setAttribute('aria-pressed', String(newTheme === 'dark'));

        if (themeIcon) {
          themeIcon.innerHTML = this.themeIcon(newTheme === 'dark');
        }
      });
    }

    // Mobile Drawer Toggle
    const mobileToggle = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');
    if (mobileToggle && navMenu) {
      mobileToggle.addEventListener('click', () => {
        const isOpen = navMenu.classList.toggle('open');
        mobileToggle.setAttribute('aria-expanded', String(isOpen));
      });
    }

    // Let keyboard users dismiss the mobile menu without losing their place.
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && navMenu?.classList.contains('open')) {
        navMenu.classList.remove('open');
        mobileToggle.setAttribute('aria-expanded', 'false');
        mobileToggle.focus();
      }
    });

    // Scroll Glassmorphism Effect
    const siteHeader = document.getElementById('site-header');
    if (siteHeader) {
      window.addEventListener('scroll', () => {
        if (window.scrollY > 40) {
          siteHeader.classList.add('scrolled');
        } else {
          siteHeader.classList.remove('scrolled');
        }
      });
    }
  }
};

// Automatically mount when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  Layout.init();
});

window.addEventListener('load', () => {
  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) {
      // Small timeout ensures the DOM has completely settled
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }
});
