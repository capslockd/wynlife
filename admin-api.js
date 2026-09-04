/* admin-api.js — WynLife Church Management App
   Shared helpers for talking to the Google Apps Script backend.
   Used by both /admin/ and /sunday-school-checkin/.                        */

window.WynAdmin = (function () {

  var config = window.WYNLIFE_ADMIN_CONFIG || {};
  var TOKEN_KEY = 'wynlife_admin_token';
  var USER_KEY  = 'wynlife_admin_user';

  /* ── Transport ──────────────────────────────────────────────────────────
     Apps Script web apps do not answer CORS preflights, so writes go out as
     a "simple" POST with a text/plain content type. If that is blocked we
     retry the same call as a JSONP GET, which always works but is capped by
     URL length — hence POST first.                                        */

  function apiUrl() {
    return (config.apiUrl || '').trim();
  }

  function configured() {
    return /^https?:\/\/.+/.test(apiUrl());
  }

  function call(action, payload) {
    if (!configured()) {
      return Promise.reject(new Error(
        'The management app is not connected yet. An administrator needs to ' +
        'paste the Google Apps Script web app URL into admin-config.js.'));
    }

    var body = payload ? JSON.parse(JSON.stringify(payload)) : {};
    body.action = action;
    var token = getToken();
    if (token) body.token = token;

    return fetch(apiUrl(), {
      method: 'POST',
      /* text/plain keeps this a "simple request" — no preflight. */
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    })
      .then(function (res) { return res.text(); })
      .then(function (text) { return parse(text); })
      .catch(function () { return jsonp(body); });
  }

  function parse(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('The server sent an unexpected response. Check that the ' +
                      'Apps Script is deployed with access set to "Anyone".');
    }
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) || 'The request failed.');
    }
    return data;
  }

  var jsonpSeq = 0;

  function jsonp(body) {
    return new Promise(function (resolve, reject) {
      var name = 'wynlifeCb' + (++jsonpSeq) + '_' + Date.now();
      var script = document.createElement('script');
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error('The server did not respond. Please check your connection and try again.'));
      }, 30000);

      function cleanup() {
        clearTimeout(timer);
        delete window[name];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[name] = function (data) {
        cleanup();
        try {
          resolve(parse(JSON.stringify(data)));
        } catch (err) {
          reject(err);
        }
      };

      var url = apiUrl() +
        '?action=' + encodeURIComponent(body.action) +
        '&callback=' + name +
        '&payload=' + encodeURIComponent(JSON.stringify(body));

      if (url.length > 7500) {
        cleanup();
        reject(new Error('That was too much data to send in one go. Please save in smaller batches.'));
        return;
      }

      script.src = url;
      script.onerror = function () {
        cleanup();
        reject(new Error('Could not reach the management app. Check the Apps Script deployment URL.'));
      };
      document.head.appendChild(script);
    });
  }

  /* ── Session ── */

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (err) { return ''; }
  }

  function getUser() {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch (err) { return null; }
  }

  function setSession(token, user) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (err) { /* private browsing — the session just won't survive a reload */ }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch (err) { /* nothing to clear */ }
  }

  function login(email, password) {
    return call('login', { email: email, password: password }).then(function (data) {
      setSession(data.token, data.user);
      return data.user;
    });
  }

  var ROLE_RANK = { basic: 1, planner: 2, admin: 3 };

  function hasRole(minRole) {
    var user = getUser();
    return !!user && (ROLE_RANK[user.role] || 0) >= (ROLE_RANK[minRole] || 99);
  }

  /* ── Small shared utilities ── */

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** yyyy-mm-dd for a Date, in local time (never UTC-shifted). */
  function isoDate(date) {
    var y = date.getFullYear();
    var m = ('0' + (date.getMonth() + 1)).slice(-2);
    var d = ('0' + date.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }

  /** The most recent Sunday, or today when today is a Sunday. */
  function lastSunday(from) {
    var date = from ? new Date(from.getTime()) : new Date();
    date.setDate(date.getDate() - date.getDay());
    return isoDate(date);
  }

  function prettyDate(iso) {
    if (!iso) return '';
    var parts = String(iso).slice(0, 10).split('-');
    if (parts.length !== 3) return iso;
    var date = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('en-AU',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** '2026-09-06T09:41:12' -> '9:41 am' */
  function prettyTime(stamp) {
    if (!stamp) return '';
    var match = String(stamp).match(/(\d{2}):(\d{2})/);
    if (!match) return '';
    var hour = +match[1];
    var suffix = hour < 12 ? 'am' : 'pm';
    var display = hour % 12 === 0 ? 12 : hour % 12;
    return display + ':' + match[2] + ' ' + suffix;
  }

  return {
    call: call,
    configured: configured,
    login: login,
    getUser: getUser,
    getToken: getToken,
    clearSession: clearSession,
    hasRole: hasRole,
    esc: esc,
    isoDate: isoDate,
    lastSunday: lastSunday,
    prettyDate: prettyDate,
    prettyTime: prettyTime,
    checkinPath: config.checkinPath || '/sunday-school-checkin/'
  };

}());
