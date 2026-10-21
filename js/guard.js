// guard.js - runs on every app page.
// 1. Logged out? Go to login.
// 2. Logged in? Show the page and keep the user's data up to date.
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, collection, query, where, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { callServer, friendlyFunctionError } from "./server.js";

let stopListening = [];
let ensuring = false;
let latestNotifications = [];
let repaired = false; // we only check the account-number record once per visit

// Tells the other scripts "new data arrived"
function announce(eventName, data) {
  if (eventName === "jix:account") window.jixAccount = data; // remember it for pages that load later
  window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
}

function setAvatar(photoURL) {
  const avatar = document.getElementById("topAvatar");
  if (avatar) avatar.src = photoURL || FALLBACK_AVATAR; // from ui.js
}

// If registration was interrupted, finish creating the account now
async function ensureAccount() {
  if (ensuring) return;
  ensuring = true;
  try {
    await callServer("setupAccount", {});
  } catch (err) {
    console.error("Account setup failed:", err);
    showToast(friendlyFunctionError(err));
    ensuring = false; // allow a retry on the next page load
  }
}

onAuthStateChanged(auth, (user) => {
  stopListening.forEach((stop) => stop());
  stopListening = [];
  window.jixAccount = null;
  repaired = false;
  ensuring = false;

  if (!user) {
    window.location.replace("login.html");
    return;
  }

  document.body.classList.add("auth-ready");
  setWelcomeName(user.displayName);

  // ----- live: profile (users/{uid}) -----
  stopListening.push(
    onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setWelcomeName(data.fullName);
        setAvatar(data.photoURL);
        announce("jix:user", data);
      },
      (error) => {
        console.error("Profile error:", error);
        showToast("Could not load your profile. Check your connection.");
      }
    )
  );

  // ----- live: account (accounts/{uid}) -----
  stopListening.push(
    onSnapshot(
      doc(db, "accounts", user.uid),
      (snap) => {
        if (!snap.exists()) {
          ensureAccount(); // not created yet? ask the server to finish it
          return;
        }
        announce("jix:account", snap.data());
        if (!repaired) { // older accounts may lack their account-number record: fix quietly
          repaired = true;
          callServer("setupAccount", {}).catch((err) => console.error("Account check failed:", err));
        }
      },
      (error) => {
        console.error("Account error:", error);
        announce("jix:account-error", error.message);
        showToast("Could not load your balance. Check your connection.");
      }
    )
  );

  // ----- live: notifications (newest 20) -----
  stopListening.push(
    onSnapshot(
      query(collection(db, "notifications"), where("userId", "==", user.uid)),
      (snap) => {
        const millis = (n) => (n.createdAt && n.createdAt.toMillis ? n.createdAt.toMillis() : 0);
        latestNotifications = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => millis(b) - millis(a))
          .slice(0, 20);
        announce("jix:notifications", latestNotifications);
      },
      (error) => console.error("Notifications error:", error)
    )
  );
});

// Marks all unread notifications as read (ui.js calls this when the bell opens)
window.jixMarkNotificationsRead = async () => {
  const unread = latestNotifications.filter((n) => !n.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
  try { await batch.commit(); } catch (err) { console.error(err); }
};

window.jixLogout = () => signOut(auth);
