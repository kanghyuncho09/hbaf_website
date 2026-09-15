function navigateTo(view, subtab) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const target = document.getElementById("view-" + view);
  if (target) target.classList.add("active");

  document.querySelectorAll(".site-nav a[data-view]").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === view);
  });

  const nav = document.getElementById("siteNav");
  if (nav) nav.classList.remove("open");

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "board" && subtab) {
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${subtab}"]`);
    if (tabBtn) tabBtn.click();
  }

  document.dispatchEvent(new CustomEvent("view:changed", { detail: { view } }));
}

function bindNavigation() {
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(el.dataset.view, el.dataset.subtab);
    });
  });
}

function bindNavToggle() {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => nav.classList.toggle("open"));
}

/* ---------- 관리자 로그인 (다른 스크립트에서도 isAdmin()/adminHeaders() 호출 가능) ---------- */
const ADMIN_TOKEN_KEY = "hbaf-admin-token";

function isAdmin() {
  try {
    return !!localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch (e) {
    return false;
  }
}

function adminHeaders() {
  try {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    return token ? { "X-Admin-Token": token } : {};
  } catch (e) {
    return {};
  }
}

function updateAdminToggleUI() {
  const el = document.getElementById("adminToggle");
  if (!el) return;
  if (isAdmin()) {
    el.textContent = "🔓 관리자 로그아웃";
    el.classList.add("is-admin");
  } else {
    el.textContent = "🔒 관리자";
    el.classList.remove("is-admin");
  }
}

async function handleAdminToggleClick(e) {
  e.preventDefault();
  if (isAdmin()) {
    if (!confirm("관리자 로그아웃 하시겠습니까?")) return;
    try {
      await fetch("/api/admin/logout", { method: "POST", headers: adminHeaders() });
    } catch (err) {}
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } else {
    const pw = prompt("관리자 비밀번호를 입력하세요.");
    if (!pw) return;
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "로그인에 실패했습니다.");
        return;
      }
      const data = await res.json();
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      alert("관리자로 로그인되었습니다.");
    } catch (err) {
      alert("로그인 중 오류가 발생했습니다.");
      return;
    }
  }
  updateAdminToggleUI();
  document.dispatchEvent(new Event("admin:changed"));
}

function bindAdminToggle() {
  const el = document.getElementById("adminToggle");
  if (!el) return;
  el.addEventListener("click", handleAdminToggleClick);
  updateAdminToggleUI();
}

async function loadCleanupPreview() {
  const el = document.getElementById("cleanupPreview");
  try {
    const res = await fetch("/api/cleaning-schedule");
    const data = await res.json();
    const rows = [...Object.entries(data.pantry || {}), ...Object.entries(data.care || {})];
    el.innerHTML = `
      <p class="cleanup-preview__week">( ${data.month} )월 담당 안내</p>
      <ul class="cleanup-preview__list">
        ${rows.map(([label, team]) => `<li><strong>${label}</strong><span>${team}</span></li>`).join("")}
      </ul>
    `;
  } catch (e) {
    el.innerHTML = `<p class="empty-state">청소분담표를 불러오지 못했습니다.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindNavToggle();
  bindAdminToggle();
  navigateTo("home");
  loadCleanupPreview();
  document.dispatchEvent(new Event("layout:ready"));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
