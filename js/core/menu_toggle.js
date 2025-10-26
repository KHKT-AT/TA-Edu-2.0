// js/core/menu_toggle.js
// Toggle menu cho header TA-Edu (đợi header sẵn sàng, overlay, ESC, resize, active link)
const READY_EVENT = "taedu:header:ready";

function initMenuToggle() {
  const btn = document.querySelector("#menuToggle, [data-menu-toggle]");
  const nav = document.querySelector("#mainNav, [data-menu]");
  if (!btn || !nav) return;

  let overlay = document.getElementById("menuOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "menuOverlay";
    overlay.className = "menu-overlay";
    overlay.hidden = true;
    nav.parentElement?.appendChild(overlay);
  }

  const mq = window.matchMedia("(min-width: 992px)");

  const open  = () => { nav.classList.add("open");  btn.setAttribute("aria-expanded","true");  overlay.hidden = false;  document.body.classList.add("nav-open"); };
  const close = () => { nav.classList.remove("open"); btn.setAttribute("aria-expanded","false"); overlay.hidden = true;  document.body.classList.remove("nav-open"); };
  const toggle = () => (nav.classList.contains("open") ? close() : open());

  btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); toggle(); });
  overlay.addEventListener("click", close);
  document.addEventListener("click", e => { if (!nav.contains(e.target) && !btn.contains(e.target)) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  if (typeof mq.addEventListener === "function") mq.addEventListener("change", e => e.matches && close());
  else window.addEventListener("resize", () => { if (window.innerWidth >= 992) close(); });

  try {
    const current = location.pathname.split("/").pop();
    nav.querySelectorAll("a[href]").forEach(a => {
      const url = new URL(a.href, location.origin);
      if (url.pathname.split("/").pop() === current && current !== "") a.classList.add("active");
    });
  } catch {}
}

if (document.querySelector("#mainNav, [data-menu]")) initMenuToggle();
else document.addEventListener(READY_EVENT, initMenuToggle, { once: true });
