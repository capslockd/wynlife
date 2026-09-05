# WynLife Management App — backend setup

The admin console at **/admin/** and the parent check-in page at
**/sunday-school-checkin/** are plain static pages. All data lives in one Google
Spreadsheet, and a Google Apps Script web app is the API in between.

```
/admin/  ─┐
          ├─►  Apps Script web app (Code.gs)  ─►  "Wynlife Management App Data Sheet"
/sunday-school-checkin/  ─┘
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
4. Click the save icon.

## 3. Run `setup()` once

1. In the Apps Script toolbar, choose the function **`setup`** and press **Run**.
2. Grant the permissions it asks for (it is your own script acting on your own
   spreadsheet).

`setup()` creates the four sheets with their header rows, freezes and formats
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

### After changing `Code.gs`

**Deploy > Manage deployments >** pencil icon **> Version: New version > Deploy.**
Keeping the same deployment keeps the same `/exec` URL, so `admin-config.js`
does not need to change.

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
| PIN | the 4-digit collection PIN issued at sign-in, cleared at sign-out |

The **PIN** is generated when a parent signs children in and must be given back
to sign them out, so only the adult who dropped a child off can collect them.
Children signed in together share one PIN, and a family that already has
children in care keeps the PIN it was given. It is visible to staff on
**Tracking > Setup Sunday School** for when a parent forgets theirs, and is
never sent to the parent-facing kiosk except at the moment it is issued.

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
| Role | `basic`, `planner` or `admin` |
| Salt / Password Hash | salted SHA-256; the plain password is never stored |
| Active | `FALSE` blocks sign-in |
| Created At / Last Login | timestamps |

### Roles

| Role | Can do |
|---|---|
| `basic` | View members, run both reports |
| `planner` | Everything above, plus add/modify members, record Sunday attendance, set up Sunday School |
| `admin` | Everything, plus add and modify users |

The script refuses to demote or disable the last active admin.

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
   child is signed in, and for 15 minutes after that. Signing in shows the
   parent a **4-digit collection PIN** which they must type back in to sign
   out; a wrong PIN is refused in red and nothing is recorded.
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
  sign-out is refused unless it carries the PIN issued at sign-in. Rosters sent
  to the kiosk have the PINs stripped out.
* Anyone who can read the repository can see the `/exec` URL, so treat the
  spreadsheet as the security boundary: keep it shared with the church admin
  account only, and change the bootstrap password immediately.
* This is appropriate for a church roll. Do not put anything in these sheets
  you would not be comfortable having in a shared Google Drive.
