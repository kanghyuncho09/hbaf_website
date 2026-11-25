// 새 기능 안내 팝업. 사이트에 들어오면 한 번 뜨고, "확인했어요"나 "써보러 가기"를 누르면
// 이 브라우저에서는 다시 뜨지 않는다. 다음에 새 기능을 알릴 때는 ANNOUNCEMENT.id만 바꾸고
// 내용을 고치면 모든 직원에게 다시 한 번 뜬다.
// 설문 팝업과 같은 배경 안에 나란히 뜬다(데스크톱은 좌우, 휴대폰은 위아래).
(function () {
  const ANNOUNCEMENT = {
    id: "2026-11-vehicle-route-map-v2",
    tag: "🆕 새 기능",
    title: "법인차량 예약에 길찾기가 생겼어요!",
    image: { src: "/assets/img/feature-route-map.png", alt: "목적지에 판교역을 입력하면 지도에 경로와 차로 약 45분 소요시간이 표시되는 실제 화면" },
    items: [
      {
        icon: "🗺️",
        title: "목적지만 입력하면 지도가 떠요",
        desc: "장소 이름이나 주소를 치면 회사→목적지 경로가 바로 그려져요.",
      },
      {
        icon: "🚗",
        title: "차로 몇 분 걸리는지 알려줘요",
        desc: "예약한 대여 시각 출발 기준으로 시간·거리·통행료를 계산해요.",
      },
      {
        icon: "📍",
        title: "다른 장소면 골라서 바꿀 수 있어요",
        desc: "지도 아래 후보 중에서 원하는 장소를 고르면 돼요.",
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
    const modal = document.createElement("div");
    modal.className = "modal-box announce-box";
    modal.id = "announceModal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-labelledby", "announceTitle");
    modal.innerHTML = `
          <button type="button" class="announce-close" id="announceCloseBtn" aria-label="닫기">✕</button>
          <span class="announce-tag">${ANNOUNCEMENT.tag}</span>
          <h2 id="announceTitle">${ANNOUNCEMENT.title}</h2>
          ${
            ANNOUNCEMENT.image
              ? `<figure class="announce-shot"><img src="${ANNOUNCEMENT.image.src}" alt="${ANNOUNCEMENT.image.alt}" loading="lazy" /><figcaption>실제 화면 · 목적지에 "판교역"을 입력했을 때</figcaption></figure>`
              : ""
          }
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
          <button type="button" class="announce-later" id="announceOkBtn">확인했어요</button>`;
    // 설문 팝업과 같은 공용 배경(app.js의 getPopupHost) 안에 넣어서 동시에 나란히 뜨게 한다
    const host = getPopupHost();
    host.appendChild(modal);

    const close = () => {
      markSeen();
      modal.hidden = true;
      syncPopupHost();
    };
    document.getElementById("announceCloseBtn").addEventListener("click", close);
    document.getElementById("announceOkBtn").addEventListener("click", close);
    host.addEventListener("popup:backdrop", () => {
      if (!modal.hidden) close();
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
    // 강제 노출 기간(app.js의 POPUP_FORCE_UNTIL)에는 이미 봤어도 접속할 때마다 띄운다
    const forced = typeof popupsForced === "function" && popupsForced();
    if (!forced && alreadySeen()) return;
    (document.getElementById("announceModal") || build()).hidden = false;
    syncPopupHost();
  }

  document.addEventListener("layout:ready", () => setTimeout(show, 600));
})();
