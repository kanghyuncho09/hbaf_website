(function () {
  const ROOM_ID = "room-1";
  const ROOM_NAME = "원형회의실";
  const START_MIN = 8 * 60; // 08:00
  const END_MIN = 17 * 60; // 17:00
  const STEP = 10;

  const state = {
    date: localDateStr(),
    reservations: [],
    allReservations: [],
  };

  let slider = null;

  function toMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  function isRoomBusyNow() {
    const now = new Date();
    const todayStr = localDateStr(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return state.allReservations.some(
      (r) => r.roomId === ROOM_ID && r.date === todayStr && nowMin >= toMinutes(r.start) && nowMin < toMinutes(r.end)
    );
  }

  function renderStatusBadge() {
    const badge = document.getElementById("mrStatusBadge");
    if (!badge) return;
    const busy = isRoomBusyNow();
    badge.textContent = busy ? "사용중" : "이용 가능";
    badge.classList.toggle("tag--booked", busy);
    badge.classList.toggle("tag--available", !busy);
  }

  function todayStr() {
    return localDateStr();
  }

  function pastUntilForSelectedDate() {
    if (state.date !== todayStr()) return null;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function bookedRangesForSlider() {
    return state.reservations.map((r) => ({ start: toMinutes(r.start), end: toMinutes(r.end) }));
  }

  function formatDuration(startMin, endMin) {
    const total = endMin - startMin;
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m}분`;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
  }

  function onSliderChange() {
    const { start, end } = slider.getSelectionMinutes();
    document.getElementById("mrDurationText").textContent = formatDuration(start, end);
    document.getElementById("mrStartLabel").textContent = slider.minToLabel(start);
    document.getElementById("mrEndLabel").textContent = slider.minToLabel(end);

    const statusEl = document.getElementById("mrSliderStatus");
    const submitBtn = document.getElementById("mrSubmitBtn");
    const holidayName = HOLIDAYS[state.date];
    if (holidayName) {
      statusEl.textContent = `공휴일(${holidayName})에는 예약할 수 없습니다.`;
      statusEl.classList.add("is-warning");
      slider.setDisabled(true);
      submitBtn.disabled = true;
    } else if (slider.isDayFullyPast()) {
      statusEl.textContent = "오늘은 예약 가능한 시간이 지났습니다. 다른 날짜를 선택해주세요.";
      statusEl.classList.add("is-warning");
      slider.setDisabled(true);
      submitBtn.disabled = true;
    } else {
      statusEl.textContent = "예약 가능합니다";
      statusEl.classList.remove("is-warning");
      slider.setDisabled(false);
      submitBtn.disabled = false;
    }
  }

  function initSlider() {
    slider = createTimeSlider({
      track: document.getElementById("mrSliderTrack"),
      handleStart: document.getElementById("mrHandleStart"),
      handleEnd: document.getElementById("mrHandleEnd"),
      rangeEl: document.getElementById("mrSliderRange"),
      pastEl: document.getElementById("mrSliderPast"),
      bookedContainer: document.getElementById("mrSliderBooked"),
      startMin: START_MIN,
      endMin: END_MIN,
      step: STEP,
      onChange: onSliderChange,
    });
  }

  async function loadReservations() {
    const res = await fetch("/api/meeting-reservations");
    const all = await res.json();
    state.allReservations = all;
    state.reservations = all.filter((r) => r.date === state.date && r.roomId === ROOM_ID);
    slider.init(bookedRangesForSlider(), pastUntilForSelectedDate());
    renderReservationList(state.reservations);
    renderStatusBadge();
  }

  async function refreshReservations() {
    const res = await fetch("/api/meeting-reservations");
    const all = await res.json();
    state.allReservations = all;
    state.reservations = all.filter((r) => r.date === state.date && r.roomId === ROOM_ID);
    slider.refresh(bookedRangesForSlider(), pastUntilForSelectedDate());
    renderReservationList(state.reservations);
    renderStatusBadge();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function renderReservationList(list) {
    const ul = document.getElementById("mrReservationList");
    if (!list.length) {
      ul.innerHTML = `<li class="empty-state">이 날짜에 등록된 예약이 없습니다.</li>`;
      return;
    }
    const admin = isAdmin();
    const myUsername = typeof getUsername === "function" ? getUsername() : "";
    ul.innerHTML = list
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((r) => {
        const canManage = admin || (myUsername && r.username === myUsername);
        return `
        <li data-res-id="${r.id}">
          <div class="res-view">
            <span class="r-time">${r.start}~${r.end}</span>
            <span class="r-meta">${escapeHtml(r.name)}${r.dept ? " (" + escapeHtml(r.dept) + ")" : ""}
              ${r.purpose ? `<small>${escapeHtml(r.purpose)}</small>` : ""}
            </span>
            ${
              canManage
                ? `<span class="res-actions"><button type="button" class="edit-btn" data-id="${r.id}">수정</button><button type="button" class="cancel-btn" data-id="${r.id}">취소</button></span>`
                : ""
            }
          </div>
          ${
            canManage
              ? `<form class="res-edit-form" data-edit-id="${r.id}" hidden>
                  <div class="form-grid">
                    <div class="form-row"><label>시작</label><input type="time" data-field="start" value="${r.start}" min="08:00" max="16:50" step="600" required /></div>
                    <div class="form-row"><label>종료</label><input type="time" data-field="end" value="${r.end}" min="08:10" max="17:00" step="600" required /></div>
                  </div>
                  <div class="form-grid">
                    <div class="form-row"><label>예약자</label><input type="text" data-field="name" value="${escapeHtml(r.name)}" required /></div>
                    <div class="form-row"><label>부서</label><input type="text" data-field="dept" value="${escapeHtml(r.dept || "")}" /></div>
                  </div>
                  <div class="form-row"><label>회의 목적</label><input type="text" data-field="purpose" value="${escapeHtml(r.purpose || "")}" /></div>
                  <div class="form-actions">
                    <button type="submit" class="btn btn--sm">저장</button>
                    <button type="button" class="btn btn--sm btn--outline" data-cancel-edit="${r.id}">취소</button>
                  </div>
                </form>`
              : ""
          }
        </li>`;
      })
      .join("");

    ul.querySelectorAll(".cancel-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 예약을 취소하시겠습니까?")) return;
        const res = await fetch(`/api/meeting-reservations/${btn.dataset.id}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || "취소 권한이 없거나 실패했습니다.");
          return;
        }
        loadReservations();
      });
    });

    ul.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = ul.querySelector(`li[data-res-id="${btn.dataset.id}"]`);
        li.querySelector(".res-view").hidden = true;
        li.querySelector(".res-edit-form").hidden = false;
      });
    });

    ul.querySelectorAll("[data-cancel-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = ul.querySelector(`li[data-res-id="${btn.dataset.cancelEdit}"]`);
        li.querySelector(".res-view").hidden = false;
        li.querySelector(".res-edit-form").hidden = true;
      });
    });

    ul.querySelectorAll(".res-edit-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const field = (n) => form.querySelector(`[data-field="${n}"]`).value.trim();
        const start = field("start");
        const end = field("end");
        if (start >= end) {
          alert("종료 시각은 시작 시각보다 늦어야 합니다.");
          return;
        }
        const res = await fetch(`/api/meeting-reservations/${form.dataset.editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...adminHeaders() },
          body: JSON.stringify({ date: state.date, start, end, name: field("name"), dept: field("dept"), purpose: field("purpose") }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || "수정에 실패했습니다.");
          return;
        }
        loadReservations();
      });
    });
  }

  function initControls() {
    createDatePicker({
      root: document.getElementById("mrDatePicker"),
      initialDate: state.date,
      onSelect: (dateStr) => {
        state.date = dateStr;
        loadReservations();
      },
    });

    const nameInput = document.getElementById("mrUserName");
    if (typeof getUserName === "function" && getUserName()) nameInput.value = getUserName();

    document.getElementById("mrReservationForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("mrUserName").value.trim();
      if (!name) return;
      if (HOLIDAYS[state.date]) {
        alert(`공휴일(${HOLIDAYS[state.date]})에는 예약할 수 없습니다.`);
        return;
      }
      if (slider.isDayFullyPast()) {
        alert("오늘은 예약 가능한 시간이 지났습니다. 다른 날짜를 선택해주세요.");
        return;
      }
      const { start, end } = slider.getSelection();

      const payload = {
        date: state.date,
        roomId: ROOM_ID,
        roomName: ROOM_NAME,
        start,
        end,
        name,
        dept: document.getElementById("mrUserDept").value.trim(),
        purpose: document.getElementById("mrPurpose").value.trim(),
      };

      const res = await fetch("/api/meeting-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "예약에 실패했습니다.");
        return;
      }

      document.getElementById("mrReservationForm").reset();
      if (typeof getUserName === "function" && getUserName()) nameInput.value = getUserName();
      loadReservations();
    });
  }

  document.addEventListener("layout:ready", () => {
    if (!document.getElementById("mrTimeSlider")) return;
    initSlider();
    initControls();
    loadReservations();

    // 예약 시간이 지나면 자동으로 "사용중" 배지가 사라지고, 지나간 시간대는 자동으로
    // 선택 불가 상태로 바뀌도록 주기적으로 다시 확인한다.
    setInterval(refreshReservations, 60000);

    document.addEventListener("admin:changed", () => renderReservationList(state.reservations));
  });
})();
