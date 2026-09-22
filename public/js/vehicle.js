(function () {
  const VEHICLES = {
    "car-2": "100오 7593",
    "car-1": "100오 7594",
    "car-3": "395너 5527",
  };

  const VEHICLE_PHOTO = "/assets/img/car.png";
  const START_MIN = 8 * 60; // 08:00
  const END_MIN = 17 * 60; // 17:00
  const STEP = 10;

  function toMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  const state = {
    vehicle: "car-2",
    date: new Date().toISOString().slice(0, 10),
    reservations: [],
    allReservations: [],
  };

  let slider = null;

  function isVehicleBusyNow(vehicleId) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return state.allReservations.some(
      (r) => r.vehicleId === vehicleId && r.date === todayStr && nowMin >= toMinutes(r.start) && nowMin < toMinutes(r.end)
    );
  }

  function renderVehicleGrid() {
    const grid = document.getElementById("vehicleGrid");
    grid.innerHTML = Object.entries(VEHICLES)
      .map(([id, name]) => {
        const busy = isVehicleBusyNow(id);
        return `
        <div class="vehicle-card ${id === state.vehicle ? "active" : ""}" data-id="${id}">
          <div class="vehicle-card__photo-wrap">
            <img src="${VEHICLE_PHOTO}" alt="${name}" class="vehicle-card__photo" />
            <span class="tag ${busy ? "tag--booked" : "tag--available"} vehicle-card__badge">${busy ? "사용중" : "이용 가능"}</span>
          </div>
          <div class="vehicle-card__body">
            <h3>${name}</h3>
            <div class="plate">법인 업무용 차량</div>
            <button class="btn btn--sm ${id === state.vehicle ? "" : "btn--outline"}" data-select="${id}">
              ${id === state.vehicle ? "선택됨" : "이 차량 선택"}
            </button>
          </div>
        </div>`;
      })
      .join("");

    grid.querySelectorAll("[data-select]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.vehicle = btn.dataset.select;
        document.getElementById("vehSelectedVehicleLabel").textContent = VEHICLES[state.vehicle];
        renderVehicleGrid();
        loadReservations();
      });
    });
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
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
    document.getElementById("vehDurationText").textContent = formatDuration(start, end);
    document.getElementById("vehStartLabel").textContent = slider.minToLabel(start);
    document.getElementById("vehEndLabel").textContent = slider.minToLabel(end);

    const statusEl = document.getElementById("vehSliderStatus");
    const submitBtn = document.getElementById("vehSubmitBtn");
    if (slider.isDayFullyPast()) {
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
      track: document.getElementById("vehSliderTrack"),
      handleStart: document.getElementById("vehHandleStart"),
      handleEnd: document.getElementById("vehHandleEnd"),
      rangeEl: document.getElementById("vehSliderRange"),
      pastEl: document.getElementById("vehSliderPast"),
      bookedContainer: document.getElementById("vehSliderBooked"),
      startMin: START_MIN,
      endMin: END_MIN,
      step: STEP,
      onChange: onSliderChange,
    });
  }

  async function loadReservations() {
    const res = await fetch("/api/vehicle-reservations");
    const all = await res.json();
    state.allReservations = all;
    state.reservations = all.filter((r) => r.date === state.date && r.vehicleId === state.vehicle);
    renderVehicleGrid();
    slider.init(bookedRangesForSlider(), pastUntilForSelectedDate());
    renderReservationList(all.filter((r) => r.date === state.date));
  }

  async function refreshReservations() {
    const res = await fetch("/api/vehicle-reservations");
    const all = await res.json();
    state.allReservations = all;
    state.reservations = all.filter((r) => r.date === state.date && r.vehicleId === state.vehicle);
    renderVehicleGrid();
    slider.refresh(bookedRangesForSlider(), pastUntilForSelectedDate());
    renderReservationList(all.filter((r) => r.date === state.date));
  }

  function renderReservationList(list) {
    const ul = document.getElementById("vehReservationList");
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
          <span class="r-meta">${r.vehicleName} · ${r.name}${r.dept ? " (" + r.dept + ")" : ""}
            ${r.destination ? `<small>목적지: ${r.destination}</small>` : ""}
          </span>
          ${admin ? `<button class="cancel-btn" data-id="${r.id}">취소</button>` : ""}
        </li>`
      )
      .join("");

    ul.querySelectorAll(".cancel-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 예약을 취소하시겠습니까?")) return;
        const res = await fetch(`/api/vehicle-reservations/${btn.dataset.id}`, {
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

  let allLogs = [];

  async function loadLogs() {
    const res = await fetch("/api/driving-logs");
    allLogs = await res.json();
    renderLogs();
  }

  function renderLogs() {
    const admin = isAdmin();
    document.getElementById("vehLogListTitle").textContent = admin ? "전체 운행일지 (관리자)" : "최근 운행일지";
    document.getElementById("vehLogExportBtn").style.display = admin ? "" : "none";

    const sorted = [...allLogs].sort((a, b) => b.id - a.id);
    const list = admin ? sorted : sorted.slice(0, 10);
    const ul = document.getElementById("vehLogList");
    if (!list.length) {
      ul.innerHTML = `<li class="empty-state">작성된 운행일지가 없습니다.</li>`;
      return;
    }
    ul.innerHTML = list.map((l) => renderLogItem(l, admin)).join("");
    if (!admin) return;

    ul.querySelectorAll("[data-delete-log]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 운행일지를 삭제하시겠습니까?")) return;
        const res = await fetch(`/api/driving-logs/${btn.dataset.deleteLog}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        if (!res.ok) {
          alert("삭제 권한이 없거나 실패했습니다.");
          return;
        }
        loadLogs();
      });
    });

    ul.querySelectorAll("[data-edit-log]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = ul.querySelector(`li[data-log-id="${btn.dataset.editLog}"]`);
        li.querySelector(".log-view").hidden = true;
        li.querySelector(".log-edit-form").hidden = false;
      });
    });

    ul.querySelectorAll("[data-cancel-log-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = ul.querySelector(`li[data-log-id="${btn.dataset.cancelLogEdit}"]`);
        li.querySelector(".log-view").hidden = false;
        li.querySelector(".log-edit-form").hidden = true;
      });
    });

    ul.querySelectorAll(".log-edit-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = form.dataset.editForm;
        const field = (name) => form.querySelector(`[data-field="${name}"]`).value;
        const startOdo = Number(field("startOdo"));
        const endOdo = Number(field("endOdo"));
        if (endOdo < startOdo) {
          alert("도착 계기판 수치는 출발 계기판보다 커야 합니다.");
          return;
        }
        const vehicleId = field("vehicleId");
        const payload = {
          vehicleId,
          vehicleName: VEHICLES[vehicleId],
          driver: field("driver").trim(),
          dept: field("dept").trim(),
          passengers: field("passengers").trim(),
          departure: field("departure").trim(),
          destination: field("destination").trim(),
          startOdo,
          endOdo,
          notes: field("notes").trim(),
        };
        const res = await fetch(`/api/driving-logs/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...adminHeaders() },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          alert("수정 권한이 없거나 실패했습니다.");
          return;
        }
        loadLogs();
      });
    });
  }

  function renderLogItem(l, admin) {
    const viewHtml = `
      <div class="log-view">
        <div class="log-head">${l.vehicleName} · ${l.driver}${l.dept ? " (" + l.dept + ")" : ""}</div>
        <div class="log-body">
          ${l.departure} → ${l.destination} · 주행거리 ${l.endOdo - l.startOdo}km
          ${l.passengers ? ` · 동승자: ${l.passengers}` : ""}
          ${l.notes ? `<br />특이사항: ${l.notes}` : ""}
        </div>
        ${
          admin
            ? `<div class="post-admin-actions">
                <button type="button" class="btn btn--sm btn--outline" data-edit-log="${l.id}">수정</button>
                <button type="button" class="btn btn--sm btn--outline" data-delete-log="${l.id}">삭제</button>
              </div>`
            : ""
        }
      </div>`;

    if (!admin) return `<li data-log-id="${l.id}">${viewHtml}</li>`;

    const vehicleOptions = Object.entries(VEHICLES)
      .map(([id, name]) => `<option value="${id}" ${id === l.vehicleId ? "selected" : ""}>${name}</option>`)
      .join("");

    return `
      <li data-log-id="${l.id}">
        ${viewHtml}
        <form class="log-edit-form" data-edit-form="${l.id}" hidden>
          <div class="form-grid">
            <div class="form-row">
              <label>차량</label>
              <select data-field="vehicleId">${vehicleOptions}</select>
            </div>
            <div class="form-row">
              <label>운전자</label>
              <input type="text" data-field="driver" value="${escapeHtml(l.driver)}" required />
            </div>
          </div>
          <div class="form-grid">
            <div class="form-row">
              <label>부서</label>
              <input type="text" data-field="dept" value="${escapeHtml(l.dept || "")}" />
            </div>
            <div class="form-row">
              <label>동승자</label>
              <input type="text" data-field="passengers" value="${escapeHtml(l.passengers || "")}" />
            </div>
          </div>
          <div class="form-grid">
            <div class="form-row">
              <label>출발지</label>
              <input type="text" data-field="departure" value="${escapeHtml(l.departure)}" required />
            </div>
            <div class="form-row">
              <label>도착지</label>
              <input type="text" data-field="destination" value="${escapeHtml(l.destination)}" required />
            </div>
          </div>
          <div class="form-grid">
            <div class="form-row">
              <label>출발 계기판(km)</label>
              <input type="number" data-field="startOdo" value="${l.startOdo}" required />
            </div>
            <div class="form-row">
              <label>도착 계기판(km)</label>
              <input type="number" data-field="endOdo" value="${l.endOdo}" required />
            </div>
          </div>
          <div class="form-row">
            <label>특이사항</label>
            <textarea data-field="notes" rows="2">${escapeHtml(l.notes || "")}</textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn--sm">저장</button>
            <button type="button" class="btn btn--sm btn--outline" data-cancel-log-edit="${l.id}">취소</button>
          </div>
        </form>
      </li>`;
  }

  async function exportLogsCsv() {
    const res = await fetch("/api/driving-logs/export/csv", { headers: adminHeaders() });
    if (!res.ok) {
      alert("다운로드 권한이 없거나 실패했습니다.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "driving-logs.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
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
      loadReservations();
    });

    document.getElementById("vehReservationForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("vehUserName").value.trim();
      if (!name) return;
      if (slider.isDayFullyPast()) {
        alert("오늘은 예약 가능한 시간이 지났습니다. 다른 날짜를 선택해주세요.");
        return;
      }
      const { start, end } = slider.getSelection();

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

      document.getElementById("vehReservationForm").reset();
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
    initSlider();
    renderVehicleGrid();
    initControls();
    loadReservations();
    loadLogs();

    document.getElementById("vehLogExportBtn").addEventListener("click", exportLogsCsv);
    document.addEventListener("admin:changed", renderLogs);
    document.addEventListener("admin:changed", () => renderReservationList(state.reservations));

    // 예약 시간이 지나면 자동으로 "사용중" 배지가 사라지고, 지나간 시간대는 자동으로
    // 선택 불가 상태로 바뀌도록 주기적으로 다시 확인한다.
    setInterval(refreshReservations, 60000);
  });
})();
