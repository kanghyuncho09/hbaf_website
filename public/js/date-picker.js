// 회의실/차량 예약 날짜 선택용 달력. 병원 기록 탭(vet.js)의 달력과 같은 방식으로
// 공휴일을 빨간 글씨로 표시한다. HOLIDAYS(app.js)와 localDateStr(app.js)를 그대로 쓴다.
function createDatePicker({ root, initialDate, onSelect }) {
  const trigger = root.querySelector("[data-dp-trigger]");
  const pop = root.querySelector("[data-dp-pop]");
  const label = root.querySelector("[data-dp-label]");
  const grid = root.querySelector("[data-dp-grid]");
  const prevBtn = root.querySelector("[data-dp-prev]");
  const nextBtn = root.querySelector("[data-dp-next]");

  const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  let selected = initialDate;
  let viewYear;
  let viewMonth; // 1-indexed

  function parse(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return { y, m, d };
  }

  function fmt(y, m, d) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function setView(dateStr) {
    const { y, m } = parse(dateStr);
    viewYear = y;
    viewMonth = m;
  }

  function render() {
    const { y: sy, m: sm, d: sd } = parse(selected);
    trigger.textContent = `${selected} (${WEEKDAY_NAMES[new Date(sy, sm - 1, sd).getDay()]})`;
    label.textContent = `${viewYear}년 ${viewMonth}월`;

    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const todayStr = localDateStr();

    let html = "";
    for (let i = 0; i < startWeekday; i++) {
      html += `<span class="dp-cell is-empty"></span>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = fmt(viewYear, viewMonth, d);
      const holidayName = (typeof HOLIDAYS !== "undefined" && HOLIDAYS[dateStr]) || "";
      const classes = ["dp-cell"];
      if (dateStr === todayStr) classes.push("is-today");
      if (dateStr === selected) classes.push("is-selected");
      if (holidayName) classes.push("is-holiday");
      html += `<button type="button" class="${classes.join(" ")}" data-date="${dateStr}" title="${holidayName}">${d}</button>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll("[data-date]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selected = btn.dataset.date;
        pop.hidden = true;
        render();
        if (typeof onSelect === "function") onSelect(selected);
      });
    });
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
  });

  prevBtn.addEventListener("click", () => {
    viewMonth--;
    if (viewMonth < 1) {
      viewMonth = 12;
      viewYear--;
    }
    render();
  });

  nextBtn.addEventListener("click", () => {
    viewMonth++;
    if (viewMonth > 12) {
      viewMonth = 1;
      viewYear++;
    }
    render();
  });

  document.addEventListener("click", (e) => {
    if (!pop.hidden && !root.contains(e.target)) pop.hidden = true;
  });

  setView(selected);
  render();

  return {
    getDate() {
      return selected;
    },
    setDate(dateStr) {
      selected = dateStr;
      setView(dateStr);
      render();
    },
  };
}
