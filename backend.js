function backendReady() {
  const url = window.EVENT_CONFIG?.googleAppsScriptUrl || "";
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(url);
}

function makeRequestId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calls Google Apps Script through a hidden form + iframe.
 *
 * Important compatibility fix:
 * Apps Script HtmlService can add an intermediate frame. Therefore we do not
 * require event.source === iframe.contentWindow. Instead the response is
 * correlated by a cryptographically-random requestId plus SBCF_APPS_SCRIPT marker.
 */
function backendRequest(action, payload = {}, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    if (!backendReady()) {
      reject(new Error("Google Apps Script is not configured yet. Add the deployed /exec URL in config.js."));
      return;
    }

    const requestId = makeRequestId();
    const iframe = document.createElement("iframe");
    iframe.name = `sbcf_backend_${requestId.replace(/[^a-zA-Z0-9_]/g, "")}`;
    iframe.hidden = true;
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const form = document.createElement("form");
    form.method = "POST";
    form.action = window.EVENT_CONFIG.googleAppsScriptUrl;
    form.target = iframe.name;
    form.hidden = true;

    const params = {
      action,
      requestId,
      payload: JSON.stringify(payload)
    };

    for (const [name, value] of Object.entries(params)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);

    let done = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      form.remove();
      setTimeout(() => iframe.remove(), 250);
    };

    const onMessage = (event) => {
      if (done) return;

      const data = event.data;
      if (!data ||
          data.source !== "SBCF_APPS_SCRIPT" ||
          data.requestId !== requestId) {
        return;
      }

      done = true;
      cleanup();

      if (data.ok) resolve(data);
      else reject(new Error(data.message || "The request could not be completed."));
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();

      const err = new Error("The request timed out.");
      err.code = "SBCF_TIMEOUT";
      reject(err);
    }, timeoutMs);

    window.addEventListener("message", onMessage);
    form.submit();
  });
}

/**
 * If a registration POST completed in Apps Script but its browser response was
 * lost, recover it by the clientRequestId already stored with the row.
 */
async function recoverRegistration(clientRequestId) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await delay(1800);

    try {
      const result = await backendRequest(
        "registrationStatus",
        { clientRequestId },
        15000
      );

      if (result.found && result.registrationId) return result;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  return null;
}
