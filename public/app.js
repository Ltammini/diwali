const cfg = window.EVENT_CONFIG;
const state = { step:1, regular12plus:2, under12:0, students:0, participantCache:[] };

const $ = id => document.getElementById(id);
const qsa = s => [...document.querySelectorAll(s)];

function initBrand(){
  $("eventDate").textContent=cfg.eventDateLabel;
  $("eventTime").textContent=cfg.eventTimeLabel;
  $("eventVenue").textContent=cfg.venueName;
  $("calendarLink").hidden=!cfg.calendarEnabled;
  $("contactEmailLink").textContent=cfg.contactEmail.includes("Update")?"Organizer contact to be updated":cfg.contactEmail;
  $("contactEmailLink").href=cfg.contactEmail.includes("Update")?"#":`mailto:${cfg.contactEmail}`;
  if(cfg.whatsappUrl){$("whatsappLink").href=cfg.whatsappUrl;$("whatsappLink").hidden=false;}
  updateContribution();
}

function totalAttendees(){return state.regular12plus+state.under12+state.students;}
function contributionAmount(){return state.regular12plus*cfg.feeRegular12Plus+state.under12*cfg.feeUnder12+state.students*cfg.feeStudent;}
function currency(amount){return new Intl.NumberFormat("en-NL",{style:"currency",currency:cfg.currency}).format(amount);}
function scrollToForm(){$("registration").scrollIntoView({behavior:"smooth",block:"start"});}
$("heroRegisterButton").addEventListener("click",scrollToForm);
$("mainRegisterButton").addEventListener("click",scrollToForm);

function showStep(n){
  state.step=n;
  qsa("[data-step-indicator]").forEach(el=>{const i=Number(el.dataset.stepIndicator);el.classList.toggle("active",i<=n);el.classList.toggle("current",i===n);});
  qsa("[data-step-panel]").forEach(el=>el.classList.toggle("active",Number(el.dataset.stepPanel)===n));
  if(n===2)renderParticipants();
  if(n===4)renderSummary();
  scrollToForm();
}

qsa("[data-next]").forEach(btn=>btn.addEventListener("click",()=>{
  if(state.step===1&&!validateContact())return;
  if(state.step===2&&!validateParticipants())return;
  showStep(Number(btn.dataset.next));
}));
qsa("[data-back]").forEach(btn=>btn.addEventListener("click",()=>showStep(Number(btn.dataset.back))));

function validateContact(){for(const id of ["fullName","email"]){if(!$(id).reportValidity())return false;}return true;}
function validateParticipants(){saveParticipantCache();for(const el of qsa(".participant-name")){if(!el.value.trim()){el.setCustomValidity("Please enter a participant name.");el.reportValidity();el.setCustomValidity("");return false;}}return true;}

qsa("[data-counter]").forEach(btn=>btn.addEventListener("click",()=>{
  saveParticipantCache();
  const key=btn.dataset.counter,delta=Number(btn.dataset.delta);
  if(delta>0&&totalAttendees()>=cfg.maxAttendeesPerRegistration)return;
  state[key]=Math.max(0,state[key]+delta);
  if(totalAttendees()<1)state.regular12plus=1;
  $(`${key}Count`).textContent=state[key];
  $("regular12plusCount").textContent=state.regular12plus;
  updateContribution();
}));

function updateContribution(){$("contributionPreview").textContent=currency(contributionAmount());}

function saveParticipantCache(){
  const rows=qsa(".participant-row");
  if(!rows.length)return;
  state.participantCache=rows.map(row=>({name:row.querySelector(".participant-name").value,type:row.querySelector(".participant-type").value}));
}
function participantTypes(){return [...Array(state.regular12plus).fill("Age 12+"),...Array(state.under12).fill("Below 12"),...Array(state.students).fill("Student")];}
function renderParticipants(){
  const types=participantTypes(),box=$("participantFields");
  box.innerHTML=types.map((type,i)=>{
    const cached=state.participantCache[i]||{};
    return `<div class="participant-row"><span class="participant-index">${i+1}</span><div class="field"><label>Participant ${i+1} name *</label><input class="participant-name" maxlength="100" value="${escapeAttr(cached.name||"")}" required></div><div class="field"><label>Registration category</label><div class="participant-category">${escapeHtml(type)}</div><input type="hidden" class="participant-type" value="${escapeAttr(type)}"></div></div>`;
  }).join("");
}
function getParticipants(){return qsa(".participant-row").map((row,i)=>({number:i+1,name:row.querySelector(".participant-name").value.trim(),type:row.querySelector(".participant-type").value}));}
function getActivities(){return qsa('input[name="activities"]:checked').map(x=>x.value);}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function escapeAttr(v){return escapeHtml(v);}

function renderSummary(){
  saveParticipantCache();
  const acts=getActivities(),participants=getParticipants();
  $("summary").innerHTML=`
    <div class="summary-row"><span>Primary contact</span><strong>${escapeHtml($("fullName").value)}</strong></div>
    <div class="summary-row"><span>Email</span><strong>${escapeHtml($("email").value)}</strong></div>
    <div class="summary-row"><span>Phone</span><strong>${escapeHtml($("phone").value.trim() || "Not provided")}</strong></div>
    <div class="summary-row"><span>Total attendees</span><strong>${totalAttendees()}</strong></div>
    <div class="summary-row"><span>Categories</span><strong>${state.regular12plus} × 12+ · ${state.students} × student · ${state.under12} × below 12</strong></div>
    <div class="summary-row"><span>Participants</span><strong>${participants.map(p=>`${escapeHtml(p.name)} (${escapeHtml(p.type)})`).join(", ")}</strong></div>
    <div class="summary-row"><span>Activities</span><strong>${acts.length?acts.map(escapeHtml).join(", "):"Just attending"}</strong></div>
    <div class="summary-row highlight"><span>Total contribution</span><strong>${currency(contributionAmount())}</strong></div>`;
}

function buildCalendarUrl(){
  const details=`SBCF ${cfg.eventName}. Registration ID will be sent by email.`;
  const location=[cfg.venueName,cfg.venueAddress].filter(Boolean).join(", ");
  const p=new URLSearchParams({action:"TEMPLATE",text:`${cfg.eventName} — SBCF`,dates:`${cfg.calendarStart}/${cfg.calendarEnd}`,details,location});
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
function qrUrl(registrationId){return `https://quickchart.io/qr?size=220&margin=2&text=${encodeURIComponent(`SBCF:${registrationId}`)}`;}

function showRegistrationSuccess(result, payload) {
  localStorage.removeItem("sbcfPendingRequestId");

  qsa(".form-step").forEach(x => x.classList.remove("active"));
  document.querySelector(".stepper").hidden = true;
  $("registrationForm").hidden = true;

  $("registrationId").textContent = result.registrationId;
  $("ticketQr").src = qrUrl(result.registrationId);

  if (cfg.calendarEnabled) $("calendarLink").href = buildCalendarUrl();

  $("successText").textContent = result.emailSent
    ? `Registration confirmed. A confirmation email and QR ticket were sent to ${payload.email}.`
    : "Registration confirmed. Please keep the registration ID below. The confirmation email may still be processing.";

  $("success").hidden = false;
  $("success").scrollIntoView({ behavior:"smooth", block:"center" });
}

$("registrationForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!$("consent").checked) {
    $("consent").reportValidity();
    return;
  }

  saveParticipantCache();

  const button = $("submitButton");
  const msg = $("submitMessage");
  button.disabled = true;
  button.textContent = "Submitting…";
  msg.textContent = "";
  msg.className = "message";

  const clientRequestId =
    localStorage.getItem("sbcfPendingRequestId") || makeRequestId();

  localStorage.setItem("sbcfPendingRequestId", clientRequestId);

  const payload = {
    clientRequestId,
    eventName: cfg.eventName,
    fullName: $("fullName").value.trim(),
    email: $("email").value.trim(),
    phone: $("phone").value.trim(),
    regular12plus: state.regular12plus,
    under12: state.under12,
    students: state.students,
    totalAttendees: totalAttendees(),
    contributionAmount: contributionAmount(),
    currency: cfg.currency,
    participants: getParticipants(),
    activities: getActivities(),
    notes: $("notes").value.trim(),
    consent: true,
    website: $("website").value.trim(),
    sourceUrl: location.href
  };

  try {
    const result = await backendRequest("register", payload, 60000);
    showRegistrationSuccess(result, payload);
  } catch (err) {
    // The server may already have saved the registration and sent the email
    // even if the browser did not receive the Apps Script response.
    try {
      msg.textContent = "Checking whether your registration was completed…";
      msg.className = "message";

      const recovered = await recoverRegistration(clientRequestId);

      if (recovered?.found && recovered.registrationId) {
        showRegistrationSuccess(recovered, payload);
        return;
      }
    } catch (recoveryError) {
      console.warn("Registration recovery check failed:", recoveryError);
    }

    msg.textContent =
      "We could not confirm the registration response. Please check your email before submitting again. If no confirmation arrives, try once more.";
    msg.className = "message error";
    button.disabled = false;
    button.textContent = "Confirm registration";
  }
});

initBrand();
