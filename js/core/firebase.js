// js/core/firebase.js
// Khởi tạo Firebase cho TA-Edu, mặc định dùng Cloud (không emulator)
// Có thể bật emulator tạm thời: 
//   - localStorage.setItem('taedu:emu','1')  hoặc
//   - thêm ?emu=1 vào URL

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithEmailAndPassword,
  signInWithPopup, onAuthStateChanged, signOut,
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getStorage, connectStorageEmulator
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

// ---- Config của bạn ----
const firebaseConfig = {
  apiKey: "AIzaSyAaXumzkgOlIvb76J_bFXa28S51lyfimew",
  authDomain: "ta-edu-nh.firebaseapp.com",
  projectId: "ta-edu-nh",
  storageBucket: "ta-edu-nh.appspot.com",
  messagingSenderId: "342673903321",
  appId: "1:342673903321:web:a7a2e58d79347c9ae0b8c8",
  measurementId: "G-XZ90FNSZEQ"
};

// Khởi tạo (đảm bảo chỉ 1 [DEFAULT])
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Core
const auth    = getAuth(app);
const provider= new GoogleAuthProvider();
const db      = getFirestore(app);
const storage = getStorage(app);

// --------- Emulators (tùy chọn) ---------
// Bật qua localStorage.setItem('taedu:emu','1') hoặc query ?emu=1
const urlHasEmu = new URLSearchParams(location.search).get("emu") === "1";
const wantEmu   = localStorage.getItem("taedu:emu") === "1" || urlHasEmu;

if (wantEmu) {
  // Chỉ bật khi chạy localhost/127.* để tránh nhầm ở production
  const isLocal = /^(localhost|127\.|192\.168\.)/.test(location.hostname);
  if (isLocal) {
    try {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectAuthEmulator(auth, "http://127.0.0.1:9099");
      connectStorageEmulator(storage, "127.0.0.1", 9199);
      console.log("%c[TA-Edu] Using Firebase Emulators", "color:#0aa");
    } catch (e) {
      console.warn("[TA-Edu] Emulator connect failed:", e);
    }
  }
}

// Tạo profile user lần đầu
async function ensureUserProfile(user) {
  if (!user) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName || "",
      email: user.email || "",
      role: "Học sinh",
      wallet: 0,
      reputation: 0,
      createdAt: Date.now()
    });
  }
}

// Expose cho debug
window.__TAEDU_FIREBASE = { app, auth, db, storage };

export {
  app, auth, provider, db, storage,
  ensureUserProfile,
  signInWithEmailAndPassword, signInWithPopup, onAuthStateChanged, signOut
};
