/* site-content.js — WynLife Church Management App
   ---------------------------------------------------------------------------
   The parts of the public website that moderators edit from /admin/:

     Home           the Our Gatherings and What's On cards. The Sunday School
                    panel is drawn from the Gatherings page's Sunday School
                    section, so it is only ever edited there.
     Gatherings     the banner and every section
     Church Online  the latest livestream
     What's On      the banner, every section and the announcements

   Each of those lives in its page between a pair of comments:

     <!-- cms:gatherings-sections · managed in /admin/ -->
     …generated HTML…
     <!-- /cms:gatherings-sections -->

   Publishing renders the HTML for every region here, in the browser, and
   hands it to the Apps Script (Website.gs), which writes it into those files
   on GitHub. The console's preview uses the same renderers, so there is one
   copy of each design — change it here and both follow.
   --------------------------------------------------------------------------- */

window.WynSite = (function () {

  var SITE = 'https://www.wynlife.com.au';

  var PAGES = [
    { key: 'home',       label: 'Home Page',     path: '/',               file: 'index.html' },
    { key: 'gatherings', label: 'Gatherings',    path: '/gatherings/',    file: 'gatherings.html' },
    { key: 'online',     label: 'Church Online', path: '/church-online/', file: 'church-online.html' },
    { key: 'whatson',    label: 'What’s On', path: '/whats-on/',      file: 'whats-on.html' }
  ];

  /* Every region the console writes, and the pages whose content it is drawn
     from. The menu and footer regions sit in every page that has a menu or
     footer. Keep the names in step with WEB_REGIONS in Website.gs. */
  var REGIONS = {
    'home-gatherings':     ['home'],
    'home-sunday-school':  ['gatherings'],
    'home-whats-on':       ['home'],
    'gatherings-hero':     ['gatherings'],
    'gatherings-subnav':   ['gatherings'],
    'gatherings-sections': ['gatherings'],
    'online-player':       ['online'],
    'online-watch-link':   ['online'],
    'whatson-hero':        ['whatson'],
    'whatson-subnav':      ['whatson'],
    'whatson-sections':    ['whatson'],
    'menu-gatherings':     ['gatherings'],
    'menu-whatson':        ['whatson'],
    'footer-gatherings':   ['gatherings']
  };

  /* The icons offered for a details row. The value is what is stored; it is
     written into the page as a numeric entity, like the hand-made pages. */
  var ICONS = [
    { value: '🕐', label: 'Clock' },
    { value: '🕖', label: 'Evening' },
    { value: '📅', label: 'Calendar' },
    { value: '📍', label: 'Location' },
    { value: '👤', label: 'Person' },
    { value: '👥', label: 'People' },
    { value: '📖', label: 'Book' },
    { value: '🍳', label: 'Food' },
    { value: '☕', label: 'Coffee' },
    { value: '🎒', label: 'Bring' },
    { value: 'ℹ', label: 'Information' },
    { value: '🙏', label: 'Prayer' },
    { value: '🎵', label: 'Music' },
    { value: '🧒', label: 'Children' },
    { value: '🎉', label: 'Celebration' },
    { value: '🚗', label: 'Car / parking' },
    { value: '💲', label: 'Cost' },
    { value: '📞', label: 'Phone' },
    { value: '✉', label: 'Email' },
    { value: '🔗', label: 'Link' },
    { value: '🌏', label: 'World' }
  ];

  /* ── Small helpers ───────────────────────────────────────────────────── */

  function has(value) {
    return !!(value && String(value).trim());
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  /** Text between tags. Apostrophes and quotes need no escaping there. */
  function escText(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** A double-quoted attribute value. */
  function escAttr(value) {
    return escText(value).replace(/"/g, '&quot;');
  }

  /** Visible items only — anything switched off stays in the draft. */
  function live(list) {
    return (list || []).filter(function (item) { return item && item.visible !== false; });
  }

  /** Splits text into paragraphs on blank lines. */
  function paragraphs(text) {
    return String(text || '').split(/\r?\n\s*\r?\n/)
      .map(function (part) { return part.trim(); })
      .filter(function (part) { return part.length > 0; });
  }

  /** 'Food Bank — Manor Lakes' -> 'food-bank-manor-lakes', for section anchors. */
  function slug(text) {
    return String(text || '').toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'section';
  }

  /* ── Links and pictures ──────────────────────────────────────────────
     Anything a moderator types into a link or picture field ends up in an
     href or src on the public site, so only addresses that cannot run
     script get through. A bare "www.example.com" is given its https://. */

  function safeUrl(url) {
    var u = String(url || '').trim();
    if (!u) return '';
    if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u;
    if (/^\/(?!\/)/.test(u)) return u;
    if (/^#[A-Za-z0-9_-]+$/.test(u)) return u;
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(u)) return 'https://' + u;
    return '';
  }

  /** Pictures must come from this site or over https — never http, never data:. */
  function safeImage(url) {
    var u = String(url || '').trim();
    if (/^https:\/\/\S+$/i.test(u)) return u;
    if (/^\/(?!\/)\S+$/.test(u)) return u;
    return '';
  }

  function isExternal(url) {
    return /^https?:\/\//i.test(url) && !/^https?:\/\/(www\.)?wynlife\.com\.au(\/|$)/i.test(url);
  }

  function linkAttrs(href, cls) {
    var attrs = { href: href };
    if (isExternal(href)) {
      attrs.target = '_blank';
      attrs.rel = 'noopener';
    }
    if (cls) attrs['class'] = cls;
    return attrs;
  }

  /* ── Words ─────────────────────────────────────────────────────────────
     Moderators write plain text with three bits of shorthand:
       **bold**   *italic*   [link text](https://…)
     Everything else is escaped, and a single line break stays a <br>.   */

  function emphasis(html) {
    return html
      .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  }

  /**
   * One paragraph of shorthand as HTML. Pass links: false where the text
   * already sits inside a link (a whole-card link), since a link inside a
   * link is not allowed — the words are kept, the link is dropped.
   */
  function inline(text, opts) {
    var src = String(text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    var allowLinks = !opts || opts.links !== false;
    var re = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(src))) {
      out += emphasis(escText(src.slice(last, m.index)));
      var label = emphasis(escText(m[1]));
      var href = allowLinks ? safeUrl(m[2]) : '';
      if (href) {
        var attrs = linkAttrs(href);
        out += '<a href="' + escAttr(href) + '"' +
          (attrs.target ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
      } else {
        out += label;
      }
      last = re.lastIndex;
    }
    out += emphasis(escText(src.slice(last)));
    return out.replace(/\r?\n/g, '<br>');
  }

  /** The words of a link written in shorthand, without the link. */
  function plain(text) {
    return String(text || '').replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
      .replace(/\*\*([^*\n]+?)\*\*/g, '$1').replace(/\*([^*\n]+?)\*/g, '$1');
  }

  function iconHtml(icon) {
    var out = '';
    var text = String(icon || '');
    for (var i = 0; i < text.length; i++) {
      var code = text.codePointAt(i);
      if (code > 0xFFFF) i++;
      out += code > 127 ? '&#' + code + ';' : escText(text.charAt(i));
    }
    return out;
  }

  /* ── A small HTML builder ────────────────────────────────────────────
     The regions are written into hand-maintained files, so they are printed
     the way a person would write them: two-space indents, one element per
     line, short text elements kept on their own line. An element stays on
     one line when it holds only text, or a single inline element (an <img>
     in its frame, a link in a list item).                               */

  var VOID = { img: true, hr: true, br: true };
  var INLINE = { a: true, img: true, span: true, strong: true, em: true, br: true };

  var GAP = { gap: true };

  function el(tag, attrs, kids) {
    return { tag: tag, attrs: attrs || {}, kids: flatten(kids) };
  }

  /** Already-escaped HTML. */
  function raw(html) {
    return { raw: String(html) };
  }

  /** Forces an element onto one line, as the hand-made info rows are. */
  function oneLine(node) {
    node.oneLine = true;
    return node;
  }

  function flatten(kids) {
    var out = [];
    (Array.isArray(kids) ? kids : [kids]).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false || kid === '') return;
      if (Array.isArray(kid)) { out = out.concat(flatten(kid)); return; }
      out.push(typeof kid === 'string' ? { text: kid } : kid);
    });
    return out;
  }

  function openTag(node) {
    var attrs = Object.keys(node.attrs).filter(function (key) {
      var v = node.attrs[key];
      return v !== null && v !== undefined && v !== false;
    }).map(function (key) {
      return key + '="' + escAttr(node.attrs[key]) + '"';
    });
    return '<' + node.tag + (attrs.length ? ' ' + attrs.join(' ') : '') + '>';
  }

  function isText(node) {
    return node.text !== undefined || node.raw !== undefined;
  }

  function isInline(node) {
    if (isText(node)) return true;
    if (node.gap) return false;
    return !!INLINE[node.tag] && node.kids.every(isInline);
  }

  function inlineHtml(node) {
    if (node.text !== undefined) return escText(node.text);
    if (node.raw !== undefined) return node.raw;
    if (VOID[node.tag]) return openTag(node);
    return openTag(node) + node.kids.map(inlineHtml).join('') + '</' + node.tag + '>';
  }

  function fitsOnOneLine(node) {
    if (node.oneLine) return true;
    var elements = node.kids.filter(function (kid) { return !isText(kid); });
    if (!elements.length) return true;
    return elements.length === 1 && node.kids.length === 1 && isInline(elements[0]);
  }

  function lines(node, depth, out) {
    var pad = new Array(depth + 1).join('  ');
    if (node.gap) { out.push(''); return; }
    if (isText(node) || VOID[node.tag] || fitsOnOneLine(node)) {
      out.push(pad + inlineHtml(node));
      return;
    }
    out.push(pad + openTag(node));
    node.kids.forEach(function (kid) { lines(kid, depth + 1, out); });
    out.push(pad + '</' + node.tag + '>');
  }

  function print(nodes) {
    var out = [];
    flatten(nodes).forEach(function (node) { lines(node, 0, out); });
    return out.join('\n');
  }

  /** Puts a blank line between blocks, as the hand-made pages do. */
  function spaced(blocks) {
    var out = [];
    flatten(blocks).forEach(function (block, i) {
      if (i) out.push(GAP);
      out.push(block);
    });
    return out;
  }

  /* ── Pieces shared by several regions ────────────────────────────────── */

  function bodyParas(text, firstClass, nextClass) {
    return paragraphs(text).map(function (para, i) {
      return el('p', { 'class': i ? nextClass : firstClass }, raw(inline(para)));
    });
  }

  /** The navy "Details" box: an icon, a label and a value per row. */
  function detailsBox(title, rows, cls) {
    var list = (rows || []).filter(function (row) {
      return row && (has(row.label) || has(row.value));
    });
    if (!list.length) return null;
    return el('div', { 'class': cls }, [
      has(title) ? el('h3', null, title) : null,
      list.map(function (row) {
        return el('div', { 'class': 'info-row' }, [
          el('span', { 'class': 'info-icon' }, raw(iconHtml(row.icon))),
          oneLine(el('div', null, [
            el('div', { 'class': 'info-label' }, row.label || ''),
            el('div', { 'class': 'info-value' }, raw(inline(row.value)))
          ]))
        ]);
      })
    ]);
  }

  function buttonEl(button, spacing) {
    var href = safeUrl(button.url);
    var attrs = linkAttrs(href, 'btn ' + (button.style === 'outline' ? 'btn-outline' : 'btn-primary') +
      (spacing ? ' ' + spacing : ''));
    if (spacing) attrs.style = 'display:inline-block;';
    return el('a', attrs, button.label);
  }

  /** One button on its own, or a row of them that wraps on a phone. */
  function buttonsBlock(list, spacing) {
    var buttons = (list || []).filter(function (b) {
      return b && has(b.label) && safeUrl(b.url);
    });
    if (!buttons.length) return null;
    if (buttons.length === 1) return buttonEl(buttons[0], spacing);
    return el('div', { 'class': 'btn-row ' + spacing, style: 'display:flex;gap:14px;flex-wrap:wrap;' },
      buttons.map(function (b) { return buttonEl(b, ''); }));
  }

  function picture(src, alt, cls, lazy, style) {
    var url = safeImage(src);
    if (!url) return null;
    return el('img', { src: url, alt: alt || '', 'class': cls, style: style || null,
                       loading: lazy ? 'lazy' : null });
  }

  /** A row of two or three photos under a section, like Life Groups. */
  function gallery(list) {
    var photos = (list || []).filter(function (g) { return g && safeImage(g.image); });
    if (!photos.length) return null;
    if (photos.length === 1) {
      return el('div', { 'class': 'mt-32' }, picture(photos[0].image, photos[0].imageAlt, 'photo-full'));
    }
    return el('div', { 'class': (photos.length === 2 ? 'photo-grid-2' : 'photo-grid-3') + ' mt-32' },
      photos.map(function (g) {
        return picture(g.image, g.imageAlt, null, false,
                       'height:260px;object-fit:cover;border-radius:4px;');
      }));
  }

  /* ── Page banners and the bar under them ─────────────────────────────── */

  function heroRegion(hero) {
    return print(el('div', { 'class': 'page-hero' }, [
      picture(hero.image, hero.imageAlt),
      el('div', { 'class': 'page-hero-overlay' }),
      el('div', { 'class': 'page-hero-content' }, [
        el('h1', null, hero.title),
        has(hero.subtitle) ? el('p', null, hero.subtitle) : null
      ])
    ]));
  }

  function subnavRegion(sections) {
    var links = live(sections).filter(function (s) { return s.id && has(s.subnav); });
    if (!links.length) return '';
    return print(el('div', { 'class': 'page-subnav' },
      el('div', { 'class': 'page-subnav-inner' }, links.map(function (s) {
        return el('a', { href: '#' + s.id }, s.subnav);
      }))));
  }

  /* ── Sections ──────────────────────────────────────────────────────── */

  function blockClass(s) {
    return 'section-block' + (s.grey ? ' section-bleed-gray' : '');
  }

  /**
   * The workhorse: heading, words, an optional details box and buttons, with
   * a picture beside them. On a wide screen the picture is always on the
   * right; `imageFirst` only puts it above the words on a phone, which is
   * what the existing `img-right` sections do.
   *
   * Section pictures are never lazy-loaded: many are posters with no fixed
   * height, and one arriving late would push a section reached by a menu
   * link (#mens-group) away from the top of the screen.
   */
  function featureSection(s, align) {
    var words = el('div', null, [
      has(s.label) ? el('div', { 'class': 'section-label' }, s.label) : null,
      el('h2', { 'class': 'section-title' }, s.title),
      el('hr', { 'class': 'divider' }),
      bodyParas(s.body, 'section-body', 'section-body mt-16'),
      detailsBox(s.detailsTitle, s.details, 'info-box mt-32'),
      buttonsBlock(s.buttons, 'mt-32')
    ]);
    var image = picture(s.image, s.imageAlt, s.imageFit === 'full' ? 'photo-contain' : 'photo-half');
    var body = words;
    if (image) {
      var frame = el('div', null, image);
      body = el('div', { 'class': 'two-col' + (s.imageFirst ? ' img-right' : ''),
                         style: 'align-items:' + align + ';' },
        s.imageFirst ? [frame, words] : [words, frame]);
    }
    return el('div', { 'class': blockClass(s), id: s.id || null }, [body, gallery(s.gallery)]);
  }

  function photoSection(s) {
    return picture(s.image, s.imageAlt, 'photo-full');
  }

  var SS_H3 = 'font-family:\'Merriweather\',serif;font-size:1.35rem;color:var(--navy);margin-bottom:14px;';
  var SS_P = 'font-size:1rem;color:var(--gray);line-height:1.75;';

  function ssParas(text, lastMargin) {
    var list = paragraphs(text);
    return list.map(function (para, i) {
      return el('p', { style: SS_P + 'margin-bottom:' + (i === list.length - 1 ? lastMargin : 16) + 'px;' },
        raw(inline(para)));
    });
  }

  /** Sunday School: a centred introduction, the curriculum, then this term. */
  function sundaySchoolSection(s) {
    var intro = paragraphs(s.intro);
    var cur = s.curriculum || {};
    var term = s.lessons || {};
    var curImage = picture(cur.image, cur.imageAlt, 'photo-contain');
    var termImage = picture(term.image, term.imageAlt, 'photo-contain');

    var curWords = el('div', null, [
      el('h3', { style: SS_H3 }, cur.title),
      ssParas(cur.body, 28),
      buttonsBlock([{ label: cur.buttonLabel, url: cur.buttonUrl, style: 'primary' }], '')
    ]);
    var termWords = el('div', null, [
      el('h3', { style: SS_H3 }, term.title),
      ssParas(term.body, 20),
      detailsBox(term.detailsTitle, term.details, 'info-box'),
      buttonsBlock([{ label: term.buttonLabel, url: term.buttonUrl, style: term.buttonStyle }], 'mt-32')
    ]);

    return el('div', { 'class': blockClass(s), id: s.id || null }, [
      has(s.label) ? el('div', { 'class': 'section-label text-center' }, s.label) : null,
      el('h2', { 'class': 'section-title text-center' }, s.title),
      el('hr', { 'class': 'divider', style: 'margin:14px auto 24px;' }),
      intro.map(function (para, i) {
        return el('p', { 'class': 'section-body text-center',
                         style: 'margin:0 auto ' + (i === intro.length - 1 ? 48 : 16) + 'px;' },
          raw(inline(para)));
      }),
      GAP,
      curImage
        ? el('div', { 'class': 'two-col', style: 'align-items:center;' }, [curWords, el('div', null, curImage)])
        : curWords,
      GAP,
      termImage
        ? el('div', { 'class': 'two-col img-right mt-48',
                      style: 'align-items:center;padding-top:48px;border-top:1px solid rgba(0,0,0,0.08);' },
            [el('div', null, termImage), termWords])
        : el('div', { 'class': 'mt-48', style: 'padding-top:48px;border-top:1px solid rgba(0,0,0,0.08);' },
            termWords.kids)
    ]);
  }

  var AN_TAG = 'font-size:0.72rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;' +
               'color:var(--blue);margin-bottom:8px;';
  var AN_H3 = 'font-family:\'Merriweather\',serif;font-size:1.5rem;color:var(--navy);' +
              'margin-bottom:14px;line-height:1.3;';
  var AN_P = 'font-size:1rem;color:var(--gray);line-height:1.7;max-width:540px;';
  var AN_SMALL = 'font-size:0.92rem;color:var(--gray);line-height:1.7;margin-top:12px;';
  var AN_RULE = 'padding-top:40px;border-top:1px solid var(--border);';

  /** One notice. The first sits straight under the heading; the rest are ruled off. */
  function announcement(a, first) {
    var words = [
      has(a.tag) ? el('div', { style: AN_TAG }, a.tag) : null,
      el('h3', { style: AN_H3 }, a.title),
      paragraphs(a.body).map(function (para, i) {
        return el('p', { style: AN_P + (i ? 'margin-top:12px;' : '') }, raw(inline(para)));
      }),
      paragraphs(a.small).map(function (para) {
        return el('p', { style: AN_SMALL }, raw(inline(para)));
      }),
      buttonsBlock([{ label: a.buttonLabel, url: a.buttonUrl, style: 'primary' }], 'mt-24')
    ];
    var image = picture(a.image, a.imageAlt, 'photo-contain');
    if (!image) {
      return el('div', { 'class': first ? 'mt-32' : 'mt-48', style: first ? null : AN_RULE }, words);
    }
    var frame = el('div', null, image);
    return first
      ? el('div', { 'class': 'two-col mt-32', style: 'align-items:start;' }, [el('div', null, words), frame])
      : el('div', { 'class': 'two-col img-right mt-48', style: 'align-items:start;' + AN_RULE },
          [frame, el('div', null, words)]);
  }

  function announcementsSection(s) {
    var items = live(s.items);
    var body = items.length
      ? spaced(items.map(function (a, i) { return announcement(a, i === 0); }))
      : [
          has(s.emptyText) ? el('p', { 'class': 'section-body mt-32' }, raw(inline(s.emptyText))) : null,
          buttonsBlock([{ label: s.emptyButtonLabel, url: s.emptyButtonUrl, style: 'primary' }], 'mt-32')
        ];
    return el('div', { 'class': blockClass(s), id: s.id || null }, [
      has(s.label) ? el('div', { 'class': 'section-label' }, s.label) : null,
      el('h2', { 'class': 'section-title' }, s.title),
      el('hr', { 'class': 'divider' }),
      GAP
    ].concat(body));
  }

  /** Every visible section, in order. */
  function sectionsRegion(sections, align) {
    var blocks = live(sections).map(function (s) {
      if (s.type === 'photo') return photoSection(s);
      if (s.type === 'sunday-school') return sundaySchoolSection(s);
      if (s.type === 'announcements') return announcementsSection(s);
      return featureSection(s, align);
    });
    return print(spaced(blocks));
  }

  /* ── Menus and footer ─────────────────────────────────────────────────── */

  function inMenu(sections) {
    return live(sections).filter(function (s) { return s.id && has(s.menu); });
  }

  function menuRegion(path, sections) {
    return print(inMenu(sections).map(function (s) {
      return el('a', { href: path + '#' + s.id }, s.menu);
    }));
  }

  function footerRegion(path, sections) {
    return print(inMenu(sections).map(function (s) {
      return el('li', null, el('a', { href: path + '#' + s.id }, s.menu));
    }));
  }

  /* ── Home page ──────────────────────────────────────────────────────── */

  function cardImage(card, fit) {
    var image = picture(card.image, card.imageAlt, null, true);
    if (!image) return null;
    return el('div', { 'class': fit === 'full' ? 'card-img-contain' : 'card-img' }, image);
  }

  /** Our Gatherings: the whole card is the link. */
  function gatheringCard(card) {
    var href = safeUrl(card.link);
    var body = el('div', { 'class': 'card-body' }, [
      has(card.tag) ? el('div', { 'class': 'card-tag' }, card.tag) : null,
      el('div', { 'class': 'card-title' }, card.title),
      has(card.text) ? el('div', { 'class': 'card-text' }, raw(inline(card.text, { links: false }))) : null,
      href && has(card.linkLabel) ? el('span', { 'class': 'card-link' }, raw(escText(card.linkLabel) + ' &rarr;')) : null
    ]);
    if (!href) return el('div', { 'class': 'card' }, [cardImage(card, 'crop'), body]);
    var attrs = linkAttrs(href, 'card');
    attrs.style = 'text-decoration:none;color:inherit;';
    return el('a', attrs, [cardImage(card, 'crop'), body]);
  }

  /** What's On: a poster or photo, with the link at the foot of the card. */
  function whatsOnCard(card) {
    var href = safeUrl(card.link);
    return el('div', { 'class': 'card' }, [
      cardImage(card, card.imageFit),
      el('div', { 'class': 'card-body' }, [
        has(card.tag) ? el('div', { 'class': 'card-tag' }, card.tag) : null,
        el('div', { 'class': 'card-title' }, card.title),
        has(card.text) ? el('div', { 'class': 'card-text' }, raw(inline(card.text))) : null,
        href && has(card.linkLabel)
          ? el('a', linkAttrs(href, 'card-link'), raw(escText(card.linkLabel) + ' &rarr;'))
          : null
      ])
    ]);
  }

  function homeCardsRegion(block, cardFn) {
    if (block.visible === false) return '';
    var button = safeUrl(block.buttonUrl);
    return print(el('div', { 'class': 'section-block' }, [
      el('div', { 'class': 'text-center mb-32' }, [
        has(block.label) ? el('div', { 'class': 'section-label' }, block.label) : null,
        el('h2', { 'class': 'section-title' }, block.title),
        el('hr', { 'class': 'divider' }),
        bodyParas(block.intro, 'section-body', 'section-body mt-16')
      ]),
      el('div', { 'class': 'card-grid' }, live(block.cards).map(cardFn)),
      button && has(block.buttonLabel)
        ? el('div', { 'class': 'mt-32 text-center' }, el('a', linkAttrs(button, 'btn btn-outline'), block.buttonLabel))
        : null
    ]));
  }

  function sundaySchoolOf(gatherings) {
    return live(gatherings.sections).filter(function (s) { return s.type === 'sunday-school'; })[0] || null;
  }

  /**
   * The home page's Sunday School panel, drawn entirely from the Gatherings
   * page: its introduction, this term's lessons, and both posters. Hide or
   * change the section there and the home page follows.
   */
  function homeSundaySchoolRegion(gatherings) {
    var s = sundaySchoolOf(gatherings);
    if (!s) return '';
    var cur = s.curriculum || {};
    var term = s.lessons || {};
    var words = paragraphs(s.intro).concat(paragraphs(term.body));
    var posters = [
      picture(cur.image, cur.imageAlt, 'photo-contain', false, has(term.image) ? 'margin-bottom:16px;' : null),
      picture(term.image, term.imageAlt, 'photo-contain')
    ];
    var text = el('div', null, [
      has(s.label) ? el('div', { 'class': 'section-label' }, s.label) : null,
      el('h2', { 'class': 'section-title' }, s.title),
      el('hr', { 'class': 'divider' }),
      words.map(function (para, i) {
        return el('p', { 'class': i ? 'section-body mt-16' : 'section-body' }, raw(inline(para)));
      }),
      buttonsBlock([
        { label: 'More About Sunday School', url: '/gatherings/#' + s.id, style: 'primary' },
        { label: 'About the Curriculum', url: cur.buttonUrl, style: 'outline' }
      ], 'mt-32')
    ]);
    var hasPosters = posters.some(function (p) { return !!p; });
    return print(el('div', { 'class': 'section-block section-bleed-gray' },
      hasPosters
        ? el('div', { 'class': 'two-col', style: 'align-items:center;' }, [text, el('div', null, posters)])
        : text));
  }

  /* ── Church Online ──────────────────────────────────────────────────── */

  /** The 11-character video id from any kind of YouTube link, or ''. */
  function youtubeId(url) {
    var u = String(url || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(u)) return u;
    var m = u.match(/(?:youtube\.com\/(?:watch\?(?:\S*?&)?v=|live\/|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i);
    return m ? m[1] : '';
  }

  function onlinePlayerRegion(online) {
    var id = youtubeId(online.videoUrl);
    return print(el('div', {
      'class': 'yt-thumb',
      id: 'ytThumb',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Play the video' + (has(online.caption) ? ': ' + online.caption : ''),
      'data-embed': id ? 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0' : ''
    }, [
      picture(online.image, online.imageAlt),
      el('div', { 'class': 'yt-play' }, el('div', { 'class': 'yt-play-btn' }, raw('&#9654;'))),
      has(online.caption) ? el('div', { 'class': 'yt-label' }, online.caption) : null
    ]));
  }

  function onlineWatchLinkRegion(online) {
    var id = youtubeId(online.videoUrl);
    var href = id ? 'https://www.youtube.com/watch?v=' + id : 'https://www.youtube.com/@wynlifechurch';
    return print(el('a', linkAttrs(href, 'btn btn-outline'), online.buttonLabel || 'Watch Latest Service'));
  }

  /* ── Rendering a whole site ─────────────────────────────────────────── */

  /** Every region, as HTML, for a site made of one content object per page. */
  function render(site) {
    var s = normaliseAll(site);
    var g = s.gatherings;
    var w = s.whatson;
    return {
      'home-gatherings':     homeCardsRegion(s.home.gatherings, gatheringCard),
      'home-sunday-school':  homeSundaySchoolRegion(g),
      'home-whats-on':       homeCardsRegion(s.home.whatsOn, whatsOnCard),
      'gatherings-hero':     heroRegion(g.hero),
      'gatherings-subnav':   subnavRegion(g.sections),
      'gatherings-sections': sectionsRegion(g.sections, 'center'),
      'online-player':       onlinePlayerRegion(s.online),
      'online-watch-link':   onlineWatchLinkRegion(s.online),
      'whatson-hero':        heroRegion(w.hero),
      'whatson-subnav':      subnavRegion(w.sections),
      'whatson-sections':    sectionsRegion(w.sections, 'start'),
      'menu-gatherings':     menuRegion('/gatherings/', g.sections),
      'menu-whatson':        menuRegion('/whats-on/', w.sections),
      'footer-gatherings':   footerRegion('/gatherings/', g.sections)
    };
  }

  /* ── Blank pieces, for "Add" buttons and for filling in old drafts ──── */

  function blankDetail(icon, label, value) {
    return { icon: icon || '📅', label: label || '', value: value || '' };
  }

  function blankButton(label, url, style) {
    return { label: label || '', url: url || '', style: style || 'primary' };
  }

  function blankFeature() {
    return {
      type: 'feature', id: '', visible: true, grey: false, imageFirst: false,
      subnav: '', menu: '',
      label: '', title: '', body: '',
      detailsTitle: 'Details', details: [],
      buttons: [],
      image: '', imageAlt: '', imageFit: 'crop',
      gallery: []
    };
  }

  function blankPhoto() {
    return { type: 'photo', id: '', visible: true, image: '', imageAlt: '' };
  }

  function blankSundaySchool() {
    return {
      type: 'sunday-school', id: 'sunday-school', visible: true, grey: true,
      subnav: 'Sunday School', menu: 'Sunday School',
      label: '', title: 'Sunday School', intro: '',
      curriculum: { title: '', body: '', buttonLabel: '', buttonUrl: '', image: '', imageAlt: '' },
      lessons: { title: '', body: '', image: '', imageAlt: '', detailsTitle: 'Details', details: [],
                 buttonLabel: '', buttonUrl: '', buttonStyle: 'outline' }
    };
  }

  function blankAnnouncements() {
    return {
      type: 'announcements', id: 'announcements', visible: true, grey: false,
      subnav: 'Announcements', menu: 'Other Announcements',
      label: 'Notices & Events', title: 'Other Announcements',
      items: [],
      emptyText: 'There are no special announcements at the moment. Please check the weekly ' +
                 'bulletin on Sundays, or take a look at the gatherings and events listed above.',
      emptyButtonLabel: 'See Our Gatherings', emptyButtonUrl: '/gatherings/'
    };
  }

  function blankAnnouncement() {
    return { visible: true, tag: '', title: '', body: '', small: '', image: '', imageAlt: '',
             buttonLabel: '', buttonUrl: '' };
  }

  function blankGalleryPhoto() {
    return { image: '', imageAlt: '' };
  }

  function blankCard(fit) {
    return { visible: true, image: '', imageAlt: '', imageFit: fit || 'crop', tag: '', title: '',
             text: '', linkLabel: 'Learn more', link: '' };
  }

  function blankSection(type) {
    if (type === 'photo') return blankPhoto();
    if (type === 'sunday-school') return blankSundaySchool();
    if (type === 'announcements') return blankAnnouncements();
    return blankFeature();
  }

  /* ── What the site says today ─────────────────────────────────────────
     Until a page is first published from the console, its content is this:
     a faithful copy of the hand-made page, so the first publish changes
     nothing a visitor can see.                                          */

  var CLOCK = '🕐';
  var EVENING = '🕖';
  var CALENDAR = '📅';
  var PIN = '📍';
  var PERSON = '👤';
  var PEOPLE = '👥';
  var BOOK = '📖';
  var FOOD = '🍳';
  var BAG = '🎒';
  var INFO = 'ℹ';

  function feature(fields) {
    return merge(blankFeature(), fields);
  }

  function defaults() {
    var curriculumUrl = 'https://gracecurriculum.org/pages/about-generations-of-grace';
    return {
      home: {
        gatherings: {
          visible: true,
          label: 'Come Together',
          title: 'Our Gatherings',
          intro: 'We cherish every opportunity to come together — forging connections that go ' +
                 'beyond mere attendance.',
          cards: [
            merge(blankCard('crop'), {
              image: '/assets/gatherings/wednesday_prayer.png', imageAlt: 'Wednesday Night Prayer',
              tag: 'Wednesdays · 7:00 PM', title: 'Wednesday Night Prayer',
              text: 'Corporate prayer and worship every Wednesday evening as a church family.',
              link: '/gatherings/#wednesday-prayer'
            }),
            merge(blankCard('crop'), {
              image: '/assets/gatherings/life_groups.png', imageAlt: 'Life Groups',
              tag: 'Weeknights · Various Locations', title: 'Life Groups',
              text: 'Small groups across Wyndham Vale, Werribee, Tarneit & Hoppers Crossing.',
              link: '/gatherings/#life-groups'
            }),
            merge(blankCard('crop'), {
              image: '/assets/gatherings/mens_group_1.JPG', imageAlt: 'Men\'s Group',
              tag: 'Men\'s & Women\'s Ministry', title: 'Men\'s & Women\'s Groups',
              text: 'Dedicated communities for men and women to grow together in faith and life.',
              link: '/gatherings/#mens-group'
            })
          ],
          buttonLabel: 'See All Gatherings',
          buttonUrl: '/gatherings/'
        },
        whatsOn: {
          visible: true,
          label: 'Stay Updated',
          title: 'What\'s On',
          intro: 'From community events to important announcements — here\'s what\'s happening at ' +
                 'WynLife right now.',
          cards: [
            merge(blankCard('full'), {
              image: '/assets/church-online/hero.JPG', imageAlt: 'Church Online',
              tag: '🎬 Watch Online', title: 'Church Online',
              text: 'Join us for Sunday services and events online. Watch live or catch up on past ' +
                    'sermons from the comfort of your home.',
              linkLabel: 'Watch Now', link: '/church-online/'
            }),
            merge(blankCard('crop'), {
              image: '/assets/gatherings/life_group_1.JPG', imageAlt: 'Life Group',
              tag: '🤝 Get Connected', title: 'Join a Life Group',
              text: 'Life Groups meet through the week across Wyndham Vale, Werribee, Tarneit & ' +
                    'Hoppers Crossing to study the Bible, pray, and share life together. There\'s a ' +
                    'group for you.',
              link: '/gatherings/#life-groups'
            }),
            merge(blankCard('full'), {
              image: '/assets/whats-on/fellowship_lunch.jpg', imageAlt: 'Fellowship Lunch',
              tag: '🍳 Monthly Gathering', title: 'Fellowship Lunch',
              text: 'Join us for our monthly Fellowship Lunch — a time to share a meal, build ' +
                    'friendships, and enjoy community together after Sunday service.',
              link: '/whats-on/#fellowship-lunch'
            })
          ],
          buttonLabel: 'See All Announcements',
          buttonUrl: '/whats-on/'
        }
      },

      gatherings: {
        hero: {
          image: '/assets/gatherings/hero.JPG', imageAlt: 'WynLife Gatherings',
          title: 'Gatherings',
          subtitle: 'Each of our gatherings is an opportunity for community and to keep pace with Jesus.'
        },
        sections: [
          feature({
            id: 'sunday', subnav: 'Sunday Service',
            label: 'Every Week', title: 'Sunday Service',
            body: 'Sunday gatherings are the primary way we come together as a church — to worship, ' +
                  'learn from Scripture, pray for one another, and create space to hear from God. ' +
                  '**Everyone is welcome.**',
            detailsTitle: 'Service Details',
            details: [
              blankDetail(CLOCK, 'Time', 'Sundays 10:00 AM – 12:00 PM'),
              blankDetail(PIN, 'Location', '208 Ballan Rd, Wyndham Vale VIC 3024 — enter from Ballan Rd')
            ],
            buttons: [blankButton('Plan My Visit', '/visit/')],
            image: '/assets/gatherings/sunday_service.JPG', imageAlt: 'Sunday Service'
          }),
          merge(blankPhoto(), {
            image: '/assets/gatherings/sunday_worship_wide.JPG', imageAlt: 'Sunday Worship'
          }),
          feature({
            id: 'wednesday-prayer', subnav: 'Wednesday Prayer', menu: 'Wednesday Night Prayer',
            imageFirst: true,
            label: 'Midweek', title: 'Wednesday Night Prayer',
            body: 'Join us every Wednesday evening for corporate prayer, worship, and seeking God ' +
                  'together as a church family. This is a powerful time of prayer where we intercede ' +
                  'for one another, our community, and the world.',
            details: [
              blankDetail(EVENING, 'Time', 'Wednesdays 7:00 PM'),
              blankDetail(PIN, 'Location', 'WynLife Centre, 208 Ballan Rd, Wyndham Vale')
            ],
            image: '/assets/gatherings/wednesday_prayer.png', imageAlt: 'Wednesday Night Prayer'
          }),
          feature({
            id: 'life-groups', subnav: 'Life Groups', menu: 'Life Groups', grey: true,
            label: 'Small Groups', title: 'Life Groups',
            body: 'Life Groups are the heartbeat of community at WynLife. These small groups meet ' +
                  'across our local area to study the Bible, pray together, share life, and support ' +
                  'one another.\n\n' +
                  '**Locations:** Wyndham Vale, Werribee, Tarneit & Hoppers Crossing',
            details: [],
            buttons: [blankButton('Join a Life Group', '/pray/')],
            image: '/assets/gatherings/life_groups.png', imageAlt: 'Life Groups',
            gallery: [
              { image: '/assets/gatherings/life_group_1.JPG', imageAlt: 'Life Group' },
              { image: '/assets/gatherings/life_group_2.JPG', imageAlt: 'Life Group' },
              { image: '/assets/gatherings/life_group_3.JPG', imageAlt: 'Life Group' }
            ]
          }),
          feature({
            id: 'youth', subnav: 'Youth Sunday', menu: 'Youth Sunday', imageFirst: true,
            label: 'Young People', title: 'Youth Sunday',
            body: 'A dynamic, engaging space for young people to encounter God, build lasting ' +
                  'friendships, and grow in their faith. Our youth program provides age-appropriate ' +
                  'teaching and community for our Wynners.',
            details: [
              blankDetail(CLOCK, 'Time', '1:30 PM — please refer to the weekly bulletin for dates'),
              blankDetail(BAG, 'Wynners Bring', 'Bible, pen, runners'),
              blankDetail(PIN, 'Location', '208 Ballan Rd, Wyndham Vale')
            ],
            image: '/assets/gatherings/youth_sunday.png', imageAlt: 'Youth Sunday', imageFit: 'full'
          }),
          merge(blankSundaySchool(), {
            label: 'Children\'s Ministry', title: 'Sunday School',
            intro: 'WynLife runs a Sunday School program for children during the Sunday service, built ' +
                   'on the [**Generations of Grace**](' + curriculumUrl + ') curriculum — a ' +
                   'Christ-centred Bible narrative program that teaches children God\'s redemptive ' +
                   'plan from Genesis to Revelation.',
            curriculum: {
              title: 'Generations of Grace Curriculum',
              body: 'The Generations of Grace Sunday school curriculum teaches God\'s redemptive plan ' +
                    'through Bible narrative. Children learn the grand story of Scripture — who ' +
                    'God is, what He has done, and how Jesus is at the centre of it all.\n\n' +
                    'Each lesson is designed to be age-appropriate, engaging, and rooted in the truth ' +
                    'of God\'s Word. Parents can feel confident their children are receiving solid ' +
                    'Biblical teaching week after week.',
              buttonLabel: 'Learn About the Curriculum',
              buttonUrl: curriculumUrl,
              image: '/assets/gatherings/sunday_school_curriculum.PNG',
              imageAlt: 'Generations of Grace Curriculum'
            },
            lessons: {
              title: 'Term 3 Lessons',
              body: 'This term our children are working through the life and ministry of Jesus — ' +
                    'from His parables and miracles through to His teaching on discipleship and the ' +
                    'cost of following Him.',
              image: '/assets/gatherings/sunday_school_lessons.PNG',
              imageAlt: 'Sunday School Term 3 Lessons',
              detailsTitle: 'Sunday School Details',
              details: [
                blankDetail(CLOCK, 'Time', 'Sundays 10:00 AM (runs during the service)'),
                blankDetail(PERSON, 'Who', 'Children of all ages — drop off at the end of praise ' +
                                           'and worship'),
                blankDetail(PIN, 'Location', '208 Ballan Rd, Wyndham Vale VIC 3024')
              ],
              buttonLabel: 'Get In Touch',
              buttonUrl: '/pray/',
              buttonStyle: 'outline'
            }
          }),
          feature({
            id: 'mens-group', subnav: 'Men\'s Group', menu: 'Men\'s Group', imageFirst: true,
            label: 'Men\'s Ministry', title: 'Men\'s Group',
            body: 'Brotherhood, accountability, and growing together as men of faith. Our men\'s ' +
                  'gatherings are a place to be real, be challenged, and be encouraged.\n\n' +
                  'We\'re currently working through *Disciplines of a Godly Man* together over lunch ' +
                  'after the Sunday service.',
            details: [
              blankDetail(CALENDAR, 'When', 'Every 4th Sunday, 12:30 PM'),
              blankDetail(PIN, 'Location', '208 Ballan Rd, Wyndham Vale'),
              blankDetail(PERSON, 'Contact', 'Andrew & Danny')
            ],
            buttons: [blankButton('Get Involved', '/pray/')],
            image: '/assets/gatherings/mens_fellowship.png',
            imageAlt: 'Men\'s Fellowship — every 4th Sunday, 12:30 PM', imageFit: 'full'
          }),
          feature({
            id: 'womens-group', subnav: 'Women\'s Group', menu: 'Women\'s Group', grey: true,
            label: 'Women\'s Ministry', title: 'Women\'s Group',
            body: 'A community of women encouraging, equipping, and empowering each other in life and ' +
                  'faith. Our women\'s gatherings provide a safe and welcoming space to grow, share, ' +
                  'and be strengthened in Christ.',
            details: [],
            buttons: [blankButton('Get Involved', '/pray/')],
            image: '/assets/gatherings/womens_group.JPG', imageAlt: 'Women\'s Group'
          })
        ]
      },

      online: {
        videoUrl: 'https://www.youtube.com/live/SJ-hWTh7Lnc',
        caption: 'WynLife Church — Watch on YouTube',
        image: '/assets/church-online/hero.JPG',
        imageAlt: 'Watch WynLife Church',
        buttonLabel: 'Watch Latest Service'
      },

      whatson: {
        hero: {
          image: '/assets/whats-on/hero.JPG', imageAlt: 'What\'s On at WynLife',
          title: 'What\'s On',
          subtitle: 'Events, announcements, and everything happening at WynLife right now.'
        },
        sections: [
          feature({
            id: 'bible-reading', subnav: 'Bible Reading', menu: 'This Week\'s Bible Reading',
            label: 'Weekly Reading', title: 'This Week\'s Bible Reading',
            body: 'Follow along with our weekly reading plan. We\'re currently working through the ' +
                  'Book of Revelation with teaching by J. Vernon McGee — one of the great Bible ' +
                  'teachers of the 20th century.\n\n' +
                  'Scan the QR code on the poster or use the link below to access the reading guide ' +
                  'and study materials.',
            details: [],
            buttons: [blankButton('Access Study Materials', 'https://www.ttb.org/')],
            image: '/assets/whats-on/bible_reading.png', imageAlt: 'This Week\'s Bible Reading',
            imageFit: 'full'
          }),
          feature({
            id: 'food-bank', subnav: 'Food Bank', menu: 'Food Bank', grey: true, imageFirst: true,
            label: 'Community Ministry', title: 'Food Bank — Manor Lakes',
            body: 'WynLife runs a Food Bank as an expression of God\'s love and grace in our community. ' +
                  'We provide free food relief to those in need in the Manor Lakes area.',
            detailsTitle: 'Food Bank Details',
            details: [
              blankDetail(CALENDAR, 'When', '2nd & 4th Wednesdays of the month\n(except school holidays)'),
              blankDetail(CLOCK, 'Time', '12:00 PM – 1:15 PM\n(Registration from 10:00 AM)'),
              blankDetail(PIN, 'Location', '86 Manor Lakes Blvd, Manor Lakes VIC 3024'),
              blankDetail(INFO, 'Notes', 'Priority for concession cardholders. First come, first ' +
                                         'served. Bring your own shopping bag.')
            ],
            image: '/assets/whats-on/food_bank.png', imageAlt: 'WynLife Food Bank', imageFit: 'full'
          }),
          feature({
            id: 'fellowship-lunch', subnav: 'Fellowship Lunch', menu: 'Fellowship Lunch',
            label: 'Monthly Gathering', title: 'Fellowship Lunch',
            body: 'Join us for our monthly Fellowship Lunch — a time to share a meal, build ' +
                  'friendships, and enjoy community together after Sunday service. Everyone is ' +
                  'welcome and encouraged to bring a plate to share!',
            details: [
              blankDetail(CALENDAR, 'When', 'First Sunday of every month'),
              blankDetail(CLOCK, 'Time', 'After the 10:00 AM Sunday service'),
              blankDetail(FOOD, 'What to bring', 'A plate of food to share with the community'),
              blankDetail(PIN, 'Location', '208 Ballan Rd, Wyndham Vale VIC 3024')
            ],
            image: '/assets/whats-on/fellowship_lunch.jpg', imageAlt: 'Fellowship Lunch',
            imageFit: 'full'
          }),
          feature({
            id: 'mens-book-study', subnav: 'Men\'s Book Study', menu: 'Men\'s Book Study',
            grey: true, imageFirst: true,
            label: 'Men\'s Ministry', title: 'Disciplines of a Godly Man',
            body: 'Men — join us for our ongoing book study working through *Disciplines of a ' +
                  'Godly Man* by R. Kent Hughes. This is a practical and challenging study on what it ' +
                  'looks like to live as a man after God\'s own heart.\n\n' +
                  'Sessions are held every fourth Sunday of the month at 12:30 PM. All men are ' +
                  'welcome — no prior reading required to join.',
            details: [
              blankDetail(CALENDAR, 'When', 'Every fourth Sunday of the month'),
              blankDetail(CLOCK, 'Time', '12:30 PM'),
              blankDetail(BOOK, 'Book', 'Disciplines of a Godly Man — R. Kent Hughes')
            ],
            buttons: [blankButton('Get In Touch to Join', '/pray/')],
            image: '/assets/whats-on/mens_book_study.jpg',
            imageAlt: 'Men\'s Book Study — Disciplines of a Godly Man', imageFit: 'full'
          }),
          feature({
            id: 'womens-book-study', subnav: 'Women\'s Book Study', menu: 'Women\'s Book Study',
            label: 'Women\'s Ministry', title: 'Disciplines of a Godly Woman',
            body: 'Ladies — join us for our women\'s book study working through *Disciplines of a ' +
                  'Godly Woman* by Barbara Hughes. A rich and encouraging study for women who want to ' +
                  'deepen their walk with God.\n\n' +
                  'Sessions run every second Sunday of the month. Please see Pynqi or Leng for more ' +
                  'details on upcoming dates and how to join.',
            details: [
              blankDetail(CALENDAR, 'When', 'Every second Sunday of the month'),
              blankDetail(BOOK, 'Book', 'Disciplines of a Godly Woman — Barbara Hughes'),
              blankDetail(PEOPLE, 'Contact', 'See Pynqi or Leng for more details')
            ],
            buttons: [blankButton('Get In Touch to Join', '/pray/')],
            image: '/assets/whats-on/womens_book_study.png',
            imageAlt: 'Women\'s Book Study — Disciplines of a Godly Woman', imageFit: 'full'
          }),
          blankAnnouncements()
        ]
      }
    };
  }

  /* ── Normalising ──────────────────────────────────────────────────────
     A stored draft may predate a field added here later, so everything read
     back is laid over a blank of its own kind. The result is a fresh copy:
     the editor's draft is never changed by rendering it.                */

  function merge(base, patch) {
    var out = {};
    Object.keys(base).forEach(function (key) { out[key] = base[key]; });
    Object.keys(patch || {}).forEach(function (key) {
      if (patch[key] !== undefined) out[key] = patch[key];
    });
    return out;
  }

  function list(items, blank) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      return item && typeof item === 'object';
    }).map(function (item) { return merge(blank(), item); });
  }

  function normaliseSection(s) {
    var out = merge(blankSection(s.type), s);
    if (out.type === 'feature') {
      out.details = list(out.details, blankDetail);
      out.buttons = list(out.buttons, blankButton);
      out.gallery = list(out.gallery, blankGalleryPhoto);
    } else if (out.type === 'sunday-school') {
      var base = blankSundaySchool();
      out.curriculum = merge(base.curriculum, s.curriculum);
      out.lessons = merge(base.lessons, s.lessons);
      out.lessons.details = list(out.lessons.details, blankDetail);
    } else if (out.type === 'announcements') {
      out.items = list(out.items, blankAnnouncement);
    }
    return out;
  }

  var TYPES = { feature: true, photo: true, 'sunday-school': true, announcements: true };

  /**
   * Sections that have never been published take their anchor from their
   * heading, so "Carols Night" becomes #carols-night. Once published the
   * anchor is kept, because menus and other pages link to it.
   */
  function normaliseSections(sections) {
    var out = (Array.isArray(sections) ? sections : []).filter(function (s) {
      return s && TYPES[s.type];
    }).map(normaliseSection);
    var taken = {};
    out.forEach(function (s) { if (s.id && !s.isNew) taken[s.id] = true; });
    out.forEach(function (s) {
      if (s.type === 'photo') { s.id = ''; return; }
      if (!s.isNew && s.id) return;
      var base = slug(s.title || s.subnav || s.type);
      var id = base;
      var n = 2;
      while (taken[id]) id = base + '-' + (n++);
      s.id = id;
      taken[id] = true;
    });
    return out;
  }

  function normaliseBlock(base, block) {
    var out = merge(base, block);
    out.cards = list(block && block.cards ? block.cards : base.cards, blankCard);
    return out;
  }

  /** A complete, fresh copy of one page's content. */
  function normalise(pageKey, content) {
    var base = defaults()[pageKey];
    var c = content ? clone(content) : clone(base);
    if (pageKey === 'home') {
      return {
        gatherings: normaliseBlock(base.gatherings, c.gatherings),
        whatsOn: normaliseBlock(base.whatsOn, c.whatsOn)
      };
    }
    if (pageKey === 'online') return merge(base, c);
    return {
      hero: merge(base.hero, c.hero),
      sections: normaliseSections(c.sections || base.sections)
    };
  }

  function normaliseAll(site) {
    var out = {};
    PAGES.forEach(function (page) {
      out[page.key] = normalise(page.key, site && site[page.key]);
    });
    return out;
  }

  /** Ready to publish: anchors settled, and the "new" marks taken off. */
  function finalise(pageKey, content) {
    var out = normalise(pageKey, content);
    (out.sections || []).forEach(function (s) { delete s.isNew; });
    return out;
  }

  /* ── Checks before publishing ─────────────────────────────────────────
     Errors stop a publish; warnings are shown but do not.              */

  function validate(pageKey, content) {
    var c = normalise(pageKey, content);
    var errors = [];
    var warnings = [];

    function where(name) { return name ? ' (' + name + ')' : ''; }

    function link(value, name) {
      if (has(value) && !safeUrl(value)) {
        errors.push('“' + value + '” is not a link the website can use' + where(name) +
          '. Use a full address starting with https://, or a page on this site starting with /.');
      }
    }

    function image(value, alt, name) {
      if (!has(value)) return;
      if (!safeImage(value)) {
        errors.push('The picture address “' + value + '” cannot be used' + where(name) +
          '. Upload the picture instead, or use an address starting with https://.');
      } else if (!has(alt)) {
        warnings.push('A picture has no description' + where(name) + '. Screen readers and search ' +
          'engines rely on it.');
      }
    }

    function words(text, name) {
      var re = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
      var m;
      while ((m = re.exec(String(text || '')))) link(m[2], name);
    }

    function details(rows, name) {
      (rows || []).forEach(function (row) { words(row.value, name); });
    }

    if (pageKey === 'online') {
      if (!youtubeId(c.videoUrl)) {
        errors.push('Paste the YouTube link of the livestream — for example ' +
                    'https://www.youtube.com/live/… or https://youtu.be/….');
      }
      image(c.image, c.imageAlt, 'player picture');
      return { errors: errors, warnings: warnings };
    }

    if (pageKey === 'home') {
      [['gatherings', 'Our Gatherings'], ['whatsOn', 'What’s On']].forEach(function (pair) {
        var block = c[pair[0]];
        link(block.buttonUrl, pair[1] + ' button');
        live(block.cards).forEach(function (card, i) {
          var name = pair[1] + ' card ' + (i + 1) + (has(card.title) ? ', ' + card.title : '');
          if (!has(card.title)) warnings.push('A card has no heading' + where(name) + '.');
          link(card.link, name);
          image(card.image, card.imageAlt, name);
          words(card.text, name);
        });
      });
      return { errors: errors, warnings: warnings };
    }

    image(c.hero.image, c.hero.imageAlt, 'page banner');
    if (!has(c.hero.title)) errors.push('The page banner needs a heading.');

    live(c.sections).forEach(function (s, i) {
      var name = 'section ' + (i + 1) + (has(s.title) ? ', ' + s.title : '');
      if (s.type === 'photo') {
        if (!has(s.image)) warnings.push('A wide photo section has no picture, so it will not appear.');
        image(s.image, s.imageAlt, name);
        return;
      }
      if (!has(s.title)) errors.push('Every section needs a heading' + where(name) + '.');
      if (s.type === 'feature') {
        words(s.body, name);
        details(s.details, name);
        (s.buttons || []).forEach(function (b) { link(b.url, name); });
        image(s.image, s.imageAlt, name);
        (s.gallery || []).forEach(function (g) { image(g.image, g.imageAlt, name + ', photo row'); });
      } else if (s.type === 'sunday-school') {
        words(s.intro, name);
        words(s.curriculum.body, name);
        words(s.lessons.body, name);
        details(s.lessons.details, name);
        link(s.curriculum.buttonUrl, name);
        link(s.lessons.buttonUrl, name);
        image(s.curriculum.image, s.curriculum.imageAlt, name + ', curriculum');
        image(s.lessons.image, s.lessons.imageAlt, name + ', this term');
      } else if (s.type === 'announcements') {
        words(s.emptyText, name);
        link(s.emptyButtonUrl, name);
        live(s.items).forEach(function (a, j) {
          var item = name + ', notice ' + (j + 1);
          if (!has(a.title)) errors.push('Every announcement needs a heading' + where(item) + '.');
          words(a.body, item);
          words(a.small, item);
          link(a.buttonUrl, item);
          image(a.image, a.imageAlt, item);
        });
      }
    });

    return { errors: errors, warnings: warnings };
  }

  /* ── What changed, in a line, for the publish log ────────────────────── */

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function sectionName(s) {
    if (s.type === 'photo') return 'a wide photo';
    return plain(s.title) || s.id || 'a section';
  }

  function summarise(pageKey, before, after) {
    var a = normalise(pageKey, before);
    var b = normalise(pageKey, after);
    var parts = [];

    if (pageKey === 'online') {
      if (youtubeId(a.videoUrl) !== youtubeId(b.videoUrl)) {
        parts.push('New livestream link (' + (youtubeId(b.videoUrl) || 'none') + ')');
      }
      var rest = merge(a, { videoUrl: '' });
      if (!same(rest, merge(b, { videoUrl: '' }))) parts.push('Player details');
      return parts.join('; ') || 'No changes';
    }

    if (pageKey === 'home') {
      if (!same(a.gatherings, b.gatherings)) parts.push('Our Gatherings cards');
      if (!same(a.whatsOn, b.whatsOn)) parts.push('What’s On cards');
      return parts.length ? 'Changed: ' + parts.join(', ') : 'No changes';
    }

    function key(s, i) { return s.id || ('photo:' + s.image + ':' + i); }
    var oldByKey = {};
    a.sections.forEach(function (s, i) { oldByKey[key(s, i)] = s; });
    var newKeys = {};
    var changed = [];
    var added = [];
    b.sections.forEach(function (s, i) {
      var k = key(s, i);
      newKeys[k] = true;
      if (!oldByKey[k]) added.push(sectionName(s));
      else if (!same(oldByKey[k], s)) changed.push(sectionName(s));
    });
    var removed = a.sections.filter(function (s, i) { return !newKeys[key(s, i)]; }).map(sectionName);
    if (!same(a.hero, b.hero)) changed.unshift('page banner');
    if (changed.length) parts.push('Changed: ' + changed.join(', '));
    if (added.length) parts.push('Added: ' + added.join(', '));
    if (removed.length) parts.push('Removed: ' + removed.join(', '));
    if (!parts.length && !same(a.sections.map(key), b.sections.map(key))) parts.push('Reordered sections');
    return parts.join('; ') || 'No changes';
  }

  /* ── Regions in a live page ───────────────────────────────────────────
     The preview loads the real page and swaps each region's contents in
     place; the publish check reads them back out of the rebuilt page.  */

  function startRe(name) {
    return '<!--\\s*cms:' + name + '(?=\\s|-->)[^>]*-->';
  }

  /** The current contents of a region in a page's HTML, or null. */
  function extract(html, name) {
    var m = new RegExp(startRe(name) + '([\\s\\S]*?)<!--\\s*/cms:' + name + '\\s*-->').exec(html);
    return m ? m[1] : null;
  }

  /** Two pieces of markup that differ only in whitespace. */
  function sameMarkup(a, b) {
    function squash(html) {
      return String(html || '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
    }
    return squash(a) === squash(b);
  }

  /**
   * Replaces the contents of every region in a loaded document. The markers
   * are comment nodes, so whatever sits between a start and its end is
   * swapped out and the markers themselves are left for next time.
   */
  function applyToDocument(doc, regions) {
    var walker = doc.createTreeWalker(doc.body, 128 /* NodeFilter.SHOW_COMMENT */);
    var starts = [];
    while (walker.nextNode()) {
      var m = /^\s*cms:([a-z0-9-]+)/.exec(walker.currentNode.nodeValue);
      if (m && regions.hasOwnProperty(m[1])) starts.push({ node: walker.currentNode, name: m[1] });
    }
    starts.forEach(function (start) {
      var end = new RegExp('^\\s*/cms:' + start.name + '\\s*$');
      var node = start.node.nextSibling;
      while (node && !(node.nodeType === 8 && end.test(node.nodeValue))) {
        var next = node.nextSibling;
        node.parentNode.removeChild(node);
        node = next;
      }
      var range = doc.createRange();
      range.setStartAfter(start.node);
      range.collapse(true);
      var html = '\n' + regions[start.name] + '\n';
      start.node.parentNode.insertBefore(range.createContextualFragment(html), start.node.nextSibling);
    });
    return starts.length;
  }

  return {
    SITE: SITE,
    PAGES: PAGES,
    REGIONS: REGIONS,
    ICONS: ICONS,
    defaults: defaults,
    normalise: normalise,
    normaliseAll: normaliseAll,
    finalise: finalise,
    render: render,
    validate: validate,
    summarise: summarise,
    blankSection: blankSection,
    blankCard: blankCard,
    blankDetail: blankDetail,
    blankButton: blankButton,
    blankAnnouncement: blankAnnouncement,
    blankGalleryPhoto: blankGalleryPhoto,
    youtubeId: youtubeId,
    safeUrl: safeUrl,
    safeImage: safeImage,
    inline: inline,
    plain: plain,
    slug: slug,
    extract: extract,
    sameMarkup: sameMarkup,
    applyToDocument: applyToDocument
  };

}());
