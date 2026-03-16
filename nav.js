/* nav.js — injects shared header + footer on every page */

const NAV_HTML = `
<nav class="main-nav">
  <div class="nav-inner">
    <a href="index.html" class="nav-logo">
      <img src="assets/shared/Wynlife_Header_Logo.avif" alt="WynLife Church" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <span class="nav-logo-fallback">WynLife Church</span>
    </a>
    <ul class="nav-menu" id="navMenu">
      <li id="nav-gatherings">
        <a href="gatherings.html">Gatherings ▾</a>
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
        <a href="whats-on.html">What's On ▾</a>
        <div class="nav-dropdown">
          <a href="whats-on.html#bible-reading">This Week's Bible Reading</a>
          <a href="whats-on.html#food-bank">Food Bank</a>
          <a href="whats-on.html#announcements">Other Announcements</a>
        </div>
      </li>
      <li id="nav-nextsteps">
        <a href="next-steps.html">Next Steps ▾</a>
        <div class="nav-dropdown">
          <a href="next-steps.html#know-jesus">Get to Know Jesus</a>
          <a href="next-steps.html#become-like">Become Like Jesus</a>
          <a href="next-steps.html#live-like">Live Like Jesus</a>
          <a href="next-steps.html#share-jesus">Share Jesus</a>
        </div>
      </li>
      <li id="nav-about">
        <a href="about.html">About ▾</a>
        <div class="nav-dropdown">
          <a href="about.html#beliefs">Bible Beliefs</a>
          <a href="about.html#leadership">Leadership</a>
        </div>
      </li>
      <li id="nav-pray"><a href="pray.html" class="nav-cta-btn">Let Us Pray For You</a></li>
    </ul>
    <button class="hamburger" onclick="toggleMobileNav()" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>

<div class="mobile-nav" id="mobileNav">
  <button class="mobile-close" onclick="toggleMobileNav()">&#x2715;</button>
  <a href="index.html" onclick="toggleMobileNav()">Home</a>
  <a href="gatherings.html" onclick="toggleMobileNav()">Gatherings</a>
  <a href="gatherings.html#wednesday-prayer" class="sub" onclick="toggleMobileNav()">&#8594; Wednesday Night Prayer</a>
  <a href="gatherings.html#life-groups" class="sub" onclick="toggleMobileNav()">&#8594; Life Groups</a>
  <a href="gatherings.html#youth" class="sub" onclick="toggleMobileNav()">&#8594; Youth Sunday</a>
  <a href="gatherings.html#mens-group" class="sub" onclick="toggleMobileNav()">&#8594; Men's Group</a>
  <a href="gatherings.html#womens-group" class="sub" onclick="toggleMobileNav()">&#8594; Women's Group</a>
  <a href="church-online.html" onclick="toggleMobileNav()">Church Online</a>
  <a href="whats-on.html" onclick="toggleMobileNav()">What's On</a>
  <a href="next-steps.html" onclick="toggleMobileNav()">Next Steps</a>
  <a href="about.html" onclick="toggleMobileNav()">About</a>
  <a href="pray.html" onclick="toggleMobileNav()">Let Us Pray For You</a>
</div>
`;

const FOOTER_HTML = `
<footer>
  <div class="footer-grid">
    <div class="footer-brand">
      <img src="assets/shared/Wynlife_Header_Logo.avif" alt="WynLife Church" onerror="this.style.display='none'">
      <p>A vibrant, multicultural Christian community in Melbourne's west &mdash; committed to knowing Jesus, growing in faith, and serving our community.</p>
      <div class="footer-socials">
        <a href="https://www.facebook.com/wynlifechurch.au" target="_blank" class="footer-social" aria-label="Facebook">f</a>
        <a href="https://www.youtube.com/@wynlifechurch" target="_blank" class="footer-social" aria-label="YouTube">&#9654;</a>
        <a href="http://instagram.com/wynlifechurch" target="_blank" class="footer-social" aria-label="Instagram">&#9711;</a>
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
    <span>208 Ballan Rd, Wyndham Vale VIC 3024 &middot; <a href="mailto:info@wynlife.com.au" style="color:inherit">info@wynlife.com.au</a></span>
  </div>
</footer>
`;

document.addEventListener('DOMContentLoaded', () => {
  const navContainer = document.getElementById('nav-placeholder');
  if (navContainer) navContainer.innerHTML = NAV_HTML;

  const footerContainer = document.getElementById('footer-placeholder');
  if (footerContainer) footerContainer.innerHTML = FOOTER_HTML;

  // Highlight active nav item
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const map = {
    'index.html':         null,
    'gatherings.html':    'nav-gatherings',
    'church-online.html': 'nav-online',
    'whats-on.html':      'nav-whatson',
    'next-steps.html':    'nav-nextsteps',
    'about.html':         'nav-about',
    'pray.html':          'nav-pray',
  };
  const activeId = map[page];
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) el.classList.add('active');
  }
});

function toggleMobileNav() {
  document.getElementById('mobileNav').classList.toggle('open');
}
