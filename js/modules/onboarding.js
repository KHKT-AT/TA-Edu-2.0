/**
 * TA-Edu 2.x — Onboarding (Role + KYC) v2
 * - Giữ tương thích HTML/field cũ: #form-student | #formStudent, #form-tutor | #formTutor
 * - Hỗ trợ cccd_front|cccdFront, cccd_back|cccdBack, certs|certificates, parent_name|parentName...
 * - Thêm: validate file, trạng thái gửi, fallback khi Storage bị CORS.
 */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const toast = (m) => alert(m);

let auth = null, db = null, st = null, user = null;

// ====== Cấu hình nhẹ cho upload
const MAX_FILE_MB = 5;
const ALLOW_IMG = ["image/jpeg", "image/png", "image/webp"];
const ALLOW_CERT = [...ALLOW_IMG, "application/pdf"];

function checkFile(file, label, allow = ALLOW_IMG) {
  if (!file) return { ok: false, msg: `Thiếu ${label}.` };
  if (!allow.includes(file.type)) {
    const extra = allow.includes("application/pdf") ? " hoặc PDF" : "";
    return { ok: false, msg: `${label} chỉ hỗ trợ JPG/PNG/WebP${extra}.` };
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return { ok: false, msg: `${label} vượt quá ${MAX_FILE_MB}MB.` };
  }
  return { ok: true };
}

function setBusy(form, busy) {
  const btn = form.querySelector('button[type="submit"], .btn-primary');
  if (btn) {
    btn.disabled = !!busy;
    btn.dataset.loading = busy ? "1" : "";
    // giữ nhãn gốc nếu có data-original
    if (!btn.dataset.original) btn.dataset.original = btn.textContent.trim();
    btn.textContent = busy ? "Đang gửi…" : btn.dataset.original;
  }
}

function tipIfCors(e) {
  const m = String(e && (e.message || e.code || e));
  // Các lỗi thường thấy khi thiếu CORS: preflight/CORS/Failed to fetch...
  if (m.includes("CORS") || m.toLowerCase().includes("preflight") || m.includes("Failed to fetch")) {
    toast(
      "Không tải được ảnh lên Storage (có thể do CORS khi chạy local). " +
      "Hồ sơ vẫn được lưu, nhưng ảnh có thể thiếu.\n\n" +
      "Cách khắc phục nhanh:\n" +
      "1) Tạo file cors.json cho bucket Storage.\n" +
      '2) Chạy: gsutil cors set cors.json gs://<tên-bucket>\n' +
      "Sau khi cấu hình xong, gửi lại hồ sơ để cập nhật URL ảnh."
    );
  }
}

// ===== Firebase v12: ép nạp app trước rồi mới lấy Auth/DB/Storage
async function ensureFirebaseReady() {
  // BẮT BUỘC: nạp file khởi tạo app (initializeApp) của dự án
  await import("/js/core/firebase.js");

  const { getAuth, onAuthStateChanged } =
    await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js");
  const fbStore   = await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js");
  const fbStorage = await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js");

  auth = getAuth();
  db   = fbStore.getFirestore();
  st   = fbStorage.getStorage();

  return new Promise((resolve) => {
    onAuthStateChanged(auth, (u) => {
      user = u || null;
      if (!user) {
        toast("Vui lòng đăng nhập để tiếp tục.");
        location.href = "index.html";
        return;
      }
      resolve(user);
    });
  });
}

// ===== UI helpers
function show(step) {
  $$("section[data-step]").forEach(s => (s.hidden = s.dataset.step !== step));
  if (user) localStorage.setItem(`taedu_onboarding:lastStep:${user.uid}`, step);
}
function routeByHash() {
  const step = (new URLSearchParams((location.hash || "#step=select").slice(1))).get("step") || "select";
  show(step);
}

// Cho phép lấy theo nhiều tên trường để tương thích HTML cũ/mới
function val(form, names) {
  const arr = Array.isArray(names) ? names : [names];
  for (const n of arr) {
    const el = form.querySelector(`[name="${n}"]`);
    if (el) return (el.value || "").trim();
  }
  return "";
}
function fileOne(form, names) {
  const arr = Array.isArray(names) ? names : [names];
  for (const n of arr) {
    const el = form.querySelector(`input[name="${n}"]`);
    if (el && el.files && el.files[0]) return el.files[0];
  }
  return null;
}
function fileMany(form, names) {
  const arr = Array.isArray(names) ? names : [names];
  for (const n of arr) {
    const el = form.querySelector(`input[name="${n}"]`);
    if (el && el.files) return Array.from(el.files);
  }
  return [];
}

// ===== Storage & Firestore helpers
async function upload(path, file) {
  if (!file || !st) return null;
  const { ref, uploadBytes, getDownloadURL } =
    await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js");
  const r = ref(st, path);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}

async function safeUpload(path, file, label, allow) {
  // validate trước khi upload
  const ck = checkFile(file, label, allow);
  if (!ck.ok) { toast(ck.msg); throw new Error(ck.msg); }
  try {
    return await upload(path, file);
  } catch (e) {
    console.warn("Upload lỗi:", e);
    tipIfCors(e);
    return null; // fallback: cho phép lưu hồ sơ thiếu URL
  }
}

async function saveUserDoc(uid, data) {
  if (!db) return;
  const { doc, setDoc, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js");
  await setDoc(
    doc(db, "users", uid),
    { ...data, updatedAt: serverTimestamp?.() || Date.now() },
    { merge: true }
  );
}

// ===== Role select
function bindRoleSelect() {
  $$(".ob__role[data-role]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!user) { toast("Vui lòng đăng nhập."); location.href = "index.html"; return; }
      const role = btn.dataset.role; // student | tutor
      // lưu local để gate nhận ra dù chưa lên Firestore
      localStorage.setItem(`taedu:role:${user.uid}`, role);
      try {
        await saveUserDoc(user.uid, {
          uid: user.uid,
          email: user.email || null,
          displayName: user.displayName || null,
          role,
          verify: { status: "unverified", submittedAt: null, reviewNote: "" },
        });
      } catch (e) { console.warn("save role failed:", e); }
      location.replace(`role.html#step=${role}`);
    });
  });
}

// ===== Student KYC
function bindStudent() {
  const form = $("#form-student") || $("#formStudent");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!user) return toast("Hết phiên đăng nhập, vui lòng đăng nhập lại.");
    setBusy(form, true);

    try {
      const name   = val(form, "name");
      const dob    = val(form, "dob");
      const phone  = val(form, "phone");
      const grade  = val(form, "grade");
      const addr   = val(form, "address");

      const pName  = val(form, ["parent_name","parentName"]);
      const pEmail = val(form, ["parent_email","parentEmail"]);
      const pPhone = val(form, ["parent_phone","parentPhone"]);

      const fFront = fileOne(form, ["cccd_front","cccdFront"]);
      const fBack  = fileOne(form, ["cccd_back","cccdBack"]);

      if (!name || !dob || !phone || !grade || !pEmail || !fFront || !fBack) {
        toast("Vui lòng điền đủ thông tin bắt buộc và tải ảnh CCCD/Thẻ HS.");
        return;
      }

      // Upload có kiểm tra + fallback CORS
      const urlFront = await safeUpload(`kyc/${user.uid}/student_cccd_front.jpg`, fFront, "Ảnh CCCD/Thẻ HS (mặt trước)", ALLOW_IMG);
      const urlBack  = await safeUpload(`kyc/${user.uid}/student_cccd_back.jpg`,  fBack,  "Ảnh CCCD/Thẻ HS (mặt sau)",   ALLOW_IMG);

      const payload = {
        role: "student",
        verify: { status: "submitted", submittedAt: Date.now(), reviewNote: "" },
        profile: { name, dob, phone, address: addr, grade },
        parent:  { name: pName, email: pEmail, phone: pPhone },
        kyc:     { cccd_front: urlFront, cccd_back: urlBack }
      };

      try { await saveUserDoc(user.uid, payload); } catch (e) { console.warn(e); }
      try { localStorage.setItem(`taedu_onboarding:student:${user.uid}`, JSON.stringify(payload)); } catch(_){}

      toast("Đã gửi hồ sơ học sinh. Chờ duyệt.");
      show("submitted");
    } finally {
      setBusy(form, false);
    }
  });
}

// ===== Tutor KYC
function bindTutor() {
  const form = $("#form-tutor") || $("#formTutor");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!user) return toast("Hết phiên đăng nhập, vui lòng đăng nhập lại.");
    setBusy(form, true);

    try {
      const name     = val(form, "name");
      const dob      = val(form, "dob");
      const cccd     = val(form, ["cccd","idNumber"]);
      const phone    = val(form, "phone");
      const address  = val(form, "address");
      const subjects = val(form, "subjects");
      const bio      = val(form, "bio");

      const levelEls = form.querySelectorAll('input[name="levels[]"]:checked');
      const levels   = Array.from(levelEls).map(el => el.value);

      const fFront = fileOne(form, ["cccd_front","cccdFront"]);
      const fBack  = fileOne(form, ["cccd_back","cccdBack"]);
      const fSelf  = fileOne(form, ["selfie","avatar"]);
      const fCerts = fileMany(form, ["certs","certificates"]);

      if (!name || !dob || !cccd || !phone || !subjects || levels.length===0 || !fFront || !fBack || !fSelf) {
        toast("Vui lòng điền đủ thông tin và chọn ít nhất 1 lớp dạy (10/11/12).");
        return;
      }

      // Upload có kiểm tra + fallback CORS
      const urlFront = await safeUpload(`kyc/${user.uid}/tutor_cccd_front.jpg`, fFront, "Ảnh CCCD/CMND (mặt trước)", ALLOW_IMG);
      const urlBack  = await safeUpload(`kyc/${user.uid}/tutor_cccd_back.jpg`,  fBack,  "Ảnh CCCD/CMND (mặt sau)",   ALLOW_IMG);
      const urlSelf  = await safeUpload(`kyc/${user.uid}/tutor_selfie.jpg`,     fSelf,  "Ảnh chân dung/selfie",      ALLOW_IMG);

      const certUrls = [];
      for (let i = 0; i < fCerts.length; i++) {
        // Chứng chỉ: cho phép PDF
        const u = await safeUpload(`kyc/${user.uid}/cert_${i+1}`, fCerts[i], `Chứng chỉ #${i+1}`, ALLOW_CERT);
        if (u) certUrls.push(u);
      }

      const payload = {
        role: "tutor",
        verify:  { status: "submitted", submittedAt: Date.now(), reviewNote: "" },
        profile: { name, dob, cccd, phone, address },
        tutor:   { subjects, levels, bio, certificates: certUrls },
        kyc:     { cccd_front: urlFront, cccd_back: urlBack, selfie: urlSelf }
      };

      try { await saveUserDoc(user.uid, payload); } catch (e) { console.warn(e); }
      try { localStorage.setItem(`taedu_onboarding:tutor:${user.uid}`, JSON.stringify(payload)); } catch(_){}

      toast("Đã gửi hồ sơ gia sư. Chờ duyệt.");
      show("submitted");
    } finally {
      setBusy(form, false);
    }
  });
}

// ===== Boot
document.addEventListener("DOMContentLoaded", async () => {
  await ensureFirebaseReady();   // <— bắt buộc để có DEFAULT app

  bindRoleSelect();
  bindStudent();
  bindTutor();

  routeByHash();
  window.addEventListener("hashchange", routeByHash);

  if (!location.hash) location.replace("role.html#step=select");
});
