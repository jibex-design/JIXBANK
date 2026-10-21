// ==========================================================
// social-auth.js - "Log in with Google / Apple" for BOTH the
// sign-up page and the login page.
// ==========================================================
import { auth } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { friendlyAuthError } from "./auth-errors.js";
import { callServer } from "./server.js";

const buttons = () => ["googleBtn", "appleBtn"].map((id) => document.getElementById(id));

async function signInWith(provider, showMessage) {
  window.jixSocialBusy = true;          // stops the "already logged in" redirect for a moment
  buttons().forEach((b) => (b.disabled = true));

  try {
    // opens the Google / Apple pop-up window
    const result = await signInWithPopup(auth, provider);
    showMessage("Signed in! Setting up your account…", "success");

    // New user? Ask the SERVER to create the profile + bank account.
    // (If they already have one, the server leaves it alone.)
    try {
      await callServer("setupAccount", { fullName: result.user.displayName || "" });
    } catch (setupError) {
      console.error("Account setup will be retried:", setupError); // guard.js retries on the dashboard
    }

    window.location.href = "dashboard.html";
  } catch (err) {
    window.jixSocialBusy = false;
    buttons().forEach((b) => (b.disabled = false));

    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
      return showMessage("Sign-in was cancelled.", "error");
    }
    showMessage(friendlyAuthError(err), "error");
  }
}

// showMessage(text, "error" | "success") is given by the page that calls this
export function setupSocialButtons(showMessage) {
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: "select_account" }); // always let the user pick an account

  const apple = new OAuthProvider("apple.com");
  apple.addScope("email");
  apple.addScope("name");

  // NOTE: signInWithPopup must run straight from the click (no "await" before it),
  // or the browser may block the pop-up.
  document.getElementById("googleBtn").addEventListener("click", () => signInWith(google, showMessage));
  document.getElementById("appleBtn").addEventListener("click", () => signInWith(apple, showMessage));
}
