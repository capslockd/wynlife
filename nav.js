/* nav.js — injects shared header + footer, fixes mobile menu */

const NAV_HTML = `
<nav class="main-nav">
  <div class="nav-inner">
    <a href="index.html" class="nav-logo">
      <img src="assets/shared/Wynlife_Header_Logo.avif" alt="WynLife Church"
           onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <span class="nav-logo-fallback">WynLife</span>
    </a>
    <ul class="nav-menu" id="navMenu">
      <li id="nav-gatherings">
        <a href="gatherings.html">Gatherings &#9660;</a>
        <div class="nav-dropdown">
          <a href="gatherings.html#wednesday-prayer">Wednesday Night Prayer</a>
          <a href="gatherings.html#life-groups">Life Groups</a>
          <a href="gatherings.html#youth">Youth Sunday</a>
          <a href="gatherings.html#mens-group">Men's Group</a>
          <a href="gatherings.html#womens-group">Women's Group</a>
        </div>
      </li>
      <li id="nav-online"><a href="church-online.html">Church Online</a></li>
      <li id="nav-whatson">
        <a href="whats-on.html">What's On &#9660;</a>
        <div class="nav-dropdown">
          <a href="whats-on.html#bible-reading">This Week's Bible Reading</a>
          <a href="whats-on.html#food-bank">Food Bank</a>
          <a href="whats-on.html#announcements">Other Announcements</a>
        </div>
      </li>
      <li id="nav-nextsteps">
        <a href="next-steps.html">Next Steps &#9660;</a>
        <div class="nav-dropdown">
          <a href="next-steps.html#know-jesus">Get to Know Jesus</a>
          <a href="next-steps.html#become-like">Become Like Jesus</a>
          <a href="next-steps.html#live-like">Live Like Jesus</a>
          <a href="next-steps.html#share-jesus">Share Jesus</a>
        </div>
      </li>
      <li id="nav-about">
        <a href="about.html">About &#9660;</a>
        <div class="nav-dropdown">
          <a href="about.html#beliefs">Bible Beliefs</a>
          <a href="about.html#leadership">Leadership</a>
        </div>
      </li>
      <li id="nav-pray">
        <a href="pray.html" class="nav-cta-btn">Let Us Pray For You</a>
      </li>
    </ul>
    <button class="hamburger" id="hamburgerBtn" aria-label="Open menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>

<div class="mobile-nav" id="mobileNav" aria-hidden="true">
  <button class="mobile-close" id="mobileCloseBtn" aria-label="Close menu">&#10005;</button>
  <a href="index.html">Home</a>
  <a href="gatherings.html">Gatherings</a>
  <a href="gatherings.html#wednesday-prayer" class="sub">&#8594; Wednesday Night Prayer</a>
  <a href="gatherings.html#life-groups" class="sub">&#8594; Life Groups</a>
  <a href="gatherings.html#youth" class="sub">&#8594; Youth Sunday</a>
  <a href="gatherings.html#mens-group" class="sub">&#8594; Men's Group</a>
  <a href="gatherings.html#womens-group" class="sub">&#8594; Women's Group</a>
  <a href="church-online.html">Church Online</a>
  <a href="whats-on.html">What's On</a>
  <a href="whats-on.html#bible-reading" class="sub">&#8594; Bible Reading</a>
  <a href="whats-on.html#food-bank" class="sub">&#8594; Food Bank</a>
  <a href="next-steps.html">Next Steps</a>
  <a href="about.html">About</a>
  <a href="pray.html" class="mobile-cta">Let Us Pray For You</a>
</div>
`;

const FOOTER_HTML = `
<footer>
  <div class="footer-grid">
    <div class="footer-brand">
      <img src="assets/shared/Wynlife_Header_Logo.avif" alt="WynLife Church"
           onerror="this.style.display='none'">
      <p>A vibrant, multicultural Christian community in Melbourne's west &mdash;
         committed to knowing Jesus, growing in faith, and serving our community.</p>
      <div class="footer-socials">
        <a href="https://www.facebook.com/wynlifechurch.au" target="_blank"
           class="footer-social" aria-label="Facebook">f</a>
        <a href="https://www.youtube.com/@wynlifechurch" target="_blank"
           class="footer-social" aria-label="YouTube">&#9654;</a>
        <a href="http://instagram.com/wynlifechurch" target="_blank"
           class="footer-social" aria-label="Instagram">&#9711;</a>
      </div>
    </div>
    <div class="footer-col">
      <h4>Gatherings</h4>
      <ul>
        <li><a href="gatherings.html#wednesday-prayer">Wednesday Night Prayer</a></li>
        <li><a href="gatherings.html#life-groups">Life Groups</a></li>
        <li><a href="gatherings.html#youth">Youth Sunday</a></li>
        <li><a href="gatherings.html#mens-group">Men's Group</a></li>
        <li><a href="gatherings.html#womens-group">Women's Group</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Next Steps</h4>
      <ul>
        <li><a href="next-steps.html#know-jesus">Get to Know Jesus</a></li>
        <li><a href="next-steps.html#become-like">Become Like Jesus</a></li>
        <li><a href="next-steps.html#live-like">Live Like Jesus</a></li>
        <li><a href="next-steps.html#share-jesus">Share Jesus</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Info</h4>
      <ul>
        <li><a href="about.html#beliefs">Bible Beliefs</a></li>
        <li><a href="about.html#leadership">Leadership</a></li>
        <li><a href="whats-on.html">What's On</a></li>
        <li><a href="https://www.wynlife.com.au/giving" target="_blank">Give Online</a></li>
        <li><a href="pray.html">Contact Us</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>&copy; 2026 WynLife Church. All rights reserved.</span>
    <span>208 Ballan Rd, Wyndham Vale VIC 3024 &middot;
      <a href="mailto:info@wynlife.com.au" style="color:inherit">info@wynlife.com.au</a>
    </span>
  </div>
</footer>
`;

document.addEventListener('DOMContentLoaded', function () {

  /* ── Inject nav + footer ── */
  var navEl = document.getElementById('nav-placeholder');
  if (navEl) navEl.innerHTML = NAV_HTML;

  var footerEl = document.getElementById('footer-placeholder');
  if (footerEl) footerEl.innerHTML = FOOTER_HTML;

  /* ── Active nav highlight ── */
  var page = window.location.pathname.split('/').pop() || 'index.html';
  var map = {
    'gatherings.html':    'nav-gatherings',
    'church-online.html': 'nav-online',
    'whats-on.html':      'nav-whatson',
    'next-steps.html':    'nav-nextsteps',
    'about.html':         'nav-about',
    'pray.html':          'nav-pray'
  };
  var activeId = map[page];
  if (activeId) {
    var el = document.getElementById(activeId);
    if (el) el.classList.add('active');
  }

  /* ── Mobile menu — wire up AFTER injection ── */
  var hamburger  = document.getElementById('hamburgerBtn');
  var mobileNav  = document.getElementById('mobileNav');
  var closeBtn   = document.getElementById('mobileCloseBtn');

  function openMenu() {
    mobileNav.classList.add('open');
    mobileNav.setAttribute('aria-hidden', 'false');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden'; /* prevent background scroll */
  }

  function closeMenu() {
    mobileNav.classList.remove('open');
    mobileNav.setAttribute('aria-hidden', 'true');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (hamburger) hamburger.addEventListener('click', openMenu);
  if (closeBtn)  closeBtn.addEventListener('click',  closeMenu);

  /* Close when any link inside mobile nav is tapped */
  if (mobileNav) {
    mobileNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
  }

  /* Close if user taps outside the panel */
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
});
