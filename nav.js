/* nav.js — mobile menu toggle + active nav highlight
   Nav and footer HTML are hardcoded in each page.
   This script only wires up the hamburger button.    */

(function () {

  var hamburger = document.getElementById('hamburgerBtn');
  var mobileNav = document.getElementById('mobileNav');
  var closeBtn  = document.getElementById('mobileCloseBtn');

  function openMenu() {
    mobileNav.classList.add('open');
    document.body.classList.add('menu-open');
    hamburger.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    mobileNav.classList.remove('open');
    document.body.classList.remove('menu-open');
    hamburger.setAttribute('aria-expanded', 'false');
  }

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

  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMenu();
    });
  }

  /* Close when any nav link is tapped */
  if (mobileNav) {
    var links = mobileNav.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', closeMenu);
    }
  }

  /* Close on outside tap */
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

  /* Active nav highlight */
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
