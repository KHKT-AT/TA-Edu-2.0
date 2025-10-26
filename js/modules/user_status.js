// js/modules/user_status.js
// Hiển thị trạng thái vai trò/KYC trên Dashboard + phát sự kiện cho module khác (VD: wallet)

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc }  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const $ = (s,r=document)=>r.querySelector(s);

let auth=null, db=null;
try { auth=getAuth(); db=getFirestore(); } catch {}

const LS = {
  role: (uid)=> localStorage.getItem(`taedu:role:${uid}`),
  lastStep: (uid)=> localStorage.getItem(`taedu_onboarding:${uid}:lastStep`),
  studentPayload: (uid)=> {
    try{ return JSON.parse(localStorage.getItem(`taedu_onboarding:${uid}:student_payload`)||"null"); }
    catch{return null;}
  }
};

function showBanner({level,text,primaryHref,primaryLabel,canDismiss}){
  const box = $("#verifyBanner"); if(!box) return;
  box.hidden=false;
  box.classList.remove("notice--warn","notice--err","notice--ok");
  if(level==="ok"){ box.classList.add("notice--ok"); } 
  else if(level==="error"){ box.classList.add("notice--err"); }
  else { box.classList.add("notice--warn"); }
  $("#verifyText").textContent = text;

  const a = $("#verifyPrimary"), d = $("#verifyDismiss");
  if(primaryHref){
    a.href = primaryHref; a.textContent = primaryLabel || "Mở";
    a.hidden=false;
  } else { a.hidden=true; }
  d.hidden = !canDismiss;
  if(!d.hidden){ d.onclick = ()=> (box.hidden=true); }
}

function hideBanner(){
  const box = $("#verifyBanner");
  if(box) box.hidden = true;
}

function dispatchStatus(payload){
  window.dispatchEvent(new CustomEvent("taedu:verify-status", { detail: payload }));
}

async function getStatus(u){
  // Mặc định
  let role=null, verify={status:null, reviewNote:null}, parentOK=false;

  // Thử Firestore
  if(db){
    try{
      const snap = await getDoc(doc(db,"users",u.uid));
      if(snap.exists()){
        const d = snap.data();
        role = d.role || null;
        verify = d.verify || verify;
        if(role==="student"){
          parentOK = !!(d.parent && (d.parent.email||"").trim());
        }
      }
    }catch(e){ /* bỏ qua -> thử local */ }
  }
  // Fallback local
  if(!role) role = LS.role(u.uid);
  if(role==="student" && !parentOK){
    const p = LS.studentPayload(u.uid);
    parentOK = !!(p && p.parent && (p.parent.email||"").trim());
  }
  const last = LS.lastStep(u.uid); // "submitted" nếu đã gửi KYC qua local mock

  // Tính thông điệp
  if(!role){
    return {
      level:"error",
      text:"Bạn chưa chọn vai trò. Hãy chọn Học sinh hoặc Gia sư để tiếp tục.",
      primaryHref:"role.html#step=select",
      primaryLabel:"Chọn vai trò",
      allowWithdraw:false, role:null, verify:{status:"missing"}
    };
  }
  if(role==="student"){
    if(!parentOK){
      return {
        level:"warn",
        text:"Vui lòng bổ sung thông tin phụ huynh (email bắt buộc) để dùng các tính năng thanh toán.",
        primaryHref:"role.html#step=student",
        primaryLabel:"Bổ sung ngay",
        allowWithdraw:false, role, verify:{status:"unverified"}
      };
    }
  }
  // Ưu tiên trạng thái KYC
  const st = (verify && verify.status) || (last==="submitted" ? "submitted" : "unverified");
  if(st==="unverified"){
    return {
      level:"warn",
      text:(role==="student"
          ?"Bạn chưa gửi hồ sơ xác minh. Vui lòng hoàn thành để bảo vệ tài khoản & giao dịch."
          :"Bạn chưa gửi hồ sơ xác minh. Vui lòng hoàn tất KYC để bắt đầu dạy."),
      primaryHref:`role.html#step=${role}`,
      primaryLabel:"Gửi hồ sơ",
      allowWithdraw:false, role, verify
    };
  }
  if(st==="submitted"){
    return {
      level:"warn",
      text:"Hồ sơ đã gửi, đang chờ duyệt.",
      primaryHref:null, primaryLabel:null, canDismiss:true,
      allowWithdraw:true, role, verify
    };
  }
  if(st==="rejected"){
    const note = verify.reviewNote ? ` Lý do: ${verify.reviewNote}` : "";
    return {
      level:"error",
      text:`Hồ sơ bị từ chối.${note} Bạn có thể cập nhật và gửi lại.`,
      primaryHref:`role.html#step=${role}`,
      primaryLabel:"Sửa & gửi lại",
      allowWithdraw:false, role, verify
    };
  }
  // approved
  return {
    level:"ok",
    text:"Tài khoản đã được xác minh.",
    primaryHref:null, primaryLabel:null, canDismiss:true,
    allowWithdraw:true, role, verify
  };
}

document.addEventListener("DOMContentLoaded", () => {
  if(!auth){ hideBanner(); return; }
  onAuthStateChanged(auth, async (u)=>{
    if(!u){ hideBanner(); return; }
    const res = await getStatus(u);
    dispatchStatus(res);
    if(res.level==="ok"){ hideBanner(); }
    else { showBanner(res); }
  });
});
