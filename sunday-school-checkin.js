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
  /* PINs handed out on this device, shown until the children are collected. */
  var issuedPins = [];
  /* Unlocks the Out boxes on their own once the wait is up. */
  var unlockTimer = null;

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
      issuedPins = [];
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
             (kid.signedInBy ? ' by ' + kid.signedInBy : '') +
             (kid.tooSoon && kid.canSignOutAt
               ? ' · can be collected from ' + A.prettyTime(kid.canSignOutAt)
               : '');
    }
    return 'Not signed in yet';
  }

  function render(roster) {
    var anySignedIn = roster.some(function (kid) { return kid.status === 'Signed In'; });

    elResult.innerHTML =
      '<p class="kiosk-date">Sunday School &mdash; ' + esc(A.prettyDate(serviceDate)) + '</p>' +
      pinBanner() +
      '<div id="kKids">' +
        roster.map(function (kid) {
          var canIn  = kid.status === 'Expected';
          var canOut = kid.status === 'Signed In' && !kid.tooSoon;
          return '<div class="kiosk-kid' + (canIn ? '' : ' done') + '">' +
            '<div class="who">' +
              '<div class="name">' + esc(kid.firstName + ' ' + kid.lastName) + '</div>' +
              '<div class="meta">' + esc(kid.familyGroupName || kid.lastName) + ' &middot; ' +
                esc(statusLine(kid)) + '</div>' +
            '</div>' +
            tickBox('in', kid.recordId, 'In', canIn, 'Sign in ' + kid.firstName) +
            tickBox('out', kid.recordId, 'Out', canOut, 'Sign out ' + kid.firstName) +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="adm-field" style="margin-top:20px;">' +
        '<label>Your name</label>' +
        '<input type="text" id="kBy" placeholder="Parent or guardian name" ' +
          'value="' + esc(rememberedName()) + '" autocomplete="name">' +
        '<div class="adm-hint">Recorded against every sign in and sign out.</div>' +
      '</div>' +
      (anySignedIn
        ? '<div class="adm-field" style="margin-top:16px;">' +
            '<label>Collection PIN</label>' +
            '<input type="text" id="kPin" inputmode="numeric" pattern="[0-9]*" ' +
              'maxlength="4" placeholder="0000" autocomplete="off">' +
            '<div class="adm-hint">The 4-digit PIN you were given when you signed ' +
              'your children in. Only needed to sign them out.</div>' +
          '</div>'
        : '') +
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
    scheduleUnlock(roster);
  }

  /**
   * Re-draws the list the moment the earliest held child becomes collectable,
   * so a parent waiting at the door is not left tapping a disabled box.
   */
  function scheduleUnlock(roster) {
    if (unlockTimer) { clearTimeout(unlockTimer); unlockTimer = null; }
    var soonest = 0;
    roster.forEach(function (kid) {
      if (!kid.tooSoon || !kid.canSignOutAt) return;
      var at = new Date(String(kid.canSignOutAt).replace(' ', 'T')).getTime();
      if (isNaN(at)) return;
      if (!soonest || at < soonest) soonest = at;
    });
    if (!soonest) return;
    var wait = soonest - Date.now();
    /* Beyond an hour the clocks disagree about something; leave it alone. */
    if (wait < 0 || wait > 3600000) return;
    unlockTimer = setTimeout(function () { refresh(); }, wait + 2000);
  }

  function tickBox(direction, recordId, label, enabled, aria) {
    return '<label class="kiosk-tick">' +
      '<input type="checkbox" data-' + direction + '="' + esc(recordId) + '"' +
        (enabled ? '' : ' disabled') + ' aria-label="' + esc(aria) + '">' +
      '<span>' + esc(label) + '</span>' +
    '</label>';
  }

  function pinBanner() {
    if (!issuedPins.length) return '';
    return '<div class="kiosk-pin">' +
      '<div class="kiosk-pin-label">Your collection PIN</div>' +
      '<div class="kiosk-pin-code">' + issuedPins.map(esc).join(' &middot; ') + '</div>' +
      '<div class="kiosk-pin-note">Keep this safe — you will be asked for it when ' +
        'you collect your ' + (issuedPins.length > 1 ? 'children' : 'child') + '.</div>' +
    '</div>';
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
    var pinEl = document.getElementById('kPin');
    var pin = pinEl ? pinEl.value.replace(/[^0-9]/g, '') : '';
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
    if (signOuts.length && pin.length !== 4) {
      msg('Please enter the 4-digit PIN you were given when you signed in.', 'error');
      if (pinEl) pinEl.focus();
      return;
    }
    rememberName(by);

    var btn = document.getElementById('kConfirm');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    var notes = [], problems = [];

    /* Sign-ins go first so a child ticked for both is handled in order. */
    var chain = signIns.length
      ? A.call('ssSignIn', { serviceDate: serviceDate, recordIds: signIns, by: by })
          .then(function (data) {
            collect(notes, problems, data);
            if (data.pins && data.pins.length) issuedPins = data.pins;
            return data;
          })
      : Promise.resolve(null);

    chain
      .then(function () {
        if (!signOuts.length) return null;
        return A.call('ssSignOut', {
          serviceDate: serviceDate, recordIds: signOuts, by: by, pin: pin
        }).then(function (data) {
          collect(notes, problems, data);
          /* Once children are collected the PIN they were signed in on is spent. */
          if (data.done && data.done.length && !signIns.length) issuedPins = [];
          return data;
        });
      })
      .then(function () {
        /* Re-run the parent's own search so the refreshed list stays limited
           to their family — the sign-in response carries the whole roster. */
        return refresh().then(function () {
          report(notes, problems);
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

  function collect(notes, problems, data) {
    if (data.done && data.done.length) {
      notes.push(data.message + ' (' + data.done.join(', ') + ')');
    }
    if (data.pinFailed && data.pinFailed.length) {
      problems.push('<strong>Incorrect PIN.</strong> ' + data.pinFailed.map(esc).join(', ') +
        ' ' + (data.pinFailed.length === 1 ? 'was' : 'were') + ' not signed out. Please check ' +
        'the 4-digit PIN you were given at sign in, or see one of the Sunday School team.');
    }
    if (data.tooSoon && data.tooSoon.length) {
      problems.push('<strong>Too soon to collect.</strong> ' + data.tooSoon.map(esc).join(', ') +
        '. Children can be signed out ' + (data.minCareMinutes || 15) +
        ' minutes after they are signed in.');
    }
    if (data.skipped && data.skipped.length) {
      notes.push('Skipped: ' + data.skipped.join(', '));
    }
  }

  /** Anything that failed wins the message area, and shows in red. */
  function report(notes, problems) {
    if (problems.length) {
      msgHtml(problems.concat(notes.map(esc)).join('<br>'), 'error');
    } else {
      msgHtml(notes.map(esc).join('<br>'), 'ok');
    }
  }

}());
