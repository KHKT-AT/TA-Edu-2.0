// functions/index.js
const { onRequest } = require("firebase-functions/v2/https");
const nodemailer = require("nodemailer");

// ========== SmartTutor ==========
exports.smarttutor = onRequest(
  { region: "asia-southeast1", cors: true },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    // --- kiểm tra env ---
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY is MISSING.");
      return res.status(500).send("Server missing OPENAI_API_KEY");
    }

    // chỉ require & tạo client khi đã có key
    const OpenAI = require("openai");
    const openai = new OpenAI({ apiKey });

    try {
      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const system = { role: "system", content: "Bạn là SmartTutor, giải thích ngắn gọn, dễ hiểu, từng bước." };

      const r = await openai.responses.create({
        model: "gpt-5",
        input: [system, ...messages].slice(-12)
      });

      res.json({ reply: (r.output_text || "").trim() || "Mình chưa có câu trả lời." });
    } catch (e) {
      console.error("SmartTutor error:", e);
      res.status(500).send(e?.message || "OpenAI error");
    }
  }
);

// ========== Notify Parent (email) ==========
function isEmail(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x || "").trim()); }

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true", // true = 465
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

exports.notifyParent = onRequest(
  { region: "asia-southeast1", cors: true },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const { event, parentEmail, user, data } = req.body || {};
    if (!isEmail(parentEmail)) return res.status(400).json({ error: "invalid parentEmail" });

    const subject =
      event === "withdraw_request"
        ? "[TA-Edu] Xác nhận yêu cầu rút tiền"
        : "[TA-Edu] Thông báo nạp tiền";

    const html = `
      <p>Phụ huynh thân mến,</p>
      <p>Học sinh: <b>${user?.name || user?.email || user?.uid || "Không rõ"}</b></p>
      <p>Sự kiện: <b>${event}</b></p>
      <p>Nội dung: <pre style="background:#f6f8f9;padding:10px;border-radius:8px">${JSON.stringify(data || {}, null, 2)}</pre></p>
      ${event === "withdraw_request"
        ? `<p><i>Yêu cầu rút đang chờ bạn xác nhận (trả lời email này hoặc xác nhận trên hệ thống).</i></p>`
        : ""}
      <p>Trân trọng,<br/>TA-Edu</p>
    `;

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || `TA-Edu <${process.env.SMTP_USER}>`,
        to: parentEmail,
        subject,
        html,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("notifyParent error:", err);
      res.status(500).json({ ok: false, error: "email_send_failed" });
    }
  }
);
// Thêm dòng này ở dưới các require/exports hiện có:
exports.kycReview = require('./kyc').kycReview;

