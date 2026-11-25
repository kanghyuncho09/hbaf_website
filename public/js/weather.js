(function () {
  const WEATHER_CODE_MAP = {
    0: { label: "맑음", icon: "☀️" },
    1: { label: "대체로 맑음", icon: "🌤️" },
    2: { label: "구름 조금", icon: "⛅" },
    3: { label: "흐림", icon: "☁️" },
    45: { label: "안개", icon: "🌫️" },
    48: { label: "안개", icon: "🌫️" },
    51: { label: "이슬비", icon: "🌦️" },
    53: { label: "이슬비", icon: "🌦️" },
    55: { label: "이슬비", icon: "🌦️" },
    61: { label: "비", icon: "🌧️" },
    63: { label: "비", icon: "🌧️" },
    65: { label: "강한 비", icon: "🌧️" },
    71: { label: "눈", icon: "🌨️" },
    73: { label: "눈", icon: "🌨️" },
    75: { label: "강한 눈", icon: "🌨️" },
    80: { label: "소나기", icon: "🌦️" },
    81: { label: "소나기", icon: "🌦️" },
    82: { label: "강한 소나기", icon: "🌦️" },
    95: { label: "뇌우", icon: "⛈️" },
  };

  // 본사 위치 좌표: 서울특별시 강남구 도산대로45길 6
  const OFFICE_LAT = 37.5228755;
  const OFFICE_LON = 127.0364564;
  const OFFICE_LOCATION_LABEL = "서울시 강남구 도산대로";

  async function loadWeather() {
    const el = document.getElementById("weatherWidget");
    if (!el) return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${OFFICE_LAT}&longitude=${OFFICE_LON}&current=temperature_2m,weather_code,relative_humidity_2m&timezone=Asia%2FSeoul`;
      const res = await fetch(url);
      const data = await res.json();
      const cur = data.current;
      const info = WEATHER_CODE_MAP[cur.weather_code] || { label: "정보 없음", icon: "🌡️" };
      el.innerHTML = `
        <div class="weather__icon">${info.icon}</div>
        <div class="weather__body">
          <div class="weather__location">📍 ${OFFICE_LOCATION_LABEL}</div>
          <div class="weather__temp">${Math.round(cur.temperature_2m)}°C</div>
          <div class="weather__label">${info.label} · 습도 ${cur.relative_humidity_2m}%</div>
          <div class="weather__air" id="airQuality"></div>
        </div>
      `;
      loadAirQuality();
    } catch (err) {
      el.innerHTML = `<div class="weather__label">날씨 정보를 불러오지 못했습니다.</div>`;
    }
  }

  // 미세먼지 등급은 환경부(에어코리아) 기준 (단위 ㎍/㎥)
  function dustGrade(value, cuts) {
    if (value == null || Number.isNaN(value)) return null;
    const grades = [
      { label: "좋음", cls: "good" },
      { label: "보통", cls: "normal" },
      { label: "나쁨", cls: "bad" },
      { label: "매우나쁨", cls: "worst" },
    ];
    const idx = cuts.findIndex((c) => value <= c);
    return grades[idx === -1 ? 3 : idx];
  }

  async function loadAirQuality() {
    const el = document.getElementById("airQuality");
    if (!el) return;
    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${OFFICE_LAT}&longitude=${OFFICE_LON}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;
      const res = await fetch(url);
      const cur = (await res.json()).current || {};
      const pm10 = dustGrade(cur.pm10, [30, 80, 150]);
      const pm25 = dustGrade(cur.pm2_5, [15, 35, 75]);
      if (!pm10 && !pm25) return;
      const chip = (name, g, v) =>
        g ? `<span class="air-chip air-chip--${g.cls}" title="${Math.round(v)}㎍/㎥">${name} ${g.label}</span>` : "";
      el.innerHTML = chip("미세먼지", pm10, cur.pm10) + chip("초미세먼지", pm25, cur.pm2_5);
    } catch (e) {
      // 미세먼지는 부가 정보라 못 불러와도 조용히 넘어간다
    }
  }

  document.addEventListener("layout:ready", loadWeather);
})();
