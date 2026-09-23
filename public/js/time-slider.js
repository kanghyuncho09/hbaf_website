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
    if (pastUntil === null) return startMin;
    // 분 단위로 딱 떨어지지 않는 "지금 시각"도 10분 단위 스텝에 맞춰 올림한다.
    const rounded = Math.ceil(pastUntil / step) * step;
    return Math.max(startMin, rounded);
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
    const wantStart = distStart <= distEnd;
    const testLo = Math.min(wantStart ? min : selStart, wantStart ? selEnd : min);
    const testHi = Math.max(wantStart ? min : selStart, wantStart ? selEnd : min);
    // 클릭한 지점이 기존 선택 구간과 이어져 있지 않고(예: 이미 예약된 시간대
    // 건너편), 핸들 하나만 옮기면 그 사이에 낀 예약과 겹쳐서 막히는 경우엔
    // 핸들을 옮기는 대신 클릭한 지점 근처로 선택 구간을 통째로 새로 잡는다.
    if (overlapsBooked(testLo, testHi)) {
      selectNearPoint(min);
      return;
    }
    if (wantStart) tryMoveStart(min);
    else tryMoveEnd(min);
  });

  // 기준점(from) 이후로 예약과 안 겹치는 가장 가까운 구간을 찾는다. 그 지점부터
  // 다음 예약 시작 전까지 비는 틈이 30분보다 좁으면(예: 지금부터 다음 예약까지
  // 20분밖에 안 남은 경우) 30분을 채우려고 그 틈을 건너뛰지 않고, 그 틈 안에서
  // 잡을 수 있는 만큼만 잡는다.
  function nextFreeRange(from) {
    let s = Math.max(startMin, from);
    let guard = 0;
    while (guard < 300) {
      if (s > endMin - step) return { start: endMin - step, end: endMin };

      const containing = bookedRanges.find((r) => s >= r.start && s < r.end);
      if (containing) {
        s = containing.end;
        guard++;
        continue;
      }

      const upcoming = bookedRanges
        .filter((r) => r.start >= s)
        .sort((a, b) => a.start - b.start)[0];
      const gapEnd = upcoming ? Math.min(upcoming.start, endMin) : endMin;

      if (gapEnd - s < step) {
        // 이 지점부터는 한 칸(step)도 못 잡을 만큼 좁으니 다음 예약이 끝난
        // 뒤로 건너뛴다.
        if (!upcoming) return { start: endMin - step, end: endMin };
        s = upcoming.end;
        guard++;
        continue;
      }

      return { start: s, end: Math.min(s + step * 3, gapEnd) };
    }
    return { start: endMin - step, end: endMin };
  }

  function pickDefaultRange() {
    const range = nextFreeRange(effectiveMin());
    selStart = range.start;
    selEnd = range.end;
  }

  function selectNearPoint(min) {
    const clamped = Math.max(effectiveMin(), Math.min(min, endMin));
    const range = nextFreeRange(clamped);
    selStart = range.start;
    selEnd = range.end;
    render();
    emitChange();
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
