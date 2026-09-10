/* newsletter-templates.js — WynLife Church Management App
   ---------------------------------------------------------------------------
   Turns one "content" object into ready-to-send email HTML, in three designs:

     classic    light page, navy masthead, full-bleed image cards
     dark       navy page, big display headings, quiet rules
     editorial  warm paper stock, numbered contents, ruled sections

   The browser renders the email (here) and hands the finished HTML to the
   Apps Script backend, which posts it to Brevo. That keeps one copy of each
   design instead of one in JavaScript and another in Apps Script.

   Everything is table-based, inline-styled, 600px wide and Outlook-safe.
   --------------------------------------------------------------------------- */

window.WynNewsletter = (function () {

  /* Replaced per recipient by the backend just before sending. */
  var UNSUB = '{{UNSUB_URL}}';

  var SITE = 'https://www.wynlife.com.au';

  var DESIGNS = [
    { id: 'classic',   label: 'Classic',   note: 'Light page, navy masthead, full-bleed image cards.' },
    { id: 'dark',      label: 'Dark',      note: 'Navy page, large display headings, quiet rules.' },
    { id: 'editorial', label: 'Editorial', note: 'Warm paper stock, numbered contents, ruled sections.' }
  ];

  /* ── Small helpers ───────────────────────────────────────────────────── */

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Escapes text but keeps the line breaks the writer typed. */
  function escBr(value) {
    return esc(value).replace(/\r?\n/g, '<br>');
  }

  function has(value) {
    return !!(value && String(value).trim());
  }

  /** Splits a textarea into paragraphs on blank lines. */
  function paragraphs(text) {
    return String(text || '').split(/\r?\n\s*\r?\n/)
      .map(function (part) { return part.trim(); })
      .filter(function (part) { return part.length > 0; });
  }

  /** Renders prose as one <div> per paragraph, spaced by `gap` px. */
  function prose(text, style, gap) {
    return paragraphs(text).map(function (para, i) {
      return '<div style="' + style + (i ? ' padding-top:' + (gap || 16) + 'px;' : '') + '">' +
        escBr(para) + '</div>';
    }).join('');
  }

  /**
   * A full-width image. The height is deliberately left to the client: the
   * pictures are uploaded week by week and their proportions vary, so a
   * fixed height would squash them.
   */
  function image(url, alt, width) {
    if (!has(url)) return '';
    var w = width || 600;
    return '<img class="fluid" src="' + esc(url) + '" width="' + w + '" alt="' + esc(alt || '') +
      '" style="display:block; width:' + w + 'px; max-width:100%; height:auto; border:0; outline:none;">';
  }

  /** A "label / value" table — Food Bank details, giving accounts. */
  function detailTable(items, opts) {
    var list = (items || []).filter(function (item) {
      return item && (has(item.k) || has(item.v));
    });
    if (!list.length) return '';
    var rows = list.map(function (item, i) {
      var rule = (i === list.length - 1) ? opts.lastRule : opts.rule;
      return '<tr>' +
        '<td width="36%" valign="top" style="width:36%; padding:12px 14px 12px 0; ' +
          rule + ' ' + opts.keyStyle + '">' + escBr(item.k) + '</td>' +
        '<td width="64%" style="width:64%; padding:12px 0; ' +
          rule + ' ' + opts.valueStyle + '">' + escBr(item.v) + '</td>' +
      '</tr>';
    }).join('');
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"' +
      (opts.tableStyle ? ' style="' + opts.tableStyle + '"' : '') + '>' + rows + '</table>';
  }

  function linkTo(url, label, style) {
    if (!has(url) || !has(label)) return '';
    return '<a href="' + esc(url) + '" style="' + style + '">' + esc(label) + ' &rarr;</a>';
  }

  function button(url, label, bg, color) {
    if (!has(url) || !has(label)) return '';
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">' +
      '<tr><td bgcolor="' + bg + '" style="background-color:' + bg + '; padding:14px 26px;">' +
      '<a href="' + esc(url) + '" style="display:block; font-family:Arial,Helvetica,sans-serif; ' +
      'font-size:12px; line-height:16px; mso-line-height-rule:exactly; letter-spacing:1.5px; ' +
      'text-transform:uppercase; font-weight:bold; color:' + color + '; text-decoration:none;">' +
      esc(label) + '</a></td></tr></table>';
  }

  /** The announcement slots that are switched on and actually have content. */
  function liveSections(content) {
    return (content.announcements || []).filter(function (item) {
      return item && item.enabled !== false &&
        (has(item.title) || has(item.body) || has(item.imageUrl));
    });
  }

  function footerLinks(content, color) {
    return (content.footer.links || []).filter(function (l) {
      return l && has(l.url) && has(l.label);
    }).map(function (l, i) {
      return (i ? '&nbsp;/&nbsp;' : '') +
        '<a href="' + esc(l.url) + '" style="color:' + color + '; text-decoration:none;">' +
        esc(l.label) + '</a>';
    }).join('');
  }

  function timesCells(content, opts) {
    var times = (content.header.times || []).filter(function (t) {
      return has(t.label) || has(t.value);
    });
    if (!times.length) return '';
    var width = Math.floor(100 / times.length);
    var last = times.length - 1;
    return times.map(function (t, i) {
      /* Outer edges sit flush; the gutter goes between the columns. */
      var pad = opts.padY + ' ' + (i === last ? opts.edge : opts.gap) +
                ' ' + opts.padY + ' ' + (i === 0 ? opts.edge : opts.gap);
      return '<td class="stack" width="' + width + '%" valign="top" ' +
        'style="width:' + width + '%; padding:' + pad + ';">' +
        '<div style="' + opts.labelStyle + '">' + escBr(t.label) + '</div>' +
        '<div style="' + opts.valueStyle + '">' + escBr(t.value) + '</div>' +
        (has(t.detail) ? '<div style="' + opts.detailStyle + '">' + escBr(t.detail) + '</div>' : '') +
      '</td>';
    }).join('');
  }

  function shell(content, bodyBg, cardBg, inner, extraCss) {
    return '<!DOCTYPE html>\n' +
      '<html lang="en-AU">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<meta name="color-scheme" content="light dark">\n' +
      '<meta name="supported-color-schemes" content="light dark">\n' +
      '<title>' + esc(content.subject || 'WynLife Church') + '</title>\n' +
      '<!--[if mso]>\n<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch>' +
      '</o:OfficeDocumentSettings></xml>\n<![endif]-->\n' +
      '<style>\n' +
      '  @media only screen and (max-width: 620px) {\n' +
      '    .pad { padding-left: 20px !important; padding-right: 20px !important; }\n' +
      (extraCss || '') +
      '    .stack { display: block !important; width: 100% !important; padding-right: 0 !important; padding-left: 0 !important; }\n' +
      '    .fluid { width: 100% !important; height: auto !important; }\n' +
      '  }\n' +
      '</style>\n</head>\n' +
      '<body style="margin:0; padding:0; background-color:' + bodyBg + ';">\n' +
      '<span style="display:none; font-size:1px; color:' + bodyBg + '; line-height:1px; max-height:0; ' +
      'max-width:0; opacity:0; overflow:hidden;">' + esc(content.preheader || '') + '</span>\n\n' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="background-color:' + bodyBg + ';">\n<tr>\n<td align="center" style="padding:24px 12px;">\n\n' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" ' +
      'style="width:600px; max-width:600px; background-color:' + cardBg + ';">\n' +
      inner +
      '\n</table>\n\n</td>\n</tr>\n</table>\n</body>\n</html>\n';
  }

  /* ── Design 1: Classic ───────────────────────────────────────────────── */

  function renderClassic(c) {
    var KICKER = 'font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:14px; ' +
      'mso-line-height-rule:exactly; letter-spacing:2px; text-transform:uppercase; ' +
      'color:#2c3d63; font-weight:bold;';
    var BODY = 'font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:24px; ' +
      'mso-line-height-rule:exactly; color:#333a4a;';
    var SERIF = 'font-family:Georgia,\'Times New Roman\',serif; font-size:17px; line-height:28px; ' +
      'mso-line-height-rule:exactly; color:#333a4a;';
    var CARD_BG = ['#1a2744', '#101a30', '#2c3d63', '#22304f', '#16223c'];
    var out = [];

    /* Masthead */
    out.push('  <tr>\n    <td bgcolor="#1a2744" style="background-color:#1a2744; padding:0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
      '<td class="pad" style="padding:24px 32px 20px 32px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
      '<td align="left" width="290" style="width:290px;">' +
      '<a href="' + esc(SITE) + '/" style="text-decoration:none;">' +
      image(c.header.bannerUrl, 'WynLife Church', 240) + '</a></td>' +
      '<td align="right" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; ' +
      'line-height:16px; mso-line-height-rule:exactly; letter-spacing:2px; text-transform:uppercase; ' +
      'color:#f4f5f8; font-weight:bold;">' + escBr(c.header.kicker) + '</td>' +
      '</tr></table></td></tr>' +
      '<tr><td style="height:3px; background-color:#5c6f9e; line-height:3px; font-size:0;">&nbsp;</td></tr>' +
      '</table></td>\n  </tr>');

    /* Section 1 — sermon */
    if (has(c.sermon.imageUrl)) {
      out.push('  <tr>\n    <td style="padding:0; line-height:0;">' +
        image(c.sermon.imageUrl, c.sermon.imageAlt || c.sermon.title) + '</td>\n  </tr>');
    }
    out.push('  <tr>\n    <td class="pad" style="padding:30px 32px 0 32px;">' +
      (has(c.sermon.kicker) ? '<div style="' + KICKER + ' padding-bottom:12px;">' +
        escBr(c.sermon.kicker) + '</div>' : '') +
      (has(c.sermon.title) ? '<div class="h1" style="font-family:Arial,Helvetica,sans-serif; ' +
        'font-size:32px; line-height:36px; mso-line-height-rule:exactly; letter-spacing:-0.8px; ' +
        'color:#1a2744; font-weight:bold;">' + escBr(c.sermon.title) + '</div>' : '') +
      (has(c.sermon.reference) ? '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; ' +
        'line-height:20px; mso-line-height-rule:exactly; letter-spacing:1.5px; text-transform:uppercase; ' +
        'color:#2c3d63; font-weight:bold; padding-top:12px;">' + escBr(c.sermon.reference) + '</div>' : '') +
      prose(c.sermon.body, SERIF + ' padding-top:20px;', 16) +
      '</td>\n  </tr>');

    /* At a glance */
    var glance = timesCells(c, {
      padY: '16px', gap: '16px', edge: '0',
      labelStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:14px; ' +
        'mso-line-height-rule:exactly; letter-spacing:1.5px; text-transform:uppercase; ' +
        'color:#6c7488; font-weight:bold;',
      valueStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:21px; line-height:27px; ' +
        'mso-line-height-rule:exactly; color:#1a2744; font-weight:bold; padding-top:5px;',
      detailStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:19px; ' +
        'mso-line-height-rule:exactly; color:#4d5567; padding-top:3px;'
    });
    if (glance) {
      out.push('  <tr>\n    <td class="pad" style="padding:28px 32px 0 32px;">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
        'style="border-top:2px solid #1a2744; border-bottom:2px solid #1a2744;"><tr>' + glance +
        '</tr></table></td>\n  </tr>');
    }

    /* Sections 2–6 — announcements, as colour-blocked cards */
    var live = liveSections(c);
    if (live.length) {
      out.push('  <tr>\n    <td class="pad" style="padding:30px 32px 16px 32px;">' +
        '<div style="' + KICKER + '">' + esc(c.announcementsLabel || 'What&rsquo;s On') + '</div>' +
        '</td>\n  </tr>');
    }
    live.forEach(function (item, i) {
      var bg = CARD_BG[i % CARD_BG.length];
      if (has(item.imageUrl)) {
        out.push('  <tr>\n    <td style="padding:0; line-height:0;">' +
          image(item.imageUrl, item.imageAlt || item.title) + '</td>\n  </tr>');
      }
      var body =
        (has(item.label) ? '<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; ' +
          'line-height:14px; mso-line-height-rule:exactly; letter-spacing:2px; text-transform:uppercase; ' +
          'color:#a8b6d6; font-weight:bold; padding-bottom:8px;">' + escBr(item.label) + '</div>' : '') +
        (has(item.title) ? '<div style="font-family:Arial,Helvetica,sans-serif; font-size:19px; ' +
          'line-height:25px; mso-line-height-rule:exactly; color:#ffffff; font-weight:bold;">' +
          escBr(item.title) + '</div>' : '') +
        prose(item.body, 'font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; ' +
          'mso-line-height-rule:exactly; color:#dfe3ec; padding-top:8px;', 12) +
        detailTable(item.details, {
          tableStyle: 'margin-top:16px;',
          rule: 'border-bottom:1px solid rgba(255,255,255,0.22);',
          lastRule: 'border-bottom:1px solid rgba(255,255,255,0.22);',
          keyStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; ' +
            'mso-line-height-rule:exactly; letter-spacing:1.5px; text-transform:uppercase; color:#a8b6d6;',
          valueStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:22px; ' +
            'mso-line-height-rule:exactly; color:#ffffff;'
        }) +
        (has(item.quote) ? '<div style="font-family:Georgia,\'Times New Roman\',serif; font-size:15px; ' +
          'line-height:24px; mso-line-height-rule:exactly; color:#ffffff; padding-top:14px;">&ldquo;' +
          escBr(item.quote) + '&rdquo;' +
          (has(item.quoteRef) ? ' <span style="font-family:Arial,Helvetica,sans-serif; font-size:11px; ' +
            'letter-spacing:1.5px; text-transform:uppercase; font-weight:bold;">' +
            escBr(item.quoteRef) + '</span>' : '') + '</div>' : '') +
        (has(item.linkUrl) ? '<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; ' +
          'line-height:16px; mso-line-height-rule:exactly; letter-spacing:1.5px; text-transform:uppercase; ' +
          'font-weight:bold; padding-top:16px;">' +
          linkTo(item.linkUrl, item.linkLabel || 'Learn more',
                 'color:#ffffff; text-decoration:underline;') + '</div>' : '');
      out.push('  <tr>\n    <td bgcolor="' + bg + '" class="pad" style="background-color:' + bg +
        '; padding:22px 32px;">' + body + '</td>\n  </tr>');
    });

    /* Section 7 — giving */
    if (c.giving.enabled !== false) {
      if (has(c.giving.imageUrl)) {
        out.push('  <tr>\n    <td style="padding:34px 0 0 0; line-height:0;">' +
          image(c.giving.imageUrl, c.giving.imageAlt || 'Giving') + '</td>\n  </tr>');
      }
      out.push('  <tr>\n    <td class="pad" style="padding:26px 32px 0 32px;">' +
        '<div style="' + KICKER + ' padding-bottom:12px;">' + escBr(c.giving.label) + '</div>' +
        prose(c.giving.intro, BODY, 12) +
        detailTable(c.giving.rows, {
          tableStyle: 'border-top:1px solid #c4c8d2; margin-top:16px;',
          rule: 'border-bottom:1px solid #c4c8d2;',
          lastRule: 'border-bottom:2px solid #1a2744;',
          keyStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; ' +
            'mso-line-height-rule:exactly; letter-spacing:1.5px; text-transform:uppercase; ' +
            'color:#6c7488; font-weight:bold;',
          valueStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:22px; ' +
            'mso-line-height-rule:exactly; color:#1a2744;'
        }) +
        prose(c.giving.note, 'font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; ' +
          'mso-line-height-rule:exactly; color:#4d5567; padding-top:14px;', 8) +
        '</td>\n  </tr>');
    }

    /* Section 8 — child safety */
    if (c.childSafe.enabled !== false) {
      out.push('  <tr>\n    <td class="pad" style="padding:34px 32px 16px 32px;">' +
        '<div style="' + KICKER + '">' + escBr(c.childSafe.label) + '</div></td>\n  </tr>');
      (c.childSafe.images || []).forEach(function (img) {
        if (!has(img.url)) return;
        out.push('  <tr>\n    <td style="padding:0; line-height:0;">' +
          image(img.url, img.alt) + '</td>\n  </tr>');
      });
      out.push('  <tr>\n    <td class="pad" style="padding:20px 32px 0 32px;">' +
        prose(c.childSafe.body, BODY, 12) + '</td>\n  </tr>');
    }

    /* Footer */
    if (has(c.footer.closingImageUrl)) {
      out.push('  <tr>\n    <td style="padding:34px 0 0 0; line-height:0;">' +
        image(c.footer.closingImageUrl, c.footer.closingImageAlt) + '</td>\n  </tr>');
    }
    if (has(c.footer.closingTitle) || has(c.footer.ctaUrl)) {
      out.push('  <tr>\n    <td bgcolor="#1a2744" class="pad" style="background-color:#1a2744; padding:32px;">' +
        '<div class="poster" style="font-family:Arial,Helvetica,sans-serif; font-size:30px; ' +
        'line-height:34px; mso-line-height-rule:exactly; letter-spacing:-0.6px; color:#ffffff; ' +
        'font-weight:bold;">' + escBr(c.footer.closingTitle) + '</div>' +
        (has(c.footer.closingText) ? '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; ' +
          'line-height:22px; mso-line-height-rule:exactly; color:#ffffff; padding-top:12px;">' +
          escBr(c.footer.closingText) + '</div>' : '') +
        button(c.footer.ctaUrl, c.footer.ctaLabel, '#f4f5f8', '#1a2744') +
        '</td>\n  </tr>');
    }
    out.push('  <tr>\n    <td bgcolor="#1a2744" style="background-color:#1a2744; padding:0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
      '<td class="pad" style="padding:30px 32px 24px 32px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
      (has(c.footer.logoUrl)
        ? '<td width="141" valign="top" style="width:141px; padding-right:20px;">' +
          image(c.footer.logoUrl, 'WynLife Church', 121) + '</td>'
        : '') +
      '<td valign="top">' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; ' +
      'mso-line-height-rule:exactly; color:#f4f5f8; font-weight:bold;">' + escBr(c.footer.orgName) + '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; ' +
      'mso-line-height-rule:exactly; color:#b0b6c4; padding-top:4px;">' + escBr(c.footer.address) + '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; ' +
      'mso-line-height-rule:exactly; letter-spacing:1px; text-transform:uppercase; font-weight:bold; ' +
      'padding-top:14px;">' + footerLinks(c, '#f4f5f8') + '</div>' +
      '</td></tr></table>' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; ' +
      'mso-line-height-rule:exactly; color:#868da0; padding-top:22px;">' + escBr(c.footer.legal) +
      ' &nbsp;<a href="' + UNSUB + '" style="color:#868da0; text-decoration:underline;">Unsubscribe</a></div>' +
      '</td></tr></table></td>\n  </tr>');

    return shell(c, '#dfe1e7', '#f4f5f8', out.join('\n'),
      '    .h1 { font-size: 26px !important; line-height: 30px !important; }\n' +
      '    .poster { font-size: 24px !important; line-height: 28px !important; }\n');
  }

  /* ── Design 2: Dark ──────────────────────────────────────────────────── */

  function renderDark(c) {
    var KICKER = 'font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:14px; ' +
      'mso-line-height-rule:exactly; letter-spacing:2.5px; text-transform:uppercase; color:#8fa2cc;';
    var BODY = 'font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; ' +
      'mso-line-height-rule:exactly; color:#d7dfef;';
    var H2 = 'font-family:Arial,Helvetica,sans-serif; font-size:28px; line-height:32px; ' +
      'mso-line-height-rule:exactly; letter-spacing:-0.6px; color:#ffffff; font-weight:bold;';
    var RULE = 'border-top:1px solid #3d4d75;';
    var out = [];

    /* Masthead */
    out.push('  <tr>\n    <td class="pad" style="padding:26px 30px 22px 30px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
      '<td align="left" width="260" style="width:260px;">' +
      '<a href="' + esc(SITE) + '/" style="text-decoration:none;">' +
      image(c.header.bannerUrl, 'WynLife Church', 220) + '</a></td>' +
      '<td align="right" valign="middle" style="' + KICKER + ' line-height:16px;">' +
      escBr(c.header.kicker) + '</td>' +
      '</tr></table></td>\n  </tr>');

    /* Section 1 — sermon: image first, then a large display headline */
    if (has(c.sermon.imageUrl)) {
      out.push('  <tr>\n    <td style="padding:0; line-height:0;">' +
        image(c.sermon.imageUrl, c.sermon.imageAlt || c.sermon.title) + '</td>\n  </tr>');
    }
    out.push('  <tr>\n    <td class="pad" style="padding:30px 30px 0 30px;">' +
      (has(c.sermon.kicker) ? '<div style="' + KICKER + ' padding-bottom:14px;">' +
        escBr(c.sermon.kicker) +
        (has(c.sermon.reference) ? ' &middot; ' + escBr(c.sermon.reference) : '') + '</div>' : '') +
      (has(c.sermon.title) ? '<div class="h1" style="font-family:Arial,Helvetica,sans-serif; ' +
        'font-size:42px; line-height:44px; mso-line-height-rule:exactly; letter-spacing:-1.4px; ' +
        'color:#ffffff; font-weight:bold;">' + escBr(c.sermon.title) + '</div>' : '') +
      prose(c.sermon.body, 'font-family:Georgia,\'Times New Roman\',serif; font-size:17px; ' +
        'line-height:29px; mso-line-height-rule:exactly; color:#d7dfef; padding-top:22px;', 16) +
      '</td>\n  </tr>');

    /* Times strip */
    var glance = timesCells(c, {
      padY: '18px', gap: '14px', edge: '0',
      labelStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:14px; ' +
        'mso-line-height-rule:exactly; letter-spacing:2px; text-transform:uppercase; color:#8fa2cc;',
      valueStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:24px; line-height:30px; ' +
        'mso-line-height-rule:exactly; color:#ffffff; font-weight:bold; padding-top:6px;',
      detailStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:19px; ' +
        'mso-line-height-rule:exactly; color:#b9c5dd; padding-top:3px;'
    });
    if (glance) {
      out.push('  <tr>\n    <td class="pad" style="padding:28px 30px 0 30px;">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
        'style="border-top:1px solid #3d4d75; border-bottom:1px solid #3d4d75;"><tr>' + glance +
        '</tr></table></td>\n  </tr>');
    }

    /* Sections 2–6 — heading, then image, then copy */
    liveSections(c).forEach(function (item) {
      out.push('  <tr>\n    <td class="pad" style="padding:32px 30px 20px 30px;">' +
        (has(item.label) ? '<div style="' + KICKER + ' padding-bottom:10px;">' +
          escBr(item.label) + '</div>' : '') +
        (has(item.title) ? '<div class="h2" style="' + H2 + '">' + escBr(item.title) + '</div>' : '') +
        '</td>\n  </tr>');
      if (has(item.imageUrl)) {
        out.push('  <tr>\n    <td style="padding:0; line-height:0;">' +
          image(item.imageUrl, item.imageAlt || item.title) + '</td>\n  </tr>');
      }
      out.push('  <tr>\n    <td class="pad" style="padding:20px 30px 0 30px;">' +
        prose(item.body, BODY, 12) +
        detailTable(item.details, {
          tableStyle: 'margin-top:16px;',
          rule: RULE,
          lastRule: RULE + ' border-bottom:1px solid #3d4d75;',
          keyStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:15px; ' +
            'mso-line-height-rule:exactly; letter-spacing:2px; text-transform:uppercase; color:#8fa2cc;',
          valueStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:22px; ' +
            'mso-line-height-rule:exactly; color:#ffffff;'
        }) +
        (has(item.quote) ? '<div style="font-family:Georgia,\'Times New Roman\',serif; font-size:17px; ' +
          'line-height:28px; mso-line-height-rule:exactly; color:#ffffff; padding-top:16px;">&ldquo;' +
          escBr(item.quote) + '&rdquo;</div>' : '') +
        (has(item.quoteRef) || has(item.linkUrl)
          ? '<div style="' + KICKER + ' padding-top:10px;">' + escBr(item.quoteRef) +
            (has(item.quoteRef) && has(item.linkUrl) ? ' &nbsp;&middot;&nbsp; ' : '') +
            linkTo(item.linkUrl, item.linkLabel || 'Learn more',
                   'color:#ffffff; text-decoration:underline;') + '</div>'
          : '') +
        '</td>\n  </tr>');
    });

    /* Section 7 — giving */
    if (c.giving.enabled !== false) {
      if (has(c.giving.imageUrl)) {
        out.push('  <tr>\n    <td style="padding:34px 0 0 0; line-height:0;">' +
          image(c.giving.imageUrl, c.giving.imageAlt || 'Giving') + '</td>\n  </tr>');
      }
      out.push('  <tr>\n    <td class="pad" style="padding:26px 30px 0 30px;">' +
        '<div style="' + KICKER + ' padding-bottom:10px;">' + escBr(c.giving.label) + '</div>' +
        prose(c.giving.intro, BODY, 12) +
        detailTable(c.giving.rows, {
          tableStyle: 'margin-top:16px;',
          rule: RULE,
          lastRule: RULE + ' border-bottom:1px solid #3d4d75;',
          keyStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:15px; ' +
            'mso-line-height-rule:exactly; letter-spacing:2px; text-transform:uppercase; color:#8fa2cc;',
          valueStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:22px; ' +
            'mso-line-height-rule:exactly; color:#ffffff;'
        }) +
        prose(c.giving.note, 'font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; ' +
          'mso-line-height-rule:exactly; color:#b9c5dd; padding-top:14px;', 8) +
        '</td>\n  </tr>');
    }

    /* Section 8 — child safety */
    if (c.childSafe.enabled !== false) {
      out.push('  <tr>\n    <td class="pad" style="padding:34px 30px 18px 30px;">' +
        '<div style="' + KICKER + '">' + escBr(c.childSafe.label) + '</div></td>\n  </tr>');
      (c.childSafe.images || []).forEach(function (img) {
        if (!has(img.url)) return;
        out.push('  <tr>\n    <td style="padding:0; line-height:0;">' +
          image(img.url, img.alt) + '</td>\n  </tr>');
      });
      out.push('  <tr>\n    <td class="pad" style="padding:20px 30px 0 30px;">' +
        prose(c.childSafe.body, BODY, 12) + '</td>\n  </tr>');
    }

    /* Footer — the closing card flips to white for contrast */
    if (has(c.footer.closingImageUrl)) {
      out.push('  <tr>\n    <td style="padding:34px 0 0 0; line-height:0;">' +
        image(c.footer.closingImageUrl, c.footer.closingImageAlt) + '</td>\n  </tr>');
    }
    if (has(c.footer.closingTitle) || has(c.footer.ctaUrl)) {
      out.push('  <tr>\n    <td bgcolor="#ffffff" class="pad" style="background-color:#ffffff; padding:34px 30px;">' +
        '<div class="h2" style="font-family:Arial,Helvetica,sans-serif; font-size:32px; line-height:36px; ' +
        'mso-line-height-rule:exactly; letter-spacing:-0.8px; color:#1a2744; font-weight:bold;">' +
        escBr(c.footer.closingTitle) + '</div>' +
        (has(c.footer.closingText) ? '<div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; ' +
          'line-height:24px; mso-line-height-rule:exactly; color:#4d5567; padding-top:12px;">' +
          escBr(c.footer.closingText) + '</div>' : '') +
        button(c.footer.ctaUrl, c.footer.ctaLabel, '#1a2744', '#ffffff') +
        '</td>\n  </tr>');
    }
    out.push('  <tr>\n    <td class="pad" style="padding:30px 30px 32px 30px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
      (has(c.footer.logoUrl)
        ? '<td width="100" valign="top" style="width:100px; padding-right:20px;">' +
          image(c.footer.logoUrl, 'WynLife Church', 80) + '</td>'
        : '') +
      '<td valign="top">' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; ' +
      'mso-line-height-rule:exactly; color:#ffffff; font-weight:bold;">' + escBr(c.footer.orgName) + '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; ' +
      'mso-line-height-rule:exactly; color:#b9c5dd; padding-top:4px;">' + escBr(c.footer.address) + '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; ' +
      'mso-line-height-rule:exactly; letter-spacing:1.5px; text-transform:uppercase; padding-top:14px;">' +
      footerLinks(c, '#ffffff') + '</div>' +
      '</td></tr></table>' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; ' +
      'mso-line-height-rule:exactly; color:#8fa2cc; padding-top:22px;">' + escBr(c.footer.legal) +
      ' &nbsp;<a href="' + UNSUB + '" style="color:#8fa2cc; text-decoration:underline;">Unsubscribe</a></div>' +
      '</td>\n  </tr>');

    return shell(c, '#0e1526', '#1a2744', out.join('\n'),
      '    .h1 { font-size: 32px !important; line-height: 34px !important; }\n' +
      '    .h2 { font-size: 24px !important; line-height: 28px !important; }\n');
  }

  /* ── Design 3: Editorial ─────────────────────────────────────────────── */

  function renderEditorial(c) {
    var PAD = '34px';
    var KICKER = 'font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:14px; ' +
      'mso-line-height-rule:exactly; letter-spacing:2.5px; text-transform:uppercase; color:#535b70;';
    var BODY = 'font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; ' +
      'mso-line-height-rule:exactly; color:#333a4a;';
    var H2 = 'font-family:Georgia,\'Times New Roman\',serif; font-size:26px; line-height:32px; ' +
      'mso-line-height-rule:exactly; color:#1a2744; font-weight:bold;';
    var IMG_W = 532;
    var out = [];

    function hairline(color) {
      return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
        '<tr><td style="height:1px; background-color:' + color + '; line-height:1px; font-size:0;">' +
        '&nbsp;</td></tr></table>';
    }

    function num(i) {
      return (i < 10 ? '0' : '') + i;
    }

    /* Masthead */
    out.push('  <tr>\n    <td class="pad" style="padding:30px ' + PAD + ' 0 ' + PAD + ';">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
      '<td align="left" valign="middle" width="230" style="width:230px;">' +
      '<a href="' + esc(SITE) + '/" style="text-decoration:none;">' +
      image(c.header.logoDarkUrl || c.header.bannerUrl, 'WynLife Church', 200) + '</a></td>' +
      '<td align="right" valign="middle" style="font-family:Arial,Helvetica,sans-serif; font-size:11px; ' +
      'line-height:17px; mso-line-height-rule:exactly; letter-spacing:1.5px; text-transform:uppercase; ' +
      'color:#535b70;">' + escBr(c.header.kicker) + '</td>' +
      '</tr></table></td>\n  </tr>');
    out.push('  <tr>\n    <td class="pad" style="padding:22px ' + PAD + ' 0 ' + PAD + ';">' +
      hairline('#1a2744') + '</td>\n  </tr>');

    /* Contents — built from whatever is actually in this issue */
    var live = liveSections(c);
    var contents = [];
    if (has(c.sermon.title)) contents.push(c.sermon.contentsLabel || 'This Sunday');
    live.forEach(function (item) {
      contents.push(item.contentsLabel || item.label || item.title);
    });
    if (c.giving.enabled !== false) contents.push(c.giving.label || 'Giving');
    if (c.childSafe.enabled !== false) contents.push(c.childSafe.label || 'Child Safety');

    if (contents.length) {
      var half = Math.ceil(contents.length / 2);
      var column = function (items, offset) {
        return items.map(function (label, i) {
          return '<span style="color:#535b70;">' + num(offset + i + 1) + '</span> &nbsp;' +
            esc(label) + '<br>';
        }).join('');
      };
      out.push('  <tr>\n    <td class="pad" style="padding:18px ' + PAD + ' 0 ' + PAD + ';">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
        '<td class="stack" width="50%" valign="top" style="width:50%; padding-right:14px; ' +
        'font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:24px; ' +
        'mso-line-height-rule:exactly; color:#333a4a;">' + column(contents.slice(0, half), 0) + '</td>' +
        '<td class="stack" width="50%" valign="top" style="width:50%; ' +
        'font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:24px; ' +
        'mso-line-height-rule:exactly; color:#333a4a;">' + column(contents.slice(half), half) + '</td>' +
        '</tr></table></td>\n  </tr>');
      out.push('  <tr>\n    <td class="pad" style="padding:18px ' + PAD + ' 0 ' + PAD + ';">' +
        hairline('#c4c8d2') + '</td>\n  </tr>');
    }

    var n = 0;

    /* Section 1 — sermon: headline, then image, then serif copy */
    n += 1;
    out.push('  <tr>\n    <td class="pad" style="padding:30px ' + PAD + ' 0 ' + PAD + ';">' +
      '<div style="' + KICKER + ' padding-bottom:10px;">' + num(n) + ' &nbsp;&mdash;&nbsp; ' +
      escBr(c.sermon.kicker) + '</div>' +
      (has(c.sermon.title) ? '<div class="h1" style="font-family:Georgia,\'Times New Roman\',serif; ' +
        'font-size:36px; line-height:42px; mso-line-height-rule:exactly; color:#1a2744; ' +
        'font-weight:bold;">' + escBr(c.sermon.title) + '</div>' : '') +
      (has(c.sermon.reference) ? '<div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; ' +
        'line-height:18px; mso-line-height-rule:exactly; letter-spacing:2px; text-transform:uppercase; ' +
        'color:#2c3d63; font-weight:bold; padding-top:12px;">' + escBr(c.sermon.reference) + '</div>' : '') +
      '</td>\n  </tr>');
    if (has(c.sermon.imageUrl)) {
      out.push('  <tr>\n    <td class="pad" style="padding:22px ' + PAD + ' 0 ' + PAD + ';">' +
        image(c.sermon.imageUrl, c.sermon.imageAlt || c.sermon.title, IMG_W) + '</td>\n  </tr>');
    }
    out.push('  <tr>\n    <td class="pad" style="padding:22px ' + PAD + ' 0 ' + PAD + ';">' +
      prose(c.sermon.body, 'font-family:Georgia,\'Times New Roman\',serif; font-size:17px; ' +
        'line-height:29px; mso-line-height-rule:exactly; color:#333a4a;', 16) +
      '</td>\n  </tr>');

    /* Times — a tinted block rather than a rule */
    var glance = timesCells(c, {
      padY: '18px', gap: '14px', edge: '20px',
      labelStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:14px; ' +
        'mso-line-height-rule:exactly; letter-spacing:2px; text-transform:uppercase; color:#535b70;',
      valueStyle: 'font-family:Georgia,\'Times New Roman\',serif; font-size:22px; line-height:28px; ' +
        'mso-line-height-rule:exactly; color:#1a2744; font-weight:bold; padding-top:5px;',
      detailStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:19px; ' +
        'mso-line-height-rule:exactly; color:#4d5567; padding-top:3px;'
    });
    if (glance) {
      out.push('  <tr>\n    <td class="pad" style="padding:26px ' + PAD + ' 0 ' + PAD + ';">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
        'bgcolor="#eeebe4" style="background-color:#eeebe4;"><tr>' + glance + '</tr></table>' +
        '</td>\n  </tr>');
    }

    /* Sections 2–6 */
    live.forEach(function (item) {
      n += 1;
      out.push('  <tr>\n    <td class="pad" style="padding:30px ' + PAD + ' 0 ' + PAD + ';">' +
        hairline('#c4c8d2') +
        '<div style="' + KICKER + ' padding:22px 0 10px 0;">' + num(n) + ' &nbsp;&mdash;&nbsp; ' +
        escBr(item.label || item.title) + '</div>' +
        (has(item.title) ? '<div style="' + H2 + '">' + escBr(item.title) + '</div>' : '') +
        prose(item.body, BODY + ' padding-top:12px;', 12) +
        '</td>\n  </tr>');
      if (has(item.imageUrl)) {
        out.push('  <tr>\n    <td class="pad" style="padding:20px ' + PAD + ' 0 ' + PAD + ';">' +
          image(item.imageUrl, item.imageAlt || item.title, IMG_W) + '</td>\n  </tr>');
      }
      var tail =
        detailTable(item.details, {
          tableStyle: '',
          rule: 'border-top:1px solid #c4c8d2;',
          lastRule: 'border-top:1px solid #c4c8d2; border-bottom:1px solid #c4c8d2;',
          keyStyle: KICKER + ' letter-spacing:2px;',
          valueStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:22px; ' +
            'mso-line-height-rule:exactly; color:#1a2744;'
        }) +
        (has(item.quote) ? '<div style="font-family:Georgia,\'Times New Roman\',serif; font-size:17px; ' +
          'line-height:28px; mso-line-height-rule:exactly; color:#1a2744; padding-top:18px;">&ldquo;' +
          escBr(item.quote) + '&rdquo;</div>' : '') +
        (has(item.quoteRef) || has(item.linkUrl)
          ? '<div style="font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:14px; ' +
            'mso-line-height-rule:exactly; letter-spacing:2px; text-transform:uppercase; color:#2c3d63; ' +
            'font-weight:bold; padding-top:10px;">' + escBr(item.quoteRef) +
            (has(item.quoteRef) && has(item.linkUrl) ? ' &nbsp;&middot;&nbsp; ' : '') +
            linkTo(item.linkUrl, item.linkLabel || 'Learn more',
                   'color:#2c3d63; text-decoration:underline;') + '</div>'
          : '');
      if (tail) {
        out.push('  <tr>\n    <td class="pad" style="padding:22px ' + PAD + ' 0 ' + PAD + ';">' +
          tail + '</td>\n  </tr>');
      }
    });

    /* Section 7 — giving */
    if (c.giving.enabled !== false) {
      n += 1;
      out.push('  <tr>\n    <td class="pad" style="padding:30px ' + PAD + ' 0 ' + PAD + ';">' +
        hairline('#c4c8d2') +
        '<div style="' + KICKER + ' padding:22px 0 10px 0;">' + num(n) + ' &nbsp;&mdash;&nbsp; ' +
        escBr(c.giving.label) + '</div>' +
        (has(c.giving.title) ? '<div style="' + H2 + '">' + escBr(c.giving.title) + '</div>' : '') +
        prose(c.giving.intro, BODY + ' padding-top:12px;', 12) +
        '</td>\n  </tr>');
      var givingRows = detailTable(c.giving.rows, {
        tableStyle: '',
        rule: '',
        lastRule: '',
        keyStyle: KICKER + ' letter-spacing:2px;',
        valueStyle: 'font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:22px; ' +
          'mso-line-height-rule:exactly; color:#1a2744;'
      });
      out.push('  <tr>\n    <td class="pad" style="padding:18px ' + PAD + ' 0 ' + PAD + ';">' +
        (givingRows
          ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
            'bgcolor="#eeebe4" style="background-color:#eeebe4;"><tr><td style="padding:20px;">' +
            givingRows + '</td></tr></table>'
          : '') +
        prose(c.giving.note, 'font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; ' +
          'mso-line-height-rule:exactly; color:#4d5567; padding-top:12px;', 8) +
        '</td>\n  </tr>');
      if (has(c.giving.imageUrl)) {
        out.push('  <tr>\n    <td class="pad" style="padding:20px ' + PAD + ' 0 ' + PAD + ';">' +
          image(c.giving.imageUrl, c.giving.imageAlt || 'Giving', IMG_W) + '</td>\n  </tr>');
      }
    }

    /* Section 8 — child safety */
    if (c.childSafe.enabled !== false) {
      n += 1;
      out.push('  <tr>\n    <td class="pad" style="padding:30px ' + PAD + ' 0 ' + PAD + ';">' +
        hairline('#c4c8d2') +
        '<div style="' + KICKER + ' padding:22px 0 10px 0;">' + num(n) + ' &nbsp;&mdash;&nbsp; ' +
        escBr(c.childSafe.label) + '</div>' +
        prose(c.childSafe.body, BODY, 12) + '</td>\n  </tr>');
      (c.childSafe.images || []).forEach(function (img, i) {
        if (!has(img.url)) return;
        out.push('  <tr>\n    <td class="pad" style="padding:' + (i ? '12px' : '18px') + ' ' +
          PAD + ' 0 ' + PAD + ';">' + image(img.url, img.alt, IMG_W) + '</td>\n  </tr>');
      });
    }

    /* Footer */
    if (has(c.footer.closingImageUrl)) {
      out.push('  <tr>\n    <td class="pad" style="padding:34px ' + PAD + ' 0 ' + PAD + ';">' +
        image(c.footer.closingImageUrl, c.footer.closingImageAlt, IMG_W) + '</td>\n  </tr>');
    }
    if (has(c.footer.closingTitle) || has(c.footer.ctaUrl)) {
      out.push('  <tr>\n    <td class="pad" style="padding:26px ' + PAD + ' 0 ' + PAD + ';">' +
        '<div style="font-family:Georgia,\'Times New Roman\',serif; font-size:28px; line-height:34px; ' +
        'mso-line-height-rule:exactly; color:#1a2744; font-weight:bold;">' +
        escBr(c.footer.closingTitle) + '</div>' +
        (has(c.footer.closingText) ? '<div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; ' +
          'line-height:24px; mso-line-height-rule:exactly; color:#4d5567; padding-top:10px;">' +
          escBr(c.footer.closingText) + '</div>' : '') +
        button(c.footer.ctaUrl, c.footer.ctaLabel, '#1a2744', '#f7f5f0') +
        '</td>\n  </tr>');
    }
    out.push('  <tr>\n    <td class="pad" style="padding:34px ' + PAD + ' 32px ' + PAD + ';">' +
      hairline('#1a2744') +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; ' +
      'mso-line-height-rule:exactly; color:#1a2744; font-weight:bold; padding-top:20px;">' +
      escBr(c.footer.orgName) + '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; ' +
      'mso-line-height-rule:exactly; color:#4d5567; padding-top:4px;">' + escBr(c.footer.address) + '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:17px; ' +
      'mso-line-height-rule:exactly; letter-spacing:1.5px; text-transform:uppercase; padding-top:14px;">' +
      footerLinks(c, '#2c3d63') + '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:18px; ' +
      'mso-line-height-rule:exactly; color:#5f6779; padding-top:18px;">' + escBr(c.footer.legal) +
      ' &nbsp;<a href="' + UNSUB + '" style="color:#5f6779; text-decoration:underline;">Unsubscribe</a></div>' +
      '</td>\n  </tr>');

    return shell(c, '#e8e4dc', '#f7f5f0', out.join('\n'),
      '    .h1 { font-size: 27px !important; line-height: 32px !important; }\n');
  }

  /* ── Public API ──────────────────────────────────────────────────────── */

  var RENDERERS = {
    classic:   renderClassic,
    dark:      renderDark,
    editorial: renderEditorial
  };

  /**
   * A blank issue, with the standing sections (header, giving, child safety
   * and footer) already filled in — those say the same thing every week.
   */
  function blank() {
    return {
      design: 'classic',
      subject: '',
      preheader: '',
      issueDate: '',
      announcementsLabel: 'What’s On',
      header: {
        bannerUrl: SITE + '/assets/newsletter/wynlife-banner.png',
        logoDarkUrl: SITE + '/assets/newsletter/wynlife-logo-navy.png',
        kicker: 'Weekly\nNewsletter',
        times: [
          { label: 'Sunday Service',   value: '10:00 AM', detail: '208 Ballan Rd, Wyndham Vale' },
          { label: 'Wednesday Prayer', value: '7:00 PM',  detail: 'WynLife Centre' }
        ]
      },
      sermon: {
        kicker: 'This Sunday · 10:00 AM',
        contentsLabel: 'This Sunday',
        title: '',
        reference: '',
        imageUrl: '',
        imageAlt: '',
        body: ''
      },
      announcements: [1, 2, 3, 4, 5].map(function (i) {
        return {
          enabled: i <= 3,
          label: '',
          contentsLabel: '',
          title: '',
          body: '',
          imageUrl: '',
          imageAlt: '',
          details: [],
          quote: '',
          quoteRef: '',
          linkLabel: '',
          linkUrl: ''
        };
      }),
      giving: {
        enabled: true,
        label: 'Giving',
        title: 'Generous Hearts',
        intro: 'We thank you for your kingdom partnership! Please note, we have a white box near ' +
               'the worship hall door. Our account details for electronic giving:',
        imageUrl: SITE + '/assets/newsletter/generous-hearts.jpg',
        imageAlt: 'Generous Hearts — 2 Corinthians 9:7',
        rows: [
          { k: 'Account name', v: 'Wyn Life Church' },
          { k: 'BSB',          v: '013 328' },
          { k: 'Account',      v: '4346 1594 2' },
          { k: 'Description',  v: 'Offerings - Tithes, Missions, Foodbank, etc.' }
        ],
        note: 'RJC Ministry Centre Inc | BSB: 062339 | A#10696497 is for Foodbank donations for tax. ' +
              'Please contact Pynqi for more details.'
      },
      childSafe: {
        enabled: true,
        label: 'Child Safety',
        body: 'WynLife Church values the safety of our children. Our staff and volunteers are checked ' +
              'and screened, and our policies and code of conduct are kept up to date and continuously ' +
              'reviewed. For more information, see ccyp.vic.gov.au.',
        images: [
          { url: SITE + '/assets/newsletter/childsafe-banner.jpg',
            alt: 'We take the safety of children seriously — childsafe.org.au' },
          { url: SITE + '/assets/newsletter/child-safe-standards.jpg',
            alt: 'Victoria’s Child Safe Standards — plain language summary' }
        ]
      },
      footer: {
        closingImageUrl: SITE + '/assets/newsletter/church-family.jpg',
        closingImageAlt: 'The WynLife Church family',
        closingTitle: 'New here?\nStart with a Sunday.',
        closingText: '10:00 AM · 208 Ballan Rd (next to KFC), Wyndham Vale VIC 3024',
        ctaLabel: 'I’m New Here',
        ctaUrl: SITE + '/next-steps/',
        logoUrl: SITE + '/assets/newsletter/wynlife-logo.png',
        orgName: 'WynLife Church',
        address: '208 Ballan Rd (next to KFC)\nWyndham Vale VIC 3024\n+61 457 697 354 · info@wynlife.com.au',
        links: [
          { label: 'Website',   url: SITE + '/' },
          { label: 'Facebook',  url: 'https://www.facebook.com/wynlifechurch.au' },
          { label: 'Instagram', url: 'http://instagram.com/wynlifechurch' },
          { label: 'YouTube',   url: 'https://www.youtube.com/@wynlifechurch' }
        ],
        legal: 'You’re receiving this because you’re part of the WynLife family.'
      }
    };
  }

  /**
   * A worked example, built from the design mockup: a real sermon and the
   * four announcements that run most weeks, with their pictures already on
   * the church website. Opening it from the history gives a new issue to
   * edit down rather than a blank page to fill.
   */
  function sample() {
    var c = blank();
    var img = SITE + '/assets/newsletter/';

    c.subject = 'Be Strong and Courageous — this Sunday at WynLife';
    c.preheader = 'Joshua 1:1-9 this Sunday, plus Wednesday prayer, Life Groups, ' +
                  'Fellowship Lunch and Food Bank Term 4 dates.';

    c.sermon.kicker = 'This Sunday · 10:00 AM';
    c.sermon.title = 'BE STRONG AND COURAGEOUS';
    c.sermon.reference = 'Joshua 1:1-9';
    c.sermon.imageUrl = img + 'hero-be-strong.jpg';
    c.sermon.imageAlt = 'Be Strong and Courageous — Joshua 1:1-9';
    c.sermon.body =
      'In Joshua 1, God commanded Joshua to “be strong and courageous” as he ' +
      'prepared to lead Israel. His strength was not simply in Himself but in his ' +
      'faith, obedience, and dependence on God.\n\n' +
      'As fathers, we are also called to lead our families with strength and ' +
      'courage—not relying on our own abilities, but being strong in the Lord and ' +
      'in His Word. Let’s learn from Joshua what it means to father with God’s ' +
      'strength, courage, and faith.';

    c.announcements[0] = merge(c.announcements[0], {
      enabled: true,
      label: 'Gatherings',
      contentsLabel: 'Wednesday Night Prayer',
      title: 'Wednesday Night Prayer',
      body: 'Corporate prayer and worship every Wednesday evening as a church family, ' +
            '7:00 PM at the WynLife Centre. For prayer requests, please reach out to ' +
            'Ps. Jimm or Andrew Jelbart.',
      imageUrl: img + 'prayer-wednesdays.jpg',
      imageAlt: 'Prayer — 7PM Wednesdays',
      quote: 'Rejoice always, pray without ceasing, in everything give thanks; for ' +
             'this is the will of God in Christ Jesus for you.',
      quoteRef: '1 Thess. 5:16',
      linkLabel: 'Let us pray for you',
      linkUrl: SITE + '/pray/'
    });

    c.announcements[1] = merge(c.announcements[1], {
      enabled: true,
      label: 'Life Groups',
      contentsLabel: 'Life Groups',
      title: 'Wyndham Vale, Werribee, Tarneit & Hoppers Crossing',
      body: 'Groups meet through the week across Wyndham Vale, Werribee, Tarneit ' +
            '& Hoppers Crossing. To find out more about our life groups, please ' +
            'connect to Val and/or Ephraim.',
      imageUrl: img + 'life-groups.jpg',
      imageAlt: 'WynLife Life Groups',
      linkLabel: 'Find a group',
      linkUrl: SITE + '/gatherings/#life-groups'
    });

    c.announcements[2] = merge(c.announcements[2], {
      enabled: true,
      label: 'Fellowship Lunch',
      contentsLabel: 'Fellowship Lunch',
      title: 'First Sunday of the month',
      body: 'First Sunday of the month, after the service. Invite a friend and bring ' +
            'a plate to share.',
      imageUrl: img + 'fellowship-lunch.jpg',
      imageAlt: 'Fellowship Lunch — invite a friend, bring a plate to share',
      linkLabel: 'Learn more',
      linkUrl: SITE + '/whats-on/#fellowship-lunch'
    });

    c.announcements[3] = merge(c.announcements[3], {
      enabled: true,
      label: 'Food Bank Manor Lakes',
      contentsLabel: 'Food Bank Manor Lakes',
      title: 'Expressing God’s grace and love, one life at a time – through ' +
             'long life groceries.',
      body: 'If you are able to give toiletries and financial support to cover the ' +
            'operational costs—truck rental, petrol, and food—it will be ' +
            'greatly appreciated!\n\n' +
            'Donations of $2+ are now tax deductible. Please contact PYNQI for your ' +
            'invoice. RJC Ministry Centre Inc | BSB: 062339 | A#10696497',
      imageUrl: img + 'food-bank.jpg',
      imageAlt: 'Food Bank Manor Lakes — 2nd and 4th Wednesdays, 12PM–1:15PM, ' +
                '86 Manor Lakes Blvd, Manor Lakes VIC 3024',
      details: [
        { k: 'Term 3 dates', v: 'July 22 · Aug 12, 26 · Sept 9' },
        { k: 'Term 4 dates', v: 'Oct 14, 28 · Nov 11, 25 · Dec 9' },
        { k: 'When', v: '2nd & 4th Wednesdays of the month except school holidays ' +
                        '· 12PM–1:15PM' },
        { k: 'Where', v: '86 Manor Lakes Blvd, Manor Lakes VIC 3024' },
        { k: 'Registration', v: 'Required from 10AM at the reception. Priority for ' +
                                'those with a concession card. First come, first ' +
                                'served. Bring own shopping bag.' }
      ],
      quote: 'A generous soul will prosper, and he who refreshes others will himself ' +
             'be refreshed.',
      quoteRef: 'Prov. 11:25 BSB'
    });

    /* The fifth slot is left free for whatever is on that week — an
       anniversary, a working bee, a guest speaker. */
    c.announcements[4] = merge(c.announcements[4], { enabled: false });

    return c;
  }

  /** Fills in anything a stored issue is missing, so old issues still render. */
  function normalise(content) {
    var base = blank();
    var c = content || {};
    var out = {
      design: RENDERERS[c.design] ? c.design : 'classic',
      subject: c.subject || '',
      preheader: c.preheader || '',
      issueDate: c.issueDate || '',
      announcementsLabel: c.announcementsLabel || base.announcementsLabel,
      header:    merge(base.header,    c.header),
      sermon:    merge(base.sermon,    c.sermon),
      giving:    merge(base.giving,    c.giving),
      childSafe: merge(base.childSafe, c.childSafe),
      footer:    merge(base.footer,    c.footer)
    };
    out.announcements = base.announcements.map(function (slot, i) {
      return merge(slot, (c.announcements || [])[i]);
    });
    return out;
  }

  function merge(base, patch) {
    var out = {};
    Object.keys(base).forEach(function (key) { out[key] = base[key]; });
    Object.keys(patch || {}).forEach(function (key) {
      if (patch[key] !== undefined) out[key] = patch[key];
    });
    return out;
  }

  function render(content) {
    var c = normalise(content);
    return RENDERERS[c.design](c);
  }

  /** The same HTML, but safe to drop into a preview iframe. */
  function preview(content) {
    return render(content)
      .split(UNSUB).join(SITE + '/')
      .replace(/\{\{FIRST_NAME\}\}/g, 'Friend')
      .replace(/\{\{EMAIL\}\}/g, 'you@example.com');
  }

  /** A plain-text fallback, for clients that refuse HTML. */
  function plainText(content) {
    var c = normalise(content);
    var lines = [];
    function push(label, text) {
      if (!has(text)) return;
      if (label) lines.push(label.toUpperCase());
      lines.push(String(text).replace(/\s*\n\s*/g, '\n'));
      lines.push('');
    }
    push('', c.header.kicker.replace(/\n/g, ' '));
    push(c.sermon.kicker, [c.sermon.title, c.sermon.reference, c.sermon.body]
      .filter(has).join('\n'));
    liveSections(c).forEach(function (item) {
      push(item.label || item.title, [item.title, item.body,
        (item.details || []).map(function (d) { return d.k + ': ' + d.v; }).join('\n'),
        item.quote ? '"' + item.quote + '" ' + (item.quoteRef || '') : '',
        item.linkUrl ? (item.linkLabel || 'More') + ': ' + item.linkUrl : ''
      ].filter(has).join('\n'));
    });
    if (c.giving.enabled !== false) {
      push(c.giving.label, [c.giving.intro,
        (c.giving.rows || []).map(function (d) { return d.k + ': ' + d.v; }).join('\n'),
        c.giving.note].filter(has).join('\n'));
    }
    if (c.childSafe.enabled !== false) push(c.childSafe.label, c.childSafe.body);
    push('', c.footer.orgName + '\n' + c.footer.address);
    push('', c.footer.legal + '\nUnsubscribe: ' + UNSUB);
    return lines.join('\n');
  }

  return {
    DESIGNS: DESIGNS,
    SITE: SITE,
    UNSUB_PLACEHOLDER: UNSUB,
    blank: blank,
    sample: sample,
    normalise: normalise,
    render: render,
    preview: preview,
    plainText: plainText
  };

}());
