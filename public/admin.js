"use strict";

let adminKey = sessionStorage.getItem("sbcfAdminKey") || "";
let registrations = [];
let registrationOpen = true;
let busy = false;

const $ = id => document.getElementById(id);

$("adminKey").value = adminKey;
$("loginButton").addEventListener("click", login);
$("adminKey").addEventListener("keydown", e => { if (e.key === "Enter") login(); });
$("logoutButton").addEventListener("click", () => {
  sessionStorage.removeItem("sbcfAdminKey");
  location.reload();
});
$("refreshButton").addEventListener("click", () => loadDashboard());
$("searchInput").addEventListener("input", renderRows);
$("exportButton").addEventListener("click", exportCsv);
$("toggleRegistration").addEventListener("click", toggleRegistration);

$("registrationRows").addEventListener("click", e => {
  const button = e.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "confirm") confirmPayment(id);
  if (button.dataset.action === "resend") resendEmail(id);
  if (button.dataset.action === "checkin") checkIn(id);
});

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[char]));
}

function fmtMoney(value) {
  return new Intl.NumberFormat("en-NL", {style:"currency",currency:"EUR"}).format(Number(value || 0));
}

function fmtDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleString();
}

function paymentStatus(row) {
  const status = String(row.paymentStatus || "").toUpperCase();
  if (status) return status;
  if (Number(row.contribution || 0) <= 0) return "FREE";
  return String(row.status || "").toLowerCase() === "confirmed" ? "LEGACY" : "PENDING";
}

function setAdminMessage(message, type = "") {
  const el = $("adminMessage");
  el.textContent = message;
  el.className = "message " + type;
}

async function login() {
  adminKey = $("adminKey").value.trim();
  if (!adminKey) {
    $("loginMessage").textContent = "Enter the admin key.";
    return;
  }
  try {
    await loadDashboard();
    sessionStorage.setItem("sbcfAdminKey", adminKey);
    $("loginPanel").hidden = true;
    $("dashboard").hidden = false;
    $("logoutButton").hidden = false;
  } catch (err) {
    sessionStorage.removeItem("sbcfAdminKey");
    $("loginMessage").textContent = err.message;
    $("loginMessage").className = "message error";
  }
}

async function loadDashboard() {
  setAdminMessage("Loading registrations…");
  try {
    const response = await backendRequest("adminDashboard", {adminKey}, 30000);
    registrations = response.registrations || [];
    registrationOpen = !!response.registrationOpen;
    const summary = response.summary || {};
    $("mRegistrations").textContent = summary.registrations || 0;
    $("mAttendees").textContent = summary.attendees || 0;
    $("mRegular").textContent = summary.regular12plus || 0;
    $("mStudents").textContent = summary.students || 0;
    $("mUnder12").textContent = summary.under12 || 0;
    $("mContribution").textContent = fmtMoney(summary.contributionTotal || 0);
    $("mPaid").textContent = summary.paid || 0;
    $("mPending").textContent = summary.pending || 0;
    $("mReview").textContent = summary.review || 0;
    $("mCheckedIn").textContent = summary.checkedIn || 0;
    $("lastUpdated").textContent = "Updated " + new Date().toLocaleString();
    $("toggleRegistration").textContent = registrationOpen ? "Close registration" : "Open registration";
    $("toggleRegistration").classList.toggle("danger", registrationOpen);
    renderRows();
    setAdminMessage("");
  } catch (err) {
    setAdminMessage(err.message, "error");
    throw err;
  }
}

function renderRows() {
  const term = $("searchInput").value.trim().toLowerCase();
  const rows = registrations.filter(row => !term || [
    row.registrationId,row.fullName,row.email,row.phone,row.activities,row.paymentReference,row.paymentStatus
  ].join(" ").toLowerCase().includes(term));

  $("registrationRows").innerHTML = rows.map(row => {
    const id = escapeHtml(row.registrationId);
    const status = paymentStatus(row);
    const verified = status === "PAID" || status === "FREE" || status === "LEGACY";
    const paymentClass = verified ? "ok" : status === "REVIEW" ? "warn" : "neutral";
    const ticketSent = row.ticketEmailStatus === "Sent";
    const canConfirm = status === "PENDING" || status === "REVIEW";
    const retryTicket = status === "PAID" && !ticketSent;
    const canCheckIn = verified && row.checkInStatus !== "Checked in";

    const confirmButton = canConfirm
      ? '<button type="button" data-action="confirm" data-id="' + id + '">Confirm payment</button>'
      : retryTicket
        ? '<button type="button" data-action="confirm" data-id="' + id + '">Retry ticket email</button>'
        : "";

    return '<tr>' +
      '<td><strong>' + id + '</strong><small>' + fmtDate(row.submittedAt) + '</small></td>' +
      '<td><strong>' + escapeHtml(row.fullName) + '</strong><small>' + escapeHtml(row.email) + '<br>' + escapeHtml(row.phone) + '</small></td>' +
      '<td><strong>' + Number(row.totalAttendees || 0) + '</strong><small>' + Number(row.regular12plus || 0) + ' × 12+ • ' + Number(row.students || 0) + ' student • ' + Number(row.under12 || 0) + ' &lt;12<br>' + fmtMoney(row.contribution) + '</small></td>' +
      '<td>' + escapeHtml(row.activities || "Just attending") + '</td>' +
      '<td><span class="status ' + paymentClass + '">' + escapeHtml(status) + '</span><small>Reference: ' + escapeHtml(row.paymentReference || row.registrationId) + '<br>Due: ' + fmtMoney(row.contribution) + '</small></td>' +
      '<td><span class="status ' + (row.emailStatus === "Sent" ? "ok" : "warn") + '">' + escapeHtml(row.emailStatus || "—") + '</span><small>QR ticket email: ' + escapeHtml(row.ticketEmailStatus || "—") + '</small></td>' +
      '<td><span class="status ' + (row.checkInStatus === "Checked in" ? "ok" : "neutral") + '">' + escapeHtml(row.checkInStatus || "Not checked in") + '</span>' + (row.checkedInAt ? '<small>' + fmtDate(row.checkedInAt) + '</small>' : "") + '</td>' +
      '<td><div class="row-actions">' + confirmButton +
      '<button type="button" data-action="resend" data-id="' + id + '">Resend email</button>' +
      '<button type="button" data-action="checkin" data-id="' + id + '"' + (canCheckIn ? "" : " disabled") + '>Check in</button>' +
      '</div></td></tr>';
  }).join("") || '<tr><td colspan="8" class="empty">No registrations found.</td></tr>';
}

async function confirmPayment(id) {
  if (busy) return;
  const row = registrations.find(item => item.registrationId === id);
  if (!row) return;
  const retry = paymentStatus(row) === "PAID";
  const message = retry
    ? "Retry sending the QR ticket to " + row.fullName + " (" + id + ")?"
    : "Have you checked ING and verified that " + fmtMoney(row.contribution) +
      " was received with reference " + (row.paymentReference || id) +
      " for " + row.fullName + "?\n\nConfirming marks this registration PAID and sends the QR ticket email.";
  if (!confirm(message)) return;

  busy = true;
  try {
    setAdminMessage(retry ? "Sending QR ticket…" : "Confirming payment and sending QR ticket…");
    const result = await backendRequest("markPaymentPaid", {adminKey,registrationId:id}, 60000);
    await loadDashboard();
    if (result.ticketEmailSent) {
      setAdminMessage(id + ": " + (retry ? "QR ticket email sent." : "Payment confirmed and QR ticket email sent."), "success");
    } else {
      setAdminMessage(id + ": payment status is " + result.paymentStatus + ", but ticket email could not be confirmed. " + (result.emailError || "Use Retry ticket email."), "error");
    }
  } catch (err) {
    setAdminMessage("Payment confirmation could not be verified: " + err.message + ". Refresh the dashboard before trying again.", "error");
  } finally {
    busy = false;
  }
}

async function resendEmail(id) {
  if (busy || !confirm("Resend the appropriate payment instructions or QR ticket email for " + id + "?")) return;
  busy = true;
  try {
    setAdminMessage("Sending email…");
    const result = await backendRequest("resendEmail", {adminKey,registrationId:id}, 60000);
    await loadDashboard();
    setAdminMessage(id + ": " + (result.emailType === "payment" ? "payment instructions" : "QR ticket") + " email sent.", "success");
  } catch (err) {
    setAdminMessage(err.message, "error");
  } finally {
    busy = false;
  }
}

async function checkIn(id) {
  if (busy) return;
  busy = true;
  try {
    setAdminMessage("Checking in…");
    await backendRequest("checkin", {adminKey,registrationId:id});
    await loadDashboard();
    setAdminMessage(id + " checked in.", "success");
  } catch (err) {
    setAdminMessage(err.message, "error");
  } finally {
    busy = false;
  }
}

async function toggleRegistration() {
  const next = !registrationOpen;
  if (busy || !confirm((next ? "Open" : "Close") + " public registrations?")) return;
  busy = true;
  try {
    await backendRequest("setRegistrationOpen", {adminKey,open:next});
    await loadDashboard();
  } catch (err) {
    setAdminMessage(err.message, "error");
  } finally {
    busy = false;
  }
}

function exportCsv() {
  const headers = ["Registration ID","Submitted At","Full Name","Email","Phone","Age 12+","Below 12","Students","Total","Contribution","Payment Status","Payment Reference","Amount Received","Payment Verification","Payment Verified At","Ticket Email Status","Activities","Notes","Email Status","Check-in Status","Checked In At"];
  const values = registrations.map(row => [
    row.registrationId,row.submittedAt,row.fullName,row.email,row.phone,row.regular12plus,row.under12,row.students,row.totalAttendees,row.contribution,paymentStatus(row),row.paymentReference||row.registrationId,row.amountReceived,row.paymentVerification,row.paymentVerifiedAt,row.ticketEmailStatus,row.activities,row.notes,row.emailStatus,row.checkInStatus,row.checkedInAt
  ]);
  const csv = [headers,...values].map(row => row.map(value => '"' + String(value == null ? "" : value).replaceAll('"','""') + '"').join(",")).join("\n");
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
  link.href = url;
  link.download = "sbcf-diwali-registrations-" + new Date().toISOString().slice(0,10) + ".csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

if (adminKey) login();
