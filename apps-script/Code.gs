/****************************************************************************
 * WynLife Church — Management App backend (Google Apps Script)
 *
 * Bound to the Google Spreadsheet: "Wynlife Management App Data Sheet"
 *
 * Sheets used
 *   Member Data              — the church-goer roster
 *   Attendance Tracking Data — one row per member per Sunday service
 *   Sunday School Data       — sign in / sign out log for Sunday School kids
 *   App Users                — login accounts + roles for the admin site
 *
 * Deployment: Deploy > New deployment > Web app
 *   Execute as:  Me
 *   Access:      Anyone
 * Then paste the /exec URL into admin-config.js on the website.
 *
 * See README.md in this folder for the full setup walkthrough.
 ****************************************************************************/

/* ─────────────────────────── Configuration ─────────────────────────── */

var SHEETS = {
  members:      'Member Data',
  attendance:   'Attendance Tracking Data',
  sundaySchool: 'Sunday School Data',
  users:        'App Users'
};

var HEADERS = {
  members: [
    'Member ID', 'First Name', 'Last Name', 'Date of Birth', 'Special Dates',
    'Sunday Schooler', 'Grouped as Family', 'Family Group Name',
    'Mobile', 'Email', 'Notes', 'Active', 'Created At', 'Updated At'
  ],
  attendance: [
    'Record ID', 'Service Date', 'Member ID', 'First Name', 'Last Name',
    'Family Group Name', 'Sunday Schooler', 'Present', 'Recorded By', 'Recorded At'
  ],
  sundaySchool: [
    'Record ID', 'Service Date', 'Member ID', 'First Name', 'Last Name',
    'Family Group Name', 'Status', 'Sign In At', 'Signed In By',
    'Sign Out At', 'Signed Out By', 'Setup By', 'Setup At', 'PIN'
  ],
  users: [
    'User ID', 'Email', 'Display Name', 'Role', 'Salt', 'Password Hash',
    'Active', 'Created At', 'Last Login'
  ]
};

/* Bootstrap administrator — created by setup() if the sheet has no users. */
var BOOTSTRAP_ADMIN = {
  email: 'wynlifechurch@gmail.com',
  password: 'JesusSavedMe#316',
  name: 'WynLife Admin',
  role: 'admin'
};

var ROLES = ['basic', 'planner', 'admin'];
var ROLE_RANK = { basic: 1, planner: 2, admin: 3 };

var SESSION_HOURS = 12;

/* Actions that parents may call without logging in (Sunday School kiosk). */
var PUBLIC_ACTIONS = ['ping', 'ssRoster', 'ssSignIn', 'ssSignOut'];

/* ─────────────────────────── One-time setup ─────────────────────────── */

/**
 * Run this once from the Apps Script editor (Run > setup).
 * Creates any missing sheet, writes the header rows, and seeds the
 * bootstrap administrator account. Safe to re-run — it never deletes data.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = [];

  Object.keys(SHEETS).forEach(function (key) {
    var name = SHEETS[key];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      log.push('Created sheet "' + name + '"');
    }
    var headers = HEADERS[key];
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumns(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#1a2744')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  });

  /* Date formatting so the sheets stay human-readable. */
  formatColumn_(SHEETS.members, 'Date of Birth', 'yyyy-mm-dd');
  formatColumn_(SHEETS.attendance, 'Service Date', 'yyyy-mm-dd');
  formatColumn_(SHEETS.sundaySchool, 'Service Date', 'yyyy-mm-dd');

  /* Remove the default "Sheet1" if it is empty and unused. */
  var stray = ss.getSheetByName('Sheet1');
  if (stray && stray.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(stray);
  }

  if (readRows_(SHEETS.users).length === 0) {
    createUser_(BOOTSTRAP_ADMIN.email, BOOTSTRAP_ADMIN.password,
                BOOTSTRAP_ADMIN.name, BOOTSTRAP_ADMIN.role);
    log.push('Created bootstrap admin ' + BOOTSTRAP_ADMIN.email);
  }

  getSecret_(); /* generate the session-signing secret up front */

  log.push('Setup complete.');
  Logger.log(log.join('\n'));
  return log.join('\n');
}

function formatColumn_(sheetName, headerName, format) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headers.indexOf(headerName);
  if (idx < 0) return;
  sheet.getRange(2, idx + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat(format);
}

/* ─────────────────────────── HTTP entry points ─────────────────────────── */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var body = {};
  if (params.payload) {
    try { body = JSON.parse(params.payload); } catch (err) { body = {}; }
  }
  body.action = params.action || body.action;
  body.token = params.token || body.token;
  var result = handle_(body);
  if (params.callback) {
    return ContentService
      .createTextOutput(params.callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(result);
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Malformed request body.' });
  }
  return json_(handle_(body));
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─────────────────────────── Request router ─────────────────────────── */

function handle_(body) {
  var action = body && body.action;
  if (!action) return { ok: false, error: 'No action supplied.' };

  try {
    if (action === 'login') return apiLogin_(body);
    if (PUBLIC_ACTIONS.indexOf(action) !== -1) return handlePublic_(action, body);

    var session = requireSession_(body.token);

    switch (action) {
      case 'me':                 return { ok: true, user: session };

      /* Manage */
      case 'listUsers':          return apiListUsers_(session);
      case 'addUser':            return apiAddUser_(session, body);
      case 'updateUser':         return apiUpdateUser_(session, body);
      case 'listMembers':        return apiListMembers_(session);
      case 'addMember':          return apiAddMember_(session, body);
      case 'updateMember':       return apiUpdateMember_(session, body);

      /* Tracking */
      case 'getAttendance':      return apiGetAttendance_(session, body);
      case 'saveAttendance':     return apiSaveAttendance_(session, body);
      case 'setupSundaySchool':  return apiSetupSundaySchool_(session, body);
      case 'getSundaySchool':    return apiGetSundaySchool_(session, body);

      /* Reports */
      case 'attendanceReport':   return apiAttendanceReport_(session, body);
      case 'sundaySchoolReport': return apiSundaySchoolReport_(session, body);

      default: return { ok: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

function handlePublic_(action, body) {
  switch (action) {
    case 'ping':       return { ok: true, service: 'WynLife Management App', time: nowIso_() };
    case 'ssRoster':   return apiSsRoster_(body);
    case 'ssSignIn':   return apiSsSign_(body, 'in');
    case 'ssSignOut':  return apiSsSign_(body, 'out');
    default:           return { ok: false, error: 'Unknown action: ' + action };
  }
}

/* ─────────────────────────── Sheet helpers ─────────────────────────── */

function sheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet "' + name + '" is missing. Run setup() from the Apps Script editor.');
  }
  return sheet;
}

/** Returns [{_row: 2, 'First Name': ..}, ..] for every data row of a sheet. */
function readRows_(name) {
  var sheet = sheet_(name);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.join('').toString().trim() === '') continue;
    var obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      if (headers[c] === '') continue;
      obj[headers[c]] = row[c];
    }
    out.push(obj);
  }
  return out;
}

function headers_(name) {
  var sheet = sheet_(name);
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

/** Appends one row built from an object keyed by header name. */
function appendRow_(name, obj) {
  var sheet = sheet_(name);
  var hdrs = headers_(name);
  var row = hdrs.map(function (h) {
    return obj.hasOwnProperty(h) ? obj[h] : '';
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/** Appends many rows at once (far faster than appendRow_ in a loop). */
function appendRows_(name, objects) {
  if (!objects.length) return;
  var sheet = sheet_(name);
  var hdrs = headers_(name);
  var rows = objects.map(function (obj) {
    return hdrs.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, hdrs.length).setValues(rows);
}

/** Writes the given header/value pairs into an existing row. */
function updateRow_(name, rowNumber, obj) {
  var sheet = sheet_(name);
  var hdrs = headers_(name);
  Object.keys(obj).forEach(function (key) {
    var idx = hdrs.indexOf(key);
    if (idx >= 0) sheet.getRange(rowNumber, idx + 1).setValue(obj[key]);
  });
}

function nextId_(sheetName, headerName, prefix) {
  var rows = readRows_(sheetName);
  var max = 0;
  rows.forEach(function (row) {
    var raw = String(row[headerName] || '');
    var num = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num > max) max = num;
  });
  return prefix + pad_(max + 1, 4);
}

function pad_(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm:ss");
}

function tz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Australia/Melbourne';
}

/** Normalises anything date-like (Date object or string) to 'yyyy-MM-dd'. */
function dateKey_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, tz_(), 'yyyy-MM-dd');
  }
  var str = String(value).trim();
  var m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, tz_(), 'yyyy-MM-dd');
  return str;
}

function bool_(value) {
  if (value === true) return true;
  if (value === false || value === '' || value === null || value === undefined) return false;
  var str = String(value).trim().toLowerCase();
  return str === 'true' || str === 'yes' || str === 'y' || str === '1';
}

function str_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** '2026-09-06T09:41:12' -> '9:41 am', to match how the pages show times. */
function clockTime_(stamp) {
  var match = String(stamp).match(/(\d{2}):(\d{2})/);
  if (!match) return '';
  var hour = parseInt(match[1], 10);
  var suffix = hour < 12 ? 'am' : 'pm';
  return (hour % 12 === 0 ? 12 : hour % 12) + ':' + match[2] + ' ' + suffix;
}

/* ─────────────────────────── Auth ─────────────────────────── */

function getSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('SESSION_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SESSION_SECRET', secret);
  }
  return secret;
}

function hashPassword_(password, salt) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + '::' + password, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

function sign_(text) {
  var bytes = Utilities.computeHmacSha256Signature(text, getSecret_());
  return Utilities.base64EncodeWebSafe(bytes);
}

/**
 * Sessions are stateless: a base64 payload plus an HMAC signature, so no
 * server-side session store is needed and a stolen token expires on its own.
 */
function makeToken_(user) {
  var payload = {
    email: user.email,
    role: user.role,
    name: user.name,
    userId: user.userId,
    exp: Date.now() + SESSION_HOURS * 3600 * 1000
  };
  var encoded = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  return encoded + '.' + sign_(encoded);
}

function requireSession_(token) {
  var session = readToken_(token);
  if (!session) throw new Error('Your session has expired. Please sign in again.');
  return session;
}

function readToken_(token) {
  if (!token || String(token).indexOf('.') === -1) return null;
  var parts = String(token).split('.');
  var encoded = parts[0];
  var signature = parts[1];
  if (sign_(encoded) !== signature) return null;
  var payload;
  try {
    payload = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString());
  } catch (err) {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function requireRole_(session, minRole) {
  var have = ROLE_RANK[session.role] || 0;
  var need = ROLE_RANK[minRole] || 99;
  if (have < need) {
    throw new Error('Your role (' + session.role + ') is not allowed to do that.');
  }
}

function findUserByEmail_(email) {
  var target = str_(email).toLowerCase();
  var rows = readRows_(SHEETS.users);
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i]['Email']).toLowerCase() === target) return rows[i];
  }
  return null;
}

function createUser_(email, password, name, role) {
  if (!str_(email) || !str_(password)) throw new Error('Email and password are required.');
  if (ROLES.indexOf(role) === -1) throw new Error('Role must be one of: ' + ROLES.join(', '));
  if (findUserByEmail_(email)) throw new Error('A user with that email already exists.');
  if (String(password).length < 8) throw new Error('Password must be at least 8 characters.');

  var salt = Utilities.getUuid();
  var userId = nextId_(SHEETS.users, 'User ID', 'USR-');
  appendRow_(SHEETS.users, {
    'User ID': userId,
    'Email': str_(email).toLowerCase(),
    'Display Name': str_(name) || str_(email),
    'Role': role,
    'Salt': salt,
    'Password Hash': hashPassword_(password, salt),
    'Active': true,
    'Created At': nowIso_(),
    'Last Login': ''
  });
  return userId;
}

function apiLogin_(body) {
  var email = str_(body.email);
  var password = String(body.password || '');
  var user = findUserByEmail_(email);
  if (!user || !bool_(user['Active'])) {
    return { ok: false, error: 'Email or password is incorrect.' };
  }
  if (hashPassword_(password, str_(user['Salt'])) !== str_(user['Password Hash'])) {
    return { ok: false, error: 'Email or password is incorrect.' };
  }
  updateRow_(SHEETS.users, user._row, { 'Last Login': nowIso_() });

  var profile = {
    userId: str_(user['User ID']),
    email: str_(user['Email']),
    name: str_(user['Display Name']),
    role: str_(user['Role']) || 'basic'
  };
  return { ok: true, token: makeToken_(profile), user: profile };
}

/* ─────────────────────────── Manage: users ─────────────────────────── */

function apiListUsers_(session) {
  requireRole_(session, 'admin');
  var users = readRows_(SHEETS.users).map(function (row) {
    return {
      userId: str_(row['User ID']),
      email: str_(row['Email']),
      name: str_(row['Display Name']),
      role: str_(row['Role']),
      active: bool_(row['Active']),
      createdAt: str_(row['Created At']),
      lastLogin: str_(row['Last Login'])
    };
  });
  return { ok: true, users: users, roles: ROLES };
}

function apiAddUser_(session, body) {
  requireRole_(session, 'admin');
  var userId = createUser_(body.email, body.password, body.name, str_(body.role) || 'basic');
  return { ok: true, userId: userId, message: 'User ' + str_(body.email) + ' created.' };
}

function apiUpdateUser_(session, body) {
  requireRole_(session, 'admin');
  var rows = readRows_(SHEETS.users);
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i]['User ID']) === str_(body.userId)) { target = rows[i]; break; }
  }
  if (!target) throw new Error('User not found.');

  var patch = {};
  if (body.name !== undefined) patch['Display Name'] = str_(body.name);
  if (body.role !== undefined) {
    if (ROLES.indexOf(body.role) === -1) throw new Error('Unknown role: ' + body.role);
    patch['Role'] = body.role;
  }
  if (body.active !== undefined) patch['Active'] = bool_(body.active);
  if (body.email !== undefined &&
      str_(body.email).toLowerCase() !== str_(target['Email']).toLowerCase()) {
    if (findUserByEmail_(body.email)) throw new Error('Another user already uses that email.');
    patch['Email'] = str_(body.email).toLowerCase();
  }
  if (str_(body.password)) {
    if (String(body.password).length < 8) throw new Error('Password must be at least 8 characters.');
    var salt = Utilities.getUuid();
    patch['Salt'] = salt;
    patch['Password Hash'] = hashPassword_(body.password, salt);
  }

  /* Never let the last active admin lock everybody out. */
  var demoting = (patch['Role'] && patch['Role'] !== 'admin') || patch['Active'] === false;
  if (demoting && str_(target['Role']) === 'admin') {
    var otherAdmins = rows.filter(function (row) {
      return str_(row['Role']) === 'admin' && bool_(row['Active']) &&
             str_(row['User ID']) !== str_(target['User ID']);
    });
    if (!otherAdmins.length) throw new Error('This is the last active admin — keep at least one.');
  }

  updateRow_(SHEETS.users, target._row, patch);
  return { ok: true, message: 'User updated.' };
}

/* ─────────────────────────── Manage: members ─────────────────────────── */

function memberOut_(row) {
  return {
    memberId: str_(row['Member ID']),
    firstName: str_(row['First Name']),
    lastName: str_(row['Last Name']),
    dob: dateKey_(row['Date of Birth']),
    specialDates: str_(row['Special Dates']),
    sundaySchooler: bool_(row['Sunday Schooler']),
    familyGrouped: bool_(row['Grouped as Family']),
    familyGroupName: str_(row['Family Group Name']),
    mobile: str_(row['Mobile']),
    email: str_(row['Email']),
    notes: str_(row['Notes']),
    active: bool_(row['Active']),
    createdAt: str_(row['Created At']),
    updatedAt: str_(row['Updated At'])
  };
}

function apiListMembers_(session) {
  var members = readRows_(SHEETS.members).map(memberOut_);
  members.sort(function (a, b) {
    return (a.lastName + a.firstName).toLowerCase() > (b.lastName + b.firstName).toLowerCase() ? 1 : -1;
  });
  var groups = {};
  members.forEach(function (m) { if (m.familyGroupName) groups[m.familyGroupName] = true; });
  return { ok: true, members: members, familyGroups: Object.keys(groups).sort() };
}

function memberPatch_(body) {
  var patch = {};
  if (body.firstName !== undefined)       patch['First Name'] = str_(body.firstName);
  if (body.lastName !== undefined)        patch['Last Name'] = str_(body.lastName);
  if (body.dob !== undefined)             patch['Date of Birth'] = dateKey_(body.dob);
  if (body.specialDates !== undefined)    patch['Special Dates'] = str_(body.specialDates);
  if (body.sundaySchooler !== undefined)  patch['Sunday Schooler'] = bool_(body.sundaySchooler);
  if (body.familyGrouped !== undefined)   patch['Grouped as Family'] = bool_(body.familyGrouped);
  if (body.familyGroupName !== undefined) patch['Family Group Name'] = str_(body.familyGroupName);
  if (body.mobile !== undefined)          patch['Mobile'] = str_(body.mobile);
  if (body.email !== undefined)           patch['Email'] = str_(body.email);
  if (body.notes !== undefined)           patch['Notes'] = str_(body.notes);
  if (body.active !== undefined)          patch['Active'] = bool_(body.active);
  return patch;
}

function apiAddMember_(session, body) {
  requireRole_(session, 'planner');
  if (!str_(body.firstName) || !str_(body.lastName)) {
    throw new Error('First name and last name are required.');
  }
  var memberId = nextId_(SHEETS.members, 'Member ID', 'MEM-');
  var record = memberPatch_(body);
  record['Member ID'] = memberId;
  if (record['Active'] === undefined) record['Active'] = true;
  record['Created At'] = nowIso_();
  record['Updated At'] = nowIso_();
  appendRow_(SHEETS.members, record);
  return {
    ok: true, memberId: memberId,
    message: str_(body.firstName) + ' ' + str_(body.lastName) + ' added as ' + memberId + '.'
  };
}

function apiUpdateMember_(session, body) {
  requireRole_(session, 'planner');
  var row = findMemberRow_(body.memberId);
  if (!row) throw new Error('Member not found.');
  var patch = memberPatch_(body);
  patch['Updated At'] = nowIso_();
  updateRow_(SHEETS.members, row._row, patch);
  return { ok: true, message: 'Member updated.' };
}

function findMemberRow_(memberId) {
  var rows = readRows_(SHEETS.members);
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i]['Member ID']) === str_(memberId)) return rows[i];
  }
  return null;
}

/* ─────────────────────── Tracking: Sunday attendance ─────────────────────── */

/**
 * Returns the roll for a service date, plus whatever has already been recorded
 * for it, so the attendance screen can render tick boxes.
 *
 * Everyone active is on the roll, and so is anyone inactive who belongs to a
 * family group — families show up whole, so a parent ticking off their group
 * never finds a relative missing. Inactive people carry a flag so the screen
 * can mark them.
 */
function apiGetAttendance_(session, body) {
  var serviceDate = dateKey_(body.serviceDate);
  if (!serviceDate) throw new Error('A service date is required.');

  var existing = {};
  readRows_(SHEETS.attendance).forEach(function (row) {
    if (dateKey_(row['Service Date']) === serviceDate) {
      existing[str_(row['Member ID'])] = {
        present: bool_(row['Present']),
        recordedBy: str_(row['Recorded By']),
        recordedAt: str_(row['Recorded At'])
      };
    }
  });

  var members = readRows_(SHEETS.members).map(memberOut_).filter(function (m) {
    return m.active || !!m.familyGroupName;
  });
  members.sort(function (a, b) {
    var ga = (a.familyGroupName || 'zzzz').toLowerCase();
    var gb = (b.familyGroupName || 'zzzz').toLowerCase();
    if (ga !== gb) return ga > gb ? 1 : -1;
    return (a.lastName + a.firstName).toLowerCase() > (b.lastName + b.firstName).toLowerCase() ? 1 : -1;
  });

  var rows = members.map(function (m) {
    var rec = existing[m.memberId];
    return {
      memberId: m.memberId,
      firstName: m.firstName,
      lastName: m.lastName,
      familyGroupName: m.familyGroupName,
      sundaySchooler: m.sundaySchooler,
      active: m.active,
      present: rec ? rec.present : false,
      recorded: !!rec,
      recordedBy: rec ? rec.recordedBy : '',
      recordedAt: rec ? rec.recordedAt : ''
    };
  });

  return { ok: true, serviceDate: serviceDate, rows: rows };
}

/**
 * Upserts attendance for a service date: existing rows for that date are
 * updated in place and new members get appended, so a Sunday can be edited
 * repeatedly without ever duplicating a member.
 */
function apiSaveAttendance_(session, body) {
  requireRole_(session, 'planner');
  var serviceDate = dateKey_(body.serviceDate);
  if (!serviceDate) throw new Error('A service date is required.');
  var entries = body.entries || [];
  if (!entries.length) throw new Error('Nothing to save.');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var memberById = {};
    readRows_(SHEETS.members).forEach(function (row) {
      memberById[str_(row['Member ID'])] = row;
    });

    var existingByMember = {};
    readRows_(SHEETS.attendance).forEach(function (row) {
      if (dateKey_(row['Service Date']) === serviceDate) {
        existingByMember[str_(row['Member ID'])] = row;
      }
    });

    var stamp = nowIso_();
    var toAppend = [];
    var updated = 0, created = 0, presentCount = 0;

    entries.forEach(function (entry) {
      var memberId = str_(entry.memberId);
      var member = memberById[memberId];
      if (!member) return;
      var present = bool_(entry.present);
      if (present) presentCount++;

      var existing = existingByMember[memberId];
      if (existing) {
        updateRow_(SHEETS.attendance, existing._row, {
          'Present': present,
          'Family Group Name': str_(member['Family Group Name']),
          'Sunday Schooler': bool_(member['Sunday Schooler']),
          'Recorded By': session.email,
          'Recorded At': stamp
        });
        updated++;
      } else {
        toAppend.push({
          'Record ID': '',
          'Service Date': serviceDate,
          'Member ID': memberId,
          'First Name': str_(member['First Name']),
          'Last Name': str_(member['Last Name']),
          'Family Group Name': str_(member['Family Group Name']),
          'Sunday Schooler': bool_(member['Sunday Schooler']),
          'Present': present,
          'Recorded By': session.email,
          'Recorded At': stamp
        });
        created++;
      }
    });

    /* Record IDs are assigned in one pass so the batch append stays fast. */
    var seed = parseInt(nextId_(SHEETS.attendance, 'Record ID', '').replace(/[^0-9]/g, ''), 10) || 1;
    toAppend.forEach(function (row, i) { row['Record ID'] = 'ATT-' + pad_(seed + i, 6); });
    appendRows_(SHEETS.attendance, toAppend);

    return {
      ok: true,
      serviceDate: serviceDate,
      created: created,
      updated: updated,
      presentCount: presentCount,
      message: 'Attendance saved for ' + serviceDate + ' — ' + presentCount + ' present.'
    };
  } finally {
    lock.releaseLock();
  }
}

/* ─────────────────────── Tracking: Sunday School setup ─────────────────────── */

/**
 * Builds the Sunday School roster for a date from everyone marked present in
 * attendance AND flagged as a Sunday Schooler. Kids already on the roster are
 * left untouched, so a re-run never wipes a sign-in.
 */
function apiSetupSundaySchool_(session, body) {
  requireRole_(session, 'planner');
  var serviceDate = dateKey_(body.serviceDate);
  if (!serviceDate) throw new Error('A service date is required.');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var candidates = [];
    readRows_(SHEETS.attendance).forEach(function (row) {
      if (dateKey_(row['Service Date']) !== serviceDate) return;
      if (!bool_(row['Present'])) return;
      if (!bool_(row['Sunday Schooler'])) return;
      candidates.push(row);
    });

    if (!candidates.length) {
      return {
        ok: true, serviceDate: serviceDate, added: 0, roster: [],
        message: 'No Sunday Schoolers are marked present for ' + serviceDate +
                 '. Record Sunday attendance first.'
      };
    }

    var already = {};
    readRows_(SHEETS.sundaySchool).forEach(function (row) {
      if (dateKey_(row['Service Date']) === serviceDate) already[str_(row['Member ID'])] = true;
    });

    var stamp = nowIso_();
    var toAppend = [];
    candidates.forEach(function (row) {
      var memberId = str_(row['Member ID']);
      if (already[memberId]) return;
      toAppend.push({
        'Record ID': '',
        'Service Date': serviceDate,
        'Member ID': memberId,
        'First Name': str_(row['First Name']),
        'Last Name': str_(row['Last Name']),
        'Family Group Name': str_(row['Family Group Name']),
        'Status': 'Expected',
        'Sign In At': '',
        'Signed In By': '',
        'Sign Out At': '',
        'Signed Out By': '',
        'Setup By': session.email,
        'Setup At': stamp
      });
    });

    var seed = parseInt(nextId_(SHEETS.sundaySchool, 'Record ID', '').replace(/[^0-9]/g, ''), 10) || 1;
    toAppend.forEach(function (row, i) { row['Record ID'] = 'SSD-' + pad_(seed + i, 6); });
    appendRows_(SHEETS.sundaySchool, toAppend);

    var roster = ssRosterFor_(serviceDate);
    return {
      ok: true,
      serviceDate: serviceDate,
      added: toAppend.length,
      roster: roster,
      message: toAppend.length
        ? toAppend.length + ' child(ren) added to the ' + serviceDate + ' Sunday School roster.'
        : 'The ' + serviceDate + ' roster was already up to date (' + roster.length + ' children).'
    };
  } finally {
    lock.releaseLock();
  }
}

function apiGetSundaySchool_(session, body) {
  var serviceDate = dateKey_(body.serviceDate);
  if (!serviceDate) throw new Error('A service date is required.');
  return { ok: true, serviceDate: serviceDate, roster: ssRosterFor_(serviceDate) };
}

function ssRosterFor_(serviceDate) {
  var out = [];
  readRows_(SHEETS.sundaySchool).forEach(function (row) {
    if (dateKey_(row['Service Date']) !== serviceDate) return;
    out.push({
      recordId: str_(row['Record ID']),
      memberId: str_(row['Member ID']),
      firstName: str_(row['First Name']),
      lastName: str_(row['Last Name']),
      familyGroupName: str_(row['Family Group Name']),
      status: str_(row['Status']) || 'Expected',
      signInAt: str_(row['Sign In At']),
      signedInBy: str_(row['Signed In By']),
      signOutAt: str_(row['Sign Out At']),
      signedOutBy: str_(row['Signed Out By']),
      pin: str_(row['PIN'])
    });
  });
  out.sort(function (a, b) {
    return (a.lastName + a.firstName).toLowerCase() > (b.lastName + b.firstName).toLowerCase() ? 1 : -1;
  });
  return out;
}

/* ─────────────────── Public: parent sign in / sign out kiosk ─────────────────── */

/**
 * The kiosk needs no login, so a roster sent to a parent must never carry the
 * PINs — that would hand them the key to every other family's children.
 */
function publicRoster_(roster) {
  return roster.map(function (kid) {
    return {
      recordId: kid.recordId,
      memberId: kid.memberId,
      firstName: kid.firstName,
      lastName: kid.lastName,
      familyGroupName: kid.familyGroupName,
      status: kid.status,
      signInAt: kid.signInAt,
      signedInBy: kid.signedInBy,
      signOutAt: kid.signOutAt,
      signedOutBy: kid.signedOutBy,
      hasPin: !!kid.pin
    };
  });
}

/** PINs currently held by each family group with children still in care. */
function liveFamilyPins_(serviceDate, rows) {
  var pins = {};
  rows.forEach(function (row) {
    if (dateKey_(row['Service Date']) !== serviceDate) return;
    if (str_(row['Status']) !== 'Signed In') return;
    var family = str_(row['Family Group Name']);
    var pin = str_(row['PIN']);
    if (family && pin) pins[family] = pin;
  });
  return pins;
}

/**
 * A fresh 4-digit PIN for one sign-in, avoiding any PIN already held by a
 * child still in care on the same day so two families can never collide.
 * 1000-9999 only, so a leading zero can't be lost by the spreadsheet.
 */
function newSsPin_(serviceDate) {
  var taken = {};
  readRows_(SHEETS.sundaySchool).forEach(function (row) {
    if (dateKey_(row['Service Date']) !== serviceDate) return;
    if (str_(row['Status']) !== 'Signed In') return;
    taken[str_(row['PIN'])] = true;
  });
  for (var attempt = 0; attempt < 200; attempt++) {
    var pin = String(Math.floor(Math.random() * 9000) + 1000);
    if (!taken[pin]) return pin;
  }
  throw new Error('Could not allocate a check-in PIN. Please see the Sunday School team.');
}

/** The most recent date that has a Sunday School roster set up. */
function latestSsDate_() {
  var dates = {};
  readRows_(SHEETS.sundaySchool).forEach(function (row) {
    var key = dateKey_(row['Service Date']);
    if (key) dates[key] = true;
  });
  var list = Object.keys(dates).sort();
  return list.length ? list[list.length - 1] : '';
}

/**
 * Parents search by last name or family group name — never a full roster dump,
 * because this endpoint is reachable without logging in.
 */
function apiSsRoster_(body) {
  var query = str_(body.query).toLowerCase();
  var serviceDate = dateKey_(body.serviceDate) || latestSsDate_();
  if (!serviceDate) {
    return { ok: true, serviceDate: '', roster: [], message: 'Sunday School has not been set up yet.' };
  }
  if (query.length < 2) {
    return { ok: false, error: 'Please type at least 2 letters of your last name or family group.' };
  }

  var roster = publicRoster_(ssRosterFor_(serviceDate).filter(function (kid) {
    return kid.lastName.toLowerCase().indexOf(query) !== -1 ||
           kid.familyGroupName.toLowerCase().indexOf(query) !== -1;
  }));

  return {
    ok: true,
    serviceDate: serviceDate,
    roster: roster,
    message: roster.length ? '' : 'No children found for "' + str_(body.query) + '" on ' + serviceDate + '.'
  };
}

/**
 * Signing in mints one 4-digit PIN for the whole batch and stores it against
 * each child; signing out demands that PIN back, so only the adult who dropped
 * a child off can collect them.
 */
function apiSsSign_(body, direction) {
  var serviceDate = dateKey_(body.serviceDate) || latestSsDate_();
  var ids = body.recordIds || [];
  var by = str_(body.by);
  var suppliedPin = str_(body.pin).replace(/[^0-9]/g, '');
  if (!serviceDate) throw new Error('Sunday School has not been set up yet.');
  if (!ids.length) throw new Error('Please tick at least one child.');
  if (!by) throw new Error('Please enter your name so we know who signed the children ' + direction + '.');
  if (direction === 'out' && suppliedPin.length !== 4) {
    throw new Error('Please enter the 4-digit PIN you were given when you signed in.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var rows = readRows_(SHEETS.sundaySchool);
    var stamp = nowIso_();
    /* A family that already has children in care keeps the PIN it was given,
       so a late arrival never leaves a parent holding two of them. */
    var familyPins = liveFamilyPins_(serviceDate, rows);
    var batchPin = direction === 'in' ? newSsPin_(serviceDate) : '';
    var pinsIssued = [];
    var done = [], skipped = [];

    ids.forEach(function (recordId) {
      var target = null;
      for (var i = 0; i < rows.length; i++) {
        if (str_(rows[i]['Record ID']) === str_(recordId) &&
            dateKey_(rows[i]['Service Date']) === serviceDate) { target = rows[i]; break; }
      }
      if (!target) { skipped.push(str_(recordId)); return; }
      var name = str_(target['First Name']) + ' ' + str_(target['Last Name']);
      var status = str_(target['Status']) || 'Expected';

      if (direction === 'in') {
        if (status === 'Signed In' || status === 'Signed Out') {
          skipped.push(name + ' (already signed in)');
          return;
        }
        var family = str_(target['Family Group Name']);
        var usePin = (family && familyPins[family]) || batchPin;
        if (family) familyPins[family] = usePin;
        if (pinsIssued.indexOf(usePin) === -1) pinsIssued.push(usePin);
        updateRow_(SHEETS.sundaySchool, target._row, {
          'Status': 'Signed In', 'Sign In At': stamp, 'Signed In By': by, 'PIN': usePin
        });
      } else {
        if (status !== 'Signed In') {
          skipped.push(name + (status === 'Signed Out' ? ' (already signed out)' : ' (not signed in yet)'));
          return;
        }
        /* Rows signed in before PINs existed have none, and stay collectable. */
        var storedPin = str_(target['PIN']);
        if (storedPin && storedPin !== suppliedPin) {
          skipped.push(name + ' (that PIN does not match)');
          return;
        }
        updateRow_(SHEETS.sundaySchool, target._row, {
          'Status': 'Signed Out', 'Sign Out At': stamp, 'Signed Out By': by, 'PIN': ''
        });
      }
      done.push(name);
    });

    return {
      ok: true,
      serviceDate: serviceDate,
      done: done,
      skipped: skipped,
      /* Only the PINs just handed out go back, and only to whoever signed in. */
      pins: direction === 'in' ? pinsIssued : [],
      pin: pinsIssued.length === 1 ? pinsIssued[0] : '',
      roster: publicRoster_(ssRosterFor_(serviceDate)),
      message: done.length
        ? done.length + ' child(ren) signed ' + direction + ' at ' + clockTime_(stamp) + '.'
        : 'Nothing changed.'
    };
  } finally {
    lock.releaseLock();
  }
}

/* ─────────────────────────── Reports ─────────────────────────── */

function inRange_(key, from, to) {
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

/**
 * Weekly attendance report: one summary line per service date plus the
 * detail rows, so the admin screen can show totals and a full breakdown.
 */
function apiAttendanceReport_(session, body) {
  var from = dateKey_(body.from);
  var to = dateKey_(body.to);

  var byDate = {};
  var detail = [];
  readRows_(SHEETS.attendance).forEach(function (row) {
    var key = dateKey_(row['Service Date']);
    if (!inRange_(key, from, to)) return;
    var present = bool_(row['Present']);
    if (!byDate[key]) {
      byDate[key] = {
        serviceDate: key, present: 0, absent: 0, recorded: 0,
        sundaySchoolers: 0, families: {}
      };
    }
    var bucket = byDate[key];
    bucket.recorded++;
    if (present) {
      bucket.present++;
      if (bool_(row['Sunday Schooler'])) bucket.sundaySchoolers++;
      var group = str_(row['Family Group Name']);
      if (group) bucket.families[group] = true;
    } else {
      bucket.absent++;
    }
    detail.push({
      serviceDate: key,
      memberId: str_(row['Member ID']),
      firstName: str_(row['First Name']),
      lastName: str_(row['Last Name']),
      familyGroupName: str_(row['Family Group Name']),
      sundaySchooler: bool_(row['Sunday Schooler']),
      present: present,
      recordedBy: str_(row['Recorded By'])
    });
  });

  var weeks = Object.keys(byDate).sort().map(function (key) {
    var bucket = byDate[key];
    return {
      serviceDate: bucket.serviceDate,
      present: bucket.present,
      absent: bucket.absent,
      recorded: bucket.recorded,
      sundaySchoolers: bucket.sundaySchoolers,
      adults: bucket.present - bucket.sundaySchoolers,
      familyGroups: Object.keys(bucket.families).length
    };
  });

  var totalPresent = weeks.reduce(function (sum, week) { return sum + week.present; }, 0);
  return {
    ok: true,
    from: from, to: to,
    weeks: weeks,
    detail: detail,
    totals: {
      services: weeks.length,
      totalPresent: totalPresent,
      averagePresent: weeks.length ? Math.round(totalPresent / weeks.length * 10) / 10 : 0
    }
  };
}

/** Weekly Sunday School report: sign in/out log plus per-date completion. */
function apiSundaySchoolReport_(session, body) {
  var from = dateKey_(body.from);
  var to = dateKey_(body.to);

  var byDate = {};
  var detail = [];
  readRows_(SHEETS.sundaySchool).forEach(function (row) {
    var key = dateKey_(row['Service Date']);
    if (!inRange_(key, from, to)) return;
    var status = str_(row['Status']) || 'Expected';
    if (!byDate[key]) {
      byDate[key] = { serviceDate: key, expected: 0, signedIn: 0, signedOut: 0, stillIn: 0 };
    }
    var bucket = byDate[key];
    bucket.expected++;
    if (status === 'Signed In') { bucket.signedIn++; bucket.stillIn++; }
    if (status === 'Signed Out') { bucket.signedIn++; bucket.signedOut++; }

    var signIn = str_(row['Sign In At']);
    var signOut = str_(row['Sign Out At']);
    detail.push({
      serviceDate: key,
      memberId: str_(row['Member ID']),
      firstName: str_(row['First Name']),
      lastName: str_(row['Last Name']),
      familyGroupName: str_(row['Family Group Name']),
      status: status,
      signInAt: signIn,
      signedInBy: str_(row['Signed In By']),
      signOutAt: signOut,
      signedOutBy: str_(row['Signed Out By']),
      minutesInCare: minutesBetween_(signIn, signOut)
    });
  });

  var weeks = Object.keys(byDate).sort().map(function (key) { return byDate[key]; });
  var totalSignedIn = weeks.reduce(function (sum, week) { return sum + week.signedIn; }, 0);

  return {
    ok: true,
    from: from, to: to,
    weeks: weeks,
    detail: detail,
    totals: {
      services: weeks.length,
      totalSignedIn: totalSignedIn,
      averageSignedIn: weeks.length ? Math.round(totalSignedIn / weeks.length * 10) / 10 : 0,
      stillSignedIn: weeks.reduce(function (sum, week) { return sum + week.stillIn; }, 0)
    }
  };
}

function minutesBetween_(startIso, endIso) {
  if (!startIso || !endIso) return '';
  var start = new Date(String(startIso).replace(' ', 'T'));
  var end = new Date(String(endIso).replace(' ', 'T'));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  return Math.max(0, Math.round((end - start) / 60000));
}
