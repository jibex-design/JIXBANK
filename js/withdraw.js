import { callServer, friendlyFunctionError, newRequestId, showMsg, watchBalance } from "./server.js";

const $ = (id) => document.getElementById(id);
const form = $("withdrawForm");
const msg = $("msg");

let balance = null;
let busy = false;
let requestId = newRequestId();

watchBalance((account) => {
  balance = account ? Number(account.balance) || 0 : null;
  $("balanceHint").textContent = balance === null ? "" : `Available: ${formatNaira(balance)}`;
});

// changing anything = a different request = a new ticket number
form.addEventListener("input", () => { requestId = newRequestId(); });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;

  const bankName = $("bank").value;
  const accountNumber = $("acctNo").value.trim();
  const accountName = $("acctName").value.trim();
  const raw = $("amount").value.trim();
  const amount = Number(raw);

  if (!bankName) return showMsg(msg, "Please choose a bank.", "error");
  if (!/^\d{10}$/.test(accountNumber)) return showMsg(msg, "Account number must be exactly 10 digits.", "error");
  if (accountName.length < 2 || !/^[A-Za-z][A-Za-z\s'.-]*$/.test(accountName)) return showMsg(msg, "Enter the account name (letters only).", "error");
  if (!raw || Number.isNaN(amount)) return showMsg(msg, "Please enter an amount.", "error");
  if (Math.round(amount * 100) / 100 !== amount) return showMsg(msg, "Use at most 2 decimal places.", "error");
  if (amount < 500) return showMsg(msg, "Minimum withdrawal is ₦500.", "error");
  if (amount > 500000) return showMsg(msg, "Maximum withdrawal is ₦500,000.", "error");
  if (balance !== null && amount > balance) return showMsg(msg, "Insufficient funds.", "error");

  if (!confirm(`Request a SIMULATED withdrawal of ${formatNaira(amount)} to ${bankName}?`)) return;

  busy = true;
  $("submitBtn").disabled = true;
  $("submitBtn").textContent = "Processing…";
  msg.className = "form-message";

  try {
    const result = await callServer("requestWithdrawal", { amount, bankName, accountNumber, accountName, requestId });
    showMsg(msg, result.duplicate
      ? "That request was already submitted."
      : "Withdrawal request submitted (simulated). Status: Pending.", "success");
    form.reset();
    requestId = newRequestId();
  } catch (err) {
    showMsg(msg, friendlyFunctionError(err), "error");
  } finally {
    busy = false;
    $("submitBtn").disabled = false;
    $("submitBtn").textContent = "Request withdrawal";
  }
});
