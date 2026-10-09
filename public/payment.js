"use strict";
const $ = id => document.getElementById(id);

function formatEuro(value) {
  return new Intl.NumberFormat("en-NL",{style:"currency",currency:"EUR"}).format(Number(value || 0));
}

async function showPaymentInstructions() {
  const params = new URLSearchParams(location.search);
  const registrationId = String(params.get("ref") || "").trim().toUpperCase();
  const token = String(params.get("token") || "").trim();
  if (!/^SBCF-26-[A-Z0-9]{6,}$/.test(registrationId) || !/^[a-f0-9]{32}$/i.test(token)) {
    $("paymentPageMessage").textContent = "This payment link is incomplete. Please open the full link from your registration email.";
    $("paymentPageMessage").className = "message error";
    return;
  }

  try {
    const response = await backendRequest("paymentDetails",{registrationId,token},30000);
    const payment = response.payment || {};
    const status = String(payment.status || "").toUpperCase();
    $("paymentPageRegistration").textContent = response.registrationId;
    $("paymentPageAmount").textContent = formatEuro(payment.amountDue);
    $("paymentPageHolder").textContent = payment.accountHolder || "Stichting Bharat Cultuur Friesland";
    $("paymentPageIban").textContent = payment.iban || "Not configured";
    $("paymentPageReference").textContent = payment.reference || registrationId;

    const alreadyConfirmed = status === "PAID" || status === "FREE" || status === "LEGACY";
    $("paymentPageTransfer").hidden = alreadyConfirmed;
    $("paymentPageStatus").textContent = alreadyConfirmed
      ? "Your registration is confirmed. No further payment is needed. Please check your email for the QR admission ticket."
      : status === "REVIEW"
        ? "Your payment needs manual review. If you already transferred the money, do not pay again."
        : "Payment is pending verification. Follow the instructions below only if you have not paid already.";
    $("paymentPageDetails").hidden = false;
    $("paymentPageMessage").textContent = "";
    if (!alreadyConfirmed && !payment.configured) {
      $("paymentPageTransfer").hidden = true;
      $("paymentPageMessage").textContent = "Bank details are not available. Please contact the SBCF organizer.";
      $("paymentPageMessage").className = "message error";
    }
  } catch (err) {
    $("paymentPageMessage").textContent = "Unable to load payment details: " + err.message;
    $("paymentPageMessage").className = "message error";
  }
}

document.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", async () => {
  const text = $(button.dataset.copy).textContent;
  try {
    await navigator.clipboard.writeText(text);
    $("paymentCopyStatus").textContent = "Copied to clipboard.";
  } catch (_) {
    $("paymentCopyStatus").textContent = "Copy is unavailable in this browser. Please select and copy the value above.";
  }
}));

showPaymentInstructions();
