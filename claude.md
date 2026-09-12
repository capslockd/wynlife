# WynLife Church Website Management Guide

This guide provides instructions for updating the WynLife Church website content, focusing on the most commonly updated sections.

## Project Overview

The WynLife Church website is built with:
- Static HTML files (no CMS)
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

### A. Updating Announcements in "What's On" Section

**Location:** `whats-on.html`, specifically the `#announcements` section (lines 370-400)

**Update Process:**
1. Find the `#announcements` section in `whats-on.html`
2. Look for existing announcement blocks:
   - The "2026 Entrance Update" block (lines 376-385)
   - The "Set Free 2-day Retreat" block (lines 387-399)

**For adding a new announcement:**
1. Copy one of the existing announcement blocks
2. Modify the content within that block:
   - Update the title in `<h3>` tag
   - Change the description text
   - Update dates, times, and details
   - Adjust image source if needed

**Example structure for a new announcement:**
```html
<div class="two-col img-right mt-48" style="align-items:start;padding-top:40px;border-top:1px solid var(--border);">
  <div>
    <img src="/assets/whats-on/new_announcement.png" alt="New Announcement Title" class="photo-contain">
  </div>
  <div>
    <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--blue);margin-bottom:8px;">&#127759; Upcoming Event</div>
    <h3 style="font-family:'Merriweather',serif;font-size:1.5rem;color:var(--navy);margin-bottom:14px;line-height:1.3;">New Announcement Title</h3>
    <p style="font-size:1rem;color:var(--gray);line-height:1.7;max-width:540px;">Description of the new announcement...</p>
    <p style="font-size:0.92rem;color:var(--gray);line-height:1.7;margin-top:12px;">Additional details or dates...</p>
  </div>
</div>
```

### B. Updating the Online Sermon Link

**Location:** `church-online.html`, specifically the video player section (lines 293-314)

**Update Process:**
1. Find the `#ytThumb` div and the `#ytFrame` div
2. Locate the `src` attribute in the iframe within `#ytFrame`
3. Update the YouTube video ID in the URL

**Current setup (line 304):**
```html
<iframe id="ytIframe" src="https://www.youtube.com/embed/ocQcNW8ja2E?autoplay=1&rel=0" title="WynLife Church Live" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
```

**To update:**
1. Get the new YouTube video ID from the URL (e.g., for `https://www.youtube.com/watch?v=ocQcNW8ja2E`, the ID is `ocQcNW8ja2E`)
2. Replace the ID in the iframe src attribute with the new one

**Example of updated link:**
```html
<iframe id="ytIframe" src="https://www.youtube.com/embed/new_video_id?autoplay=1&rel=0" title="WynLife Church Live" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
```

### C. Other Frequently Updated Sections

**Bible Reading Section (`whats-on.html`):**
- Update the link to study materials in line 230
- The current link is: `https://www.ttb.org/`

**Upcoming Events:**
- Add new events to the announcements section
- Ensure proper formatting with consistent styling

## General Update Guidelines

1. **Backup First:** Always backup any files before making changes
2. **Consistent Styling:** Maintain the existing CSS styling and structure
3. **Image Sizes:** Use appropriate image sizes (check existing images for reference)
4. **Testing:** Test changes by viewing the page locally or in browser
5. **Responsive Design:** Ensure updates work on mobile devices

## File Structure Overview

```
.
├── index.html              # Home page
├── whats-on.html           # What's On/Announcements page
├── church-online.html      # Church Online page
├── gatherings.html         # Gatherings page
├── next-steps.html         # Next Steps page
├── about.html              # About page
├── pray.html               # Contact/Prayer page
├── style.css               # Main stylesheet
├── nav.js                  # Navigation JavaScript
└── assets/                 # Media files (images, videos)
    ├── shared/             # Shared images
    ├── whats-on/           # What's On related images  
    ├── church-online/      # Church Online images
    └── ...                 # Other directories
```

## Deployment Notes

The website is hosted on a static server. Updates should be made to the appropriate HTML files directly. No special deployment steps are required beyond updating the files.

## Church Management App (`/admin/`)

A separate, login-protected console lives at `/admin/`, linked from the **About**
dropdown as *Manage*. It is a static single-page app; all data lives in the
Google Sheet **"Wynlife Management App Data Sheet"** and is reached through a
Google Apps Script web app.

| File | Purpose |
|---|---|
| `admin.html` | Console shell (`/admin/`) — nav, topbar, login card, menu + view slots |
| `admin.js` | Views and routing for Manage / Reports / Tracking |
| `admin-api.js` | Shared API client, session handling, date helpers |
| `admin-config.js` | **The one file to edit** — holds the Apps Script `/exec` URL |
| `admin.css` | Console and kiosk styling (uses `style.css` variables) |
| `newsletter-templates.js` | The three email designs — turns one content object into sendable HTML |
| `sunday-school-checkin.html` / `.js` | Parent-facing sign in / sign out kiosk (no login) |
| `apps-script/Code.gs` | The backend: sheet setup, auth, members, attendance, reports |
| `apps-script/Newsletter.gs` | The newsletter backend: recipients, issues, Brevo, unsubscribe |
| `apps-script/README.md` | One-time setup, sheet layouts, roles, security notes |

The `apps-script` folder is excluded from the Jekyll build, and both new pages
are `noindex` and disallowed in `robots.txt`.

Roles are `basic` (reports), `planner` (+ members and tracking) and `admin`
(+ user management and the Brevo settings). Those three stack by rank.
`email` — **Email Administrator** — deliberately does not: it ranks *below*
`basic` and gets the newsletter screens through the `newsletter` capability in
`ROLE_CAPS`, so it can compose and send the newsletter and touch nothing else.
`ROLE_CAPS` is mirrored in `Code.gs` (which enforces it) and `admin-api.js`
(which only greys out menu items) — keep the two in step.

At sign-in at the kiosk the parent chooses their own
4-digit **collection PIN** which they must give back to sign the child out,
and no child can be collected until 15 minutes after sign-in
(`MIN_CARE_MINUTES`); staff can see the PIN on *Tracking > Setup Sunday
School*. Read
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

## Common Issues and Solutions

1. **Formatting Problems:** Maintain existing HTML structure when adding new content
2. **Image Links:** Ensure image paths are correct relative to the root directory
3. **Styling Consistency:** Match the existing color scheme and font styling
4. **Mobile Responsiveness:** Test on mobile devices after making changes

## Contact Information

For technical questions or assistance with website updates, contact:
- Email: info@wynlife.com.au
- Phone: +61 457 697 354