const $=id=>document.getElementById(id);
let scanner=null, scanning=false, busy=false;
$("checkinAdminKey").value=sessionStorage.getItem("sbcfAdminKey")||"";
$("checkinAdminKey").addEventListener("change",()=>sessionStorage.setItem("sbcfAdminKey",$("checkinAdminKey").value.trim()));
$("manualCheckin").addEventListener("click",()=>performCheckin($("manualId").value));
$("manualId").addEventListener("keydown",e=>{if(e.key==="Enter")performCheckin($("manualId").value)});
$("startScanner").addEventListener("click",startScanner); $("stopScanner").addEventListener("click",stopScanner);
function normalizeTicket(value){return String(value||"").trim().replace(/^SBCF:/i,"").toUpperCase()}
async function performCheckin(raw){
  const id=normalizeTicket(raw), key=$("checkinAdminKey").value.trim();
  if(!key){show("Enter the admin key first.","error");return} if(!id){show("Scan a ticket or enter a registration ID.","error");return} if(busy)return;
  busy=true;show("Checking registration…","");
  try{const r=await backendRequest("checkin",{adminKey:key,registrationId:id});sessionStorage.setItem("sbcfAdminKey",key);show(r.alreadyCheckedIn?`Already checked in: ${r.fullName} (${r.registrationId})`:`✓ Welcome ${r.fullName}! ${r.totalAttendees} attendee(s) checked in.`,r.alreadyCheckedIn?"warn":"success");$("manualId").value="";if(navigator.vibrate)navigator.vibrate(r.alreadyCheckedIn?[100,60,100]:120)}catch(e){show(e.message,"error")}finally{busy=false}
}
async function startScanner(){
  if(typeof Html5Qrcode==="undefined"){show("Camera scanner library could not load. Use manual check-in.","error");return}
  if(scanning)return; scanner=new Html5Qrcode("reader");
  try{await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:250,height:250}},text=>performCheckin(text));scanning=true;$("startScanner").disabled=true;$("stopScanner").disabled=false;show("Camera ready. Point it at the SBCF QR ticket.","")}catch(e){show(`Camera could not start: ${e}`,"error")}
}
async function stopScanner(){if(!scanner||!scanning)return;try{await scanner.stop();await scanner.clear()}catch(_){}scanning=false;$("startScanner").disabled=false;$("stopScanner").disabled=true}
function show(text,type){const el=$("checkinMessage");el.textContent=text;el.className=`big-message ${type||""}`}
