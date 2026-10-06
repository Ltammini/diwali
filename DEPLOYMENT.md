# SBCF Diwali 2026 — Complete deployment guide

This version uses:
- Cloudflare for the public static website
- Google Apps Script as the backend
- Google Sheets as the registration database
- Mollie for payments
- Google Mail / Apps Script MailApp for confirmation emails

No Mollie secret is stored in GitHub.

---

## A. Google Sheet

1. Open **Google Sheets**.
2. Create a blank spreadsheet.
3. Name it, for example:
   `SBCF Diwali 2026 Registrations`
4. In the spreadsheet choose:
   **Extensions → Apps Script**
5. Delete the default sample code.
6. Copy the entire supplied `Code.gs` into the editor.
7. Save.

### Run setup

1. Select the function `setupSheet`.
2. Click **Run**.
3. Approve the permissions requested by Google.
4. Return to the spreadsheet.
5. A `Registrations` tab will contain the required columns.

If you already used the previous SBCF v2 sheet, the new payment columns are appended to the right.

---

## B. Apps Script properties

In Apps Script open:

**Project Settings → Script Properties**

Add:

### 1. ADMIN_KEY

Property:
`ADMIN_KEY`

Value:
a long, random organizer-only password.

Example format only:
`SBCF-Admin-2026-CHANGE-THIS-TO-A-LONG-RANDOM-VALUE`

Never put this key into GitHub.

### 2. MOLLIE_API_KEY

Start with a Mollie test API key:

Property:
`MOLLIE_API_KEY`

Value:
`test_...`

After successful testing, replace it with the live key:

`live_...`

### 3. PUBLIC_SITE_URL

Property:
`PUBLIC_SITE_URL`

Value:
your public Cloudflare site origin, without a trailing slash.

For your current deployment this can be:

`https://sbcf-events.laxminarayan-tammini.workers.dev`

If you later attach a custom domain, change this property to the new origin.

---

## C. Deploy Google Apps Script

1. Apps Script → **Deploy → New deployment**
2. Type → **Web app**
3. Description → `SBCF Diwali Registration and Payment API`
4. Execute as → **Me**
5. Who has access → **Anyone**
6. Deploy.
7. Copy the Web App URL ending in `/exec`.

Example:

`https://script.google.com/macros/s/AKfycb.../exec`

### Optional but recommended

Add this to Script Properties too:

Property:
`WEB_APP_URL`

Value:
the same `/exec` URL.

This guarantees Mollie receives the correct webhook URL.

### Recommended payment reconciliation trigger

After deployment, return to the Apps Script editor:

1. Select `setupPaymentReconciliationTrigger`
2. Click **Run**
3. Approve the trigger permission if Google asks

This installs a 5-minute reconciliation job for pending payments. It is a fallback in case a Mollie webhook is missed or temporarily cannot be processed.

You only need to run `setupPaymentReconciliationTrigger()` once.

---

## D. Configure the website

Open `config.js`.

Replace:

`PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE`

with the Apps Script `/exec` URL.

Also update:
- event date
- event time
- venue
- organizer email
- WhatsApp link, if used
- calendar settings, if used

Do **not** add your Mollie API key to `config.js`.

---

## E. Upload to GitHub / Cloudflare

Upload the complete folder contents, including:

- `index.html`
- `payment.html`
- `privacy.html`
- `admin.html`
- `checkin.html`
- `app.js`
- `payment.js`
- `backend.js`
- `admin.js`
- `checkin.js`
- `config.js`
- `styles.css`
- `assets/`
- `manifest.webmanifest`
- `_headers`

`Code.gs` may stay in the repository as source code, but it does not contain the secrets. The secret values live in Apps Script Script Properties.

Publish/redeploy the same way you used for your current Cloudflare Worker/static site.

---

## F. Payment flow

For a paid registration:

1. Visitor fills the form.
2. Google Apps Script validates categories and recalculates the amount.
3. Registration is stored as `Pending payment`.
4. Apps Script creates a Mollie payment.
5. Visitor is sent to Mollie's hosted checkout.
6. Mollie calls the Apps Script webhook.
7. Apps Script fetches the payment from Mollie and verifies it.
8. If Mollie says `paid`:
   - Payment Status → `paid`
   - Registration Status → `Confirmed`
   - Paid At → timestamp
   - confirmation email + QR ticket are sent
9. Visitor's `payment.html` page also checks the status and displays confirmation.

For a €0 registration:
- Mollie is skipped
- the registration is confirmed immediately
- the confirmation email is sent immediately

---

## G. Test checklist

### Free registration
Use only Below 12 attendees.

Expected:
- amount €0
- no Mollie checkout
- immediate confirmation
- email sent
- Status = Confirmed
- Payment Status = Not required

### Paid registration
Example:
- Age 12+: 2 → €40
- Student: 1 → €18
- Below 12: 1 → €0
- Total → €58

Expected:
- redirect to Mollie
- confirmation only after successful payment
- Sheet Payment Status = paid
- contribution = €58
- email sent after payment
- QR check-in works

### Cancelled/failed payment
Expected:
- no confirmation email
- registration remains unconfirmed
- check-in is blocked
- payment return page offers Try payment again

### Optional phone
Leave phone blank.

Expected:
- registration proceeds normally
- Google Sheet phone cell is blank
- confirmation email still works

---

## H. Admin pages

Dashboard:

`/admin.html`

Check-in:

`/checkin.html`

Both use the `ADMIN_KEY` from Apps Script Script Properties.

The admin dashboard now displays:
- paid contribution total
- pending payment count
- per-registration payment status
- payment method
- paid timestamp

Only confirmed registrations can be checked in.

---

## I. Updating Apps Script later

After changing `Code.gs`:

1. **Deploy → Manage deployments**
2. Edit your deployment
3. Choose **New version**
4. Deploy

Keep the `/exec` URL in `config.js` and `WEB_APP_URL` up to date if Google gives you a different URL.
