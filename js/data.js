import { callServer, friendlyFunctionError, newRequestId, showMsg, watchBalance } from "./server.js";

const $ = (id) => document.getElementById(id);
const form = $("dataForm");
const msg = $("msg");

// For DISPLAY only. The server has its own price list and uses that one.
const PLANS = [
  { id: "d500m", label: "500MB - 7 days", price: 500 },
  { id: "d1g", label: "1.5GB - 30 days", price: 1000 },
  { id: "d3g", label: "3GB - 30 days", price: 1500 },
  { id: "d6g", label: "6GB - 30 days", price: 2500 },
  { id: "d12g", label: "12GB - 30 days", price: 4000 }
];

PLANS.forEach((p) => {
  const option = document.createElement("option");
  option.value = p.id;
  option.textContent = `${p.label} (${formatNaira(p.price)})`;
  $("plan").appendChild(option);
});

let balance = null;
let busy = false;
let requestId = newRequestId();

watchBalance((account) => {
  balance = account ? Number(account.balance) || 0 : null;
  $("balanceHint").textContent = balance === null ? "" : `Available: ${formatNaira(balance)}`;
});

form.addEventListener("input", () => { requestId = newRequestId(); });
form.addEventListener("change", () => { requestId = newRequestId(); });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;

  const network = $("network").value;
  const phone = $("phone").value.trim();
  const planId = $("plan").value;
  const plan = PLANS.find((p) => p.id === planId);

  if (!network) return showMsg(msg, "Please choose a network.", "error");
  if (!/^0[789][01]\d{8}$/.test(phone)) return showMsg(msg, "Enter a valid 11-digit Nigerian phone number.", "error");
  if (!plan) return showMsg(msg, "Please choose a data plan.", "error");
  if (balance !== null && plan.price > balance) return showMsg(msg, "Insufficient funds.", "error");

  busy = true;
  $("submitBtn").disabled = true;
  $("submitBtn").textContent = "Processing…";
  msg.className = "form-message";

  try {
    const result = await callServer("buyData", { network, phone, planId, requestId });
    showMsg(msg, result.duplicate
      ? "That purchase was already processed."
      : `${network} ${plan.label} purchase recorded (simulated).`, "success");
    form.reset();
    requestId = newRequestId();
  } catch (err) {
    showMsg(msg, friendlyFunctionError(err), "error");
  } finally {
    busy = false;
    $("submitBtn").disabled = false;
    $("submitBtn").textContent = "Buy data";
  }
});
