(function () {
  // 대한민국 공식 공휴일 (매년 새로 확인해서 업데이트 필요 — 설날/추석/부처님오신날처럼
  // 음력 기준인 날짜는 해가 바뀌면 날짜 자체가 달라진다).
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

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth(); // 0-indexed
  let records = [];
  let selectedDate = formatDateStr(now);

  function formatDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function todayStr() {
    return formatDateStr(new Date());
  }

  async function loadRecords() {
    const res = await fetch("/api/vet-records");
    records = await res.json();
    renderCalendar();
    renderDayRecords();
    renderAllRecords();
  }

  function recordsForDate(dateStr) {
    return records.filter((r) => r.date === dateStr);
  }

  function renderCalendar() {
    document.getElementById("vetMonthLabel").textContent = `${currentYear}년 ${currentMonth + 1}월`;

    const grid = document.getElementById("vetCalGrid");
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    let html = "";
    for (let i = 0; i < startWeekday; i++) {
      html += `<div class="vet-cal-cell is-empty"></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayRecords = recordsForDate(dateStr);
      const holidayName = HOLIDAYS[dateStr];
      const classes = ["vet-cal-cell"];
      if (dateStr === todayStr()) classes.push("is-today");
      if (dateStr === selectedDate) classes.push("is-selected");
      if (holidayName) classes.push("is-holiday");

      const holidayHtml = holidayName ? `<div class="vet-cal-holiday">${escapeHtml(holidayName)}</div>` : "";

      const shown = dayRecords.slice(0, 2);
      const extra = dayRecords.length - shown.length;
      const previewHtml = dayRecords.length
        ? `<div class="vet-cal-preview">
            ${shown
              .map((r) => `<div class="vet-cal-preview__item">${escapeHtml(r.cat)}: ${escapeHtml(r.notes)}</div>`)
              .join("")}
            ${extra > 0 ? `<div class="vet-cal-preview__more">+${extra}건 더보기</div>` : ""}
          </div>`
        : "";

      html += `<div class="${classes.join(" ")}" data-date="${dateStr}"><span class="vet-cal-daynum">${d}</span>${holidayHtml}${previewHtml}</div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll(".vet-cal-cell[data-date]").forEach((cell) => {
      cell.addEventListener("click", () => {
        selectedDate = cell.dataset.date;
        renderCalendar();
        renderDayRecords();
      });
    });
  }

  const CAT_OPTIONS = ["바프", "베프", "바프・베프"];

  function renderRecordItem(r, showDate) {
    const catOptions = CAT_OPTIONS.map(
      (c) => `<option value="${c}" ${c === r.cat ? "selected" : ""}>${c === "바프・베프" ? "바프・베프 둘 다" : c}</option>`
    ).join("");
    return `
      <li data-record-id="${r.id}">
        <div class="record-view">
          <div class="post-title">
            <span class="vet-record-cat">${escapeHtml(r.cat)}</span>${showDate ? escapeHtml(r.date) : ""}
          </div>
          <div class="post-content">${escapeHtml(r.notes)}</div>
          <div class="post-admin-actions">
            <button type="button" class="btn btn--sm btn--outline" data-edit-vet="${r.id}">수정</button>
            <button type="button" class="btn btn--sm btn--outline" data-delete-vet="${r.id}">삭제</button>
          </div>
        </div>
        <form class="record-edit-form" data-edit-form="${r.id}" hidden>
          <div class="form-row">
            <label>날짜</label>
            <input type="date" data-field="date" value="${r.date}" required />
          </div>
          <div class="form-row">
            <label>고양이</label>
            <select data-field="cat">${catOptions}</select>
          </div>
          <div class="form-row">
            <label>병원 방문 사유 / 진료 내용 / 특이사항</label>
            <textarea data-field="notes" rows="3" required>${escapeHtml(r.notes)}</textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn--sm">저장</button>
            <button type="button" class="btn btn--sm btn--outline" data-cancel-edit="${r.id}">취소</button>
          </div>
        </form>
      </li>
    `;
  }

  function bindRecordActions(container) {
    container.querySelectorAll("[data-delete-vet]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 기록을 삭제하시겠습니까?")) return;
        const res = await fetch(`/api/vet-records/${btn.dataset.deleteVet}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        if (!res.ok) {
          alert("삭제에 실패했습니다.");
          return;
        }
        await loadRecords();
      });
    });

    container.querySelectorAll("[data-edit-vet]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = container.querySelector(`li[data-record-id="${btn.dataset.editVet}"]`);
        li.querySelector(".record-view").hidden = true;
        li.querySelector(".record-edit-form").hidden = false;
      });
    });

    container.querySelectorAll("[data-cancel-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = container.querySelector(`li[data-record-id="${btn.dataset.cancelEdit}"]`);
        li.querySelector(".record-view").hidden = false;
        li.querySelector(".record-edit-form").hidden = true;
      });
    });

    container.querySelectorAll(".record-edit-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = form.dataset.editForm;
        const field = (name) => form.querySelector(`[data-field="${name}"]`).value;
        const payload = {
          date: field("date"),
          cat: field("cat"),
          notes: field("notes").trim(),
        };
        const res = await fetch(`/api/vet-records/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...adminHeaders() },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          alert("수정에 실패했습니다.");
          return;
        }
        await loadRecords();
      });
    });
  }

  function renderDayRecords() {
    document.getElementById("vetSelectedDateLabel").textContent = `${selectedDate} 기록`;
    const list = recordsForDate(selectedDate);
    const ul = document.getElementById("vetDayRecords");
    if (!list.length) {
      ul.innerHTML = `<li class="empty-state">이 날짜에 등록된 기록이 없습니다.</li>`;
      return;
    }
    ul.innerHTML = list.map((r) => renderRecordItem(r, false)).join("");
    bindRecordActions(ul);
  }

  function renderAllRecords() {
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const ul = document.getElementById("vetAllRecords");
    if (!sorted.length) {
      ul.innerHTML = `<li class="empty-state">등록된 기록이 없습니다.</li>`;
      return;
    }
    ul.innerHTML = sorted.slice(0, 30).map((r) => renderRecordItem(r, true)).join("");
    bindRecordActions(ul);
  }

  function initControls() {
    document.getElementById("vetPrevMonth").addEventListener("click", () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderCalendar();
    });
    document.getElementById("vetNextMonth").addEventListener("click", () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderCalendar();
    });

    document.getElementById("vetRecordForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        date: selectedDate,
        cat: document.getElementById("vetCatSelect").value,
        notes: document.getElementById("vetNotes").value.trim(),
      };
      const res = await fetch("/api/vet-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert("기록 추가에 실패했습니다.");
        return;
      }
      document.getElementById("vetNotes").value = "";
      await loadRecords();
    });

    document.addEventListener("admin:changed", () => {
      renderDayRecords();
      renderAllRecords();
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  document.addEventListener("layout:ready", () => {
    if (!document.getElementById("vetCalGrid")) return;
    initControls();
    loadRecords();
  });
})();
