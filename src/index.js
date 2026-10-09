const ALLOWED_ACTIONS = new Set([
  "ping",
  "register",
  "registrationStatus",
  "paymentDetails",
  "adminDashboard",
  "markPaymentPaid",
  "checkin",
  "resendEmail",
  "setRegistrationOpen"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function callAppsScript(env, action, requestId, payload) {
  const endpoint = String(env.APPS_SCRIPT_URL || "").trim();

  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(endpoint)) {
    throw new Error("Cloudflare APPS_SCRIPT_URL is missing or is not a deployed Google Apps Script /exec URL.");
  }

  const form = new URLSearchParams();
  form.set("action", action);
  form.set("requestId", requestId);
  form.set("payload", JSON.stringify(payload || {}));
  form.set("transport", "cloudflare-worker");

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "Accept": "application/json"
    },
    body: form.toString(),
    redirect: "follow"
  });

  const text = await upstream.text();

  let result;
  try {
    result = JSON.parse(text);
  } catch (_) {
    const preview = text.replace(/\s+/g, " ").slice(0, 220);
    throw new Error(
      `Google Apps Script did not return JSON (HTTP ${upstream.status}). ` +
      `Make sure the latest Code.gs is deployed as a Web App. Response: ${preview}`
    );
  }

  if (!upstream.ok) {
    throw new Error(result.message || `Google Apps Script returned HTTP ${upstream.status}.`);
  }

  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/backend") {
      if (request.method !== "POST") {
        return json({ ok: false, message: "Method not allowed." }, 405);
      }

      try {
        const body = await request.json();
        const action = String(body.action || "");
        const requestId = String(body.requestId || crypto.randomUUID());
        const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

        if (!ALLOWED_ACTIONS.has(action)) {
          return json({ ok: false, message: "Unknown backend action." }, 400);
        }

        const result = await callAppsScript(env, action, requestId, payload);
        return json(result, result.ok === false ? 400 : 200);
      } catch (err) {
        return json({
          ok: false,
          message: err && err.message ? err.message : "Cloudflare backend proxy failed."
        }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
