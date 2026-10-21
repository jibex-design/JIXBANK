import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { friendlyAuthError } from "./auth-errors.js";
import { setupSocialButtons } from "./social-auth.js";

const form = document.getElementById("loginForm");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");

function showMessage(el, text, type) {
  el.textContent = text;
  el.className = `form-message ${type}`;
}

// ---------- Login ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) return showMessage(formMessage, "Please enter your email and password.", "error");

  submitBtn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch (err) {
    submitBtn.disabled = false;
    showMessage(formMessage, friendlyAuthError(err), "error");
  }
});

// ---------- Forgot password pop-up ----------
const forgotModal = document.getElementById("forgotModal");
const resetEmail = document.getElementById("resetEmail");
const resetMessage = document.getElementById("resetMessage");

document.getElementById("forgotLink").addEventListener("click", () => {
  resetEmail.value = document.getElementById("email").value.trim();
  resetMessage.className = "form-message";
  forgotModal.classList.remove("hidden");
  resetEmail.focus();
});

document.getElementById("closeReset").addEventListener("click", () => forgotModal.classList.add("hidden"));
forgotModal.addEventListener("click", (e) => {
  if (e.target === forgotModal) forgotModal.classList.add("hidden");
});

document.getElementById("sendReset").addEventListener("click", async () => {
  const email = resetEmail.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showMessage(resetMessage, "Please enter a valid email address.", "error");
  }

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    if (err.code === "auth/network-request-failed") {
      return showMessage(resetMessage, friendlyAuthError(err), "error");
    }
    console.error(err);
  }
  // Same message whether or not the email exists, so strangers
  // can't use this box to find out who has an account.
  showMessage(resetMessage, "If an account exists for that email, a reset link has been sent. Check your inbox and spam folder.", "success");
});

setupSocialButtons((text, type) => showMessage(formMessage, text, type)); // Google and Apple buttons

onAuthStateChanged(auth, (user) => {
  if (user && !window.jixSocialBusy) window.location.replace("dashboard.html");
});
