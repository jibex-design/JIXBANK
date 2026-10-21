// ==========================================================
// ui.js - runs on EVERY page that has the sidebar + top bar
// ==========================================================

// ---------- 1. Data that describes the sidebar ----------
// Each link is: [page file, icon name, label]
const MENU = [
  { title: "Main Menu", links: [
    ["dashboard.html", "home", "Dashboard"],
    ["transactions.html", "receipt", "Transactions"]
  ]},
  { title: "Money", links: [
    ["transfer.html", "arrow-up", "Transfer"],
    ["withdraw.html", "arrow-down", "Withdraw"],
    ["savings.html", "piggy-bank", "Savings"],
    ["atm-card.html", "credit-card", "ATM Card"]
  ]},
  { title: "Services", links: [
    ["airtime.html", "phone", "Airtime"],
    ["data.html", "wifi", "Data"],
    ["betting.html", "trophy", "Betting"],
    ["electricity.html", "lightbulb", "Electricity"],
    ["cable-tv.html", "tv", "Cable TV"]
  ]},
  { title: "Account", links: [
    ["profile.html", "user", "Profile"]
  ]}
];

// The page we are on, e.g. "dashboard.html"
const currentPage = location.pathname.split("/").pop() || "index.html";

// After logging out, go here
const AFTER_LOGOUT_PAGE = "login.html";

// ---------- 2. Build the sidebar ----------
function buildSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  let html = `
    <a href="dashboard.html" class="brand">
      <img src="assets/images/logo.png" alt="JIXBANK logo" class="brand-logo" />
      <span class="brand-text">JIXBANK</span>
    </a>
    <nav class="menu">`;

  MENU.forEach((group) => {
    html += `<p class="menu-title">${group.title}</p>`;
    group.links.forEach(([href, icon, label]) => {
      const active = href === currentPage ? "active" : "";
      html += `<a href="${href}" class="menu-link ${active}"><i data-lucide="${icon}"></i> ${label}</a>`;
    });
  });

  html += `
      <button type="button" class="menu-link logout" id="logoutBtn">
        <i data-lucide="log-out"></i> Logout
      </button>
    </nav>`;

  sidebar.innerHTML = html;
}

// ---------- 3. Build the top bar ----------
const AVATAR_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>" +
  "<rect width='40' height='40' fill='#cfeaeb'/>" +
  "<circle cx='20' cy='15' r='7' fill='#158F94'/>" +
  "<path d='M6 40c2-11 26-11 28 0z' fill='#158F94'/></svg>";
const FALLBACK_AVATAR = "data:image/svg+xml," + encodeURIComponent(AVATAR_SVG);

function buildTopbar() {
  const topbar = document.getElementById("topbar");
  if (!topbar) return;

  topbar.innerHTML = `
    <button class="icon-btn menu-toggle" id="menuToggle" aria-label="Open menu">
      <i data-lucide="menu"></i>
    </button>

    <h2 class="welcome">Welcome 👋, <strong id="firstName">Guest</strong></h2>

    <div class="topbar-actions">
      <button class="icon-btn" id="themeBtn" aria-label="Switch light or dark mode" title="Switch light / dark mode"></button>
      <button class="icon-btn" id="helpBtn" aria-label="Support"><i data-lucide="headphones"></i></button>

      <div class="notify-wrap">
        <button class="icon-btn" id="notifyBtn" aria-label="Notifications">
          <i data-lucide="bell"></i><span class="notify-dot hidden" id="notifyDot"></span>
        </button>
        <div class="notify-panel" id="notifyPanel">
          <div class="notify-head">Notifications</div>
          <div id="notifyList"><div class="notify-item"><span>Loading…</span></div></div>
        </div>
      </div>

      <a href="profile.html" class="avatar-link" aria-label="Profile">
        <img src="${FALLBACK_AVATAR}" alt="Profile picture" id="topAvatar" class="avatar" />
      </a>
    </div>`;
}

// Stops text from being treated as HTML
function escapeText(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

// Draws the notification list (guard.js announces new data)
function renderNotifications(items) {
  const listEl = document.getElementById("notifyList");
  const dot = document.getElementById("notifyDot");
  if (!listEl) return;

  if (!items.length) {
    listEl.innerHTML = `<div class="notify-item"><span>No notifications yet.</span></div>`;
    dot.classList.add("hidden");
    return;
  }
  listEl.innerHTML = items
    .map((n) => `<div class="notify-item"><strong>${escapeText(n.title)}</strong><span>${escapeText(n.message)}</span></div>`)
    .join("");
  dot.classList.toggle("hidden", !items.some((n) => !n.read));
}

window.addEventListener("jix:notifications", (e) => renderNotifications(e.detail));

// ---------- 4. Small helper functions other files can use ----------
function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast.hideTimer);
  toast.hideTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function setWelcomeName(fullName) {
  const el = document.getElementById("firstName");
  if (el && fullName) el.textContent = fullName.trim().split(" ")[0]; // first word only
}

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);
}

// ---------- 5. Mobile menu ----------
function setupMobileMenu() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("menuToggle");
  if (!sidebar || !toggle) return;

  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  function openMenu() { sidebar.classList.add("open"); overlay.classList.add("show"); }
  function closeMenu() { sidebar.classList.remove("open"); overlay.classList.remove("show"); }

  toggle.addEventListener("click", openMenu);
  overlay.addEventListener("click", closeMenu);
}

// ---------- 6. Notifications + help ----------
function setupTopbarButtons() {
  const notifyBtn = document.getElementById("notifyBtn");
  const panel = document.getElementById("notifyPanel");
  const helpBtn = document.getElementById("helpBtn");
  if (!notifyBtn) return;

  notifyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = !panel.classList.contains("show");
    panel.classList.toggle("show");
    if (opening && window.jixMarkNotificationsRead) window.jixMarkNotificationsRead();
  });

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target)) panel.classList.remove("show");
  });

  helpBtn.addEventListener("click", () => showToast("Support (demo): support@jixbank.example"));
}

// ---------- 7. Logout with confirmation ----------
function setupLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", () => {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-box">
        <h3>Log out?</h3>
        <p>Are you sure you want to log out of JIXBANK?</p>
        <div class="modal-actions">
          <button type="button" class="btn-outline" id="cancelLogout">Cancel</button>
          <button type="button" class="btn-primary" id="okLogout">Log out</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById("cancelLogout").addEventListener("click", () => modal.remove());
    document.getElementById("okLogout").addEventListener("click", async () => {
      try {
        if (window.jixLogout) await window.jixLogout(); // Firebase signOut (from guard.js)
      } finally {
        window.location.href = AFTER_LOGOUT_PAGE;
      }
    });
  });
}

// ---------- 8. Light / dark mode ----------
function getSavedTheme() {
  try { return localStorage.getItem("jixTheme") === "dark" ? "dark" : "light"; }
  catch (e) { return "light"; }
}

function applyTheme(theme) {
  // CSS reads this attribute: <html data-theme="dark">
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("jixTheme", theme); } catch (e) {}

  const btn = document.getElementById("themeBtn");
  if (btn) {
    btn.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`;
    btn.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    lucide.createIcons();
  }
}

function setupTheme() {
  applyTheme(getSavedTheme()); // remembered from last visit
  const btn = document.getElementById("themeBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyTheme(isDark ? "light" : "dark");
  });
}

// ---------- 9. Run everything ----------
buildSidebar();
buildTopbar();
setupMobileMenu();
setupTopbarButtons();
setupLogout();
setupTheme();
lucide.createIcons(); // draw the icons we just created
