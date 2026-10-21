import { callServer, friendlyFunctionError, newRequestId, showMsg, watchBalance } from "./server.js";

const $ = (id) => document.getElementById(id);
const form = $("airtimeForm");
const msg = $("msg");

let balance = null;
let busy = false;
let requestId = newRequestId();

watchBalance((account) => {
  balance = account ? Number(account.balance) || 0 : null;
  $("balanceHint").textContent = balance === null ? "" : `Available: ${formatNaira(balance)}`;
});

form.addEventListener("input", () => { requestId = newRequestId(); });

// quick-amount buttons
$("chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  $("amount").value = chip.dataset.amount;
  requestId = newRequestId(); // programmatic changes don't fire "input"
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;

  const network = $("network").value;
  const phone = $("phone").value.trim();
  const raw = $("amount").value.trim();
  const amount = Number(raw);

  if (!network) return showMsg(msg, "Please choose a network.", "error");
  if (!/^0[789][01]\d{8}$/.test(phone)) return showMsg(msg, "Enter a valid 11-digit Nigerian phone number.", "error");
  if (!raw || Number.isNaN(amount)) return showMsg(msg, "Please enter an amount.", "error");
  if (Math.round(amount * 100) / 100 !== amount) return showMsg(msg, "Use at most 2 decimal places.", "error");
  if (amount < 50) return showMsg(msg, "Minimum airtime is ₦50.", "error");
  if (amount > 50000) return showMsg(msg, "Maximum airtime is ₦50,000.", "error");
  if (balance !== null && amount > balance) return showMsg(msg, "Insufficient funds.", "error");

  busy = true;
  $("submitBtn").disabled = true;
  $("submitBtn").textContent = "Processing…";
  msg.className = "form-message";

  try {
    const result = await callServer("buyAirtime", { network, phone, amount, requestId });
    showMsg(msg, result.duplicate
      ? "That purchase was already processed."
      : `${formatNaira(amount)} ${network} airtime purchase recorded (simulated).`, "success");
    form.reset();
    requestId = newRequestId();
  } catch (err) {
    showMsg(msg, friendlyFunctionError(err), "error");
  } finally {
    busy = false;
    $("submitBtn").disabled = false;
    $("submitBtn").textContent = "Buy airtime";
  }
});
