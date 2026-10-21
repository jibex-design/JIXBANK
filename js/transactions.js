import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { txRowHTML, escapeHTML, capitalise, formatTxDate, TYPE_LABELS } from "./tx-shared.js";

const PAGE_SIZE = 10; // how many to show at a time

const list = document.getElementById("txList");
const typeFilter = document.getElementById("typeFilter");
const statusFilter = document.getElementById("statusFilter");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const countEl = document.getElementById("txCount");

let all = [];                  // every transaction of this user, newest first
let shown = PAGE_SIZE;         // how many rows are visible right now
let stopListening = null;

const millis = (tx) => (tx.createdAt && tx.createdAt.toMillis ? tx.createdAt.toMillis() : Date.now());

// ---------- live data ----------
onAuthStateChanged(auth, (user) => {
  if (stopListening) stopListening();
  if (!user) return;

  stopListening = onSnapshot(
    query(collection(db, "transactions"), where("userId", "==", user.uid)), // ONLY my transactions
    (snap) => {
      all = snap.docs
        .map((d) => ({ id: d.id, data: d.data() }))
        .sort((a, b) => millis(b.data) - millis(a.data));
      render();
    },
    (error) => {
      console.error("Transactions error:", error);
      list.innerHTML = `<li class="tx-empty">Could not load transactions. ${
        error.code === "permission-denied" ? "Publish the Firestore rules (see README)." : "Please refresh."
      }</li>`;
    }
  );
});

// ---------- draw the list (filters + Load more) ----------
function render() {
  const filtered = all.filter(({ data }) =>
    (!typeFilter.value || data.type === typeFilter.value) &&
    (!statusFilter.value || data.status === statusFilter.value)
  );

  if (filtered.length === 0) {
    const filtering = typeFilter.value || statusFilter.value;
    list.innerHTML = `<li class="tx-empty">${filtering ? "No transactions match these filters." : "No transactions yet. Your activity will show here."}</li>`;
    countEl.textContent = "";
    loadMoreBtn.classList.add("hidden");
    return;
  }

  const visible = filtered.slice(0, shown);
  list.innerHTML = visible.map((t) => txRowHTML(t.id, t.data, true)).join("");
  countEl.textContent = `Showing ${visible.length} of ${filtered.length}`;
  loadMoreBtn.classList.toggle("hidden", filtered.length <= shown);
  lucide.createIcons();
}

typeFilter.addEventListener("change", () => { shown = PAGE_SIZE; render(); });
statusFilter.addEventListener("change", () => { shown = PAGE_SIZE; render(); });
loadMoreBtn.addEventListener("click", () => { shown += PAGE_SIZE; render(); });

// ---------- details pop-up ----------
function openDetails(id) {
  const found = all.find((t) => t.id === id);
  if (!found) return;
  const tx = found.data;

  const isCredit = tx.direction === "credit";
  const rows = [
    ["Description", tx.description || "-"],
    ["Amount", `${isCredit ? "+" : "-"}${formatNaira(Number(tx.amount) || 0)}`],
    ["Type", TYPE_LABELS[tx.type] || capitalise(tx.type)],
    ["Direction", isCredit ? "Money in" : "Money out"],
    ["Status", capitalise(tx.status)],
    ["Date", formatTxDate(tx)],
    ["Reference", id]
  ];
  if (tx.counterpartyName) rows.splice(4, 0, [isCredit ? "From" : "To", tx.counterpartyName]);

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-box">
      <h3>Transaction details</h3>
      <dl class="detail-list">
        ${rows.map(([k, v]) => `<div class="detail-row"><dt>${k}</dt><dd>${escapeHTML(v)}</dd></div>`).join("")}
      </dl>
      <div class="modal-actions">
        <button type="button" class="btn-primary" id="closeDetails">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => { modal.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.getElementById("closeDetails").addEventListener("click", close);
}

list.addEventListener("click", (e) => {
  const row = e.target.closest(".tx-item");
  if (row) openDetails(row.dataset.id);
});
list.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const row = e.target.closest(".tx-item");
  if (row) openDetails(row.dataset.id);
});
