# Mollie payment setup

## 1. Create/activate your Mollie account

Use your organization/business Mollie account and enable the payment methods you want to accept. For a Netherlands event, iDEAL is the main method you will normally want enabled.

## 2. Start with the TEST API key

In Mollie, copy your **test API key** (`test_...`).

In Google Apps Script:

**Project Settings → Script Properties → Add script property**

Add:

- Property: `MOLLIE_API_KEY`
- Value: your `test_...` key

Do not put this key in `config.js`, GitHub, HTML or JavaScript files.

## 3. Add your public Cloudflare URL

Also add:

- Property: `PUBLIC_SITE_URL`
- Value: your public site URL, for example:
  `https://sbcf-events.laxminarayan-tammini.workers.dev`

Do not add a trailing slash.

The backend uses this to return the customer to:

`/payment.html?registrationId=...`

after Mollie checkout.

## 4. Webhook

You do not have to manually create a Mollie webhook for each payment.

`Code.gs` sends its deployed Apps Script Web App URL to Mollie as the payment's `webhookUrl`.

If Apps Script cannot determine that URL automatically, add another Script Property:

- Property: `WEB_APP_URL`
- Value: your deployed Google Apps Script URL ending in `/exec`

Example:

`https://script.google.com/macros/s/AKfycb.../exec`

## 5. Test before going live

With the `test_...` API key:

1. Make a registration requiring payment.
2. The form should redirect to Mollie checkout.
3. Complete a test payment.
4. Mollie redirects you to `payment.html`.
5. The payment page should become **Registration confirmed**.
6. Google Sheets should show:
   - Status = Confirmed
   - Payment Status = paid
   - Payment ID
   - Paid At
7. The confirmation email should arrive.

Also test a failed or cancelled payment and confirm that:
- no confirmation email is sent
- check-in remains blocked
- **Try payment again** creates/reuses a safe payment flow.

## 6. Go live

When everything works:

1. Copy your Mollie **live API key** (`live_...`).
2. Replace the `MOLLIE_API_KEY` Script Property value.
3. No frontend code change is required.
4. Make one small live payment registration and verify the full flow.

## Payment security behavior

The backend calculates the amount again from:

- Age 12+ × €20
- Students × €18
- Below 12 × €0

The amount sent by the browser is not trusted.

When Mollie calls the webhook, the backend fetches the payment directly from Mollie's API and verifies:

- registration ID
- payment amount
- currency
- Mollie status

Only a verified `paid` payment changes the registration to **Confirmed** and triggers the confirmation email.

## 7. Recommended resilience trigger

Run `setupPaymentReconciliationTrigger()` once in Apps Script.

It checks pending Mollie payments every five minutes and confirms any payment that is already paid. This is a fallback if a webhook is ever missed.
