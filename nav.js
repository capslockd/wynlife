/* nav.js — WynLife Church
   Hillsong-style mobile menu:
   - Hamburger with MENU label that animates to X
   - Full-screen overlay with logo header
   - Accordion sub-items with chevron toggle
   - Service info strip at bottom                */

(function () {

  var hamburger  = document.getElementById('hamburgerBtn');
  var mobileNav  = document.getElementById('mobileNav');
  var closeBtn   = document.getElementById('mobNavClose');

  /* ── Open / Close ── */
  function openMenu() {
    mobileNav.classList.add('open');
    hamburger.classList.add('is-open');
    document.body.classList.add('menu-open');
    hamburger.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    mobileNav.classList.remove('open');
    hamburger.classList.remove('is-open');
    document.body.classList.remove('menu-open');
    hamburger.setAttribute('aria-expanded', 'false');
    /* Collapse all accordion items */
    var items = mobileNav.querySelectorAll('.mob-nav-item.is-open');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('is-open');
    }
  }

  /* ── Hamburger tap ── */
  if (hamburger) {
    hamburger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (mobileNav.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });
  }

  /* ── Close button tap ── */
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMenu();
    });
  }

  /* ── Accordion chevron toggles ── */
  if (mobileNav) {
    var toggleBtns = mobileNav.querySelectorAll('.mob-nav-toggle');
    for (var t = 0; t < toggleBtns.length; t++) {
      toggleBtns[t].addEventListener('click', function (e) {
        e.stopPropagation();
        var item = this.closest('.mob-nav-item');
        var isOpen = item.classList.contains('is-open');
        /* Close all other open items */
        var allItems = mobileNav.querySelectorAll('.mob-nav-item.is-open');
        for (var j = 0; j < allItems.length; j++) {
          allItems[j].classList.remove('is-open');
        }
        /* Toggle this one */
        if (!isOpen) {
          item.classList.add('is-open');
        }
      });
    }

    /* Close menu when a sub-link is tapped */
    var subLinks = mobileNav.querySelectorAll('.mob-nav-sub a, .mob-nav-cta a');
    for (var s = 0; s < subLinks.length; s++) {
      subLinks[s].addEventListener('click', closeMenu);
    }

    /* Close menu when a top-level link (no sub) is tapped */
    var topLinks = mobileNav.querySelectorAll('.mob-nav-item:not(:has(.mob-nav-sub)) .mob-nav-link');
    for (var l = 0; l < topLinks.length; l++) {
      topLinks[l].addEventListener('click', closeMenu);
    }
  }

  /* ── Close on outside tap ── */
  document.addEventListener('click', function (e) {
    if (
      mobileNav &&
      mobileNav.classList.contains('open') &&
      !mobileNav.contains(e.target) &&
      hamburger &&
      !hamburger.contains(e.target)
    ) {
      closeMenu();
    }
  });

  /* ── Active nav highlight ── */
  var page = window.location.pathname.split('/').pop() || 'index.html';
  var activeMap = {
    'gatherings.html':    'nav-gatherings',
    'church-online.html': 'nav-online',
    'whats-on.html':      'nav-whatson',
    'next-steps.html':    'nav-nextsteps',
    'about.html':         'nav-about',
    'pray.html':          'nav-pray'
  };
  var activeId = activeMap[page];
  if (activeId) {
    var el = document.getElementById(activeId);
    if (el) el.classList.add('active');
  }

}());
