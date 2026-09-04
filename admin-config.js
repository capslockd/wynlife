/* admin-config.js — WynLife Church Management App
   ---------------------------------------------------------------------------
   The ONLY file you need to edit after deploying the Google Apps Script.

   1. Open the "Wynlife Management App Data Sheet" spreadsheet.
   2. Extensions > Apps Script, paste in apps-script/Code.gs, run setup().
   3. Deploy > New deployment > Web app  (Execute as: Me, Access: Anyone).
   4. Copy the deployment URL (it ends in /exec) and paste it below.

   Re-deploy the Apps Script after any change to Code.gs, and paste the new
   /exec URL here if it changed.
   --------------------------------------------------------------------------- */

window.WYNLIFE_ADMIN_CONFIG = {
  /* Google Apps Script web app URL, e.g.
     'https://script.google.com/macros/s/AKfycb..../exec' */
  apiUrl: '',

  /* Shown on the "Setup Sunday School" screen as the link to hand to parents. */
  checkinPath: '/sunday-school-checkin/'
};
