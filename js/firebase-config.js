// ==========================================================
// firebase-config.js - connects the app to Firebase.
// ==========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

// 👇 PASTE YOUR OWN VALUES HERE (Firebase console → Project settings → Your apps)
const firebaseConfig = {
  apiKey: "AIzaSyC0G0tavsQq1Zodzfvjchms8EFT6S20M1o",
  authDomain: "my-jixbank.firebaseapp.com",
  projectId: "my-jixbank",
  storageBucket: "my-jixbank.firebasestorage.app",
  messagingSenderId: "882806161512",
  appId: "1:882806161512:web:fe9fa6fb36d4f2ffaa3bdd",
  measurementId: "G-C4R9XYET2M"
};

// ======================================================
// THE SWITCHES
//
// SIMPLE MODE (default, works on the free Firebase plan):
//   USE_CLOUD_FUNCTIONS = false   USE_EMULATORS = false
//   -> just open the site with Live Server. No Java, no terminal.
//
// SECURE MODE (needs the emulator or the paid Blaze plan):
//   USE_CLOUD_FUNCTIONS = true    USE_EMULATORS = true  (or false once deployed)
//   -> also switch firestore.rules to the contents of firestore.secure.rules
// ======================================================
export const USE_CLOUD_FUNCTIONS = false;
const USE_EMULATORS = false;

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  console.log("🧪 Using LOCAL EMULATORS (not the real Firebase project)");
}
