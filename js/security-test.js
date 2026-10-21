// TEMPORARY (Step 11): tries to cheat the database. Every attempt should be BLOCKED.
// To use it, add  <script type="module" src="js/security-test.js"></script>  to dashboard.html.
// Remove the script tag again after the test.
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

async function expectDenied(label, action) {
  try {
    await action();
    console.log("❌ FAIL (it was ALLOWED):", label);
  } catch (e) {
    console.log(e.code === "permission-denied" ? "✅ PASS (blocked):" : "⚠️ other error:", label, e.code);
  }
}
async function expectAllowed(label, action) {
  try {
    await action();
    console.log("✅ PASS (allowed, as it should be):", label);
  } catch (e) {
    console.log("❌ FAIL (should be allowed):", label, e.code);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const uid = user.uid;
  console.log("🔐 Running security tests as", uid);

  await expectDenied("edit my own balance", () => updateDoc(doc(db, "accounts", uid), { balance: 999999999 }));
  await expectDenied("create a fake successful transaction", () =>
    addDoc(collection(db, "transactions"), { userId: uid, direction: "credit", type: "deposit", amount: 1000000, status: "successful", description: "fake" }));
  await expectDenied("edit someone else's profile", () => updateDoc(doc(db, "users", "someone-else"), { fullName: "Hacked" }));
  await expectDenied("read someone else's account", () => getDoc(doc(db, "accounts", "someone-else")));
  await expectDenied("add a role field to my profile", () => updateDoc(doc(db, "users", uid), { role: "admin" }));
  await expectDenied("create a savings goal directly", () =>
    setDoc(doc(db, "savings", "fake_goal_12345"), { userId: uid, goalName: "fake", targetAmount: 1, savedAmount: 999999 }));
  await expectDenied("list ALL transactions", () => getDocs(collection(db, "transactions")));
  await expectDenied("read account-number records", () => getDoc(doc(db, "accountNumbers", "1234567890")));
  await expectDenied("delete my account record", () => deleteDoc(doc(db, "accounts", uid)));

  const snap = await getDoc(doc(db, "users", uid));
  const original = snap.data().fullName;
  await expectAllowed("change my own name", () => updateDoc(doc(db, "users", uid), { fullName: original }));
  await expectAllowed("read my own account", () => getDoc(doc(db, "accounts", uid)));

  console.log("🏁 Security tests finished.");
});
