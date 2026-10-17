/* admin.js — WynLife Church Management App
   Single-page admin console for /admin/. Data lives in the Google Sheet
   "Wynlife Management App Data Sheet"; all reads and writes go through the
   Apps Script web app configured in admin-config.js.                      */

(function () {

  var A = window.WynAdmin;
  var esc = A.esc;

  var elLogin = document.getElementById('admLogin');
  var elApp   = document.getElementById('admApp');
  var elMenu  = document.getElementById('admMenu');
  var elView  = document.getElementById('admView');
  var elWho   = document.getElementById('admWho');
  var elMenuToggle  = document.getElementById('admMenuToggle');
  var elMenuCurrent = document.getElementById('admMenuCurrent');

  /* ── Screens and the menu ────────────────────────────────────────────
     Every screen is a route, opened either by a minimum role on the basic /
     planner / admin ladder or by a capability (newsletter, website) for the
     roles that sit outside it. The menu groups the routes by job; anything a
     role cannot open is left out rather than greyed out, and a group with
     nothing left in it disappears — so each role sees only its own tools.
     Routes not in the menu (users/new, members/new) open the same screen
     with its "Add" form already showing.                                */

  var ROUTES = {
    '':                       { view: viewDashboard,            label: 'Dashboard' },
    'members':                { view: viewMembers,              label: 'Members',              role: 'planner' },
    'members/new':            { view: viewMembers,              label: 'Members',              role: 'planner', arg: 'new' },
    'tracking/attendance':    { view: viewSundayAttendance,     label: 'Sunday Attendance',    role: 'planner' },
    'tracking/sunday-school': { view: viewSetupSundaySchool,    label: 'Setup Sunday School',  role: 'planner' },
    'reports/attendance':     { view: viewAttendanceReport,     label: 'Attendance Report',    role: 'basic' },
    'reports/sunday-school':  { view: viewSundaySchoolReport,   label: 'Sunday School Report', role: 'basic' },
    'newsletter/compose':     { view: viewNewsletterCompose,    label: 'Compose Newsletter',   cap: 'newsletter' },
    'newsletter':             { view: viewNewsletterHistory,    label: 'Newsletter History',   cap: 'newsletter' },
    'newsletter/recipients':  { view: viewNewsletterRecipients, label: 'Recipients',           cap: 'newsletter' },
    'website/home':           { view: viewWebsitePage,          label: 'Home Page',            cap: 'website', arg: 'home' },
    'website/gatherings':     { view: viewWebsitePage,          label: 'Gatherings',           cap: 'website', arg: 'gatherings' },
    'website/online':         { view: viewWebsitePage,          label: 'Church Online',        cap: 'website', arg: 'online' },
    'website/whatson':        { view: viewWebsitePage,          label: 'What’s On',       cap: 'website', arg: 'whatson' },
    'website/history':        { view: viewWebsiteHistory,       label: 'Publish History',      cap: 'website' },
    'users':                  { view: viewUsers,                label: 'Users & Roles',        role: 'admin' },
    'users/new':              { view: viewUsers,                label: 'Users & Roles',        role: 'admin', arg: 'new' },
    'newsletter/settings':    { view: viewNewsletterSettings,   label: 'Email Settings',       role: 'admin' },
    'website/settings':       { view: viewWebsiteSettings,      label: 'Website Publishing',   role: 'admin' }
  };

  var MENU = [
    { title: 'Members & Sundays', icon: 'fa-people-group', routes: [
      'members', 'tracking/attendance', 'tracking/sunday-school',
      'reports/attendance', 'reports/sunday-school'
    ] },
    { title: 'Newsletter', icon: 'fa-envelope-open-text', routes: [
      'newsletter/compose', 'newsletter', 'newsletter/recipients'
    ] },
    { title: 'Website', icon: 'fa-globe', routes: [
      'website/home', 'website/gatherings', 'website/online', 'website/whatson', 'website/history'
    ] },
    { title: 'Settings', icon: 'fa-gear', routes: [
      'users', 'newsletter/settings', 'website/settings'
    ] }
  ];

  /** Every route is gated either by a minimum role or by a capability. */
  function allowed(def) {
    if (def.cap) return A.can(def.cap);
    return def.role ? A.hasRole(def.role) : true;
  }

  /* ── Boot ────────────────────────────────────────────────────────────── */

  function start() {
    if (elMenuToggle) {
      elMenuToggle.addEventListener('click', function () {
        setMenuOpen(!elMenu.classList.contains('is-open'));
      });
    }
    elMenu.addEventListener('click', function (e) {
      var title = e.target.closest('[data-menu-group]');
      if (title) {
        var name = title.getAttribute('data-menu-group');
        openGroups[name] = !openGroups[name];
        renderMenu();
        return;
      }
      /* Any menu tap navigates, so close the drawer behind it. */
      if (e.target.closest('a')) setMenuOpen(false);
    });
    if (A.getUser() && A.getToken()) {
      showApp();
    } else {
      showLogin();
    }
    window.addEventListener('hashchange', route);
    window.addEventListener('beforeunload', function (e) {
      if (webHasUnsaved()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function showLogin(message) {
    setMenuOpen(false);
    /* The next person to sign in may have a different role, and so a different menu. */
    openGroups = {};
    menuSeeded = false;
    menuRouteShown = null;
    document.body.classList.remove('adm-wide');
    elApp.hidden = true;
    elLogin.hidden = false;
    elWho.innerHTML = '';
    elLogin.innerHTML =
      '<div class="adm-login">' +
        '<h2>Church Admin</h2>' +
        '<p class="adm-sub">Sign in to manage members, record Sunday attendance, send the ' +
        'newsletter and keep the website up to date.</p>' +
        '<div class="adm-msg error" id="loginMsg">' + esc(message || '') + '</div>' +
        '<form class="adm-form" id="loginForm" autocomplete="on">' +
          field('Email', '<input type="email" id="loginEmail" required autocomplete="username">') +
          field('Password', '<input type="password" id="loginPassword" required autocomplete="current-password">') +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="submit" id="loginBtn">Sign In</button>' +
            '<a class="adm-btn secondary" href="/">Back to site</a>' +
          '</div>' +
        '</form>' +
      '</div>';

    if (!A.configured()) {
      msg('loginMsg', 'The management app is not connected to its Google Sheet yet. ' +
        'See apps-script/README.md for the one-time setup.', 'info');
    }

    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('loginBtn');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      A.login(document.getElementById('loginEmail').value.trim(),
              document.getElementById('loginPassword').value)
        .then(showApp)
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = 'Sign In';
          msg('loginMsg', err.message, 'error');
        });
    });
  }

  function showApp() {
    var user = A.getUser();
    elLogin.hidden = true;
    elApp.hidden = false;
    elWho.innerHTML =
      '<span>' + esc(user.name || user.email) + ' · <span class="adm-pill blue">' +
      esc(A.roleLabel(user.role)) + '</span></span>' +
      '<button class="adm-btn small secondary" id="signOutBtn" ' +
      'style="border-color:rgba(255,255,255,0.5);color:#fff;">Sign Out</button>';
    document.getElementById('signOutBtn').addEventListener('click', function () {
      A.clearSession();
      window.location.hash = '';
      showLogin('You have been signed out.');
    });
    renderMenu();
    route();
  }

  function setMenuOpen(open) {
    if (!elMenuToggle) return;
    elMenu.classList.toggle('is-open', open);
    elMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /** The menu entry a route belongs to: users/new is Users, a compose link is Compose. */
  function menuRoute(route) {
    var name = route;
    while (name && !MENU.some(function (g) { return g.routes.indexOf(name) !== -1; })) {
      var cut = name.lastIndexOf('/');
      name = cut > 0 ? name.slice(0, cut) : '';
    }
    return name;
  }

  /* Which menu groups are expanded. The group holding the current screen
     opens on arrival; the others stay as they were left. Someone who can see
     only one or two groups gets them all open — there is nothing to tidy. */
  var openGroups = {};
  var menuSeeded = false;
  var menuRouteShown = null;

  function visibleGroups() {
    return MENU.map(function (group) {
      return {
        title: group.title,
        icon: group.icon,
        routes: group.routes.filter(function (r) { return allowed(ROUTES[r]); })
      };
    }).filter(function (group) { return group.routes.length > 0; });
  }

  function renderMenu() {
    var current = menuRoute(currentRoute());
    var groups = visibleGroups();
    if (!menuSeeded) {
      menuSeeded = true;
      if (groups.length <= 2) groups.forEach(function (g) { openGroups[g.title] = true; });
    }
    /* Only on arriving at a screen — a group someone has just closed stays closed. */
    if (current !== menuRouteShown) {
      menuRouteShown = current;
      groups.forEach(function (g) {
        if (g.routes.indexOf(current) !== -1) openGroups[g.title] = true;
      });
    }
    if (elMenuCurrent) elMenuCurrent.textContent = ROUTES[current] ? ROUTES[current].label : 'Dashboard';

    elMenu.innerHTML =
      '<a href="#/" class="adm-menu-home' + (current === '' ? ' active' : '') + '"' +
        (current === '' ? ' aria-current="page"' : '') + '>' +
        '<i class="fa-solid fa-house" aria-hidden="true"></i><span>Dashboard</span></a>' +
      groups.map(function (group, i) {
        var open = !!openGroups[group.title];
        var holdsCurrent = group.routes.indexOf(current) !== -1;
        return '<div class="adm-menu-group' + (open ? ' is-open' : '') +
            (holdsCurrent ? ' has-current' : '') + '">' +
          '<button type="button" class="adm-menu-title" data-menu-group="' + esc(group.title) + '"' +
            ' aria-expanded="' + open + '" aria-controls="admMenuGroup' + i + '">' +
            '<i class="fa-solid ' + group.icon + '" aria-hidden="true"></i>' +
            '<span>' + esc(group.title) + '</span>' +
            '<span class="adm-menu-caret" aria-hidden="true"></span>' +
          '</button>' +
          '<div class="adm-menu-items" id="admMenuGroup' + i + '"' + (open ? '' : ' hidden') + '>' +
            group.routes.map(function (r) {
              return '<a href="#/' + r + '"' +
                (r === current ? ' class="active" aria-current="page"' : '') + '>' +
                esc(ROUTES[r].label) + '</a>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('');
  }

  /* ── Routing ─────────────────────────────────────────────────────────── */

  function currentRoute() {
    return (window.location.hash || '').replace(/^#\/?/, '').replace(/\/$/, '');
  }

  function route() {
    if (!A.getUser()) { showLogin(); return; }
    setMenuOpen(false);
    leaveWebsiteEditor();
    var name = currentRoute();
    var def = ROUTES[name];
    var param = '';
    /* Routes may carry one trailing id, e.g. #/newsletter/compose/NLT-0007. */
    if (!def) {
      var cut = name.lastIndexOf('/');
      if (cut > 0 && ROUTES[name.slice(0, cut)]) {
        param = decodeURIComponent(name.slice(cut + 1));
        name = name.slice(0, cut);
        def = ROUTES[name];
      }
    }
    renderMenu();
    if (!def) {
      elView.innerHTML = panel('Page not found',
        'That admin screen does not exist. Pick something from the menu.');
      return;
    }
    if (!allowed(def)) {
      elView.innerHTML = panel('Not available to your role',
        'Your role (<strong>' + esc(A.roleLabel(A.getUser().role)) + '</strong>) does not ' +
        'have access to this screen. Ask an administrator if you need it.');
      return;
    }
    /* The website editor puts a form and a whole page side by side, so it
       uses the width a large screen has to offer. */
    document.body.classList.toggle('adm-wide', def.view === viewWebsitePage);
    window.scrollTo(0, 0);
    def.view(def.arg !== undefined ? def.arg : param);
  }

  /* ── Small render helpers ────────────────────────────────────────────── */

  function panel(title, sub, bodyHtml) {
    return '<div class="adm-panel"><h2>' + title + '</h2>' +
      (sub ? '<p class="adm-sub">' + sub + '</p>' : '') + (bodyHtml || '') + '</div>';
  }

  function field(label, inputHtml, hint) {
    return '<div class="adm-field"><label>' + label + '</label>' + inputHtml +
      (hint ? '<div class="adm-hint">' + hint + '</div>' : '') + '</div>';
  }

  function checkbox(id, label, checked) {
    return '<label class="adm-check"><input type="checkbox" id="' + id + '"' +
      (checked ? ' checked' : '') + '> <span>' + label + '</span></label>';
  }

  function msg(id, text, kind) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'adm-msg ' + (kind || 'info');
    el.innerHTML = text ? esc(text) : '';
  }

  function msgHtml(id, html, kind) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'adm-msg ' + (kind || 'info');
    el.innerHTML = html;
  }

  function loading(text) {
    elView.innerHTML = '<div class="adm-panel"><p class="adm-sub" style="margin:0;">' +
      esc(text || 'Loading…') + '</p></div>';
  }

  function fail(err) {
    elView.innerHTML = panel('Something went wrong',
      esc(err && err.message ? err.message : String(err)),
      '<div class="adm-actions"><button class="adm-btn secondary" ' +
      'onclick="window.location.reload()">Try again</button></div>');
  }

  function on(id, event, handler) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value).trim() : '';
  }

  function checked(id) {
    var el = document.getElementById(id);
    return !!(el && el.checked);
  }

  function busy(id, isBusy, busyLabel) {
    var el = document.getElementById(id);
    if (!el) return;
    if (isBusy) {
      el.dataset.label = el.textContent;
      el.textContent = busyLabel || 'Working…';
      el.disabled = true;
    } else {
      el.textContent = el.dataset.label || el.textContent;
      el.disabled = false;
    }
  }

  function yesNo(value) {
    return value
      ? '<span class="adm-pill green">Yes</span>'
      : '<span class="adm-pill grey">No</span>';
  }

  function downloadCsv(filename, rows) {
    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        var text = cell === null || cell === undefined ? '' : String(cell);
        return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join(',');
    }).join('\r\n');

    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ── Dashboard ───────────────────────────────────────────────────────── */

  function viewDashboard() {
    var user = A.getUser();
    var sunday = A.lastSunday();

    var sundayWalkthrough =
      '<h3 style="font-family:\'Merriweather\',serif;color:var(--navy);font-size:1.1rem;margin:8px 0 10px;">' +
      'A normal Sunday</h3>' +
      '<ol style="color:var(--gray);line-height:1.9;font-size:0.95rem;padding-left:22px;max-width:620px;">' +
        '<li><a href="#/tracking/attendance">Sunday Attendance</a> — tick everyone who came.</li>' +
        '<li><a href="#/tracking/sunday-school">Setup Sunday School</a> — build the kids roster from ' +
          'that attendance, then share the parent link.</li>' +
        '<li>Parents sign their children in and out at <code>' + esc(A.checkinPath) + '</code>.</li>' +
        '<li><a href="#/reports/attendance">Attendance Report</a> and ' +
          '<a href="#/reports/sunday-school">Sunday School Report</a> — export the week.</li>' +
      '</ol>';

    var newsletterWalkthrough =
      '<h3 style="font-family:\'Merriweather\',serif;color:var(--navy);font-size:1.1rem;margin:8px 0 10px;">' +
      'A normal newsletter</h3>' +
      '<ol style="color:var(--gray);line-height:1.9;font-size:0.95rem;padding-left:22px;max-width:620px;">' +
        '<li><a href="#/newsletter/compose">Compose Newsletter</a> — pick a design, then fill in ' +
          'this week’s sermon and announcements. Giving, Child Safety, the header and the ' +
          'footer come pre-filled.</li>' +
        '<li>Watch the preview on the right as you type, and send yourself a test.</li>' +
        '<li>Send it to the list. Every copy goes out individually with its own ' +
          'unsubscribe link.</li>' +
        '<li><a href="#/newsletter">Newsletter History</a> — every issue is kept, so you can ' +
          'reopen last week’s and start from it.</li>' +
      '</ol>';

    var websiteWalkthrough =
      '<h3 style="font-family:\'Merriweather\',serif;color:var(--navy);font-size:1.1rem;margin:8px 0 10px;">' +
      'Keeping the website up to date</h3>' +
      '<ol style="color:var(--gray);line-height:1.9;font-size:0.95rem;padding-left:22px;max-width:620px;">' +
        '<li><a href="#/website/online">Church Online</a> — paste this Sunday’s livestream link.</li>' +
        '<li><a href="#/website/whatson">What’s On</a> — add this week’s announcements, and switch ' +
          'off the ones that have passed.</li>' +
        '<li>Check the preview beside the form, then press <strong>Publish</strong>. The live site ' +
          'updates in about a minute.</li>' +
        '<li><a href="#/website/history">Publish History</a> — every publish is kept, and any of ' +
          'them can be put back.</li>' +
      '</ol>';

    elView.innerHTML = panel(
      'Welcome, ' + esc((user.name || user.email).split(' ')[0]),
      'This is the WynLife Church management console. Everything you record here ' +
      'is written straight into the <strong>Wynlife Management App Data Sheet</strong> ' +
      'on Google Drive.',
      '<div class="adm-stats">' +
        '<div class="adm-stat"><div class="v" style="font-size:1.25rem;">' +
          esc(A.prettyDate(sunday)) + '</div><div class="k">Most recent Sunday</div></div>' +
        '<div class="adm-stat"><div class="v" style="font-size:1.25rem;">' +
          esc(A.roleLabel(user.role)) + '</div><div class="k">Your role</div></div>' +
      '</div>' +
      (A.hasRole('basic') ? sundayWalkthrough : '') +
      (A.can('newsletter') ? newsletterWalkthrough : '') +
      (A.can('website') ? websiteWalkthrough : ''));
  }

  /* ── Settings: Users & Roles ─────────────────────────────────────────── */

  var ROLE_NOTES = {
    basic:     'reports only',
    planner:   'members & attendance',
    admin:     'full access',
    email:     'newsletter only',
    moderator: 'website only'
  };

  function roleOptions(selected) {
    return A.ROLES.map(function (role) {
      return '<option value="' + role + '"' + (role === selected ? ' selected' : '') + '>' +
        esc(A.roleLabel(role) + ' — ' + ROLE_NOTES[role]) + '</option>';
    }).join('');
  }

  /** Lists every login; "new" opens the Add form above the list. */
  function viewUsers(arg) {
    loading('Loading users…');
    return A.call('listUsers').then(function (data) {
      renderUserList(data.users);
      if (arg === 'new') renderUserAdd();
    }).catch(fail);
  }

  function renderUserAdd() {
    var slot = document.getElementById('userEditSlot');
    slot.innerHTML =
      '<div class="adm-panel" style="background:var(--cream);margin-bottom:22px;">' +
        '<h2 style="font-size:1.15rem;">Add a user</h2>' +
        '<form class="adm-form" id="addUserForm">' +
          '<div class="adm-grid-2">' +
            field('Email', '<input type="email" id="nuEmail" required autocomplete="off">') +
            field('Display name', '<input type="text" id="nuName" autocomplete="off">') +
          '</div>' +
          '<div class="adm-grid-2">' +
            field('Password', '<input type="password" id="nuPassword" required autocomplete="new-password">',
                  'At least 8 characters.') +
            field('Role', '<select id="nuRole">' + roleOptions('basic') + '</select>') +
          '</div>' +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="submit" id="nuSave">Create User</button>' +
            '<button class="adm-btn secondary" type="button" id="nuCancel">Cancel</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.getElementById('nuEmail').focus();

    on('nuCancel', 'click', function () { slot.innerHTML = ''; });

    on('addUserForm', 'submit', function (e) {
      e.preventDefault();
      busy('nuSave', true, 'Creating…');
      A.call('addUser', {
        email: val('nuEmail'),
        name: val('nuName'),
        password: document.getElementById('nuPassword').value,
        role: val('nuRole')
      }).then(function (data) {
        return viewUsers().then(function () { msg('userMsg', data.message, 'ok'); });
      }).catch(function (err) {
        busy('nuSave', false);
        msg('userMsg', err.message, 'error');
      });
    });
  }

  function renderUserList(users) {
    var rows = users.map(function (user) {
      return '<tr>' +
        '<td>' + esc(user.email) + '</td>' +
        '<td>' + esc(user.name) + '</td>' +
        '<td><span class="adm-pill blue">' + esc(A.roleLabel(user.role)) + '</span></td>' +
        '<td>' + (user.active
          ? '<span class="adm-pill green">Active</span>'
          : '<span class="adm-pill grey">Disabled</span>') + '</td>' +
        '<td>' + esc(user.lastLogin ? user.lastLogin.replace('T', ' ') : 'never') + '</td>' +
        '<td><button class="adm-btn small secondary" data-edit-user="' +
          esc(user.userId) + '">Edit</button></td>' +
      '</tr>';
    }).join('');

    elView.innerHTML = panel('Users &amp; Roles',
      'Everyone who can sign in to this console. <strong>Basic</strong> can view reports, ' +
      '<strong>Planner</strong> can also manage members and record attendance, and ' +
      '<strong>Admin</strong> can do everything, including managing users. Two roles sit on ' +
      'their own: an <strong>Email Administrator</strong> composes and sends the newsletter, and ' +
      'a <strong>Website Moderator</strong> edits and publishes the website — and neither can do ' +
      'anything else. At least one active admin must always remain.',
      '<div class="adm-msg" id="userMsg"></div>' +
      '<div class="adm-actions" style="margin-bottom:18px;">' +
        '<button class="adm-btn" type="button" id="userAdd">Add a User</button>' +
      '</div>' +
      '<div id="userEditSlot"></div>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Last login</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="6">No users yet.</td></tr>') +
      '</tbody></table></div>');

    on('userAdd', 'click', renderUserAdd);

    elView.querySelectorAll('[data-edit-user]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var user = users.filter(function (u) {
          return u.userId === btn.getAttribute('data-edit-user');
        })[0];
        if (user) renderUserEditor(user);
      });
    });
  }

  function renderUserEditor(user) {
    document.getElementById('userEditSlot').innerHTML =
      '<div class="adm-panel" style="background:var(--cream);margin-bottom:22px;">' +
        '<h2 style="font-size:1.15rem;">Editing ' + esc(user.email) + '</h2>' +
        '<form class="adm-form" id="editUserForm">' +
          '<div class="adm-grid-2">' +
            field('Email', '<input type="email" id="euEmail" value="' + esc(user.email) + '" required>') +
            field('Display name', '<input type="text" id="euName" value="' + esc(user.name) + '">') +
          '</div>' +
          '<div class="adm-grid-2">' +
            field('Role', '<select id="euRole">' + roleOptions(user.role) + '</select>') +
            field('New password',
              '<input type="password" id="euPassword" autocomplete="new-password">',
              'Leave blank to keep the current password.') +
          '</div>' +
          checkbox('euActive', 'Account is active', user.active) +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="submit" id="euSave">Save Changes</button>' +
            '<button class="adm-btn secondary" type="button" id="euCancel">Cancel</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    on('euCancel', 'click', function () {
      document.getElementById('userEditSlot').innerHTML = '';
    });

    on('editUserForm', 'submit', function (e) {
      e.preventDefault();
      busy('euSave', true, 'Saving…');
      A.call('updateUser', {
        userId: user.userId,
        email: val('euEmail'),
        name: val('euName'),
        role: val('euRole'),
        password: document.getElementById('euPassword').value,
        active: checked('euActive')
      }).then(function (data) {
        return viewUsers().then(function () { msg('userMsg', data.message, 'ok'); });
      }).catch(function (err) {
        busy('euSave', false);
        msg('userMsg', err.message, 'error');
      });
    });
  }

  /* ── Members & Sundays: Members ──────────────────────────────────────── */

  function memberFormFields(member) {
    member = member || {};
    return '<div class="adm-grid-2">' +
        field('First name', '<input type="text" id="mFirst" value="' +
          esc(member.firstName || '') + '" required>') +
        field('Last name', '<input type="text" id="mLast" value="' +
          esc(member.lastName || '') + '" required>') +
      '</div>' +
      '<div class="adm-grid-2">' +
        field('Date of birth', '<input type="date" id="mDob" value="' + esc(member.dob || '') + '">') +
        field('Mobile <span class="adm-optional">(optional)</span>',
          '<input type="text" id="mMobile" inputmode="tel" value="' +
          esc(member.mobile || '') + '">') +
      '</div>' +
      '<div class="adm-grid-2">' +
        field('Email <span class="adm-optional">(optional)</span>',
          '<input type="email" id="mEmail" value="' + esc(member.email || '') + '">') +
        field('Suburb <span class="adm-optional">(optional)</span>',
          '<input type="text" id="mSuburb" value="' + esc(member.suburb || '') + '">') +
      '</div>' +
      field('Mailing address <span class="adm-optional">(optional)</span>',
        '<textarea id="mAddress" rows="3" placeholder="12 Example St\nWyndham Vale VIC 3024">' +
        esc(member.mailingAddress || '') + '</textarea>') +
      field('Special dates',
        '<textarea id="mSpecial" placeholder="Baptism: 2019-04-21; Wedding anniversary: 2012-06-10">' +
        esc(member.specialDates || '') + '</textarea>',
        'One per line or separated by semicolons, in the form <code>Label: YYYY-MM-DD</code>.') +
      '<div class="adm-grid-2">' +
        field('Family group name', '<input type="text" id="mFamily" value="' +
          esc(member.familyGroupName || '') + '">',
          'Used by parents to find their children at Sunday School check-in.') +
        field('Notes', '<input type="text" id="mNotes" value="' + esc(member.notes || '') + '">') +
      '</div>' +
      '<div class="adm-field">' +
        '<span class="adm-legend">Flags</span>' +
        checkbox('mSundaySchooler', 'Sunday Schooler', member.sundaySchooler) +
        checkbox('mFamilyGrouped', 'Grouped as family', member.familyGrouped) +
        checkbox('mActive', 'Active member',
          member.memberId ? member.active : true) +
      '</div>';
  }

  function readMemberForm() {
    return {
      firstName: val('mFirst'),
      lastName: val('mLast'),
      dob: val('mDob'),
      mobile: val('mMobile'),
      email: val('mEmail'),
      suburb: val('mSuburb'),
      mailingAddress: val('mAddress'),
      specialDates: val('mSpecial'),
      familyGroupName: val('mFamily'),
      notes: val('mNotes'),
      sundaySchooler: checked('mSundaySchooler'),
      familyGrouped: checked('mFamilyGrouped'),
      active: checked('mActive')
    };
  }

  /** Lists every member; "new" opens the Add form above the list. */
  function viewMembers(arg) {
    loading('Loading members…');
    return A.call('listMembers').then(function (data) {
      renderMemberList(data.members, '');
      if (arg === 'new') renderMemberAdd();
    }).catch(fail);
  }

  /* Stays open after each save, with the form cleared, so a family can be
     entered one person after another. */
  function renderMemberAdd() {
    var slot = document.getElementById('memberEditSlot');
    slot.innerHTML =
      '<div class="adm-panel" style="background:var(--cream);margin-bottom:22px;">' +
        '<h2 style="font-size:1.15rem;">Add a member</h2>' +
        '<p class="adm-sub">Adds a church goer to the <strong>Member Data</strong> sheet. Tick ' +
        '<em>Sunday Schooler</em> for children who attend Sunday School — the Sunday School ' +
        'roster is built from that flag.</p>' +
        '<div class="adm-msg" id="memberAddMsg"></div>' +
        '<form class="adm-form" id="addMemberForm">' +
          memberFormFields(null) +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="submit" id="mSave">Add Member</button>' +
            '<button class="adm-btn secondary" type="button" id="mCancel">Close</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.getElementById('mFirst').focus();

    on('mCancel', 'click', function () { slot.innerHTML = ''; });

    on('addMemberForm', 'submit', function (e) {
      e.preventDefault();
      busy('mSave', true, 'Saving…');
      A.call('addMember', readMemberForm()).then(function (data) {
        return viewMembers('new').then(function () { msg('memberAddMsg', data.message, 'ok'); });
      }).catch(function (err) {
        busy('mSave', false);
        msg('memberAddMsg', err.message, 'error');
      });
    });
  }

  function renderMemberList(members, query) {
    elView.innerHTML = panel('Members',
      'Everyone on the <strong>Member Data</strong> sheet. Search by name, family group or ' +
      'suburb, then edit the record.',
      '<div class="adm-msg" id="memberMsg"></div>' +
      '<div id="memberEditSlot"></div>' +
      '<div class="adm-toolbar">' +
        field('Search', '<input type="search" id="memberSearch" placeholder="Name, family group or suburb" value="' +
          esc(query || '') + '">') +
        '<div class="adm-field">' +
          '<button class="adm-btn" type="button" id="memberAdd">Add a Member</button></div>' +
        '<div class="adm-field">' +
          '<span class="adm-hint" id="memberCount" style="margin:0;"></span></div>' +
      '</div>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th>ID</th><th>Name</th><th>Family group</th><th>Suburb</th><th>DOB</th>' +
        '<th>Sun. Schooler</th><th>Active</th><th></th>' +
      '</tr></thead><tbody id="memberRows"></tbody></table></div>');

    function draw() {
      var q = val('memberSearch').toLowerCase();
      var shown = members.filter(function (m) {
        if (!q) return true;
        return (m.firstName + ' ' + m.lastName).toLowerCase().indexOf(q) !== -1 ||
               (m.familyGroupName || '').toLowerCase().indexOf(q) !== -1 ||
               (m.suburb || '').toLowerCase().indexOf(q) !== -1 ||
               m.memberId.toLowerCase().indexOf(q) !== -1;
      });
      document.getElementById('memberCount').textContent =
        shown.length + ' of ' + members.length + ' member' + (members.length === 1 ? '' : 's');
      document.getElementById('memberRows').innerHTML = shown.length
        ? shown.map(function (m) {
            return '<tr>' +
              '<td>' + esc(m.memberId) + '</td>' +
              '<td><strong>' + esc(m.lastName) + '</strong>, ' + esc(m.firstName) + '</td>' +
              '<td>' + esc(m.familyGroupName || '—') + '</td>' +
              '<td>' + esc(m.suburb || '—') + '</td>' +
              '<td>' + esc(m.dob || '—') + '</td>' +
              '<td>' + yesNo(m.sundaySchooler) + '</td>' +
              '<td>' + yesNo(m.active) + '</td>' +
              '<td><button class="adm-btn small secondary" data-edit-member="' +
                esc(m.memberId) + '">Edit</button></td>' +
            '</tr>';
          }).join('')
        : '<tr><td colspan="8">No members match that search.</td></tr>';

      document.getElementById('memberRows').querySelectorAll('[data-edit-member]')
        .forEach(function (btn) {
          btn.addEventListener('click', function () {
            var member = members.filter(function (m) {
              return m.memberId === btn.getAttribute('data-edit-member');
            })[0];
            if (member) renderMemberEditor(member);
          });
        });
    }

    on('memberSearch', 'input', draw);
    on('memberAdd', 'click', renderMemberAdd);
    draw();
  }

  function renderMemberEditor(member) {
    document.getElementById('memberEditSlot').innerHTML =
      '<div class="adm-panel" style="background:var(--cream);margin-bottom:22px;">' +
        '<h2 style="font-size:1.15rem;">Editing ' + esc(member.firstName + ' ' + member.lastName) +
          ' <span class="adm-pill grey">' + esc(member.memberId) + '</span></h2>' +
        '<form class="adm-form" id="editMemberForm">' +
          memberFormFields(member) +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="submit" id="emSave">Save Changes</button>' +
            '<button class="adm-btn secondary" type="button" id="emCancel">Cancel</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.getElementById('memberEditSlot').scrollIntoView({ behavior: 'smooth', block: 'start' });

    on('emCancel', 'click', function () {
      document.getElementById('memberEditSlot').innerHTML = '';
    });

    on('editMemberForm', 'submit', function (e) {
      e.preventDefault();
      busy('emSave', true, 'Saving…');
      var payload = readMemberForm();
      payload.memberId = member.memberId;
      A.call('updateMember', payload).then(function (data) {
        return viewMembers().then(function () { msg('memberMsg', data.message, 'ok'); });
      }).catch(function (err) {
        busy('emSave', false);
        msg('memberMsg', err.message, 'error');
      });
    });
  }

  /* ── Tracking: Sunday Attendance ─────────────────────────────────────── */

  function viewSundayAttendance() {
    var sunday = A.lastSunday();
    elView.innerHTML = panel('Sunday Attendance',
      'Pick the service date, search for a person or family group, then tick ' +
      'everyone who was present. Whole family groups are listed, including ' +
      'anyone marked inactive, so nobody is missing when you work through a ' +
      'family. Saving writes to the ' +
      '<strong>Attendance Tracking Data</strong> sheet — you can come back and ' +
      'edit the same Sunday as often as you like.',
      '<div class="adm-msg" id="attMsg"></div>' +
      '<div class="adm-toolbar">' +
        field('Service date', '<input type="date" id="attDate" value="' + esc(sunday) + '">') +
        field('Search', '<input type="search" id="attSearch" placeholder="Name or family group">') +
        '<div class="adm-field">' +
          '<button class="adm-btn secondary" id="attLoad">Load</button></div>' +
      '</div>' +
      '<div id="attBody"></div>');

    on('attLoad', 'click', loadAttendance);
    on('attDate', 'change', loadAttendance);
    loadAttendance();
  }

  /** Returns a promise so callers can post a message after the reload. */
  function loadAttendance(keepMessage) {
    var date = val('attDate');
    var body = document.getElementById('attBody');
    if (!date) {
      msg('attMsg', 'Pick a service date first.', 'error');
      return Promise.resolve();
    }
    body.innerHTML = '<p class="adm-sub">Loading the roll for ' + esc(A.prettyDate(date)) + '…</p>';
    if (!keepMessage) msg('attMsg', '');

    return A.call('getAttendance', { serviceDate: date }).then(function (data) {
      renderAttendance(data.serviceDate, data.rows);
    }).catch(function (err) {
      body.innerHTML = '';
      msg('attMsg', err.message, 'error');
    });
  }

  function renderAttendance(date, rows) {
    var state = {};
    rows.forEach(function (row) { state[row.memberId] = row.present; });

    document.getElementById('attBody').innerHTML =
      '<div class="adm-stats">' +
        '<div class="adm-stat"><div class="v" id="attPresentCount">0</div>' +
          '<div class="k">Ticked present</div></div>' +
        '<div class="adm-stat"><div class="v" id="attKidCount">0</div>' +
          '<div class="k">Sunday Schoolers present</div></div>' +
        '<div class="adm-stat"><div class="v">' + rows.length + '</div>' +
          '<div class="k">Number of Attendees Registered</div></div>' +
      '</div>' +
      '<p class="adm-sub"><strong>' + esc(A.prettyDate(date)) + '</strong></p>' +
      '<div class="adm-actions" style="margin-bottom:16px;">' +
        '<button class="adm-btn" id="attSave">Save Attendance</button>' +
        '<button class="adm-btn secondary small" id="attAllShown">Tick all shown</button>' +
        '<button class="adm-btn secondary small" id="attNoneShown">Clear all shown</button>' +
      '</div>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th style="width:56px;">Present</th><th>Name</th><th>Family group</th>' +
        '<th>Sun. Schooler</th><th>Last recorded</th>' +
      '</tr></thead><tbody id="attRows"></tbody></table></div>';

    function updateCounts() {
      var present = 0, kids = 0;
      rows.forEach(function (row) {
        if (state[row.memberId]) {
          present++;
          if (row.sundaySchooler) kids++;
        }
      });
      document.getElementById('attPresentCount').textContent = present;
      document.getElementById('attKidCount').textContent = kids;
    }

    function visibleRows() {
      var q = val('attSearch').toLowerCase();
      return rows.filter(function (row) {
        if (!q) return true;
        return (row.firstName + ' ' + row.lastName).toLowerCase().indexOf(q) !== -1 ||
               (row.familyGroupName || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    function draw() {
      var shown = visibleRows();
      var lastGroup = null;
      var html = '';
      shown.forEach(function (row) {
        var group = row.familyGroupName || 'No family group';
        if (group !== lastGroup) {
          html += '<tr class="is-group-head"><td colspan="5">' + esc(group) + '</td></tr>';
          lastGroup = group;
        }
        html += '<tr>' +
          '<td><input type="checkbox" data-att="' + esc(row.memberId) + '"' +
            (state[row.memberId] ? ' checked' : '') +
            ' aria-label="' + esc(row.firstName + ' ' + row.lastName) + ' present"></td>' +
          '<td><strong>' + esc(row.lastName) + '</strong>, ' + esc(row.firstName) +
            (row.active === false ? ' <span class="adm-pill grey">Inactive</span>' : '') + '</td>' +
          '<td>' + esc(row.familyGroupName || '—') + '</td>' +
          '<td>' + yesNo(row.sundaySchooler) + '</td>' +
          '<td>' + (row.recorded
            ? esc(row.recordedAt.replace('T', ' ')) + '<br><span class="adm-hint" style="margin:0;">' +
              esc(row.recordedBy) + '</span>'
            : '<span class="adm-pill grey">not yet</span>') + '</td>' +
        '</tr>';
      });

      document.getElementById('attRows').innerHTML = shown.length
        ? html
        : '<tr><td colspan="5">Nobody matches that search. Add them under ' +
          '<a href="#/members/new">Add a Member</a>.</td></tr>';

      document.getElementById('attRows').querySelectorAll('[data-att]').forEach(function (box) {
        box.addEventListener('change', function () {
          state[box.getAttribute('data-att')] = box.checked;
          updateCounts();
        });
      });
    }

    function setAllShown(value) {
      visibleRows().forEach(function (row) { state[row.memberId] = value; });
      draw();
      updateCounts();
    }

    on('attSearch', 'input', draw);
    on('attAllShown', 'click', function () { setAllShown(true); });
    on('attNoneShown', 'click', function () { setAllShown(false); });

    on('attSave', 'click', function () {
      busy('attSave', true, 'Saving…');
      /* Only ticked members are sent — absentees are never recorded. */
      var entries = rows.filter(function (row) { return !!state[row.memberId]; })
        .map(function (row) {
          return { memberId: row.memberId, present: true };
        });
      A.call('saveAttendance', { serviceDate: date, entries: entries }).then(function (data) {
        return loadAttendance(true).then(function () {
          msgHtml('attMsg', esc(data.message) +
            ' <a href="#/tracking/sunday-school">Set up Sunday School for this date →</a>', 'ok');
        });
      }).catch(function (err) {
        busy('attSave', false);
        msg('attMsg', err.message, 'error');
      });
    });

    draw();
    updateCounts();
  }

  /* ── Tracking: Setup Sunday School ───────────────────────────────────── */

  function viewSetupSundaySchool() {
    var sunday = A.lastSunday();
    var link = window.location.origin + A.checkinPath;

    elView.innerHTML = panel('Setup Sunday School',
      'This pre-fills the Sunday School roster from everyone marked ' +
      '<strong>present</strong> on the chosen Sunday who is flagged as a ' +
      '<strong>Sunday Schooler</strong>. Parents then sign their children in and ' +
      'out from the link below, and every action is timestamped on the ' +
      '<strong>Sunday School Data</strong> sheet. At sign-in the parent chooses their ' +
      'own 4-digit PIN, which they must give back to sign the child out, and no ' +
      'child can be collected until 15 minutes after sign-in — the ' +
      '<strong>PIN</strong> column below is there for when a parent forgets theirs.',
      '<div class="adm-msg" id="ssMsg"></div>' +
      '<div class="adm-toolbar">' +
        field('Service date', '<input type="date" id="ssDate" value="' + esc(sunday) + '">') +
        '<div class="adm-field">' +
          '<button class="adm-btn" id="ssSetup">Set Up Roster</button></div>' +
        '<div class="adm-field">' +
          '<button class="adm-btn secondary" id="ssRefresh">Refresh</button></div>' +
      '</div>' +
      '<div class="adm-panel" style="background:var(--cream);margin-bottom:22px;padding:18px 20px;">' +
        '<span class="adm-legend">Parent check-in link</span>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
          '<code id="ssLink" style="font-size:0.9rem;word-break:break-all;">' + esc(link) + '</code>' +
          '<button class="adm-btn small secondary" id="ssCopy">Copy</button>' +
          '<a class="adm-btn small secondary" href="' + esc(A.checkinPath) +
            '" target="_blank" rel="noopener">Open</a>' +
        '</div>' +
        '<div class="adm-hint">Share this with parents — no login needed. It always shows ' +
          'the most recent roster you have set up.</div>' +
      '</div>' +
      '<div id="ssBody"></div>');

    on('ssCopy', 'click', function () {
      var text = document.getElementById('ssLink').textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          msg('ssMsg', 'Check-in link copied to the clipboard.', 'ok');
        }).catch(function () {
          msg('ssMsg', 'Could not copy automatically — select the link and copy it.', 'info');
        });
      } else {
        msg('ssMsg', 'Select the link above and copy it.', 'info');
      }
    });

    on('ssSetup', 'click', function () {
      var date = val('ssDate');
      if (!date) { msg('ssMsg', 'Pick a service date first.', 'error'); return; }
      busy('ssSetup', true, 'Setting up…');
      A.call('setupSundaySchool', { serviceDate: date }).then(function (data) {
        msg('ssMsg', data.message, data.roster.length ? 'ok' : 'info');
        renderSsRoster(data.serviceDate, data.roster);
      }).catch(function (err) {
        msg('ssMsg', err.message, 'error');
      }).then(function () { busy('ssSetup', false); });
    });

    on('ssRefresh', 'click', loadSsRoster);
    on('ssDate', 'change', loadSsRoster);
    loadSsRoster();
  }

  function loadSsRoster() {
    var date = val('ssDate');
    if (!date) return;
    document.getElementById('ssBody').innerHTML = '<p class="adm-sub">Loading roster…</p>';
    A.call('getSundaySchool', { serviceDate: date }).then(function (data) {
      renderSsRoster(data.serviceDate, data.roster);
    }).catch(function (err) {
      document.getElementById('ssBody').innerHTML = '';
      msg('ssMsg', err.message, 'error');
    });
  }

  function ssStatusPill(status) {
    if (status === 'Signed In')  return '<span class="adm-pill blue">Signed in</span>';
    if (status === 'Signed Out') return '<span class="adm-pill green">Signed out</span>';
    return '<span class="adm-pill gold">Expected</span>';
  }

  function renderSsRoster(date, roster) {
    var counts = { expected: 0, signedIn: 0, signedOut: 0 };
    roster.forEach(function (kid) {
      if (kid.status === 'Signed In') counts.signedIn++;
      else if (kid.status === 'Signed Out') counts.signedOut++;
      else counts.expected++;
    });

    document.getElementById('ssBody').innerHTML =
      '<p class="adm-sub"><strong>' + esc(A.prettyDate(date)) + '</strong></p>' +
      '<div class="adm-stats">' +
        '<div class="adm-stat"><div class="v">' + roster.length + '</div>' +
          '<div class="k">On the roster</div></div>' +
        '<div class="adm-stat"><div class="v">' + counts.expected + '</div>' +
          '<div class="k">Not signed in</div></div>' +
        '<div class="adm-stat"><div class="v">' + counts.signedIn + '</div>' +
          '<div class="k">Currently in care</div></div>' +
        '<div class="adm-stat"><div class="v">' + counts.signedOut + '</div>' +
          '<div class="k">Signed out</div></div>' +
      '</div>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th>Child</th><th>Family group</th><th>Status</th><th>PIN</th>' +
        '<th>Signed in</th><th>By</th><th>Signed out</th><th>By</th>' +
      '</tr></thead><tbody>' +
      (roster.length ? roster.map(function (kid) {
        return '<tr>' +
          '<td><strong>' + esc(kid.lastName) + '</strong>, ' + esc(kid.firstName) + '</td>' +
          '<td>' + esc(kid.familyGroupName || '—') + '</td>' +
          '<td>' + ssStatusPill(kid.status) + '</td>' +
          '<td>' + (kid.pin ? '<code>' + esc(kid.pin) + '</code>' : '—') + '</td>' +
          '<td>' + esc(A.prettyTime(kid.signInAt) || '—') + '</td>' +
          '<td>' + esc(kid.signedInBy || '—') + '</td>' +
          '<td>' + esc(A.prettyTime(kid.signOutAt) || '—') + '</td>' +
          '<td>' + esc(kid.signedOutBy || '—') + '</td>' +
        '</tr>';
      }).join('')
        : '<tr><td colspan="8">No roster for this date yet. Record Sunday attendance ' +
          'first, then press <strong>Set Up Roster</strong>.</td></tr>') +
      '</tbody></table></div>';
  }

  /* ── Reports ─────────────────────────────────────────────────────────── */

  function defaultRange(weeks) {
    var to = new Date();
    var from = new Date();
    from.setDate(from.getDate() - (weeks || 4) * 7);
    return { from: A.isoDate(from), to: A.isoDate(to) };
  }

  function reportToolbar(prefix, range) {
    return '<div class="adm-toolbar no-print">' +
      field('From', '<input type="date" id="' + prefix + 'From" value="' + esc(range.from) + '">') +
      field('To', '<input type="date" id="' + prefix + 'To" value="' + esc(range.to) + '">') +
      '<div class="adm-field">' +
        '<button class="adm-btn" id="' + prefix + 'Run">Generate</button></div>' +
      '<div class="adm-field">' +
        '<button class="adm-btn secondary" id="' + prefix + 'Week">This Week</button></div>' +
      '<div class="adm-field">' +
        '<button class="adm-btn secondary" id="' + prefix + 'Csv">Export CSV</button></div>' +
      '<div class="adm-field">' +
        '<button class="adm-btn secondary" id="' + prefix + 'Print">Print</button></div>' +
    '</div>';
  }

  function viewAttendanceReport() {
    var range = defaultRange(4);
    elView.innerHTML = panel('Attendance Report',
      'Weekly totals from the <strong>Attendance Tracking Data</strong> sheet. ' +
      'Use <em>This Week</em> for the current Sunday, or set any date range.',
      '<div class="adm-msg" id="repMsg"></div>' +
      reportToolbar('rep', range) +
      '<div id="repBody"></div>');

    var latest = null;

    function run() {
      document.getElementById('repBody').innerHTML = '<p class="adm-sub">Generating…</p>';
      msg('repMsg', '');
      A.call('attendanceReport', { from: val('repFrom'), to: val('repTo') })
        .then(function (data) {
          latest = data;
          renderAttendanceReport(data);
        })
        .catch(function (err) {
          document.getElementById('repBody').innerHTML = '';
          msg('repMsg', err.message, 'error');
        });
    }

    on('repRun', 'click', run);
    on('repPrint', 'click', function () { window.print(); });
    on('repWeek', 'click', function () {
      var sunday = A.lastSunday();
      document.getElementById('repFrom').value = sunday;
      document.getElementById('repTo').value = sunday;
      run();
    });
    on('repCsv', 'click', function () {
      if (!latest) { msg('repMsg', 'Generate the report first.', 'info'); return; }
      var rows = [['Service Date', 'Member ID', 'First Name', 'Last Name',
                   'Family Group', 'Sunday Schooler', 'Present', 'Recorded By']];
      latest.detail.forEach(function (row) {
        rows.push([row.serviceDate, row.memberId, row.firstName, row.lastName,
                   row.familyGroupName, row.sundaySchooler ? 'Yes' : 'No',
                   row.present ? 'Present' : 'Absent', row.recordedBy]);
      });
      downloadCsv('wynlife-attendance-' + (latest.from || 'all') + '-to-' +
                  (latest.to || 'all') + '.csv', rows);
    });

    run();
  }

  function renderAttendanceReport(data) {
    if (!data.weeks.length) {
      document.getElementById('repBody').innerHTML =
        '<p class="adm-sub">No attendance has been recorded in that date range.</p>';
      return;
    }

    document.getElementById('repBody').innerHTML =
      '<div class="adm-stats">' +
        '<div class="adm-stat"><div class="v">' + data.totals.services + '</div>' +
          '<div class="k">Services</div></div>' +
        '<div class="adm-stat"><div class="v">' + data.totals.totalPresent + '</div>' +
          '<div class="k">Total attendances</div></div>' +
        '<div class="adm-stat"><div class="v">' + data.totals.averagePresent + '</div>' +
          '<div class="k">Average per Sunday</div></div>' +
      '</div>' +
      '<h3 style="font-family:\'Merriweather\',serif;color:var(--navy);font-size:1.05rem;margin:6px 0 12px;">' +
        'Week by week</h3>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th>Service date</th><th class="num">Present</th><th class="num">Adults / Youth</th>' +
        '<th class="num">Sunday Schoolers</th><th class="num">Family groups</th>' +
        '<th class="num">Marked absent</th>' +
      '</tr></thead><tbody>' +
      data.weeks.map(function (week) {
        return '<tr>' +
          '<td>' + esc(A.prettyDate(week.serviceDate)) + '</td>' +
          '<td class="num"><strong>' + week.present + '</strong></td>' +
          '<td class="num">' + week.adults + '</td>' +
          '<td class="num">' + week.sundaySchoolers + '</td>' +
          '<td class="num">' + week.familyGroups + '</td>' +
          '<td class="num">' + week.absent + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<h3 style="font-family:\'Merriweather\',serif;color:var(--navy);font-size:1.05rem;margin:26px 0 12px;">' +
        'Who attended</h3>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th>Service date</th><th>Name</th><th>Family group</th>' +
        '<th>Sun. Schooler</th><th>Status</th>' +
      '</tr></thead><tbody>' +
      data.detail.filter(function (row) { return row.present; }).map(function (row) {
        return '<tr>' +
          '<td>' + esc(row.serviceDate) + '</td>' +
          '<td><strong>' + esc(row.lastName) + '</strong>, ' + esc(row.firstName) + '</td>' +
          '<td>' + esc(row.familyGroupName || '—') + '</td>' +
          '<td>' + yesNo(row.sundaySchooler) + '</td>' +
          '<td><span class="adm-pill green">Present</span></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function viewSundaySchoolReport() {
    var range = defaultRange(4);
    elView.innerHTML = panel('Sunday School Report',
      'Sign in and sign out log from the <strong>Sunday School Data</strong> sheet, ' +
      'including how long each child was in care and anyone still signed in.',
      '<div class="adm-msg" id="ssrMsg"></div>' +
      reportToolbar('ssr', range) +
      '<div id="ssrBody"></div>');

    var latest = null;

    function run() {
      document.getElementById('ssrBody').innerHTML = '<p class="adm-sub">Generating…</p>';
      msg('ssrMsg', '');
      A.call('sundaySchoolReport', { from: val('ssrFrom'), to: val('ssrTo') })
        .then(function (data) {
          latest = data;
          renderSundaySchoolReport(data);
        })
        .catch(function (err) {
          document.getElementById('ssrBody').innerHTML = '';
          msg('ssrMsg', err.message, 'error');
        });
    }

    on('ssrRun', 'click', run);
    on('ssrPrint', 'click', function () { window.print(); });
    on('ssrWeek', 'click', function () {
      var sunday = A.lastSunday();
      document.getElementById('ssrFrom').value = sunday;
      document.getElementById('ssrTo').value = sunday;
      run();
    });
    on('ssrCsv', 'click', function () {
      if (!latest) { msg('ssrMsg', 'Generate the report first.', 'info'); return; }
      var rows = [['Service Date', 'Member ID', 'First Name', 'Last Name', 'Family Group',
                   'Status', 'Sign In At', 'Signed In By', 'Sign Out At', 'Signed Out By',
                   'Minutes In Care']];
      latest.detail.forEach(function (row) {
        rows.push([row.serviceDate, row.memberId, row.firstName, row.lastName,
                   row.familyGroupName, row.status, row.signInAt, row.signedInBy,
                   row.signOutAt, row.signedOutBy, row.minutesInCare]);
      });
      downloadCsv('wynlife-sunday-school-' + (latest.from || 'all') + '-to-' +
                  (latest.to || 'all') + '.csv', rows);
    });

    run();
  }

  function renderSundaySchoolReport(data) {
    if (!data.weeks.length) {
      document.getElementById('ssrBody').innerHTML =
        '<p class="adm-sub">No Sunday School records in that date range.</p>';
      return;
    }

    document.getElementById('ssrBody').innerHTML =
      '<div class="adm-stats">' +
        '<div class="adm-stat"><div class="v">' + data.totals.services + '</div>' +
          '<div class="k">Sundays</div></div>' +
        '<div class="adm-stat"><div class="v">' + data.totals.totalSignedIn + '</div>' +
          '<div class="k">Total sign-ins</div></div>' +
        '<div class="adm-stat"><div class="v">' + data.totals.averageSignedIn + '</div>' +
          '<div class="k">Average per Sunday</div></div>' +
        '<div class="adm-stat"><div class="v">' + data.totals.stillSignedIn + '</div>' +
          '<div class="k">Never signed out</div></div>' +
      '</div>' +
      '<h3 style="font-family:\'Merriweather\',serif;color:var(--navy);font-size:1.05rem;margin:6px 0 12px;">' +
        'Week by week</h3>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th>Service date</th><th class="num">On roster</th><th class="num">Signed in</th>' +
        '<th class="num">Signed out</th><th class="num">Still signed in</th>' +
        '<th class="num">Never arrived</th>' +
      '</tr></thead><tbody>' +
      data.weeks.map(function (week) {
        return '<tr>' +
          '<td>' + esc(A.prettyDate(week.serviceDate)) + '</td>' +
          '<td class="num">' + week.expected + '</td>' +
          '<td class="num"><strong>' + week.signedIn + '</strong></td>' +
          '<td class="num">' + week.signedOut + '</td>' +
          '<td class="num">' + week.stillIn + '</td>' +
          '<td class="num">' + (week.expected - week.signedIn) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<h3 style="font-family:\'Merriweather\',serif;color:var(--navy);font-size:1.05rem;margin:26px 0 12px;">' +
        'Sign in / sign out log</h3>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th>Service date</th><th>Child</th><th>Family group</th><th>Status</th>' +
        '<th>In</th><th>By</th><th>Out</th><th>By</th><th class="num">Mins</th>' +
      '</tr></thead><tbody>' +
      data.detail.map(function (row) {
        return '<tr>' +
          '<td>' + esc(row.serviceDate) + '</td>' +
          '<td><strong>' + esc(row.lastName) + '</strong>, ' + esc(row.firstName) + '</td>' +
          '<td>' + esc(row.familyGroupName || '—') + '</td>' +
          '<td>' + ssStatusPill(row.status) + '</td>' +
          '<td>' + esc(A.prettyTime(row.signInAt) || '—') + '</td>' +
          '<td>' + esc(row.signedInBy || '—') + '</td>' +
          '<td>' + esc(A.prettyTime(row.signOutAt) || '—') + '</td>' +
          '<td>' + esc(row.signedOutBy || '—') + '</td>' +
          '<td class="num">' + esc(row.minutesInCare === '' ? '—' : row.minutesInCare) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* ══ Newsletter ═══════════════════════════════════════════════════════
     The Email Administrator's corner of the console: compose an issue from
     this week's words and pictures, watch it build in the preview, then send
     it to the Newsletter Recipients list through Brevo.                   */

  var W = window.WynNewsletter;

  /* The issue being edited, and the row it belongs to once it has been
     saved. Both live here so a preview refresh does not have to re-read the
     form, and so leaving the screen and coming back starts clean.        */
  var nlDraft = null;
  var nlId = '';
  var nlPreviewTimer = null;

  /* ── Reading and writing the draft by path ── */

  function nlGet(path) {
    var node = nlDraft;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (node === null || node === undefined) return '';
      node = node[parts[i]];
    }
    return node === null || node === undefined ? '' : node;
  }

  function nlSet(path, value) {
    var parts = String(path).split('.');
    var node = nlDraft;
    for (var i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] === null || node[parts[i]] === undefined) {
        node[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }

  /* ── Form pieces, all bound by their data-nl path ── */

  function nlText(label, path, hint, placeholder) {
    return field(esc(label),
      '<input type="text" data-nl="' + path + '" value="' + esc(nlGet(path)) + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>',
      hint ? esc(hint) : '');
  }

  function nlArea(label, path, hint, rows) {
    return field(esc(label),
      '<textarea data-nl="' + path + '" rows="' + (rows || 5) + '">' +
      esc(nlGet(path)) + '</textarea>',
      hint ? esc(hint) : '');
  }

  function nlCheck(path, label) {
    return '<label class="adm-check"><input type="checkbox" data-nl="' + path + '"' +
      (nlGet(path) === false ? '' : ' checked') + '> <span>' + esc(label) + '</span></label>';
  }

  /** A picture: paste a link, or upload one and we host it for you. */
  function nlImage(label, path, hint) {
    var url = nlGet(path);
    return '<div class="adm-field nl-image">' +
      '<label>' + esc(label) + '</label>' +
      '<input type="text" data-nl="' + path + '" data-nl-url value="' + esc(url) + '" ' +
      'placeholder="https://…">' +
      '<div class="nl-image-row">' +
        '<label class="adm-btn small secondary nl-upload">Upload a picture' +
          '<input type="file" accept="image/*" data-nl-upload="' + path + '" hidden>' +
        '</label>' +
        '<span class="adm-hint" data-nl-upload-msg="' + path + '"></span>' +
      '</div>' +
      '<div class="nl-thumb"><img data-nl-thumb="' + path + '" src="' + esc(url) + '" alt=""' +
        (url ? '' : ' hidden') + '></div>' +
      (hint ? '<div class="adm-hint">' + esc(hint) + '</div>' : '') +
    '</div>';
  }

  /** Fixed rows of "label / value" — Food Bank dates, giving account details. */
  function nlRows(label, path, count, hint) {
    var list = nlGet(path) || [];
    var out = '<div class="adm-field"><label>' + esc(label) + '</label>';
    for (var i = 0; i < count; i++) {
      var item = list[i] || {};
      out += '<div class="nl-kv">' +
        '<input type="text" data-nl="' + path + '.' + i + '.k" placeholder="Label" value="' +
          esc(item.k || '') + '">' +
        '<input type="text" data-nl="' + path + '.' + i + '.v" placeholder="Value" value="' +
          esc(item.v || '') + '">' +
      '</div>';
    }
    out += (hint ? '<div class="adm-hint">' + esc(hint) + '</div>' : '') + '</div>';
    return out;
  }

  /**
   * One collapsible section of the composer. Pass `movable` as the slot's
   * index to make it draggable — the announcements are the only sections
   * whose order is the writer's to choose.
   */
  function nlSection(number, title, sub, bodyHtml, open, movable) {
    var draggable = typeof movable === 'number';
    return '<details class="nl-section' + (draggable ? ' is-movable' : '') + '"' +
      (draggable ? ' data-ann="' + movable + '"' : '') + (open ? ' open' : '') + '>' +
      '<summary>' +
      (draggable ? nlGrip(movable) : '') +
      '<span class="nl-num">' + esc(number) + '</span>' +
      '<span class="nl-title">' + esc(title) + '</span>' +
      '<span class="nl-sub">' + esc(sub) + '</span></summary>' +
      '<div class="nl-section-body">' + bodyHtml + '</div>' +
    '</details>';
  }

  /**
   * The grab area. Dragging is the quick way, but it is mouse-only — it does
   * nothing on a tablet and nothing from a keyboard — so the same move is
   * always available as a pair of buttons.
   */
  function nlGrip(index) {
    return '<span class="nl-grip" title="Drag to reorder">' +
        '<span class="nl-grip-dots" aria-hidden="true">⠿</span>' +
        '<button type="button" class="nl-move" data-ann-move="' + index + '" ' +
          'data-ann-dir="-1" aria-label="Move this announcement earlier">↑</button>' +
        '<button type="button" class="nl-move" data-ann-move="' + index + '" ' +
          'data-ann-dir="1" aria-label="Move this announcement later">↓</button>' +
      '</span>';
  }

  /* ── The announcement slots, which the writer can reorder ──
     The order of nlDraft.announcements *is* the order they appear in the
     email, so a move is a move of that array and nothing else. The section
     numbering stays with the position rather than the content: "Section 3"
     means the third thing down the page, whatever is sitting there now.   */

  /* Which slots are expanded. Held out here rather than on the content
     object so it never reaches the saved JSON, and so a slot keeps its
     open/closed state as it moves. */
  var nlAnnOpen = [];

  function announcementsHtml() {
    return '<p class="nl-ann-hint">Sections 2–6 are yours to arrange. Drag one by its ' +
      '<span class="nl-grip-dots" aria-hidden="true">⠿</span> handle, or use the ' +
      '↑↓ buttons, to change the order they appear in the email.</p>' +
      '<div class="nl-ann-list" id="nlAnnouncements">' +
      nlDraft.announcements.map(announcementSection).join('') +
    '</div>';
  }

  function announcementSection(item, i) {
    var p = 'announcements.' + i + '.';
    return nlSection('Section ' + (i + 2), 'Announcement #' + (i + 1),
      item.title || item.label || 'nothing yet',
      nlCheck(p + 'enabled', 'Include this announcement') +
      '<div class="adm-grid-2">' +
        nlText('Kicker', p + 'label', 'Small label above the heading.', 'e.g. Gatherings') +
        nlText('Heading', p + 'title', '', 'e.g. Fellowship Lunch') +
      '</div>' +
      nlArea('Text', p + 'body', 'Leave a blank line between paragraphs.') +
      nlImage('Picture', p + 'imageUrl') +
      nlText('Picture description', p + 'imageAlt',
             'Shown when pictures are blocked. Worth filling in.') +
      nlRows('Details', p + 'details', 6,
             'Optional. Dates, times, address — anything that reads better as a list.') +
      '<div class="adm-grid-2">' +
        nlText('Quote', p + 'quote', '', 'A verse, if you want one') +
        nlText('Quote reference', p + 'quoteRef', '', 'e.g. 1 Thess. 5:16') +
      '</div>' +
      '<div class="adm-grid-2">' +
        nlText('Link text', p + 'linkLabel', '', 'e.g. Find a group') +
        nlText('Link address', p + 'linkUrl', '', 'https://…') +
      '</div>',
      nlAnnOpen[i], i);
  }

  /** Remembers what is expanded before the list is rebuilt underneath it. */
  function captureAnnOpen() {
    var host = document.getElementById('nlAnnouncements');
    if (!host) return;
    host.querySelectorAll('.nl-section[data-ann]').forEach(function (el) {
      nlAnnOpen[+el.getAttribute('data-ann')] = el.open;
    });
  }

  function renderAnnouncements() {
    var host = document.getElementById('nlAnnouncements');
    if (!host) return;
    /* The input handlers are delegated from #nlEditor, so replacing this
       markup does not cost us any bindings. */
    host.innerHTML = nlDraft.announcements.map(announcementSection).join('');
  }

  /** Moves a slot, carrying its expanded state with it. */
  function moveAnnouncement(from, to) {
    var list = nlDraft.announcements;
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    captureAnnOpen();
    list.splice(to, 0, list.splice(from, 1)[0]);
    nlAnnOpen.splice(to, 0, nlAnnOpen.splice(from, 1)[0]);
    renderAnnouncements();
    refreshPreview();
    msg('nlMsg', 'Announcement moved to position ' + (to + 1) + ' of ' + list.length +
        '. Save the draft to keep the new order.', 'info');
  }

  function bindAnnouncementOrdering() {
    var host = document.getElementById('nlAnnouncements');
    if (!host) return;
    var dragFrom = -1;

    function sectionOf(target) {
      return target && target.closest ? target.closest('.nl-section[data-ann]') : null;
    }

    function clearMarks() {
      host.querySelectorAll('.nl-section').forEach(function (el) {
        el.classList.remove('is-dragging', 'drop-before', 'drop-after');
      });
    }

    /* The up/down buttons live inside <summary>, where a plain click would
       also open the section. */
    host.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-ann-move]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var from = +btn.getAttribute('data-ann-move');
      moveAnnouncement(from, from + +btn.getAttribute('data-ann-dir'));
    });

    /* Only the grip starts a drag. Marking the whole section draggable all
       the time would stop you selecting text in the fields inside it. */
    host.addEventListener('mousedown', function (e) {
      var section = sectionOf(e.target);
      if (!section) return;
      section.draggable = !!e.target.closest('.nl-grip') && !e.target.closest('[data-ann-move]');
    });

    host.addEventListener('dragstart', function (e) {
      var section = sectionOf(e.target);
      if (!section || !section.draggable) return;
      dragFrom = +section.getAttribute('data-ann');
      section.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      /* Firefox will not start a drag unless something is on the clipboard. */
      e.dataTransfer.setData('text/plain', String(dragFrom));
      /* An expanded section makes a ghost the height of the page — drag the
         header bar instead. */
      var bar = section.querySelector('summary');
      if (bar && e.dataTransfer.setDragImage) {
        e.dataTransfer.setDragImage(bar, 20, bar.offsetHeight / 2);
      }
    });

    host.addEventListener('dragover', function (e) {
      if (dragFrom < 0) return;
      var section = sectionOf(e.target);
      if (!section) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var box = section.getBoundingClientRect();
      var after = e.clientY > box.top + box.height / 2;
      clearMarks();
      host.querySelector('.nl-section[data-ann="' + dragFrom + '"]')
        .classList.add('is-dragging');
      if (+section.getAttribute('data-ann') !== dragFrom) {
        section.classList.add(after ? 'drop-after' : 'drop-before');
      }
    });

    host.addEventListener('drop', function (e) {
      if (dragFrom < 0) return;
      var section = sectionOf(e.target);
      if (!section) return;
      e.preventDefault();
      var over = +section.getAttribute('data-ann');
      var box = section.getBoundingClientRect();
      var after = e.clientY > box.top + box.height / 2;
      var to = after ? over + 1 : over;
      /* Pulling an item out shifts everything below it up by one. */
      if (dragFrom < to) to -= 1;
      clearMarks();
      var from = dragFrom;
      dragFrom = -1;
      moveAnnouncement(from, to);
    });

    host.addEventListener('dragend', function () {
      dragFrom = -1;
      clearMarks();
      host.querySelectorAll('.nl-section[data-ann]').forEach(function (el) {
        el.draggable = false;
      });
    });

    /* Leaving the list entirely should not leave a stale drop line behind. */
    host.addEventListener('dragleave', function (e) {
      if (!host.contains(e.relatedTarget)) clearMarks();
    });
  }

  /* ── Compose ── */

  function viewNewsletterCompose(newsletterId) {
    /* #/newsletter/compose/sample — the worked example, ready to edit down. */
    if (newsletterId === 'sample') {
      nlDraft = W.sample();
      nlDraft.issueDate = A.isoDate(new Date());
      nlId = '';
      renderCompose('This is the sample issue — a full week filled in, pictures and ' +
                    'all. Edit it to suit, then press Save Draft to make it yours.');
      return;
    }
    if (newsletterId) {
      loading('Opening newsletter…');
      A.call('nlGet', { newsletterId: newsletterId }).then(function (data) {
        nlDraft = W.normalise(data.newsletter.content);
        /* A sent issue is the starting point for a new one, never edited in
           place — otherwise last week's record would quietly change. */
        if (data.newsletter.status === 'sent') {
          nlId = '';
          nlDraft.subject = '';
          nlDraft.issueDate = A.isoDate(new Date());
        } else {
          nlId = data.newsletter.newsletterId;
        }
        renderCompose(data.newsletter.status === 'sent'
          ? 'Started from ' + data.newsletter.subject + '. Save it to create a new draft.'
          : '');
      }).catch(fail);
      return;
    }
    if (!nlDraft) {
      nlDraft = W.blank();
      nlDraft.issueDate = A.isoDate(new Date());
      nlId = '';
    }
    renderCompose('');
  }

  function renderCompose(message) {
    var designs = W.DESIGNS.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === nlDraft.design ? ' selected' : '') +
        '>' + esc(d.label) + ' — ' + esc(d.note) + '</option>';
    }).join('');

    /* First time through, open the slots that already say something — plus
       the first three of a blank issue, so there is somewhere to start. */
    nlAnnOpen = nlDraft.announcements.map(function (item, i) {
      return !!(item.title || item.body || item.imageUrl) || i < 3;
    });

    var announcements = announcementsHtml();

    elView.innerHTML =
      '<div class="adm-panel">' +
        '<div class="adm-panel-head">' +
          '<div><h2>Compose Newsletter</h2>' +
          '<p class="adm-sub">Pick a design, write this week’s words, drop in the pictures. ' +
          'Giving, Child Safety, the header and the footer are already filled in — they say ' +
          'the same thing every week.</p></div>' +
        '</div>' +
        '<div class="adm-msg" id="nlMsg"></div>' +
        '<div class="nl-compose">' +

          '<div class="nl-editor" id="nlEditor">' +
            '<div class="adm-form" style="max-width:none;">' +
              field('Design', '<select data-nl="design" id="nlDesign">' + designs + '</select>') +
              '<div class="adm-grid-2">' +
                nlText('Subject line', 'subject',
                       'What people see in their inbox.') +
                field('Issue date',
                  '<input type="date" data-nl="issueDate" value="' +
                  esc(nlDraft.issueDate) + '">') +
              '</div>' +
              nlText('Preview text', 'preheader',
                     'The grey line of text after the subject in most inboxes.') +
            '</div>' +

            nlSection('Header', 'Masthead & service times', 'the same every week',
              nlImage('Banner', 'header.bannerUrl') +
              nlImage('Logo for the Editorial design', 'header.logoDarkUrl',
                      'The navy logo used on the pale paper design.') +
              nlArea('Corner text', 'header.kicker', 'One line per row.', 2) +
              [0, 1].map(function (i) {
                return '<div class="adm-grid-2">' +
                  nlText('Time ' + (i + 1) + ' label', 'header.times.' + i + '.label') +
                  nlText('Time ' + (i + 1) + ' value', 'header.times.' + i + '.value') +
                '</div>' +
                nlText('Time ' + (i + 1) + ' place', 'header.times.' + i + '.detail');
              }).join(''), false) +

            nlSection('Section 1', 'Upcoming Sermon', nlDraft.sermon.title || 'nothing yet',
              '<div class="adm-grid-2">' +
                nlText('Kicker', 'sermon.kicker', '', 'e.g. This Sunday · 10:00 AM') +
                nlText('Passage', 'sermon.reference', '', 'e.g. Joshua 1:1-9') +
              '</div>' +
              nlText('Sermon title', 'sermon.title') +
              nlArea('Sermon summary', 'sermon.body',
                     'Leave a blank line between paragraphs.', 7) +
              nlImage('Sermon picture', 'sermon.imageUrl') +
              nlText('Picture description', 'sermon.imageAlt'),
              true) +

            announcements +

            nlSection('Section 7', 'Giving', 'the same every week',
              nlCheck('giving.enabled', 'Include the giving section') +
              '<div class="adm-grid-2">' +
                nlText('Kicker', 'giving.label') +
                nlText('Heading', 'giving.title',
                       'Used by the Editorial design.') +
              '</div>' +
              nlArea('Text', 'giving.intro', '', 4) +
              nlRows('Account details', 'giving.rows', 5) +
              nlArea('Small print', 'giving.note', '', 3) +
              nlImage('Picture', 'giving.imageUrl'), false) +

            nlSection('Section 8', 'Child Safety', 'the same every week',
              nlCheck('childSafe.enabled', 'Include the child safety section') +
              nlText('Kicker', 'childSafe.label') +
              nlArea('Text', 'childSafe.body', '', 4) +
              nlImage('Picture 1', 'childSafe.images.0.url') +
              nlText('Picture 1 description', 'childSafe.images.0.alt') +
              nlImage('Picture 2', 'childSafe.images.1.url') +
              nlText('Picture 2 description', 'childSafe.images.1.alt'), false) +

            nlSection('Footer', 'Sign-off & contact details', 'the same every week',
              nlImage('Closing picture', 'footer.closingImageUrl') +
              nlArea('Closing heading', 'footer.closingTitle', 'One line per row.', 2) +
              nlText('Closing text', 'footer.closingText') +
              '<div class="adm-grid-2">' +
                nlText('Button text', 'footer.ctaLabel') +
                nlText('Button address', 'footer.ctaUrl') +
              '</div>' +
              nlImage('Footer logo', 'footer.logoUrl') +
              nlText('Church name', 'footer.orgName') +
              nlArea('Address & contact', 'footer.address', 'One line per row.', 3) +
              [0, 1, 2, 3].map(function (i) {
                return '<div class="adm-grid-2">' +
                  nlText('Link ' + (i + 1) + ' text', 'footer.links.' + i + '.label') +
                  nlText('Link ' + (i + 1) + ' address', 'footer.links.' + i + '.url') +
                '</div>';
              }).join('') +
              nlText('Sign-off line', 'footer.legal',
                     'The unsubscribe link is added after this automatically.'), false) +
          '</div>' +

          '<div class="nl-preview">' +
            '<div class="nl-preview-head">' +
              '<strong>Preview</strong>' +
              '<span class="nl-widths">' +
                '<button type="button" class="adm-btn small secondary is-on" data-nl-width="desktop">Desktop</button>' +
                '<button type="button" class="adm-btn small secondary" data-nl-width="mobile">Phone</button>' +
              '</span>' +
            '</div>' +
            '<div class="nl-preview-frame">' +
              '<iframe id="nlFrame" title="Newsletter preview"></iframe>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="nl-actions">' +
          '<button class="adm-btn" type="button" id="nlSave">Save Draft</button>' +
          '<button class="adm-btn secondary" type="button" id="nlTestOpen">Send a Test</button>' +
          '<button class="adm-btn secondary" type="button" id="nlSendOpen">Send to the List</button>' +
          '<button class="adm-btn secondary" type="button" id="nlDownload">Download HTML</button>' +
          '<a class="adm-btn secondary" href="#/newsletter">History</a>' +
          '<span class="adm-hint" id="nlSavedAs">' +
            (nlId ? 'Draft ' + esc(nlId) : 'Not saved yet') + '</span>' +
        '</div>' +
        '<div id="nlSendSlot"></div>' +
      '</div>';

    bindCompose();
    bindAnnouncementOrdering();
    refreshPreview();
    if (message) msg('nlMsg', message, 'info');
  }

  function bindCompose() {
    var editor = document.getElementById('nlEditor');

    /* Text as it is typed; tick boxes and dropdowns are handled on change. */
    editor.addEventListener('input', function (e) {
      var path = e.target.getAttribute('data-nl');
      if (!path || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return;
      nlSet(path, e.target.value);
      if (e.target.hasAttribute('data-nl-url')) syncThumb(path, e.target.value);
      schedulePreview();
    });

    editor.addEventListener('change', function (e) {
      var path = e.target.getAttribute('data-nl');
      if (path && e.target.type === 'checkbox') {
        nlSet(path, e.target.checked);
        schedulePreview();
        return;
      }
      if (path && e.target.tagName === 'SELECT') {
        nlSet(path, e.target.value);
        schedulePreview();
        return;
      }
      var uploadPath = e.target.getAttribute('data-nl-upload');
      if (uploadPath && e.target.files && e.target.files[0]) {
        uploadImage(uploadPath, e.target.files[0]);
        e.target.value = '';
      }
    });

    elView.querySelectorAll('[data-nl-width]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        elView.querySelectorAll('[data-nl-width]').forEach(function (other) {
          other.classList.toggle('is-on', other === btn);
        });
        document.querySelector('.nl-preview')
          .classList.toggle('is-mobile', btn.getAttribute('data-nl-width') === 'mobile');
      });
    });

    on('nlSave', 'click', function () {
      busy('nlSave', true, 'Saving…');
      saveDraft().then(function (data) {
        msg('nlMsg', data.message, 'ok');
      }).catch(function (err) {
        msg('nlMsg', err.message, 'error');
      }).then(function () { busy('nlSave', false); });
    });

    on('nlTestOpen', 'click', renderTestPanel);
    on('nlSendOpen', 'click', renderSendPanel);
    on('nlDownload', 'click', function () {
      var name = 'wynlife-newsletter-' + (nlDraft.issueDate || 'draft') + '-' +
                 nlDraft.design + '.html';
      var blob = new Blob([W.render(nlDraft)], { type: 'text/html;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  function syncThumb(path, url) {
    var thumb = elView.querySelector('[data-nl-thumb="' + path + '"]');
    if (!thumb) return;
    thumb.src = url || '';
    thumb.hidden = !url;
  }

  /* ── Preparing a picture for email ──
     A photo straight off a phone is 4000px wide and several megabytes. At
     600px in an inbox none of that is visible — it is just a slow download
     for every recipient, on whatever data plan they are on. So the browser
     shrinks and re-compresses before anything is uploaded.

     1200px is twice the widest column, which keeps it sharp on a retina
     screen and throws away the rest. JPEG unless the picture actually uses
     transparency, because a photo saved as a PNG is many times larger for no
     gain. Not WebP: Outlook on Windows renders through Word, which cannot
     display it, and those people would see a broken image instead of a
     smaller one.                                                          */

  var NL_MAX_EDGE = 1200;
  var NL_TARGET_BYTES = 500 * 1024;
  var NL_JPEG_QUALITY = [0.82, 0.72, 0.62, 0.5];

  /* Animation and vector art do not survive a trip through a canvas. */
  var NL_PASS_THROUGH = ['image/gif', 'image/svg+xml'];

  function readAsBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        /* data:image/jpeg;base64,AAAA… — Apps Script wants only the tail. */
        resolve(String(reader.result).split(',')[1] || '');
      };
      reader.onerror = function () { reject(new Error('That file could not be read.')); };
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Decodes the file at its true orientation. A photo taken sideways carries
   * an EXIF rotation flag rather than rotated pixels, and if that is ignored
   * the picture ends up on its side in the email.
   */
  function decodeImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () { return decodeViaElement(file); });
    }
    return decodeViaElement(file);
  }

  function decodeViaElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('That file could not be read as an image.'));
      };
      img.src = url;
    });
  }

  function drawTo(source, width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
  }

  /**
   * Shrinking by more than half in one step drops pixels rather than
   * averaging them, which makes fine detail sparkle. Halving repeatedly and
   * finishing on the exact size avoids that.
   */
  function scaleDown(source, width, height, targetW, targetH) {
    var canvas = null;
    var w = width;
    var h = height;
    var from = source;
    while (w / 2 > targetW) {
      w = Math.round(w / 2);
      h = Math.round(h / 2);
      canvas = drawTo(from, w, h);
      from = canvas;
    }
    return drawTo(from, targetW, targetH);
  }

  /** True if any pixel is even slightly see-through. */
  function usesTransparency(canvas) {
    try {
      var data = canvas.getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      for (var i = 3; i < data.length; i += 4) {
        if (data[i] < 255) return true;
      }
      return false;
    } catch (err) {
      /* If the pixels cannot be read, assume transparency and keep the PNG. */
      return true;
    }
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob); else reject(new Error('The picture could not be re-saved.'));
      }, type, quality);
    });
  }

  /** Re-encodes at falling quality until it comes in under the size target. */
  function encode(canvas, transparent, targetBytes) {
    if (transparent) return toBlob(canvas, 'image/png');
    var step = 0;
    function attempt() {
      return toBlob(canvas, 'image/jpeg', NL_JPEG_QUALITY[step]).then(function (blob) {
        step += 1;
        if (blob.size <= targetBytes || step >= NL_JPEG_QUALITY.length) return blob;
        return attempt();
      });
    }
    return attempt();
  }

  function kb(bytes) {
    return bytes >= 1024 * 1024
      ? (bytes / (1024 * 1024)).toFixed(1) + ' MB'
      : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  /**
   * Resolves to { base64, mimeType, name, note } ready to hand to the API.
   * `size` is { maxEdge, targetBytes, columnWidth }: the newsletter's are set
   * by its 600px column, the website's by the page (see WEB_IMAGE_SIZES).
   */
  function prepareImage(file, size) {
    var columnWidth = size.columnWidth;
    if (NL_PASS_THROUGH.indexOf(file.type) !== -1) {
      return readAsBase64(file).then(function (base64) {
        return {
          base64: base64,
          mimeType: file.type,
          name: file.name,
          note: 'Uploaded as-is (' + kb(file.size) + ').'
        };
      });
    }

    return decodeImage(file).then(function (source) {
      var width = source.width || source.naturalWidth;
      var height = source.height || source.naturalHeight;
      if (!width || !height) throw new Error('That image has no size the browser can read.');

      var scale = Math.min(1, size.maxEdge / Math.max(width, height));
      var targetW = Math.max(1, Math.round(width * scale));
      var targetH = Math.max(1, Math.round(height * scale));

      var canvas = scale < 1
        ? scaleDown(source, width, height, targetW, targetH)
        : drawTo(source, targetW, targetH);

      var transparent = usesTransparency(canvas);

      return encode(canvas, transparent, size.targetBytes).then(function (blob) {
        return readAsBase64(blob).then(function (base64) {
          var notes = [];
          if (scale < 1) {
            notes.push('Resized ' + width + '×' + height +
                       ' → ' + targetW + '×' + targetH + '.');
          }
          notes.push(kb(file.size) + ' → ' + kb(blob.size) + '.');
          /* Worth saying out loud: nothing can add detail that is not there. */
          if (targetW < columnWidth) {
            notes.push('Heads up: this is only ' + targetW + 'px wide, so it will ' +
                       'look soft stretched across the ' + columnWidth + 'px column.');
          }
          return {
            base64: base64,
            mimeType: blob.type || 'image/jpeg',
            name: renameFor(file.name, blob.type),
            note: notes.join(' ')
          };
        });
      });
    });
  }

  function renameFor(name, mimeType) {
    var stem = String(name || 'newsletter-image').replace(/\.[^.]+$/, '');
    var ext = mimeType === 'image/png' ? '.png'
            : mimeType === 'image/jpeg' ? '.jpg'
            : '';
    return ext ? stem + ext : name;
  }

  function uploadImage(path, file) {
    var note = elView.querySelector('[data-nl-upload-msg="' + path + '"]');
    function say(text) { if (note) note.textContent = text; }

    say('Preparing ' + file.name + '…');

    /* The Editorial design insets its pictures; the other two run full bleed. */
    var size = {
      maxEdge: NL_MAX_EDGE,
      targetBytes: NL_TARGET_BYTES,
      columnWidth: nlDraft.design === 'editorial' ? 532 : 600
    };

    prepareImage(file, size).then(function (ready) {
      say('Uploading… ' + ready.note);
      return A.call('nlUploadImage', {
        name: ready.name,
        mimeType: ready.mimeType,
        dataBase64: ready.base64
      }).then(function (data) {
        nlSet(path, data.url);
        var input = elView.querySelector('[data-nl="' + path + '"]');
        if (input) input.value = data.url;
        syncThumb(path, data.url);
        say('Uploaded. ' + ready.note);
        schedulePreview();
      });
    }).catch(function (err) {
      say(err.message);
    });
  }

  function schedulePreview() {
    clearTimeout(nlPreviewTimer);
    nlPreviewTimer = setTimeout(refreshPreview, 250);
  }

  function refreshPreview() {
    var frame = document.getElementById('nlFrame');
    if (!frame) return;
    frame.srcdoc = W.preview(nlDraft);
  }

  function saveDraft() {
    return A.call('nlSave', {
      newsletterId: nlId,
      content: nlDraft
    }).then(function (data) {
      nlId = data.newsletterId;
      var badge = document.getElementById('nlSavedAs');
      if (badge) badge.textContent = 'Draft ' + nlId;
      return data;
    });
  }

  /* ── Test send ── */

  function renderTestPanel() {
    var user = A.getUser();
    document.getElementById('nlSendSlot').innerHTML =
      '<div class="adm-panel nl-confirm">' +
        '<h2 style="font-size:1.1rem;">Send a test</h2>' +
        '<p class="adm-sub">The real email, to you. Up to five addresses, separated by commas. ' +
        'The subject is prefixed with <code>[TEST]</code> and the unsubscribe link is inert.</p>' +
        '<div class="adm-msg" id="nlTestMsg"></div>' +
        '<div class="adm-form">' +
          field('Send the test to',
            '<input type="text" id="nlTestTo" value="' + esc(user.email) + '">') +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="button" id="nlTestGo">Send Test</button>' +
            '<button class="adm-btn secondary" type="button" id="nlTestCancel">Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    on('nlTestCancel', 'click', function () {
      document.getElementById('nlSendSlot').innerHTML = '';
    });

    on('nlTestGo', 'click', function () {
      if (!String(nlDraft.subject || '').trim()) {
        msg('nlTestMsg', 'Give the newsletter a subject line first.', 'error');
        return;
      }
      busy('nlTestGo', true, 'Sending…');
      saveDraft().then(function () {
        return A.call('nlSendTest', {
          newsletterId: nlId,
          issueDate: nlDraft.issueDate,
          subject: nlDraft.subject,
          html: W.render(nlDraft),
          text: W.plainText(nlDraft),
          emails: val('nlTestTo')
        });
      }).then(function (data) {
        msg('nlTestMsg', data.message + (data.errors && data.errors.length
          ? ' ' + data.errors.join(' ') : ''), data.failed ? 'error' : 'ok');
      }).catch(function (err) {
        msg('nlTestMsg', err.message, 'error');
      }).then(function () { busy('nlTestGo', false); });
    });
  }

  /* ── The real send ── */

  function renderSendPanel() {
    document.getElementById('nlSendSlot').innerHTML =
      '<div class="adm-panel nl-confirm"><p class="adm-sub" style="margin:0;">Loading the list…</p></div>';

    A.call('nlRecipients').then(function (data) {
      var subscribed = data.recipients.filter(function (r) { return r.status === 'subscribed'; });
      var groupOptions = '<option value="">Everyone who is subscribed (' +
        subscribed.length + ')</option>' +
        data.groups.map(function (g) {
          var count = subscribed.filter(function (r) {
            return r.groups.split(',').map(function (x) { return x.trim(); }).indexOf(g) !== -1;
          }).length;
          return '<option value="' + esc(g) + '">' + esc(g) + ' (' + count + ')</option>';
        }).join('');

      document.getElementById('nlSendSlot').innerHTML =
        '<div class="adm-panel nl-confirm">' +
          '<h2 style="font-size:1.1rem;">Send to the list</h2>' +
          '<p class="adm-sub">Each person gets their own copy with their own unsubscribe ' +
          'link — nobody sees anyone else’s address. Send yourself a test first if you ' +
          'have not already.</p>' +
          '<div class="adm-msg" id="nlSendMsg"></div>' +
          '<div class="adm-form">' +
            field('Send to', '<select id="nlSendGroup">' + groupOptions + '</select>') +
            '<div class="adm-actions">' +
              '<button class="adm-btn" type="button" id="nlSendGo">Send Now</button>' +
              '<button class="adm-btn secondary" type="button" id="nlSendCancel">Cancel</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      on('nlSendCancel', 'click', function () {
        document.getElementById('nlSendSlot').innerHTML = '';
      });
      on('nlSendGo', 'click', startSend);
    }).catch(function (err) {
      document.getElementById('nlSendSlot').innerHTML =
        '<div class="adm-panel nl-confirm"><div class="adm-msg error">' +
        esc(err.message) + '</div></div>';
    });
  }

  function startSend() {
    if (!String(nlDraft.subject || '').trim()) {
      msg('nlSendMsg', 'Give the newsletter a subject line first.', 'error');
      return;
    }
    var group = val('nlSendGroup');
    busy('nlSendGo', true, 'Sending…');
    document.getElementById('nlSendCancel').disabled = true;

    var html = W.render(nlDraft);
    var text = W.plainText(nlDraft);
    var totals = { sent: 0, failed: 0, errors: [] };

    function chunk(offset) {
      return A.call('nlSend', {
        newsletterId: nlId,
        issueDate: nlDraft.issueDate,
        subject: nlDraft.subject,
        html: html,
        text: text,
        group: group,
        offset: offset
      }).then(function (data) {
        totals.sent += data.sent;
        totals.failed += data.failed;
        totals.errors = totals.errors.concat(data.errors || []);
        msgHtml('nlSendMsg', 'Sent ' + totals.sent + ' of ' + data.total + '…', 'info');
        if (!data.done) return chunk(data.nextOffset);
        return data;
      });
    }

    saveDraft()
      .then(function () { return chunk(0); })
      .then(function () {
        msgHtml('nlSendMsg',
          '<strong>Newsletter sent.</strong> ' + totals.sent + ' delivered' +
          (totals.failed ? ', ' + totals.failed + ' failed' : '') + '.' +
          (totals.errors.length
            ? '<br>' + totals.errors.map(esc).join('<br>')
            : ''),
          totals.failed ? 'error' : 'ok');
        /* Let go of the sent issue: anything typed from here on belongs to a
           new draft, not to the record of what people already received. */
        nlId = '';
        var badge = document.getElementById('nlSavedAs');
        if (badge) badge.textContent = 'Sent — further edits start a new draft';
        msg('nlMsg', 'This issue is now in the history.', 'ok');
      })
      .catch(function (err) {
        msgHtml('nlSendMsg', esc(err.message) +
          (totals.sent ? '<br>' + totals.sent + ' had already gone out before this happened.' : ''),
          'error');
      })
      .then(function () {
        busy('nlSendGo', false);
        var cancel = document.getElementById('nlSendCancel');
        if (cancel) cancel.disabled = false;
      });
  }

  /* ── History ── */

  function viewNewsletterHistory() {
    loading('Loading newsletters…');
    A.call('nlList').then(function (data) {
      var rows = data.newsletters.map(function (item) {
        var pill = item.status === 'sent' ? 'green' : (item.status === 'sending' ? 'gold' : 'grey');
        return '<tr>' +
          '<td>' + esc(A.prettyDate(item.issueDate) || item.issueDate) + '</td>' +
          '<td><strong>' + esc(item.subject || '(no subject)') + '</strong>' +
            (item.sections ? '<div class="adm-hint">' + esc(item.sections) + '</div>' : '') + '</td>' +
          '<td>' + esc(item.design) + '</td>' +
          '<td><span class="adm-pill ' + pill + '">' + esc(item.status) + '</span></td>' +
          '<td class="num">' + (item.status === 'draft' ? '—' :
            esc(item.sentCount + (item.failedCount ? ' / ' + item.failedCount + ' failed' : ''))) + '</td>' +
          '<td>' + esc(item.createdBy) + '<div class="adm-hint">' +
            esc((item.createdAt || '').replace('T', ' ')) + '</div></td>' +
          '<td><a class="adm-btn small secondary" href="#/newsletter/compose/' +
            encodeURIComponent(item.newsletterId) + '">' +
            (item.status === 'sent' ? 'Copy' : 'Edit') + '</a>' +
            (item.status === 'sent' ? '' :
              ' <button class="adm-btn small secondary" data-nl-del="' +
              esc(item.newsletterId) + '">Delete</button>') +
          '</td>' +
        '</tr>';
      }).join('');

      elView.innerHTML = panel('Newsletter History',
        'Every issue is kept here, along with who composed it and which sections it used. ' +
        'Open a sent issue to start this week’s from it.',
        '<div class="adm-msg" id="nlHistMsg"></div>' +
        '<div class="adm-actions" style="margin-bottom:18px;">' +
          '<a class="adm-btn" href="#/newsletter/compose">Compose a New Newsletter</a>' +
          '<a class="adm-btn secondary" href="#/newsletter/compose/sample">' +
            'Start from the Sample Issue</a>' +
        '</div>' +
        '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
          '<th>Issue date</th><th>Subject</th><th>Design</th><th>Status</th>' +
          '<th class="num">Sent</th><th>Created by</th><th></th>' +
        '</tr></thead><tbody>' +
        (rows || '<tr><td colspan="7">No newsletters yet.</td></tr>') +
        '</tbody></table></div>');

      elView.querySelectorAll('[data-nl-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          btn.disabled = true;
          A.call('nlDelete', { newsletterId: btn.getAttribute('data-nl-del') })
            .then(viewNewsletterHistory)
            .catch(function (err) {
              btn.disabled = false;
              msg('nlHistMsg', err.message, 'error');
            });
        });
      });
    }).catch(fail);
  }

  /* ── Recipients ── */

  function viewNewsletterRecipients() {
    loading('Loading the mailing list…');
    return A.call('nlRecipients').then(function (data) {
      renderRecipients(data, '');
    }).catch(fail);
  }

  function renderRecipients(data, query) {
    var term = String(query || '').toLowerCase();
    var shown = data.recipients.filter(function (r) {
      if (!term) return true;
      return (r.email + ' ' + r.firstName + ' ' + r.lastName + ' ' + r.groups)
        .toLowerCase().indexOf(term) !== -1;
    });
    var subscribed = data.recipients.filter(function (r) { return r.status === 'subscribed'; }).length;
    var gone = data.recipients.filter(function (r) { return r.status === 'unsubscribed'; }).length;

    var rows = shown.map(function (r) {
      var pill = r.status === 'subscribed' ? 'green' : (r.status === 'bounced' ? 'gold' : 'grey');
      return '<tr>' +
        '<td>' + esc(r.email) + '</td>' +
        '<td>' + esc([r.firstName, r.lastName].filter(Boolean).join(' ') || '—') + '</td>' +
        '<td>' + esc(r.groups || '—') + '</td>' +
        '<td><span class="adm-pill ' + pill + '">' + esc(r.status) + '</span></td>' +
        '<td>' + esc((r.lastSentAt || '').replace('T', ' ') || '—') + '</td>' +
        '<td><button class="adm-btn small secondary" data-rcp="' + esc(r.recipientId) +
          '">Edit</button></td>' +
      '</tr>';
    }).join('');

    elView.innerHTML = panel('Newsletter Recipients',
      'The <strong>Newsletter Recipients</strong> tab of the data sheet. People who use the ' +
      'unsubscribe link in a newsletter move to <em>unsubscribed</em> here on their own, and ' +
      'are skipped from then on.',
      '<div class="adm-msg" id="rcpMsg"></div>' +
      '<div class="adm-stats">' +
        '<div class="adm-stat"><div class="v">' + subscribed + '</div><div class="k">Subscribed</div></div>' +
        '<div class="adm-stat"><div class="v">' + gone + '</div><div class="k">Unsubscribed</div></div>' +
        '<div class="adm-stat"><div class="v">' + data.recipients.length +
          '</div><div class="k">On the list</div></div>' +
      '</div>' +
      '<div id="rcpEditSlot"></div>' +
      '<div class="adm-toolbar">' +
        '<div class="adm-field"><label>Search</label>' +
          '<input type="search" id="rcpSearch" value="' + esc(query || '') +
          '" placeholder="Name, email or group"></div>' +
        '<button class="adm-btn" type="button" id="rcpAdd">Add Someone</button>' +
        '<button class="adm-btn secondary" type="button" id="rcpImport">Import a List</button>' +
        '<button class="adm-btn secondary" type="button" id="rcpExport">Export CSV</button>' +
      '</div>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th>Email</th><th>Name</th><th>Groups</th><th>Status</th><th>Last sent</th><th></th>' +
      '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="6">Nobody on the list matches that.</td></tr>') +
      '</tbody></table></div>');

    on('rcpSearch', 'input', function (e) {
      var box = e.target;
      var caret = box.selectionStart;
      renderRecipients(data, box.value);
      var again = document.getElementById('rcpSearch');
      again.focus();
      again.setSelectionRange(caret, caret);
    });

    on('rcpAdd', 'click', function () { renderRecipientEditor(null, data); });
    on('rcpImport', 'click', function () { renderRecipientImport(data); });
    on('rcpExport', 'click', function () {
      downloadCsv('wynlife-newsletter-recipients-' + A.isoDate(new Date()) + '.csv',
        [['Email', 'First Name', 'Last Name', 'Status', 'Groups', 'Added At', 'Last Sent At']]
          .concat(data.recipients.map(function (r) {
            return [r.email, r.firstName, r.lastName, r.status, r.groups, r.addedAt, r.lastSentAt];
          })));
    });

    elView.querySelectorAll('[data-rcp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = data.recipients.filter(function (r) {
          return r.recipientId === btn.getAttribute('data-rcp');
        })[0];
        if (target) renderRecipientEditor(target, data);
      });
    });
  }

  function renderRecipientEditor(recipient, data) {
    var r = recipient || { recipientId: '', email: '', firstName: '', lastName: '',
                           status: 'subscribed', groups: '', notes: '' };
    document.getElementById('rcpEditSlot').innerHTML =
      '<div class="adm-panel" style="background:var(--cream);margin-bottom:22px;">' +
        '<h2 style="font-size:1.15rem;">' +
        (recipient ? 'Editing ' + esc(r.email) : 'Add someone to the list') + '</h2>' +
        '<form class="adm-form" id="rcpForm">' +
          '<div class="adm-grid-2">' +
            field('Email', '<input type="email" id="rcpEmail" value="' + esc(r.email) + '" required>') +
            field('Status',
              '<select id="rcpStatus">' + data.statuses.map(function (s) {
                return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') +
                  '>' + s + '</option>';
              }).join('') + '</select>') +
          '</div>' +
          '<div class="adm-grid-2">' +
            field('First name', '<input type="text" id="rcpFirst" value="' + esc(r.firstName) + '">') +
            field('Last name', '<input type="text" id="rcpLast" value="' + esc(r.lastName) + '">') +
          '</div>' +
          field('Groups', '<input type="text" id="rcpGroups" value="' + esc(r.groups) + '">',
                'Separate with commas. Groups let you send an issue to part of the list.') +
          field('Notes', '<input type="text" id="rcpNotes" value="' + esc(r.notes) + '">') +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="submit" id="rcpSave">Save</button>' +
            '<button class="adm-btn secondary" type="button" id="rcpCancel">Cancel</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    on('rcpCancel', 'click', function () {
      document.getElementById('rcpEditSlot').innerHTML = '';
    });

    on('rcpForm', 'submit', function (e) {
      e.preventDefault();
      busy('rcpSave', true, 'Saving…');
      A.call('nlSaveRecipient', {
        recipientId: r.recipientId,
        email: val('rcpEmail'),
        firstName: val('rcpFirst'),
        lastName: val('rcpLast'),
        status: val('rcpStatus'),
        groups: val('rcpGroups'),
        notes: val('rcpNotes')
      }).then(function (result) {
        return viewNewsletterRecipients().then(function () { msg('rcpMsg', result.message, 'ok'); });
      }).catch(function (err) {
        busy('rcpSave', false);
        msg('rcpMsg', err.message, 'error');
      });
    });
  }

  function renderRecipientImport() {
    document.getElementById('rcpEditSlot').innerHTML =
      '<div class="adm-panel" style="background:var(--cream);margin-bottom:22px;">' +
        '<h2 style="font-size:1.15rem;">Import a list</h2>' +
        '<p class="adm-sub">One person per line. The email address is all that is required:<br>' +
        '<code>someone@example.com, Jane, Smith, families</code><br>' +
        'Addresses already on the list are updated rather than duplicated.</p>' +
        '<form class="adm-form" id="rcpImportForm">' +
          field('Paste the list', '<textarea id="rcpImportText" rows="10"></textarea>') +
          field('Put everyone in these groups',
            '<input type="text" id="rcpImportGroups" placeholder="Optional, comma separated">') +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="submit" id="rcpImportSave">Import</button>' +
            '<button class="adm-btn secondary" type="button" id="rcpImportCancel">Cancel</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    on('rcpImportCancel', 'click', function () {
      document.getElementById('rcpEditSlot').innerHTML = '';
    });

    on('rcpImportForm', 'submit', function (e) {
      e.preventDefault();
      busy('rcpImportSave', true, 'Importing…');
      A.call('nlImportRecipients', {
        text: document.getElementById('rcpImportText').value,
        groups: val('rcpImportGroups')
      }).then(function (result) {
        var note = result.message + (result.skipped.length
          ? ' Skipped: ' + result.skipped.slice(0, 5).join(', ') : '');
        return viewNewsletterRecipients().then(function () {
          msg('rcpMsg', note, result.skipped.length ? 'info' : 'ok');
        });
      }).catch(function (err) {
        busy('rcpImportSave', false);
        msg('rcpMsg', err.message, 'error');
      });
    });
  }

  /* ── Email settings ── */

  function viewNewsletterSettings() {
    loading('Loading email settings…');
    return A.call('nlSettings').then(function (data) {
      var s = data.settings;
      elView.innerHTML = panel('Email Settings',
        'The newsletter goes out through <strong>Brevo</strong>. The API key is kept in the ' +
        'Apps Script’s own properties, never in the spreadsheet, and is never shown back ' +
        'here in full.',
        '<div class="adm-msg" id="nlSetMsg"></div>' +
        '<form class="adm-form" id="nlSetForm">' +
          field('Brevo API key',
            '<input type="password" id="nlApiKey" autocomplete="off" placeholder="' +
            (s.apiKeySet ? 'Saved — leave blank to keep it' : 'xkeysib-…') + '">',
            s.apiKeySet
              ? 'A key is saved (' + esc(s.apiKeyHint) + '). Type a new one to replace it.'
              : 'Brevo > SMTP &amp; API > API Keys. Paste the v3 key here.') +
          '<div class="adm-grid-2">' +
            field('Sender name',
              '<input type="text" id="nlSenderName" value="' + esc(s.senderName) + '">') +
            field('Sender address',
              '<input type="email" id="nlSenderEmail" value="' + esc(s.senderEmail) + '">',
              'Must be a verified sender in Brevo, or nothing will go out.') +
          '</div>' +
          field('Reply-to address',
            '<input type="email" id="nlReplyTo" value="' + esc(s.replyTo) + '">') +
          field('Unsubscribe link base',
            '<input type="text" value="' + esc(s.unsubscribeUrl) + '" readonly>',
            'Every newsletter footer points here. It is this Apps Script deployment.') +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="submit" id="nlSetSave">Save Settings</button>' +
            (s.apiKeySet
              ? '<button class="adm-btn secondary" type="button" id="nlSetClear">Remove the Key</button>'
              : '') +
          '</div>' +
        '</form>');

      on('nlSetForm', 'submit', function (e) {
        e.preventDefault();
        busy('nlSetSave', true, 'Saving…');
        A.call('nlSaveSettings', {
          apiKey: document.getElementById('nlApiKey').value,
          senderName: val('nlSenderName'),
          senderEmail: val('nlSenderEmail'),
          replyTo: val('nlReplyTo')
        }).then(function (result) {
          return viewNewsletterSettings().then(function () { msg('nlSetMsg', result.message, 'ok'); });
        }).catch(function (err) {
          busy('nlSetSave', false);
          msg('nlSetMsg', err.message, 'error');
        });
      });

      on('nlSetClear', 'click', function () {
        busy('nlSetClear', true, 'Removing…');
        A.call('nlSaveSettings', { clearApiKey: true }).then(function () {
          return viewNewsletterSettings().then(function () {
            msg('nlSetMsg', 'The Brevo key has been removed. No newsletters can go out ' +
                'until a new one is saved.', 'info');
          });
        }).catch(function (err) {
          busy('nlSetClear', false);
          msg('nlSetMsg', err.message, 'error');
        });
      });
    }).catch(fail);
  }

  /* ══ Website ═════════════════════════════════════════════════════════
     The moderators' corner: the editable parts of the public pages, with the
     real page beside the form as a live preview, and a Publish button.
     Drafts save to the sheet as you type. Publishing has the Apps Script
     write the pages on GitHub (Website.gs), and GitHub Pages rebuilds the
     site — so the public site stays plain, fast, static HTML.

     What the content looks like, and the HTML it becomes, both live in
     site-content.js: the preview and the published page are drawn by the
     same code.                                                          */

  var S = window.WynSite;

  /* How large an uploaded picture may be. A banner spans the whole screen, so
     it keeps more pixels; everything else sits in a half-width column. */
  var WEB_IMAGE_SIZES = {
    hero:  { maxEdge: 2000, targetBytes: 600 * 1024, columnWidth: 1440 },
    photo: { maxEdge: 1600, targetBytes: 450 * 1024, columnWidth: 600 }
  };

  var WEB_DEVICES = { desktop: 1280, phone: 390 };

  var WORDS_HINT = 'Leave a blank line between paragraphs. Write **bold**, *italic* or ' +
                   '[link text](https://…) where you want them.';

  /* Shown beside a section's heading for the kinds that behave differently;
     an ordinary text-and-picture section needs no label. */
  var SECTION_KINDS = {
    feature: '',
    photo: 'Wide photo',
    'sunday-school': 'Sunday School',
    announcements: 'Announcements'
  };

  var web = {
    state: null,          // the last webState: every page's draft and live content
    page: '',             // the page open in the editor
    draft: null,          // its content, as it is being edited
    unsaved: false,       // changed since the last save reached the sheet
    saving: null,         // the save in flight
    saveTimer: null,
    previewTimer: null,
    previewPath: '',
    device: 'phone',
    open: new WeakMap(),  // which items are expanded, keyed by the item itself
    wantFocus: '',        // the item being worked on, for the preview to show
    lastFocus: '',        // the item the preview last scrolled to
    removed: null,        // the last item removed, for Undo
    toastTimer: null,
    notice: null,         // a message to show when the editor next opens
    watch: null           // the check for the rebuilt site after a publish
  };

  function pageInfo(key) {
    return S.PAGES.filter(function (p) { return p.key === key; })[0];
  }

  function webHasUnsaved() {
    return !!(web.page && (web.unsaved || web.saving));
  }

  function stampText(iso) {
    return iso ? A.prettyDate(iso) + ', ' + A.prettyTime(iso) : '';
  }

  /** '9:41 am' today, '12 Oct, 9:41 am' this year, '12 Oct 2025, 9:41 am' before. */
  function shortStamp(iso, withDay) {
    if (!iso) return '';
    if (!withDay && String(iso).slice(0, 10) === A.isoDate(new Date())) return A.prettyTime(iso);
    var parts = String(iso).slice(0, 10).split('-');
    var day = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var opts = { day: 'numeric', month: 'short' };
    if (day.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return day.toLocaleDateString('en-AU', opts) + ', ' + A.prettyTime(iso);
  }

  /* ── Reading and writing the draft by path ── */

  function webGet(path) {
    var node = web.draft;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (node === null || node === undefined) return '';
      node = node[parts[i]];
    }
    return node === null || node === undefined ? '' : node;
  }

  function webSet(path, value) {
    var parts = String(path).split('.');
    var node = web.draft;
    for (var i = 0; i < parts.length - 1; i++) node = node[parts[i]];
    node[parts[parts.length - 1]] = value;
  }

  /** 'sections.3' -> the array, its path, and 3. */
  function webSlot(path) {
    var cut = path.lastIndexOf('.');
    return { listPath: path.slice(0, cut), list: webGet(path.slice(0, cut)), index: +path.slice(cut + 1) };
  }

  /* ── Loading a page ── */

  /**
   * The console can reach the live site before the Apps Script is updated to
   * match; say what is missing rather than show "Unknown action".
   */
  function webFail(err) {
    if (err && /Unknown action: web/.test(err.message)) {
      elView.innerHTML = panel('The website editor is not set up yet',
        'The Apps Script behind this console needs the website code. An administrator needs to ' +
        'add <code>apps-script/Website.gs</code> to the script project, run <code>setup()</code> ' +
        'once, and deploy a new version — see <code>apps-script/README.md</code>.');
      return;
    }
    fail(err);
  }

  function loadWebState() {
    return A.call('webState').then(function (data) {
      web.state = data;
      return data;
    });
  }

  function viewWebsitePage(pageKey) {
    var hash = window.location.hash;
    loading('Opening the website editor…');
    loadWebState().then(function () {
      /* Moved on while this was loading: leave the new screen alone. */
      if (window.location.hash !== hash) return;
      web.page = pageKey;
      web.draft = S.normalise(pageKey, web.state.draft[pageKey] || web.state.published[pageKey]);
      web.unsaved = false;
      web.open = new WeakMap();
      /* Church Online is all about the player, so the preview opens on it. */
      web.wantFocus = pageKey === 'online' ? 'player' : '';
      web.lastFocus = '';
      web.previewPath = pageInfo(pageKey).path;
      if (pageKey === 'home') {
        web.open.set(web.draft.gatherings, true);
        web.open.set(web.draft.whatsOn, true);
      }
      renderWebEditor();
    }).catch(webFail);
  }

  /** Saves what is outstanding when someone moves to another screen. */
  function leaveWebsiteEditor() {
    if (!web.page) return;
    if (web.unsaved) saveDraftNow().catch(function () {});
    web.watch = null;
    web.page = '';
    exitFullPreview();
  }

  /* ── Saving drafts as you type ──
     Each save carries the whole page, so saves go out one at a time and in
     order; a failed one leaves the changes marked unsaved for the next. */

  function showSaved(text, isError) {
    var el = document.getElementById('webSaved');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  function saveDraftNow() {
    clearTimeout(web.saveTimer);
    if (!web.unsaved || !web.page) return web.saving || Promise.resolve();
    var page = web.page;
    var content = JSON.parse(JSON.stringify(web.draft));
    web.unsaved = false;
    var run = (web.saving || Promise.resolve()).catch(function () {}).then(function () {
      if (web.page === page) showSaved('Saving…');
      return A.call('webSaveDraft', { page: page, content: content });
    }).then(function (data) {
      web.state.draft[page] = content;
      web.state.meta[page] = Object.assign({}, web.state.meta[page],
                                           { draftAt: data.savedAt, draftBy: data.savedBy });
      if (web.page === page && !web.unsaved) showSaved('Draft saved ' + shortStamp(data.savedAt));
    }, function (err) {
      if (web.page === page) {
        web.unsaved = true;
        showSaved('Not saved: ' + err.message, true);
      }
      throw err;
    });
    web.saving = run;
    function settle() { if (web.saving === run) web.saving = null; }
    run.then(settle, settle);
    return run;
  }

  function webChanged() {
    web.unsaved = true;
    showSaved('Saving soon…');
    /* A message in the pinned bar has been read once editing carries on —
       unless it is still counting down to the site going live. */
    var bar = document.getElementById('webMsg');
    if (bar && bar.innerHTML && !web.watch) {
      bar.innerHTML = '';
      bar.className = 'adm-msg';
    }
    clearTimeout(web.saveTimer);
    web.saveTimer = setTimeout(function () { saveDraftNow().catch(function () {}); }, 1500);
    clearTimeout(web.previewTimer);
    web.previewTimer = setTimeout(function () {
      applyWebPreview();
      refreshWebStatus();
    }, 250);
  }

  /* ── Form pieces, all bound by their data-w path ── */

  function wAttr(path) {
    return ' data-w="' + esc(path) + '"';
  }

  function wText(label, path, opts) {
    opts = opts || {};
    return field(esc(label) + (opts.optional ? ' <span class="adm-optional">(optional)</span>' : ''),
      '<input type="text"' + wAttr(path) + ' value="' + esc(webGet(path)) + '"' +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      (opts.list ? ' list="webLinks"' : '') + '>',
      opts.hint ? esc(opts.hint) : '');
  }

  function wArea(label, path, opts) {
    opts = opts || {};
    return field(esc(label),
      '<textarea' + wAttr(path) + ' rows="' + (opts.rows || 4) + '">' + esc(webGet(path)) + '</textarea>',
      esc(opts.hint === undefined ? WORDS_HINT : opts.hint));
  }

  function wCheck(path, label) {
    return '<label class="adm-check"><input type="checkbox"' + wAttr(path) +
      (webGet(path) === true ? ' checked' : '') + '> <span>' + esc(label) + '</span></label>';
  }

  function optionsHtml(options, current) {
    return options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (o[0] === current ? ' selected' : '') + '>' +
        esc(o[1]) + '</option>';
    }).join('');
  }

  var FIT_OPTIONS = [
    ['crop', 'Fill the frame (the edges may be trimmed)'],
    ['full', 'Show the whole picture (posters and flyers)']
  ];

  var STYLE_OPTIONS = [['primary', 'Blue button'], ['outline', 'Outlined button']];

  function iconOptions(current) {
    var list = S.ICONS.map(function (icon) { return [icon.value, icon.value + '  ' + icon.label]; });
    if (current && !S.ICONS.some(function (icon) { return icon.value === current; })) {
      list.unshift([current, current]);
    }
    return optionsHtml(list, current);
  }

  /** A picture: its address, an upload button, a thumbnail and a description. */
  function wImage(label, path, opts) {
    opts = opts || {};
    var url = webGet(path);
    var src = S.safeImage(url);
    return '<div class="adm-field web-image">' +
      '<label>' + esc(label) + '</label>' +
      '<div class="web-image-row">' +
        '<div class="web-thumb" data-w-thumb="' + esc(path) + '">' +
          (src ? '<img src="' + esc(src) + '" alt="">' : '<span>No picture</span>') +
        '</div>' +
        '<div class="web-image-fields">' +
          '<input type="text"' + wAttr(path) + ' data-w-image value="' + esc(url) + '"' +
            ' placeholder="Upload a picture, or paste an https:// address" aria-label="' + esc(label) + ' address">' +
          '<div class="web-image-actions">' +
            '<label class="adm-btn small secondary web-upload">Upload a Picture' +
              '<input type="file" accept="image/*" data-w-upload="' + esc(path) + '"' +
              ' data-w-size="' + (opts.size || 'photo') + '" hidden>' +
            '</label>' +
            (opts.extra || '') +
          '</div>' +
          '<div class="adm-hint" data-w-upload-msg="' + esc(path) + '"></div>' +
          (opts.alt
            ? '<input type="text"' + wAttr(opts.alt) + ' value="' + esc(webGet(opts.alt)) + '"' +
              ' placeholder="Describe the picture — read out by screen readers, and used by Google"' +
              ' aria-label="' + esc(label) + ' description">'
            : '') +
          (opts.fit
            ? '<select' + wAttr(opts.fit) + ' aria-label="How the picture fits">' +
              optionsHtml(FIT_OPTIONS, webGet(opts.fit)) + '</select>'
            : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /** ↑ ↓ ✕ for one entry in a list. */
  function rowTools(listPath, i, count, opts) {
    opts = opts || {};
    var path = esc(listPath + '.' + i);
    return '<span class="web-tools">' +
      '<button type="button" class="web-tool" data-w-act="move" data-w-path="' + path + '" data-w-dir="-1"' +
        (i === 0 ? ' disabled' : '') + ' aria-label="Move up" title="Move up">↑</button>' +
      '<button type="button" class="web-tool" data-w-act="move" data-w-path="' + path + '" data-w-dir="1"' +
        (i === count - 1 ? ' disabled' : '') + ' aria-label="Move down" title="Move down">↓</button>' +
      (opts.noRemove ? '' :
        '<button type="button" class="web-tool web-remove" data-w-act="remove" data-w-path="' + path + '"' +
        ' aria-label="Remove" title="Remove">✕</button>') +
    '</span>';
  }

  function addButton(listPath, kind, label) {
    return '<button type="button" class="adm-btn small secondary web-add" data-w-act="add"' +
      ' data-w-path="' + esc(listPath) + '" data-w-kind="' + kind + '">+ ' + esc(label) + '</button>';
  }

  function group(legend, body) {
    return '<fieldset class="web-group"><legend>' + legend + '</legend>' + body + '</fieldset>';
  }

  /** The navy details box: a heading, then icon / label / value rows. */
  function wDetails(path) {
    var rows = webGet(path + '.details') || [];
    return group('Details box',
      wText('Box heading', path + '.detailsTitle', { placeholder: 'e.g. Details' }) +
      rows.map(function (row, i) {
        var p = path + '.details.' + i;
        return '<div class="web-row web-detail">' +
          '<select' + wAttr(p + '.icon') + ' aria-label="Icon">' + iconOptions(row.icon) + '</select>' +
          '<input type="text"' + wAttr(p + '.label') + ' value="' + esc(row.label) + '"' +
            ' placeholder="Label, e.g. When" aria-label="Label">' +
          '<textarea' + wAttr(p + '.value') + ' rows="' +
            Math.min(4, Math.max(2, String(row.value || '').split('\n').length)) + '"' +
            ' placeholder="e.g. Every Sunday, 10:00 AM" aria-label="Details">' + esc(row.value) + '</textarea>' +
          rowTools(path + '.details', i, rows.length) +
        '</div>';
      }).join('') +
      (rows.length < 8 ? addButton(path + '.details', 'detail', 'Add a Row') : '') +
      '<div class="adm-hint">Each row is an icon, a label and its details. Press Enter in the ' +
      'details to start a new line. Remove every row to leave the box out.</div>');
  }

  function wButtons(path, max) {
    var list = webGet(path) || [];
    return group('Buttons',
      list.map(function (b, i) {
        var p = path + '.' + i;
        return '<div class="web-row web-button-row">' +
          '<input type="text"' + wAttr(p + '.label') + ' value="' + esc(b.label) + '"' +
            ' placeholder="Button text" aria-label="Button text">' +
          '<input type="text"' + wAttr(p + '.url') + ' value="' + esc(b.url) + '" list="webLinks"' +
            ' placeholder="/pray/ or https://…" aria-label="Button link">' +
          '<select' + wAttr(p + '.style') + ' aria-label="Button style">' +
            optionsHtml(STYLE_OPTIONS, b.style) + '</select>' +
          rowTools(path, i, list.length) +
        '</div>';
      }).join('') +
      (list.length < max ? addButton(path, 'button', 'Add a Button') : '') +
      (list.length ? '' : '<div class="adm-hint">No buttons.</div>'));
  }

  function wGallery(path) {
    var list = webGet(path) || [];
    return group('Row of photos underneath <span class="adm-optional">(optional)</span>',
      list.map(function (g, i) {
        return '<div class="web-row web-photo-row">' +
          wImage('Photo ' + (i + 1), path + '.' + i + '.image', { alt: path + '.' + i + '.imageAlt' }) +
          rowTools(path, i, list.length) +
        '</div>';
      }).join('') +
      (list.length < 3 ? addButton(path, 'gallery', 'Add a Photo') : ''));
  }

  /* ── Collapsible items: sections, cards, notices ── */

  function itemTitle(path, item) {
    if (path === 'hero') return 'Page banner';
    if (item.type === 'photo') return S.plain(item.imageAlt) || 'Wide photo';
    return S.plain(item.title) || 'Untitled';
  }

  function wItem(path, item, kind, body, tools) {
    var hidden = item.visible === false;
    return '<details class="web-item' + (hidden ? ' is-hidden' : '') + '" data-w-item="' + esc(path) + '"' +
        (web.open.get(item) ? ' open' : '') + '>' +
      '<summary>' +
        (kind ? '<span class="web-item-kind">' + esc(kind) + '</span>' : '') +
        '<span class="web-item-title">' + esc(itemTitle(path, item)) + '</span>' +
        '<span class="web-item-pills">' +
          (hidden ? '<span class="adm-pill grey">Hidden</span>' : '') +
          (item.isNew ? '<span class="adm-pill gold">New</span>' : '') +
        '</span>' +
        (tools || '') +
      '</summary>' +
      '<div class="web-item-body">' + body + '</div>' +
    '</details>';
  }

  /** Keeps an item's header in step with its heading and Show box. */
  function refreshItemHead(host) {
    var path = host.getAttribute('data-w-item');
    var item = webGet(path);
    if (!item || typeof item !== 'object') return;
    host.querySelector('.web-item-title').textContent = itemTitle(path, item);
    host.classList.toggle('is-hidden', item.visible === false);
    host.querySelector('.web-item-pills').innerHTML =
      (item.visible === false ? '<span class="adm-pill grey">Hidden</span>' : '') +
      (item.isNew ? '<span class="adm-pill gold">New</span>' : '');
  }

  /* ── The editors for each kind of thing ── */

  function menusGroup(p, s, id) {
    var page = pageInfo(web.page);
    return group('Menus',
      '<div class="adm-grid-2">' +
        wText('Name in the bar under the banner', p + '.subnav', { placeholder: 'Blank: leave it out' }) +
        wText(web.page === 'gatherings' ? 'Name in the site menu and footer' : 'Name in the site menu',
              p + '.menu', { placeholder: 'Blank: leave it out' }) +
      '</div>' +
      '<div class="adm-hint">Link to this section: <code>' + esc(page.path + '#' + id) + '</code>' +
      (s.isNew ? ' — this follows the heading until the section is first published, then stays put ' +
                 'so links to it keep working.' : '') + '</div>');
  }

  function featureBody(p, s, id) {
    return '<div class="web-flags">' +
        wCheck(p + '.visible', 'Show this section') +
        wCheck(p + '.grey', 'Grey background') +
        wCheck(p + '.imageFirst', 'On phones, put the picture above the words') +
      '</div>' +
      '<div class="adm-grid-2">' +
        wText('Small heading', p + '.label', { placeholder: 'e.g. Midweek' }) +
        wText('Heading', p + '.title') +
      '</div>' +
      wArea('Words', p + '.body', { rows: 6 }) +
      wDetails(p) +
      wButtons(p + '.buttons', 2) +
      group('Picture', wImage('Picture beside the words', p + '.image',
                              { alt: p + '.imageAlt', fit: p + '.imageFit' })) +
      wGallery(p + '.gallery') +
      menusGroup(p, s, id);
  }

  function photoBody(p) {
    return wCheck(p + '.visible', 'Show this photo') +
      wImage('Photo across the full width of the page', p + '.image', { alt: p + '.imageAlt' });
  }

  function sundaySchoolBody(p, s, id) {
    return '<div class="web-note">The <strong>home page</strong>’s Sunday School panel is made from ' +
        'this section — the introduction, this term’s words and both pictures — so it only ever ' +
        'needs changing here.</div>' +
      '<div class="web-flags">' +
        wCheck(p + '.visible', 'Show this section, and the home page panel') +
        wCheck(p + '.grey', 'Grey background') +
      '</div>' +
      '<div class="adm-grid-2">' +
        wText('Small heading', p + '.label') +
        wText('Heading', p + '.title') +
      '</div>' +
      wArea('Introduction', p + '.intro', { rows: 4 }) +
      group('The curriculum',
        wText('Heading', p + '.curriculum.title') +
        wArea('Words', p + '.curriculum.body', { rows: 5 }) +
        '<div class="adm-grid-2">' +
          wText('Button text', p + '.curriculum.buttonLabel') +
          wText('Button link', p + '.curriculum.buttonUrl', { list: true }) +
        '</div>' +
        wImage('Picture', p + '.curriculum.image', { alt: p + '.curriculum.imageAlt' })) +
      group('This term',
        wText('Heading', p + '.lessons.title', { placeholder: 'e.g. Term 4 Lessons' }) +
        wArea('Words', p + '.lessons.body', { rows: 4 }) +
        wImage('Lessons poster', p + '.lessons.image', { alt: p + '.lessons.imageAlt' }) +
        wDetails(p + '.lessons') +
        '<div class="adm-grid-2">' +
          wText('Button text', p + '.lessons.buttonLabel') +
          wText('Button link', p + '.lessons.buttonUrl', { list: true }) +
        '</div>') +
      menusGroup(p, s, id);
  }

  function noticeEditor(listPath, a, j, count) {
    var p = listPath + '.' + j;
    return wItem(p, a, '',
      wCheck(p + '.visible', 'Show this notice') +
      '<div class="adm-grid-2">' +
        wText('Small heading', p + '.tag', { placeholder: 'e.g. Upcoming Event' }) +
        wText('Heading', p + '.title') +
      '</div>' +
      wArea('Words', p + '.body', { rows: 4 }) +
      wArea('Small print', p + '.small', {
        rows: 2, hint: 'Dates, times, how to register — shown in smaller type underneath.' }) +
      wImage('Picture or poster', p + '.image', { alt: p + '.imageAlt' }) +
      '<div class="adm-grid-2">' +
        wText('Button text', p + '.buttonLabel', { optional: true }) +
        wText('Button link', p + '.buttonUrl', { list: true }) +
      '</div>',
      rowTools(listPath, j, count));
  }

  function announcementsBody(p, s, id) {
    var items = s.items || [];
    return '<div class="web-flags">' +
        wCheck(p + '.visible', 'Show this section') +
        wCheck(p + '.grey', 'Grey background') +
      '</div>' +
      '<div class="adm-grid-2">' +
        wText('Small heading', p + '.label') +
        wText('Heading', p + '.title') +
      '</div>' +
      group('Notices',
        '<div class="web-list">' +
          items.map(function (a, j) { return noticeEditor(p + '.items', a, j, items.length); }).join('') +
        '</div>' +
        (items.length < 12 ? addButton(p + '.items', 'notice', 'Add a Notice') : '') +
        '<div class="adm-hint">Once an event has passed, untick <em>Show this notice</em> or remove ' +
        'it. When none are showing, the words below appear instead.</div>') +
      group('When there are no notices',
        wArea('Words', p + '.emptyText', { rows: 3 }) +
        '<div class="adm-grid-2">' +
          wText('Button text', p + '.emptyButtonLabel') +
          wText('Button link', p + '.emptyButtonUrl', { list: true }) +
        '</div>') +
      menusGroup(p, s, id);
  }

  function sectionEditor(s, i, count, id) {
    var p = 'sections.' + i;
    var body = s.type === 'photo' ? photoBody(p)
      : s.type === 'sunday-school' ? sundaySchoolBody(p, s, id)
      : s.type === 'announcements' ? announcementsBody(p, s, id)
      : featureBody(p, s, id);
    /* The home page is built from the Sunday School section, so it can be
       hidden but not removed. */
    return wItem(p, s, SECTION_KINDS[s.type], body,
                 rowTools('sections', i, count, { noRemove: s.type === 'sunday-school' }));
  }

  function heroEditor() {
    return wItem('hero', web.draft.hero, 'Banner',
      wImage('Banner picture', 'hero.image', { alt: 'hero.imageAlt', size: 'hero' }) +
      '<div class="adm-hint">A wide landscape photo works best; the top and bottom are trimmed to ' +
      'fit the screen.</div>' +
      wText('Heading', 'hero.title') +
      wText('Line underneath', 'hero.subtitle'), '');
  }

  function sectionsEditor() {
    var norm = S.normalise(web.page, web.draft);
    var list = web.draft.sections;
    var hasNotices = list.some(function (s) { return s.type === 'announcements'; });
    return heroEditor() +
      '<div class="web-list-head">Sections, top to bottom</div>' +
      '<div class="web-list">' +
        list.map(function (s, i) {
          return sectionEditor(s, i, list.length, (norm.sections[i] || s).id);
        }).join('') +
      '</div>' +
      '<div class="web-adds">' +
        addButton('sections', 'feature', 'Add a Section') +
        addButton('sections', 'photo', 'Add a Wide Photo') +
        (web.page === 'whatson' && !hasNotices ? addButton('sections', 'announcements', 'Add the Announcements') : '') +
      '</div>';
  }

  function cardEditor(key, card, i, count) {
    var p = key + '.cards.' + i;
    var wholeCardLink = key === 'gatherings';
    return wItem(p, card, '',
      wCheck(p + '.visible', 'Show this card') +
      wImage('Picture', p + '.image', { alt: p + '.imageAlt', fit: wholeCardLink ? null : p + '.imageFit' }) +
      '<div class="adm-grid-2">' +
        wText('Small heading', p + '.tag',
              { placeholder: wholeCardLink ? 'e.g. Wednesdays · 7:00 PM' : 'e.g. Monthly Gathering' }) +
        wText('Heading', p + '.title') +
      '</div>' +
      wArea('Words', p + '.text', {
        rows: 3,
        hint: wholeCardLink
          ? 'A sentence or two. The whole card is a link, so links cannot go in here.'
          : 'A sentence or two. **Bold** and *italic* work here.'
      }) +
      '<div class="adm-grid-2">' +
        wText('Link text', p + '.linkLabel', { placeholder: 'e.g. Learn more' }) +
        wText('Link', p + '.link', { list: true, placeholder: 'e.g. /gatherings/#life-groups' }) +
      '</div>',
      rowTools(key + '.cards', i, count));
  }

  function homeBlock(key, newKind) {
    var block = web.draft[key];
    var cards = block.cards || [];
    return wItem(key, block, '',
      wCheck(key + '.visible', 'Show this section on the home page') +
      '<div class="adm-grid-2">' +
        wText('Small heading', key + '.label') +
        wText('Heading', key + '.title') +
      '</div>' +
      wArea('Introduction', key + '.intro', { rows: 2 }) +
      group('Cards',
        '<div class="web-list">' +
          cards.map(function (c, i) { return cardEditor(key, c, i, cards.length); }).join('') +
        '</div>' +
        (cards.length < 6 ? addButton(key + '.cards', newKind, 'Add a Card') : '') +
        '<div class="adm-hint">Three cards fill a row on a computer screen.</div>') +
      '<div class="adm-grid-2">' +
        wText('Button under the cards', key + '.buttonLabel') +
        wText('Button link', key + '.buttonUrl', { list: true }) +
      '</div>', '');
  }

  function homeEditor() {
    return homeBlock('gatherings', 'card') +
      '<div class="web-note web-note-block"><strong>Sunday School</strong> — the panel between these ' +
        'two sections is made from the Sunday School section of the Gatherings page. ' +
        '<a href="#/website/gatherings">Change it there →</a></div>' +
      homeBlock('whatsOn', 'card-full');
  }

  function ytStatus() {
    var id = S.youtubeId(web.draft.videoUrl);
    return id
      ? '<span class="adm-pill green">Video found</span> <code>' + esc(id) + '</code> · ' +
        '<a href="https://www.youtube.com/watch?v=' + esc(id) + '" target="_blank" rel="noopener">' +
        'Open it on YouTube ↗</a> — or press play in the preview.'
      : '<span class="adm-pill gold">No video yet</span> Paste a YouTube link above.';
  }

  function onlineEditor() {
    return '<div class="web-card">' +
      field('YouTube link for the latest livestream',
        '<input type="text" class="web-big"' + wAttr('videoUrl') + ' value="' + esc(web.draft.videoUrl) + '"' +
        ' placeholder="https://www.youtube.com/live/…  or  https://youtu.be/…">',
        'On YouTube, press <strong>Share</strong> under the stream and copy the link, or copy the ' +
        'address bar while the stream is open. Any kind of YouTube link works.') +
      '<div class="web-yt" id="webYt">' + ytStatus() + '</div>' +
      '<div class="adm-grid-2">' +
        wText('Caption on the player', 'caption') +
        wText('Button text', 'buttonLabel', { hint: 'The button beside the player that opens YouTube.' }) +
      '</div>' +
      wImage('Picture on the player', 'image', {
        alt: 'imageAlt',
        extra: '<button type="button" class="adm-btn small secondary" data-w-act="yt-thumb">' +
               'Use the Video’s Thumbnail</button>'
      }) +
    '</div>';
  }

  function editorBody() {
    if (web.page === 'home') return homeEditor();
    if (web.page === 'online') return onlineEditor();
    return sectionsEditor();
  }

  /** Suggestions for every link box: the site's pages and their sections. */
  function linkSuggestions() {
    var site = S.normaliseAll(previewSite(web.draft));
    var out = [['/', 'Home'], ['/visit/', 'Your First Sunday'], ['/gatherings/', 'Gatherings'],
               ['/church-online/', 'Church Online'], ['/whats-on/', 'What’s On'],
               ['/next-steps/', 'Next Steps'], ['/about/', 'About'], ['/give/', 'Give'],
               ['/pray/', 'Let Us Pray For You / Contact']];
    [['gatherings', '/gatherings/', 'Gatherings'], ['whatson', '/whats-on/', 'What’s On']].forEach(function (pg) {
      site[pg[0]].sections.forEach(function (s) {
        if (s.id && s.type !== 'photo') out.push([pg[1] + '#' + s.id, pg[2] + ' — ' + S.plain(s.title)]);
      });
    });
    return '<datalist id="webLinks">' + out.map(function (o) {
      return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>';
    }).join('') + '</datalist>';
  }

  /* ── The screen ── */

  var WEB_INTROS = {
    home: 'The two rows of cards on the home page. The Sunday School panel between them comes from ' +
          'the Gatherings page.',
    gatherings: 'The banner and every section of the Gatherings page, in order. The site menu, the ' +
                'footer and the home page’s Sunday School panel all follow what is here.',
    online: 'The video on the Church Online page. Paste this week’s livestream link, check it plays ' +
            'in the preview, and publish.',
    whatson: 'The banner, every section and the announcements on the What’s On page. The site menu ' +
             'follows what is here.'
  };

  function renderWebEditor() {
    var info = pageInfo(web.page);
    var setup = web.state.configured ? '' :
      '<div class="adm-msg info">Publishing is not connected yet, so changes can be saved as a draft ' +
      'but not published. ' + (A.hasRole('admin')
        ? '<a href="#/website/settings">Connect it under Settings › Website Publishing.</a>'
        : 'Ask an administrator to connect it under Settings › Website Publishing.') + '</div>';

    elView.innerHTML =
      '<div class="adm-panel web-panel">' +
        '<div class="adm-panel-head">' +
          '<div><h2>' + esc(info.label) + '</h2>' +
          '<p class="adm-sub">' + esc(WEB_INTROS[web.page]) + '</p></div>' +
        '</div>' +
        /* The bar, and the messages in it, stay in view while the form
           scrolls, so Publish and its outcome are always to hand. */
        '<div class="web-bar">' +
          '<div class="web-bar-row">' +
            '<div class="web-status" id="webStatus"></div>' +
            '<div class="web-bar-actions">' +
              '<span class="adm-hint web-saved" id="webSaved" aria-live="polite"></span>' +
              '<button class="adm-btn small secondary" type="button" id="webDiscard">Discard Changes</button>' +
              '<a class="adm-btn small secondary" href="' + esc(info.path) + '" target="_blank" rel="noopener">' +
                'View Live Page</a>' +
              '<button class="adm-btn" type="button" id="webPublish">Publish</button>' +
            '</div>' +
          '</div>' +
          '<div class="adm-msg" id="webMsg" aria-live="polite"></div>' +
        '</div>' +
        setup +
        '<div class="web-compose">' +
          '<div class="web-editor" id="webEditor">' + editorBody() + '</div>' +
          '<div class="web-preview" id="webPreview">' + previewHtml() + '</div>' +
        '</div>' +
        linkSuggestions() +
        '<div class="web-toast" id="webToast" role="status" aria-live="polite" hidden></div>' +
      '</div>';

    bindWebEditor();
    refreshWebStatus();
    showSaved(web.state.meta[web.page] && web.state.meta[web.page].draftAt
      ? 'Draft saved ' + shortStamp(web.state.meta[web.page].draftAt) : '');
    loadPreview();
    if (web.notice) {
      msgHtml('webMsg', web.notice.html, web.notice.kind);
      web.notice = null;
    }
  }

  /**
   * Rebuilds the form after something is added, moved or removed, then puts
   * the keyboard back where the person was: on the same arrow button after a
   * move (so pressing it again keeps going), or in the first box of something
   * just added.
   */
  function rerenderWebEditor(focusPath, focusSelector) {
    var editor = document.getElementById('webEditor');
    if (!editor) return;
    editor.innerHTML = editorBody();
    var links = document.getElementById('webLinks');
    if (links) links.outerHTML = linkSuggestions();
    if (!focusPath) return;
    var host = editor.querySelector('[data-w-item="' + focusPath + '"]');
    var target = focusSelector ? editor.querySelector(focusSelector) : null;
    if (target && target.disabled) {
      target = editor.querySelector('[data-w-act="move"][data-w-path="' + focusPath + '"]:not([disabled])');
    }
    if (!target && host && host.open) {
      target = host.querySelector('.web-item-body input, .web-item-body textarea, .web-item-body select');
    }
    if (!target) target = editor.querySelector('[data-w^="' + focusPath + '."]');
    if (!target) return;
    target.focus({ preventScroll: true });
    (host || target).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function refreshWebStatus() {
    var el = document.getElementById('webStatus');
    if (!el || !web.page) return;
    var meta = web.state.meta[web.page] || {};
    var changed = JSON.stringify(S.finalise(web.page, web.draft)) !==
                  JSON.stringify(S.finalise(web.page, web.state.published[web.page]));
    el.innerHTML =
      '<span class="adm-pill ' + (changed ? 'gold' : 'green') + '">' +
        (changed ? 'Unpublished changes' : 'Live site is up to date') + '</span>' +
      '<span class="adm-hint">' + (meta.publishedAt
        ? 'Last published ' + esc(shortStamp(meta.publishedAt, true)) +
          (meta.publishedBy ? ' by ' + esc(meta.publishedBy) : '')
        : 'Not published from here yet') + '</span>';
    var discard = document.getElementById('webDiscard');
    if (discard && !discard.classList.contains('is-confirm')) discard.disabled = !changed;
  }

  function updateYt() {
    var el = document.getElementById('webYt');
    if (el) el.innerHTML = ytStatus();
  }

  function syncWebThumb(path, url) {
    var box = document.querySelector('[data-w-thumb="' + path + '"]');
    if (!box) return;
    var src = S.safeImage(url);
    box.innerHTML = src ? '<img src="' + esc(src) + '" alt="">' : '<span>No picture</span>';
  }

  function bindWebEditor() {
    var editor = document.getElementById('webEditor');

    /* Text as it is typed; tick boxes and dropdowns are handled on change. */
    editor.addEventListener('input', function (e) {
      var path = e.target.getAttribute('data-w');
      if (!path || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return;
      webSet(path, e.target.value);
      fieldChanged(e.target, path);
    });

    editor.addEventListener('change', function (e) {
      var path = e.target.getAttribute('data-w');
      if (path && (e.target.type === 'checkbox' || e.target.tagName === 'SELECT')) {
        webSet(path, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
        fieldChanged(e.target, path);
        return;
      }
      var upload = e.target.getAttribute('data-w-upload');
      if (upload && e.target.files && e.target.files[0]) {
        webUpload(upload, e.target.files[0], e.target.getAttribute('data-w-size'));
        e.target.value = '';
      }
    });

    /* The ↑ ↓ ✕ buttons sit inside <summary>, where a plain click would
       also open or close the item. */
    editor.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-w-act]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      webAction(btn.getAttribute('data-w-act'), btn);
    });

    /* toggle does not bubble, so listen on the way down. An item that was
       already recorded as open (a rebuild re-opening it) is not news. */
    editor.addEventListener('toggle', function (e) {
      var el = e.target;
      if (!el.matches || !el.matches('details[data-w-item]')) return;
      var item = webGet(el.getAttribute('data-w-item'));
      if (!item || typeof item !== 'object' || !!web.open.get(item) === el.open) return;
      web.open.set(item, el.open);
      if (el.open) previewFocus(el.getAttribute('data-w-item'));
    }, true);

    editor.addEventListener('focusin', function (e) {
      var host = e.target.closest('[data-w-item]');
      if (host) previewFocus(host.getAttribute('data-w-item'));
    });

    document.getElementById('webToast').addEventListener('click', function (e) {
      if (e.target.closest('[data-w-undo]')) undoWebRemove();
    });

    on('webPublish', 'click', publishWebPage);
    on('webDiscard', 'click', discardWebChanges);
    bindPreviewControls();
  }

  function fieldChanged(target, path) {
    if (target.hasAttribute('data-w-image')) syncWebThumb(path, target.value);
    if (path === 'videoUrl') updateYt();
    var host = target.closest('[data-w-item]');
    if (host && /(^|\.)(title|visible|imageAlt)$/.test(path)) refreshItemHead(host);
    webChanged();
  }

  /* ── Adding, moving and removing ── */

  function webAction(act, btn) {
    var path = btn.getAttribute('data-w-path');
    if (act === 'move') moveWebItem(path, +btn.getAttribute('data-w-dir'));
    else if (act === 'remove') removeWebItem(path);
    else if (act === 'add') addWebItem(path, btn.getAttribute('data-w-kind'));
    else if (act === 'yt-thumb') useYoutubeThumb();
  }

  function moveWebItem(path, dir) {
    var slot = webSlot(path);
    var to = slot.index + dir;
    if (!Array.isArray(slot.list) || to < 0 || to >= slot.list.length) return;
    slot.list.splice(to, 0, slot.list.splice(slot.index, 1)[0]);
    var newPath = slot.listPath + '.' + to;
    rerenderWebEditor(newPath, '[data-w-act="move"][data-w-path="' + newPath + '"][data-w-dir="' + dir + '"]');
    webChanged();
  }

  /**
   * A short note at the foot of the window, for things done far down a long
   * form — removing something, and taking it back — where a message at the
   * top would go unseen.
   */
  function webToast(html) {
    var el = document.getElementById('webToast');
    if (!el) return;
    el.innerHTML = html;
    el.hidden = false;
    clearTimeout(web.toastTimer);
    web.toastTimer = setTimeout(function () { el.hidden = true; }, 9000);
  }

  function removeWebItem(path) {
    var slot = webSlot(path);
    if (!Array.isArray(slot.list)) return;
    var item = slot.list.splice(slot.index, 1)[0];
    web.removed = { listPath: slot.listPath, index: slot.index, item: item };
    rerenderWebEditor();
    webChanged();
    var name = item && typeof item === 'object' && (item.title || item.label || item.imageAlt);
    webToast('<span>Removed' + (name ? ' “' + esc(S.plain(name)) + '”' : '') + '.</span>' +
      '<button type="button" class="adm-btn small secondary" data-w-undo>Undo</button>');
  }

  function undoWebRemove() {
    var r = web.removed;
    if (!r) return;
    var list = webGet(r.listPath);
    if (!Array.isArray(list)) return;
    list.splice(Math.min(r.index, list.length), 0, r.item);
    web.removed = null;
    rerenderWebEditor(r.listPath + '.' + Math.min(r.index, list.length - 1));
    webChanged();
    webToast('<span>Put back.</span>');
  }

  function newWebItem(kind, list) {
    if (kind === 'feature') {
      var s = S.blankSection('feature');
      s.isNew = true;
      /* Carry on the white / grey rhythm of the page. */
      var shown = list.filter(function (x) { return x.visible !== false && x.type !== 'photo'; });
      s.grey = shown.length ? !shown[shown.length - 1].grey : false;
      return s;
    }
    if (kind === 'photo' || kind === 'announcements') return S.blankSection(kind);
    if (kind === 'card') return S.blankCard('crop');
    if (kind === 'card-full') return S.blankCard('full');
    if (kind === 'notice') return S.blankAnnouncement();
    if (kind === 'detail') return S.blankDetail();
    if (kind === 'button') return S.blankButton('', '', list.length ? 'outline' : 'primary');
    if (kind === 'gallery') return S.blankGalleryPhoto();
    return null;
  }

  function addWebItem(listPath, kind) {
    var list = webGet(listPath);
    var item = Array.isArray(list) ? newWebItem(kind, list) : null;
    if (!item) return;
    list.push(item);
    web.open.set(item, true);
    rerenderWebEditor(listPath + '.' + (list.length - 1));
    webChanged();
  }

  function useYoutubeThumb() {
    var id = S.youtubeId(web.draft.videoUrl);
    if (!id) {
      msg('webMsg', 'Paste the YouTube link first, then its thumbnail can be used.', 'error');
      return;
    }
    web.draft.image = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
    if (!web.draft.imageAlt) web.draft.imageAlt = web.draft.caption || 'Watch the latest service';
    rerenderWebEditor();
    webChanged();
  }

  /* ── Pictures ── */

  function webUpload(path, file, sizeKind) {
    var note = document.querySelector('[data-w-upload-msg="' + path + '"]');
    function say(text) { if (note && note.isConnected) note.textContent = text; }

    /* Remember where the picture belongs, in case the list moves meanwhile. */
    var cut = path.lastIndexOf('.');
    var parentPath = cut > 0 ? path.slice(0, cut) : '';
    var key = path.slice(cut + 1);
    var holder = parentPath ? webGet(parentPath) : web.draft;
    var draft = web.draft;

    say('Preparing ' + file.name + '…');
    prepareImage(file, WEB_IMAGE_SIZES[sizeKind] || WEB_IMAGE_SIZES.photo).then(function (ready) {
      say('Uploading… ' + ready.note);
      return A.call('webUploadImage', {
        name: ready.name,
        mimeType: ready.mimeType,
        dataBase64: ready.base64
      }).then(function (data) {
        if (web.draft !== draft) return;
        holder[key] = data.url;
        if ((parentPath ? webGet(parentPath) : web.draft) === holder) {
          var input = document.querySelector('[data-w="' + path + '"]');
          if (input) input.value = data.url;
          syncWebThumb(path, data.url);
        } else {
          rerenderWebEditor();
        }
        say('Uploaded. ' + ready.note + ' It goes on the website when you publish.');
        webChanged();
      });
    }).catch(function (err) {
      say(err.message);
    });
  }

  /* ── The preview ──
     The real page from this site, loaded in a frame, with each editable
     region swapped for the draft. Only the regions change as you type, so
     the page keeps its scroll position. */

  function previewSite(draft) {
    var site = {};
    S.PAGES.forEach(function (p) { site[p.key] = web.state.published[p.key]; });
    site[web.page] = draft;
    return site;
  }

  function previewTargets() {
    var own = pageInfo(web.page);
    var list = [[own.path, own.label]];
    /* The home page's Sunday School panel is drawn from the Gatherings page. */
    if (web.page === 'gatherings') list.push(['/', 'Home Page']);
    return list;
  }

  function previewHtml() {
    var targets = previewTargets();
    return '<div class="web-preview-head">' +
        '<strong>Preview</strong>' +
        (targets.length > 1
          ? '<select id="webPreviewPage" aria-label="Page to preview">' + optionsHtml(targets, web.previewPath) + '</select>'
          : '') +
        '<span class="web-devices">' +
          '<button type="button" class="adm-btn small secondary' + (web.device === 'desktop' ? ' is-on' : '') +
            '" data-w-device="desktop">Computer</button>' +
          '<button type="button" class="adm-btn small secondary' + (web.device === 'phone' ? ' is-on' : '') +
            '" data-w-device="phone">Phone</button>' +
          '<button type="button" class="adm-btn small secondary" id="webFull" aria-pressed="false">' +
            'Full Screen</button>' +
        '</span>' +
      '</div>' +
      '<div class="web-frame-box" id="webFrameBox">' +
        '<iframe id="webFrame" title="Preview of the page with your changes"></iframe>' +
        '<div class="web-frame-note" id="webFrameNote">Loading the page…</div>' +
      '</div>' +
      '<div class="adm-hint">The real page, with your changes in it. Links are switched off here.</div>';
  }

  function bindPreviewControls() {
    document.querySelectorAll('[data-w-device]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        web.device = btn.getAttribute('data-w-device');
        document.querySelectorAll('[data-w-device]').forEach(function (other) {
          other.classList.toggle('is-on', other === btn);
        });
        sizePreview();
      });
    });
    on('webPreviewPage', 'change', function (e) {
      web.previewPath = e.target.value;
      loadPreview();
    });
    on('webFull', 'click', function () {
      var pane = document.getElementById('webPreview');
      var full = !pane.classList.contains('is-full');
      pane.classList.toggle('is-full', full);
      document.getElementById('webFull').setAttribute('aria-pressed', String(full));
      document.getElementById('webFull').textContent = full ? 'Close Full Screen' : 'Full Screen';
      document.body.classList.toggle('web-full-open', full);
      sizePreview();
    });
  }

  function exitFullPreview() {
    document.body.classList.remove('web-full-open');
  }

  /** Fits a computer-width page into the pane by scaling it, never stretching it. */
  function sizePreview() {
    var box = document.getElementById('webFrameBox');
    var frame = document.getElementById('webFrame');
    if (!box || !frame) return;
    var width = WEB_DEVICES[web.device];
    var scale = Math.min(1, box.clientWidth / width);
    frame.style.width = width + 'px';
    frame.style.height = Math.round(box.clientHeight / scale) + 'px';
    frame.style.transform = scale < 1 ? 'scale(' + scale + ')' : 'none';
    frame.style.left = scale < 1 ? '0px' : Math.round((box.clientWidth - width) / 2) + 'px';
  }

  function loadPreview() {
    var frame = document.getElementById('webFrame');
    var note = document.getElementById('webFrameNote');
    if (!frame) return;
    note.textContent = 'Loading the page…';
    note.hidden = false;
    sizePreview();
    frame.onload = function () {
      var doc = frame.contentDocument;
      if (!doc || !doc.body) return;
      guardPreview(doc);
      var found = applyWebPreview();
      note.hidden = found > 0;
      if (!found) {
        note.textContent = 'This page has no editable parts yet — the update that adds them has not ' +
                           'reached the live site.';
      }
      sizePreview();
      if (web.wantFocus) previewFocus(web.wantFocus, true);
    };
    frame.src = web.previewPath + '?preview=' + Date.now();
  }

  function applyWebPreview() {
    var frame = document.getElementById('webFrame');
    var doc = frame && frame.contentDocument;
    if (!doc || !doc.body || !web.page) return 0;
    var found = 0;
    try {
      found = S.applyToDocument(doc, S.render(previewSite(web.draft)));
    } catch (err) {
      return 0;
    }
    /* Lazy pictures arriving late would shift the page under the scroll to
       the item being edited; in the preview, load them all at once. */
    doc.querySelectorAll('img[loading="lazy"]').forEach(function (img) { img.loading = 'eager'; });
    if (web.wantFocus && web.wantFocus !== web.lastFocus) previewFocus(web.wantFocus);
    return found;
  }

  /* Links would take the frame off to another page; in-page ones still scroll. */
  function guardPreview(doc) {
    doc.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a');
      if (!link) return;
      e.preventDefault();
      var href = link.getAttribute('href') || '';
      var target = href.charAt(0) === '#' && doc.getElementById(href.slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    }, true);
  }

  /** The first element of a region in the previewed page. */
  function regionElement(doc, name) {
    var walker = doc.createTreeWalker(doc.body, 128 /* NodeFilter.SHOW_COMMENT */);
    while (walker.nextNode()) {
      if (new RegExp('^\\s*cms:' + name + '(\\s|$)').test(walker.currentNode.nodeValue)) {
        var node = walker.currentNode.nextSibling;
        while (node && node.nodeType !== 1) node = node.nextSibling;
        return node && node.nodeType === 1 ? node : null;
      }
    }
    return null;
  }

  function previewTarget(doc, itemPath) {
    var parts = itemPath.split('.');
    if (web.page === 'online') return doc.getElementById('ytThumb');
    if (web.page === 'home') {
      var region = regionElement(doc, parts[0] === 'gatherings' ? 'home-gatherings' : 'home-whats-on');
      if (region && parts[1] === 'cards' && parts[2] !== undefined) {
        var shown = (web.draft[parts[0]].cards || []).slice(0, +parts[2] + 1)
          .filter(function (c) { return c.visible !== false; }).length;
        return region.querySelectorAll('.card')[shown - 1] || region;
      }
      return region;
    }
    if (parts[0] === 'hero') return doc.querySelector('.page-hero');
    if (parts[0] !== 'sections') return null;
    var section = S.normalise(web.page, web.draft).sections[+parts[1]];
    if (!section) return null;
    if (web.previewPath === '/' && section.type === 'sunday-school') {
      return regionElement(doc, 'home-sunday-school');
    }
    return section.id ? doc.getElementById(section.id) : null;
  }

  /**
   * Scrolls the preview to whatever is being edited. A section that has only
   * just been added may not be in the preview yet, so the scroll is noted as
   * wanted and tried again each time the preview catches up.
   */
  function previewFocus(itemPath, force) {
    if (!itemPath) return;
    web.wantFocus = itemPath;
    if (!force && itemPath === web.lastFocus) return;
    var frame = document.getElementById('webFrame');
    var doc = frame && frame.contentDocument;
    if (!doc || !doc.body) return;
    var target = previewTarget(doc, itemPath);
    if (!target) return;
    web.lastFocus = itemPath;
    var win = frame.contentWindow;
    function aim(behavior) {
      var el = previewTarget(doc, itemPath);
      if (!el) return;
      win.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + win.pageYOffset - 90), behavior: behavior });
    }
    aim('smooth');
    /* Pictures above it may still be arriving; settle once they have. */
    setTimeout(function () { if (web.lastFocus === itemPath) aim('auto'); }, 900);
  }

  window.addEventListener('resize', function () {
    if (document.getElementById('webFrameBox')) sizePreview();
  });

  document.addEventListener('keydown', function (e) {
    var pane = document.getElementById('webPreview');
    if (e.key === 'Escape' && pane && pane.classList.contains('is-full')) {
      document.getElementById('webFull').click();
    }
  });

  /* ── Discarding and publishing ── */

  function discardWebChanges() {
    var btn = document.getElementById('webDiscard');
    /* A second press within a few seconds confirms — no pop-up needed. */
    if (!btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm');
      btn.textContent = 'Press Again to Discard';
      setTimeout(function () {
        if (!btn.isConnected) return;
        btn.classList.remove('is-confirm');
        btn.textContent = 'Discard Changes';
        refreshWebStatus();
      }, 4000);
      return;
    }
    web.draft = S.normalise(web.page, web.state.published[web.page]);
    web.open = new WeakMap();
    if (web.page === 'home') {
      web.open.set(web.draft.gatherings, true);
      web.open.set(web.draft.whatsOn, true);
    }
    btn.classList.remove('is-confirm');
    btn.textContent = 'Discard Changes';
    rerenderWebEditor();
    webChanged();
    msg('webMsg', 'Your changes have been discarded. The editor shows the live version again.', 'info');
  }

  function sendWebPublish(page, retry) {
    var content = S.finalise(page, web.draft);
    var site = previewSite(content);
    return A.call('webPublish', {
      page: page,
      content: content,
      regions: S.render(site),
      rev: web.state.rev,
      summary: S.summarise(page, web.state.published[page], content)
    }).catch(function (err) {
      if (err.code !== 'stale' || !retry) throw err;
      /* Someone published another page since this one was opened. Take their
         version of the other pages, then go again. */
      msg('webMsg', err.message, 'info');
      return A.call('webState').then(function (data) {
        web.state.published = data.published;
        web.state.meta = data.meta;
        web.state.rev = data.rev;
        return sendWebPublish(page, false);
      });
    });
  }

  function publishWebPage() {
    var page = web.page;
    var check = S.validate(page, web.draft);
    if (check.errors.length) {
      msgHtml('webMsg', '<strong>Not published yet.</strong> Please fix these first:<ul class="web-list-msg">' +
        check.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>', 'error');
      return;
    }
    if (!web.state.configured) {
      msg('webMsg', 'Publishing is not connected yet. Your changes are saved as a draft.', 'error');
      return;
    }
    web.watch = null;
    busy('webPublish', true, 'Publishing…');
    msg('webMsg', 'Saving your draft…', 'info');
    saveDraftNow()
      .then(function () {
        msg('webMsg', 'Publishing to the website — this takes a few seconds…', 'info');
        return sendWebPublish(page, true);
      })
      .then(function (data) { webPublished(page, data, check.warnings); })
      .catch(function (err) { if (web.page === page) msg('webMsg', err.message, 'error'); })
      .then(function () { busy('webPublish', false); });
  }

  function webPublished(page, data, warnings) {
    var me = A.getUser().email;
    web.state.published[page] = data.content;
    web.state.draft[page] = data.content;
    web.state.rev = data.rev;
    web.state.meta[page] = Object.assign({}, web.state.meta[page], {
      publishedAt: data.publishedAt, publishedBy: me, draftAt: data.publishedAt, draftBy: me
    });
    if (web.page !== page) return;

    /* Pick up the published picture addresses — unless more was typed while
       publishing, in which case those changes win and go out next time. */
    if (!web.unsaved) {
      var openPaths = [];
      document.querySelectorAll('#webEditor details[data-w-item][open]').forEach(function (el) {
        openPaths.push(el.getAttribute('data-w-item'));
      });
      web.draft = S.normalise(page, data.content);
      web.open = new WeakMap();
      openPaths.forEach(function (path) {
        var item = webGet(path);
        if (item && typeof item === 'object') web.open.set(item, true);
      });
      rerenderWebEditor();
      showSaved('Draft saved ' + shortStamp(data.publishedAt));
    }
    refreshWebStatus();

    var notes = (warnings || []).concat(data.warnings || []);
    var head = '<strong>' + esc(data.message) + '</strong>' +
      (data.commit ? ' <a href="' + esc(data.commit.url) + '" target="_blank" rel="noopener">' +
                     'See the change on GitHub ↗</a>' : '') +
      (notes.length ? '<ul class="web-list-msg">' + notes.map(function (n) {
        return '<li>' + esc(n) + '</li>';
      }).join('') + '</ul>' : '');
    msgHtml('webMsg', head + (data.unchanged ? '' : '<div id="webLive" class="web-live">Waiting for the ' +
      'website to rebuild…</div>'), data.unchanged ? 'info' : 'ok');
    if (!data.unchanged) watchLive(page, data.regions);
  }

  /**
   * After a publish, keeps loading the live page until the new content
   * appears — GitHub Pages usually takes under a minute — so the moderator
   * knows when visitors can see it.
   */
  function watchLive(page, regions) {
    var path = pageInfo(page).path;
    var started = Date.now();
    var token = {};
    web.watch = token;

    function say(html) {
      var el = document.getElementById('webLive');
      if (el && web.watch === token) el.innerHTML = html;
    }

    function tick() {
      if (web.watch !== token) return;
      fetch(path + '?live=' + Date.now(), { cache: 'no-store' })
        .then(function (res) { return res.text(); })
        .then(function (html) {
          if (web.watch !== token) return;
          var names = Object.keys(regions).filter(function (n) { return S.extract(html, n) !== null; });
          var live = names.length > 0 && names.every(function (n) {
            return S.sameMarkup(S.extract(html, n), regions[n]);
          });
          var secs = Math.round((Date.now() - started) / 1000);
          if (live) {
            say('<strong>✓ It’s live.</strong> <a href="' + esc(path) + '" target="_blank" rel="noopener">' +
                'View the page ↗</a>');
            web.watch = null;
          } else if (secs > 420) {
            say('The website is taking longer than usual to rebuild. It will catch up — have a look ' +
                'at the page again in a few minutes.');
            web.watch = null;
          } else {
            say('Waiting for the website to rebuild… (' + secs + 's — usually about a minute)');
            setTimeout(tick, 8000);
          }
        })
        .catch(function () { setTimeout(tick, 8000); });
    }
    setTimeout(tick, 5000);
  }

  /* ── Publish history ── */

  function viewWebsiteHistory() {
    loading('Loading the publish history…');
    A.call('webHistory').then(function (data) {
      var rows = data.history.map(function (h) {
        var pill = h.result === 'published' ? 'green' : (h.result === 'failed' ? 'gold' : 'grey');
        return '<tr>' +
          '<td style="white-space:nowrap;">' + esc(shortStamp(h.publishedAt, true)) +
            '<div class="adm-hint">' + esc(h.publishedBy) + '</div></td>' +
          '<td style="white-space:nowrap;">' + esc(h.pageLabel) + '</td>' +
          '<td>' + esc(h.summary || '—') +
            (h.error ? '<div class="adm-hint">' + esc(h.error) + '</div>' : '') +
            (h.warnings ? '<div class="adm-hint">' + esc(h.warnings) + '</div>' : '') + '</td>' +
          '<td style="white-space:nowrap;"><span class="adm-pill ' + pill + '">' + esc(h.result) + '</span>' +
            (h.commitUrl
              ? '<div class="adm-hint"><a href="' + esc(h.commitUrl) + '" target="_blank" rel="noopener">' +
                'Change <code>' + esc(h.commit.slice(0, 7)) + '</code> ↗</a></div>'
              : '') + '</td>' +
          '<td>' + (h.hasContent
            ? '<button class="adm-btn small secondary" type="button" data-w-restore="' +
              esc(h.publishId) + '">Restore</button>'
            : '') + '</td>' +
        '</tr>';
      }).join('');

      elView.innerHTML = panel('Publish History',
        'Every time a page is published from here: who did it, what changed, and the change it made ' +
        'on GitHub. <strong>Restore</strong> puts that version back into the page’s draft — nothing ' +
        'changes on the website until it is published again.',
        '<div class="adm-msg" id="webHistMsg"></div>' +
        '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
          '<th>Published</th><th>Page</th><th>What changed</th><th>Result</th><th></th>' +
        '</tr></thead><tbody>' +
        (rows || '<tr><td colspan="5">Nothing has been published from here yet.</td></tr>') +
        '</tbody></table></div>');

      elView.querySelectorAll('[data-w-restore]').forEach(function (btn) {
        btn.addEventListener('click', function () { restoreWebVersion(btn); });
      });
    }).catch(webFail);
  }

  function restoreWebVersion(btn) {
    btn.disabled = true;
    A.call('webSnapshot', { publishId: btn.getAttribute('data-w-restore') }).then(function (snap) {
      return A.call('webSaveDraft', { page: snap.page, content: snap.content }).then(function () {
        web.notice = {
          kind: 'info',
          html: 'The version published ' + esc(stampText(snap.publishedAt)) + ' is back in the draft. ' +
                'Check it in the preview, then press <strong>Publish</strong> to put it on the website.'
        };
        window.location.hash = '#/website/' + snap.page;
      });
    }).catch(function (err) {
      btn.disabled = false;
      msg('webHistMsg', err.message, 'error');
    });
  }

  /* ── Settings: Website Publishing ── */

  function viewWebsiteSettings() {
    loading('Loading the publishing settings…');
    return A.call('webSettings').then(function (data) {
      var s = data.settings;
      elView.innerHTML = panel('Website Publishing',
        'Publishing writes the edited pages straight into the website’s GitHub repository, and ' +
        'GitHub Pages rebuilds the site from there. That needs a GitHub access token. It is kept in ' +
        'the Apps Script’s own properties — never in the spreadsheet — and is never shown back here ' +
        'in full.',
        '<div class="adm-msg" id="webSetMsg"></div>' +
        '<form class="adm-form" id="webSetForm">' +
          field('GitHub access token',
            '<input type="password" id="webToken" autocomplete="off" placeholder="' +
            (s.tokenSet ? 'Saved — leave blank to keep it' : 'github_pat_…') + '">',
            s.tokenSet
              ? 'A token is saved (' + esc(s.tokenHint) + '). Paste a new one to replace it.'
              : 'See below for how to make one.') +
          '<div class="adm-grid-2">' +
            field('Repository', '<input type="text" id="webRepo" value="' + esc(s.repo) + '">',
                  'owner/name, as on GitHub.') +
            field('Branch', '<input type="text" id="webBranch" value="' + esc(s.branch) + '">',
                  'The branch GitHub Pages builds the site from.') +
          '</div>' +
          '<div class="adm-actions">' +
            '<button class="adm-btn" type="submit" id="webSetSave">Save Settings</button>' +
            (s.tokenSet
              ? '<button class="adm-btn secondary" type="button" id="webSetTest">Test the Connection</button>' +
                '<button class="adm-btn secondary" type="button" id="webSetClear">Remove the Token</button>'
              : '') +
          '</div>' +
        '</form>' +
        '<h3 class="web-h3">Making a token</h3>' +
        '<ol class="web-steps">' +
          '<li>Sign in to GitHub as the account that owns <code>' + esc(s.repo) + '</code>.</li>' +
          '<li>Open <strong>Settings › Developer settings › Personal access tokens › Fine-grained ' +
            'tokens</strong> and press <strong>Generate new token</strong>.</li>' +
          '<li>Call it <em>WynLife website publishing</em>. Give it the longest expiry you are ' +
            'comfortable with, and put a reminder in the calendar to renew it.</li>' +
          '<li>Under <strong>Repository access</strong>, choose <em>Only select repositories</em> and ' +
            'pick <code>' + esc(s.repo) + '</code>.</li>' +
          '<li>Under <strong>Permissions › Repository permissions</strong>, set <strong>Contents</strong> ' +
            'to <em>Read and write</em>. Nothing else is needed.</li>' +
          '<li>Generate it, copy it, paste it above, press <strong>Save Settings</strong>, then ' +
            '<strong>Test the Connection</strong>.</li>' +
        '</ol>' +
        '<p class="adm-sub">The branch is protected so that code changes go through a pull request. ' +
          'Publishing writes to it directly, so the token’s account has to be on that rule’s bypass ' +
          'list (GitHub › the repository › Settings › Rules) — the repository’s owner already is. ' +
          'The test checks this for you.</p>' +
        (s.imageFolderUrl
          ? '<p class="adm-sub">Uploaded pictures wait in <a href="' + esc(s.imageFolderUrl) + '" ' +
            'target="_blank" rel="noopener">this Drive folder</a> until their page is published; the ' +
            'website then serves its own copy from the repository.</p>'
          : ''));

      on('webSetForm', 'submit', function (e) {
        e.preventDefault();
        busy('webSetSave', true, 'Saving…');
        A.call('webSaveSettings', {
          githubToken: document.getElementById('webToken').value,
          repo: val('webRepo'),
          branch: val('webBranch')
        }).then(function (result) {
          return viewWebsiteSettings().then(function () { msg('webSetMsg', result.message, 'ok'); });
        }).catch(function (err) {
          busy('webSetSave', false);
          msg('webSetMsg', err.message, 'error');
        });
      });

      on('webSetTest', 'click', function () {
        busy('webSetTest', true, 'Testing…');
        A.call('webTestSettings').then(function (result) {
          msgHtml('webSetMsg', esc(result.message) +
            (result.warning ? '<br><strong>' + esc(result.warning) + '</strong>' : ''),
            result.warning ? 'error' : 'ok');
        }).catch(function (err) {
          msg('webSetMsg', err.message, 'error');
        }).then(function () { busy('webSetTest', false); });
      });

      on('webSetClear', 'click', function () {
        busy('webSetClear', true, 'Removing…');
        A.call('webSaveSettings', { clearGithubToken: true }).then(function () {
          return viewWebsiteSettings().then(function () {
            msg('webSetMsg', 'The token has been removed. Nothing can be published until a new ' +
                'one is saved.', 'info');
          });
        }).catch(function (err) {
          busy('webSetClear', false);
          msg('webSetMsg', err.message, 'error');
        });
      });
    }).catch(webFail);
  }

  start();

}());
