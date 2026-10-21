import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { validateRegisterForm } from "./validation.js";
import { friendlyAuthError } from "./auth-errors.js";
import { callServer } from "./server.js";
import { setupSocialButtons } from "./social-auth.js";

const form = document.getElementById("registerForm");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");

let isRegistering = false; // stops the "already logged in" redirect mid-registration

function showMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const terms = document.getElementById("terms").checked;

  const error = validateRegisterForm({ name, email, password, terms });
  if (error) return showMessage(error, "error");

  submitBtn.disabled = true;
  isRegistering = true;
  showMessage("Creating your account…", "success");

  try {
    // 1. create the login (Firebase stores the password safely)
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });

    // 2. ask the SERVER to create the profile + bank account
    try {
      await callServer("setupAccount", { fullName: name });
    } catch (setupError) {
      // Not fatal: the dashboard (guard.js) retries automatically.
      console.error("Account setup will be retried:", setupError);
    }

    showMessage("Account created! Taking you to your dashboard…", "success");
    setTimeout(() => (window.location.href = "dashboard.html"), 800);
  } catch (err) {
    isRegistering = false;
    submitBtn.disabled = false;
    showMessage(friendlyAuthError(err), "error");
  }
});

setupSocialButtons(showMessage); // Google and Apple buttons

onAuthStateChanged(auth, (user) => {
  if (user && !isRegistering && !window.jixSocialBusy) window.location.replace("dashboard.html");
});
