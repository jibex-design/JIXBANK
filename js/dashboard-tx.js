// Shows the 5 newest transactions of the logged-in user, live.
// (We load the user's transactions and sort them here, so no
// database index is needed.)
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { txRowHTML } from "./tx-shared.js";

const txList = document.getElementById("txList");
let stopListening = null;

// newest first; a transaction still being saved has no time yet, so it counts as "now"
const millis = (tx) => (tx.createdAt && tx.createdAt.toMillis ? tx.createdAt.toMillis() : Date.now());

onAuthStateChanged(auth, (user) => {
  if (stopListening) stopListening();
  if (!user) return;

  txList.innerHTML = `<li class="tx-empty">Loading transactions…</li>`;

  // "Give me MY transactions"
  const q = query(collection(db, "transactions"), where("userId", "==", user.uid));

  stopListening = onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        txList.innerHTML = `<li class="tx-empty">No transactions yet. Your activity will show here.</li>`;
        return;
      }
      const newest = snap.docs
        .map((d) => ({ id: d.id, data: d.data() }))
        .sort((a, b) => millis(b.data) - millis(a.data))
        .slice(0, 5);

      txList.innerHTML = newest.map((t) => txRowHTML(t.id, t.data, false)).join("");
      lucide.createIcons();
    },
    (error) => {
      console.error("Transactions error:", error);
      const hint = error.code === "permission-denied"
        ? "Publish the Firestore rules (see README)."
        : "Please refresh the page.";
      txList.innerHTML = `<li class="tx-empty">Couldn't load transactions. ${hint}</li>`;
    }
  );
});
