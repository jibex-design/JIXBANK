// ==========================================================
// tx-shared.js - small helpers for showing transactions.
// Used by the dashboard AND the Transactions page.
// ==========================================================

export const TYPE_LABELS = {
  deposit: "Deposit",
  transfer: "Transfer",
  withdrawal: "Withdrawal",
  airtime: "Airtime",
  data: "Data",
  savings: "Savings"
};

const TYPE_ICONS = {
  deposit: "arrow-down-left",
  withdrawal: "banknote",
  airtime: "phone",
  data: "wifi",
  savings: "piggy-bank"
};

// Stops text from being treated as HTML (security)
export function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

export function capitalise(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "";
}

// Firestore stores dates as Timestamp objects. This turns one into text.
export function formatTxDate(tx) {
  const date = tx.createdAt && tx.createdAt.toDate ? tx.createdAt.toDate() : null;
  if (!date) return "Just now";
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function iconFor(tx) {
  if (tx.type === "transfer") return tx.direction === "credit" ? "arrow-down-left" : "arrow-up-right";
  return TYPE_ICONS[tx.type] || "receipt";
}

// Builds the HTML for ONE transaction row
export function txRowHTML(id, tx, clickable) {
  const isCredit = tx.direction === "credit";
  const status = ["successful", "pending", "failed"].includes(tx.status) ? tx.status : "pending";
  const amount = formatNaira(Number(tx.amount) || 0); // formatNaira comes from ui.js

  return `
    <li class="tx-item ${clickable ? "clickable" : ""}" data-id="${escapeHTML(id)}"
        ${clickable ? 'tabindex="0" role="button"' : ""}>
      <span class="tx-icon"><i data-lucide="${iconFor(tx)}"></i></span>
      <div class="tx-info">
        <div class="tx-title">${escapeHTML(tx.description || TYPE_LABELS[tx.type] || "Transaction")}</div>
        <div class="tx-date">${formatTxDate(tx)}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${isCredit ? "credit" : ""}">${isCredit ? "+" : "-"}${amount}</div>
        <span class="status ${status}">${capitalise(status)}</span>
      </div>
    </li>`;
}
