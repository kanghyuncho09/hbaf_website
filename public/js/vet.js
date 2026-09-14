(function () {
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
      const hasRecords = recordsForDate(dateStr).length > 0;
      const classes = ["vet-cal-cell"];
      if (dateStr === todayStr()) classes.push("is-today");
      if (dateStr === selectedDate) classes.push("is-selected");
      html += `<div class="${classes.join(" ")}" data-date="${dateStr}">${d}${hasRecords ? '<span class="vet-cal-dot"></span>' : ""}</div>`;
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

  function renderRecordItem(r, showDate) {
    return `
      <li data-record-id="${r.id}">
        <div class="post-title">
          <span class="vet-record-cat">${escapeHtml(r.cat)}</span>${showDate ? escapeHtml(r.date) : ""}
        </div>
        <div class="post-content">${escapeHtml(r.notes)}</div>
        ${
          isAdmin()
            ? `<div class="post-admin-actions"><button type="button" class="btn btn--sm btn--outline" data-delete-vet="${r.id}">삭제</button></div>`
            : ""
        }
      </li>
    `;
  }

  function bindDeleteButtons(container) {
    container.querySelectorAll("[data-delete-vet]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 기록을 삭제하시겠습니까?")) return;
        const res = await fetch(`/api/vet-records/${btn.dataset.deleteVet}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        if (!res.ok) {
          alert("삭제 권한이 없거나 실패했습니다.");
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
    bindDeleteButtons(ul);
  }

  function renderAllRecords() {
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const ul = document.getElementById("vetAllRecords");
    if (!sorted.length) {
      ul.innerHTML = `<li class="empty-state">등록된 기록이 없습니다.</li>`;
      return;
    }
    ul.innerHTML = sorted.slice(0, 30).map((r) => renderRecordItem(r, true)).join("");
    bindDeleteButtons(ul);
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
