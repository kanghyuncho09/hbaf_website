// 새 기능 안내 팝업. 사이트에 들어오면 한 번 뜨고, "확인했어요"나 "써보러 가기"를 누르면
// 이 브라우저에서는 다시 뜨지 않는다. 다음에 새 기능을 알릴 때는 ANNOUNCEMENT.id만 바꾸고
// 내용을 고치면 모든 직원에게 다시 한 번 뜬다.
// 설문 팝업이 떠 있으면 그게 닫힌 뒤에 이어서 보여준다(팝업 두 개가 겹치지 않게).
(function () {
  const ANNOUNCEMENT = {
    id: "2026-11-vehicle-route-map",
    tag: "🆕 새 기능",
    title: "법인차량 예약에 길찾기가 생겼어요!",
    items: [
      {
        icon: "🗺️",
        title: "목적지만 입력하면 지도가 떠요",
        desc: "예약할 때 목적지 칸에 장소 이름이나 주소(예: 판교역)를 입력하면, 바로 아래에 회사에서 목적지까지 경로가 지도로 그려져요.",
      },
      {
        icon: "🚗",
        title: "차로 몇 분 걸리는지 알려줘요",
        desc: "예약한 대여 시각에 출발하는 기준으로 예상 소요시간, 거리, 통행료까지 계산해요. 시간을 바꾸면 다시 계산돼요.",
      },
      {
        icon: "📍",
        title: "다른 장소면 골라서 바꿀 수 있어요",
        desc: "검색 결과가 원하는 곳이 아니면 지도 아래 후보 중에서 고르세요. 예약 현황의 '🗺️ 지도' 버튼으로 다른 사람의 목적지도 볼 수 있어요.",
      },
    ],
    cta: { label: "법인차량 예약에서 써보기", view: "vehicle", focus: "vehDestination" },
  };
  const SEEN_KEY = "hbaf-announce-seen";

  function alreadySeen() {
    try {
      return localStorage.getItem(SEEN_KEY) === ANNOUNCEMENT.id;
    } catch (e) {
      return false;
    }
  }

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, ANNOUNCEMENT.id);
    } catch (e) {}
  }

  function build() {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="modal-overlay announce-modal" id="announceModal" hidden>
        <div class="modal-box announce-box" role="dialog" aria-modal="true" aria-labelledby="announceTitle">
          <button type="button" class="announce-close" id="announceCloseBtn" aria-label="닫기">✕</button>
          <span class="announce-tag">${ANNOUNCEMENT.tag}</span>
          <h2 id="announceTitle">${ANNOUNCEMENT.title}</h2>
          <ul class="announce-list">
            ${ANNOUNCEMENT.items
              .map(
                (it) => `
              <li>
                <span class="announce-list__icon">${it.icon}</span>
                <div><strong>${it.title}</strong><p>${it.desc}</p></div>
              </li>`
              )
              .join("")}
          </ul>
          <button type="button" class="btn" id="announceCtaBtn">${ANNOUNCEMENT.cta.label}</button>
          <button type="button" class="announce-later" id="announceOkBtn">확인했어요</button>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
    const modal = document.getElementById("announceModal");

    const close = () => {
      markSeen();
      modal.hidden = true;
    };
    document.getElementById("announceCloseBtn").addEventListener("click", close);
    document.getElementById("announceOkBtn").addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) close();
    });
    document.getElementById("announceCtaBtn").addEventListener("click", () => {
      close();
      if (typeof navigateTo === "function") navigateTo(ANNOUNCEMENT.cta.view);
      const target = document.getElementById(ANNOUNCEMENT.cta.focus);
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.focus({ preventScroll: true });
        }, 400);
      }
    });
    return modal;
  }

  function show() {
    if (alreadySeen()) return;
    const survey = document.getElementById("surveyModal");
    if (survey && !survey.hidden) {
      // 설문 팝업이 닫히면 이어서 보여준다
      const obs = new MutationObserver(() => {
        if (survey.hidden) {
          obs.disconnect();
          setTimeout(show, 300);
        }
      });
      obs.observe(survey, { attributes: true, attributeFilter: ["hidden"] });
      return;
    }
    (document.getElementById("announceModal") || build()).hidden = false;
  }

  // 설문 팝업이 먼저 뜰 수 있도록(서버 응답 대기) 잠깐 기다렸다가 확인한다
  document.addEventListener("layout:ready", () => setTimeout(show, 1200));
})();
