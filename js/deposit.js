// ==========================================================
// deposit.js - the Add Money pop-up (SIMULATED deposit).
// It asks the bank logic (server.js) to add the money and shows
// "added" only AFTER that succeeds. The balance on screen then
// updates by itself, because Firestore announces the change.
// ==========================================================
import { callServer, friendlyFunctionError } from "./server.js";

const modal = document.getElementById("addMoneyModal");
const amountInput = document.getElementById("depositAmount");
const errorBox = document.getElementById("depositError");
const confirmBtn = document.getElementById("confirmDeposit");

let busy = false;          // blocks double-clicks
let requestId = null;      // a unique ticket number for ONE deposit attempt

const newId = () => crypto.randomUUID();

function showError(text) {
  errorBox.textContent = text;
  errorBox.className = "form-message error";
}

function openModal() {
  amountInput.value = "";
  errorBox.className = "form-message";
  requestId = newId();
  modal.classList.remove("hidden");
  amountInput.focus();
}

function closeModal() {
  if (busy) return;
  modal.classList.add("hidden");
}

document.getElementById("addMoneyBtn").addEventListener("click", openModal);
document.getElementById("closeModal").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

// A different amount = a different deposit = a new ticket number.
amountInput.addEventListener("input", () => { requestId = newId(); });

confirmBtn.addEventListener("click", async () => {
  if (busy) return;

  const raw = amountInput.value.trim();
  const amount = Number(raw);
  if (!raw || Number.isNaN(amount)) return showError("Please enter an amount.");
  if (amount < 100) return showError("Minimum demo deposit is ₦100.");
  if (amount > 1000000) return showError("Maximum demo deposit is ₦1,000,000.");
  if (Math.round(amount * 100) / 100 !== amount) return showError("Use at most 2 decimal places.");

  busy = true;
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Processing…";
  errorBox.className = "form-message";

  try {
    const result = await callServer("addMoney", { amount, requestId });

    busy = false;
    closeModal();
    showToast(
      result.duplicate
        ? "That deposit was already processed."
        : `${formatNaira(amount)} added (simulated)`
    );
    // We do NOT touch the balance here. Firestore pushes the new
    // balance to the page by itself (the live listener in guard.js).
  } catch (err) {
    showError(friendlyFunctionError(err));
  } finally {
    busy = false;
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Add";
  }
});
