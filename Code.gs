/**
 * SBCF Diwali Registration 2026
 * Google Apps Script backend with Google Sheets + Mollie payments + confirmation email.
 *
 * Create this Apps Script FROM the Google Sheet.
 *
 * Script Properties:
 *   ADMIN_KEY       = long organizer-only password
 *   MOLLIE_API_KEY  = test_xxx first, then live_xxx when ready
 *   PUBLIC_SITE_URL = e.g. https://sbcf-events.laxminarayan-tammini.workers.dev
 *
 * Optional:
 *   WEB_APP_URL     = the deployed Apps Script /exec URL.
 *                     Normally ScriptApp.getService().getUrl() is enough.
 */
const SETTINGS = {
  sheetName: "Registrations",
  registrationOpenDefault: true,
  maxAttendees: 30,

  organizerName: "Stichting Bharat Culture Friesland (SBCF)",
  eventName: "Diwali Celebration 2026",
  eventDate: "Update event date",
  eventTime: "Update event time",
  venue: "Update venue",
  replyTo: "",
  whatsappUrl: "",

  qrBaseUrl: "https://quickchart.io/qr?size=240&margin=2&text=",

  feeRegular12Plus: 20,
  feeUnder12: 0,
  feeStudent: 18,
  currency: "EUR"
};

const HEADERS = [
  "Submitted At",
  "Registration ID",
  "Request ID",
  "Full Name",
  "Email",
  "Phone",
  "Age 12+",
  "Below 12",
  "Students",
  "Total Attendees",
  "Contribution",
  "Currency",
  "Participants",
  "Activities",
  "Notes",
  "Privacy Notice Acknowledged",
  "Status",
  "Email Status",
  "Email Sent At",
  "Check-in Status",
  "Checked In At",
  "Source URL",
  "Payment ID",
  "Payment Status",
  "Payment Method",
  "Payment Checkout URL",
  "Paid At"
];

function setupSheet() {
  const sh = sheet_();
  ensureHeaders_(sh);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#0b1b78")
    .setFontColor("#ffffff");
  sh.autoResizeColumns(1, HEADERS.length);

  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("REGISTRATION_OPEN") === null) {
    props.setProperty("REGISTRATION_OPEN", String(SETTINGS.registrationOpenDefault));
  }
  return "SBCF registration sheet is ready.";
}

function doGet() {
  return HtmlService.createHtmlOutput(
    "<p>SBCF registration and payment service is running.</p>"
  );
}

function doPost(e) {
  // Classic Mollie payment webhook: POST id=tr_xxxxx
  if (e && e.parameter && e.parameter.id && !e.parameter.action) {
    try {
      processMolliePaymentById_(String(e.parameter.id));
      return ContentService.createTextOutput("OK");
    } catch (err) {
      console.error("Mollie webhook error", err);
      // Return 200 text so repeated malformed/irrelevant hooks do not create a loop.
      return ContentService.createTextOutput("ERROR");
    }
  }

  const requestId = String((e && e.parameter && e.parameter.requestId) || "");
  try {
    const action = String((e && e.parameter && e.parameter.action) || "");
    const payload = JSON.parse(String((e && e.parameter && e.parameter.payload) || "{}"));

    let result;
    switch (action) {
      case "register":
        result = register_(payload);
        break;
      case "paymentStatus":
        result = paymentStatus_(payload.registrationId);
        break;
      case "retryPayment":
        result = retryPayment_(payload.registrationId);
        break;
      case "adminDashboard":
        requireAdmin_(payload);
        result = dashboard_();
        break;
      case "checkin":
        requireAdmin_(payload);
        result = checkin_(payload.registrationId);
        break;
      case "resendEmail":
        requireAdmin_(payload);
        result = resendEmail_(payload.registrationId);
        break;
      case "setRegistrationOpen":
        requireAdmin_(payload);
        result = setRegistrationOpen_(payload.open);
        break;
      default:
        throw new Error("Unknown backend action.");
    }
    return htmlResponse_(Object.assign({ ok: true, requestId }, result || {}));
  } catch (err) {
    console.error(err);
    return htmlResponse_({
      ok: false,
      requestId,
      message: err && err.message ? err.message : "Unexpected server error."
    });
  }
}

function register_(d) {
  if (!registrationOpen_()) {
    throw new Error("Registration is currently closed. Please contact the SBCF event team.");
  }
  if (String(d.website || "").trim()) {
    return { registrationId: "SBCF-SPAM", paymentRequired: false, emailSent: false };
  }

  validateRegistration_(d);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    ensureHeaders_(sh);

    const existing = findByRequestId_(sh, String(d.clientRequestId || ""));
    if (existing) {
      if (existing.status === "Confirmed") {
        return {
          registrationId: existing.registrationId,
          confirmed: true,
          paymentRequired: false,
          emailSent: existing.emailStatus === "Sent"
        };
      }
      if (existing.paymentCheckoutUrl &&
          ["open", "pending", "authorized"].includes(String(existing.paymentStatus).toLowerCase())) {
        return {
          registrationId: existing.registrationId,
          confirmed: false,
          paymentRequired: true,
          checkoutUrl: existing.paymentCheckoutUrl
        };
      }
      const existingRow = findRowById_(sh, existing.registrationId);
      return retryPaymentLocked_(sh, existingRow);
    }

    const registrationId = makeRegistrationId_();
    const participants = (Array.isArray(d.participants) ? d.participants : [])
      .map(p => `${clean_(p.name, 100)} [${clean_(p.type, 40)}]`)
      .join(" | ");
    const activities = (Array.isArray(d.activities) ? d.activities : [])
      .map(x => clean_(x, 80))
      .join(", ") || "Just attending";

    const calculatedContribution =
      num_(d.regular12plus) * SETTINGS.feeRegular12Plus +
      num_(d.under12) * SETTINGS.feeUnder12 +
      num_(d.students) * SETTINGS.feeStudent;

    const needsPayment = calculatedContribution > 0;

    const row = [
      new Date(),
      registrationId,
      clean_(d.clientRequestId, 120),
      clean_(d.fullName, 120),
      clean_(d.email, 160),
      clean_(d.phone, 60),
      num_(d.regular12plus),
      num_(d.under12),
      num_(d.students),
      num_(d.totalAttendees),
      money_(calculatedContribution),
      SETTINGS.currency,
      participants,
      activities,
      clean_(d.notes, 1500),
      d.privacyAcknowledged ? "Yes" : "No",
      needsPayment ? "Pending payment" : "Confirmed",
      "Pending",
      "",
      "Not checked in",
      "",
      clean_(d.sourceUrl, 500),
      "",
      needsPayment ? "Creating" : "Not required",
      "",
      "",
      needsPayment ? "" : new Date()
    ];

    sh.appendRow(row);
    const rowNumber = sh.getLastRow();

    if (!needsPayment) {
      const emailResult = sendConfirmationForRow_(sh, rowNumber);
      return {
        registrationId,
        confirmed: true,
        paymentRequired: false,
        contribution: calculatedContribution,
        currency: SETTINGS.currency,
        emailSent: emailResult.sent,
        emailError: emailResult.error
      };
    }

    try {
      const payment = createMolliePayment_(registrationId, calculatedContribution);
      sh.getRange(rowNumber, col_("Payment ID")).setValue(payment.id || "");
      sh.getRange(rowNumber, col_("Payment Status")).setValue(payment.status || "open");
      sh.getRange(rowNumber, col_("Payment Method")).setValue(payment.method || "");
      sh.getRange(rowNumber, col_("Payment Checkout URL")).setValue(payment.checkoutUrl || "");

      return {
        registrationId,
        confirmed: false,
        paymentRequired: true,
        contribution: calculatedContribution,
        currency: SETTINGS.currency,
        checkoutUrl: payment.checkoutUrl
      };
    } catch (paymentErr) {
      sh.getRange(rowNumber, col_("Status")).setValue("Payment setup failed");
      sh.getRange(rowNumber, col_("Payment Status")).setValue("error");
      throw paymentErr;
    }
  } finally {
    lock.releaseLock();
  }
}

function paymentStatus_(registrationId) {
  registrationId = normalizeRegistrationId_(registrationId);
  if (!registrationId) throw new Error("Registration ID is required.");

  const sh = sheet_();
  const row = findRowById_(sh, registrationId);
  if (!row) throw new Error("Registration not found.");

  let obj = rowObject_(sh, row);

  if (obj.paymentId && obj.status !== "Confirmed") {
    try {
      processMolliePaymentById_(obj.paymentId);
      obj = rowObject_(sh, row);
    } catch (err) {
      console.error("Payment refresh failed", err);
    }
  }

  return publicPaymentResult_(obj);
}

function retryPayment_(registrationId) {
  registrationId = normalizeRegistrationId_(registrationId);
  if (!registrationId) throw new Error("Registration ID is required.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const row = findRowById_(sh, registrationId);
    if (!row) throw new Error("Registration not found.");
    return retryPaymentLocked_(sh, row);
  } finally {
    lock.releaseLock();
  }
}

function retryPaymentLocked_(sh, row) {
  let obj = rowObject_(sh, row);
  const registrationId = obj.registrationId;

  if (obj.status === "Confirmed") {
    return publicPaymentResult_(obj);
  }

  if (Number(obj.contribution || 0) <= 0) {
    sh.getRange(row, col_("Status")).setValue("Confirmed");
    sh.getRange(row, col_("Payment Status")).setValue("Not required");
    sh.getRange(row, col_("Paid At")).setValue(new Date());
    const emailResult = sendConfirmationForRow_(sh, row);
    obj = rowObject_(sh, row);
    const result = publicPaymentResult_(obj);
    result.emailSent = emailResult.sent;
    return result;
  }

  // If the current payment is still usable, reuse its checkout URL.
  if (obj.paymentId) {
    try {
      const payment = fetchMolliePayment_(obj.paymentId);
      applyMolliePayment_(payment);
      obj = rowObject_(sh, row);

      if (obj.status === "Confirmed") return publicPaymentResult_(obj);

      if (["open", "pending", "authorized"].includes(String(payment.status || "").toLowerCase()) &&
          obj.paymentCheckoutUrl) {
        return {
          registrationId,
          confirmed: false,
          paymentRequired: true,
          contribution: obj.contribution,
          currency: obj.currency,
          paymentStatus: payment.status,
          checkoutUrl: obj.paymentCheckoutUrl
        };
      }
    } catch (err) {
      console.error("Existing payment lookup failed", err);
    }
  }

  const payment = createMolliePayment_(registrationId, Number(obj.contribution));
  sh.getRange(row, col_("Status")).setValue("Pending payment");
  sh.getRange(row, col_("Payment ID")).setValue(payment.id || "");
  sh.getRange(row, col_("Payment Status")).setValue(payment.status || "open");
  sh.getRange(row, col_("Payment Method")).setValue(payment.method || "");
  sh.getRange(row, col_("Payment Checkout URL")).setValue(payment.checkoutUrl || "");

  return {
    registrationId,
    confirmed: false,
    paymentRequired: true,
    contribution: obj.contribution,
    currency: obj.currency,
    paymentStatus: payment.status || "open",
    checkoutUrl: payment.checkoutUrl
  };
}

function createMolliePayment_(registrationId, amount) {
  const apiKey = requireProperty_("MOLLIE_API_KEY");
  const publicSiteUrl = requireProperty_("PUBLIC_SITE_URL").replace(/\/+$/, "");
  const webAppUrl = getWebAppUrl_();

  const value = Number(amount).toFixed(2);
  const payload = {
    amount: { currency: SETTINGS.currency, value },
    description: `${SETTINGS.eventName} — ${registrationId}`,
    redirectUrl: `${publicSiteUrl}/payment.html?registrationId=${encodeURIComponent(registrationId)}`,
    cancelUrl: `${publicSiteUrl}/payment.html?registrationId=${encodeURIComponent(registrationId)}&cancelled=1`,
    webhookUrl: webAppUrl,
    metadata: {
      registrationId,
      expectedAmount: value,
      currency: SETTINGS.currency
    }
  };

  const response = UrlFetchApp.fetch("https://api.mollie.com/v2/payments", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${apiKey}` },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();
  let json;
  try { json = JSON.parse(body); } catch (_) { json = {}; }

  if (code < 200 || code >= 300) {
    const detail = json && json.detail ? json.detail : `HTTP ${code}`;
    throw new Error(`Mollie could not create the payment: ${detail}`);
  }

  const checkoutUrl = json && json._links && json._links.checkout && json._links.checkout.href;
  if (!json.id || !checkoutUrl) {
    throw new Error("Mollie returned an incomplete payment response.");
  }

  return {
    id: json.id,
    status: json.status || "open",
    method: json.method || "",
    checkoutUrl
  };
}

function fetchMolliePayment_(paymentId) {
  const apiKey = requireProperty_("MOLLIE_API_KEY");
  const response = UrlFetchApp.fetch(
    `https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "get",
      headers: { Authorization: `Bearer ${apiKey}` },
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  const body = response.getContentText();
  let json;
  try { json = JSON.parse(body); } catch (_) { json = {}; }

  if (code < 200 || code >= 300) {
    const detail = json && json.detail ? json.detail : `HTTP ${code}`;
    throw new Error(`Mollie payment lookup failed: ${detail}`);
  }
  return json;
}

function processMolliePaymentById_(paymentId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const payment = fetchMolliePayment_(paymentId);
    return applyMolliePayment_(payment);
  } finally {
    lock.releaseLock();
  }
}

function applyMolliePayment_(payment) {
  let metadata = payment.metadata || {};
  if (typeof metadata === "string") {
    try { metadata = JSON.parse(metadata); } catch (_) { metadata = {}; }
  }

  const registrationId = normalizeRegistrationId_(metadata.registrationId || "");
  if (!registrationId) throw new Error("Mollie payment is missing the SBCF registration ID.");

  const sh = sheet_();
  const row = findRowById_(sh, registrationId);
  if (!row) throw new Error("Registration for this Mollie payment was not found.");

  const obj = rowObject_(sh, row);
  const expected = Number(obj.contribution || 0).toFixed(2);
  const paidAmount = payment && payment.amount ? String(payment.amount.value || "") : "";
  const currency = payment && payment.amount ? String(payment.amount.currency || "") : "";

  if (paidAmount !== expected || currency !== SETTINGS.currency) {
    throw new Error("Payment amount/currency does not match the registration.");
  }

  const status = String(payment.status || "").toLowerCase();
  sh.getRange(row, col_("Payment ID")).setValue(payment.id || obj.paymentId || "");
  sh.getRange(row, col_("Payment Status")).setValue(status || "unknown");
  sh.getRange(row, col_("Payment Method")).setValue(payment.method || obj.paymentMethod || "");

  if (payment._links && payment._links.checkout && payment._links.checkout.href) {
    sh.getRange(row, col_("Payment Checkout URL")).setValue(payment._links.checkout.href);
  }

  if (status === "paid") {
    const wasConfirmed = obj.status === "Confirmed";
    sh.getRange(row, col_("Status")).setValue("Confirmed");
    if (!obj.paidAt) {
      sh.getRange(row, col_("Paid At")).setValue(payment.paidAt ? new Date(payment.paidAt) : new Date());
    }

    const refreshed = rowObject_(sh, row);
    if (!wasConfirmed || refreshed.emailStatus !== "Sent") {
      sendConfirmationForRow_(sh, row);
    }
  } else if (["open", "pending", "authorized"].includes(status)) {
    sh.getRange(row, col_("Status")).setValue("Pending payment");
  } else if (status === "canceled") {
    sh.getRange(row, col_("Status")).setValue("Payment canceled");
  } else if (status === "expired") {
    sh.getRange(row, col_("Status")).setValue("Payment expired");
  } else if (status === "failed") {
    sh.getRange(row, col_("Status")).setValue("Payment failed");
  }

  return publicPaymentResult_(rowObject_(sh, row));
}

function publicPaymentResult_(obj) {
  return {
    registrationId: obj.registrationId,
    status: obj.status,
    paymentStatus: obj.paymentStatus,
    paymentRequired: Number(obj.contribution || 0) > 0,
    contribution: Number(obj.contribution || 0),
    currency: obj.currency || SETTINGS.currency,
    confirmed: obj.status === "Confirmed",
    emailSent: obj.emailStatus === "Sent"
  };
}

/**
 * Optional resilience job.
 * Run setupPaymentReconciliationTrigger() once from the Apps Script editor.
 * It checks pending Mollie payments every 5 minutes, so confirmation can still
 * complete if a webhook delivery is missed or temporarily fails.
 */
function setupPaymentReconciliationTrigger() {
  const handler = "reconcilePendingPayments";
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handler)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyMinutes(5)
    .create();

  return "Payment reconciliation trigger installed.";
}

function reconcilePendingPayments() {
  const sh = sheet_();
  ensureHeaders_(sh);
  const rows = allObjects_(sh);

  rows
    .filter(r =>
      r.paymentId &&
      r.status !== "Confirmed" &&
      ["open", "pending", "authorized", "creating", ""].includes(String(r.paymentStatus || "").toLowerCase())
    )
    .slice(0, 50)
    .forEach(r => {
      try {
        processMolliePaymentById_(r.paymentId);
      } catch (err) {
        console.error(`Could not reconcile ${r.registrationId}`, err);
      }
    });
}

function dashboard_() {
  const sh = sheet_();
  ensureHeaders_(sh);
  const rows = allObjects_(sh).reverse();

  const summary = {
    registrations: rows.length,
    confirmedRegistrations: 0,
    pendingPayments: 0,
    attendees: 0,
    regular12plus: 0,
    under12: 0,
    students: 0,
    activityRegistrations: 0,
    checkedIn: 0,
    expectedContribution: 0,
    paidTotal: 0
  };

  rows.forEach(r => {
    summary.attendees += num_(r.totalAttendees);
    summary.regular12plus += num_(r.regular12plus);
    summary.under12 += num_(r.under12);
    summary.students += num_(r.students);
    summary.expectedContribution += Number(r.contribution || 0);

    if (r.status === "Confirmed") {
      summary.confirmedRegistrations++;
      summary.paidTotal += Number(r.contribution || 0);
    } else if (Number(r.contribution || 0) > 0) {
      summary.pendingPayments++;
    }

    if (r.activities && r.activities !== "Just attending") summary.activityRegistrations++;
    if (r.checkInStatus === "Checked in") summary.checkedIn += num_(r.totalAttendees);
  });

  return { registrationOpen: registrationOpen_(), summary, registrations: rows };
}

function checkin_(registrationId) {
  registrationId = normalizeRegistrationId_(registrationId);
  if (!registrationId) throw new Error("Registration ID is required.");

  const sh = sheet_();
  const row = findRowById_(sh, registrationId);
  if (!row) throw new Error("Registration not found.");

  const obj = rowObject_(sh, row);
  if (obj.status !== "Confirmed") {
    throw new Error(`Registration is not confirmed. Current status: ${obj.status || "Unknown"}.`);
  }

  if (obj.checkInStatus === "Checked in") {
    return {
      registrationId,
      fullName: obj.fullName,
      totalAttendees: obj.totalAttendees,
      alreadyCheckedIn: true,
      checkedInAt: obj.checkedInAt
    };
  }

  sh.getRange(row, col_("Check-in Status")).setValue("Checked in");
  sh.getRange(row, col_("Checked In At")).setValue(new Date());

  return {
    registrationId,
    fullName: obj.fullName,
    totalAttendees: obj.totalAttendees,
    alreadyCheckedIn: false
  };
}

function resendEmail_(registrationId) {
  const sh = sheet_();
  const row = findRowById_(sh, normalizeRegistrationId_(registrationId));
  if (!row) throw new Error("Registration not found.");

  const obj = rowObject_(sh, row);
  if (obj.status !== "Confirmed") {
    throw new Error("Confirmation email can only be sent after the registration is confirmed.");
  }

  const result = sendConfirmationForRow_(sh, row);
  if (!result.sent) throw new Error(result.error || "Email could not be sent.");
  return { sent: true, registrationId: obj.registrationId };
}

function setRegistrationOpen_(open) {
  PropertiesService.getScriptProperties().setProperty(
    "REGISTRATION_OPEN",
    String(Boolean(open))
  );
  return { registrationOpen: Boolean(open) };
}

function registrationOpen_() {
  const v = PropertiesService.getScriptProperties().getProperty("REGISTRATION_OPEN");
  return v === null ? SETTINGS.registrationOpenDefault : v === "true";
}

function sendConfirmationForRow_(sh, row) {
  const obj = rowObject_(sh, row);

  // Idempotent: do not send twice automatically for the same confirmed registration.
  if (obj.emailStatus === "Sent") {
    return { sent: true, alreadySent: true };
  }

  try {
    sendConfirmation_(obj);
    sh.getRange(row, col_("Email Status")).setValue("Sent");
    sh.getRange(row, col_("Email Sent At")).setValue(new Date());
    return { sent: true, error: "" };
  } catch (mailErr) {
    const msg = mailErr && mailErr.message ? mailErr.message : String(mailErr);
    sh.getRange(row, col_("Email Status")).setValue("Failed");
    return { sent: false, error: msg };
  }
}

function sendConfirmation_(r) {
  if (!r.email) throw new Error("No email address is available.");
  if (r.status !== "Confirmed") throw new Error("Registration is not confirmed.");

  const ticket = `SBCF:${r.registrationId}`;
  const qr = SETTINGS.qrBaseUrl + encodeURIComponent(ticket);
  const paymentLabel = Number(r.contribution || 0) > 0
    ? `${html_(r.paymentStatus || "paid")} · €${Number(r.contribution || 0).toFixed(2)}`
    : "No payment required";

  const whatsapp = SETTINGS.whatsappUrl
    ? `<p style="margin:22px 0"><a href="${html_(SETTINGS.whatsappUrl)}" style="background:#315a20;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700">Join WhatsApp group</a></p>`
    : "";

  const phoneLine = r.phone
    ? `<tr><td style="padding:6px 0;color:#667085">Phone</td><td style="padding:6px 0;font-weight:bold">${html_(r.phone)}</td></tr>`
    : "";

  const lines =
    `<tr><td style="padding:6px 0;color:#667085">Age 12+</td><td style="padding:6px 0;font-weight:bold">${num_(r.regular12plus)} × €20</td></tr>` +
    `<tr><td style="padding:6px 0;color:#667085">Students</td><td style="padding:6px 0;font-weight:bold">${num_(r.students)} × €18</td></tr>` +
    `<tr><td style="padding:6px 0;color:#667085">Below 12</td><td style="padding:6px 0;font-weight:bold">${num_(r.under12)} × Free</td></tr>` +
    `<tr><td style="padding:8px 0;color:#315a20;font-weight:bold">Payment</td><td style="padding:8px 0;color:#315a20;font-weight:bold">${paymentLabel}</td></tr>`;

  const body =
    `<div style="background:#fffaf4;padding:24px;font-family:Arial,sans-serif;color:#172033">` +
    `<div style="max-width:650px;margin:auto;background:#fff;border:1px solid #e7e4de;border-radius:18px;overflow:hidden">` +
    `<div style="height:6px;background:linear-gradient(90deg,#f47d20 0 33%,#ffffff 33% 66%,#315a20 66%)"></div>` +
    `<div style="background:#0b1b78;color:#fff;padding:27px">` +
    `<div style="font-size:12px;color:#ffb36a;letter-spacing:1.6px;font-weight:bold">STICHTING BHARAT CULTURE FRIESLAND</div>` +
    `<h1 style="font-family:Georgia,serif;margin:8px 0 4px">${html_(SETTINGS.eventName)}</h1>` +
    `<p style="margin:0;color:#dbe1ff">Registration confirmed</p></div>` +
    `<div style="padding:28px">` +
    `<p>Hello ${html_(r.fullName)},</p>` +
    `<p>Your SBCF event registration is confirmed. Please keep this email and show the QR ticket at the entrance.</p>` +
    `<div style="background:#fff1e4;border:1px solid #ffd1aa;padding:15px;border-radius:10px;text-align:center;margin:20px 0">` +
    `<small>REGISTRATION ID</small><div style="font-size:22px;font-weight:bold;color:#0b1b78;margin-top:4px">${html_(r.registrationId)}</div></div>` +
    `<table style="width:100%;font-size:14px;border-collapse:collapse">` +
    `<tr><td style="padding:6px 0;color:#667085">Date</td><td style="padding:6px 0;font-weight:bold">${html_(SETTINGS.eventDate)}</td></tr>` +
    `<tr><td style="padding:6px 0;color:#667085">Time</td><td style="padding:6px 0;font-weight:bold">${html_(SETTINGS.eventTime)}</td></tr>` +
    `<tr><td style="padding:6px 0;color:#667085">Venue</td><td style="padding:6px 0;font-weight:bold">${html_(SETTINGS.venue)}</td></tr>` +
    `<tr><td style="padding:6px 0;color:#667085">Total attendees</td><td style="padding:6px 0;font-weight:bold">${num_(r.totalAttendees)}</td></tr>` +
    phoneLine + lines +
    `<tr><td style="padding:6px 0;color:#667085">Activities</td><td style="padding:6px 0;font-weight:bold">${html_(r.activities || "Just attending")}</td></tr>` +
    `</table>` +
    `<div style="text-align:center;margin:24px 0"><img src="${qr}" width="220" height="220" alt="SBCF registration QR ticket">` +
    `<div style="font-size:12px;color:#667085">QR ticket: ${html_(ticket)}</div></div>` +
    whatsapp +
    `<p>Students should carry a valid student ID if requested by the event team.</p>` +
    `<p>We look forward to celebrating together.</p>` +
    `<p style="font-weight:bold;color:#315a20">${html_(SETTINGS.organizerName)}</p>` +
    `</div></div></div>`;

  const plain =
    `Hello ${r.fullName},\n\n` +
    `Your registration for ${SETTINGS.eventName} is confirmed.\n` +
    `Registration ID: ${r.registrationId}\n` +
    `Date: ${SETTINGS.eventDate}\n` +
    `Time: ${SETTINGS.eventTime}\n` +
    `Venue: ${SETTINGS.venue}\n\n` +
    `Age 12+: ${r.regular12plus} x EUR 20\n` +
    `Students: ${r.students} x EUR 18\n` +
    `Below 12: ${r.under12} x Free\n` +
    `Payment: ${Number(r.contribution || 0) > 0 ? `EUR ${Number(r.contribution || 0).toFixed(2)} (${r.paymentStatus || "paid"})` : "No payment required"}\n` +
    `Activities: ${r.activities}\n\n` +
    `Please show your registration ID or QR ticket at the entrance. Students should carry a valid student ID if requested.\n\n` +
    `${SETTINGS.organizerName}`;

  const options = { htmlBody: body, name: SETTINGS.organizerName };
  if (SETTINGS.replyTo) options.replyTo = SETTINGS.replyTo;
  MailApp.sendEmail(r.email, `Registration confirmed — ${SETTINGS.eventName}`, plain, options);
}

function validateRegistration_(d) {
  if (!String(d.clientRequestId || "").trim()) throw new Error("Missing request ID.");
  if (!String(d.fullName || "").trim()) throw new Error("Full name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email || "").trim())) {
    throw new Error("A valid email address is required.");
  }

  // Phone is intentionally optional.
  const expected = num_(d.regular12plus) + num_(d.under12) + num_(d.students);
  const total = num_(d.totalAttendees);

  if (total !== expected) throw new Error("Attendee category totals do not match.");
  if (total < 1 || total > SETTINGS.maxAttendees) {
    throw new Error(`Attendees must be between 1 and ${SETTINGS.maxAttendees}.`);
  }
  if (!d.privacyAcknowledged) throw new Error("Please acknowledge the privacy notice.");

  if (!Array.isArray(d.participants) || d.participants.length !== total) {
    throw new Error("Participant details do not match the attendee count.");
  }

  const counts = { "Age 12+": 0, "Below 12": 0, "Student": 0 };
  d.participants.forEach(p => {
    if (!String(p.name || "").trim()) throw new Error("Each participant needs a name.");
    const type = String(p.type || "");
    if (!(type in counts)) throw new Error("Invalid registration category.");
    counts[type]++;
  });

  if (counts["Age 12+"] !== num_(d.regular12plus) ||
      counts["Below 12"] !== num_(d.under12) ||
      counts["Student"] !== num_(d.students)) {
    throw new Error("Participant categories do not match the selected totals.");
  }

  // Never trust the browser's amount.
  const serverAmount =
    num_(d.regular12plus) * SETTINGS.feeRegular12Plus +
    num_(d.under12) * SETTINGS.feeUnder12 +
    num_(d.students) * SETTINGS.feeStudent;

  if (money_(d.contributionAmount) !== money_(serverAmount)) {
    throw new Error("Contribution amount does not match the selected registration categories.");
  }
}

function requireAdmin_(payload) {
  const key = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!key) throw new Error("ADMIN_KEY is not configured in Apps Script Script Properties.");
  if (String(payload.adminKey || "") !== key) throw new Error("Incorrect admin key.");
}

function requireProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`${name} is not configured in Apps Script Script Properties.`);
  return value;
}

function getWebAppUrl_() {
  const props = PropertiesService.getScriptProperties();
  const configured = String(props.getProperty("WEB_APP_URL") || "").trim();
  if (configured) return configured;

  const url = ScriptApp.getService().getUrl();
  if (!url) {
    throw new Error("Could not determine the Apps Script Web App URL. Add WEB_APP_URL to Script Properties.");
  }
  return url;
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Create this Apps Script from inside the Google Sheet.");
  return ss.getSheetByName(SETTINGS.sheetName) || ss.insertSheet(SETTINGS.sheetName);
}

function ensureHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    return;
  }

  const existingCount = Math.max(sh.getLastColumn(), HEADERS.length);
  const cur = sh.getRange(1, 1, 1, existingCount).getValues()[0];

  HEADERS.forEach((header, i) => {
    // V2 used "Consent" in this same position; safely rename it.
    if (i === 15 && cur[i] === "Consent") {
      sh.getRange(1, i + 1).setValue(header);
    } else if (!cur[i]) {
      sh.getRange(1, i + 1).setValue(header);
    } else if (cur[i] !== header && i >= 22) {
      sh.getRange(1, i + 1).setValue(header);
    }
  });
}

function col_(header) {
  const i = HEADERS.indexOf(header);
  if (i < 0) throw new Error(`Unknown column: ${header}`);
  return i + 1;
}

function makeRegistrationId_() {
  return `SBCF-26-${Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function normalizeRegistrationId_(id) {
  return String(id || "").replace(/^SBCF:/i, "").trim().toUpperCase();
}

function findRowById_(sh, id) {
  if (!id || sh.getLastRow() < 2) return 0;
  const vals = sh.getRange(2, col_("Registration ID"), sh.getLastRow() - 1, 1)
    .getDisplayValues().flat();
  const i = vals.findIndex(v => String(v).toUpperCase() === String(id).toUpperCase());
  return i < 0 ? 0 : i + 2;
}

function findByRequestId_(sh, id) {
  if (!id || sh.getLastRow() < 2) return null;
  const vals = sh.getRange(2, col_("Request ID"), sh.getLastRow() - 1, 1)
    .getDisplayValues().flat();
  const i = vals.indexOf(id);
  return i < 0 ? null : rowObject_(sh, i + 2);
}

function allObjects_(sh) {
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length)
    .getValues()
    .map(row => objectFromRow_(row));
}

function rowObject_(sh, row) {
  return objectFromRow_(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
}

function objectFromRow_(v) {
  return {
    submittedAt: iso_(v[0]),
    registrationId: String(v[1] || ""),
    requestId: String(v[2] || ""),
    fullName: String(v[3] || ""),
    email: String(v[4] || ""),
    phone: String(v[5] || ""),
    regular12plus: num_(v[6]),
    under12: num_(v[7]),
    students: num_(v[8]),
    totalAttendees: num_(v[9]),
    contribution: Number(v[10] || 0),
    currency: String(v[11] || ""),
    participants: String(v[12] || ""),
    activities: String(v[13] || ""),
    notes: String(v[14] || ""),
    privacyAcknowledged: String(v[15] || ""),
    status: String(v[16] || ""),
    emailStatus: String(v[17] || ""),
    emailSentAt: iso_(v[18]),
    checkInStatus: String(v[19] || ""),
    checkedInAt: iso_(v[20]),
    sourceUrl: String(v[21] || ""),
    paymentId: String(v[22] || ""),
    paymentStatus: String(v[23] || ""),
    paymentMethod: String(v[24] || ""),
    paymentCheckoutUrl: String(v[25] || ""),
    paidAt: iso_(v[26])
  };
}

function num_(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function money_(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

function clean_(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 1000);
}

function iso_(v) {
  if (!v) return "";
  try { return new Date(v).toISOString(); } catch (_) { return String(v); }
}

function html_(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlResponse_(obj) {
  const data = JSON.stringify(Object.assign({ source: "SBCF_APPS_SCRIPT" }, obj))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return HtmlService.createHtmlOutput(
    `<!doctype html><meta charset="utf-8"><script>window.parent.postMessage(${data},"*");<\\/script>`
  );
}
