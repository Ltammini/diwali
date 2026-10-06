let adminKey=sessionStorage.getItem("sbcfAdminKey")||"";
let registrations=[];
let registrationOpen=true;
const $=id=>document.getElementById(id);

$("adminKey").value=adminKey;
$("loginButton").addEventListener("click",login);
$("adminKey").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
$("logoutButton").addEventListener("click",()=>{sessionStorage.removeItem("sbcfAdminKey");location.reload()});
$("refreshButton").addEventListener("click",loadDashboard);
$("searchInput").addEventListener("input",renderRows);
$("exportButton").addEventListener("click",exportCsv);
$("toggleRegistration").addEventListener("click",toggleRegistration);

async function login(){
  adminKey=$("adminKey").value.trim();
  if(!adminKey){$("loginMessage").textContent="Enter the admin key.";return;}
  sessionStorage.setItem("sbcfAdminKey",adminKey);
  try{
    await loadDashboard();
    $("loginPanel").hidden=true;
    $("dashboard").hidden=false;
    $("logoutButton").hidden=false;
  }catch(err){
    sessionStorage.removeItem("sbcfAdminKey");
    $("loginMessage").textContent=err.message;
    $("loginMessage").className="message error";
  }
}

async function loadDashboard(){
  setAdminMessage("Loading…");
  const r=await backendRequest("adminDashboard",{adminKey},30000);
  registrations=r.registrations||[];
  registrationOpen=!!r.registrationOpen;
  const s=r.summary||{};

  $("mRegistrations").textContent=s.registrations||0;
  $("mAttendees").textContent=s.attendees||0;
  $("mRegular").textContent=s.regular12plus||0;
  $("mStudents").textContent=s.students||0;
  $("mUnder12").textContent=s.under12||0;
  $("mContribution").textContent=new Intl.NumberFormat("en-NL",{style:"currency",currency:"EUR"}).format(s.paidTotal||0);
  $("mPendingPayments").textContent=s.pendingPayments||0;
  $("mCheckedIn").textContent=s.checkedIn||0;

  $("lastUpdated").textContent=`Updated ${new Date().toLocaleString()}`;
  $("toggleRegistration").textContent=registrationOpen?"Close registration":"Open registration";
  $("toggleRegistration").classList.toggle("danger",registrationOpen);
  renderRows();
  setAdminMessage("");
}

function paymentBadge(r){
  const status=String(r.paymentStatus||"").toLowerCase();
  if(r.status==="Confirmed")return `<span class="status ok">${esc(r.paymentStatus||"Confirmed")}</span>`;
  if(["failed","canceled","expired","error"].includes(status))return `<span class="status warn">${esc(r.paymentStatus||r.status)}</span>`;
  return `<span class="status neutral">${esc(r.paymentStatus||r.status||"Pending")}</span>`;
}

function renderRows(){
  const term=$("searchInput").value.trim().toLowerCase();
  const rows=registrations.filter(r=>!term||[r.registrationId,r.fullName,r.email,r.phone,r.activities,r.paymentStatus,r.status].join(" ").toLowerCase().includes(term));

  $("registrationRows").innerHTML=rows.map(r=>`
    <tr>
      <td><strong>${esc(r.registrationId)}</strong><small>${fmtDate(r.submittedAt)}</small></td>
      <td><strong>${esc(r.fullName)}</strong><small>${esc(r.email)}${r.phone?`<br>${esc(r.phone)}`:""}</small></td>
      <td><strong>${r.totalAttendees}</strong><small>${r.regular12plus} × 12+ • ${r.students} student • ${r.under12} &lt;12<br>€${Number(r.contribution||0).toFixed(2)}</small></td>
      <td>${paymentBadge(r)}<small>${r.paymentMethod?`Method: ${esc(r.paymentMethod)}<br>`:""}${r.paidAt?`Paid: ${fmtDate(r.paidAt)}`:esc(r.status||"")}</small></td>
      <td>${esc(r.activities||"Just attending")}</td>
      <td><span class="status ${r.emailStatus==="Sent"?"ok":"warn"}">${esc(r.emailStatus||"—")}</span></td>
      <td><span class="status ${r.checkInStatus==="Checked in"?"ok":"neutral"}">${esc(r.checkInStatus||"Not checked in")}</span>${r.checkedInAt?`<small>${fmtDate(r.checkedInAt)}</small>`:""}</td>
      <td><div class="row-actions">
        <button onclick="resendEmail('${js(r.registrationId)}')" ${r.status!=="Confirmed"?"disabled":""}>Resend email</button>
        <button onclick="checkIn('${js(r.registrationId)}')" ${r.checkInStatus==="Checked in"||r.status!=="Confirmed"?"disabled":""}>Check in</button>
      </div></td>
    </tr>`).join("")||`<tr><td colspan="8" class="empty">No registrations found.</td></tr>`;
}

async function resendEmail(id){
  if(!confirm(`Resend confirmation email for ${id}?`))return;
  try{
    setAdminMessage("Sending email…");
    await backendRequest("resendEmail",{adminKey,registrationId:id});
    setAdminMessage("Confirmation email sent.","success");
    await loadDashboard();
  }catch(e){setAdminMessage(e.message,"error");}
}

async function checkIn(id){
  try{
    setAdminMessage("Checking in…");
    await backendRequest("checkin",{adminKey,registrationId:id});
    setAdminMessage(`${id} checked in.`,"success");
    await loadDashboard();
  }catch(e){setAdminMessage(e.message,"error");}
}

async function toggleRegistration(){
  const next=!registrationOpen;
  if(!confirm(`${next?"Open":"Close"} public registrations?`))return;
  try{
    await backendRequest("setRegistrationOpen",{adminKey,open:next});
    await loadDashboard();
  }catch(e){setAdminMessage(e.message,"error");}
}

function exportCsv(){
  const headers=[
    "Registration ID","Submitted At","Full Name","Email","Phone",
    "Age 12+","Below 12","Students","Total","Contribution",
    "Registration Status","Payment ID","Payment Status","Payment Method","Paid At",
    "Activities","Notes","Email Status","Check-in Status","Checked In At"
  ];
  const vals=registrations.map(r=>[
    r.registrationId,r.submittedAt,r.fullName,r.email,r.phone,
    r.regular12plus,r.under12,r.students,r.totalAttendees,r.contribution,
    r.status,r.paymentId,r.paymentStatus,r.paymentMethod,r.paidAt,
    r.activities,r.notes,r.emailStatus,r.checkInStatus,r.checkedInAt
  ]);
  const csv=[headers,...vals].map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download=`sbcf-diwali-registrations-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function setAdminMessage(t,c=""){const el=$("adminMessage");el.textContent=t;el.className=`message ${c}`;}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function js(v){return String(v??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'");}
function fmtDate(v){if(!v)return"";const d=new Date(v);return isNaN(d)?esc(v):d.toLocaleString();}
if(adminKey)login();
