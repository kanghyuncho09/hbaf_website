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
          <div class="weather__temp">${Math.round(cur.temperature_2m)}°C</div>
          <div class="weather__label">${info.label} · 습도 ${cur.relative_humidity_2m}%</div>
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<div class="weather__label">날씨 정보를 불러오지 못했습니다.</div>`;
    }
  }

  document.addEventListener("layout:ready", loadWeather);
})();
