/**
 * TA-Edu 2.x — boot_header.js
 * - Nạp partial header
 * - Đăng nhập Google, logout
 * - Hiển thị avatar/menu, highlight avatar ở Dashboard
 * - Gate sau login: LOGIN -> ROLE -> KYC (approved mới cho đi tiếp)
 * (Giữ nguyên selector/ID chuẩn TA-Edu)
 */

(() => {
  // ================= Helpers =================
  const $ = (s, r = document) => r.querySelector(s);
  const on = (el, ev, cb) => el && el.addEventListener(ev, cb);

  const FALLBACK_AVATAR = "assets/default_avatar.svg";
  const HEADER_URL = "/partials/header.html"; // luôn lấy từ gốc web, tránh lỗi đường dẫn khi ở subfolder

  // refs phần tử trong header (sau khi partial được nạp mới có)
  let btnLogin, btnLogout, userInfo, userPhoto, userMenu, menuName, menuWallet, dashboardLink;

  function bindHeaderRefs() {
    btnLogin   = $("#btnLogin");
    btnLogout  = $("#btnLogout");
    userInfo   = $("#userInfo");
    userPhoto  = $("#userPhoto");
    userMenu   = $("#userMenu");
    menuName   = $("#menuName");
    menuWallet = $("#menuWallet");
    dashboardLink = $("#dashboardLink");
  }

  // ================= Header partial =================
  async function mountHeader() {
    try {
      const res = await fetch(HEADER_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("Cannot load header.html");
      const html = await res.text();

      // chèn ngay sau <body>
      const wrap = document.createElement("div");
      wrap.id = "taedu-header-mount";
      wrap.innerHTML = html;
      document.body.insertAdjacentElement("afterbegin", wrap);

      bindHeaderRefs();
      bindHeaderUIBasics();
    } catch (e) {
      console.error("Mount header failed:", e);
    }
  }

  // ================= UI cơ bản =================
  function setAuthUI(isAuth) {
    if (isAuth) {
      if (btnLogin)  btnLogin.hidden = true;
      if (userInfo)  userInfo.hidden = false;
    } else {
      if (btnLogin)  btnLogin.hidden = false;
      if (userInfo)  userInfo.hidden = true;
    }
  }

  function updateAvatar(src) {
    if (userPhoto) userPhoto.src = src || FALLBACK_AVATAR;
  }

  function bindHeaderUIBasics() {
    // toggle menu avatar
    on(userPhoto, "click", () => userMenu && userMenu.classList.toggle("is-open"));
    on(document, "click", (e) => {
      if (!userMenu) return;
      const inside = e.target.closest("#userMenu, #userPhoto");
      if (!inside) userMenu.classList.remove("is-open");
    });

    // highlight avatar ở dashboard
    const file = (location.pathname.split("/").pop() || "").toLowerCase();
    if (file === "dashboard.html" && userPhoto) userPhoto.classList.add("is-current");
  }

  // ================= Gate sau đăng nhập =================
  async function taeduGateAfterLogin(user) {
    // cho phép ở lại một số trang để tránh vòng lặp
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const SKIP = new Set(["role.html", "smarttutor.html"]);
    if (SKIP.has(file)) return true;

    let role = null, status = null;

    // lấy từ Firestore (nếu sẵn)
    try {
      const { getFirestore, doc, getDoc } =
        await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
      const db = getFirestore();
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const d = snap.data();
        role   = d.role || null;
        status = d.verify?.status || null;
      }
    } catch (_) {}

    // fallback localStorage (offline / chưa có doc)
    if (!role) role = localStorage.getItem(`taedu:role:${user.uid}`) || null;

    if (!role) {
      location.replace("role.html#step=select");
      return false;
    }
    if (status !== "approved") {
      location.replace(`role.html#step=${role}`);
      return false;
    }
    return true;
  }

  // ================= Firebase Auth =================
  let auth = null;

  async function initAuth() {
    const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } =
    await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js");
    auth = getAuth();

    // login
    on(btnLogin, "click", async () => {
      try {
        const prov = new GoogleAuthProvider();
        await signInWithPopup(auth, prov);
      } catch (e) { console.error(e); alert("Không thể đăng nhập. Vui lòng thử lại."); }
    });

    // logout
    on(btnLogout, "click", async () => {
      try { await signOut(auth); } catch (e) { console.error(e); }
    });

    // thay đổi trạng thái đăng nhập
    onAuthStateChanged(auth, (user) => {
      window.__TAEDU_LAST_USER = user || null;
      window.dispatchEvent(new CustomEvent("taedu:user-ready", { detail: { user } }));

      const isAuth = !!user;
      setAuthUI(isAuth);

      if (isAuth) {
        updateAvatar(user.photoURL || FALLBACK_AVATAR);
        if (menuName)   menuName.textContent   = user.displayName || "Người dùng";
        if (menuWallet) menuWallet.textContent = (menuWallet.textContent || "");
        if (dashboardLink) dashboardLink.style.display = "";

        // gate: LOGIN -> ROLE -> KYC
        taeduGateAfterLogin(user);
      } else {
        updateAvatar(FALLBACK_AVATAR);
        if (dashboardLink) dashboardLink.style.display = "none";
      }
    });
  }

  // ================= Boot =================
  document.addEventListener("DOMContentLoaded", async () => {
    await mountHeader();   // 1) nạp header (và bind refs)
    await initAuth();      // 2) khởi tạo auth & gắn sự kiện
  });
})();
