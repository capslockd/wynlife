# WynLife Management App — backend setup

The admin console at **/admin/** and the parent check-in page at
**/sunday-school-checkin/** are plain static pages. All data lives in one Google
Spreadsheet, and a Google Apps Script web app is the API in between.

```
/admin/  ─────────────────┐
                          ├──►  Apps Script web app  ──►  "Wynlife Management
/sunday-school-checkin/  ─┘     (Code.gs, Newsletter.gs,      App Data Sheet"
                                 Website.gs)
                                          │
                                          ├──►  Brevo   ──►  the newsletter
                                          └──►  GitHub  ──►  the website pages
```

Do the setup once. After that, everything is managed from the website.

---

## 1. Create the spreadsheet

1. Go to <https://sheets.google.com> signed in as **wynlifechurch@gmail.com**.
2. Create a blank spreadsheet and name it exactly:

   ```
   Wynlife Management App Data Sheet
   ```

3. **File > Settings > Time zone** → set to `(GMT+10:00) Melbourne` so
   sign-in/sign-out timestamps are local.

## 2. Add the script

1. In the spreadsheet: **Extensions > Apps Script**.
2. Delete the sample `myFunction` code.
3. Paste the entire contents of [`Code.gs`](Code.gs).
4. **File > +** (new script file), name it `Newsletter`, and paste the entire
   contents of [`Newsletter.gs`](Newsletter.gs) into it.
5. **File > +** again, name it `Website`, and paste the entire contents of
   [`Website.gs`](Website.gs) into it.
6. Click the save icon.

All three files share one global scope, so `Newsletter.gs` and `Website.gs`
use the helpers defined in `Code.gs`. None of them works without the others.

## 3. Run `setup()` once

1. In the Apps Script toolbar, choose the function **`setup`** and press **Run**.
2. Grant the permissions it asks for (it is your own script acting on your own
   spreadsheet).

`setup()` creates the nine sheets with their header rows, freezes and formats
them, and creates the bootstrap administrator:

| | |
|---|---|
| Email | `wynlifechurch@gmail.com` |
| Password | `JesusSavedMe#316` |

**Change that password** from **Settings > Users & Roles** as soon as you have
signed in the first time.

`setup()` is safe to re-run — it never deletes data.

## 4. Deploy the web app

1. **Deploy > New deployment**, choose type **Web app**.
2. Description: `WynLife Management App`.
3. **Execute as:** `Me (wynlifechurch@gmail.com)`.
4. **Who has access:** `Anyone`.
5. **Deploy**, then copy the **Web app URL** — it ends in `/exec`.

> "Anyone" is required because parents open the check-in page without a Google
> account. The script itself still checks the signed-in session and role for
> every admin action; only the four Sunday School kiosk actions are public, and
> those only ever return children matching the name a parent types.

## 5. Point the website at the deployment

Edit `admin-config.js` in the repository root:

```js
window.WYNLIFE_ADMIN_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycb…/exec',
  checkinPath: '/sunday-school-checkin/'
};
```

Commit and push. The admin console is then live at
<https://www.wynlife.com.au/admin/> and linked from **About > Manage**.

### After changing `Code.gs`, `Newsletter.gs` or `Website.gs`

**Deploy > Manage deployments >** pencil icon **> Version: New version > Deploy.**
Keeping the same deployment keeps the same `/exec` URL, so `admin-config.js`
does not need to change. If the change added a sheet or a column, run
`setup()` again too.

## 6. Connect Brevo (only if you are sending the newsletter)

1. In Brevo: **SMTP & API > API Keys > Generate a new API key**. Copy it — it
   is shown once.
2. In Brevo: **Senders, Domains & Dedicated IPs**, and verify the address you
   want the newsletter to come from (`info@wynlife.com.au`). Brevo refuses to
   send from an unverified sender.
3. Sign in to **/admin/** as an admin, go to **Settings > Email Settings**,
   paste the key and set the sender name and address.

The key is written to the Apps Script's own **Script Properties**, never to the
spreadsheet, and is never sent back to the browser. If you would rather not
paste it through a web form, open the Apps Script editor, put it into
`setBrevoKey()` in `Newsletter.gs`, run that function once, then blank it out
again.

Deliverability is worth ten minutes: add Brevo's SPF and DKIM records to the
`wynlife.com.au` DNS, or a good share of the newsletter will land in spam.

## 7. Connect GitHub (only if moderators are editing the website)

Publishing a page from **Website** in the console writes it straight into this
repository on GitHub, and GitHub Pages rebuilds the site. That needs a GitHub
access token.

1. Sign in to GitHub as the account that owns the repository.
2. **Settings > Developer settings > Personal access tokens > Fine-grained
   tokens > Generate new token.**
3. Name it `WynLife website publishing`. Give it the longest expiry you are
   comfortable with, and put a reminder in the calendar to renew it — when it
   lapses, publishing stops with a message saying so.
4. **Repository access:** *Only select repositories*, and pick this one.
5. **Repository permissions > Contents:** *Read and write*. Nothing else.
6. Generate it, copy it, then in the console go to **Settings > Website
   Publishing**, paste it, **Save Settings**, and **Test the Connection**.

`main` is protected by a rule that requires a pull request. Publishing writes
to it directly, so the token's account must be on that rule's **bypass list**
(**Settings > Rules > protect-main**). The repository owner already is. The
connection test reads the rule and tells you if the account cannot bypass it.

The token is written to the Apps Script's **Script Properties**, never to the
spreadsheet, and is never sent back to the browser.

---

## Sheet layouts

### `Member Data` — one row per church goer

| Column | Notes |
|---|---|
| Member ID | `MEM-0001`, assigned automatically |
| First Name | required |
| Last Name | required |
| Date of Birth | `YYYY-MM-DD` |
| Special Dates | free text, e.g. `Baptism: 2019-04-21; Anniversary: 2012-06-10` |
| Sunday Schooler | `TRUE` / `FALSE` — drives the Sunday School roster |
| Grouped as Family | `TRUE` / `FALSE` |
| Family Group Name | e.g. `Gorgonia Family` — parents search on this |
| Mobile, Email, Notes | optional contact details |
| Active | `FALSE` keeps the person on the attendance roll only while they belong to a family group; history is never deleted |
| Created At / Updated At | set by the app |
| Suburb | optional; also searchable on *Members* |
| Mailing Address | optional; free text, may span several lines |

### `Attendance Tracking Data` — one row per member per service

| Column | Notes |
|---|---|
| Record ID | `ATT-000001` |
| Service Date | the Sunday, `YYYY-MM-DD` |
| Member ID, First Name, Last Name, Family Group Name | copied at recording time |
| Sunday Schooler | copied so reports can split kids from adults |
| Present | `TRUE` / `FALSE` |
| Recorded By | email of the user who saved it |
| Recorded At | timestamp |

One row per person per Sunday (rather than a wide grid of dates) keeps the
sheet pivot-table friendly and lets a Sunday be re-saved without duplicating
anyone — an existing row for that date and member is updated in place.

### `Sunday School Data` — sign in / sign out log

| Column | Notes |
|---|---|
| Record ID | `SSD-000001` |
| Service Date | the Sunday |
| Member ID, First Name, Last Name, Family Group Name | copied from attendance |
| Status | `Expected` → `Signed In` → `Signed Out` |
| Sign In At / Signed In By | timestamp + the name the parent typed |
| Sign Out At / Signed Out By | timestamp + the name the parent typed |
| Setup By / Setup At | who built the roster, and when |
| PIN | the 4-digit collection PIN the parent chose at sign-in, cleared at sign-out |

The **PIN** is chosen by the parent when they sign their children in, and must
be given back to sign them out, so only the adult who dropped a child off can
collect them. Children signed in together get the PIN typed for that batch, and
a parent returning later simply chooses a PIN again for the children they are
signing in then. It is visible to staff on **Members & Sundays > Setup Sunday School**
for when a parent forgets theirs, and is never sent to the parent-facing
kiosk.

A child cannot be signed out until **15 minutes** after being signed in
(`MIN_CARE_MINUTES` in `Code.gs`), which stops an accidental double-tap from
marking a child as collected on arrival. The kiosk greys the **Out** box out
until then, shows the time they can be collected, and unlocks itself when that
time arrives.

If you are upgrading an existing sheet, re-run `setup()` to add the `PIN`,
`Suburb` and `Mailing Address` columns — rows signed in before the PIN existed have none and can
still be signed out without one.

### `App Users` — admin console logins

| Column | Notes |
|---|---|
| User ID | `USR-0001` |
| Email | the login |
| Display Name | shown in the console |
| Role | `basic`, `planner`, `admin`, `email` or `moderator` |
| Salt / Password Hash | salted SHA-256; the plain password is never stored |
| Active | `FALSE` blocks sign-in |
| Created At / Last Login | timestamps |

### Roles

| Role | Shown as | Can do |
|---|---|---|
| `basic` | Basic | View members, run both reports |
| `planner` | Planner | Everything above, plus add/modify members, record Sunday attendance, set up Sunday School |
| `admin` | Admin | Everything, plus add and modify users, the newsletter, the website, and the Brevo and GitHub settings |
| `email` | Email Administrator | Compose, test and send the newsletter, and manage the recipients list. Nothing else — no members, no attendance, no reports, no users |
| `moderator` | Website Moderator | Edit and publish the website pages under **Website**, and see the publish history. Nothing else |

The first three stack: a planner can do everything a basic user can, and an
admin everything a planner can. `email` and `moderator` sit outside that ladder
rather than at the bottom of it, so they have a rank of zero and are granted the
one thing they need — the `newsletter` or `website` capability — through
`ROLE_CAPS`. That is why adding an Email Administrator or a Website Moderator
does not quietly hand them the reports. Someone who needs both the newsletter
and the website is an admin, or gets a role of their own with both capabilities.

`ROLE_CAPS` is defined twice on purpose: in `Code.gs`, which enforces it, and
in `admin-api.js`, which only decides what the menu shows — each person sees
only the screens their role can open. **Keep the two in step.** The browser
copy is a convenience; the script is the authority and re-checks every request.

The script refuses to demote or disable the last active admin.

### `Newsletter Recipients` — the mailing list

| Column | Notes |
|---|---|
| Recipient ID | `RCP-0001` |
| Email | the address; one row per address, checked for duplicates |
| First Name / Last Name | optional; the first name fills `{{FIRST_NAME}}` |
| Status | `subscribed`, `unsubscribed` or `bounced` — only `subscribed` is sent to |
| Groups | comma separated, e.g. `families, foodbank`; lets an issue go to part of the list |
| Source | how they got on the list |
| Notes | free text |
| Unsubscribe Token | random, generated once; the unsubscribe link is only honoured if it matches |
| Added By / Added At / Updated At | set by the app |
| Last Sent At / Last Send Result | updated after each send |

Anyone who clicks **Unsubscribe** in a newsletter footer is set to
`unsubscribed` here by the script itself and is skipped from then on. The
confirmation page offers a resubscribe link in case they misclicked. You can
also change a status by hand from **Newsletter > Recipients**.

### `Newsletter Issues` — one row per issue

| Column | Notes |
|---|---|
| Newsletter ID | `NLT-0001` |
| Issue Date, Subject, Preheader, Design | as composed |
| Status | `draft` → `sending` → `sent` |
| Sections Used | a readable summary, e.g. `Sermon \| Ann 1: Fellowship Lunch \| Giving \| Child Safety` |
| Content JSON | everything typed into the composer, so an issue can be reopened |
| Created By / Created At / Updated By / Updated At | who composed it, and when |
| Sent By / Sent At | who pressed send |
| Recipient Count / Sent Count / Failed Count | filled in as the send runs |
| Last Test To | the addresses the last test went to |

The email HTML itself is **not** stored — it is rebuilt from `Content JSON` by
`newsletter-templates.js` whenever an issue is opened. That keeps one copy of
each design, and keeps the cell inside the 50,000-character limit a Google
Sheets cell allows. The script refuses to save an issue whose JSON would come
close to that.

A `sent` issue cannot be edited or deleted — opening it from the history starts
a fresh draft from its content instead, so last week's record never changes
under you.

### `Newsletter Send Log` — one row per recipient per send

| Column | Notes |
|---|---|
| Log ID | `SND-000001` |
| Newsletter ID, Issue Date, Subject | which issue |
| Email | who it went to |
| Kind | `newsletter` or `test` |
| Result | `sent` or `failed` |
| Provider Message ID | Brevo's id, for chasing a specific email |
| Error | why it failed, when it did |
| Sent By / Sent At | timestamps |

### `Website Content` — one row per editable page

| Column | Notes |
|---|---|
| Page | `home`, `gatherings`, `online` or `whatson` |
| Draft JSON | what the editor holds, saved as the moderator types |
| Draft Updated By / Draft Updated At | who saved it last |
| Published JSON | what is on the live site |
| Published By / Published At | who published it |
| Published Commit | the GitHub commit that put it there |

A page with no row has never been edited here; the console starts it from the
defaults in `site-content.js`, which are a copy of what the page says today.
Drafts are shared — whoever opens a page carries on from the last save. The
content is JSON, not HTML: the console turns it into HTML when it publishes.

### `Website Publish Log` — one row per publish

| Column | Notes |
|---|---|
| Publish ID | `WEB-0001` |
| Page | which page was published |
| Summary | e.g. `Changed: Food Bank; Added: Carols by Candlelight` |
| Result | `published`, `unchanged` (nothing was different) or `failed` |
| Commit / Files Changed / Images Added | what it did on GitHub |
| Warnings | e.g. a block that had been edited by hand on GitHub and was replaced |
| Error | why it failed, when it did |
| Content JSON | the page as published, so **Publish History > Restore** can bring it back |
| Published By / Published At | timestamps |

---

## Sending a newsletter

0. If you have never sent one, press **Start from the Sample Issue** on the
   history screen. That fills in a complete week — sermon, Wednesday prayer,
   Life Groups, Fellowship Lunch and Food Bank, with their pictures — so you
   can edit a real newsletter down rather than fill a blank one in. Saving it
   creates a new draft; the sample itself is never changed.
1. **Newsletter > Compose Newsletter.** Pick one of the three designs —
   Classic, Dark or Editorial. Switching between them keeps everything you have
   typed; only the styling changes.
2. Fill in the subject, the sermon, and as many of the five announcement slots
   as you need. **Giving**, **Child Safety**, the header and the footer are
   already filled in with the standing wording, so most weeks you leave them
   alone. An announcement slot with nothing in it is dropped from the email.
   The announcements can be put in any order — drag one by the grip at the
   left of its header bar, or use the ↑↓ buttons next to it. Whatever order
   you leave them in is the order they appear in the email, and *Section 2…6*
   renumber to match. The other sections are fixed: the sermon always leads,
   and giving, child safety and the footer always close.
3. Pictures: paste an `https://` link, or press **Upload a picture** and the
   script stores it on Drive and links it for you. Anything already on the
   church website (`https://www.wynlife.com.au/assets/newsletter/…`) is the most
   reliable choice, since it is served the same way as the rest of the site.
4. Watch the preview beside the form, and use **Phone** to see how it stacks on
   a small screen.
5. **Send a Test** to yourself. Look at it in a real inbox — a preview cannot
   tell you how Outlook or Gmail will treat it.
6. **Send to the List**, choosing everyone or one group. The console sends in
   batches of 40 and shows progress; each person gets their own copy, so nobody
   sees anyone else's address, and each copy carries that person's own
   unsubscribe link.

Two placeholders can be used anywhere in the text: `{{FIRST_NAME}}` becomes the
recipient's first name (or "Friend"), and `{{EMAIL}}` their address.

### What happens to an uploaded picture

Upload whatever you have — the browser prepares it before it goes anywhere:

* **Shrunk** so the longest edge is at most 1200px. That is twice the widest
  column, so it still looks sharp on a phone or a retina screen, and the rest
  is weight nobody sees. Small pictures are never stretched up; if one is
  narrower than the column you get a warning that it will look soft.
* **Re-compressed** to JPEG, dropping the quality in steps until it is under
  500 KB. A picture that genuinely uses transparency — a logo, say — stays a
  PNG instead, so it does not gain a white box.
* **Turned the right way up.** A photo taken sideways carries a rotation flag
  rather than rotated pixels; that is read and applied, so it does not arrive
  on its side.
* GIFs and SVGs are passed through untouched, since a canvas would flatten an
  animation and rasterise a vector.

A typical phone photo goes from about 3–5 MB to 150–350 KB with no visible
difference at email size. The line under the upload button tells you exactly
what happened, e.g. *Resized 4032×3024 → 1200×900. 3.4 MB → 349 KB.*

Nothing is converted to **WebP** on purpose: Outlook on Windows renders through
the Word engine, which cannot display it, and those recipients would see a
broken image rather than a smaller one.

An image is never cropped and never widens the newsletter — it is scaled to the
column and the height follows its own proportions. A portrait photo therefore
becomes a tall block. The designs are built around 16:9 pictures, so landscape
is what to aim for.

Apps Script stops any single request after six minutes, which is why the send
is chunked. If a send is interrupted, the issue keeps a `sending` status and the
counts it reached; sending again starts from the beginning of the list, so
people already reached would get a second copy — check the **Newsletter Send
Log** first.

---

## A normal Sunday

1. **Members & Sundays > Sunday Attendance** — pick the date, search by name or family
   group, tick everyone present, **Save Attendance**.
2. **Members & Sundays > Setup Sunday School** — same date, **Set Up Roster**. Every
   member who is marked present *and* flagged as a Sunday Schooler is added to
   `Sunday School Data` with status `Expected`.
3. Share the **parent check-in link** (`/sunday-school-checkin/`) — on a foyer
   tablet, or by text/QR code. Parents type their last name or family group,
   tick **In**, and tick **Out** at pick-up. **Out** stays greyed out until the
   child is signed in, and for 15 minutes after that. At sign-in the parent
   chooses their own **4-digit collection PIN** which they must type back in to
   sign out; a wrong PIN is refused in red and nothing is recorded, and the
   15-minute wait is re-checked on the server too.
4. **Members & Sundays > Attendance Report** / **Sunday School Report** — set the range
   (or press **This Week**), then **Export CSV** or **Print**.

Re-running **Set Up Roster** for a date is safe: children already on the roster
keep their sign-in and sign-out times.

---

## Keeping the website up to date

The **Website** menu edits these parts of the public site:

| Screen | What it edits |
|---|---|
| **Home Page** | The *Our Gatherings* and *What's On* cards — add, remove, reorder, hide |
| **Gatherings** | The banner and every section — text, pictures, details box, buttons, photo row; add, remove, reorder, hide |
| **Church Online** | The YouTube link of the latest livestream, the player's caption and picture |
| **What's On** | The banner, every section, and the *Other Announcements* notices |

The home page's **Sunday School** panel is not edited on its own: it is made
from the Sunday School section of the Gatherings page (its introduction, this
term's words and both pictures), so changing the term there changes both. The
site menu's Gatherings and What's On lists, and the footer's Gatherings list on
every page, follow the sections too — rename, hide or add one and every page's
menu changes with it.

A normal week:

1. **Church Online** — paste the livestream link from YouTube (any kind of
   YouTube link works) and press play in the preview to check it.
2. **What's On** — add a notice for anything new; untick *Show this notice* on
   anything that has passed.
3. Watch the preview beside the form — it is the real page with your changes
   in it, on a phone or a computer — then press **Publish**.
4. The console waits for GitHub Pages to rebuild (usually under a minute) and
   says when the change is live.

Drafts save as you type, so nothing is lost by leaving a page half done; only
**Publish** changes the website. **Discard Changes** goes back to what is live.
**Publish History** lists every publish, and **Restore** puts any of them back
into the draft to publish again.

### Pictures

**Upload a Picture** shrinks and compresses the picture in the browser first,
the same way the newsletter does (banners keep up to 2000px, everything else
1600px), then holds it in the Drive folder **WynLife Website Images** so the
preview can show it straight away. When the page is published, the picture is
copied into the repository under `assets/uploads/<year>/` and the page links to
that copy — so the live site serves its own pictures, fast, and never depends on
Drive. Only pictures in that folder are ever copied.

Posters and flyers should use *Show the whole picture*; photos look best with
*Fill the frame*.

### How publishing works

The editable parts of each page sit between a pair of comments:

```html
<!-- cms:gatherings-sections · managed in /admin/ -->
…
<!-- /cms:gatherings-sections -->
```

`site-content.js` turns the content into HTML for every one of those regions —
the same code draws the preview — and `Website.gs` writes them into the page
files on GitHub in a single commit, along with any new pictures and the
`<lastmod>` dates in `sitemap.xml`. Everything outside the markers is left
exactly as it is. If someone else pushes to `main` at the same moment, the
script starts again from their commit rather than overwrite it.

Because every publish re-renders every region, a change to the *design* — the
renderers in `site-content.js` — reaches the live pages the next time anyone
publishes a page after the code is merged.

A hand edit made inside a region on GitHub is replaced by the next publish. The
script notices and records a warning in the publish log, and the old text is
still in the repository's history.

---

## Security notes

Worth being clear about, since this is a static site with a public API:

* Passwords are stored only as salted SHA-256 hashes in `App Users`.
* Sessions are HMAC-signed tokens held in `sessionStorage`, valid for 12 hours
  (`SESSION_HOURS` in `Code.gs`), and every admin action re-checks the token
  and the role server-side. A password or role change in the sheet takes effect
  when the token next expires.
* The Sunday School kiosk actions are deliberately unauthenticated so parents
  can use them. They need at least two letters of a last name or family group
  and return only matching children for the current roster — never the whole
  list. Sign-in and sign-out both record the name the parent typed, and a
  sign-out is refused unless it carries the PIN chosen at sign-in and the
  15-minute wait has passed. Rosters sent to the kiosk have the PINs stripped
  out.
* The Brevo API key lives in Script Properties, not in the sheet and not in the
  repository. Only an `admin` can set it, and it is never returned to the
  browser — the settings screen shows the first few characters and nothing more.
  An Email Administrator can send with it but cannot read it.
* The unsubscribe link is the one newsletter action that needs no login. It
  only works when the recipient id and its random token match the row in
  `Newsletter Recipients`, so a stranger cannot unsubscribe someone by guessing
  an address, and the worst a leaked link can do is unsubscribe that one person.
* Uploaded newsletter pictures are put on Drive with "anyone with the link can
  view" — they have to be, since email clients fetch them without signing in.
  Do not upload anything you would not put on the public website.
* The GitHub token lives in Script Properties, can only be set by an `admin`,
  and is never returned to the browser. It is scoped to this one repository
  with *Contents* access, so the worst a leaked token can do is change the
  website — which is also what a moderator can do. Revoke it on GitHub and
  paste a new one if it is ever exposed.
* Publishing commits straight to `main`, past the rule that makes code changes
  go through a pull request. It can only touch the page files listed in
  `WEB_FILES`, only between `cms:` markers, plus new pictures under
  `assets/uploads/` and the sitemap dates. The script refuses any region it does
  not know, and any markup the console's renderer never produces (scripts,
  event handlers, `javascript:` links, frames, forms, comments), so a tampered
  request cannot put code on the site.
* The script can read any file in the church's Drive, so it only ever copies a
  picture into the website if it sits in the **WynLife Website Images**
  folder. A pasted link to any other Drive file is left as a plain link and its
  contents are never copied.
* Pictures and words published to the website are public, and so is the
  repository — the publish log stays in the private sheet, and commit messages
  never name the person who published.
* Anyone who can read the repository can see the `/exec` URL, so treat the
  spreadsheet as the security boundary: keep it shared with the church admin
  account only, and change the bootstrap password immediately.
* This is appropriate for a church roll. Do not put anything in these sheets
  you would not be comfortable having in a shared Google Drive.
