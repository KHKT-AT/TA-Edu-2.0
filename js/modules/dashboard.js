// js/modules/dashboard.js
// TA-Edu 2.x — BẢN SỬA KHỚP HTML HIỆN TẠI (không import)
// - Điều hướng tab bằng hash
// - Fill user cho cả Sidebar (#dash*) và Profile (#profile*)
// - Tô sáng avatar header (.is-current)
// - Không phá hiệu ứng cũ

const DEFAULT_AVATAR = "assets/default_avatar.svg";

/* Helpers */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* Hash ⇄ Tab */
function getTabFromHash() {
  const m = location.hash.match(/#tab=([a-z0-9_-]+)/i);
  return m ? m[1] : "profile";
}
function setHash(tab) {
  const h = `#tab=${tab}`;
  if (location.hash !== h) history.replaceState(null, "", h);
}

/* Kích hoạt UI theo tab */
function activateNav(tab) {
  $$(".dash__nav .nav-item[data-tab]").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.tab === tab);
    if (!a.getAttribute("href") || !a.getAttribute("href").startsWith("#tab=")) {
      a.setAttribute("href", `#tab=${a.dataset.tab}`);
    }
  });
}
function activatePanel(tab) {
  $$('.panel[id^="tab-"]').forEach((p) => {
    p.classList.toggle("is-active", p.id === `tab-${tab}`);
  });
}
function activateTab(tab, { pushHash = true } = {}) {
  activateNav(tab);
  activatePanel(tab);
  if (pushHash) setHash(tab);
}
function bindNav() {
  $$(".dash__nav .nav-item[data-tab]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = a.dataset.tab;
      if (tab) activateTab(tab, { pushHash: true });
    });
  });
  window.addEventListener("hashchange", () => {
    activateTab(getTabFromHash(), { pushHash: false });
  });
}

/* Fill User */
function fillText(selectors, value) {
  selectors.forEach((sel) => $$(sel).forEach((el) => (el.textContent = value || "")));
}
function fillPhoto(selectors, src, alt) {
  selectors.forEach((sel) =>
    $$(sel).forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      img.src = src || DEFAULT_AVATAR;
      img.alt = alt || "User";
      img.addEventListener("error", () => (img.src = DEFAULT_AVATAR), { once: true });
    })
  );
}
function formatVND(n) {
  const v = Number.isFinite(+n) ? +n : 0;
  return v.toLocaleString("vi-VN") + "₫";
}
function fillUser(user) {
  const name  = user?.displayName || (user?.email ? user.email.split("@")[0] : "") || "Người dùng";
  const email = user?.email || "";
  const photo = user?.photoURL || DEFAULT_AVATAR;

  // Sidebar
  fillText(["#dashName", "[data-user-name]", ".dash__user-name"], name);
  fillText(["#dashEmail", "[data-user-email]", ".dash__user-email"], email);
  fillPhoto(["#dashAvatar", "img#dashAvatar", "[data-user-photo]"], photo, name);

  // Profile
  fillText(["#profileName", "[data-user-name]"], name);
  fillText(["#profileEmail", "[data-user-email]"], email);
  fillPhoto(["#profileAvatar", "#profilePhoto", "img[data-user-photo]"], photo, name);

  // Wallet (nếu có)
  if (typeof user?.wallet === "number") {
    const el = $("#walletAmount");
    if (el) el.textContent = formatVND(user.wallet);
  }
}

/* Watch user (tương thích nhiều cách) */
function watchUser(callback) {
  // Fill ngay nếu header đã có user
  if (window.__TAEDU_LAST_USER) {
    try { callback(window.__TAEDU_LAST_USER); } catch (_) {}
  }
  // Nghe sự kiện do header phát
  window.addEventListener("taedu:user-ready", (e) => callback(e.detail?.user));

  // Fallback: nếu có Firebase global
  try {
    if (window.auth && typeof window.auth.onAuthStateChanged === "function") {
      return window.auth.onAuthStateChanged(callback);
    }
    if (window.firebase?.auth) {
      return window.firebase.auth().onAuthStateChanged(callback);
    }
  } catch (err) {
    console.warn("watchUser fallback error:", err);
  }
}

/* Header highlight */
function highlightHeaderForDashboard() {
  const avatar = $("img#userPhoto.header-avatar") || $("#userPhoto");
  if (avatar) avatar.classList.add("is-current");
  const homeCandidates = [
    'a[href$=\"index.html\"].active',
    'a[href=\"/\"].active',
    '#navHome.active',
    '.nav-home.active',
  ];
  for (const sel of homeCandidates) {
    const el = document.querySelector(sel);
    if (el) { el.classList.remove("active"); break; }
  }
}

/* Logout trong Dashboard (nếu có nút) */
function bindLogout() {
  const btn = $("#dashLogout");
  if (!btn) return;
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      if (window.doLogoutAndRedirect) {
        await window.doLogoutAndRedirect("index.html");
        return;
      }
      if (window.auth?.signOut) {
        await window.auth.signOut();
      } else if (window.firebase?.auth) {
        await window.firebase.auth().signOut();
      }
    } catch (err) {
      console.error(err);
      alert("Đăng xuất thất bại, vui lòng thử lại.");
    } finally {
      location.href = "index.html";
    }
  });
}

/* Init */
document.addEventListener("DOMContentLoaded", () => {
  bindNav();
  bindLogout();
  activateTab(getTabFromHash(), { pushHash: false });
  highlightHeaderForDashboard();

  watchUser((user) => {
    if (!user) return;
    fillUser(user);
  });
});
