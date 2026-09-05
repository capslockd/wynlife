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
    'reports/sunday-school':     viewSundaySchoolReport
  };

  var ROUTE_ROLE = {};
  MENU.forEach(function (group) {
    group.items.forEach(function (item) { ROUTE_ROLE[item.route] = item.role; });
  });

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
      esc(user.role) + '</span></span>' +
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
        var allowed = A.hasRole(item.role);
        return '<a href="#/' + item.route + '"' +
          ' class="' + (item.route === current ? 'active ' : '') + (allowed ? '' : 'disabled') + '"' +
          (allowed ? '' : ' title="Requires the ' + item.role + ' role" aria-disabled="true"') +
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
    renderMenu();
    if (!view) {
      elView.innerHTML = panel('Page not found',
        'That admin screen does not exist. Pick something from the menu.');
      return;
    }
    var needed = ROUTE_ROLE[name];
    if (needed && !A.hasRole(needed)) {
      elView.innerHTML = panel('Not available to your role',
        'This screen needs the <strong>' + esc(needed) + '</strong> role. ' +
        'Ask an administrator to change your role if you need access.');
      return;
    }
    window.scrollTo(0, 0);
    view();
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
    elView.innerHTML = panel(
      'Welcome, ' + esc((user.name || user.email).split(' ')[0]),
      'This is the WynLife Church management console. Everything you record here ' +
      'is written straight into the <strong>Wynlife Management App Data Sheet</strong> ' +
      'on Google Drive.',
      '<div class="adm-stats">' +
        '<div class="adm-stat"><div class="v" style="font-size:1.25rem;">' +
          esc(A.prettyDate(sunday)) + '</div><div class="k">Most recent Sunday</div></div>' +
        '<div class="adm-stat"><div class="v">' + esc(user.role) + '</div><div class="k">Your role</div></div>' +
      '</div>' +
      '<h3 style="font-family:\'Merriweather\',serif;color:var(--navy);font-size:1.1rem;margin:8px 0 10px;">' +
      'A normal Sunday</h3>' +
      '<ol style="color:var(--gray);line-height:1.9;font-size:0.95rem;padding-left:22px;max-width:620px;">' +
        '<li><a href="#/tracking/attendance">Sunday Attendance</a> — tick everyone who came.</li>' +
        '<li><a href="#/tracking/sunday-school">Setup Sunday School</a> — build the kids roster from ' +
          'that attendance, then share the parent link.</li>' +
        '<li>Parents sign their children in and out at <code>' + esc(A.checkinPath) + '</code>.</li>' +
        '<li><a href="#/reports/attendance">Attendance Report</a> and ' +
          '<a href="#/reports/sunday-school">Sunday School Report</a> — export the week.</li>' +
      '</ol>');
  }

  /* ── Manage: Add New User ────────────────────────────────────────────── */

  function viewAddUser() {
    elView.innerHTML = panel('Add New User',
      'Create a login for the admin console. <strong>Basic</strong> can view reports, ' +
      '<strong>Planner</strong> can also manage members and record attendance, ' +
      '<strong>Admin</strong> can do everything including managing users.',
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
        '<td><span class="adm-pill blue">' + esc(user.role) + '</span></td>' +
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
                ['basic', 'planner', 'admin'].map(function (role) {
                  return '<option value="' + role + '"' +
                    (role === user.role ? ' selected' : '') + '>' + role + '</option>';
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
          '<div class="k">On the roll</div></div>' +
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
      var entries = rows.map(function (row) {
        return { memberId: row.memberId, present: !!state[row.memberId] };
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
      '<strong>Sunday School Data</strong> sheet. Signing in issues the parent a ' +
      '4-digit PIN which they must give back to sign the child out — the ' +
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

  start();

}());
