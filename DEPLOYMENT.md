# Final deployment guide — GitHub + Cloudflare Pages + Google Sheets

## Part 1 — Update event information

Open `config.js` and update:

- `eventDateLabel`
- `eventTimeLabel`
- `venueName`
- `venueAddress`
- `contactEmail`
- optional `whatsappUrl`
- set `calendarEnabled: true` and fill `calendarStart` / `calendarEnd` only after the final date/time is confirmed

The supplied SBCF logo is already in `assets/sbcf-logo.png` and the theme uses saffron, white, green, navy blue and small red accents based on that identity.

### Registration categories and contributions

This build is already configured with the approved registration categories:

```js
feeRegular12Plus: 20,  // Age 12+
feeUnder12: 0,        // Below 12 — free
feeStudent: 15,       // Student rate
```

The same amounts are calculated again in `Code.gs`, so the Google Apps Script backend remains the source of truth even if someone modifies browser-side JavaScript. Students should carry a valid student ID if the event team requires verification.

---

## Part 2 — Create the Google Sheet backend

1. Create a blank Google Sheet, for example **SBCF Diwali 2026 Registrations**.
2. In that Sheet choose **Extensions → Apps Script**.
3. Delete the sample function.
4. Copy the complete contents of `Code.gs` into the Apps Script editor.
5. Update the `SETTINGS` block near the top with the final date, time, venue, reply-to email and WhatsApp URL.
6. Save.
7. Select `setupSheet` and click **Run** once.
8. Approve Google's permissions. The `Registrations` sheet will be created/configured.

### Create the organizer admin key

Do **not** put the admin password in GitHub.

In Apps Script:

1. Open **Project Settings**.
2. Find **Script Properties**.
3. Add a property:
   - Property: `ADMIN_KEY`
   - Value: a long random password used only by SBCF organizers
4. Save.

The admin dashboard and check-in page request this key at runtime and store it only in browser session storage.

---

## Part 3 — Deploy Google Apps Script

1. Apps Script → **Deploy → New deployment**.
2. Select **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone**.
5. Deploy.
6. Copy the Web App URL ending in `/exec`.
7. Paste it into `config.js`:

```js
googleAppsScriptUrl: "https://script.google.com/macros/s/....../exec"
```

Whenever you later change `Code.gs`, use **Deploy → Manage deployments → Edit → New version → Deploy**.

---

## Part 4 — Test locally before publishing

You can double-click `index.html`, but camera scanning normally requires HTTPS. For a better local test, use any small static server.

At minimum test:

1. Submit one registration.
2. Confirm a row appears in Google Sheets.
3. Confirm the email arrives and contains the QR code.
4. Open `admin.html`, enter the `ADMIN_KEY`, and verify totals.
5. Open `checkin.html`; manually enter the registration ID and verify it becomes `Checked in`.
6. After Cloudflare deployment, test the camera QR scanner on a phone.

---

## Part 5 — Push to GitHub

Create a new GitHub repository such as:

`SBCF-Diwali-Registration-2026`

Upload all website files **except there are no secrets in this repository**. `Code.gs` is safe to keep in the repo as long as `ADMIN_KEY` remains only in Apps Script Script Properties.

Typical Git commands:

```bash
git init
git add .
git commit -m "Initial SBCF Diwali registration system"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

---

## Part 6 — Publish free with Cloudflare Pages

1. Sign in to Cloudflare.
2. Open **Workers & Pages**.
3. Create a new **Pages** project.
4. Connect your GitHub account and select the SBCF repository.
5. Framework preset: **None**.
6. Build command: leave empty.
7. Build output directory: `/` (repository root).
8. Deploy.

Cloudflare gives you a URL similar to:

`https://sbcf-diwali-2026.pages.dev`

Cloudflare provides HTTPS automatically, which is required by modern browsers for the camera QR scanner.

### Custom domain

You can later add a domain/subdomain such as:

`diwali.sbcf.nl`

from the Pages project's **Custom domains** section.

---

## Organizer URLs

After publishing:

- Public registration: `/`
- Organizer dashboard: `/admin.html`
- Entrance check-in: `/checkin.html`
- Privacy notice: `/privacy.html`

Do not publicly advertise the dashboard/check-in URLs unnecessarily. They still require the admin key.

---

## QR tickets

The system uses `quickchart.io` to render the QR image. The QR contains only:

`SBCF:<registration-id>`

It does not contain the attendee's email, phone number or admin key. The organizer's check-in page sends the scanned registration ID to Google Apps Script and requires the organizer admin key before changing the Sheet.

---

## Google email quota

Confirmation emails are sent using the Google account that owns the Apps Script. Google applies daily Apps Script/MailApp quotas based on account type. For a community-sized event this may be sufficient, but check the applicable quota before opening registrations if you expect a large number of submissions in one day.

---

## Data/privacy checklist before launch

Because the Sheet contains personal contact information:

- restrict Sheet sharing to authorized SBCF organizers;
- verify the privacy notice wording;
- use a strong `ADMIN_KEY`;
- do not put the admin key into `config.js`, GitHub or WhatsApp;
- remove or anonymize event data when SBCF no longer needs it;
- run an end-to-end test using a non-organizer email before sharing the registration link publicly.


## Current pricing / registration categories

The final build is configured for:

- Age 12+ — **€20**
- Below 12 — **Free**
- Students — **€15**

These prices are validated/calculated by the Google Apps Script backend as well as displayed in the browser. Do not rely only on frontend values.

### If you used an older test sheet

This build changed the attendee columns. Before production, use a fresh `Registrations` sheet (or clear old test rows and rerun `setupSheet()`) so the columns are: **Age 12+**, **Below 12**, and **Students**.


## IMPORTANT — replace the deployed Apps Script version

The timeout fix requires the new `Code.gs`, not only the new frontend.

After pasting this version of `Code.gs` into Apps Script:

1. Save it.
2. Run `setupSheet()` if necessary.
3. Go to **Deploy → Manage deployments**.
4. Edit your Web App deployment.
5. Select **New version**.
6. Deploy.
7. Keep/copy the `/exec` URL into `config.js`.
8. Redeploy the frontend to Cloudflare.

If the old Apps Script deployment is still active, the browser can continue showing the old timeout behavior.
