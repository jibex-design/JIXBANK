// server.js - one place every page uses to ask the "bank" to do something.
// Simple mode (default): the money logic runs in the browser (js/local-bank.js).
// Secure mode: it calls Cloud Functions instead (see firebase-config.js).
import { functions, USE_CLOUD_FUNCTIONS } from "./firebase-config.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { localBank } from "./local-bank.js";

// a unique "ticket number" for ONE attempt (prevents duplicates)
export const newRequestId = () => crypto.randomUUID();

// Runs a bank action and only returns if it really succeeded
export async function callServer(name, data) {
  if (!USE_CLOUD_FUNCTIONS) {
    const action = localBank[name];
    if (!action) throw new Error("Unknown action: " + name);
    const result = await action(data || {});
    return { ok: true, ...result };
  }

  const response = await httpsCallable(functions, name)(data);
  if (!response.data || response.data.ok !== true) throw new Error("Unexpected server response");
  return response.data;
}

// Turns an error into a message that is safe to show
export function friendlyFunctionError(err) {
  const showable = ["functions/invalid-argument", "functions/failed-precondition"];
  if (showable.includes(err.code)) return err.message;
  if (err.code === "functions/unauthenticated") return "Your session expired. Please log in again.";
  if (err.code === "functions/not-found") return "The server function wasn't found. Is the emulator running?";
  if (err.code === "permission-denied") return "The database refused this. Publish the rules from firestore.rules in the Firebase console (see README).";
  if (err.code === "unavailable") return "Can't reach Firebase. Check your internet connection.";
  console.error(err);
  return "Something went wrong. Check your connection and try again.";
}

export function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `form-message ${type}`;
}

// Calls back now (if we already know the account) and on every change
export function watchBalance(callback) {
  if (window.jixAccount) callback(window.jixAccount);
  window.addEventListener("jix:account", (e) => callback(e.detail));
}
