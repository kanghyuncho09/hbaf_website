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

  /* ================= 예약 폼: 목적지 입력 시 미니지도 + 차량 소요시간 ================= */
  // 목적지를 입력하면 카카오 장소 검색으로 후보를 찾고, 첫 후보(또는 고른 후보)까지의 자동차
  // 경로를 서버(/api/route, 카카오모빌리티)에서 받아 지도에 그린다. 출발 시각은 예약 시간
  // 슬라이더의 대여 시각을 그대로 써서 "그 시간에 출발하면 몇 분"을 보여준다.
  const preview = {
    map: null,
    markers: [],
    line: null,
    place: null,
    candidates: [],
    departure: null, // { date: "YYYY-MM-DD", start: "HH:MM" }
    searchTimer: null,
    routeTimer: null,
    seq: 0,
  };

  function formatDuration(sec) {
    const m = Math.round(sec / 60);
    if (m < 60) return `${m}분`;
    return `${Math.floor(m / 60)}시간 ${m % 60 ? (m % 60) + "분" : ""}`.trim();
  }

  function departureParam() {
    const d = preview.departure;
    if (!d || !d.date || !/^\d{2}:\d{2}$/.test(d.start)) return "";
    return d.date.replace(/-/g, "") + d.start.replace(":", "");
  }

  function departureLabel() {
    const d = preview.departure;
    if (!d || !d.date) return "";
    const [, mo, da] = d.date.split("-");
    return `${Number(mo)}/${Number(da)} ${d.start} 출발 기준`;
  }

  function clearOverlays() {
    preview.markers.forEach((m) => m.setMap(null));
    preview.markers = [];
    if (preview.line) preview.line.setMap(null);
    preview.line = null;
  }

  function ensurePreviewMap() {
    const el = document.getElementById("vehRouteMap");
    if (!preview.map) {
      preview.map = new kakao.maps.Map(el, { center: new kakao.maps.LatLng(OFFICE.lat, OFFICE.lng), level: 7 });
      preview.map.setZoomable(true);
    } else {
      preview.map.relayout();
    }
    return preview.map;
  }

  function drawPlace(place, path) {
    const map = ensurePreviewMap();
    clearOverlays();
    const officeLatLng = new kakao.maps.LatLng(OFFICE.lat, OFFICE.lng);
    const destLatLng = new kakao.maps.LatLng(place.lat, place.lng);
    preview.markers.push(new kakao.maps.Marker({ map, position: officeLatLng, title: OFFICE.name }));
    preview.markers.push(new kakao.maps.Marker({ map, position: destLatLng, title: place.name }));
    const linePath = path && path.length ? path.map(([x, y]) => new kakao.maps.LatLng(y, x)) : [officeLatLng, destLatLng];
    preview.line = new kakao.maps.Polyline({
      map,
      path: linePath,
      strokeWeight: path && path.length ? 5 : 3,
      strokeColor: path && path.length ? "#ffb400" : "#212121",
      strokeOpacity: path && path.length ? 0.95 : 0.5,
      strokeStyle: path && path.length ? "solid" : "shortdash",
    });
    const bounds = new kakao.maps.LatLngBounds();
    linePath.forEach((p) => bounds.extend(p));
    map.setBounds(bounds, 30, 30, 30, 30);
  }

  function renderCandidates() {
    const el = document.getElementById("vehRouteCands");
    if (preview.candidates.length < 2) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML =
      `<span class="route-preview__cands-label">다른 장소인가요?</span>` +
      preview.candidates
        .slice(0, 5)
        .map(
          (c, i) =>
            `<button type="button" class="route-cand${c === preview.place ? " is-active" : ""}" data-cand="${i}" title="${escapeHtml(c.address)}">${escapeHtml(c.name)}</button>`
        )
        .join("");
  }

  function setSummary(html) {
    document.getElementById("vehRouteSummary").innerHTML = html;
  }

  async function updateRoute() {
    const place = preview.place;
    if (!place) return;
    const seq = ++preview.seq;
    const km = distanceKm(OFFICE, place);
    const head = `<div class="route-preview__place"><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(place.address)}</span></div>`;
    setSummary(`${head}<div class="route-preview__time is-loading">🚗 소요시간 계산 중...</div>`);
    drawPlace(place, null);

    let data = null;
    let err = "";
    try {
      const dep = departureParam();
      const res = await fetch(`/api/route?lng=${place.lng}&lat=${place.lat}${dep ? `&dep=${dep}` : ""}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) data = json;
      else err = json.error || "소요시간을 계산하지 못했어요.";
    } catch (e) {
      err = "소요시간을 계산하지 못했어요.";
    }
    if (seq !== preview.seq) return; // 그 사이 다른 장소/시간으로 바뀐 경우

    const link = `<a href="${routeLink(place)}" target="_blank" rel="noopener">카카오맵 길찾기 ↗</a>`;
    if (data) {
      const basis = data.departure ? departureLabel() : "지금 교통 기준";
      const toll = data.tollFare ? ` · 통행료 ${data.tollFare.toLocaleString()}원` : "";
      setSummary(
        `${head}<div class="route-preview__time">🚗 차로 약 <b>${formatDuration(data.durationSec)}</b> · ${(data.distanceM / 1000).toFixed(1)}km${toll}</div>` +
          `<div class="route-preview__meta">${basis} · 편도 · ${link}</div>`
      );
      drawPlace(place, data.path);
    } else {
      setSummary(
        `${head}<div class="route-preview__time">📏 직선거리 약 ${km < 10 ? km.toFixed(1) : Math.round(km)}km</div>` +
          `<div class="route-preview__meta">${escapeHtml(err)} · ${link}</div>`
      );
    }
  }

  async function searchDestination(query) {
    const box = document.getElementById("vehRoutePreview");
    if (query.length < 2) {
      box.hidden = true;
      preview.place = null;
      return;
    }
    const key = await getKey();
    if (!key) return; // 지도 키가 없으면 미니지도 기능은 숨긴 채로 둔다
    try {
      await loadSdk(key);
    } catch (e) {
      return;
    }
    const seq = ++preview.seq;
    new kakao.maps.services.Places().keywordSearch(
      query,
      (result, status) => {
        if (seq !== preview.seq) return;
        box.hidden = false;
        if (status !== kakao.maps.services.Status.OK || !result.length) {
          preview.place = null;
          preview.candidates = [];
          clearOverlays();
          renderCandidates();
          setSummary(`<div class="route-preview__meta">"${escapeHtml(query)}"에 해당하는 장소를 찾지 못했어요. 장소 이름이나 주소로 다시 입력해 보세요.</div>`);
          if (preview.map) preview.map.relayout();
          return;
        }
        preview.candidates = result.map((r) => ({
          name: r.place_name,
          address: r.road_address_name || r.address_name,
          lat: Number(r.y),
          lng: Number(r.x),
        }));
        preview.place = preview.candidates[0];
        renderCandidates();
        updateRoute();
      },
      { location: new kakao.maps.LatLng(OFFICE.lat, OFFICE.lng) }
    );
  }

  function initReservationPreview() {
    const input = document.getElementById("vehDestination");
    if (!input) return;

    input.addEventListener("input", () => {
      clearTimeout(preview.searchTimer);
      preview.searchTimer = setTimeout(() => searchDestination(input.value.trim()), 600);
    });

    document.getElementById("vehRouteCands").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cand]");
      if (!btn) return;
      preview.place = preview.candidates[Number(btn.dataset.cand)];
      // 고른 장소 이름으로 목적지 칸을 채워서 예약 현황에도 정확한 장소가 남게 한다
      input.value = preview.place.name;
      renderCandidates();
      updateRoute();
    });

    // 대여 시각/날짜가 바뀌면 그 출발 시각 기준으로 소요시간을 다시 계산
    document.addEventListener("vehicle:departure", (e) => {
      const prev = departureParam();
      preview.departure = e.detail;
      if (!preview.place || departureParam() === prev) return;
      clearTimeout(preview.routeTimer);
      preview.routeTimer = setTimeout(updateRoute, 700);
    });

    // 예약이 완료돼서 폼이 비워지면 미니지도도 닫는다
    document.getElementById("vehReservationForm").addEventListener("reset", () => {
      document.getElementById("vehRoutePreview").hidden = true;
      preview.place = null;
    });
  }

  document.addEventListener("layout:ready", initReservationPreview);
})();
