# SBCF Diwali 2026 — registration and manual bank-payment verification

Website: https://diwali.sbcf-friesland.workers.dev/

The organization is **Stichting Bharat Cultuur Friesland (SBCF)**.

## Workflow

1. A guest registers on the website.
2. For paid registrations (age 12+: €20, student: €15, below 12: free), Google Apps Script saves the registration as **PENDING** and emails the bank transfer amount, ING IBAN, account holder, exact payment reference and a link to /payment.html.
3. The website immediately shows the same bank transfer details and explains that the QR ticket will follow after verification. **No QR is shown for pending payments.**
4. An organizer verifies the incoming payment in ING, opens /admin.html and clicks **Confirm payment** for the correct registration. This action is protected by ADMIN_KEY.
5. Google Apps Script marks the registration **PAID**, records manual verification in Google Sheets and emails the QR admission ticket. Repeated confirmation does not send a second ticket if already sent.
6. Registrations costing €0 are **FREE** and receive a QR ticket immediately. The entrance check-in refuses pending payments.

The /payment.html link is a **bank transfer instruction page**, not a payment processor. No bank transfer is initiated by the website.

**ING CSV/MT940 auto-import is not enabled in this release.** The existing backend draft importer is not exposed through the Cloudflare Worker because it requires validation against real ING statement formats before safe automatic matching.

## Architecture

Browser → same-origin Cloudflare Worker /api/backend → Google Apps Script → Google Sheet and MailApp.

- public/ — frontend pages and scripts
- src/index.js — Cloudflare Worker proxy and action allowlist
- Code.gs — Google Apps Script backend and email templates
- DEPLOYMENT.md — required settings, rollout and test checklist

Never put ADMIN_KEY or APPS_SCRIPT_URL into public frontend files.
