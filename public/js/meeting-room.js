(function () {
  const ROOM_ID = "room-1";
  const ROOM_NAME = "원형회의실";

  function buildSlots() {
    const slots = [];
    for (let h = 8; h < 17; h++) {
      slots.push(`${String(h).padStart(2, "0")}:00`);
      slots.push(`${String(h).padStart(2, "0")}:30`);
    }
    return slots; // 08:00 ~ 16:30 (18 slots), each slot is a 30min block
  }

  function slotEnd(start) {
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + 30;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  const SLOTS = buildSlots();

  const state = {
    date: new Date().toISOString().slice(0, 10),
    reservations: [],
    allReservations: [],
    selStart: null,
    selEnd: null,
  };

  function toMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  function isRoomBusyNow() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
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

  function isSlotBooked(slotStart) {
    const s = toMinutes(slotStart);
    return state.reservations.some((r) => s >= toMinutes(r.start) && s < toMinutes(r.end));
  }

  // 종료로 클릭한 슬롯은 "그 시각까지"라는 경계를 의미하므로 블록에는 포함하지
  // 않는다 (예: 10:00 클릭 후 11:00 클릭 = 10:00~11:00, 11:00~11:30 블록은 제외).
  // 다만 마지막 슬롯(16:30)을 종료로 클릭한 경우는 마감 시간(17:00)까지 이용하려는
  // 것이므로 그 블록까지 포함한다.
  function isSlotSelected(idx) {
    if (state.selStart === null) return false;
    if (state.selEnd === null) return idx === state.selStart;
    const lo = Math.min(state.selStart, state.selEnd);
    const hi = Math.max(state.selStart, state.selEnd);
    if (hi === SLOTS.length - 1) return idx >= lo && idx <= hi;
    return idx >= lo && idx < hi;
  }

  function computeEndTime() {
    const endIdx = state.selEnd !== null ? state.selEnd : state.selStart;
    const endSlot = SLOTS[endIdx];
    if (state.selEnd !== null && endIdx < SLOTS.length - 1) return endSlot;
    return slotEnd(endSlot);
  }

  function renderGrid() {
    const grid = document.getElementById("mrSlotGrid");
    if (!grid) return;
    grid.innerHTML = SLOTS.map((s, idx) => {
      const booked = isSlotBooked(s);
      const selected = !booked && isSlotSelected(idx);
      const cls = booked ? "slot slot--booked" : selected ? "slot slot--selected" : "slot";
      return `<div class="${cls}" data-idx="${idx}">${s}</div>`;
    }).join("");

    grid.querySelectorAll(".slot").forEach((el) => {
      el.addEventListener("click", () => {
        if (el.classList.contains("slot--booked")) return;
        const idx = Number(el.dataset.idx);
        if (state.selStart === null || (state.selStart !== null && state.selEnd !== null)) {
          state.selStart = idx;
          state.selEnd = null;
        } else if (idx <= state.selStart) {
          state.selStart = idx;
          state.selEnd = null;
        } else {
          state.selEnd = idx;
        }
        renderGrid();
        updateSelectedRangeLabel();
      });
    });
  }

  function updateSelectedRangeLabel() {
    const label = document.getElementById("mrSelectedRange");
    const submitBtn = document.getElementById("mrSubmitBtn");
    if (state.selStart === null) {
      label.textContent = "선택된 시간이 없습니다.";
      submitBtn.disabled = true;
      return;
    }
    const startSlot = SLOTS[state.selStart];
    label.textContent = `${ROOM_NAME} · ${startSlot} ~ ${computeEndTime()}`;
    submitBtn.disabled = false;
  }

  async function loadReservations() {
    const res = await fetch("/api/meeting-reservations");
    const all = await res.json();
    state.allReservations = all;
    state.reservations = all.filter((r) => r.date === state.date && r.roomId === ROOM_ID);
    renderGrid();
    renderReservationList(state.reservations);
    renderStatusBadge();
  }

  function renderReservationList(list) {
    const ul = document.getElementById("mrReservationList");
    if (!list.length) {
      ul.innerHTML = `<li class="empty-state">이 날짜에 등록된 예약이 없습니다.</li>`;
      return;
    }
    const admin = isAdmin();
    ul.innerHTML = list
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(
        (r) => `
        <li>
          <span class="r-time">${r.start}~${r.end}</span>
          <span class="r-meta">${r.name}${r.dept ? " (" + r.dept + ")" : ""}
            ${r.purpose ? `<small>${r.purpose}</small>` : ""}
          </span>
          ${admin ? `<button class="cancel-btn" data-id="${r.id}">취소</button>` : ""}
        </li>`
      )
      .join("");

    ul.querySelectorAll(".cancel-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 예약을 취소하시겠습니까?")) return;
        const res = await fetch(`/api/meeting-reservations/${btn.dataset.id}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        if (!res.ok) {
          alert("취소 권한이 없거나 실패했습니다.");
          return;
        }
        loadReservations();
      });
    });
  }

  function initControls() {
    const dateInput = document.getElementById("mrDateInput");
    dateInput.value = state.date;

    dateInput.addEventListener("change", () => {
      state.date = dateInput.value;
      state.selStart = null;
      state.selEnd = null;
      updateSelectedRangeLabel();
      loadReservations();
    });

    document.getElementById("mrReservationForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("mrUserName").value.trim();
      if (!name || state.selStart === null) return;
      const start = SLOTS[state.selStart];
      const end = computeEndTime();

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

      state.selStart = null;
      state.selEnd = null;
      document.getElementById("mrReservationForm").reset();
      updateSelectedRangeLabel();
      loadReservations();
    });
  }

  document.addEventListener("layout:ready", () => {
    if (!document.getElementById("mrSlotGrid")) return;
    initControls();
    loadReservations();

    // 예약 시간이 지나면 자동으로 "사용중" 배지가 사라지도록 주기적으로 다시 그려준다.
    setInterval(renderStatusBadge, 60000);

    document.addEventListener("admin:changed", () => renderReservationList(state.reservations));
  });
})();
