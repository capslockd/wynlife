/****************************************************************************
 * WynLife Church — Website backend (Google Apps Script)
 *
 * Paste this into the same Apps Script project as Code.gs — they share one
 * global scope, so everything here uses the helpers defined there
 * (readRows_, appendRow_, updateRow_, nextId_, str_, nowIso_ …).
 *
 * Sheets
 *   Website Content      — one row per page: the draft being worked on and
 *                          the version that is live
 *   Website Publish Log  — one row per publish: what changed, who pressed
 *                          the button, and the GitHub commit it made
 *
 * How publishing works
 *   The console renders the HTML for every editable region of the site
 *   (site-content.js) and sends it here with the page's content. This script
 *   copies any newly uploaded pictures from Drive into the repository,
 *   writes each region into the page files between its markers —
 *
 *     <!-- cms:gatherings-sections · managed in /admin/ -->
 *     …
 *     <!-- /cms:gatherings-sections -->
 *
 *   — and commits the lot to GitHub in one commit. GitHub Pages then
 *   rebuilds the site, usually within a minute. The live site is plain
 *   static HTML: nothing a visitor loads ever calls this script or Drive.
 *
 * Configure GitHub from the console (Settings > Website Publishing). The
 * token is kept in Script Properties, never in the spreadsheet.
 ****************************************************************************/

var WEB_PAGES = ['home', 'gatherings', 'online', 'whatson'];

var WEB_PAGE_LABELS = {
  home: 'Home Page',
  gatherings: 'Gatherings',
  online: 'Church Online',
  whatson: 'What’s On'
};

/* The only files publishing may change, and the only regions it may write
   into them. Keep WEB_REGIONS in step with REGIONS in site-content.js. */
var WEB_FILES = [
  'index.html', 'gatherings.html', 'church-online.html', 'whats-on.html',
  'visit.html', 'next-steps.html', 'about.html', 'give.html', 'pray.html', 'admin.html'
];

var WEB_REGIONS = [
  'home-gatherings', 'home-sunday-school', 'home-whats-on',
  'gatherings-hero', 'gatherings-subnav', 'gatherings-sections',
  'online-player', 'online-watch-link',
  'whatson-hero', 'whatson-subnav', 'whatson-sections',
  'menu-gatherings', 'menu-whatson', 'footer-gatherings'
];

/* Regions that only list links. A change to these alone is not a change to
   the page's own content, so it does not move the page's sitemap date. */
var WEB_MENU_REGIONS = ['menu-gatherings', 'menu-whatson', 'footer-gatherings'];

/* Each page's <loc> in sitemap.xml, so its <lastmod> follows its content. */
var WEB_SITEMAP_LOC = {
  'index.html':         'https://www.wynlife.com.au/',
  'gatherings.html':    'https://www.wynlife.com.au/gatherings/',
  'church-online.html': 'https://www.wynlife.com.au/church-online/',
  'whats-on.html':      'https://www.wynlife.com.au/whats-on/'
};

var WEB_SITEMAP_FILE = 'sitemap.xml';

var WEB_IMAGE_FOLDER = 'WynLife Website Images';

/* Where published pictures live in the repository, e.g.
   assets/uploads/2026/carols-night-Xy3_aB9kQz.jpg */
var WEB_UPLOAD_DIR = 'assets/uploads';

var WEB_DEFAULT_REPO = 'capslockd/wynlife';
var WEB_DEFAULT_BRANCH = 'main';

/* A spreadsheet cell holds at most 50,000 characters. */
var WEB_MAX_JSON = 45000;

/* Anything the console renders is plain markup. These never come out of
   site-content.js, so seeing one means the request did not come from it. */
var WEB_FORBIDDEN = [
  /<\s*\/?\s*(script|iframe|frame|object|embed|style|link|meta|base|form|input|button|textarea|select|svg|math|template)\b/i,
  /<[^>]*\son[a-z]+\s*=/i,
  /<[^>]*\b(href|src|action|formaction|srcset|poster|data)\s*=\s*["']?\s*(javascript|vbscript|data)\s*:/i,
  /<[^>]*\bsrcdoc\s*=/i,
  /<!--/
];

var WEB_DRIVE_URL = /https:\/\/lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]{20,})(=[A-Za-z0-9-]*)?/g;

/* ─────────────────────────── Content ─────────────────────────── */

function webPage_(page) {
  var key = str_(page);
  if (WEB_PAGES.indexOf(key) === -1) throw new Error('Unknown page: ' + key);
  return key;
}

function webParse_(text) {
  var raw = str_(text);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

function webJson_(content) {
  if (!content || typeof content !== 'object') throw new Error('No page content was received.');
  var json = JSON.stringify(content);
  if (json.length > WEB_MAX_JSON) {
    throw new Error('This page has grown too long to save in one go (' + json.length +
                    ' characters). Shorten some of the text, or split a section in two.');
  }
  return json;
}

/** { home: row, gatherings: row, … } for the pages that have a row yet. */
function webRows_() {
  var out = {};
  readRows_(SHEETS.webContent).forEach(function (row) {
    var page = str_(row['Page']);
    if (WEB_PAGES.indexOf(page) !== -1 && !out[page]) out[page] = row;
  });
  return out;
}

function webMeta_(row) {
  if (!row) return {};
  return {
    draftBy: str_(row['Draft Updated By']),
    draftAt: str_(row['Draft Updated At']),
    publishedBy: str_(row['Published By']),
    publishedAt: str_(row['Published At']),
    commit: str_(row['Published Commit'])
  };
}

/** Bumped on every publish, so the console can tell when it is out of date. */
function webRev_() {
  return str_(PropertiesService.getScriptProperties().getProperty('WEB_REV')) || '0';
}

/**
 * Everything the editor needs in one call. A page that has never been saved
 * comes back as null, and the console starts it from site-content.js —
 * which is a copy of what the page says today.
 */
function apiWebState_(session) {
  requireCap_(session, 'website');
  var rows = webRows_();
  var draft = {}, published = {}, meta = {};
  WEB_PAGES.forEach(function (page) {
    var row = rows[page];
    draft[page] = row ? webParse_(row['Draft JSON']) : null;
    published[page] = row ? webParse_(row['Published JSON']) : null;
    meta[page] = webMeta_(row);
  });
  var settings = webSettings_();
  return {
    ok: true,
    draft: draft,
    published: published,
    meta: meta,
    rev: webRev_(),
    configured: !!settings.token,
    repo: settings.repo,
    branch: settings.branch
  };
}

function webSaveRow_(page, patch) {
  var row = webRows_()[page];
  if (row) {
    updateRow_(SHEETS.webContent, row._row, patch);
  } else {
    patch['Page'] = page;
    appendRow_(SHEETS.webContent, patch);
  }
}

/** Drafts are shared: whoever opens the page next carries on from here. */
function apiWebSaveDraft_(session, body) {
  requireCap_(session, 'website');
  var page = webPage_(body.page);
  var json = webJson_(body.content);
  var stamp = nowIso_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('The sheet is busy. Please try again in a moment.');
  try {
    webSaveRow_(page, {
      'Draft JSON': json,
      'Draft Updated By': str_(session.email),
      'Draft Updated At': stamp
    });
  } finally {
    lock.releaseLock();
  }
  return { ok: true, savedAt: stamp, savedBy: str_(session.email), message: 'Draft saved.' };
}

/* ─────────────────────────── Pictures ─────────────────────────── */

function webImageFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = str_(props.getProperty('WEBSITE_IMAGE_FOLDER_ID'));
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* recreate below */ }
  }
  var existing = DriveApp.getFoldersByName(WEB_IMAGE_FOLDER);
  var folder = existing.hasNext() ? existing.next() : DriveApp.createFolder(WEB_IMAGE_FOLDER);
  props.setProperty('WEBSITE_IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * An upload is held on Drive while it is only in a draft, so the preview can
 * show it straight away. Publishing copies it into the repository and the
 * live site serves it from there — the Drive copy is never linked publicly.
 */
function apiWebUploadImage_(session, body) {
  requireCap_(session, 'website');
  var data = String(body.dataBase64 || '');
  if (!data) throw new Error('No image data was received.');
  if (data.length > 9000000) throw new Error('That image is too large. Please keep uploads under 6 MB.');

  var mime = str_(body.mimeType) || 'image/jpeg';
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].indexOf(mime) === -1) {
    throw new Error('Please upload a JPEG, PNG, GIF or WebP picture.');
  }

  var name = str_(body.name).replace(/[^A-Za-z0-9._-]+/g, '-') || 'website-image';
  var blob = Utilities.newBlob(Utilities.base64Decode(data), mime, name);
  var file = webImageFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    url: 'https://lh3.googleusercontent.com/d/' + file.getId(),
    fileId: file.getId(),
    message: name + ' uploaded.'
  };
}

var WEB_IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

function webInFolder_(file, folderId) {
  var parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) return true;
  }
  return false;
}

/**
 * Copies every uploaded picture the page uses into the repository, as git
 * blobs ready to go into the commit, and maps each Drive link to the path it
 * will have on the site. Only files in the website's own upload folder are
 * copied: this script can read anything in the church's Drive, and a pasted
 * link to some other file must never end up published.
 */
function webCopyImages_(settings, text) {
  var found = {};
  var match;
  WEB_DRIVE_URL.lastIndex = 0;
  while ((match = WEB_DRIVE_URL.exec(text))) {
    (found[match[1]] = found[match[1]] || []).push(match[0]);
  }

  var ids = Object.keys(found);
  var out = { map: {}, entries: [], skipped: [] };
  if (!ids.length) return out;

  var folderId = webImageFolder_().getId();
  var year = Utilities.formatDate(new Date(), tz_(), 'yyyy');

  ids.forEach(function (id) {
    var file;
    try { file = DriveApp.getFileById(id); } catch (err) { out.skipped.push(id); return; }
    var ext = WEB_IMAGE_EXT[file.getMimeType()];
    if (!ext || !webInFolder_(file, folderId)) { out.skipped.push(id); return; }

    var stem = file.getName().replace(/\.[^.]+$/, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
    var path = WEB_UPLOAD_DIR + '/' + year + '/' + stem + '-' + id.slice(-10) + '.' + ext;
    var blob = ghCall_(settings, 'post', '/repos/' + settings.repo + '/git/blobs', {
      content: Utilities.base64Encode(file.getBlob().getBytes()),
      encoding: 'base64'
    });
    out.entries.push({ path: path, mode: '100644', type: 'blob', sha: blob.sha });
    found[id].forEach(function (url) { out.map[url] = '/' + path; });
  });
  return out;
}

/** Swaps each Drive link for its published path, longest links first. */
function webRewrite_(text, map) {
  return Object.keys(map).sort(function (a, b) { return b.length - a.length; })
    .reduce(function (acc, url) { return acc.split(url).join(map[url]); }, String(text));
}

/* ─────────────────────────── Regions ─────────────────────────── */

/** Refuses anything but known regions holding plain markup. */
function webCheckRegions_(regions) {
  if (!regions || typeof regions !== 'object') throw new Error('No page regions were received.');
  var out = {};
  Object.keys(regions).forEach(function (name) {
    if (WEB_REGIONS.indexOf(name) === -1) throw new Error('Unknown page region: ' + name);
    var html = String(regions[name] === null || regions[name] === undefined ? '' : regions[name]);
    if (html.length > 300000) throw new Error('The ' + name + ' region is too large to publish.');
    WEB_FORBIDDEN.forEach(function (re) {
      if (re.test(html)) {
        throw new Error('The ' + name + ' region contains markup the website does not allow, so ' +
                        'nothing was published.');
      }
    });
    out[name] = html;
  });
  return out;
}

function webIndent_(html, indent) {
  if (!html) return '';
  return String(html).split('\n').map(function (line) {
    return line ? indent + line : '';
  }).join('\n') + '\n';
}

/**
 * Rewrites every region in one file. Each region keeps its two marker lines
 * and their indentation; only what sits between them changes. A region the
 * request did not include is left exactly as it is.
 *
 * Returns the new text and, for every region found, what was there before
 * and what is there now.
 */
function webSplice_(text, regions) {
  var found = [];
  var re = /^([ \t]*)(<!--\s*cms:([a-z0-9-]+)(?=\s|-->)[^>]*-->)[^\n]*\n([\s\S]*?)^([ \t]*)(<!--\s*\/cms:\3\s*-->)/gm;
  var out = String(text).replace(re, function (all, indent, start, name, inner, endIndent, end) {
    var count = found.filter(function (f) { return f.name === name; }).length;
    if (!regions.hasOwnProperty(name)) {
      found.push({ name: name, index: count, before: inner, after: inner });
      return all;
    }
    var next = webIndent_(regions[name], indent);
    found.push({ name: name, index: count, before: inner, after: next });
    return indent + start + '\n' + next + endIndent + end;
  });
  return { text: out, found: found };
}

function webHash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(text), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); })
    .join('');
}

function webEscapeRe_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Moves the <lastmod> of each page whose content changed to today. */
function webSitemap_(text, files) {
  var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  return files.reduce(function (acc, file) {
    var loc = WEB_SITEMAP_LOC[file];
    if (!loc) return acc;
    var re = new RegExp('(<loc>' + webEscapeRe_(loc) + '</loc>\\s*<lastmod>)[^<]*(</lastmod>)');
    return acc.replace(re, '$1' + today + '$2');
  }, String(text));
}

/* ─────────────────────────── GitHub ─────────────────────────── */

function webSettings_() {
  var props = PropertiesService.getScriptProperties();
  return {
    token:  str_(props.getProperty('GITHUB_TOKEN')),
    repo:   str_(props.getProperty('GITHUB_REPO')) || WEB_DEFAULT_REPO,
    branch: str_(props.getProperty('GITHUB_BRANCH')) || WEB_DEFAULT_BRANCH
  };
}

function webRequireGitHub_() {
  var settings = webSettings_();
  if (!settings.token) {
    throw new Error('Publishing is not set up yet. An admin needs to add a GitHub token under ' +
                    'Settings > Website Publishing.');
  }
  return settings;
}

function ghRequest_(settings, method, path, payload) {
  var request = {
    url: 'https://api.github.com' + path,
    method: method,
    headers: {
      Authorization: 'Bearer ' + settings.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    muteHttpExceptions: true
  };
  if (payload !== undefined) {
    request.contentType = 'application/json';
    request.payload = JSON.stringify(payload);
  }
  return request;
}

/** Plain-English reasons for the failures someone setting this up will meet. */
function ghFailure_(settings, code, message) {
  var detail = message ? ' (GitHub said: ' + message + ')' : '';
  if (code === 401) {
    return 'GitHub did not accept the publishing token. It may have expired or been revoked — ' +
           'an admin can paste a new one under Settings > Website Publishing.';
  }
  if (code === 403 && /rate limit/i.test(message)) {
    return 'GitHub is limiting requests right now. Please wait a few minutes and publish again.';
  }
  if (code === 422 && /rule|protected|pull request/i.test(message)) {
    return 'GitHub refused the change because the ' + settings.branch + ' branch is protected and ' +
           'needs a pull request. The token must belong to an account on that rule’s bypass list ' +
           '(GitHub > the repository > Settings > Rules).' + detail;
  }
  if (code === 403 || code === 404) {
    return 'The publishing token cannot reach ' + settings.repo + '. Check the repository name, and ' +
           'that the token was given Contents: Read and write access to it.' + detail;
  }
  return 'GitHub returned an error (' + code + ').' + detail;
}

function ghRead_(settings, response) {
  var code = response.getResponseCode();
  var text = response.getContentText();
  var data = null;
  try { data = text ? JSON.parse(text) : null; } catch (err) { data = null; }
  if (code >= 200 && code < 300) return data;
  var message = str_(data && data.message);
  var err = new Error(ghFailure_(settings, code, message));
  err.status = code;
  err.ghMessage = message;
  throw err;
}

function ghCall_(settings, method, path, payload) {
  var request = ghRequest_(settings, method, path, payload);
  var url = request.url;
  delete request.url;
  return ghRead_(settings, UrlFetchApp.fetch(url, request));
}

/** Fetches several files at one commit, in parallel. Missing files are skipped. */
function ghFiles_(settings, paths, ref) {
  var requests = paths.map(function (path) {
    return ghRequest_(settings, 'get', '/repos/' + settings.repo + '/contents/' +
                      path.split('/').map(encodeURIComponent).join('/') +
                      '?ref=' + encodeURIComponent(ref));
  });
  var out = {};
  UrlFetchApp.fetchAll(requests).forEach(function (response, i) {
    if (response.getResponseCode() === 404) return;
    var data = ghRead_(settings, response);
    out[paths[i]] = Utilities.newBlob(Utilities.base64Decode(String(data.content).replace(/\s/g, '')))
      .getDataAsString('UTF-8');
  });
  return out;
}

function webStoredHashes_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('WEB_REGION_HASHES') || '{}');
  } catch (err) {
    return {};
  }
}

/**
 * Writes the regions into the files at the tip of the branch and commits
 * them, with the pictures, as one commit. If someone else pushes between our
 * read and our write, GitHub refuses the update; we start again from their
 * commit rather than overwrite it.
 */
function webCommit_(settings, regions, imageEntries, message) {
  var repoPath = '/repos/' + settings.repo;
  var refPath = repoPath + '/git/refs/heads/' + settings.branch;
  var stored = webStoredHashes_();

  for (var attempt = 1; attempt <= 3; attempt++) {
    var head = ghCall_(settings, 'get', repoPath + '/git/ref/heads/' + settings.branch).object.sha;
    var baseTree = ghCall_(settings, 'get', repoPath + '/git/commits/' + head).tree.sha;
    var sources = ghFiles_(settings, WEB_FILES.concat([WEB_SITEMAP_FILE]), head);

    var entries = [];
    var changedFiles = [];
    var contentChanged = [];
    var warnings = [];
    var hashes = {};
    var seen = {};

    WEB_FILES.forEach(function (file) {
      if (sources[file] === undefined) return;
      var result = webSplice_(sources[file], regions);
      var touched = false;
      result.found.forEach(function (f) {
        var key = file + '#' + f.name + '#' + f.index;
        seen[f.name] = true;
        if (stored[key] && stored[key] !== webHash_(f.before) && f.before !== f.after) {
          warnings.push(file + ': the ' + f.name + ' block had been edited directly on GitHub since ' +
                        'the last publish. Those edits have been replaced — they are still in the ' +
                        'repository’s history if they are needed.');
        }
        hashes[key] = webHash_(f.after);
        if (f.before !== f.after && WEB_MENU_REGIONS.indexOf(f.name) === -1) touched = true;
      });
      if (result.text !== sources[file]) {
        entries.push({ path: file, mode: '100644', type: 'blob', content: result.text });
        changedFiles.push(file);
        if (touched) contentChanged.push(file);
      }
    });

    Object.keys(regions).forEach(function (name) {
      if (!seen[name]) warnings.push('No page has a cms:' + name + ' marker, so that part was not published.');
    });

    if (contentChanged.length && sources[WEB_SITEMAP_FILE] !== undefined) {
      var sitemap = webSitemap_(sources[WEB_SITEMAP_FILE], contentChanged);
      if (sitemap !== sources[WEB_SITEMAP_FILE]) {
        entries.push({ path: WEB_SITEMAP_FILE, mode: '100644', type: 'blob', content: sitemap });
        changedFiles.push(WEB_SITEMAP_FILE);
      }
    }

    entries = entries.concat(imageEntries);
    if (!entries.length) {
      return { unchanged: true, files: [], warnings: warnings, hashes: hashes };
    }

    var tree = ghCall_(settings, 'post', repoPath + '/git/trees', { base_tree: baseTree, tree: entries });
    if (tree.sha === baseTree) {
      return { unchanged: true, files: [], warnings: warnings, hashes: hashes };
    }
    var commit = ghCall_(settings, 'post', repoPath + '/git/commits',
                         { message: message, tree: tree.sha, parents: [head] });
    try {
      ghCall_(settings, 'patch', refPath, { sha: commit.sha, force: false });
    } catch (err) {
      if (err.status === 422 && /fast.forward/i.test(err.ghMessage || '') && attempt < 3) continue;
      throw err;
    }
    return {
      sha: commit.sha,
      url: 'https://github.com/' + settings.repo + '/commit/' + commit.sha,
      files: changedFiles.concat(imageEntries.map(function (e) { return e.path; })),
      warnings: warnings,
      hashes: hashes
    };
  }
  throw new Error('The website kept changing while we tried to publish. Please try again.');
}

/* ─────────────────────────── Publishing ─────────────────────────── */

function webLog_(entry) {
  entry['Publish ID'] = nextId_(SHEETS.webLog, 'Publish ID', 'WEB-');
  appendRow_(SHEETS.webLog, entry);
  return entry['Publish ID'];
}

/**
 * Publishes one page. The console sends the page's content and the HTML of
 * every region rendered from it plus the other pages' live content — the
 * menus on every page, and the home page's Sunday School panel, are drawn
 * from more than one page, so a publish always rewrites them all together.
 */
function apiWebPublish_(session, body) {
  requireCap_(session, 'website');
  var page = webPage_(body.page);
  var settings = webRequireGitHub_();
  var regions = webCheckRegions_(body.regions);
  var contentJson = webJson_(body.content);
  var summary = str_(body.summary).slice(0, 500);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Someone else is publishing right now. Please try again in a minute.');
  }
  try {
    /* The other pages' regions were rendered from what the console last
       loaded. If anyone has published since, those would undo their change. */
    if (str_(body.rev) !== webRev_()) {
      return {
        ok: false,
        code: 'stale',
        error: 'Someone else has just published a change to the website, so the editor needs ' +
               'their version first. Your work is safe — reloading and publishing again.'
      };
    }

    var images = webCopyImages_(settings, contentJson + '\n' + JSON.stringify(regions));
    contentJson = webRewrite_(contentJson, images.map);
    Object.keys(regions).forEach(function (name) {
      regions[name] = webRewrite_(regions[name], images.map);
    });

    var message = 'Website: update ' + WEB_PAGE_LABELS[page] + '\n\n' +
                  (summary ? summary + '\n\n' : '') +
                  'Published from the WynLife management app.';
    var stamp = nowIso_();
    var result;
    try {
      result = webCommit_(settings, regions, images.entries, message);
    } catch (err) {
      webLog_({
        'Page': page, 'Summary': summary, 'Result': 'failed', 'Error': err.message,
        'Published By': str_(session.email), 'Published At': stamp
      });
      throw err;
    }

    var props = PropertiesService.getScriptProperties();
    props.setProperty('WEB_REGION_HASHES', JSON.stringify(result.hashes));
    var rev = String((parseInt(webRev_(), 10) || 0) + 1);
    props.setProperty('WEB_REV', rev);

    var row = webRows_()[page];
    webSaveRow_(page, {
      'Draft JSON': contentJson,
      'Draft Updated By': str_(session.email),
      'Draft Updated At': stamp,
      'Published JSON': contentJson,
      'Published By': str_(session.email),
      'Published At': stamp,
      'Published Commit': result.unchanged ? str_(row && row['Published Commit']) : result.sha
    });

    var publishId = webLog_({
      'Page': page,
      'Summary': summary,
      'Result': result.unchanged ? 'unchanged' : 'published',
      'Commit': result.sha || '',
      'Files Changed': result.files.join(', '),
      'Images Added': images.entries.length,
      'Warnings': result.warnings.join(' | '),
      'Content JSON': contentJson,
      'Published By': str_(session.email),
      'Published At': stamp
    });

    return {
      ok: true,
      publishId: publishId,
      unchanged: !!result.unchanged,
      commit: result.sha ? { sha: result.sha, url: result.url } : null,
      files: result.files,
      images: images.entries.length,
      skippedImages: images.skipped.length,
      warnings: result.warnings,
      content: JSON.parse(contentJson),
      regions: regions,
      rev: rev,
      publishedAt: stamp,
      message: result.unchanged
        ? 'Nothing to publish — the live site already shows this.'
        : WEB_PAGE_LABELS[page] + ' published. The site rebuilds in about a minute.'
    };
  } finally {
    lock.releaseLock();
  }
}

/* ─────────────────────────── History ─────────────────────────── */

function apiWebHistory_(session) {
  requireCap_(session, 'website');
  var settings = webSettings_();
  var list = readRows_(SHEETS.webLog).map(function (row) {
    var sha = str_(row['Commit']);
    return {
      publishId: str_(row['Publish ID']),
      page: str_(row['Page']),
      pageLabel: WEB_PAGE_LABELS[str_(row['Page'])] || str_(row['Page']),
      summary: str_(row['Summary']),
      result: str_(row['Result']),
      commit: sha,
      commitUrl: sha ? 'https://github.com/' + settings.repo + '/commit/' + sha : '',
      files: str_(row['Files Changed']),
      images: Number(row['Images Added']) || 0,
      warnings: str_(row['Warnings']),
      error: str_(row['Error']),
      hasContent: !!str_(row['Content JSON']),
      publishedBy: str_(row['Published By']),
      publishedAt: str_(row['Published At'])
    };
  });
  list.reverse();
  return { ok: true, history: list.slice(0, 200) };
}

/** The content a past publish sent live, so it can be restored into the draft. */
function apiWebSnapshot_(session, body) {
  requireCap_(session, 'website');
  var target = str_(body.publishId);
  var rows = readRows_(SHEETS.webLog);
  for (var i = 0; i < rows.length; i++) {
    if (str_(rows[i]['Publish ID']) !== target) continue;
    var content = webParse_(rows[i]['Content JSON']);
    if (!content) throw new Error('That publish did not keep a copy of the page.');
    return { ok: true, page: str_(rows[i]['Page']), content: content,
             publishedAt: str_(rows[i]['Published At']) };
  }
  throw new Error('That publish could not be found.');
}

/* ─────────────────────────── Settings ─────────────────────────── */

function apiWebSettings_(session) {
  requireRole_(session, 'admin');
  var settings = webSettings_();
  var folderId = str_(PropertiesService.getScriptProperties().getProperty('WEBSITE_IMAGE_FOLDER_ID'));
  return {
    ok: true,
    settings: {
      /* Never hand the token back out — only enough to recognise it. */
      tokenSet: !!settings.token,
      tokenHint: settings.token ? settings.token.slice(0, 15) + '…' : '',
      repo: settings.repo,
      branch: settings.branch,
      imageFolderUrl: folderId ? 'https://drive.google.com/drive/folders/' + folderId : ''
    }
  };
}

/* The GitHub token travels as githubToken: every request already carries the
   console's own session in a field called token. */
function apiWebSaveSettings_(session, body) {
  requireRole_(session, 'admin');
  var props = PropertiesService.getScriptProperties();
  if (body.clearGithubToken === true) props.deleteProperty('GITHUB_TOKEN');
  if (str_(body.githubToken)) props.setProperty('GITHUB_TOKEN', str_(body.githubToken));
  if (body.repo !== undefined) {
    var repo = str_(body.repo).replace(/^https:\/\/github\.com\//, '').replace(/\.git$|\/+$/g, '');
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      throw new Error('The repository should look like owner/name, e.g. ' + WEB_DEFAULT_REPO + '.');
    }
    props.setProperty('GITHUB_REPO', repo);
  }
  if (body.branch !== undefined) {
    var branch = str_(body.branch);
    if (!/^[A-Za-z0-9_.\/-]+$/.test(branch)) throw new Error('That is not a valid branch name.');
    props.setProperty('GITHUB_BRANCH', branch);
  }
  return { ok: true, message: 'Publishing settings saved.' };
}

/**
 * Checks the token can do what publishing needs, without changing the site:
 * it reads the branch, and writes a git blob — an object nothing points at,
 * which GitHub quietly discards.
 */
function apiWebTestSettings_(session) {
  requireRole_(session, 'admin');
  var settings = webRequireGitHub_();
  var repoPath = '/repos/' + settings.repo;
  var notes = [];

  var repo = ghCall_(settings, 'get', repoPath);
  notes.push('Connected to ' + repo.full_name + '.');
  var head = ghCall_(settings, 'get', repoPath + '/git/ref/heads/' + settings.branch).object.sha;
  notes.push('The ' + settings.branch + ' branch is at ' + head.slice(0, 7) + '.');
  ghCall_(settings, 'post', repoPath + '/git/blobs',
          { content: 'WynLife publishing check', encoding: 'utf-8' });
  notes.push('The token can write to the repository.');

  /* Branch rules are best-effort: not every token may read them. */
  var warning = '';
  try {
    var rules = ghCall_(settings, 'get', repoPath + '/rules/branches/' + encodeURIComponent(settings.branch));
    var gated = rules.filter(function (rule) {
      return rule.type === 'pull_request' || rule.type === 'update';
    });
    if (gated.length) {
      var ids = {};
      gated.forEach(function (rule) { if (rule.ruleset_id) ids[rule.ruleset_id] = true; });
      var blocked = Object.keys(ids).filter(function (id) {
        var ruleset = ghCall_(settings, 'get', repoPath + '/rulesets/' + id);
        return ruleset.current_user_can_bypass !== 'always';
      });
      if (blocked.length) {
        warning = 'The ' + settings.branch + ' branch requires a pull request, and the token’s ' +
                  'account is not on the bypass list, so publishing will be refused. Add the account ' +
                  'to the rule’s bypass list (GitHub > Settings > Rules), or use a token from an ' +
                  'account that is.';
      } else {
        notes.push('The branch requires pull requests, but this account may bypass that, so ' +
                   'publishing goes straight to the live site.');
      }
    }
  } catch (err) { /* not able to read the rules — say nothing */ }

  return { ok: true, message: notes.join(' '), warning: warning };
}
