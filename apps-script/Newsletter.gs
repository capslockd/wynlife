/****************************************************************************
 * WynLife Church — Newsletter backend (Google Apps Script)
 *
 * Paste this into the same Apps Script project as Code.gs — they share one
 * global scope, so everything here uses the helpers defined there
 * (readRows_, appendRow_, updateRow_, nextId_, str_, bool_, nowIso_ …).
 *
 * Sheets
 *   Newsletter Recipients — the list, one row per email address
 *   Newsletter Issues     — one row per issue: who composed it, and how
 *   Newsletter Send Log   — one row per recipient per send
 *
 * Email goes out through Brevo's transactional API. One request per
 * recipient, so nobody sees anybody else's address and each copy carries its
 * own unsubscribe link.
 *
 * Configure Brevo from the admin console (Newsletter > Settings), or from the
 * Apps Script editor by running setBrevoKey() once. The key is kept in Script
 * Properties, never in the spreadsheet.
 ****************************************************************************/

var BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/* How many recipients one nlSend call will attempt. Apps Script stops a
   request at six minutes, so the console sends in chunks and shows progress. */
var NL_SEND_CHUNK = 40;

var NL_STATUSES = ['subscribed', 'unsubscribed', 'bounced'];

var NL_IMAGE_FOLDER = 'WynLife Newsletter Images';

/* ─────────────────────────── Settings ─────────────────────────── */

/** One-time convenience: paste your key, run this, then delete the key again. */
function setBrevoKey() {
  var key = 'xkeysib-PASTE-YOUR-BREVO-API-KEY-HERE';
  PropertiesService.getScriptProperties().setProperty('BREVO_API_KEY', key);
  Logger.log('Brevo API key saved to Script Properties.');
}

function nlProps_() {
  return PropertiesService.getScriptProperties();
}

function nlSettings_() {
  var props = nlProps_();
  return {
    apiKey:      str_(props.getProperty('BREVO_API_KEY')),
    senderName:  str_(props.getProperty('BREVO_SENDER_NAME')) || 'WynLife Church',
    senderEmail: str_(props.getProperty('BREVO_SENDER_EMAIL')) || 'info@wynlife.com.au',
    replyTo:     str_(props.getProperty('BREVO_REPLY_TO')) || 'info@wynlife.com.au'
  };
}

function apiNlSettings_(session) {
  requireRole_(session, 'admin');
  var settings = nlSettings_();
  return {
    ok: true,
    settings: {
      /* Never hand the key back out — only enough to recognise it. */
      apiKeySet:   !!settings.apiKey,
      apiKeyHint:  settings.apiKey ? settings.apiKey.slice(0, 12) + '…' : '',
      senderName:  settings.senderName,
      senderEmail: settings.senderEmail,
      replyTo:     settings.replyTo,
      unsubscribeUrl: nlBaseUrl_()
    }
  };
}

function apiNlSaveSettings_(session, body) {
  requireRole_(session, 'admin');
  var props = nlProps_();
  if (str_(body.apiKey)) props.setProperty('BREVO_API_KEY', str_(body.apiKey));
  if (body.clearApiKey === true) props.deleteProperty('BREVO_API_KEY');
  if (body.senderName !== undefined) props.setProperty('BREVO_SENDER_NAME', str_(body.senderName));
  if (body.senderEmail !== undefined) props.setProperty('BREVO_SENDER_EMAIL', str_(body.senderEmail));
  if (body.replyTo !== undefined) props.setProperty('BREVO_REPLY_TO', str_(body.replyTo));
  return { ok: true, message: 'Newsletter settings saved.' };
}

/** The /exec URL of this deployment, used to build unsubscribe links. */
function nlBaseUrl_() {
  var saved = str_(nlProps_().getProperty('WEB_APP_URL'));
  if (saved) return saved;
  var url = str_(ScriptApp.getService().getUrl());
  /* Only remember the deployed URL. Run from the editor this can come back as
     the /dev one, which nobody outside the account can open. */
  if (url.indexOf('/exec') !== -1) nlProps_().setProperty('WEB_APP_URL', url);
  return url;
}

/* ─────────────────────────── Recipients ─────────────────────────── */

function recipientOut_(row) {
  return {
    recipientId: str_(row['Recipient ID']),
    email:       str_(row['Email']),
    firstName:   str_(row['First Name']),
    lastName:    str_(row['Last Name']),
    status:      str_(row['Status']) || 'subscribed',
    groups:      str_(row['Groups']),
    source:      str_(row['Source']),
    notes:       str_(row['Notes']),
    addedAt:     str_(row['Added At']),
    lastSentAt:  str_(row['Last Sent At']),
    lastResult:  str_(row['Last Send Result'])
  };
}

function apiNlRecipients_(session) {
  requireCap_(session, 'newsletter');
  var rows = readRows_(SHEETS.recipients);
  var groups = {};
  rows.forEach(function (row) {
    nlGroupList_(row['Groups']).forEach(function (g) { groups[g] = true; });
  });
  return {
    ok: true,
    recipients: rows.map(recipientOut_),
    groups: Object.keys(groups).sort(),
    statuses: NL_STATUSES
  };
}

function nlGroupList_(raw) {
  return str_(raw).split(',').map(function (part) {
    return part.trim();
  }).filter(function (part) { return part.length > 0; });
}

function nlValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str_(email));
}

function findRecipientByEmail_(email, rows) {
  var target = str_(email).toLowerCase();
  var list = rows || readRows_(SHEETS.recipients);
  for (var i = 0; i < list.length; i++) {
    if (str_(list[i]['Email']).toLowerCase() === target) return list[i];
  }
  return null;
}

function findRecipientById_(recipientId, rows) {
  var target = str_(recipientId);
  var list = rows || readRows_(SHEETS.recipients);
  for (var i = 0; i < list.length; i++) {
    if (str_(list[i]['Recipient ID']) === target) return list[i];
  }
  return null;
}

function apiNlSaveRecipient_(session, body) {
  requireCap_(session, 'newsletter');
  var email = str_(body.email).toLowerCase();
  if (!nlValidEmail_(email)) throw new Error('"' + str_(body.email) + '" is not a valid email address.');
  var status = str_(body.status) || 'subscribed';
  if (NL_STATUSES.indexOf(status) === -1) throw new Error('Unknown status: ' + status);

  var rows = readRows_(SHEETS.recipients);
  var existing = str_(body.recipientId) ? findRecipientById_(body.recipientId, rows) : null;
  var clash = findRecipientByEmail_(email, rows);
  if (clash && (!existing || clash._row !== existing._row)) {
    throw new Error('That email address is already on the list.');
  }

  var patch = {
    'Email':      email,
    'First Name': str_(body.firstName),
    'Last Name':  str_(body.lastName),
    'Status':     status,
    'Groups':     nlGroupList_(body.groups).join(', '),
    'Notes':      str_(body.notes),
    'Updated At': nowIso_()
  };

  if (existing) {
    updateRow_(SHEETS.recipients, existing._row, patch);
    return { ok: true, recipientId: str_(existing['Recipient ID']),
             message: email + ' updated.' };
  }

  var recipientId = nextId_(SHEETS.recipients, 'Recipient ID', 'RCP-');
  patch['Recipient ID'] = recipientId;
  patch['Source'] = str_(body.source) || 'added by ' + str_(session.email);
  patch['Unsubscribe Token'] = Utilities.getUuid().replace(/-/g, '');
  patch['Added By'] = str_(session.email);
  patch['Added At'] = nowIso_();
  appendRow_(SHEETS.recipients, patch);
  return { ok: true, recipientId: recipientId, message: email + ' added to the list.' };
}

/**
 * Bulk paste. One recipient per line:
 *   email, first name, last name, groups
 * Everything after the email is optional. Existing addresses are updated
 * rather than duplicated, and anything unparseable is reported back.
 */
function apiNlImportRecipients_(session, body) {
  requireCap_(session, 'newsletter');
  var lines = String(body.text || '').split(/\r?\n/);
  var rows = readRows_(SHEETS.recipients);
  var defaultGroups = nlGroupList_(body.groups).join(', ');
  var added = 0, updated = 0, skipped = [];
  var toAppend = [];
  var seen = {};

  var nextNumber = parseInt(
    nextId_(SHEETS.recipients, 'Recipient ID', '').replace(/[^0-9]/g, ''), 10) || 1;

  lines.forEach(function (line) {
    var text = line.trim();
    if (!text) return;
    var parts = text.split(/\s*[,;\t]\s*/);
    var email = str_(parts[0]).toLowerCase();
    /* Tolerate "Name <email@example.com>" pasted out of a mail client. */
    var angled = text.match(/<([^>]+)>/);
    if (angled) email = str_(angled[1]).toLowerCase();
    if (!nlValidEmail_(email)) { skipped.push(text); return; }
    if (seen[email]) return;
    seen[email] = true;

    var groups = parts.length > 3 ? nlGroupList_(parts.slice(3).join(',')).join(', ') : defaultGroups;
    var existing = findRecipientByEmail_(email, rows);
    if (existing) {
      var patch = { 'Status': 'subscribed', 'Updated At': nowIso_() };
      if (parts[1]) patch['First Name'] = str_(parts[1]);
      if (parts[2]) patch['Last Name'] = str_(parts[2]);
      if (groups) patch['Groups'] = groups;
      updateRow_(SHEETS.recipients, existing._row, patch);
      updated += 1;
      return;
    }

    toAppend.push({
      'Recipient ID': 'RCP-' + pad_(nextNumber++, 4),
      'Email': email,
      'First Name': str_(parts[1]),
      'Last Name': str_(parts[2]),
      'Status': 'subscribed',
      'Groups': groups,
      'Source': 'imported by ' + str_(session.email),
      'Notes': '',
      'Unsubscribe Token': Utilities.getUuid().replace(/-/g, ''),
      'Added By': str_(session.email),
      'Added At': nowIso_(),
      'Updated At': nowIso_(),
      'Last Sent At': '',
      'Last Send Result': ''
    });
    added += 1;
  });

  appendRows_(SHEETS.recipients, toAppend);

  return {
    ok: true,
    added: added,
    updated: updated,
    skipped: skipped,
    message: added + ' added, ' + updated + ' updated' +
             (skipped.length ? ', ' + skipped.length + ' skipped' : '') + '.'
  };
}

/* ─────────────────────────── Issues ─────────────────────────── */

function newsletterOut_(row, withContent) {
  var out = {
    newsletterId: str_(row['Newsletter ID']),
    issueDate:    dateKey_(row['Issue Date']),
    subject:      str_(row['Subject']),
    preheader:    str_(row['Preheader']),
    design:       str_(row['Design']),
    status:       str_(row['Status']) || 'draft',
    sections:     str_(row['Sections Used']),
    createdBy:    str_(row['Created By']),
    createdAt:    str_(row['Created At']),
    updatedBy:    str_(row['Updated By']),
    updatedAt:    str_(row['Updated At']),
    sentBy:       str_(row['Sent By']),
    sentAt:       str_(row['Sent At']),
    recipientCount: Number(row['Recipient Count']) || 0,
    sentCount:      Number(row['Sent Count']) || 0,
    failedCount:    Number(row['Failed Count']) || 0,
    lastTestTo:     str_(row['Last Test To'])
  };
  if (withContent) {
    try {
      out.content = JSON.parse(str_(row['Content JSON']) || '{}');
    } catch (err) {
      out.content = {};
      out.contentError = 'The saved content could not be read back.';
    }
  }
  return out;
}

function apiNlList_(session) {
  requireCap_(session, 'newsletter');
  var list = readRows_(SHEETS.newsletters).map(function (row) {
    return newsletterOut_(row, false);
  });
  list.reverse(); /* newest first */
  return { ok: true, newsletters: list };
}

function findNewsletterRow_(newsletterId) {
  var target = str_(newsletterId);
  var rows = readRows_(SHEETS.newsletters);
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i]['Newsletter ID']) === target) return rows[i];
  }
  throw new Error('That newsletter could not be found.');
}

function apiNlGet_(session, body) {
  requireCap_(session, 'newsletter');
  return { ok: true, newsletter: newsletterOut_(findNewsletterRow_(body.newsletterId), true) };
}

/** A human-readable note of which sections this issue actually used. */
function nlSectionSummary_(content) {
  var used = [];
  if (content.sermon && str_(content.sermon.title)) used.push('Sermon');
  (content.announcements || []).forEach(function (item, i) {
    if (item && item.enabled !== false && (str_(item.title) || str_(item.body))) {
      used.push('Ann ' + (i + 1) + ': ' + (str_(item.title) || str_(item.label)));
    }
  });
  if (!content.giving || content.giving.enabled !== false) used.push('Giving');
  if (!content.childSafe || content.childSafe.enabled !== false) used.push('Child Safety');
  return used.join(' | ');
}

function apiNlSave_(session, body) {
  requireCap_(session, 'newsletter');
  var content = body.content || {};
  var json = JSON.stringify(content);
  /* A spreadsheet cell tops out at 50,000 characters. */
  if (json.length > 45000) {
    throw new Error('This newsletter is too long to save. Shorten the text, or ' +
                    'upload images instead of pasting them in.');
  }

  var patch = {
    'Issue Date':   dateKey_(content.issueDate) || dateKey_(nowIso_()),
    'Subject':      str_(content.subject),
    'Preheader':    str_(content.preheader),
    'Design':       str_(content.design) || 'classic',
    'Sections Used': nlSectionSummary_(content),
    'Content JSON': json,
    'Updated By':   str_(session.email),
    'Updated At':   nowIso_()
  };

  /* An issue that has gone out is a record of what people received, so saving
     over it would rewrite history. Editing one starts a new draft instead. */
  if (str_(body.newsletterId)) {
    var row = findNewsletterRow_(body.newsletterId);
    if (str_(row['Status']) !== 'sent') {
      updateRow_(SHEETS.newsletters, row._row, patch);
      return { ok: true, newsletterId: str_(row['Newsletter ID']), message: 'Newsletter saved.' };
    }
  }

  var newsletterId = nextId_(SHEETS.newsletters, 'Newsletter ID', 'NLT-');
  patch['Newsletter ID'] = newsletterId;
  patch['Status'] = 'draft';
  patch['Created By'] = str_(session.email);
  patch['Created At'] = nowIso_();
  appendRow_(SHEETS.newsletters, patch);
  return { ok: true, newsletterId: newsletterId, message: 'Newsletter saved as a draft.' };
}

function apiNlDelete_(session, body) {
  requireCap_(session, 'newsletter');
  var row = findNewsletterRow_(body.newsletterId);
  if (str_(row['Status']) === 'sent') {
    throw new Error('This newsletter has already gone out, so it stays in the history.');
  }
  sheet_(SHEETS.newsletters).deleteRow(row._row);
  return { ok: true, message: 'Draft deleted.' };
}

/* ─────────────────────────── Images ─────────────────────────── */

function nlImageFolder_() {
  var props = nlProps_();
  var id = str_(props.getProperty('NEWSLETTER_IMAGE_FOLDER_ID'));
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* recreate below */ }
  }
  var existing = DriveApp.getFoldersByName(NL_IMAGE_FOLDER);
  var folder = existing.hasNext() ? existing.next() : DriveApp.createFolder(NL_IMAGE_FOLDER);
  props.setProperty('NEWSLETTER_IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * Stores an uploaded picture on Drive and hands back a link an email client
 * will load. Pasting a URL from the church website works too and is a little
 * more reliable — see the README.
 */
function apiNlUploadImage_(session, body) {
  requireCap_(session, 'newsletter');
  var data = String(body.dataBase64 || '');
  if (!data) throw new Error('No image data was received.');
  if (data.length > 9000000) throw new Error('That image is too large. Please keep uploads under 6 MB.');

  var mime = str_(body.mimeType) || 'image/png';
  if (mime.indexOf('image/') !== 0) throw new Error('That file is not an image.');

  var name = str_(body.name).replace(/[^A-Za-z0-9._-]+/g, '-') || 'newsletter-image';
  var blob = Utilities.newBlob(Utilities.base64Decode(data), mime, name);
  var file = nlImageFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    url: 'https://lh3.googleusercontent.com/d/' + file.getId(),
    fileId: file.getId(),
    message: name + ' uploaded.'
  };
}

/* ─────────────────────────── Sending ─────────────────────────── */

function nlUnsubscribeUrl_(row) {
  var base = nlBaseUrl_();
  if (!base) return 'https://www.wynlife.com.au/';
  return base + '?action=nlUnsubscribe' +
    '&r=' + encodeURIComponent(str_(row['Recipient ID'])) +
    '&t=' + encodeURIComponent(str_(row['Unsubscribe Token']));
}

/** Fills the per-recipient placeholders the templates leave behind. */
function nlPersonalise_(html, row, unsubUrl) {
  var first = str_(row['First Name']) || 'Friend';
  return String(html || '')
    .split('{{UNSUB_URL}}').join(unsubUrl)
    .split('{{FIRST_NAME}}').join(first)
    .split('{{EMAIL}}').join(str_(row['Email']));
}

function nlBrevoRequest_(settings, to, subject, html, text, unsubUrl) {
  var payload = {
    sender: { name: settings.senderName, email: settings.senderEmail },
    to: [to],
    subject: subject,
    htmlContent: html,
    tags: ['wynlife-newsletter']
  };
  if (text) payload.textContent = text;
  if (settings.replyTo) payload.replyTo = { email: settings.replyTo };
  if (unsubUrl) payload.headers = { 'List-Unsubscribe': '<' + unsubUrl + '>' };

  return {
    url: BREVO_ENDPOINT,
    method: 'post',
    contentType: 'application/json',
    headers: { 'api-key': settings.apiKey, 'accept': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
}

function nlReadBrevoResponse_(response) {
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code >= 200 && code < 300) {
    var messageId = '';
    try { messageId = str_(JSON.parse(text).messageId); } catch (err) { /* not fatal */ }
    return { ok: true, messageId: messageId };
  }
  var message = 'Brevo returned ' + code;
  try {
    var parsed = JSON.parse(text);
    if (parsed && parsed.message) message += ': ' + parsed.message;
  } catch (err) {
    if (text) message += ': ' + text.slice(0, 200);
  }
  return { ok: false, error: message };
}

function nlRequireSendable_(body) {
  var settings = nlSettings_();
  if (!settings.apiKey) {
    throw new Error('No Brevo API key is configured yet. An administrator needs to ' +
                    'add one under Newsletter > Settings.');
  }
  if (!str_(body.subject)) throw new Error('The newsletter needs a subject line.');
  if (!str_(body.html)) throw new Error('The newsletter has no content to send.');
  return settings;
}

function nlLogSend_(entries) {
  if (!entries.length) return;
  var seed = parseInt(nextId_(SHEETS.sendLog, 'Log ID', '').replace(/[^0-9]/g, ''), 10) || 1;
  entries.forEach(function (entry) {
    entry['Log ID'] = 'SND-' + pad_(seed++, 6);
  });
  appendRows_(SHEETS.sendLog, entries);
}

/** A test send: the real email, to a handful of addresses you name. */
function apiNlSendTest_(session, body) {
  requireCap_(session, 'newsletter');
  var settings = nlRequireSendable_(body);

  var addresses = String(body.emails || '').split(/[\s,;]+/)
    .map(function (part) { return part.trim().toLowerCase(); })
    .filter(function (part) { return part.length > 0; });
  if (!addresses.length) throw new Error('Enter at least one address to send the test to.');
  if (addresses.length > 5) throw new Error('Please test with five addresses or fewer.');
  addresses.forEach(function (email) {
    if (!nlValidEmail_(email)) throw new Error('"' + email + '" is not a valid email address.');
  });

  var subject = '[TEST] ' + str_(body.subject);
  var preview = nlBaseUrl_() || 'https://www.wynlife.com.au/';
  var requests = addresses.map(function (email) {
    var fake = { 'First Name': 'Friend', 'Email': email, 'Recipient ID': '', 'Unsubscribe Token': '' };
    return nlBrevoRequest_(settings, { email: email },
      subject, nlPersonalise_(body.html, fake, preview),
      nlPersonalise_(body.text, fake, preview), '');
  });

  var responses = UrlFetchApp.fetchAll(requests);
  var sent = 0, errors = [], log = [];
  responses.forEach(function (response, i) {
    var result = nlReadBrevoResponse_(response);
    if (result.ok) sent += 1; else errors.push(addresses[i] + ': ' + result.error);
    log.push({
      'Newsletter ID': str_(body.newsletterId),
      'Issue Date': dateKey_(body.issueDate),
      'Subject': subject,
      'Email': addresses[i],
      'Kind': 'test',
      'Result': result.ok ? 'sent' : 'failed',
      'Provider Message ID': result.messageId || '',
      'Error': result.error || '',
      'Sent By': str_(session.email),
      'Sent At': nowIso_()
    });
  });
  nlLogSend_(log);

  if (str_(body.newsletterId)) {
    try {
      var row = findNewsletterRow_(body.newsletterId);
      updateRow_(SHEETS.newsletters, row._row, { 'Last Test To': addresses.join(', ') });
    } catch (err) { /* an unsaved draft has no row yet */ }
  }

  return {
    ok: true,
    sent: sent,
    failed: errors.length,
    errors: errors,
    message: 'Test sent to ' + sent + ' of ' + addresses.length + ' address' +
             (addresses.length === 1 ? '' : 'es') + '.'
  };
}

/**
 * Sends one chunk of the real thing and reports where to pick up from. The
 * console calls this repeatedly until `done` comes back true, which keeps
 * each request well inside Apps Script's six-minute ceiling.
 */
function apiNlSend_(session, body) {
  requireCap_(session, 'newsletter');
  var settings = nlRequireSendable_(body);
  var started = Date.now();

  var group = str_(body.group);
  var queue = readRows_(SHEETS.recipients).filter(function (row) {
    if (str_(row['Status']).toLowerCase() !== 'subscribed') return false;
    if (!nlValidEmail_(row['Email'])) return false;
    if (!group) return true;
    return nlGroupList_(row['Groups']).indexOf(group) !== -1;
  });

  if (!queue.length) {
    throw new Error(group
      ? 'Nobody on the list is subscribed in the "' + group + '" group.'
      : 'Nobody on the list is subscribed yet. Add recipients first.');
  }

  var offset = Math.max(0, parseInt(body.offset, 10) || 0);
  var slice = queue.slice(offset, offset + NL_SEND_CHUNK);

  var requests = [], unsubs = [];
  slice.forEach(function (row) {
    var unsub = nlUnsubscribeUrl_(row);
    unsubs.push(unsub);
    var name = [str_(row['First Name']), str_(row['Last Name'])].join(' ').trim();
    requests.push(nlBrevoRequest_(settings,
      name ? { email: str_(row['Email']), name: name } : { email: str_(row['Email']) },
      str_(body.subject),
      nlPersonalise_(body.html, row, unsub),
      nlPersonalise_(body.text, row, unsub),
      unsub));
  });

  var responses = requests.length ? UrlFetchApp.fetchAll(requests) : [];
  var sent = 0, failed = 0, errors = [], log = [];
  var stamp = nowIso_();

  responses.forEach(function (response, i) {
    var row = slice[i];
    var result = nlReadBrevoResponse_(response);
    if (result.ok) sent += 1; else { failed += 1; errors.push(str_(row['Email']) + ': ' + result.error); }
    updateRow_(SHEETS.recipients, row._row, {
      'Last Sent At': stamp,
      'Last Send Result': result.ok ? 'sent' : 'failed'
    });
    log.push({
      'Newsletter ID': str_(body.newsletterId),
      'Issue Date': dateKey_(body.issueDate),
      'Subject': str_(body.subject),
      'Email': str_(row['Email']),
      'Kind': 'newsletter',
      'Result': result.ok ? 'sent' : 'failed',
      'Provider Message ID': result.messageId || '',
      'Error': result.error || '',
      'Sent By': str_(session.email),
      'Sent At': stamp
    });
  });
  nlLogSend_(log);

  var nextOffset = offset + slice.length;
  var done = nextOffset >= queue.length;

  /* Roll the running totals onto the issue as each chunk lands, so a send
     that is interrupted still shows how far it got. */
  if (str_(body.newsletterId)) {
    try {
      var row = findNewsletterRow_(body.newsletterId);
      var patch = {
        'Recipient Count': queue.length,
        'Sent Count':   (offset ? Number(row['Sent Count']) || 0 : 0) + sent,
        'Failed Count': (offset ? Number(row['Failed Count']) || 0 : 0) + failed,
        'Status': done ? 'sent' : 'sending',
        'Sent By': str_(session.email),
        'Sent At': stamp
      };
      updateRow_(SHEETS.newsletters, row._row, patch);
    } catch (err) { /* an unsaved draft has no row yet */ }
  }

  return {
    ok: true,
    total: queue.length,
    offset: offset,
    nextOffset: nextOffset,
    done: done,
    sent: sent,
    failed: failed,
    errors: errors.slice(0, 10),
    elapsedMs: Date.now() - started,
    message: done
      ? 'Newsletter sent.'
      : 'Sent ' + nextOffset + ' of ' + queue.length + '…'
  };
}

/* ─────────────────────────── Unsubscribe page ─────────────────────────── */

function nlUnsubscribePage_(params) {
  var recipientId = str_(params.r);
  var token = str_(params.t);
  var resubscribe = str_(params.a) === 'resubscribe';

  var row = recipientId ? findRecipientById_(recipientId) : null;
  if (!row || !token || token !== str_(row['Unsubscribe Token'])) {
    return nlHtmlPage_('Link not recognised',
      'We could not match this link to an address on our list. If you would like to ' +
      'stop receiving the newsletter, please email ' +
      '<a href="mailto:info@wynlife.com.au">info@wynlife.com.au</a> and we will take ' +
      'care of it.', '');
  }

  updateRow_(SHEETS.recipients, row._row, {
    'Status': resubscribe ? 'subscribed' : 'unsubscribed',
    'Updated At': nowIso_()
  });

  var email = str_(row['Email']);
  if (resubscribe) {
    return nlHtmlPage_('You’re back on the list',
      '<strong>' + email + '</strong> will receive the WynLife Church newsletter again. ' +
      'It’s good to have you with us.', '');
  }

  var back = nlBaseUrl_() + '?action=nlUnsubscribe&r=' + encodeURIComponent(recipientId) +
             '&t=' + encodeURIComponent(token) + '&a=resubscribe';
  return nlHtmlPage_('You have been unsubscribed',
    'We have removed <strong>' + email + '</strong> from the WynLife Church newsletter. ' +
    'You will not receive any more of these emails.',
    '<a class="btn" href="' + back + '">Changed your mind? Resubscribe</a>');
}

function nlHtmlPage_(title, bodyHtml, actionHtml) {
  var html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<title>' + title + ' — WynLife Church</title><style>' +
    'body{margin:0;background:#f4f5f8;color:#333a4a;font-family:Arial,Helvetica,sans-serif;' +
    'line-height:1.7;padding:48px 20px;}' +
    '.card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #dfe1e7;padding:36px 32px;}' +
    'h1{font-family:Georgia,serif;color:#1a2744;font-size:1.5rem;margin:0 0 14px;}' +
    'p{margin:0 0 18px;font-size:0.98rem;}' +
    'a{color:#2c3d63;}' +
    '.btn{display:inline-block;background:#1a2744;color:#fff;text-decoration:none;padding:12px 22px;' +
    'font-size:0.78rem;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;}' +
    '.foot{margin-top:26px;font-size:0.8rem;color:#6c7488;}' +
    '</style></head><body><div class="card">' +
    '<h1>' + title + '</h1><p>' + bodyHtml + '</p>' + (actionHtml || '') +
    '<p class="foot">WynLife Church &middot; 208 Ballan Rd, Wyndham Vale VIC 3024 &middot; ' +
    '<a href="https://www.wynlife.com.au/">wynlife.com.au</a></p>' +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle(title + ' — WynLife Church');
}
