# SBCF Diwali Celebration 2026 — Registration System

A lightweight event-management system for **Stichting Bharat Culture Friesland (SBCF)**. The public site is static and can be hosted free on Cloudflare Pages. Google Apps Script + Google Sheets provide the backend.

## Included features

- SBCF branded responsive registration website using the supplied logo
- Four-step family registration flow
- Age 12+ / below-12 / student attendee counters
- Dynamic participant names and age groups
- Cultural participation: dance, singing, drama/skit, volunteering, kids activity
- Optional contribution calculation (disabled by default until you confirm the 2026 amount)
- Google Sheets storage
- Duplicate-safe registration requests
- Automatic HTML confirmation email
- QR ticket in confirmation email and success screen
- Add-to-Google-Calendar link
- Optional WhatsApp group button
- Organizer dashboard with live totals, search and CSV export
- Resend confirmation email from dashboard
- Open/close public registration from dashboard
- QR camera check-in plus manual registration-ID check-in
- Duplicate check-in detection
- Basic spam honeypot and server-side validation
- Privacy notice template
- PWA manifest / icons

## Files

- `index.html` — public registration
- `admin.html` — organizer dashboard
- `checkin.html` — QR/manual check-in
- `privacy.html` — privacy notice template
- `config.js` — public event configuration
- `backend.js` — browser-to-Apps-Script request bridge
- `app.js`, `admin.js`, `checkin.js` — page logic
- `styles.css` — SBCF theme
- `Code.gs` — Google Apps Script backend
- `DEPLOYMENT.md` — exact setup and Cloudflare deployment steps
- `assets/` — supplied SBCF logo and app icons

Start with **DEPLOYMENT.md**.


## Registration categories (current)

- **Age 12+** — €20 per person
- **Below 12** — Free
- **Students** — €15 per person (valid student ID may be requested)

The public form, confirmation email, Google Sheet columns, CSV export and organizer dashboard all use these same categories.

## Image quality

The site now uses the original high-resolution SBCF logo converted to PNG and vector SVG interface icons, avoiding blurry emoji/raster UI icons.


## v3 timeout fix

This version intentionally has **no payment page and no Mollie integration**.

Changes:
- Student contribution is **€15**
- Age 12+ remains **€20**
- Below 12 remains **free**
- Phone number is **optional**
- Fixed the false frontend timeout seen when the Sheet row and email were created successfully
- Apps Script now posts its result to the top-level page as well as its parent frame
- Browser response matching now uses the random request ID instead of assuming Apps Script runs directly in the target iframe
- If the browser still misses the first response, it checks the Google Sheet by the same `clientRequestId` and shows the existing registration instead of creating a duplicate

When updating `Code.gs`, deploy a **new Apps Script version** before testing.
