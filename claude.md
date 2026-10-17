# WynLife Church Website Management Guide

This guide provides instructions for updating the WynLife Church website content, focusing on the most commonly updated sections.

## Project Overview

The WynLife Church website is built with:
- Static HTML files. Parts of four pages (Home, Gatherings, Church Online,
  What's On) are edited by moderators in `/admin/` and published into those
  files as plain HTML — see **Website** under the Church Management App below
- CSS styling (style.css)
- JavaScript for interactive elements (nav.js)
- Responsive design that works on mobile and desktop
- Assets stored in the `assets/` directory

## Key Pages and Sections

### 1. Home Page (`index.html`)
The main landing page that includes:
- Hero video section
- Welcome message
- Gathering previews
- Sunday School preview
- Next Steps preview
- What's On preview
- Footer with navigation

### 2. What's On Page (`whats-on.html`)
Contains announcements and events:
- This Week's Bible Reading
- Food Bank details
- Fellowship Lunch information
- Men's Book Study
- Women's Book Study
- Other Announcements (the main section for updates)

### 3. Church Online Page (`church-online.html`)
The page for online services:
- YouTube video player with embedded link
- Information about watching online services
- Links to YouTube channel and Facebook

## How to Update Common Sections

The everyday changes are made in the management app, not in the HTML:

| To change | Go to `/admin/` › |
|---|---|
| The livestream on Church Online | **Website › Church Online** — paste the YouTube link |
| Announcements, events, Food Bank dates, book studies, the Bible reading link | **Website › What's On** |
| Gatherings — times, words, pictures, contacts, the term's Sunday School lessons | **Website › Gatherings** |
| The *Our Gatherings* and *What's On* cards on the home page | **Website › Home Page** |

Each of those places sits in its page between a pair of comments:

```html
<!-- cms:whatson-sections · managed in /admin/ -->
…generated HTML…
<!-- /cms:whatson-sections -->
```

**Do not edit inside a `cms:` region by hand** — the next publish from the
console rewrites the whole region from what is saved in the sheet, and your
edit is lost (the publish log records a warning when it happens). Anything
outside the markers is yours to edit as before. If something inside a region
needs changing:

- **Words, pictures, links, order** — change it in the console and publish.
- **The design** — the markup each region is built from — change the renderer
  in `site-content.js`. It reaches the live pages the next time any page is
  published, because every publish re-renders every region.
- **Defaults** — `defaults()` in `site-content.js` is only what a page starts
  from until it is first published from the console; after that, the sheet is
  the source of truth.

The site menu's *Gatherings* and *What's On* dropdowns (desktop and mobile) and
the footer's *Gatherings* list are `cms:` regions on **every** page, generated
from the sections of those two pages.

## General Update Guidelines

1. **Backup First:** Always backup any files before making changes
2. **Consistent Styling:** Maintain the existing CSS styling and structure
3. **Image Sizes:** Use appropriate image sizes (check existing images for reference)
4. **Testing:** Test changes by viewing the page locally or in browser
5. **Responsive Design:** Ensure updates work on mobile devices
6. **Service times, address, phone or email changed?** Change them everywhere
   they appear, including the structured data (`application/ld+json`) in the
   `<head>` of `index.html`, the meta descriptions, and `visit.html`. Google
   reads those, and a stale value there is what people see in search results.
7. **New page?** Give it its own `<title>`, description, `og:url` and
   `<link rel="canonical">`, and add it to `sitemap.xml`.

## File Structure Overview

```
.
├── index.html              # Home page
├── visit.html              # Your First Sunday — what to expect (/visit/)
├── whats-on.html           # What's On/Announcements page
├── church-online.html      # Church Online page
├── gatherings.html         # Gatherings page
├── next-steps.html         # Next Steps page
├── about.html              # About page
├── pray.html               # Contact/Prayer page
├── style.css               # Main stylesheet
├── nav.js                  # Navigation JavaScript
├── site-content.js         # The editable regions: content model + HTML renderers
└── assets/                 # Media files (images, videos)
    ├── shared/             # Shared images
    ├── whats-on/           # What's On related images  
    ├── church-online/      # Church Online images
    ├── uploads/            # Pictures published from /admin/ › Website, by year
    └── ...                 # Other directories
```

## Deployment Notes

The website is hosted on GitHub Pages from `main`. Updates are made to the HTML
files directly, except inside `cms:` regions (see above). Publishing from
`/admin/` commits to `main` itself, so pull before you push.

## Church Management App (`/admin/`)

A separate, login-protected console lives at `/admin/`, linked from the **About**
dropdown as *Manage*. It is a static single-page app; all data lives in the
Google Sheet **"Wynlife Management App Data Sheet"** and is reached through a
Google Apps Script web app.

| File | Purpose |
|---|---|
| `admin.html` | Console shell (`/admin/`) — nav, topbar, login card, menu + view slots |
| `admin.js` | Views, routing and the menu — Members & Sundays / Newsletter / Website / Settings |
| `admin-api.js` | Shared API client, session handling, date helpers |
| `admin-config.js` | **The one file to edit** — holds the Apps Script `/exec` URL |
| `admin.css` | Console and kiosk styling (uses `style.css` variables) |
| `newsletter-templates.js` | The three email designs — turns one content object into sendable HTML |
| `site-content.js` | The website's editable regions — content defaults and the HTML for each region |
| `sunday-school-checkin.html` / `.js` | Parent-facing sign in / sign out kiosk (no login) |
| `apps-script/Code.gs` | The backend: sheet setup, auth, members, attendance, reports |
| `apps-script/Newsletter.gs` | The newsletter backend: recipients, issues, Brevo, unsubscribe |
| `apps-script/Website.gs` | The website backend: drafts, picture uploads, publishing to GitHub |
| `apps-script/README.md` | One-time setup, sheet layouts, roles, security notes |

The `apps-script` folder is excluded from the Jekyll build, and both new pages
are `noindex` and disallowed in `robots.txt`.

The menu has one group per job — **Members & Sundays**, **Newsletter**,
**Website**, **Settings** — and every screen is a route in `ROUTES` in
`admin.js`, gated by a minimum role or a capability. A screen the signed-in role
cannot open is left out of the menu rather than greyed out, so each person sees
only their own tools.

Roles are `basic` (reports), `planner` (+ members and tracking) and `admin`
(+ user management, the newsletter, the website, and the Brevo and GitHub
settings). Those three stack by rank. Two roles deliberately do not: `email` —
**Email Administrator** — and `moderator` — **Website Moderator** — rank
*below* `basic` and get their screens through the `newsletter` and `website`
capabilities in `ROLE_CAPS`, so each does its one job and touches nothing else.
`ROLE_CAPS` is mirrored in `Code.gs` (which enforces it) and `admin-api.js`
(which only decides what the menu shows) — keep the two in step.

At sign-in at the kiosk the parent chooses their own
4-digit **collection PIN** which they must give back to sign the child out,
and no child can be collected until 15 minutes after sign-in
(`MIN_CARE_MINUTES`); staff can see the PIN on *Members & Sundays > Setup
Sunday School*. Read
`apps-script/README.md` before changing anything here — a schema change there
needs `setup()` re-run on the sheet.

### Newsletter

*Newsletter > Compose* builds a weekly email in one of three designs and sends
it through **Brevo**, one copy per recipient, to the **Newsletter Recipients**
sheet. The sections are: header, section 1 (sermon), sections 2–6 (five
announcement slots), section 7 (giving), section 8 (child safety), footer.
Everything but the sermon and the announcements is standing content, pre-filled
from `WynNewsletter.blank()`.

The email HTML is rendered **in the browser** by `newsletter-templates.js` and
handed to the backend to send; the sheet stores only the content object as JSON
(`Newsletter Issues`) and the per-recipient outcome (`Newsletter Send Log`). So
there is one copy of each design, not one in JavaScript and another in Apps
Script — if you change a design, change it there.

Sends are chunked (40 recipients per request) because Apps Script kills any
request at six minutes; the console loops until the backend reports `done`.
The Brevo API key is in Script Properties, never in the sheet or the repo.

`WynNewsletter.sample()` is a complete worked issue built from the design
mockup, reachable at `#/newsletter/compose/sample`. Its pictures, and the
standing ones the defaults point at, live in `assets/newsletter/`.

The five announcement slots are reorderable — by drag, or by the ↑↓ buttons
that give keyboard and touch users the same move (HTML5 drag does neither).
A move is just a splice of `nlDraft.announcements`, since that array's order
*is* the order in the email; `renderAnnouncements()` then rebuilds the slots
so their `data-nl` index paths match their new positions. Section numbering
follows position, not content. Expanded/collapsed state rides along in
`nlAnnOpen`, kept out of the content object so it never reaches the saved JSON.

Uploaded pictures are prepared **in the browser** before they are sent
(`prepareImage` in `admin.js`): longest edge capped at 1200px (2× the widest
column), re-encoded to JPEG at falling quality until under 500 KB, kept as PNG
only when the image really uses transparency, EXIF rotation applied, GIF/SVG
passed through. Deliberately **not** WebP — Outlook on Windows cannot render
it. Anything committed to `assets/newsletter/` should get the same treatment
by hand; the images there are already JPEG except the three logos, which need
their alpha.

### Website

*Website > Home Page / Gatherings / Church Online / What's On* edit the `cms:`
regions of those pages, with the real page beside the form as a live preview
(loaded from the site itself; each region is swapped in place as you type, by
`WynSite.applyToDocument`). Drafts save to the **Website Content** sheet as you
type; **Publish** sends the page's content and the HTML of every region to
`Website.gs`, which writes the regions into the files on GitHub between their
markers, copies new pictures into `assets/uploads/`, moves the page's
`<lastmod>` in `sitemap.xml`, and commits it all in one commit on `main`. The
console then polls the live page until the new HTML appears.

As with the newsletter, the HTML is rendered **in the browser** by one copy of
the design, `site-content.js`; the sheet stores only content JSON. The backend
never builds HTML — it only checks the regions (known names, no script,
handlers, `javascript:` links or comments) and splices them in. Keep
`REGIONS` in `site-content.js` and `WEB_REGIONS` / `WEB_FILES` in `Website.gs`
in step, and when you add a marker to a page, add its file to `WEB_FILES`.

Every publish renders **all** regions — the menus on every page and the home
page's Sunday School panel are built from more than one page's content — from
the page being published plus the live content of the others. A revision
counter (`WEB_REV`) makes a publish from a stale editor fail with `code:
'stale'`, and the console reloads the others' content and retries once.

Content text uses a small shorthand, rendered by `WynSite.inline`:
`**bold**`, `*italic*`, `[text](url)`, a blank line between paragraphs, and a
single line break kept as `<br>`. Links and pictures pass through `safeUrl` /
`safeImage`, so nothing typed can become a script.

Uploads go through the same `prepareImage` as the newsletter, with the sizes in
`WEB_IMAGE_SIZES` (2000px for banners, 1600px otherwise), and wait on Drive
(*WynLife Website Images*) until the page is published; the published page links
to the copy in the repository, never to Drive. Section pictures are deliberately
not lazy-loaded: many are posters with no fixed height, and a late one would
push a section reached from a menu link (`#mens-group`) off the top of the
screen.

Publishing needs a fine-grained GitHub token with *Contents: read and write* on
this repository (Settings > Website Publishing), from an account on the
`protect-main` rule's bypass list. Setup and the security notes are in
`apps-script/README.md`.

## Common Issues and Solutions

1. **Formatting Problems:** Maintain existing HTML structure when adding new content
2. **Image Links:** Ensure image paths are correct relative to the root directory
3. **Styling Consistency:** Match the existing color scheme and font styling
4. **Mobile Responsiveness:** Test on mobile devices after making changes

## Contact Information

For technical questions or assistance with website updates, contact:
- Email: connect@wynlife.com.au
- Phone: +61 457 697 354