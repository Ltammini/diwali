# SBCF Diwali Celebration 2026 — Registration + Payments

Production-oriented static event registration app for **Stichting Bharat Culture Friesland (SBCF)**.

## Included

- SBCF branded responsive registration website
- High-resolution SBCF logo and vector UI icons
- Registration categories:
  - Age 12+ — €20
  - Below 12 — Free
  - Students — €18
- Phone number is optional
- Server-side price verification
- Google Sheets registration storage
- Mollie hosted payment checkout
- Mollie payment webhook verification
- Registration stays pending until payment is verified
- €0 registrations are confirmed without opening a payment
- Confirmation email after successful payment
- QR ticket in confirmation
- Payment return/status page
- Retry payment after failed/cancelled/expired payments
- Organizer dashboard with payment state and paid totals
- CSV export
- QR/manual event check-in
- Check-in blocked until registration is confirmed
- Privacy page

## Architecture

Browser / Cloudflare-hosted static site
→ Google Apps Script
→ Google Sheet

For paid registrations:
Google Apps Script
→ Mollie Payments API
→ Mollie hosted checkout
→ Mollie webhook
→ Google Apps Script verifies payment with Mollie
→ Google Sheet marked Confirmed
→ confirmation email + QR ticket

The Mollie API key is stored only in **Google Apps Script Script Properties**. It is not stored in GitHub or `config.js`.

## Start here

Read `DEPLOYMENT.md`.

For Mollie-specific setup and test/live migration, also read `MOLLIE_SETUP.md`.
