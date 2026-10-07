# SBCF Diwali 2026 — v5 reliable backend

This version removes the browser → Google Apps Script iframe transport completely.

Architecture:

Browser
→ same-origin `/api/backend`
→ Cloudflare Worker
→ Google Apps Script Web App
→ Google Sheet / confirmation email

This avoids the iframe/CORS/postMessage failure that caused the browser to report a timeout even when Google Sheets and email succeeded.

## Current registration prices

- Age 12+ — €20
- Student — €15
- Below 12 — free

Phone number is optional.

There is no payment page or Mollie integration in this version.

## Important files

- `public/` — website files served by Cloudflare
- `src/index.js` — Cloudflare Worker API proxy
- `Code.gs` — Google Apps Script backend
- `wrangler.jsonc` — Cloudflare Worker + static assets configuration
- `DEPLOYMENT.md` — exact deployment steps

The Google Apps Script URL is no longer stored in browser JavaScript. It is configured as `APPS_SCRIPT_URL` in Cloudflare Worker Variables and Secrets.
