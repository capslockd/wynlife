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

  /* ── Menu definition ─────────────────────────────────────────────────── */

  var MENU = [
    { title: 'Manage', items: [
      { route: 'users/new',    label: 'Add New User',   role: 'admin' },
      { route: 'members/new',  label: 'Add New Member', role: 'planner' },
      { route: 'users',        label: 'Modify User',    role: 'admin' },
      { route: 'members',      label: 'Modify Member',  role: 'planner' }
    ] },
    { title: 'Reports', items: [
      { route: 'reports/attendance',    label: 'Attendance Report',    role: 'basic' },
      { route: 'reports/sunday-school', label: 'Sunday School Report', role: 'basic' }
    ] },
    { title: 'Tracking', items: [
      { route: 'tracking/attendance',    label: 'Sunday Attendance',   role: 'planner' },
      { route: 'tracking/sunday-school', label: 'Setup Sunday School', role: 'planner' }
    ] },
    { title: 'Newsletter', items: [
      { route: 'newsletter/compose',    label: 'Compose Newsletter', cap: 'newsletter' },
      { route: 'newsletter',            label: 'Newsletter History', cap: 'newsletter' },
      { route: 'newsletter/recipients', label: 'Recipients',         cap: 'newsletter' },
      { route: 'newsletter/settings',   label: 'Email Settings',     role: 'admin' }
    ] }
  ];

  var VIEWS = {
    '':                          viewDashboard,
    'users/new':                 viewAddUser,
    'users':                     viewModifyUser,
    'members/new':               viewAddMember,
    'members':                   viewModifyMember,
    'tracking/attendance':       viewSundayAttendance,
    'tracking/sunday-school':    viewSetupSundaySchool,
    'reports/attendance':        viewAttendanceReport,
    'reports/sunday-school':     viewSundaySchoolReport,
    'newsletter':                viewNewsletterHistory,
    'newsletter/compose':        viewNewsletterCompose,
    'newsletter/recipients':     viewNewsletterRecipients,
    'newsletter/settings':       viewNewsletterSettings
  };

  var ROUTE_ROLE = {};
  var ROUTE_CAP  = {};
  MENU.forEach(function (group) {
    group.items.forEach(function (item) {
      if (item.role) ROUTE_ROLE[item.route] = item.role;
      if (item.cap) ROUTE_CAP[item.route] = item.cap;
    });
  });

  /** Every menu entry is gated either by a minimum role or by a capability. */
  function allowed(item) {
    return item.cap ? A.can(item.cap) : A.hasRole(item.role);
  }

  /* ── Boot ────────────────────────────────────────────────────────────── */

  function start() {
    if (elMenuToggle) {
      elMenuToggle.addEventListener('click', function () {
        setMenuOpen(!elMenu.classList.contains('is-open'));
      });
      /* Any menu tap navigates, so close the drawer behind it. */
      elMenu.addEventListener('click', function (e) {
        if (e.target.closest('a')) setMenuOpen(false);
      });
    }
    if (A.getUser() && A.getToken()) {
      showApp();
    } else {
      showLogin();
    }
    window.addEventListener('hashchange', route);
  }

  function showLogin(message) {
    setMenuOpen(false);
    elApp.hidden = true;
    elLogin.hidden = false;
    elWho.innerHTML = '';
    elLogin.innerHTML =
      '<div class="adm-login">' +
        '<h2>Church Admin</h2>' +
        '<p class="adm-sub">Sign in to manage members, record Sunday attendance and ' +
        'run weekly reports.</p>' +
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

  /** The menu label for a route, used by the mobile toggle button. */
  function routeLabel(route) {
    var label = 'Dashboard';
    MENU.forEach(function (group) {
      group.items.forEach(function (item) {
        if (item.route === route) label = item.label;
      });
    });
    return label;
  }

  function renderMenu() {
    var current = currentRoute();
    if (elMenuCurrent) elMenuCurrent.textContent = routeLabel(current);
    elMenu.innerHTML = MENU.map(function (group) {
      var links = group.items.map(function (item) {
        var ok = allowed(item);
        return '<a href="#/' + item.route + '"' +
          ' class="' + (item.route === current ? 'active ' : '') + (ok ? '' : 'disabled') + '"' +
          (ok ? '' : ' title="' + (item.cap
            ? 'Not available to your role'
            : 'Requires the ' + item.role + ' role') + '" aria-disabled="true"') +
          '>' + esc(item.label) + '</a>';
      }).join('');
      return '<div class="adm-menu-group"><div class="adm-menu-title">' +
        esc(group.title) + '</div>' + links + '</div>';
    }).join('');
  }

  /* ── Routing ─────────────────────────────────────────────────────────── */

  function currentRoute() {
    return (window.location.hash || '').replace(/^#\/?/, '').replace(/\/$/, '');
  }

  function route() {
    if (!A.getUser()) { showLogin(); return; }
    setMenuOpen(false);
    var name = currentRoute();
    var view = VIEWS[name];
    var param = '';
    /* Routes may carry one trailing id, e.g. #/newsletter/compose/NLT-0007. */
    if (!view) {
      var cut = name.lastIndexOf('/');
      if (cut > 0 && VIEWS[name.slice(0, cut)]) {
        param = decodeURIComponent(name.slice(cut + 1));
        name = name.slice(0, cut);
        view = VIEWS[name];
      }
    }
    renderMenu();
    if (!view) {
      elView.innerHTML = panel('Page not found',
        'That admin screen does not exist. Pick something from the menu.');
      return;
    }
    var neededCap = ROUTE_CAP[name];
    var neededRole = ROUTE_ROLE[name];
    if ((neededCap && !A.can(neededCap)) || (neededRole && !A.hasRole(neededRole))) {
      elView.innerHTML = panel('Not available to your role',
        'Your role (<strong>' + esc(A.roleLabel(A.getUser().role)) + '</strong>) does not ' +
        'have access to this screen. Ask an administrator if you need it.');
      return;
    }
    window.scrollTo(0, 0);
    view(param);
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
      (A.can('newsletter') ? newsletterWalkthrough : ''));
  }

  /* ── Manage: Add New User ────────────────────────────────────────────── */

  function viewAddUser() {
    elView.innerHTML = panel('Add New User',
      'Create a login for the admin console. <strong>Basic</strong> can view reports, ' +
      '<strong>Planner</strong> can also manage members and record attendance, ' +
      '<strong>Admin</strong> can do everything including managing users. ' +
      '<strong>Email Administrator</strong> sits on its own: it can compose and send the ' +
      'newsletter and nothing else — no members, no attendance, no reports.',
      '<div class="adm-msg" id="userMsg"></div>' +
      '<form class="adm-form" id="addUserForm">' +
        '<div class="adm-grid-2">' +
          field('Email', '<input type="email" id="nuEmail" required autocomplete="off">') +
          field('Display name', '<input type="text" id="nuName" autocomplete="off">') +
        '</div>' +
        '<div class="adm-grid-2">' +
          field('Password', '<input type="password" id="nuPassword" required autocomplete="new-password">',
                'At least 8 characters.') +
          field('Role',
            '<select id="nuRole">' +
              '<option value="basic">Basic — reports only</option>' +
              '<option value="planner">Planner — members &amp; attendance</option>' +
              '<option value="admin">Admin — full access</option>' +
              '<option value="email">Email Administrator — newsletter only</option>' +
            '</select>') +
        '</div>' +
        '<div class="adm-actions">' +
          '<button class="adm-btn" type="submit" id="nuSave">Create User</button>' +
          '<a class="adm-btn secondary" href="#/users">View all users</a>' +
        '</div>' +
      '</form>');

    on('addUserForm', 'submit', function (e) {
      e.preventDefault();
      busy('nuSave', true, 'Creating…');
      A.call('addUser', {
        email: val('nuEmail'),
        name: val('nuName'),
        password: document.getElementById('nuPassword').value,
        role: val('nuRole')
      }).then(function (data) {
        document.getElementById('addUserForm').reset();
        msg('userMsg', data.message, 'ok');
      }).catch(function (err) {
        msg('userMsg', err.message, 'error');
      }).then(function () { busy('nuSave', false); });
    });
  }

  /* ── Manage: Modify User ─────────────────────────────────────────────── */

  function viewModifyUser() {
    loading('Loading users…');
    A.call('listUsers').then(function (data) {
      renderUserList(data.users);
    }).catch(fail);
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

    elView.innerHTML = panel('Modify User',
      'Change a role, rename someone, reset a password, or disable an account. ' +
      'At least one active admin must always remain.',
      '<div class="adm-msg" id="userMsg"></div>' +
      '<div id="userEditSlot"></div>' +
      '<div class="adm-table-wrap"><table class="adm-table"><thead><tr>' +
        '<th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Last login</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="6">No users yet.</td></tr>') +
      '</tbody></table></div>');

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
            field('Role',
              '<select id="euRole">' +
                ['basic', 'planner', 'admin', 'email'].map(function (role) {
                  return '<option value="' + role + '"' +
                    (role === user.role ? ' selected' : '') + '>' +
                    esc(A.roleLabel(role)) + '</option>';
                }).join('') +
              '</select>') +
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
        viewModifyUser();
        setTimeout(function () { msg('userMsg', data.message, 'ok'); }, 0);
      }).catch(function (err) {
        busy('euSave', false);
        msg('userMsg', err.message, 'error');
      });
    });
  }

  /* ── Manage: Add New Member ──────────────────────────────────────────── */

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

  function viewAddMember() {
    elView.innerHTML = panel('Add New Member',
      'Adds a church goer to the <strong>Member Data</strong> sheet. Tick ' +
      '<em>Sunday Schooler</em> for children who attend Sunday School — the ' +
      'Sunday School roster is built from that flag.',
      '<div class="adm-msg" id="memberMsg"></div>' +
      '<form class="adm-form" id="addMemberForm">' +
        memberFormFields(null) +
        '<div class="adm-actions">' +
          '<button class="adm-btn" type="submit" id="mSave">Add Member</button>' +
          '<a class="adm-btn secondary" href="#/members">View all members</a>' +
        '</div>' +
      '</form>');

    on('addMemberForm', 'submit', function (e) {
      e.preventDefault();
      busy('mSave', true, 'Saving…');
      A.call('addMember', readMemberForm()).then(function (data) {
        document.getElementById('addMemberForm').reset();
        document.getElementById('mActive').checked = true;
        msg('memberMsg', data.message, 'ok');
      }).catch(function (err) {
        msg('memberMsg', err.message, 'error');
      }).then(function () { busy('mSave', false); });
    });
  }

  /* ── Manage: Modify Member ───────────────────────────────────────────── */

  function viewModifyMember() {
    loading('Loading members…');
    A.call('listMembers').then(function (data) {
      renderMemberList(data.members, '');
    }).catch(fail);
  }

  function renderMemberList(members, query) {
    elView.innerHTML = panel('Modify Member',
      'Search by name or family group, then edit the record.',
      '<div class="adm-msg" id="memberMsg"></div>' +
      '<div id="memberEditSlot"></div>' +
      '<div class="adm-toolbar">' +
        field('Search', '<input type="search" id="memberSearch" placeholder="Name, family group or suburb" value="' +
          esc(query || '') + '">') +
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
        viewModifyMember();
        setTimeout(function () { msg('memberMsg', data.message, 'ok'); }, 0);
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
          '<a href="#/members/new">Add New Member</a>.</td></tr>';

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
              nlText('Picture description', 'sermon.imageAlt') +
              nlText('Contents label', 'sermon.contentsLabel',
                     'How this appears in the Editorial design’s contents list.'),
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
  function encode(canvas, transparent) {
    if (transparent) return toBlob(canvas, 'image/png');
    var step = 0;
    function attempt() {
      return toBlob(canvas, 'image/jpeg', NL_JPEG_QUALITY[step]).then(function (blob) {
        step += 1;
        if (blob.size <= NL_TARGET_BYTES || step >= NL_JPEG_QUALITY.length) return blob;
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

  /** Resolves to { base64, mimeType, name, note } ready to hand to the API. */
  function prepareImage(file, columnWidth) {
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

      var scale = Math.min(1, NL_MAX_EDGE / Math.max(width, height));
      var targetW = Math.max(1, Math.round(width * scale));
      var targetH = Math.max(1, Math.round(height * scale));

      var canvas = scale < 1
        ? scaleDown(source, width, height, targetW, targetH)
        : drawTo(source, targetW, targetH);

      var transparent = usesTransparency(canvas);

      return encode(canvas, transparent).then(function (blob) {
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
    var columnWidth = nlDraft.design === 'editorial' ? 532 : 600;

    prepareImage(file, columnWidth).then(function (ready) {
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
    A.call('nlRecipients').then(function (data) {
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
        viewNewsletterRecipients();
        setTimeout(function () { msg('rcpMsg', result.message, 'ok'); }, 0);
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
        viewNewsletterRecipients();
        setTimeout(function () {
          msg('rcpMsg', note, result.skipped.length ? 'info' : 'ok');
        }, 0);
      }).catch(function (err) {
        busy('rcpImportSave', false);
        msg('rcpMsg', err.message, 'error');
      });
    });
  }

  /* ── Email settings ── */

  function viewNewsletterSettings() {
    loading('Loading email settings…');
    A.call('nlSettings').then(function (data) {
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
          viewNewsletterSettings();
          setTimeout(function () { msg('nlSetMsg', result.message, 'ok'); }, 0);
        }).catch(function (err) {
          busy('nlSetSave', false);
          msg('nlSetMsg', err.message, 'error');
        });
      });

      on('nlSetClear', 'click', function () {
        busy('nlSetClear', true, 'Removing…');
        A.call('nlSaveSettings', { clearApiKey: true }).then(function () {
          viewNewsletterSettings();
          setTimeout(function () {
            msg('nlSetMsg', 'The Brevo key has been removed. No newsletters can go out ' +
                'until a new one is saved.', 'info');
          }, 0);
        }).catch(function (err) {
          busy('nlSetClear', false);
          msg('nlSetMsg', err.message, 'error');
        });
      });
    }).catch(fail);
  }

  start();

}());
