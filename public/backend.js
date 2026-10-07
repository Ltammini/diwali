function makeRequestId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backendRequest(action, payload = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/backend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        action,
        requestId: makeRequestId(),
        payload
      })
    });

    let result;
    try {
      result = await response.json();
    } catch (_) {
      throw new Error(`Backend returned HTTP ${response.status} without a valid JSON response.`);
    }

    if (!response.ok || !result.ok) {
      throw new Error(result.message || `Backend request failed with HTTP ${response.status}.`);
    }

    return result;
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("The backend request took too long. Open backend-test.html to check the Cloudflare → Apps Script connection.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Recovery for the rare case where the registration request succeeds upstream
 * but the client loses the HTTP response.
 */
async function recoverRegistration(clientRequestId) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await delay(1200);
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
