(function () {
  const VEHICLES = {
    "car-1": "100오 7594",
    "car-2": "100오 7593",
    "car-3": "395너 5527",
  };

  const VEHICLE_ICONS = {
    "car-1": "🚙",
    "car-2": "🚗",
    "car-3": "🚐",
  };

  function buildSlots() {
    const slots = [];
    for (let h = 8; h < 17; h++) {
      slots.push(`${String(h).padStart(2, "0")}:00`);
      slots.push(`${String(h).padStart(2, "0")}:30`);
    }
    return slots;
  }

  function slotEnd(start) {
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + 30;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  const SLOTS = buildSlots();

  function toMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  const state = {
    vehicle: "car-1",
    date: new Date().toISOString().slice(0, 10),
    reservations: [],
    selStart: null,
    selEnd: null,
  };

  function renderVehicleGrid() {
    const grid = document.getElementById("vehicleGrid");
    grid.innerHTML = Object.entries(VEHICLES)
      .map(
        ([id, name]) => `
        <div class="vehicle-card ${id === state.vehicle ? "active" : ""}" data-id="${id}">
          <div class="vehicle-card__top">
            <span class="vehicle-card__icon">${VEHICLE_ICONS[id]}</span>
            <span class="tag tag--available">이용 가능</span>
          </div>
          <h3>${name}</h3>
          <div class="plate">법인 업무용 차량</div>
          <button class="btn btn--sm ${id === state.vehicle ? "" : "btn--outline"}" data-select="${id}">
            ${id === state.vehicle ? "선택됨" : "이 차량 선택"}
          </button>
        </div>`
      )
      .join("");

    grid.querySelectorAll("[data-select]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.vehicle = btn.dataset.select;
        state.selStart = null;
        state.selEnd = null;
        document.getElementById("vehSelectedVehicleLabel").textContent = VEHICLES[state.vehicle];
        renderVehicleGrid();
        updateSelectedRangeLabel();
        loadReservations();
      });
    });
  }

  function isSlotBooked(slotStart) {
    const s = toMinutes(slotStart);
    return state.reservations.some((r) => s >= toMinutes(r.start) && s < toMinutes(r.end));
  }

  function isSlotSelected(idx) {
    if (state.selStart === null) return false;
    const end = state.selEnd !== null ? state.selEnd : state.selStart;
    const lo = Math.min(state.selStart, end);
    const hi = Math.max(state.selStart, end);
    return idx >= lo && idx <= hi;
  }

  function renderGrid() {
    const grid = document.getElementById("vehSlotGrid");
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
    const label = document.getElementById("vehSelectedRange");
    const submitBtn = document.getElementById("vehSubmitBtn");
    if (state.selStart === null) {
      label.textContent = "선택된 시간이 없습니다.";
      submitBtn.disabled = true;
      return;
    }
    const startSlot = SLOTS[state.selStart];
    const endIdx = state.selEnd !== null ? state.selEnd : state.selStart;
    const endSlot = SLOTS[endIdx];
    label.textContent = `${VEHICLES[state.vehicle]} · ${startSlot} ~ ${slotEnd(endSlot)}`;
    submitBtn.disabled = false;
  }

  async function loadReservations() {
    const res = await fetch("/api/vehicle-reservations");
    const all = await res.json();
    state.reservations = all.filter((r) => r.date === state.date && r.vehicleId === state.vehicle);
    renderGrid();
    renderReservationList(all.filter((r) => r.date === state.date));
  }

  function renderReservationList(list) {
    const ul = document.getElementById("vehReservationList");
    if (!list.length) {
      ul.innerHTML = `<li class="empty-state">이 날짜에 등록된 예약이 없습니다.</li>`;
      return;
    }
    ul.innerHTML = list
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(
        (r) => `
        <li>
          <span class="r-time">${r.start}~${r.end}</span>
          <span class="r-meta">${r.vehicleName} · ${r.name}${r.dept ? " (" + r.dept + ")" : ""}
            ${r.destination ? `<small>목적지: ${r.destination}</small>` : ""}
          </span>
          <button class="cancel-btn" data-id="${r.id}">취소</button>
        </li>`
      )
      .join("");

    ul.querySelectorAll(".cancel-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 예약을 취소하시겠습니까?")) return;
        await fetch(`/api/vehicle-reservations/${btn.dataset.id}`, { method: "DELETE" });
        loadReservations();
      });
    });
  }

  async function loadLogs() {
    const res = await fetch("/api/driving-logs");
    const all = await res.json();
    const recent = all.sort((a, b) => b.id - a.id).slice(0, 10);
    const ul = document.getElementById("vehLogList");
    if (!recent.length) {
      ul.innerHTML = `<li class="empty-state">작성된 운행일지가 없습니다.</li>`;
      return;
    }
    ul.innerHTML = recent
      .map(
        (l) => `
        <li>
          <div class="log-head">${l.vehicleName} · ${l.driver}${l.dept ? " (" + l.dept + ")" : ""}</div>
          <div class="log-body">
            ${l.departure} → ${l.destination} · 주행거리 ${l.endOdo - l.startOdo}km
            ${l.passengers ? ` · 동승자: ${l.passengers}` : ""}
            ${l.notes ? `<br />특이사항: ${l.notes}` : ""}
          </div>
        </li>`
      )
      .join("");
  }

  function initControls() {
    const dateInput = document.getElementById("vehDateInput");
    dateInput.value = state.date;
    document.getElementById("vehSelectedVehicleLabel").textContent = VEHICLES[state.vehicle];

    const logVehicle = document.getElementById("vehLogVehicle");
    logVehicle.innerHTML = Object.entries(VEHICLES)
      .map(([id, name]) => `<option value="${id}">${name}</option>`)
      .join("");

    dateInput.addEventListener("change", () => {
      state.date = dateInput.value;
      state.selStart = null;
      state.selEnd = null;
      updateSelectedRangeLabel();
      loadReservations();
    });

    document.getElementById("vehReservationForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("vehUserName").value.trim();
      if (!name || state.selStart === null) return;
      const endIdx = state.selEnd !== null ? state.selEnd : state.selStart;
      const start = SLOTS[state.selStart];
      const end = slotEnd(SLOTS[endIdx]);

      const payload = {
        date: state.date,
        vehicleId: state.vehicle,
        vehicleName: VEHICLES[state.vehicle],
        start,
        end,
        name,
        dept: document.getElementById("vehUserDept").value.trim(),
        destination: document.getElementById("vehDestination").value.trim(),
      };

      const res = await fetch("/api/vehicle-reservations", {
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
      document.getElementById("vehReservationForm").reset();
      updateSelectedRangeLabel();
      loadReservations();
    });

    document.getElementById("vehLogForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const vehicleId = logVehicle.value;
      const payload = {
        vehicleId,
        vehicleName: VEHICLES[vehicleId],
        driver: document.getElementById("vehLogDriver").value.trim(),
        dept: document.getElementById("vehLogDept").value.trim(),
        passengers: document.getElementById("vehLogPassengers").value.trim(),
        departure: document.getElementById("vehLogDeparture").value.trim(),
        destination: document.getElementById("vehLogDestination").value.trim(),
        startOdo: Number(document.getElementById("vehLogStartOdo").value),
        endOdo: Number(document.getElementById("vehLogEndOdo").value),
        notes: document.getElementById("vehLogNotes").value.trim(),
      };

      if (payload.endOdo < payload.startOdo) {
        alert("도착 계기판 수치는 출발 계기판보다 커야 합니다.");
        return;
      }

      const res = await fetch("/api/driving-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "운행일지 제출에 실패했습니다.");
        return;
      }

      document.getElementById("vehLogForm").reset();
      loadLogs();
    });
  }

  document.addEventListener("layout:ready", () => {
    if (!document.getElementById("vehicleGrid")) return;
    renderVehicleGrid();
    initControls();
    loadReservations();
    loadLogs();
  });
})();
