// 쏘카 스타일의 드래그형 시간 범위 선택기. 회의실/차량 예약 둘 다 이 모듈을
// 공유해서 쓴다 (분 단위 계산, 예약된/지난 시간대 회피 로직이 동일하기 때문).
function createTimeSlider(opts) {
  const {
    track,
    handleStart,
    handleEnd,
    rangeEl,
    pastEl,
    bookedContainer,
    startMin = 480,
    endMin = 1020,
    step = 10,
    onChange,
  } = opts;

  let selStart = startMin;
  let selEnd = startMin + step;
  let bookedRanges = [];
  let pastUntil = null;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function minToLabel(min) {
    return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  }

  function percentFor(min) {
    return ((min - startMin) / (endMin - startMin)) * 100;
  }

  function minuteFromClientX(clientX) {
    const rect = track.getBoundingClientRect();
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.min(1, Math.max(0, pct));
    let min = startMin + pct * (endMin - startMin);
    min = Math.round(min / step) * step;
    return Math.min(endMin, Math.max(startMin, min));
  }

  function overlapsBooked(a, b) {
    return bookedRanges.some((r) => a < r.end && b > r.start);
  }

  function effectiveMin() {
    return pastUntil !== null ? Math.max(startMin, pastUntil) : startMin;
  }

  function isDayFullyPast() {
    return effectiveMin() > endMin - step;
  }

  function render() {
    handleStart.style.left = percentFor(selStart) + "%";
    handleEnd.style.left = percentFor(selEnd) + "%";
    rangeEl.style.left = percentFor(selStart) + "%";
    rangeEl.style.width = Math.max(0, percentFor(selEnd) - percentFor(selStart)) + "%";
    handleStart.setAttribute("aria-label", `시작 ${minToLabel(selStart)}`);
    handleEnd.setAttribute("aria-label", `종료 ${minToLabel(selEnd)}`);
    handleStart.dataset.label = minToLabel(selStart);
    handleEnd.dataset.label = minToLabel(selEnd);

    if (pastEl) {
      const pastEndMin = Math.min(effectiveMin(), endMin);
      if (pastUntil !== null && pastEndMin > startMin) {
        pastEl.style.display = "";
        pastEl.style.width = percentFor(pastEndMin) + "%";
      } else {
        pastEl.style.display = "none";
      }
    }

    if (bookedContainer) {
      bookedContainer.innerHTML = bookedRanges
        .map((r) => {
          const left = percentFor(Math.max(r.start, startMin));
          const width = percentFor(Math.min(r.end, endMin)) - left;
          return `<div class="time-slider__segment time-slider__segment--booked" style="left:${left}%;width:${Math.max(0, width)}%"></div>`;
        })
        .join("");
    }
  }

  function emitChange() {
    if (onChange) onChange(minToLabel(selStart), minToLabel(selEnd));
  }

  function tryMoveStart(candidateMin) {
    const lo = effectiveMin();
    const hi = selEnd - step;
    if (hi < lo) return;
    candidateMin = Math.min(Math.max(candidateMin, lo), hi);
    if (overlapsBooked(candidateMin, selEnd)) return;
    if (candidateMin === selStart) return;
    selStart = candidateMin;
    render();
    emitChange();
  }

  function tryMoveEnd(candidateMin) {
    const lo = selStart + step;
    const hi = endMin;
    if (lo > hi) return;
    candidateMin = Math.min(Math.max(candidateMin, lo), hi);
    if (overlapsBooked(selStart, candidateMin)) return;
    if (candidateMin === selEnd) return;
    selEnd = candidateMin;
    render();
    emitChange();
  }

  function bindDrag(handle, mover) {
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      mover(minuteFromClientX(clientX));
      e.preventDefault();
    };
    const onUp = () => {
      dragging = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointerdown", (e) => {
      if (handle.classList.contains("is-disabled")) return;
      dragging = true;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (err) {}
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      e.preventDefault();
    });
    handle.addEventListener("keydown", (e) => {
      if (handle.classList.contains("is-disabled")) return;
      const current = handle === handleStart ? selStart : selEnd;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        mover(current - step);
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        mover(current + step);
      }
    });
  }

  bindDrag(handleStart, tryMoveStart);
  bindDrag(handleEnd, tryMoveEnd);

  track.addEventListener("pointerdown", (e) => {
    if (track.classList.contains("is-disabled")) return;
    if (e.target === handleStart || e.target === handleEnd) return;
    const min = minuteFromClientX(e.clientX);
    const distStart = Math.abs(min - selStart);
    const distEnd = Math.abs(min - selEnd);
    if (distStart <= distEnd) tryMoveStart(min);
    else tryMoveEnd(min);
  });

  function pickDefaultRange() {
    let s = effectiveMin();
    if (s > endMin - step) {
      selStart = endMin - step;
      selEnd = endMin;
      return;
    }
    let e = Math.min(s + step * 3, endMin);
    let guard = 0;
    while (overlapsBooked(s, e) && guard < 300) {
      s += step;
      e = Math.min(s + step * 3, endMin);
      guard++;
      if (s >= endMin - step) {
        s = endMin - step;
        e = endMin;
        break;
      }
    }
    selStart = s;
    selEnd = e;
  }

  return {
    // 페이지 로드/날짜 변경처럼 완전히 새로 시작할 때: 항상 기본 선택값을 다시 잡는다.
    init(ranges, pastUntilMin) {
      bookedRanges = ranges || [];
      pastUntil = pastUntilMin !== undefined ? pastUntilMin : null;
      pickDefaultRange();
      render();
      emitChange();
    },
    // 주기적으로 최신 예약 현황만 반영할 때: 사용자가 지금 고르고 있는 값은
    // 그대로 두고, 그 사이 다른 사람이 예약해서 선택 구간이 실제로 겹치게 된
    // 경우에만 기본값으로 다시 잡는다.
    refresh(ranges, pastUntilMin) {
      bookedRanges = ranges || [];
      pastUntil = pastUntilMin !== undefined ? pastUntilMin : null;
      const invalid = overlapsBooked(selStart, selEnd) || selStart < effectiveMin();
      if (invalid) {
        pickDefaultRange();
      }
      render();
      if (invalid) emitChange();
    },
    isDayFullyPast,
    minToLabel,
    getSelection() {
      return { start: minToLabel(selStart), end: minToLabel(selEnd) };
    },
    getSelectionMinutes() {
      return { start: selStart, end: selEnd };
    },
    setDisabled(disabled) {
      track.classList.toggle("is-disabled", disabled);
      handleStart.classList.toggle("is-disabled", disabled);
      handleEnd.classList.toggle("is-disabled", disabled);
    },
    render,
  };
}

window.createTimeSlider = createTimeSlider;
