// 대한민국 공식 공휴일 (매년 새로 확인해서 업데이트 필요 — 설날/추석/부처님오신날처럼
// 음력 기준인 날짜는 해가 바뀌면 날짜 자체가 달라진다). 병원 기록 달력, 회의실/차량
// 예약이 이 전역 목록을 함께 쓴다. server.js에도 같은 목록이 있으니 같이 갱신할 것.
const HOLIDAYS = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "삼일절 대체공휴일",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "부처님오신날 대체공휴일",
  "2026-06-06": "현충일",
  "2026-07-17": "제헌절",
  "2026-08-15": "광복절",
  "2026-08-17": "광복절 대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-05": "개천절 대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
};

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
  const usersLink = document.getElementById("adminUsersNavLink");
  if (usersLink) usersLink.style.display = isAdmin() ? "" : "none";
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

// 청소분담표 주차는 월~금 기준이고, 수요일이 그 달에 속하는 주만 그 달의 주차로
// 센다(주가 달을 걸칠 때 한 주가 두 달에 중복되지 않게). 예: 2026년 9월은
// 1주차 8/31~9/4 … 5주차 9/28~10/2, 10월은 1주차가 10/5~10/9부터 시작한다.
// 수요일이 그 달에 있는 주가 4개뿐인 달은 5주차 줄을 보여주지 않는다.
function cleaningWeekRows(data) {
  const year = new Date().getFullYear();
  const firstWedDate = 1 + ((3 - new Date(year, data.month - 1, 1).getDay() + 7) % 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return [1, 2, 3, 4, 5]
    .map((n) => {
      const mon = new Date(year, data.month - 1, firstWedDate - 2 + (n - 1) * 7);
      const wed = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 2);
      const fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4);
      const nextMon = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7);
      const label = `${n}주차`;
      return {
        label,
        inMonth: wed.getMonth() === data.month - 1,
        team: (data.care && data.care[label]) || "",
        range: `${mon.getMonth() + 1}/${mon.getDate()}~${fri.getMonth() + 1}/${fri.getDate()}`,
        isCurrent: today >= mon && today < nextMon,
      };
    })
    .filter((w) => w.inMonth);
}

async function loadCleanupPreview() {
  const el = document.getElementById("cleanupPreview");
  try {
    const res = await fetch("/api/cleaning-schedule");
    const data = await res.json();
    const pantryRows = Object.entries(data.pantry || {})
      .map(([label, team]) => `<li><strong>${label}</strong><span>${team || "-"}</span></li>`)
      .join("");
    const weekRows = cleaningWeekRows(data)
      .map(
        (w) =>
          `<li class="${w.isCurrent ? "is-current" : ""}"><strong>${w.label}<small>${w.range}</small></strong><span>${w.team || "-"}</span></li>`
      )
      .join("");
    el.innerHTML = `
      <p class="cleanup-preview__week">( ${data.month} )월 담당 안내</p>
      <ul class="cleanup-preview__list">${pantryRows}${weekRows}</ul>
    `;
  } catch (e) {
    el.innerHTML = `<p class="empty-state">청소분담표를 불러오지 못했습니다.</p>`;
  }
}

// toISOString()은 UTC 기준이라 한국 시간 08:00~09:00에는 전날 날짜가 나온다.
// 예약 날짜 계산은 반드시 이 함수(브라우저 로컬 시간 기준)를 쓴다.
function localDateStr(d) {
  const t = d || new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function startApp() {
  const requested = new URLSearchParams(location.search).get("view");
  navigateTo(requested && document.getElementById("view-" + requested) ? requested : "home");
  loadCleanupPreview();
  document.dispatchEvent(new Event("layout:ready"));
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindNavToggle();
  bindAdminToggle();
  // startApp()은 로그인 확인 후 auth.js에서 호출한다 (직원 로그인 필수).
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
