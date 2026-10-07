# SBCF v5 deployment — Cloudflare Worker proxy

This version deliberately does NOT call Google Apps Script directly from the browser.

## 1. Update Google Apps Script

Open your registration Google Sheet:

**Extensions → Apps Script**

Replace all existing code with the supplied `Code.gs`.

Save.

Then deploy a new Web App version:

1. **Deploy → Manage deployments**
2. Select your Web App
3. Click **Edit**
4. Version → **New version**
5. Execute as → **Me**
6. Who has access → **Anyone**
7. **Deploy**

Copy the URL ending in `/exec`.

You can test that URL directly in a browser. It should display JSON similar to:

`{"source":"SBCF_APPS_SCRIPT","ok":true,"service":"SBCF registration service","status":"ready",...}`

If you do not see that, stop here and fix the Apps Script deployment before changing Cloudflare.

---

## 2. Push this complete v5 project to GitHub

The repository root must contain:

- `wrangler.jsonc`
- `package.json`
- `src/`
- `public/`
- `Code.gs`
- `README.md`
- `DEPLOYMENT.md`

Do not upload only the `public` folder.

---

## 3. Configure Cloudflare APPS_SCRIPT_URL

Open:

**Cloudflare Dashboard → Workers & Pages → sbcf-events → Settings → Variables and Secrets**

Add:

Name:
`APPS_SCRIPT_URL`

Value:
your Google Apps Script URL ending in `/exec`

Example:

`https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXX/exec`

This value is used by the Cloudflare Worker. It is no longer exposed in `config.js`.

The included `wrangler.jsonc` has `keep_vars: true`, so a GitHub/Wrangler redeploy preserves dashboard-configured variables such as `APPS_SCRIPT_URL`.

---

## 4. Deploy from GitHub / Cloudflare

For a Cloudflare Worker project, use the repository root containing `wrangler.jsonc`.

If Cloudflare asks for commands:

Install command:
`npm install`

Deploy command:
`npx wrangler deploy`

No frontend build command is required.

The Wrangler configuration publishes:
- `src/index.js` as the Worker
- `public/` as static assets

---

## 5. Test the backend before registration

Open:

`https://sbcf-events.laxminarayan-tammini.workers.dev/backend-test.html`

Click **Test connection**.

Expected:

`Success: Cloudflare reached Google Apps Script and returned the response.`

This does not create a registration.

If it fails, the error now comes from the Cloudflare Worker and should identify whether:
- `APPS_SCRIPT_URL` is missing
- the URL is not `/exec`
- Apps Script is not publicly deployed
- Apps Script returned HTML instead of JSON

---

## 6. Test one real registration

Use:
- Age 12+ — €20
- Student — €15
- Below 12 — free
- phone may be blank

Expected:
1. Registration is added to Google Sheets.
2. Confirmation email is sent.
3. Browser immediately shows the success screen and registration ID.
4. QR ticket is shown.

---

## Why v5 is different

The older versions used:

Browser → hidden iframe → Apps Script → `postMessage`

That path was fragile because Google Apps Script can use redirects, sandboxed HTML and frame restrictions.

v5 uses:

Browser → Cloudflare `/api/backend` → server-to-server fetch → Apps Script JSON

Cloudflare and Apps Script communicate server-to-server, so browser iframe/CORS restrictions are removed from the registration path.
