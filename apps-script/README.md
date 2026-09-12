# WynLife Management App — backend setup

The admin console at **/admin/** and the parent check-in page at
**/sunday-school-checkin/** are plain static pages. All data lives in one Google
Spreadsheet, and a Google Apps Script web app is the API in between.

```
/admin/  ─────────────────┐
                          ├──►  Apps Script web app  ──►  "Wynlife Management
/sunday-school-checkin/  ─┘     (Code.gs, Newsletter.gs)      App Data Sheet"
                                          │
                                          └──►  Brevo  ──►  the newsletter
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
5. Click the save icon.

Both files share one global scope, so `Newsletter.gs` uses the helpers defined
in `Code.gs`. Neither works without the other.

## 3. Run `setup()` once

1. In the Apps Script toolbar, choose the function **`setup`** and press **Run**.
2. Grant the permissions it asks for (it is your own script acting on your own
   spreadsheet).

`setup()` creates the seven sheets with their header rows, freezes and formats
them, and creates the bootstrap administrator:

| | |
|---|---|
| Email | `wynlifechurch@gmail.com` |
| Password | `JesusSavedMe#316` |

**Change that password** from **Manage > Modify User** as soon as you have
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
<https://www.wynlife.com.au/admin/> and linked from **About > Church Admin**.

### After changing `Code.gs` or `Newsletter.gs`

**Deploy > Manage deployments >** pencil icon **> Version: New version > Deploy.**
Keeping the same deployment keeps the same `/exec` URL, so `admin-config.js`
does not need to change.

## 6. Connect Brevo (only if you are sending the newsletter)

1. In Brevo: **SMTP & API > API Keys > Generate a new API key**. Copy it — it
   is shown once.
2. In Brevo: **Senders, Domains & Dedicated IPs**, and verify the address you
   want the newsletter to come from (`info@wynlife.com.au`). Brevo refuses to
   send from an unverified sender.
3. Sign in to **/admin/** as an admin, go to **Newsletter > Email Settings**,
   paste the key and set the sender name and address.

The key is written to the Apps Script's own **Script Properties**, never to the
spreadsheet, and is never sent back to the browser. If you would rather not
paste it through a web form, open the Apps Script editor, put it into
`setBrevoKey()` in `Newsletter.gs`, run that function once, then blank it out
again.

Deliverability is worth ten minutes: add Brevo's SPF and DKIM records to the
`wynlife.com.au` DNS, or a good share of the newsletter will land in spam.

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
| Suburb | optional; also searchable on *Modify Member* |
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
signing in then. It is visible to staff on **Tracking > Setup Sunday School**
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
| Role | `basic`, `planner`, `admin` or `email` |
| Salt / Password Hash | salted SHA-256; the plain password is never stored |
| Active | `FALSE` blocks sign-in |
| Created At / Last Login | timestamps |

### Roles

| Role | Shown as | Can do |
|---|---|---|
| `basic` | Basic | View members, run both reports |
| `planner` | Planner | Everything above, plus add/modify members, record Sunday attendance, set up Sunday School |
| `admin` | Admin | Everything, plus add and modify users, and the Brevo settings |
| `email` | Email Administrator | Compose, test and send the newsletter, and manage the recipients list. Nothing else — no members, no attendance, no reports, no users |

The first three stack: a planner can do everything a basic user can, and an
admin everything a planner can. `email` sits outside that ladder rather than at
the bottom of it, so it has a rank of zero and is granted the one thing it
needs — the `newsletter` capability — through `ROLE_CAPS`. That is why adding an
Email Administrator does not quietly hand them the reports.

`ROLE_CAPS` is defined twice on purpose: in `Code.gs`, which enforces it, and
in `admin-api.js`, which only decides what to grey out in the menu. **Keep the
two in step.** The browser copy is a convenience; the script is the authority
and re-checks every request.

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

1. **Tracking > Sunday Attendance** — pick the date, search by name or family
   group, tick everyone present, **Save Attendance**.
2. **Tracking > Setup Sunday School** — same date, **Set Up Roster**. Every
   member who is marked present *and* flagged as a Sunday Schooler is added to
   `Sunday School Data` with status `Expected`.
3. Share the **parent check-in link** (`/sunday-school-checkin/`) — on a foyer
   tablet, or by text/QR code. Parents type their last name or family group,
   tick **In**, and tick **Out** at pick-up. **Out** stays greyed out until the
   child is signed in, and for 15 minutes after that. At sign-in the parent
   chooses their own **4-digit collection PIN** which they must type back in to
   sign out; a wrong PIN is refused in red and nothing is recorded, and the
   15-minute wait is re-checked on the server too.
4. **Reports > Attendance Report** / **Sunday School Report** — set the range
   (or press **This Week**), then **Export CSV** or **Print**.

Re-running **Set Up Roster** for a date is safe: children already on the roster
keep their sign-in and sign-out times.

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
* Anyone who can read the repository can see the `/exec` URL, so treat the
  spreadsheet as the security boundary: keep it shared with the church admin
  account only, and change the bootstrap password immediately.
* This is appropriate for a church roll. Do not put anything in these sheets
  you would not be comfortable having in a shared Google Drive.
