import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { callServer, friendlyFunctionError, newRequestId, showMsg, watchBalance } from "./server.js";
import { escapeHTML } from "./tx-shared.js";

const $ = (id) => document.getElementById(id);

let balance = null;
let goals = [];            // [{ id, goalName, targetAmount, savedAmount, ... }]
let stopListening = null;

// ---------- main balance ----------
watchBalance((account) => {
  balance = account ? Number(account.balance) || 0 : null;
  $("mainBalance").textContent = balance === null ? "-" : formatNaira(balance);
});

// ---------- live list of goals ----------
onAuthStateChanged(auth, (user) => {
  if (stopListening) stopListening();
  if (!user) return;

  stopListening = onSnapshot(
    query(collection(db, "savings"), where("userId", "==", user.uid)),
    (snap) => {
      const millis = (g) => (g.createdAt && g.createdAt.toMillis ? g.createdAt.toMillis() : 0);
      goals = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b) - millis(a));
      renderGoals();
    },
    (error) => {
      console.error("Savings error:", error);
      showToast("Could not load your savings. Please refresh.");
    }
  );
});

function renderGoals() {
  const total = goals.reduce((sum, g) => sum + (Number(g.savedAmount) || 0), 0);
  $("totalSaved").textContent = formatNaira(total);
  $("goalEmpty").classList.toggle("hidden", goals.length > 0);

  $("goalGrid").innerHTML = goals
    .map((g) => {
      const saved = Number(g.savedAmount) || 0;
      const target = Number(g.targetAmount) || 1;
      const percent = Math.min(100, Math.round((saved / target) * 100));
      return `
        <div class="card goal-card">
          <div class="goal-top">
            <h4>${escapeHTML(g.goalName)}</h4>
            <span class="sim-pill">Simulated</span>
          </div>
          <p class="goal-amounts"><strong>${formatNaira(saved)}</strong> of ${formatNaira(target)}</p>
          <div class="progress"><div class="progress-bar" style="width:${percent}%"></div></div>
          <small>${percent}% reached</small>
          <div class="goal-actions">
            <button type="button" class="btn-primary btn-small" data-action="add" data-id="${escapeHTML(g.id)}">Add money</button>
            <button type="button" class="btn-outline" data-action="withdraw" data-id="${escapeHTML(g.id)}">Withdraw</button>
          </div>
        </div>`;
    })
    .join("");
}

// ---------- create a goal ----------
const goalForm = $("goalForm");
let goalBusy = false;
let goalRequestId = newRequestId();
goalForm.addEventListener("input", () => { goalRequestId = newRequestId(); });

goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (goalBusy) return;

  const goalName = $("goalName").value.trim();
  const raw = $("goalTarget").value.trim();
  const targetAmount = Number(raw);
  const msg = $("goalMsg");

  if (goalName.length < 2) return showMsg(msg, "Give your goal a name (at least 2 characters).", "error");
  if (!raw || Number.isNaN(targetAmount)) return showMsg(msg, "Please enter a target amount.", "error");
  if (Math.round(targetAmount * 100) / 100 !== targetAmount) return showMsg(msg, "Use at most 2 decimal places.", "error");
  if (targetAmount < 1000) return showMsg(msg, "Minimum target is ₦1,000.", "error");

  goalBusy = true;
  $("goalBtn").disabled = true;
  msg.className = "form-message";

  try {
    await callServer("createSavingsGoal", { goalName, targetAmount, requestId: goalRequestId });
    goalForm.reset();
    goalRequestId = newRequestId();
    showToast("Savings goal created (simulated)");
  } catch (err) {
    showMsg(msg, friendlyFunctionError(err), "error");
  } finally {
    goalBusy = false;
    $("goalBtn").disabled = false;
  }
});

// ---------- add to / withdraw from a goal ----------
const modal = $("amountModal");
let action = null;       // "add" or "withdraw"
let goalId = null;
let amountRequestId = null;
let amountBusy = false;

$("goalGrid").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-action]");
  if (!button) return;
  const goal = goals.find((g) => g.id === button.dataset.id);
  if (!goal) return;

  action = button.dataset.action;
  goalId = goal.id;
  amountRequestId = newRequestId();

  $("amountTitle").textContent = action === "add" ? "Add money to goal" : "Withdraw from goal";
  $("amountHelp").textContent = action === "add"
    ? `Moves money from your main balance into "${goal.goalName}" (simulated).`
    : `Moves money from "${goal.goalName}" back to your main balance (simulated).`;
  $("amountInput").value = "";
  $("amountError").className = "form-message";
  modal.classList.remove("hidden");
  $("amountInput").focus();
});

function closeModal() { if (!amountBusy) modal.classList.add("hidden"); }
$("amountCancel").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
$("amountInput").addEventListener("input", () => { amountRequestId = newRequestId(); });

$("amountOk").addEventListener("click", async () => {
  if (amountBusy) return;
  const error = $("amountError");
  const raw = $("amountInput").value.trim();
  const amount = Number(raw);

  if (!raw || Number.isNaN(amount)) return showMsg(error, "Please enter an amount.", "error");
  if (Math.round(amount * 100) / 100 !== amount) return showMsg(error, "Use at most 2 decimal places.", "error");
  if (amount < 100) return showMsg(error, "Minimum amount is ₦100.", "error");
  if (action === "add" && balance !== null && amount > balance) return showMsg(error, "Insufficient funds in your main balance.", "error");

  amountBusy = true;
  $("amountOk").disabled = true;
  $("amountOk").textContent = "Processing…";
  error.className = "form-message";

  try {
    await callServer(action === "add" ? "addToSavings" : "withdrawFromSavings", {
      savingId: goalId, amount, requestId: amountRequestId
    });
    amountBusy = false;
    closeModal();
    showToast(action === "add" ? `${formatNaira(amount)} saved (simulated)` : `${formatNaira(amount)} moved back (simulated)`);
  } catch (err) {
    showMsg(error, friendlyFunctionError(err), "error");
  } finally {
    amountBusy = false;
    $("amountOk").disabled = false;
    $("amountOk").textContent = "Confirm";
  }
});
