// functions/kyc.js
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

if (!admin.apps.length) admin.initializeApp();

function mailer() {
  if (!process.env.SMTP_HOST) return null; // cho phép chạy không mail
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

exports.kycReview = onRequest({ region: 'asia-southeast1' }, async (req, res) => {
  try {
    // Hỗ trợ GET lẫn POST
    const q = req.method === 'POST' ? req.body : req.query;
    const uid   = String(q.uid || '').trim();
    const action= String(q.action || '').trim();   // approve | reject
    const key   = String(q.key || '').trim();      // so với ADMIN_REVIEW_KEY
    const note  = (q.note || '').toString().slice(0, 500);

    if (!uid || !['approve','reject'].includes(action)) {
      res.status(400).send('Bad Request: uid/action');
      return;
    }
    if (!key || key !== process.env.ADMIN_REVIEW_KEY) {
      res.status(403).send('Forbidden');
      return;
    }

    const db  = admin.firestore();
    const ref = db.doc(`users/${uid}`);
    const snap= await ref.get();
    if (!snap.exists) { res.status(404).send('User not found'); return; }

    const data    = snap.data() || {};
    const newStat = action === 'approve' ? 'approved' : 'rejected';

    await ref.set({
      verify: {
        ...(data.verify||{}),
        status: newStat,
        reviewNote: note || '',
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    }, { merge: true });

    // (Tuỳ chọn) gửi mail cho user
    try {
      const to = data.email;
      if (to) {
        const tr = mailer();
        if (tr) {
          const subject = action === 'approve' ? 'TA-Edu: Hồ sơ đã được duyệt' : 'TA-Edu: Hồ sơ bị từ chối';
          const html = action === 'approve'
            ? `<p>Chào ${data.displayName || ''},</p><p>Hồ sơ của bạn đã được <b>duyệt</b>. Bạn có thể sử dụng đầy đủ tính năng trên TA-Edu.</p>`
            : `<p>Chào ${data.displayName || ''},</p><p>Hồ sơ của bạn đã <b>bị từ chối</b>. ${note ? ('Lý do: '+note) : ''}</p><p>Bạn có thể cập nhật và gửi lại tại trang hồ sơ.</p>`;
          await tr.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html });
        }
      }
    } catch (_) { /* bỏ qua khi chạy emulator */ }

    res.set('Content-Type','text/html; charset=utf-8');
    res.status(200).send(`
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto;max-width:580px;margin:24px auto;padding:16px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="margin:0 0 6px">KYC ${action==='approve'?'Approved ✅':'Rejected ❌'}</h2>
        <p>User: <code>${uid}</code></p>
        ${note ? `<p><b>Note:</b> ${note}</p>`:''}
        <p><a href="/">Về trang chủ</a></p>
      </div>`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Error');
  }
});
