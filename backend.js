function backendReady() {
  const url = window.EVENT_CONFIG?.googleAppsScriptUrl || "";
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(url);
}

function makeRequestId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function backendRequest(action, payload = {}, timeoutMs = 25000) {
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
      setTimeout(() => iframe.remove(), 100);
    };

    const onMessage = (event) => {
      if (done || event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== "SBCF_APPS_SCRIPT" || data.requestId !== requestId) return;
      done = true;
      cleanup();
      if (data.ok) resolve(data);
      else reject(new Error(data.message || "The request could not be completed."));
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("The request timed out. Check your connection and try again."));
    }, timeoutMs);

    window.addEventListener("message", onMessage);
    form.submit();
  });
}
