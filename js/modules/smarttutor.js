// js/modules/smarttutor.js  — bản đã sửa cho Live Server + Emulator
// - Không lộ API key: client chỉ gọi endpoint server.
// - Tự nhận ID phần tử cho cả smarttutor.html và widget dashboard.
// - Ưu tiên URL backend từ window.TA_EDU_TUTOR_BACKEND; fallback /api/smarttutor.

import { auth } from "../core/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// ====== Phần tử UI (hỗ trợ 2 layout) ======
const chatBox =
  document.getElementById("chat-box") ||
  document.getElementById("tutorMessages");

const input =
  document.getElementById("user-input") ||
  document.getElementById("tutorInput");

const sendBtn =
  document.getElementById("send-btn") ||
  document.getElementById("tutorSend");

const form = document.getElementById("tutorForm"); // có ở widget

// Xác định class cho tin nhắn theo layout
const CLASS_USER = chatBox?.id === "tutorMessages" ? "tutor-user" : "user-msg";
const CLASS_BOT  = chatBox?.id === "tutorMessages" ? "tutor-bot"  : "bot-msg";

// ====== URL backend (emulator hoặc hosting rewrite) ======
const BACKEND_URL =
  (typeof window !== "undefined" && window.TA_EDU_TUTOR_BACKEND) ||
  "/api/smarttutor";

// ====== Bảo vệ đăng nhập ======
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Dùng đường dẫn tương đối để không lỗi subpath
    window.location.href = "index.html";
  } else {
    appendMessage("bot", `Xin chào ${user.displayName || "bạn"} 👋! Mình là SmartTutor, hỏi mình bất kỳ điều gì nhé.`);
  }
});

// ====== Gửi tin ======
if (form) {
  // Nếu là widget có <form> thì submit để chặn reload
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });
} else if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

if (input) {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

async function sendMessage() {
  const text = (input?.value || "").trim();
  if (!text || !chatBox) return;

  appendMessage("user", text);
  if (input) input.value = "";
  appendMessage("bot", "⏳ Đang suy nghĩ...");

  try {
    const reply = await askAI(text);
    chatBox.lastElementChild?.remove(); // bỏ dòng "Đang suy nghĩ…"
    appendMessage("bot", reply);
  } catch (e) {
    chatBox.lastElementChild?.remove();
    appendMessage("bot", "⚠️ Lỗi kết nối. Thử lại sau nhé!");
    console.error(e);
  }
}

async function askAI(latestUserText) {
  // Thu thập vài tin gần nhất cho ngữ cảnh (hỗ trợ 2 bộ class)
  const nodes = [...chatBox.querySelectorAll(`.${CLASS_USER}, .${CLASS_BOT}, .user-msg, .bot-msg`)];
  const history = nodes.slice(-8).map(el => ({
    role: el.classList.contains(CLASS_USER) || el.classList.contains("user-msg") ? "user" : "assistant",
    content: el.textContent.trim()
  }));
  history.push({ role: "user", content: latestUserText });

  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Server error ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.reply?.trim() || "Xin lỗi, mình chưa hiểu rõ câu hỏi này.";
}

function appendMessage(sender, msg) {
  if (!chatBox) return;
  const div = document.createElement("div");
  div.className = sender === "user" ? CLASS_USER : CLASS_BOT;
  div.textContent = msg;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  // Tự nở textarea nếu là widget
  if (input && input.tagName === "TEXTAREA") {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }
}
