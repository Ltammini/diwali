const cfg=window.EVENT_CONFIG;
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const registrationId=(params.get("registrationId")||localStorage.getItem("sbcfPendingRegistrationId")||"").trim().toUpperCase();
let pollTimer=null,pollCount=0,busy=false;

function money(v,currency="EUR"){
  return new Intl.NumberFormat("en-NL",{style:"currency",currency}).format(Number(v||0));
}
function qrUrl(id){return `https://quickchart.io/qr?size=220&margin=2&text=${encodeURIComponent(`SBCF:${id}`)}`;}

function showState(result){
  $("paymentDetails").hidden=false;
  $("paymentRegistrationId").textContent=result.registrationId||registrationId;
  $("paymentAmount").textContent=money(result.contribution,result.currency||"EUR");
  $("paymentStatusText").textContent=result.paymentStatus||result.status||"Pending";
  $("paymentError").textContent="";

  if(result.confirmed){
    clearInterval(pollTimer);
    localStorage.removeItem("sbcfPendingRequestId");
    localStorage.removeItem("sbcfPendingRegistrationId");
    $("paymentSpinner").hidden=true;
    $("paymentEyebrow").textContent="REGISTRATION CONFIRMED";
    $("paymentTitle").textContent="Payment successful — you're registered!";
    $("paymentMessage").textContent=result.emailSent
      ?"Your confirmation email and QR ticket have been sent."
      :"Your payment is confirmed. Keep the registration ID below; the confirmation email may still be processing.";
    $("paymentTicket").hidden=false;
    $("ticketRegistrationId").textContent=result.registrationId;
    $("paymentTicketQr").src=qrUrl(result.registrationId);
    $("retryPaymentButton").hidden=true;
    return;
  }

  const terminal=["failed","canceled","cancelled","expired"].includes(String(result.paymentStatus||"").toLowerCase());
  if(terminal){
    clearInterval(pollTimer);
    $("paymentSpinner").hidden=true;
    $("paymentEyebrow").textContent="PAYMENT NOT COMPLETED";
    $("paymentTitle").textContent="Your registration is waiting for payment";
    $("paymentMessage").textContent="No confirmation has been sent yet. You can safely try the payment again.";
    $("retryPaymentButton").hidden=false;
    return;
  }

  $("paymentEyebrow").textContent="PAYMENT PROCESSING";
  $("paymentTitle").textContent="We're confirming your payment…";
  $("paymentMessage").textContent="This normally takes only a few seconds. Confirmation will be sent only after payment is verified.";
}

async function checkStatus(){
  if(busy||!registrationId)return;
  busy=true;
  try{
    const r=await backendRequest("paymentStatus",{registrationId},30000);
    showState(r);
    pollCount++;
    if(!r.confirmed&&pollCount>=15){
      clearInterval(pollTimer);
      $("paymentSpinner").hidden=true;
      $("paymentTitle").textContent="Payment is still being processed";
      $("paymentMessage").textContent="You may close this page. Mollie will notify SBCF automatically, and your confirmation email will be sent once payment is verified.";
    }
  }catch(e){
    $("paymentError").textContent=e.message;
    pollCount++;
    if(pollCount>=5)clearInterval(pollTimer);
  }finally{
    busy=false;
  }
}

$("retryPaymentButton").addEventListener("click",async()=>{
  if(!registrationId)return;
  $("retryPaymentButton").disabled=true;
  $("paymentError").textContent="";
  try{
    const r=await backendRequest("retryPayment",{registrationId},45000);
    if(r.confirmed){showState(r);return;}
    if(r.checkoutUrl){location.href=r.checkoutUrl;return;}
    throw new Error("A new payment could not be created.");
  }catch(e){
    $("paymentError").textContent=e.message;
    $("retryPaymentButton").disabled=false;
  }
});

if(!registrationId){
  $("paymentSpinner").hidden=true;
  $("paymentTitle").textContent="Registration ID missing";
  $("paymentMessage").textContent="Open the payment return link from Mollie, or return to the event page and try again.";
}else{
  localStorage.setItem("sbcfPendingRegistrationId",registrationId);
  checkStatus();
  pollTimer=setInterval(checkStatus,2500);
}
