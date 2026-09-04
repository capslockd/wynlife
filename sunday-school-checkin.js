/* sunday-school-checkin.js — WynLife Church
   Parent-facing Sunday School sign in / sign out kiosk.
   No login: parents search for their own children by last name or family
   group name, then tick to sign in and (once signed in) to sign out.      */

(function () {

  var A = window.WynAdmin;
  var esc = A.esc;

  var elMsg    = document.getElementById('kMsg');
  var elResult = document.getElementById('kResult');
  var elForm   = document.getElementById('kForm');

  var serviceDate = '';

  function msg(text, kind) {
    elMsg.className = 'adm-msg ' + (kind || 'info');
    elMsg.innerHTML = text ? esc(text) : '';
  }

  function msgHtml(html, kind) {
    elMsg.className = 'adm-msg ' + (kind || 'info');
    elMsg.innerHTML = html;
  }

  if (!A.configured()) {
    msg('Sunday School check-in is not connected yet. Please see one of the ' +
        'Sunday School team.', 'info');
  }

  elForm.addEventListener('submit', function (e) {
    e.preventDefault();
    search();
  });

  function search() {
    var query = document.getElementById('kQuery').value.trim();
    if (query.length < 2) {
      msg('Please type at least 2 letters of your last name or family group.', 'error');
      return;
    }
    var btn = document.getElementById('kSearch');
    btn.disabled = true;
    btn.textContent = 'Searching…';
    elResult.innerHTML = '';
    msg('');

    A.call('ssRoster', { query: query }).then(function (data) {
      serviceDate = data.serviceDate;
      if (!data.roster.length) {
        msg(data.message || 'No children found. Please check with the Sunday School team.', 'info');
        return;
      }
      render(data.roster);
    }).catch(function (err) {
      msg(err.message, 'error');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Find My Children';
    });
  }

  function statusLine(kid) {
    if (kid.status === 'Signed Out') {
      return 'Signed out at ' + (A.prettyTime(kid.signOutAt) || 'earlier') +
             (kid.signedOutBy ? ' by ' + kid.signedOutBy : '');
    }
    if (kid.status === 'Signed In') {
      return 'Signed in at ' + (A.prettyTime(kid.signInAt) || 'earlier') +
             (kid.signedInBy ? ' by ' + kid.signedInBy : '');
    }
    return 'Not signed in yet';
  }

  function render(roster) {
    elResult.innerHTML =
      '<p class="kiosk-date">Sunday School &mdash; ' + esc(A.prettyDate(serviceDate)) + '</p>' +
      '<div id="kKids">' +
        roster.map(function (kid) {
          var canIn  = kid.status === 'Expected';
          var canOut = kid.status === 'Signed In';
          return '<div class="kiosk-kid' + (canIn ? '' : ' done') + '">' +
            '<div class="who">' +
              '<div class="name">' + esc(kid.firstName + ' ' + kid.lastName) + '</div>' +
              '<div class="meta">' + esc(kid.familyGroupName || kid.lastName) + ' &middot; ' +
                esc(statusLine(kid)) + '</div>' +
            '</div>' +
            '<label class="adm-check" style="flex-direction:column;gap:4px;font-size:0.7rem;' +
              'font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray);">' +
              '<input type="checkbox" data-in="' + esc(kid.recordId) + '"' +
                (canIn ? '' : ' disabled') +
                ' aria-label="Sign in ' + esc(kid.firstName) + '">' +
              '<span>In</span>' +
            '</label>' +
            '<label class="adm-check" style="flex-direction:column;gap:4px;font-size:0.7rem;' +
              'font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray);">' +
              '<input type="checkbox" data-out="' + esc(kid.recordId) + '"' +
                (canOut ? '' : ' disabled') +
                ' aria-label="Sign out ' + esc(kid.firstName) + '">' +
              '<span>Out</span>' +
            '</label>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="adm-field" style="margin-top:20px;">' +
        '<label>Your name</label>' +
        '<input type="text" id="kBy" placeholder="Parent or guardian name" ' +
          'value="' + esc(rememberedName()) + '" autocomplete="name">' +
        '<div class="adm-hint">Recorded against every sign in and sign out.</div>' +
      '</div>' +
      '<div class="adm-actions" style="margin-top:16px;">' +
        '<button class="adm-btn" id="kConfirm">Confirm</button>' +
        '<button class="adm-btn secondary" id="kAgain">Start Over</button>' +
      '</div>';

    document.getElementById('kAgain').addEventListener('click', function () {
      elResult.innerHTML = '';
      msg('');
      document.getElementById('kQuery').value = '';
      document.getElementById('kQuery').focus();
    });

    document.getElementById('kConfirm').addEventListener('click', confirmTicks);
  }

  function rememberedName() {
    try { return localStorage.getItem('wynlife_ss_parent') || ''; } catch (err) { return ''; }
  }

  function rememberName(name) {
    try { localStorage.setItem('wynlife_ss_parent', name); } catch (err) { /* ignore */ }
  }

  function ticked(attribute) {
    return Array.prototype.slice
      .call(document.querySelectorAll('[data-' + attribute + ']:checked'))
      .map(function (box) { return box.getAttribute('data-' + attribute); });
  }

  function confirmTicks() {
    var by = document.getElementById('kBy').value.trim();
    var signIns = ticked('in');
    var signOuts = ticked('out');

    if (!signIns.length && !signOuts.length) {
      msg('Tick "In" to sign a child in, or "Out" to sign them out.', 'error');
      return;
    }
    if (!by) {
      msg('Please enter your name first.', 'error');
      document.getElementById('kBy').focus();
      return;
    }
    rememberName(by);

    var btn = document.getElementById('kConfirm');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    var notes = [];

    /* Sign-ins go first so a child ticked for both is handled in order. */
    var chain = signIns.length
      ? A.call('ssSignIn', { serviceDate: serviceDate, recordIds: signIns, by: by })
          .then(function (data) { collect(notes, data); return data; })
      : Promise.resolve(null);

    chain
      .then(function () {
        if (!signOuts.length) return null;
        return A.call('ssSignOut', { serviceDate: serviceDate, recordIds: signOuts, by: by })
          .then(function (data) { collect(notes, data); return data; });
      })
      .then(function () {
        /* Re-run the parent's own search so the refreshed list stays limited
           to their family — the sign-in response carries the whole roster. */
        return refresh().then(function () {
          msgHtml(notes.map(function (note) { return esc(note); }).join('<br>'), 'ok');
        });
      })
      .catch(function (err) {
        msg(err.message, 'error');
      })
      .then(function () {
        btn = document.getElementById('kConfirm');
        if (btn) { btn.disabled = false; btn.textContent = 'Confirm'; }
      });
  }

  function refresh() {
    var query = document.getElementById('kQuery').value.trim();
    return A.call('ssRoster', { query: query, serviceDate: serviceDate })
      .then(function (data) {
        serviceDate = data.serviceDate;
        if (data.roster.length) render(data.roster);
      });
  }

  function collect(notes, data) {
    if (data.done && data.done.length) {
      notes.push(data.message + ' (' + data.done.join(', ') + ')');
    }
    if (data.skipped && data.skipped.length) {
      notes.push('Skipped: ' + data.skipped.join(', '));
    }
  }

}());
