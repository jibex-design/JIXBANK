// ==========================================================
// dashboard.js - shows REAL data from Firestore.
// guard.js listens to the database and announces the data;
// this file only displays it. It never changes the balance.
// ==========================================================

let balance = null; // null = still loading
let balanceVisible = localStorage.getItem("balanceVisible") !== "false";

const balanceEl = document.getElementById("balanceAmount");
const accountEl = document.getElementById("accountNumber");
const toggleBtn = document.getElementById("toggleBalance");

// ---------- Show / hide balance ----------
function renderBalance() {
  if (balance === null) {
    balanceEl.textContent = "₦000,000.00";
    balanceEl.classList.add("loading");
  } else {
    balanceEl.classList.remove("loading");
    balanceEl.textContent = balanceVisible ? formatNaira(balance) : "₦ ••••••";
  }

  toggleBtn.innerHTML = `<i data-lucide="${balanceVisible ? "eye" : "eye-off"}"></i>`;
  lucide.createIcons();
}

toggleBtn.addEventListener("click", () => {
  balanceVisible = !balanceVisible;
  localStorage.setItem("balanceVisible", balanceVisible);
  renderBalance();
});

// ---------- New account data arrived from Firestore ----------
window.addEventListener("jix:account", (event) => {
  const account = event.detail;

  if (!account) {
    balanceEl.classList.remove("loading");
    balanceEl.textContent = "Unavailable";
    accountEl.textContent = "Not found";
    showToast("No account record found for this user.");
    return;
  }

  balance = Number(account.balance) || 0;
  accountEl.textContent = account.accountNumber || "----------";
  renderBalance();
});

window.addEventListener("jix:account-error", () => {
  balanceEl.classList.remove("loading");
  balanceEl.textContent = "Unavailable";
  accountEl.textContent = "Unavailable";
});

// ---------- Placeholder buttons ----------
document.getElementById("referBtn").addEventListener("click", () => showToast("Refer and Earn is a demo placeholder."));
document.getElementById("claimBtn").addEventListener("click", () => showToast("Reward is a demo placeholder."));

renderBalance();
