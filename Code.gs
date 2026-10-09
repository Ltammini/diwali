/**
 * SBCF Diwali Registration 2026 — Google Apps Script backend
 * Attach this script to the Google Sheet that will hold registrations.
 *
 * Script Properties required:
 *   ADMIN_KEY = a long organizer-only password
 *   PAYMENT_IBAN = SBCF ING IBAN (spaces are optional)
 *
 * Optional Script Properties:
 *   PAYMENT_ACCOUNT_HOLDER = defaults to Stichting Bharat Cultuur Friesland
 *   PAYMENT_SITE_URL = defaults to https://diwali.sbcf-friesland.workers.dev
 */
const SETTINGS={
  sheetName:"Registrations",registrationOpenDefault:true,maxAttendees:30,
  organizerName:"Stichting Bharat Cultuur Friesland (SBCF)",eventName:"Diwali Celebration 2026",
  eventDate:"Update event date",eventTime:"Update event time",venue:"Update venue",
  replyTo:"",whatsappUrl:"",qrBaseUrl:"https://quickchart.io/qr?size=240&margin=2&text=",
  feeRegular12Plus:20,feeUnder12:0,feeStudent:15,currency:"EUR",paymentAccountHolder:"Stichting Bharat Cultuur Friesland",paymentSiteUrl:"https://diwali.sbcf-friesland.workers.dev",paymentFileMaxChars:2000000
};
const HEADERS=["Submitted At","Registration ID","Request ID","Full Name","Email","Phone","Age 12+","Below 12","Students","Total Attendees","Contribution","Currency","Participants","Activities","Notes","Consent","Status","Email Status","Email Sent At","Check-in Status","Checked In At","Source URL","Payment Status","Payment Reference","Payment Token","Amount Received","Payment Verification","Bank Transaction ID","Bank Transaction Date","Payment Verified At","Payment Note","Ticket Email Status","Ticket Email Sent At"];

function setupSheet(){const sh=sheet_();ensureHeaders_(sh);sh.setFrozenRows(1);sh.getRange(1,1,1,HEADERS.length).setFontWeight("bold").setBackground("#0b1b78").setFontColor("#ffffff");sh.autoResizeColumns(1,HEADERS.length);PropertiesService.getScriptProperties().setProperty("REGISTRATION_OPEN",String(SETTINGS.registrationOpenDefault));return "SBCF registration sheet is ready.";}
function doGet(){
  return jsonResponse_({
    ok:true,
    service:"SBCF registration service",
    status:"ready",
    serverTime:new Date().toISOString()
  });
}
function doPost(e){
  const requestId=String((e&&e.parameter&&e.parameter.requestId)||"");
  try{
    const action=String((e&&e.parameter&&e.parameter.action)||"");
    const payload=JSON.parse(String((e&&e.parameter&&e.parameter.payload)||"{}"));
    let result;
    switch(action){
      case"ping":result={pong:true,serverTime:new Date().toISOString()};break;
      case"register":result=register_(payload);break;
      case"registrationStatus":result=registrationStatus_(payload.clientRequestId);break;
      case"paymentDetails":result=paymentDetails_(payload);break;
      case"adminDashboard":requireAdmin_(payload);result=dashboard_();break;
      case"checkin":requireAdmin_(payload);result=checkin_(payload.registrationId);break;
      case"resendEmail":requireAdmin_(payload);result=resendEmail_(payload.registrationId);break;
      case"markPaymentPaid":requireAdmin_(payload);result=markPaymentPaid_(payload);break;
      case"reconcilePayments":requireAdmin_(payload);result=reconcilePayments_(payload);break;
      case"setRegistrationOpen":requireAdmin_(payload);result=setRegistrationOpen_(payload.open);break;
      default:throw new Error("Unknown backend action.");
    }
    return htmlResponse_(Object.assign({ok:true,requestId},result||{}));
  }catch(err){
    console.error(err);
    return htmlResponse_({ok:false,requestId,message:err&&err.message?err.message:"Unexpected server error."});
  }
}
function register_(d){
  if(!registrationOpen_())throw new Error("Registration is currently closed. Please contact the SBCF event team.");
  if(String(d.website||"").trim())return{registrationId:"SBCF-SPAM",emailSent:false};
  validateRegistration_(d);
  const calculatedContribution=num_(d.regular12plus)*SETTINGS.feeRegular12Plus+num_(d.under12)*SETTINGS.feeUnder12+num_(d.students)*SETTINGS.feeStudent;
  if(calculatedContribution>0)requireBankDetails_();

  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const sh=sheet_();
    ensureHeaders_(sh);
    const existing=findByRequestId_(sh,String(d.clientRequestId||""));
    if(existing){
      return{
        registrationId:existing.registrationId,
        emailSent:existing.emailStatus==="Sent",
        duplicate:true,
        payment:paymentSummary_(existing)
      };
    }

    const registrationId=makeRegistrationId_();
    const participants=(Array.isArray(d.participants)?d.participants:[]).map(p=>`${clean_(p.name,100)} [${clean_(p.type,40)}]`).join(" | ");
    const activities=(Array.isArray(d.activities)?d.activities:[]).map(x=>clean_(x,80)).join(", ")||"Just attending";
    const paymentStatus=calculatedContribution>0?"PENDING":"FREE";
    const status=paymentStatus==="FREE"?"Confirmed":"Pending payment";
    const paymentReference=registrationId;
    const paymentToken=Utilities.getUuid().replace(/-/g,"");

    const row=[
      new Date(),registrationId,clean_(d.clientRequestId,120),clean_(d.fullName,120),clean_(d.email,160),clean_(d.phone,60),
      num_(d.regular12plus),num_(d.under12),num_(d.students),num_(d.totalAttendees),money_(calculatedContribution),SETTINGS.currency,
      participants,activities,clean_(d.notes,1500),d.consent?"Yes":"No",status,"Pending","","Not checked in","",clean_(d.sourceUrl,500),
      paymentStatus,paymentReference,paymentToken,"","","","","","","Pending",""
    ];

    sh.appendRow(row);
    const rowNumber=sh.getLastRow();
    let emailSent=false,emailError="";
    try{
      const registration=rowObject_(sh,rowNumber);
      if(paymentStatus==="FREE"){
        sendTicketEmail_(registration);
        sh.getRange(rowNumber,col_("Ticket Email Status")).setValue("Sent");
        sh.getRange(rowNumber,col_("Ticket Email Sent At")).setValue(new Date());
      }else{
        sendPaymentEmail_(registration);
      }
      emailSent=true;
      sh.getRange(rowNumber,col_("Email Status")).setValue("Sent");
      sh.getRange(rowNumber,col_("Email Sent At")).setValue(new Date());
    }catch(mailErr){
      emailError=mailErr.message||String(mailErr);
      sh.getRange(rowNumber,col_("Email Status")).setValue("Failed");
      if(paymentStatus==="FREE")sh.getRange(rowNumber,col_("Ticket Email Status")).setValue("Failed");
    }

    const saved=rowObject_(sh,rowNumber);
    return{registrationId,emailSent,emailError,payment:paymentSummary_(saved)};
  }finally{
    lock.releaseLock();
  }
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
    status:existing.status||"Confirmed",
    payment:paymentSummary_(existing)
  };
}

function paymentDetails_(payload){
  const registrationId=String(payload&&payload.registrationId||"").trim().toUpperCase();
  const token=String(payload&&payload.token||"").trim();
  if(!registrationId||!token)throw new Error("The payment link is incomplete.");
  const sh=sheet_();
  ensureHeaders_(sh);
  const row=findRowById_(sh,registrationId);
  if(!row)throw new Error("Registration not found.");
  const r=rowObject_(sh,row);
  if(!r.paymentToken||r.paymentToken!==token)throw new Error("This payment link is invalid or expired.");
  return{
    registrationId:r.registrationId,
    eventName:SETTINGS.eventName,
    payment:paymentSummary_(r)
  };
}
function dashboard_(){
  const sh=sheet_();
  ensureHeaders_(sh);
  const rows=allObjects_(sh).reverse();
  const summary={
    registrations:rows.length,attendees:0,regular12plus:0,under12:0,students:0,
    activityRegistrations:0,checkedIn:0,contributionTotal:0,paidTotal:0,
    paid:0,pending:0,review:0,free:0
  };
  rows.forEach(r=>{
    summary.attendees+=num_(r.totalAttendees);
    summary.regular12plus+=num_(r.regular12plus);
    summary.under12+=num_(r.under12);
    summary.students+=num_(r.students);
    summary.contributionTotal+=Number(r.contribution||0);
    if(r.activities&&r.activities!=="Just attending")summary.activityRegistrations++;
    if(r.checkInStatus==="Checked in")summary.checkedIn+=num_(r.totalAttendees);
    const ps=paymentStatusOf_(r);
    if(ps==="PAID"){summary.paid++;summary.paidTotal+=Number(r.amountReceived||r.contribution||0);}
    else if(ps==="PENDING")summary.pending++;
    else if(ps==="REVIEW")summary.review++;
    else if(ps==="FREE")summary.free++;
  });
  return{registrationOpen:registrationOpen_(),summary,registrations:rows};
}
function checkin_(registrationId){
  registrationId=String(registrationId||"").replace(/^SBCF:/i,"").trim().toUpperCase();
  if(!registrationId)throw new Error("Registration ID is required.");
  const sh=sheet_();
  ensureHeaders_(sh);
  const row=findRowById_(sh,registrationId);
  if(!row)throw new Error("Registration not found.");
  const obj=rowObject_(sh,row);
  const ps=paymentStatusOf_(obj);
  if(ps==="PENDING"||ps==="REVIEW")throw new Error("Payment has not been verified for this registration.");
  if(obj.checkInStatus==="Checked in")return{registrationId,fullName:obj.fullName,totalAttendees:obj.totalAttendees,alreadyCheckedIn:true,checkedInAt:obj.checkedInAt};
  sh.getRange(row,col_("Check-in Status")).setValue("Checked in");
  sh.getRange(row,col_("Checked In At")).setValue(new Date());
  return{registrationId,fullName:obj.fullName,totalAttendees:obj.totalAttendees,alreadyCheckedIn:false};
}
function resendEmail_(registrationId){
  const sh=sheet_();
  ensureHeaders_(sh);
  const row=findRowById_(sh,String(registrationId||"").trim().toUpperCase());
  if(!row)throw new Error("Registration not found.");
  const obj=rowObject_(sh,row);
  const ps=paymentStatusOf_(obj);
  if(ps==="PENDING"||ps==="REVIEW"){
    requireBankDetails_();
    sendPaymentEmail_(obj);
    sh.getRange(row,col_("Email Status")).setValue("Sent");
    sh.getRange(row,col_("Email Sent At")).setValue(new Date());
    return{sent:true,registrationId:obj.registrationId,emailType:"payment"};
  }
  sendTicketEmail_(obj);
  sh.getRange(row,col_("Ticket Email Status")).setValue("Sent");
  sh.getRange(row,col_("Ticket Email Sent At")).setValue(new Date());
  return{sent:true,registrationId:obj.registrationId,emailType:"ticket"};
}

function markPaymentPaid_(payload){
  const registrationId=String(payload.registrationId||"").trim().toUpperCase();
  if(!registrationId)throw new Error("Registration ID is required.");
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const sh=sheet_();
    ensureHeaders_(sh);
    const row=findRowById_(sh,registrationId);
    if(!row)throw new Error("Registration not found.");
    const current=rowObject_(sh,row);
    const expected=money_(current.contribution);
    if(expected<=0)return{registrationId,paymentStatus:"FREE",alreadyPaid:true,ticketEmailSent:current.ticketEmailStatus==="Sent"};

    const received=payload.amountReceived===""||payload.amountReceived==null?expected:money_(payload.amountReceived);
    if(Math.abs(received-expected)>0.009&&!payload.confirmDifference){
      throw new Error(`Amount received (€${received.toFixed(2)}) does not match amount due (€${expected.toFixed(2)}). Confirm the difference before marking as paid.`);
    }

    const result=verifyPaymentRow_(sh,row,{
      amountReceived:received,
      verification:"Manual",
      transactionId:clean_(payload.transactionId,160),
      transactionDate:clean_(payload.transactionDate,80),
      note:clean_(payload.note||"Manually verified against the ING bank account by an organizer.",500)
    });
    return Object.assign({registrationId},result);
  }finally{
    lock.releaseLock();
  }
}
function reconcilePayments_(payload){
  const fileName=clean_(payload.fileName||"ING transaction export",180);
  const content=String(payload.content||"");
  if(!content.trim())throw new Error("Choose a non-empty ING transaction file.");
  if(content.length>SETTINGS.paymentFileMaxChars)throw new Error("The transaction file is too large. Export a smaller date range.");

  const sh=sheet_();
  ensureHeaders_(sh);
  const rows=allObjects_(sh);
  let matched=0,review=0,unmatched=0,skipped=0;
  const details=[];

  rows.forEach((r,index)=>{
    const ps=paymentStatusOf_(r);
    const expected=money_(r.contribution);
    if(expected<=0||ps==="PAID"||ps==="FREE"){skipped++;return;}
    if(ps==="LEGACY"){skipped++;return;}

    const reference=String(r.paymentReference||r.registrationId||"").trim();
    if(!reference){unmatched++;return;}
    const matches=findReferencePositions_(content,reference);
    if(matches.length===0){unmatched++;return;}

    const block=transactionBlock_(content,matches[0]);
    if(matches.length===1&&amountMatches_(block,expected)){
      const rowNumber=index+2;
      const result=verifyPaymentRow_(sh,rowNumber,{
        amountReceived:expected,
        verification:"ING file import",
        transactionId:extractTransactionId_(block),
        transactionDate:extractTransactionDate_(block),
        note:`Automatically matched from ${fileName} using exact payment reference and amount.`
      });
      if(result.paymentStatus==="PAID"){
        matched++;
        details.push({registrationId:r.registrationId,result:"PAID"});
      }
    }else{
      const rowNumber=index+2;
      sh.getRange(rowNumber,col_("Payment Status")).setValue("REVIEW");
      sh.getRange(rowNumber,col_("Status")).setValue("Payment review");
      sh.getRange(rowNumber,col_("Payment Note")).setValue(
        matches.length>1
          ? `Reference appeared more than once in ${fileName}; manual review required.`
          : `Reference found in ${fileName}, but the exact amount €${expected.toFixed(2)} was not found in the same transaction record.`
      );
      review++;
      details.push({registrationId:r.registrationId,result:"REVIEW"});
    }
  });

  return{fileName,matched,review,unmatched,skipped,details:details.slice(0,100)};
}
function setRegistrationOpen_(open){PropertiesService.getScriptProperties().setProperty("REGISTRATION_OPEN",String(Boolean(open)));return{registrationOpen:Boolean(open)};}
function registrationOpen_(){const v=PropertiesService.getScriptProperties().getProperty("REGISTRATION_OPEN");return v===null?SETTINGS.registrationOpenDefault:v==="true";}

function sendPaymentEmail_(r){
  if(!r.email)throw new Error("No email address is available.");
  const bank=requireBankDetails_();
  const amount=Number(r.contribution||0).toFixed(2);
  const url=paymentUrl_(r);
  const subject=`Payment required — ${SETTINGS.eventName} — ${r.registrationId}`;
  const body=`<div style="background:#fffaf4;padding:24px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:650px;margin:auto;background:#fff;border:1px solid #e7e4de;border-radius:18px;overflow:hidden"><div style="height:6px;background:linear-gradient(90deg,#f47d20 0 33%,#ffffff 33% 66%,#315a20 66%)"></div><div style="background:#0b1b78;color:#fff;padding:27px"><div style="font-size:12px;color:#ffb36a;letter-spacing:1.6px;font-weight:bold">STICHTING BHARAT CULTUUR FRIESLAND</div><h1 style="font-family:Georgia,serif;margin:8px 0 4px">${html_(SETTINGS.eventName)}</h1><p style="margin:0;color:#dbe1ff">Registration received — payment pending</p></div><div style="padding:28px"><p>Hello ${html_(r.fullName)},</p><p>We received your registration. Please complete the bank transfer below. Your admission QR ticket will be emailed after the payment has been verified.</p><div style="background:#fff1e4;border:1px solid #ffd1aa;padding:16px;border-radius:10px;margin:20px 0"><div style="font-size:13px;color:#667085">AMOUNT TO PAY</div><div style="font-size:28px;font-weight:bold;color:#0b1b78;margin:4px 0 14px">€${amount}</div><div><strong>Account holder:</strong> ${html_(bank.accountHolder)}</div><div style="margin-top:7px"><strong>IBAN:</strong> ${html_(bank.iban)}</div><div style="margin-top:7px"><strong>Payment reference:</strong> ${html_(r.paymentReference||r.registrationId)}</div></div><p><strong>Important:</strong> use the payment reference exactly as shown so our reconciliation script can match your payment automatically.</p><p style="margin:24px 0"><a href="${html_(url)}" style="display:inline-block;background:#0b1b78;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">View payment instructions</a></p><p>You do not need to send us a payment screenshot. If automatic matching is not possible, an organizer can verify the payment manually.</p><p style="font-weight:bold;color:#315a20">${html_(SETTINGS.organizerName)}</p></div></div></div>`;
  const plain=`Hello ${r.fullName},

We received your registration for ${SETTINGS.eventName}.

Registration ID: ${r.registrationId}
Amount to pay: EUR ${amount}
Account holder: ${bank.accountHolder}
IBAN: ${bank.iban}
Payment reference: ${r.paymentReference||r.registrationId}

Please use the payment reference exactly as shown so we can match your payment automatically.

Payment instructions:
${url}

Your QR admission ticket will be emailed after the payment is verified.

${SETTINGS.organizerName}`;
  sendMail_(r.email,subject,plain,body);
}

function sendTicketEmail_(r){
  if(!r.email)throw new Error("No email address is available.");
  const ticket=`SBCF:${r.registrationId}`;
  const qr=SETTINGS.qrBaseUrl+encodeURIComponent(ticket);
  const whatsapp=SETTINGS.whatsappUrl?`<p style="margin:22px 0"><a href="${html_(SETTINGS.whatsappUrl)}" style="background:#315a20;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700">Join WhatsApp group</a></p>`:"";
  const lines=`<tr><td style="padding:6px 0;color:#667085">Age 12+</td><td style="padding:6px 0;font-weight:bold">${num_(r.regular12plus)} × €20</td></tr><tr><td style="padding:6px 0;color:#667085">Students</td><td style="padding:6px 0;font-weight:bold">${num_(r.students)} × €15</td></tr><tr><td style="padding:6px 0;color:#667085">Below 12</td><td style="padding:6px 0;font-weight:bold">${num_(r.under12)} × Free</td></tr><tr><td style="padding:8px 0;color:#315a20;font-weight:bold">Total contribution</td><td style="padding:8px 0;color:#315a20;font-weight:bold">€${Number(r.contribution||0).toFixed(2)}</td></tr>`;
  const paymentLine=Number(r.contribution||0)>0?`<p style="background:#edf7ed;border:1px solid #b7ddb7;padding:12px;border-radius:8px"><strong>Payment verified.</strong> Thank you.</p>`:`<p style="background:#edf7ed;border:1px solid #b7ddb7;padding:12px;border-radius:8px"><strong>No payment required.</strong> This registration is free.</p>`;
  const body=`<div style="background:#fffaf4;padding:24px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:650px;margin:auto;background:#fff;border:1px solid #e7e4de;border-radius:18px;overflow:hidden"><div style="height:6px;background:linear-gradient(90deg,#f47d20 0 33%,#ffffff 33% 66%,#315a20 66%)"></div><div style="background:#0b1b78;color:#fff;padding:27px"><div style="font-size:12px;color:#ffb36a;letter-spacing:1.6px;font-weight:bold">STICHTING BHARAT CULTUUR FRIESLAND</div><h1 style="font-family:Georgia,serif;margin:8px 0 4px">${html_(SETTINGS.eventName)}</h1><p style="margin:0;color:#dbe1ff">Registration confirmed</p></div><div style="padding:28px"><p>Hello ${html_(r.fullName)},</p>${paymentLine}<p>Your SBCF event registration is confirmed. Please keep this email and show the QR ticket at the entrance.</p><div style="background:#fff1e4;border:1px solid #ffd1aa;padding:15px;border-radius:10px;text-align:center;margin:20px 0"><small>REGISTRATION ID</small><div style="font-size:22px;font-weight:bold;color:#0b1b78;margin-top:4px">${html_(r.registrationId)}</div></div><table style="width:100%;font-size:14px;border-collapse:collapse"><tr><td style="padding:6px 0;color:#667085">Date</td><td style="padding:6px 0;font-weight:bold">${html_(SETTINGS.eventDate)}</td></tr><tr><td style="padding:6px 0;color:#667085">Time</td><td style="padding:6px 0;font-weight:bold">${html_(SETTINGS.eventTime)}</td></tr><tr><td style="padding:6px 0;color:#667085">Venue</td><td style="padding:6px 0;font-weight:bold">${html_(SETTINGS.venue)}</td></tr><tr><td style="padding:6px 0;color:#667085">Total attendees</td><td style="padding:6px 0;font-weight:bold">${num_(r.totalAttendees)}</td></tr>${lines}<tr><td style="padding:6px 0;color:#667085">Activities</td><td style="padding:6px 0;font-weight:bold">${html_(r.activities||"Just attending")}</td></tr></table><div style="text-align:center;margin:24px 0"><img src="${qr}" width="220" height="220" alt="SBCF registration QR ticket"><div style="font-size:12px;color:#667085">QR ticket: ${html_(ticket)}</div></div>${whatsapp}<p>Students should carry a valid student ID if requested by the event team.</p><p>We look forward to celebrating together.</p><p style="font-weight:bold;color:#315a20">${html_(SETTINGS.organizerName)}</p></div></div></div>`;
  const plain=`Hello ${r.fullName},

Your registration for ${SETTINGS.eventName} is confirmed.
Registration ID: ${r.registrationId}
Date: ${SETTINGS.eventDate}
Time: ${SETTINGS.eventTime}
Venue: ${SETTINGS.venue}

Age 12+: ${r.regular12plus} x EUR 20
Students: ${r.students} x EUR 15
Below 12: ${r.under12} x Free
Total contribution: EUR ${Number(r.contribution||0).toFixed(2)}
Activities: ${r.activities}

${Number(r.contribution||0)>0?"Payment verified.":"No payment required."}
Please show your registration ID or QR ticket at the entrance. Students should carry a valid student ID if requested.

${SETTINGS.organizerName}`;
  sendMail_(r.email,`Registration confirmed — ${SETTINGS.eventName}`,plain,body);
}

function sendMail_(to,subject,plain,htmlBody){
  const opts={htmlBody,name:SETTINGS.organizerName};
  if(SETTINGS.replyTo)opts.replyTo=SETTINGS.replyTo;
  MailApp.sendEmail(to,subject,plain,opts);
}

function verifyPaymentRow_(sh,row,info){
  const current=rowObject_(sh,row);
  const ps=paymentStatusOf_(current);
  if(ps==="FREE")return{paymentStatus:"FREE",alreadyPaid:true,ticketEmailSent:current.ticketEmailStatus==="Sent"};
  if(ps==="PAID"){
    if(current.ticketEmailStatus!=="Sent"){
      try{
        sendTicketEmail_(current);
        sh.getRange(row,col_("Ticket Email Status")).setValue("Sent");
        sh.getRange(row,col_("Ticket Email Sent At")).setValue(new Date());
      }catch(mailErr){
        sh.getRange(row,col_("Ticket Email Status")).setValue("Failed");
        return{paymentStatus:"PAID",alreadyPaid:true,ticketEmailSent:false,emailError:mailErr.message||String(mailErr)};
      }
    }
    return{paymentStatus:"PAID",alreadyPaid:true,ticketEmailSent:true};
  }

  sh.getRange(row,col_("Payment Status")).setValue("PAID");
  sh.getRange(row,col_("Status")).setValue("Confirmed");
  sh.getRange(row,col_("Amount Received")).setValue(money_(info.amountReceived));
  sh.getRange(row,col_("Payment Verification")).setValue(clean_(info.verification,80));
  sh.getRange(row,col_("Bank Transaction ID")).setValue(clean_(info.transactionId,160));
  sh.getRange(row,col_("Bank Transaction Date")).setValue(clean_(info.transactionDate,80));
  sh.getRange(row,col_("Payment Verified At")).setValue(new Date());
  sh.getRange(row,col_("Payment Note")).setValue(clean_(info.note,500));

  const updated=rowObject_(sh,row);
  try{
    sendTicketEmail_(updated);
    sh.getRange(row,col_("Ticket Email Status")).setValue("Sent");
    sh.getRange(row,col_("Ticket Email Sent At")).setValue(new Date());
    return{paymentStatus:"PAID",alreadyPaid:false,ticketEmailSent:true};
  }catch(mailErr){
    sh.getRange(row,col_("Ticket Email Status")).setValue("Failed");
    return{paymentStatus:"PAID",alreadyPaid:false,ticketEmailSent:false,emailError:mailErr.message||String(mailErr)};
  }
}

function paymentSummary_(r){
  const bank=bankDetails_();
  return{
    status:paymentStatusOf_(r),
    amountDue:money_(r.contribution),
    amountReceived:money_(r.amountReceived),
    currency:r.currency||SETTINGS.currency,
    reference:r.paymentReference||r.registrationId,
    accountHolder:bank.accountHolder,
    iban:bank.iban,
    configured:bank.configured,
    url:r.paymentToken?paymentUrl_(r):"",
    ticketEmailSent:r.ticketEmailStatus==="Sent"
  };
}

function paymentStatusOf_(r){
  const explicit=String(r.paymentStatus||"").trim().toUpperCase();
  if(explicit)return explicit;
  if(Number(r.contribution||0)<=0)return"FREE";
  if(String(r.status||"").toLowerCase()==="confirmed")return"LEGACY";
  return"PENDING";
}

function bankDetails_(){
  const props=PropertiesService.getScriptProperties();
  const iban=String(props.getProperty("PAYMENT_IBAN")||"").replace(/\s+/g,"").toUpperCase();
  const accountHolder=clean_(props.getProperty("PAYMENT_ACCOUNT_HOLDER")||SETTINGS.paymentAccountHolder,120);
  const siteUrl=String(props.getProperty("PAYMENT_SITE_URL")||SETTINGS.paymentSiteUrl).trim().replace(/\/+$/,"");
  return{iban,accountHolder,siteUrl,configured:iban.length>=15};
}

function requireBankDetails_(){
  const bank=bankDetails_();
  if(!bank.configured)throw new Error("PAYMENT_IBAN is not configured in Apps Script Script Properties.");
  return bank;
}

function paymentUrl_(r){
  const bank=bankDetails_();
  return `${bank.siteUrl}/payment.html?ref=${encodeURIComponent(r.registrationId)}&token=${encodeURIComponent(r.paymentToken||"")}`;
}

function findReferencePositions_(content,reference){
  const hay=String(content||"").toUpperCase();
  const needle=String(reference||"").toUpperCase();
  const out=[];
  let pos=0;
  while(needle&&(pos=hay.indexOf(needle,pos))>=0){
    out.push(pos);
    pos+=needle.length;
    if(out.length>20)break;
  }
  return out;
}

function transactionBlock_(content,index){
  const text=String(content||"");
  const upper=text.toUpperCase();
  const mtStart=Math.max(upper.lastIndexOf("\n:61:",index),upper.startsWith(":61:")?0:-1);
  if(mtStart>=0){
    const next=upper.indexOf("\n:61:",index+1);
    return text.slice(mtStart,next>=0?next:Math.min(text.length,index+1600));
  }
  const lineStart=Math.max(0,text.lastIndexOf("\n",index)+1);
  const lineEnd=text.indexOf("\n",index);
  const line=text.slice(lineStart,lineEnd<0?text.length:lineEnd);
  if(line.length>=20)return line;
  return text.slice(Math.max(0,index-500),Math.min(text.length,index+900));
}

function amountMatches_(block,amount){
  const fixed=Number(amount||0).toFixed(2);
  const comma=fixed.replace(".",",");
  const text=String(block||"");
  return text.indexOf(fixed)>=0||text.indexOf(comma)>=0;
}

function extractTransactionId_(block){
  const text=String(block||"");
  const trx=text.match(/(?:TRXID|TRANSACTION(?:ID)?|KENMERK|REFERENCE)[\s:=;"']+([A-Z0-9._\/-]{4,80})/i);
  if(trx)return clean_(trx[1],160);
  const mt=text.match(/:61:([^\r\n]+)/);
  return mt?clean_(mt[1],160):"";
}

function extractTransactionDate_(block){
  const text=String(block||"");
  const iso=text.match(/\b(20\d{2})[-\/](\d{2})[-\/](\d{2})\b/);
  if(iso)return`${iso[1]}-${iso[2]}-${iso[3]}`;
  const mt=text.match(/:61:(\d{2})(\d{2})(\d{2})/);
  return mt?`20${mt[1]}-${mt[2]}-${mt[3]}`:"";
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
function field_(v,header){
  const i=HEADERS.indexOf(header);
  return i<0?"":v[i];
}

function objectFromRow_(v){
  return{
    submittedAt:iso_(field_(v,"Submitted At")),
    registrationId:String(field_(v,"Registration ID")||""),
    requestId:String(field_(v,"Request ID")||""),
    fullName:String(field_(v,"Full Name")||""),
    email:String(field_(v,"Email")||""),
    phone:String(field_(v,"Phone")||""),
    regular12plus:num_(field_(v,"Age 12+")),
    under12:num_(field_(v,"Below 12")),
    students:num_(field_(v,"Students")),
    totalAttendees:num_(field_(v,"Total Attendees")),
    contribution:Number(field_(v,"Contribution")||0),
    currency:String(field_(v,"Currency")||""),
    participants:String(field_(v,"Participants")||""),
    activities:String(field_(v,"Activities")||""),
    notes:String(field_(v,"Notes")||""),
    consent:String(field_(v,"Consent")||""),
    status:String(field_(v,"Status")||""),
    emailStatus:String(field_(v,"Email Status")||""),
    emailSentAt:iso_(field_(v,"Email Sent At")),
    checkInStatus:String(field_(v,"Check-in Status")||""),
    checkedInAt:iso_(field_(v,"Checked In At")),
    sourceUrl:String(field_(v,"Source URL")||""),
    paymentStatus:String(field_(v,"Payment Status")||""),
    paymentReference:String(field_(v,"Payment Reference")||""),
    paymentToken:String(field_(v,"Payment Token")||""),
    amountReceived:Number(field_(v,"Amount Received")||0),
    paymentVerification:String(field_(v,"Payment Verification")||""),
    bankTransactionId:String(field_(v,"Bank Transaction ID")||""),
    bankTransactionDate:String(field_(v,"Bank Transaction Date")||""),
    paymentVerifiedAt:iso_(field_(v,"Payment Verified At")),
    paymentNote:String(field_(v,"Payment Note")||""),
    ticketEmailStatus:String(field_(v,"Ticket Email Status")||""),
    ticketEmailSentAt:iso_(field_(v,"Ticket Email Sent At"))
  };
}
function num_(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.floor(n)):0;}function money_(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.round(n*100)/100):0;}function clean_(v,max){return String(v==null?"":v).trim().slice(0,max||1000);}function iso_(v){if(!v)return"";try{return new Date(v).toISOString();}catch(_){return String(v);}}function html_(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");}function htmlResponse_(obj){
  return jsonResponse_(obj);
}

function jsonResponse_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(Object.assign({source:"SBCF_APPS_SCRIPT"},obj)))
    .setMimeType(ContentService.MimeType.JSON);
}
