// 홈 상단 인사말: "OOO님, 좋은 아침이에요" + 오늘 날짜
(function () {
  function render() {
    const now = new Date();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const dateEl = document.getElementById("homeDate");
    if (dateEl) {
      dateEl.textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;
    }

    const h = now.getHours();
    const phrase = h < 11 ? "좋은 아침이에요" : h < 18 ? "좋은 오후예요" : "오늘도 수고 많으셨어요";
    const name = typeof window.getUserName === "function" ? window.getUserName() : "";
    const greetEl = document.getElementById("homeGreeting");
    if (greetEl) greetEl.textContent = name ? `${name}님, ${phrase}` : phrase;
  }

  render();
  document.addEventListener("layout:ready", render);
})();
