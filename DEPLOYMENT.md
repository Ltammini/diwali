# Deployment — SBCF Diwali 2026 manual payment confirmation

**Important:** GitHub/Cloudflare deployment does **not** automatically update Google Apps Script. Deploy both components.

## 1. Confirm Google Apps Script properties

Open the existing registration Google Sheet → Extensions → Apps Script → Project Settings → Script Properties.

Required:

- ADMIN_KEY — your existing organizer-only password
- PAYMENT_IBAN — the real SBCF ING IBAN (example format: NL00INGB0000000000; never use the example value)

Optional:

- PAYMENT_ACCOUNT_HOLDER — defaults to Stichting Bharat Cultuur Friesland
- PAYMENT_SITE_URL — defaults to https://diwali.sbcf-friesland.workers.dev

Do not commit actual credentials or the admin key into GitHub.

## 2. Deploy Code.gs

Replace the script code with the new Code.gs from this branch. Save, then go to Deploy → Manage deployments → Edit existing Web App → New version → Deploy.

Keep Execute as **Me** and access **Anyone**, as required for the existing Cloudflare proxy architecture. Ensure the Web App deployment URL ends in /exec.

The script will add the payment columns to the registration sheet on first access. Existing registration data remains in the sheet. **Make a backup copy of the Google Sheet first.** The code's header migration assumes the original sheet columns have not been rearranged.

## 3. Merge GitHub changes and deploy Cloudflare

Merge this branch into main only after reviewing the changes. Cloudflare will deploy the Worker and static assets from GitHub according to your existing configuration.

Verify Cloudflare Worker Variables and Secrets contains APPS_SCRIPT_URL set to the current Apps Script /exec deployment. The Worker source is src/index.js, and public/ contains the static pages.

## 4. Validate the workflow

Use a test email and controlled test registrations, ideally in a test Sheet/deployment before allowing public registrations:

1. Open https://diwali.sbcf-friesland.workers.dev/backend-test.html and verify connectivity.
2. Create a paid test registration. Check that the success page shows **Registration received — payment pending**, amount, actual IBAN, account holder and unique payment reference. There must be **no QR ticket**.
3. Check the first email: it must contain the bank details and a working link to /payment.html. The payment page must show the same details and not claim to initiate a bank payment.
4. Log in to /admin.html using ADMIN_KEY. Locate the pending registration and verify the amount and reference. **Only confirm payment after independently checking ING** (or use an isolated test registration that will be removed after testing).
5. Click **Confirm payment** and accept the confirmation prompt. Check the Google Sheet: Payment Status = PAID, Payment Verification = Manual, Amount Received and Payment Verified At populated.
6. Check that the final email includes the QR ticket. The admin dashboard should show PAID and QR ticket email Sent. Reconfirming a paid registration must not send a duplicate ticket.
7. Create a free-only test registration: the page should show its QR immediately, and the backend should send the ticket without payment.
8. Verify that check-in refuses a PENDING registration.

If the QR email fails, the payment remains PAID and the admin dashboard offers **Retry ticket email**. The **Resend email** button sends payment instructions for pending registrations or the ticket for paid/free registrations.

## Known limitations

- The bank transfer is not processed online. The organizer must check the actual incoming ING payment.
- ING bank statement auto-import is not enabled in the Worker because the draft parser has not been validated against a real sample.
- There is no staging/live integration test included. Check the workflow before announcing the event.
- If a request times out after an admin confirmation, refresh the dashboard before retrying to avoid confusion.
