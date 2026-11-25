// 설문 팝업: 소회의실도 예약 기능을 만들지, 유동적으로 남겨둘지.
// 아직 투표하지 않은 직원에게는 로그인 후 한 번 팝업이 뜬다("나중에 할게요"를 누르면
// 이번 접속 동안은 다시 안 뜸). 오른쪽 아래 버튼으로 언제든 다시 열어 결과를 보거나
// 의견을 바꿀 수 있다. 관리자는 결과 화면에서 누가 어떤 의견을 냈는지도 볼 수 있다.
(function () {
  const API = "/api/survey/small-room";
  const LATER_KEY = "hbaf-survey-small-room-later";
  const LABELS = {
    reserve: "소회의실도 예약 기능 만들기",
    flexible: "소회의실은 지금처럼 유동적으로",
  };

  let data = null;
  let editing = false;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function buildShell() {
    if (document.getElementById("surveyModal")) return;
    // 팝업 상자는 공용 배경(app.js의 getPopupHost) 안에 넣어서, 새 기능 안내 팝업과
    // 동시에 떠도 나란히 보이게 한다.
    const host = getPopupHost();
    const box = document.createElement("div");
    box.className = "modal-box survey-box";
    box.id = "surveyModal";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-labelledby", "surveyTitle");
    box.innerHTML = `
      <button type="button" class="survey-close" id="surveyCloseBtn" aria-label="닫기">✕</button>
      <span class="survey-tag">📊 사내 설문</span>
      <h2 id="surveyTitle">소회의실, 어떻게 쓸까요?</h2>
      <p class="survey-desc">지금은 대회의실만 예약할 수 있어요. 소회의실도 예약 기능을 만들지, 아니면 지금처럼 비어 있으면 자유롭게 쓰는 방식으로 둘지 의견을 들려주세요.</p>
      <div id="surveyBody"></div>`;
    host.prepend(box);

    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = "survey-fab";
    fab.id = "surveyFab";
    fab.hidden = true;
    fab.textContent = "📊 소회의실 설문";
    document.body.appendChild(fab);

    document.getElementById("surveyCloseBtn").addEventListener("click", closeLater);
    host.addEventListener("popup:backdrop", () => {
      if (!box.hidden) closeLater();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("surveyModal").hidden) closeLater();
    });
    document.getElementById("surveyFab").addEventListener("click", () => open());
  }

  function renderForm() {
    const mine = data.myVote || {};
    const body = document.getElementById("surveyBody");
    body.innerHTML = `
      <form id="surveyForm" class="survey-form">
        <div class="survey-options">
          ${Object.keys(LABELS)
            .map(
              (key) => `
            <label class="survey-option">
              <input type="radio" name="surveyChoice" value="${key}" ${mine.choice === key ? "checked" : ""} required />
              <span class="survey-option__card">
                <span class="survey-option__icon">${key === "reserve" ? "🗓️" : "🚪"}</span>
                <span class="survey-option__text">
                  <strong>${LABELS[key]}</strong>
                  <small>${key === "reserve" ? "대회의실처럼 시간대를 미리 잡아두고 써요" : "비어 있으면 그때그때 자유롭게 써요"}</small>
                </span>
              </span>
            </label>`
            )
            .join("")}
        </div>
        <label class="survey-comment-label" for="surveyComment">하고 싶은 말 (선택)</label>
        <textarea id="surveyComment" maxlength="200" rows="2" placeholder="예) 외부 미팅 때만 예약이 있으면 좋겠어요">${escapeHtml(mine.comment || "")}</textarea>
        <p class="survey-error" id="surveyError"></p>
        <button type="submit" class="btn">${data.myVote ? "의견 바꾸기" : "제출하기"}</button>
        <button type="button" class="survey-later" id="surveyLaterBtn">${data.myVote ? "취소" : "나중에 할게요"}</button>
      </form>`;

    document.getElementById("surveyLaterBtn").addEventListener("click", () => {
      if (data.myVote) {
        editing = false;
        render();
      } else {
        closeLater();
      }
    });

    document.getElementById("surveyForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const checked = body.querySelector('input[name="surveyChoice"]:checked');
      if (!checked) return;
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choice: checked.value, comment: document.getElementById("surveyComment").value }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "제출에 실패했습니다.");
        data = json;
        editing = false;
        render();
      } catch (err) {
        document.getElementById("surveyError").textContent = err.message || "제출에 실패했습니다.";
        btn.disabled = false;
      }
    });
  }

  function renderResults() {
    const total = data.total || 0;
    const bars = Object.keys(LABELS)
      .map((key) => {
        const n = data.counts[key] || 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const mine = data.myVote && data.myVote.choice === key;
        return `
          <div class="survey-result${mine ? " is-mine" : ""}">
            <div class="survey-result__head">
              <span>${LABELS[key]}${mine ? ' <em>내 선택</em>' : ""}</span>
              <strong>${pct}% <small>(${n}명)</small></strong>
            </div>
            <div class="survey-result__bar"><span style="width:${pct}%"></span></div>
          </div>`;
      })
      .join("");

    let adminList = "";
    if (Array.isArray(data.votes)) {
      adminList = data.votes.length
        ? `<div class="survey-admin">
            <h3>응답 내역 <small>(관리자만 보여요)</small></h3>
            <ul>${data.votes
              .map(
                (v) => `<li>
                  <span class="survey-admin__who">${escapeHtml(v.name)}</span>
                  <span class="survey-admin__pick survey-admin__pick--${v.choice}">${v.choice === "reserve" ? "예약제" : "유동적"}</span>
                  ${v.comment ? `<p>${escapeHtml(v.comment)}</p>` : ""}
                </li>`
              )
              .join("")}</ul>
          </div>`
        : `<p class="survey-admin-empty">아직 응답이 없어요.</p>`;
    }

    document.getElementById("surveyBody").innerHTML = `
      ${data.myVote ? `<p class="survey-thanks">✅ 의견 감사합니다! 현재 ${total}명이 참여했어요.</p>` : `<p class="survey-thanks">현재 ${total}명이 참여했어요.</p>`}
      ${bars}
      ${adminList}
      <button type="button" class="btn" id="surveyDoneBtn">닫기</button>
      <button type="button" class="survey-later" id="surveyEditBtn">${data.myVote ? "내 의견 바꾸기" : "투표하기"}</button>`;

    document.getElementById("surveyDoneBtn").addEventListener("click", close);
    document.getElementById("surveyEditBtn").addEventListener("click", () => {
      editing = true;
      render();
    });
  }

  function render() {
    if (!data) return;
    const isAdminView = Array.isArray(data.votes);
    if (editing || (!data.myVote && !isAdminView)) renderForm();
    else renderResults();
  }

  function open() {
    editing = false;
    render();
    document.getElementById("surveyModal").hidden = false;
    syncPopupHost();
  }

  function close() {
    document.getElementById("surveyModal").hidden = true;
    syncPopupHost();
  }

  function closeLater() {
    if (data && !data.myVote) {
      try {
        sessionStorage.setItem(LATER_KEY, "1");
      } catch (e) {}
    }
    close();
  }

  async function load(autoOpen) {
    try {
      const res = await fetch(API, { headers: typeof adminHeaders === "function" ? adminHeaders() : {} });
      if (!res.ok) return;
      data = await res.json();
    } catch (e) {
      return;
    }
    buildShell();
    document.getElementById("surveyFab").hidden = false;
    if (!autoOpen) {
      if (!document.getElementById("surveyModal").hidden) render();
      return;
    }
    let later = false;
    try {
      later = sessionStorage.getItem(LATER_KEY) === "1";
    } catch (e) {}
    // 관리자 비밀번호로만 들어온 경우(직원 계정 없음)에는 자동 팝업을 띄우지 않는다.
    const staff = typeof getUserToken === "function" && !!getUserToken();
    if (staff && !data.myVote && !later) open();
  }

  document.addEventListener("layout:ready", () => load(true));
  document.addEventListener("admin:changed", () => load(false));
})();
