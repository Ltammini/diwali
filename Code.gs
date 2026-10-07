/**
 * SBCF Diwali Registration 2026 — Google Apps Script backend
 * Attach this script to the Google Sheet that will hold registrations.
 *
 * Script Properties required:
 *   ADMIN_KEY = a long organizer-only password
 */
const SETTINGS={
  sheetName:"Registrations",registrationOpenDefault:true,maxAttendees:30,
  organizerName:"Stichting Bharat Culture Friesland (SBCF)",eventName:"Diwali Celebration 2026",
  eventDate:"Update event date",eventTime:"Update event time",venue:"Update venue",
  replyTo:"",whatsappUrl:"",qrBaseUrl:"https://quickchart.io/qr?size=240&margin=2&text=",
  feeRegular12Plus:20,feeUnder12:0,feeStudent:15,currency:"EUR"
};
const HEADERS=["Submitted At","Registration ID","Request ID","Full Name","Email","Phone","Age 12+","Below 12","Students","Total Attendees","Contribution","Currency","Participants","Activities","Notes","Consent","Status","Email Status","Email Sent At","Check-in Status","Checked In At","Source URL"];

function setupSheet(){const sh=sheet_();ensureHeaders_(sh);sh.setFrozenRows(1);sh.getRange(1,1,1,HEADERS.length).setFontWeight("bold").setBackground("#0b1b78").setFontColor("#ffffff");sh.autoResizeColumns(1,HEADERS.length);PropertiesService.getScriptProperties().setProperty("REGISTRATION_OPEN",String(SETTINGS.registrationOpenDefault));return "SBCF registration sheet is ready.";}
function doGet(){
  return jsonResponse_({
    ok:true,
    service:"SBCF registration service",
    status:"ready",
    serverTime:new Date().toISOString()
  });
}
function doPost(e){const requestId=String((e&&e.parameter&&e.parameter.requestId)||"");try{const action=String((e&&e.parameter&&e.parameter.action)||"");const payload=JSON.parse(String((e&&e.parameter&&e.parameter.payload)||"{}"));let result;switch(action){case"ping":result={pong:true,serverTime:new Date().toISOString()};break;case"register":result=register_(payload);break;case"registrationStatus":result=registrationStatus_(payload.clientRequestId);break;case"adminDashboard":requireAdmin_(payload);result=dashboard_();break;case"checkin":requireAdmin_(payload);result=checkin_(payload.registrationId);break;case"resendEmail":requireAdmin_(payload);result=resendEmail_(payload.registrationId);break;case"setRegistrationOpen":requireAdmin_(payload);result=setRegistrationOpen_(payload.open);break;default:throw new Error("Unknown backend action.");}return htmlResponse_(Object.assign({ok:true,requestId},result||{}));}catch(err){console.error(err);return htmlResponse_({ok:false,requestId,message:err&&err.message?err.message:"Unexpected server error."});}}

function register_(d){
  if(!registrationOpen_())throw new Error("Registration is currently closed. Please contact the SBCF event team.");
  if(String(d.website||"").trim())return{registrationId:"SBCF-SPAM",emailSent:false};
  validateRegistration_(d);
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sh=sheet_();ensureHeaders_(sh);const existing=findByRequestId_(sh,String(d.clientRequestId||""));
    if(existing)return{registrationId:existing.registrationId,emailSent:existing.emailStatus==="Sent",duplicate:true};
    const registrationId=makeRegistrationId_();
    const participants=(Array.isArray(d.participants)?d.participants:[]).map(p=>`${clean_(p.name,100)} [${clean_(p.type,40)}]`).join(" | ");
    const activities=(Array.isArray(d.activities)?d.activities:[]).map(x=>clean_(x,80)).join(", ")||"Just attending";
    const calculatedContribution=num_(d.regular12plus)*SETTINGS.feeRegular12Plus+num_(d.under12)*SETTINGS.feeUnder12+num_(d.students)*SETTINGS.feeStudent;
    const row=[new Date(),registrationId,clean_(d.clientRequestId,120),clean_(d.fullName,120),clean_(d.email,160),clean_(d.phone,60),num_(d.regular12plus),num_(d.under12),num_(d.students),num_(d.totalAttendees),money_(calculatedContribution),SETTINGS.currency,participants,activities,clean_(d.notes,1500),d.consent?"Yes":"No","Confirmed","Pending","","Not checked in","",clean_(d.sourceUrl,500)];
    sh.appendRow(row);const rowNumber=sh.getLastRow();let emailSent=false,emailError="";
    try{sendConfirmation_(rowObject_(sh,rowNumber));emailSent=true;sh.getRange(rowNumber,col_("Email Status")).setValue("Sent");sh.getRange(rowNumber,col_("Email Sent At")).setValue(new Date());}catch(mailErr){emailError=mailErr.message||String(mailErr);sh.getRange(rowNumber,col_("Email Status")).setValue("Failed");}
    return{registrationId,emailSent,emailError};
  }finally{lock.releaseLock();}
}
function registrationStatus_(clientRequestId){
  const id=String(clientRequestId||"").trim();
  if(!id)return{found:false};

  const sh=sheet_();
  ensureHeaders_(sh);
  const existing=findByRequestId_(sh,id);

  if(!existing)return{found:false};

  return{
    found:true,
    registrationId:existing.registrationId,
    emailSent:existing.emailStatus==="Sent",
    status:existing.status||"Confirmed"
  };
}
function dashboard_(){const sh=sheet_();ensureHeaders_(sh);const rows=allObjects_(sh).reverse();const summary={registrations:rows.length,attendees:0,regular12plus:0,under12:0,students:0,activityRegistrations:0,checkedIn:0,contributionTotal:0};rows.forEach(r=>{summary.attendees+=num_(r.totalAttendees);summary.regular12plus+=num_(r.regular12plus);summary.under12+=num_(r.under12);summary.students+=num_(r.students);summary.contributionTotal+=Number(r.contribution||0);if(r.activities&&r.activities!=="Just attending")summary.activityRegistrations++;if(r.checkInStatus==="Checked in")summary.checkedIn+=num_(r.totalAttendees);});return{registrationOpen:registrationOpen_(),summary,registrations:rows};}
function checkin_(registrationId){registrationId=String(registrationId||"").replace(/^SBCF:/i,"").trim().toUpperCase();if(!registrationId)throw new Error("Registration ID is required.");const sh=sheet_();const row=findRowById_(sh,registrationId);if(!row)throw new Error("Registration not found.");const obj=rowObject_(sh,row);if(obj.checkInStatus==="Checked in")return{registrationId,fullName:obj.fullName,totalAttendees:obj.totalAttendees,alreadyCheckedIn:true,checkedInAt:obj.checkedInAt};sh.getRange(row,col_("Check-in Status")).setValue("Checked in");sh.getRange(row,col_("Checked In At")).setValue(new Date());return{registrationId,fullName:obj.fullName,totalAttendees:obj.totalAttendees,alreadyCheckedIn:false};}
function resendEmail_(registrationId){const sh=sheet_();const row=findRowById_(sh,String(registrationId||"").trim().toUpperCase());if(!row)throw new Error("Registration not found.");const obj=rowObject_(sh,row);sendConfirmation_(obj);sh.getRange(row,col_("Email Status")).setValue("Sent");sh.getRange(row,col_("Email Sent At")).setValue(new Date());return{sent:true,registrationId:obj.registrationId};}
function setRegistrationOpen_(open){PropertiesService.getScriptProperties().setProperty("REGISTRATION_OPEN",String(Boolean(open)));return{registrationOpen:Boolean(open)};}
function registrationOpen_(){const v=PropertiesService.getScriptProperties().getProperty("REGISTRATION_OPEN");return v===null?SETTINGS.registrationOpenDefault:v==="true";}

function sendConfirmation_(r){
  if(!r.email)throw new Error("No email address is available.");
  const ticket=`SBCF:${r.registrationId}`,qr=SETTINGS.qrBaseUrl+encodeURIComponent(ticket);
  const whatsapp=SETTINGS.whatsappUrl?`<p style="margin:22px 0"><a href="${html_(SETTINGS.whatsappUrl)}" style="background:#315a20;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700">Join WhatsApp group</a></p>`:"";
  const lines=`<tr><td style="padding:6px 0;color:#667085">Age 12+</td><td style="padding:6px 0;font-weight:bold">${num_(r.regular12plus)} × €20</td></tr><tr><td style="padding:6px 0;color:#667085">Students</td><td style="padding:6px 0;font-weight:bold">${num_(r.students)} × €15</td></tr><tr><td style="padding:6px 0;color:#667085">Below 12</td><td style="padding:6px 0;font-weight:bold">${num_(r.under12)} × Free</td></tr><tr><td style="padding:8px 0;color:#315a20;font-weight:bold">Total contribution</td><td style="padding:8px 0;color:#315a20;font-weight:bold">€${Number(r.contribution||0).toFixed(2)}</td></tr>`;
  const body=`<div style="background:#fffaf4;padding:24px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:650px;margin:auto;background:#fff;border:1px solid #e7e4de;border-radius:18px;overflow:hidden"><div style="height:6px;background:linear-gradient(90deg,#f47d20 0 33%,#ffffff 33% 66%,#315a20 66%)"></div><div style="background:#0b1b78;color:#fff;padding:27px"><div style="font-size:12px;color:#ffb36a;letter-spacing:1.6px;font-weight:bold">STICHTING BHARAT CULTURE FRIESLAND</div><h1 style="font-family:Georgia,serif;margin:8px 0 4px">${html_(SETTINGS.eventName)}</h1><p style="margin:0;color:#dbe1ff">Registration confirmed</p></div><div style="padding:28px"><p>Hello ${html_(r.fullName)},</p><p>Your SBCF event registration is confirmed. Please keep this email and show the QR ticket at the entrance.</p><div style="background:#fff1e4;border:1px solid #ffd1aa;padding:15px;border-radius:10px;text-align:center;margin:20px 0"><small>REGISTRATION ID</small><div style="font-size:22px;font-weight:bold;color:#0b1b78;margin-top:4px">${html_(r.registrationId)}</div></div><table style="width:100%;font-size:14px;border-collapse:collapse"><tr><td style="padding:6px 0;color:#667085">Date</td><td style="padding:6px 0;font-weight:bold">${html_(SETTINGS.eventDate)}</td></tr><tr><td style="padding:6px 0;color:#667085">Time</td><td style="padding:6px 0;font-weight:bold">${html_(SETTINGS.eventTime)}</td></tr><tr><td style="padding:6px 0;color:#667085">Venue</td><td style="padding:6px 0;font-weight:bold">${html_(SETTINGS.venue)}</td></tr><tr><td style="padding:6px 0;color:#667085">Total attendees</td><td style="padding:6px 0;font-weight:bold">${num_(r.totalAttendees)}</td></tr>${lines}<tr><td style="padding:6px 0;color:#667085">Activities</td><td style="padding:6px 0;font-weight:bold">${html_(r.activities||"Just attending")}</td></tr></table><div style="text-align:center;margin:24px 0"><img src="${qr}" width="220" height="220" alt="SBCF registration QR ticket"><div style="font-size:12px;color:#667085">QR ticket: ${html_(ticket)}</div></div>${whatsapp}<p>Students should carry a valid student ID if requested by the event team.</p><p>We look forward to celebrating together.</p><p style="font-weight:bold;color:#315a20">${html_(SETTINGS.organizerName)}</p></div></div></div>`;
  const plain=`Hello ${r.fullName},\n\nYour registration for ${SETTINGS.eventName} is confirmed.\nRegistration ID: ${r.registrationId}\nDate: ${SETTINGS.eventDate}\nTime: ${SETTINGS.eventTime}\nVenue: ${SETTINGS.venue}\n\nAge 12+: ${r.regular12plus} x EUR 20\nStudents: ${r.students} x EUR 15\nBelow 12: ${r.under12} x Free\nTotal contribution: EUR ${Number(r.contribution||0).toFixed(2)}\nActivities: ${r.activities}\n\nPlease show your registration ID or QR ticket at the entrance. Students should carry a valid student ID if requested.\n\n${SETTINGS.organizerName}`;
  const opts={htmlBody:body,name:SETTINGS.organizerName};if(SETTINGS.replyTo)opts.replyTo=SETTINGS.replyTo;MailApp.sendEmail(r.email,`Registration confirmed — ${SETTINGS.eventName}`,plain,opts);
}
function validateRegistration_(d){if(!String(d.clientRequestId||"").trim())throw new Error("Missing request ID.");if(!String(d.fullName||"").trim())throw new Error("Full name is required.");if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email||"").trim()))throw new Error("A valid email address is required.");const expected=num_(d.regular12plus)+num_(d.under12)+num_(d.students),total=num_(d.totalAttendees);if(total!==expected)throw new Error("Attendee category totals do not match.");if(total<1||total>SETTINGS.maxAttendees)throw new Error(`Attendees must be between 1 and ${SETTINGS.maxAttendees}.`);if(!d.consent)throw new Error("Consent is required.");if(!Array.isArray(d.participants)||d.participants.length!==total)throw new Error("Participant details do not match the attendee count.");const counts={"Age 12+":0,"Below 12":0,"Student":0};d.participants.forEach(p=>{if(!String(p.name||"").trim())throw new Error("Each participant needs a name.");const type=String(p.type||"");if(!(type in counts))throw new Error("Invalid registration category.");counts[type]++;});if(counts["Age 12+"]!==num_(d.regular12plus)||counts["Below 12"]!==num_(d.under12)||counts["Student"]!==num_(d.students))throw new Error("Participant categories do not match the selected totals.");const expectedContribution=num_(d.regular12plus)*SETTINGS.feeRegular12Plus+num_(d.under12)*SETTINGS.feeUnder12+num_(d.students)*SETTINGS.feeStudent;if(money_(d.contributionAmount)!==money_(expectedContribution))throw new Error("Contribution amount does not match the selected categories.");}
function requireAdmin_(payload){const key=PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");if(!key)throw new Error("ADMIN_KEY is not configured in Apps Script Script Properties.");if(String(payload.adminKey||"")!==key)throw new Error("Incorrect admin key.");}
function sheet_(){const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw new Error("Create this Apps Script from inside the Google Sheet.");return ss.getSheetByName(SETTINGS.sheetName)||ss.insertSheet(SETTINGS.sheetName);}
function ensureHeaders_(sh){if(sh.getLastRow()===0){sh.appendRow(HEADERS);return;}const cur=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),HEADERS.length)).getValues()[0];HEADERS.forEach((h,i)=>{if(cur[i]!==h)sh.getRange(1,i+1).setValue(h);});}
function col_(header){const i=HEADERS.indexOf(header);if(i<0)throw new Error(`Unknown column: ${header}`);return i+1;}
function makeRegistrationId_(){return `SBCF-26-${Utilities.getUuid().replace(/-/g,"").slice(0,6).toUpperCase()}`;}
function findRowById_(sh,id){if(sh.getLastRow()<2)return 0;const vals=sh.getRange(2,col_("Registration ID"),sh.getLastRow()-1,1).getDisplayValues().flat();const i=vals.findIndex(v=>String(v).toUpperCase()===String(id).toUpperCase());return i<0?0:i+2;}
function findByRequestId_(sh,id){if(!id||sh.getLastRow()<2)return null;const vals=sh.getRange(2,col_("Request ID"),sh.getLastRow()-1,1).getDisplayValues().flat();const i=vals.indexOf(id);return i<0?null:rowObject_(sh,i+2);}
function allObjects_(sh){if(sh.getLastRow()<2)return[];return sh.getRange(2,1,sh.getLastRow()-1,HEADERS.length).getValues().map(row=>objectFromRow_(row));}
function rowObject_(sh,row){return objectFromRow_(sh.getRange(row,1,1,HEADERS.length).getValues()[0]);}
function objectFromRow_(v){return{submittedAt:iso_(v[0]),registrationId:String(v[1]||""),requestId:String(v[2]||""),fullName:String(v[3]||""),email:String(v[4]||""),phone:String(v[5]||""),regular12plus:num_(v[6]),under12:num_(v[7]),students:num_(v[8]),totalAttendees:num_(v[9]),contribution:Number(v[10]||0),currency:String(v[11]||""),participants:String(v[12]||""),activities:String(v[13]||""),notes:String(v[14]||""),consent:String(v[15]||""),status:String(v[16]||""),emailStatus:String(v[17]||""),emailSentAt:iso_(v[18]),checkInStatus:String(v[19]||""),checkedInAt:iso_(v[20]),sourceUrl:String(v[21]||"")};}
function num_(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.floor(n)):0;}function money_(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.round(n*100)/100):0;}function clean_(v,max){return String(v==null?"":v).trim().slice(0,max||1000);}function iso_(v){if(!v)return"";try{return new Date(v).toISOString();}catch(_){return String(v);}}function html_(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");}function htmlResponse_(obj){
  return jsonResponse_(obj);
}

function jsonResponse_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(Object.assign({source:"SBCF_APPS_SCRIPT"},obj)))
    .setMimeType(ContentService.MimeType.JSON);
}
