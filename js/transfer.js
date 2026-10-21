import { callServer, friendlyFunctionError, newRequestId, showMsg, watchBalance } from "./server.js";

const $ = (id) => document.getElementById(id);
const sections = [$("stepForm"), $("stepConfirm"), $("stepDone")];

let balance = null;     // current balance (display + quick check only)
let pending = null;     // the transfer waiting for confirmation
let requestId = null;   // ticket number for this one transfer
let busy = false;

// "To Bank" on the dashboard opens ?to=bank
if (new URLSearchParams(location.search).get("to") === "bank") $("bankNotice").classList.remove("hidden");

function show(section) {
  sections.forEach((s) => s.classList.add("hidden"));
  section.classList.remove("hidden");
}

watchBalance((account) => {
  balance = account ? Number(account.balance) || 0 : null;
  $("balanceHint").textContent = balance === null ? "" : `Available: ${formatNaira(balance)}`;
});

// ---------- Step 1: check the form, look up the recipient ----------
$("transferForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;

  const msg = $("formMsg");
  const accountNumber = $("accountNumber").value.trim();
  const raw = $("amount").value.trim();
  const amount = Number(raw);
  const description = $("description").value.trim();

  if (!/^\d{10}$/.test(accountNumber)) return showMsg(msg, "Account number must be exactly 10 digits.", "error");
  if (!raw || Number.isNaN(amount)) return showMsg(msg, "Please enter an amount.", "error");
  if (Math.round(amount * 100) / 100 !== amount) return showMsg(msg, "Use at most 2 decimal places.", "error");
  if (amount < 100) return showMsg(msg, "Minimum transfer is ₦100.", "error");
  if (amount > 500000) return showMsg(msg, "Maximum transfer is ₦500,000.", "error");
  if (balance !== null && amount > balance) return showMsg(msg, "Insufficient funds.", "error");

  busy = true;
  $("continueBtn").disabled = true;
  msg.className = "form-message";

  try {
    const result = await callServer("lookupAccount", { accountNumber });
    pending = { accountNumber, amount, description, name: result.fullName };

    // textContent (not innerHTML) so a name can never inject code
    $("cName").textContent = pending.name;
    $("cAcct").textContent = accountNumber;
    $("cAmount").textContent = formatNaira(amount);
    $("cDesc").textContent = description || "-";
    $("confirmMsg").className = "form-message";

    requestId = newRequestId(); // a fresh ticket for this transfer
    show($("stepConfirm"));
  } catch (err) {
    showMsg(msg, friendlyFunctionError(err), "error");
  } finally {
    busy = false;
    $("continueBtn").disabled = false;
  }
});

// ---------- Step 2: confirm -> the SERVER moves the money ----------
$("backBtn").addEventListener("click", () => { if (!busy) show($("stepForm")); });

$("confirmBtn").addEventListener("click", async () => {
  if (busy || !pending) return;
  busy = true;
  const btn = $("confirmBtn");
  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    const result = await callServer("transfer", {
      accountNumber: pending.accountNumber,
      amount: pending.amount,
      description: pending.description,
      requestId
    });

    // We only reach here AFTER the server confirmed.
    $("doneText").textContent = result.duplicate
      ? "This transfer had already been processed."
      : `${formatNaira(pending.amount)} was sent to ${pending.name} (simulated).`;
    $("dRef").textContent = result.transactionId;
    $("dBalance").textContent = formatNaira(result.balance);
    show($("stepDone"));
    pending = null;
  } catch (err) {
    showMsg($("confirmMsg"), friendlyFunctionError(err), "error");
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = "Confirm & send";
  }
});

$("newTransferBtn").addEventListener("click", () => {
  $("transferForm").reset();
  $("formMsg").className = "form-message";
  show($("stepForm"));
});
