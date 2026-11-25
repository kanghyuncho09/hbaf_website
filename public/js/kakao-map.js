// 법인차량 예약 현황의 "🗺️ 지도" 버튼: 회사 → 목적지 위치를 카카오맵으로 보여주고,
// 직선거리와 카카오맵 길찾기 링크를 함께 띄운다.
// 카카오 JavaScript 키는 서버의 KAKAO_JS_KEY 환경변수에서 받아온다. 키가 없거나 지도를
// 못 불러오면 지도 없이 카카오맵 검색/길찾기 링크만 보여준다.
(function () {
  const OFFICE = { name: "HBAF 본사", lat: 37.5228755, lng: 127.0364564 };

  let keyPromise = null;
  let sdkPromise = null;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function getKey() {
    if (!keyPromise) {
      keyPromise = fetch("/api/config/kakao")
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => d.jsKey || "")
        .catch(() => "");
    }
    return keyPromise;
  }

  function loadSdk(key) {
    if (!sdkPromise) {
      sdkPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
        s.onload = () => (window.kakao && kakao.maps ? kakao.maps.load(resolve) : reject(new Error("sdk")));
        s.onerror = () => reject(new Error("sdk"));
        document.head.appendChild(s);
      }).catch((e) => {
        sdkPromise = null;
        throw e;
      });
    }
    return sdkPromise;
  }

  function distanceKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function searchLink(dest) {
    return `https://map.kakao.com/link/search/${encodeURIComponent(dest)}`;
  }

  function routeLink(place) {
    const from = `${OFFICE.name},${OFFICE.lat},${OFFICE.lng}`;
    const to = `${place.name.replace(/,/g, " ")},${place.lat},${place.lng}`;
    return `https://map.kakao.com/link/from/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}`;
  }

  function buildModal() {
    let modal = document.getElementById("destMapModal");
    if (modal) return modal;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="modal-overlay dest-map-modal" id="destMapModal" hidden>
        <div class="modal-box dest-map-box" role="dialog" aria-modal="true" aria-labelledby="destMapTitle">
          <button type="button" class="dest-map-close" id="destMapClose" aria-label="닫기">✕</button>
          <h2 id="destMapTitle">🗺️ 목적지 위치</h2>
          <div id="destMapBody"></div>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
    modal = document.getElementById("destMapModal");
    const close = () => (modal.hidden = true);
    document.getElementById("destMapClose").addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) close();
    });
    return modal;
  }

  function renderFallback(body, dest, message) {
    body.innerHTML = `
      <p class="dest-map-msg">${message}</p>
      <div class="dest-map-actions">
        <a class="btn" href="${searchLink(dest)}" target="_blank" rel="noopener">카카오맵에서 "${escapeHtml(dest)}" 검색</a>
      </div>`;
  }

  async function open(dest) {
    const modal = buildModal();
    const body = document.getElementById("destMapBody");
    document.getElementById("destMapTitle").textContent = `🗺️ ${dest}`;
    body.innerHTML = `<p class="dest-map-msg">위치를 찾는 중...</p>`;
    modal.hidden = false;

    const key = await getKey();
    if (!key) {
      renderFallback(body, dest, "지도 기능이 아직 설정되지 않았어요. 카카오맵에서 바로 찾아볼 수 있어요.");
      return;
    }
    try {
      await loadSdk(key);
    } catch (e) {
      renderFallback(body, dest, "지도를 불러오지 못했어요. 카카오맵에서 바로 찾아볼 수 있어요.");
      return;
    }

    const officeLatLng = new kakao.maps.LatLng(OFFICE.lat, OFFICE.lng);
    const places = new kakao.maps.services.Places();
    places.keywordSearch(
      dest,
      (result, status) => {
        if (modal.hidden) return;
        if (status !== kakao.maps.services.Status.OK || !result.length) {
          renderFallback(body, dest, `"${escapeHtml(dest)}"에 해당하는 장소를 찾지 못했어요.`);
          return;
        }
        const r = result[0];
        const place = {
          name: r.place_name,
          address: r.road_address_name || r.address_name,
          lat: Number(r.y),
          lng: Number(r.x),
          url: r.place_url,
        };
        const km = distanceKm(OFFICE, place);
        body.innerHTML = `
          <div class="dest-map-place">
            <strong>${escapeHtml(place.name)}</strong>
            <span>${escapeHtml(place.address)}</span>
            <span class="dest-map-dist">회사에서 직선거리 약 ${km < 10 ? km.toFixed(1) : Math.round(km)}km</span>
          </div>
          <div class="dest-map-canvas" id="destMapCanvas"></div>
          <p class="dest-map-hint">검색 결과 중 첫 번째 장소를 보여줘요. 다른 곳이면 카카오맵에서 다시 찾아보세요.</p>
          <div class="dest-map-actions">
            <a class="btn" href="${routeLink(place)}" target="_blank" rel="noopener">🚗 카카오맵 길찾기</a>
            <a class="btn btn--outline" href="${place.url || searchLink(dest)}" target="_blank" rel="noopener">장소 정보</a>
          </div>`;

        const destLatLng = new kakao.maps.LatLng(place.lat, place.lng);
        const map = new kakao.maps.Map(document.getElementById("destMapCanvas"), { center: destLatLng, level: 5 });
        new kakao.maps.Marker({ map, position: officeLatLng, title: OFFICE.name });
        new kakao.maps.Marker({ map, position: destLatLng, title: place.name });
        new kakao.maps.CustomOverlay({
          map,
          position: officeLatLng,
          yAnchor: 2.6,
          content: `<div class="dest-map-label dest-map-label--office">회사</div>`,
        });
        new kakao.maps.CustomOverlay({
          map,
          position: destLatLng,
          yAnchor: 2.6,
          content: `<div class="dest-map-label">${escapeHtml(place.name)}</div>`,
        });
        new kakao.maps.Polyline({
          map,
          path: [officeLatLng, destLatLng],
          strokeWeight: 3,
          strokeColor: "#212121",
          strokeOpacity: 0.6,
          strokeStyle: "shortdash",
        });
        const bounds = new kakao.maps.LatLngBounds();
        bounds.extend(officeLatLng);
        bounds.extend(destLatLng);
        map.setBounds(bounds, 60, 40, 40, 40);
      },
      { location: officeLatLng }
    );
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-dest-map]");
    if (!btn) return;
    e.preventDefault();
    open(btn.dataset.destMap);
  });
})();
