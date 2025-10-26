// js/modules/wallet.js
// TA-Edu 2.x — Ví: Lịch sử mặc định + Nạp/Rút dạng TAB + Thông báo phụ huynh
// - Mặc định: ẩn cả Nạp/Rút, chỉ hiện Lịch sử cho đến khi bấm nút
// - Nạp: cập nhật số dư cục bộ + gửi thông báo email cho phụ huynh (nếu có)
// - Rút: KHÔNG trừ số dư; tạo yêu cầu "pending" chờ phụ huynh duyệt + gửi email
// - Điểm móc HTTP Cloud Function: /api/notify-parent  (có thể đổi tuỳ bạn)

const DEFAULT_KEY = 'guest'; // fallback khi chưa có uid/email

/* ===== Helpers ===== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmt = (n) => ((+n || 0).toLocaleString('vi-VN') + '₫');

/* ===== User context ===== */
function getUserKey() {
  const u = window.__TAEDU_LAST_USER;
  if (u?.uid) return u.uid;
  if (u?.email) return u.email;
  return DEFAULT_KEY;
}
function minimalUser() {
  const u = window.__TAEDU_LAST_USER || {};
  return { uid: u.uid || null, email: u.email || null, name: u.displayName || null };
}

/* ===== Storage (local) ===== */
const kBalance = () => `taedu_wallet_balance:${getUserKey()}`;
const kHistory = () => `taedu_wallet_history:${getUserKey()}`;
const kMode    = () => `taedu_wallet_mode`;              // 'none' | 'deposit' | 'withdraw'
const kParent  = () => `taedu_parent_email:${getUserKey()}`;

function readBalance() { return +(localStorage.getItem(kBalance()) || 0); }
function writeBalance(v){ localStorage.setItem(kBalance(), String(Math.max(0, +v || 0))); }
function readHistory() {
  try { return JSON.parse(localStorage.getItem(kHistory()) || '[]'); }
  catch { return []; }
}
function writeHistory(list){ localStorage.setItem(kHistory(), JSON.stringify(list || [])); }
function getParentEmail() {
  // Ưu tiên lấy từ user object nếu có
  const u = window.__TAEDU_LAST_USER || {};
  if (u.parentEmail) return u.parentEmail;
  // fallback localStorage
  return localStorage.getItem(kParent()) || '';
}
function setParentEmail(email) {
  localStorage.setItem(kParent(), email.trim());
}
function isEmail(x) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x || '').trim());
}
async function ensureParentEmail({ forcePrompt = false } = {}) {
  let email = getParentEmail();
  if (!email || forcePrompt) {
    const val = prompt('Nhập email phụ huynh để nhận thông báo:', email || '');
    if (!val) return '';
    if (!isEmail(val)) { alert('Email không hợp lệ.'); return ''; }
    setParentEmail(val);
    email = val;
  }
  return email;
}

/* ===== Mock API (đổi sang Firestore sau) ===== */
async function createDepositRequest(user, amount, note) {
  // Ở bản thật: tạo PaymentIntent/QR, xác nhận v.v.
  return { id: `dep_${Date.now()}`, status: 'success', amount, note: note || '' };
}
async function createWithdrawRequest(user, amount, method, target) {
  // Ở bản thật: tạo document "withdraw_requests" trạng thái "pending_parent"
  return { id: `wd_${Date.now()}`, status: 'pending', amount, method, target };
}

/* ===== Thông báo phụ huynh qua HTTP Function (tuỳ chọn) =====
   - Bạn triển khai 1 Cloud Function HTTP (ví dụ: /api/notify-parent)
   - Body JSON: { event: 'deposit'|'withdraw_request', parentEmail, user, data }
   - Ở đây nếu endpoint không tồn tại -> chỉ console.warn và tiếp tục UI
*/
async function notifyParent(event, data) {
  const parentEmail = getParentEmail();
  if (!parentEmail) return false;

  try {
    await fetch('/api/notify-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, parentEmail, user: minimalUser(), data })
    });
    return true;
  } catch (e) {
    console.warn('notifyParent failed (mock):', e);
    return false;
  }
}

/* ===== UI cập nhật ===== */
function updateBalanceUI() {
  const el = $('#walletAmount');
  if (el) el.textContent = fmt(readBalance());
}
function renderHistory() {
  const list = readHistory();
  const wrap = $('#walletHistory');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = `<div class="history-empty">Chưa có giao dịch nào.</div>`;
    return;
  }
  wrap.innerHTML = list.map(item => {
    const isIn = item.type === 'deposit';
    const sign = isIn ? '+' : '−';
    const cls  = isIn ? 'tx--in' : 'tx--out';
    const amt  = fmt(item.amount);
    const dt   = new Date(item.ts).toLocaleString('vi-VN');
    const note = item.note ? `<div class="tx__note">${item.note}</div>` : '';
    const meta = item.method ? `<div class="tx__meta">Phương thức: ${item.method} · ${item.target || ''}</div>` : '';
    // status: success | pending | failed
    return `
      <article class="tx ${cls}">
        <div class="tx__row">
          <div class="tx__type">
            ${isIn ? '<i class="fa-solid fa-arrow-down"></i> Nạp'
                    : '<i class="fa-solid fa-arrow-up"></i> Rút'}
          </div>
          <div class="tx__amount">${sign}${amt}</div>
        </div>
        <div class="tx__row tx__row--sub">
          <div class="tx__time">${dt}</div>
          <div class="tx__status ${item.status}">${item.status}</div>
        </div>
        ${note}${meta}
      </article>
    `;
  }).join('');
}

/* ===== Nút “tab con”: Nạp/Rút/None ===== */
function setWalletMode(mode) {
  const dep = $('#walletDeposit');
  const wd  = $('#walletWithdraw');

  // Ẩn/hiện form
  if (dep) dep.classList.toggle('is-hidden', mode !== 'deposit');
  if (wd)  wd .classList.toggle('is-hidden', mode !== 'withdraw');

  // highlight nút
  $$('.wallet__summary-actions [data-wallet-jump]').forEach(btn => {
    const t = btn.getAttribute('data-wallet-jump');
    const m = (t === '#walletDeposit') ? 'deposit' : 'withdraw';
    btn.classList.toggle('is-active', m === mode);
  });

  // Lưu + scroll
  localStorage.setItem(kMode(), mode);
  const target = (mode === 'deposit') ? dep : (mode === 'withdraw' ? wd : null);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function bindModeButtons() {
  $$('.wallet__summary-actions [data-wallet-jump]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isDeposit = btn.getAttribute('data-wallet-jump') === '#walletDeposit';
      setWalletMode(isDeposit ? 'deposit' : 'withdraw');
    });
  });
}

/* ===== Hành động: Nạp/Rút/Xoá lịch sử ===== */
function bindQuickAmounts(containerSel, inputSel) {
  const c = $(containerSel); const input = $(inputSel);
  if (!c || !input) return;
  c.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip[data-amount]');
    if (!btn) return;
    const add = +btn.dataset.amount || 0;
    input.value = String((+input.value || 0) + add);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function bindDeposit() {
  const form = $('#formDeposit');
  if (!form) return;
  const amountEl = $('#depAmount');
  const noteEl   = $('#depNote');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = +amountEl.value;
    if (!Number.isFinite(amount) || amount < 10000) {
      alert('Số tiền nạp phải ≥ 10.000₫'); return;
    }

    // Cho phép nạp ngay (offline) + gửi email phụ huynh nếu có
    const user = window.__TAEDU_LAST_USER || null;
    const res  = await createDepositRequest(user, amount, noteEl.value.trim());

    writeBalance(readBalance() + amount);
    const list = readHistory();
    list.unshift({ id: res.id, type: 'deposit', amount, status: 'success', note: noteEl.value.trim(), ts: Date.now() });
    writeHistory(list);

    // Thông báo phụ huynh (nếu có)
    (async () => {
      const ok = await notifyParent('deposit', { amount, note: noteEl.value.trim() });
      if (!ok) console.warn('Không gửi được email phụ huynh (deposit).');
    })();

    updateBalanceUI(); renderHistory();
    amountEl.value = ''; noteEl.value = '';
    alert('Nạp tiền thành công (mô phỏng).');
  });
}

function bindWithdraw() {
  const f = $('#formWithdraw');
  if (!f) return;
  const amountEl = $('#wdAmount');
  const methodEl = $('#wdMethod');
  const targetEl = $('#wdTarget');

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = +amountEl.value;
    if (!Number.isFinite(amount) || amount < 20000) {
      alert('Số tiền rút phải ≥ 20.000₫'); return;
    }
    const bal = readBalance();
    if (amount > bal) { alert('Số dư không đủ để rút.'); return; }

    // BẮT BUỘC có email phụ huynh để xác nhận
    let parent = getParentEmail();
    if (!parent) {
      parent = await ensureParentEmail({ forcePrompt: true });
      if (!parent) {
        alert('Bạn cần cung cấp email phụ huynh để gửi yêu cầu xác nhận.'); 
        return;
      }
    }

    // Tạo yêu cầu rút PENDING (chưa trừ số dư)
    const user = window.__TAEDU_LAST_USER || null;
    const res  = await createWithdrawRequest(user, amount, methodEl.value, targetEl.value.trim());

    // Lưu lịch sử ở trạng thái 'pending'
    const list = readHistory();
    list.unshift({
      id: res.id, type: 'withdraw', amount, status: 'pending',
      method: methodEl.value, target: targetEl.value.trim(), ts: Date.now()
    });
    writeHistory(list);
    renderHistory();

    // Gửi email phụ huynh
    const ok = await notifyParent('withdraw_request', {
      amount, method: methodEl.value, target: targetEl.value.trim()
    });
    if (!ok) console.warn('Không gửi được email phụ huynh (withdraw).');

    amountEl.value = ''; targetEl.value = '';
    alert('Đã gửi yêu cầu rút. Chờ phụ huynh xác nhận qua email.');
  });
}

function bindClearHistory() {
  $('#walletClearHistory')?.addEventListener('click', () => {
    if (!confirm('Xoá toàn bộ lịch sử giao dịch (cục bộ) cho tài khoản này?')) return;
    writeHistory([]); renderHistory();
  });
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', () => {

    
  // UI cơ bản
  updateBalanceUI();
  renderHistory();

  // Bắt sự kiện
  bindModeButtons();
  bindQuickAmounts('.wallet #walletDeposit .quick-amounts', '#depAmount');
  bindDeposit();
  bindWithdraw();
  bindClearHistory();

  // Khởi tạo mode:
  // - Nếu chưa lưu => 'none' (chỉ hiển thị lịch sử)
  // - Nếu đã lưu => dùng 'deposit' hoặc 'withdraw'
  const saved = localStorage.getItem(kMode());
  const initMode = (saved === 'deposit' || saved === 'withdraw') ? saved : 'none';
  setWalletMode(initMode);

  // Khi header đổi user => refresh số dư/lịch sử
  window.addEventListener('taedu:user-ready', () => {
    updateBalanceUI();
    renderHistory();
  });

  // Tuỳ chọn: Alt+Click nút "Nạp/Rút" để sửa email phụ huynh nhanh
  $$('.wallet__summary-actions [data-wallet-jump]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (e.altKey) {
        e.preventDefault();
        const newMail = await ensureParentEmail({ forcePrompt: true });
        if (newMail) alert('Đã cập nhật email phụ huynh: ' + newMail);
      }
    });
  });
  // Khoá form rút khi chưa đủ điều kiện (nghe sự kiện từ user_status.js)
(function(){
  const withdrawCard = document.getElementById('wallet-withdraw-card'); // hoặc selector phù hợp của bạn
  const warnEl = document.getElementById('wallet-withdraw-warn');       // <small> cảnh báo (nếu bạn có)
  window.addEventListener('taedu:verify-status', (e)=>{
    const s = e.detail;
    const block = (s.role==='student' && !s.allowWithdraw);
    if(withdrawCard){
      withdrawCard.classList.toggle('is-disabled', block);
      if(warnEl) warnEl.hidden = !block;
    }
  });
})();

});
