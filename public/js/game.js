(function () {
  const W = 800;
  const H = 360;
  const PLAY_TOP = 50;
  const PLAY_BOTTOM = H - 55;
  const PLAY_LEFT = 20;
  const PLAY_RIGHT = 340;
  const ACCEL = 0.6;
  const MAX_SPEED = 4.6;
  const FRICTION = 0.86;
  const INVINCIBLE_MS = 1300;
  const HIGH_SCORE_KEY = "hbaf-bee-game-high";
  const NAME_KEY = "hbaf-bee-game-name";
  const MUTE_KEY = "hbaf-bee-game-muted";

  const OBSTACLE_TYPES = [
    { type: "cone", emoji: "🚧", w: 30, h: 30 },
    { type: "pigeon", emoji: "🕊️", w: 28, h: 24 },
    { type: "tree", emoji: "🌳", w: 34, h: 38 },
    { type: "signal", emoji: "🚦", w: 22, h: 40 },
    { type: "coffee", emoji: "☕", w: 24, h: 24 },
  ];

  // 점수 구간별로 새 패턴이 열리며 갈수록 어려워진다 (흔들리는 장애물, 동시 스폰 등)
  const STAGE_THRESHOLDS = [0, 220, 480, 820, 1300, 1900];
  const STAGE_LABELS = ["", "속도 UP!", "장애물이 흔들려요!", "장애물 2연타!", "더 빨라졌다!", "극한 모드!!"];

  let canvas, ctx;
  let state = "ready"; // ready | running | over
  let isLooping = false;
  let leaderboardOpen = false;

  let score = 0;
  let highScore = 0;
  let lives = 3;
  let speed = 6;
  let obstacles = [];
  let particles = [];
  let spawnTimer = 0;
  let nextSpawnIn = 70;
  let invincibleUntil = 0;
  let hitFlash = 0;
  let bgOffset1 = 0;
  let bgOffset2 = 0;
  let cloudOffset = 0;
  let groundOffset = 0;
  let frame = 0;
  let playerName = "";
  let lastScoreId = null;
  let stageIdx = 0;
  let stageToastUntil = 0;
  let stageToastText = "";

  const bee = { x: 120, y: 180, vx: 0, vy: 0, w: 30, h: 22, wing: 0 };
  const cat = { x: 60, y: 180, gap: 110 };
  const input = { up: false, down: false, left: false, right: false };

  /* ================= 오디오 (Web Audio 기반 오리지널 추격 BGM) ================= */
  let audioCtx = null;
  let masterGain = null;
  let musicTimer = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (e) {}

  const MOTIF = [220, 220, 174.6, 220, 261.6, 220, 174.6, 130.8];
  let motifIdx = 0;

  function ensureAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.16;
    masterGain.connect(audioCtx.destination);
  }

  function playNote(freq, dur) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.9, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }

  function scheduleMusic() {
    if (!audioCtx) return;
    const tempo = Math.max(140, 320 - speed * 12); // 속도가 빠를수록 BGM도 빨라짐
    playNote(MOTIF[motifIdx % MOTIF.length], tempo / 1000 + 0.05);
    motifIdx++;
    musicTimer = setTimeout(scheduleMusic, tempo);
  }

  function startMusic() {
    ensureAudio();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (musicTimer) return;
    motifIdx = 0;
    scheduleMusic();
  }

  function stopMusic() {
    if (musicTimer) clearTimeout(musicTimer);
    musicTimer = null;
  }

  function toggleMute() {
    muted = !muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (e) {}
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.16;
    updateMuteBtn();
  }

  function updateMuteBtn() {
    const btn = document.getElementById("gameMuteBtn");
    if (btn) btn.textContent = muted ? "🔇" : "🔊";
  }

  /* ================= 배경 (서울 도심 실루엣, 패럴랙스 + 입체 음영) ================= */
  function shadeColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + Math.round(255 * percent);
    let g = ((num >> 8) & 0xff) + Math.round(255 * percent);
    let b = (num & 0xff) + Math.round(255 * percent);
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  }

  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#2b1f4a");
    grad.addColorStop(0.45, "#6b3f6b");
    grad.addColorStop(0.75, "#e8794f");
    grad.addColorStop(1, "#f5b942");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H - 40);
  }

  const STARS = Array.from({ length: 36 }, (_, i) => ({
    x: (i * 137) % W,
    y: (i * 53) % (H * 0.4),
    r: 0.6 + ((i * 7) % 5) * 0.25,
    phase: i,
  }));

  function drawStars() {
    STARS.forEach((s) => {
      const tw = 0.5 + 0.5 * Math.sin(frame / 20 + s.phase);
      ctx.fillStyle = `rgba(255,255,255,${(0.25 + tw * 0.55).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawMoon() {
    const mx = W - 90;
    const my = 56;
    ctx.save();
    const glow = ctx.createRadialGradient(mx, my, 4, mx, my, 42);
    glow.addColorStop(0, "rgba(255, 246, 214, 0.45)");
    glow.addColorStop(1, "rgba(255, 246, 214, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(mx, my, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff6d6";
    ctx.beginPath();
    ctx.arc(mx, my, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(232, 121, 79, 0.35)";
    ctx.beginPath();
    ctx.arc(mx + 7, my - 4, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawClouds(offset) {
    const shapes = [
      { x: 40, y: 40, s: 1 },
      { x: 260, y: 70, s: 0.7 },
      { x: 480, y: 30, s: 0.9 },
      { x: 640, y: 90, s: 0.6 },
    ];
    const patternWidth = 760;
    const shift = offset % patternWidth;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let rep = -1; rep <= Math.ceil(W / patternWidth) + 1; rep++) {
      const startX = rep * patternWidth - shift;
      shapes.forEach((c) => {
        const cx = startX + c.x;
        const cy = c.y;
        const s = c.s;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 26 * s, 10 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 18 * s, cy + 3 * s, 18 * s, 8 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - 16 * s, cy + 4 * s, 16 * s, 7 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // 건물마다 좌측 하이라이트 / 우측 그림자를 넣어 입체적으로 각진 느낌을 준다
  function drawBuildingLayer(offset, baseY, buildings, color, patternWidth) {
    const shift = offset % patternWidth;
    const light = shadeColor(color, 0.16);
    const dark = shadeColor(color, -0.18);
    for (let rep = -1; rep <= Math.ceil(W / patternWidth) + 1; rep++) {
      const startX = rep * patternWidth - shift;
      buildings.forEach((b) => {
        const bx = startX + b.x;
        const by = baseY - b.h;
        const edge = Math.max(2, b.w * 0.16);
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, b.w, b.h);
        ctx.fillStyle = light;
        ctx.fillRect(bx, by, edge, b.h);
        ctx.fillStyle = dark;
        ctx.fillRect(bx + b.w - edge, by, edge, b.h);
        // 옥상 하이라이트 라인 (위에서 비치는 달빛)
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(bx, by, b.w, 2);
      });
    }
  }

  const FAR_BUILDINGS = [
    { x: 10, w: 40, h: 90 },
    { x: 60, w: 26, h: 60 },
    { x: 100, w: 34, h: 120 },
    { x: 150, w: 20, h: 70 },
    { x: 190, w: 46, h: 100 },
    { x: 250, w: 30, h: 65 },
    { x: 300, w: 24, h: 85 },
    { x: 340, w: 40, h: 110 },
  ];
  const NEAR_BUILDINGS = [
    { x: 0, w: 50, h: 70 },
    { x: 60, w: 34, h: 110 },
    { x: 105, w: 44, h: 60 },
    { x: 160, w: 28, h: 95 },
    { x: 200, w: 60, h: 80 },
    { x: 270, w: 36, h: 130 },
    { x: 320, w: 40, h: 70 },
  ];

  function drawTower(offset) {
    // 남산타워 느낌의 실루엣 랜드마크 (patternWidth 800 반복)
    const x = ((900 - (offset % 900)) % 900) - 50;
    const baseY = H - 40 - 60;
    ctx.fillStyle = "#241a3d";
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + 6, baseY - 70);
    ctx.lineTo(x + 10, baseY - 70);
    ctx.lineTo(x + 16, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 13, baseY - 78, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // 원경/근경 레이어 사이에 안개(대기원근법)를 살짝 깔아 거리감을 강조한다
  function drawHaze() {
    const grad = ctx.createLinearGradient(0, H - 190, 0, H - 40);
    grad.addColorStop(0, "rgba(232, 121, 79, 0)");
    grad.addColorStop(1, "rgba(232, 121, 79, 0.2)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, H - 190, W, 150);
  }

  function drawGroundAndWindows() {
    // 근경 빌딩 창문
    ctx.fillStyle = "rgba(255, 230, 140, 0.55)";
    const shift = bgOffset2 % 400;
    for (let rep = -1; rep <= Math.ceil(W / 400) + 1; rep++) {
      const startX = rep * 400 - shift;
      NEAR_BUILDINGS.forEach((b) => {
        const winY = H - 40 - b.h + 10;
        for (let wy = winY; wy < H - 46; wy += 14) {
          for (let wx = startX + b.x + 4; wx < startX + b.x + b.w - 4; wx += 10) {
            if ((Math.floor(wx) + Math.floor(wy)) % 23 < 14) {
              ctx.fillRect(wx, wy, 4, 6);
            }
          }
        }
      });
    }

    // 인도 / 도로 (그라데이션으로 깊이감)
    const roadGrad = ctx.createLinearGradient(0, H - 40, 0, H);
    roadGrad.addColorStop(0, "#4c4c57");
    roadGrad.addColorStop(1, "#28282f");
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = "#66666f";
    ctx.fillRect(0, H - 40, W, 3);

    // 도로에 은은하게 비치는 불빛 반사
    ctx.fillStyle = "rgba(255, 230, 140, 0.06)";
    for (let i = 0; i < 6; i++) {
      const rx = ((i * 160 - groundOffset * 1.4) % (W + 160)) - 80;
      ctx.fillRect(rx, H - 36, 40, 20);
    }

    ctx.strokeStyle = "#e8c85a";
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 18]);
    ctx.lineDashOffset = -groundOffset;
    ctx.beginPath();
    ctx.moveTo(0, H - 20);
    ctx.lineTo(W, H - 20);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 화면 가장자리를 살짝 어둡게 눌러 카메라 렌즈 같은 깊이감을 준다
  function drawVignette() {
    const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.95);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBackground() {
    drawSky();
    drawStars();
    drawMoon();
    drawClouds(cloudOffset);
    drawTower(bgOffset1);
    drawBuildingLayer(bgOffset1, H - 40, FAR_BUILDINGS, "#3a2a52", 400);
    drawHaze();
    drawBuildingLayer(bgOffset2, H - 40, NEAR_BUILDINGS, "#241c38", 400);
    drawGroundAndWindows();
    drawVignette();
  }

  /* ================= 캐릭터 (실제 사무실 고양이를 참고한 애니메이션 캐릭터) ================= */
  // 눈을 깜빡이는 타이밍을 캐릭터별로 다르게 줘서 둘이 똑같이 움직이지 않게 한다.
  function blinkAmount(offset) {
    const t = (frame + offset) % 170;
    if (t > 8) return 1;
    return 0.12 + 0.88 * Math.abs(Math.sin((t / 8) * Math.PI * 0.5));
  }

  function drawLegs(kick, spread, color) {
    ctx.fillStyle = color;
    [-1, 1].forEach((side) => {
      const swing = Math.sin(kick + (side < 0 ? Math.PI : 0)) * 6;
      ctx.beginPath();
      ctx.ellipse(side * spread, 13 + Math.max(0, swing * 0.4), 3.2, 6, side * 0.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // "베프" 룩: 은회색 고등어 태비 + 크고 또렷한 초록 눈, 놀라서 도망가는 중
  function drawBee(x, y, wing, flashing) {
    if (flashing && frame % 6 < 3) return; // 피격 무적 시간 깜빡임

    const bob = Math.sin(wing) * 3;
    const squash = 1 + Math.sin(wing) * 0.05;

    ctx.save();
    ctx.translate(x, y + bob);

    // 은은한 발광 + 속도선 (다급하게 도망치는 느낌)
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    glow.addColorStop(0, "rgba(214, 235, 255, 0.32)");
    glow.addColorStop(1, "rgba(214, 235, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, -5);
    ctx.lineTo(-30, -5);
    ctx.moveTo(-19, 5);
    ctx.lineTo(-28, 5);
    ctx.stroke();

    // 그림자
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(0, 19, 13, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 다리 (달리는 동작)
    drawLegs(wing, 7, "#9aa0a6");

    // 꼬리
    ctx.strokeStyle = "#b7bcc2";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-11, 4);
    ctx.quadraticCurveTo(-24, -2 + Math.sin(wing * 0.7) * 5, -19, -13);
    ctx.stroke();

    // 몸통 (은회색 그라데이션, 통통한 치비 비율)
    ctx.scale(squash, 1 / squash);
    const bodyGrad = ctx.createRadialGradient(-5, -6, 2, 0, 0, 20);
    bodyGrad.addColorStop(0, "#e4e6e8");
    bodyGrad.addColorStop(1, "#aeb3b8");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2, 15, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // 태비 줄무늬
    ctx.strokeStyle = "#8b9096";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    [
      [-6, -6, -4, 4],
      [1, -7, 2, 4],
    ].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2 + 1.5, (y1 + y2) / 2, x2, y2);
      ctx.stroke();
    });

    // 흰색 턱/가슴 패치
    ctx.fillStyle = "#f6f5f0";
    ctx.beginPath();
    ctx.ellipse(8, 5, 6, 6.5, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // 귀 (쫑긋)
    ctx.fillStyle = "#aeb3b8";
    ctx.beginPath();
    ctx.moveTo(4, -11);
    ctx.lineTo(6, -21);
    ctx.lineTo(12, -10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, -12);
    ctx.lineTo(-4, -22);
    ctx.lineTo(3, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f2c3cd";
    ctx.beginPath();
    ctx.moveTo(6, -12);
    ctx.lineTo(7.6, -17.5);
    ctx.lineTo(10, -11.5);
    ctx.closePath();
    ctx.fill();

    // 얼굴 - 크고 또렷한 초록 눈 (깜빡임)
    const blink = blinkAmount(0);
    ctx.save();
    ctx.translate(9, -3);
    ctx.scale(1, Math.max(0.08, blink));
    ctx.fillStyle = "#eef3e0";
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const eyeGrad = ctx.createRadialGradient(0.5, -0.5, 0.5, 0, 0, 4);
    eyeGrad.addColorStop(0, "#a8e06a");
    eyeGrad.addColorStop(1, "#4f9a2c");
    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#152110";
    ctx.beginPath();
    ctx.ellipse(0.6, 0, 1.3, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(-1, -1.6, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 코 & 입
    ctx.fillStyle = "#e6939f";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(16.6, 0);
    ctx.lineTo(15.3, 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(15.3, 1.6);
    ctx.lineTo(15.3, 3);
    ctx.stroke();

    // 수염
    ctx.strokeStyle = "rgba(60,60,60,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(24, -3);
    ctx.moveTo(13, 2.5);
    ctx.lineTo(24, 3);
    ctx.stroke();

    ctx.restore();
  }

  // "바프" 룩: 회갈색 통통한 고양이, 졸린 듯 매서운 눈으로 바짝 추격 중
  function drawCat(x, y, bob) {
    const kick = frame / 7;

    ctx.save();
    ctx.translate(x, y + bob);

    // 그림자
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 23, 17, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 다리 (달리는 동작)
    drawLegs(kick, 9, "#6d5f50");

    // 꼬리
    ctx.strokeStyle = "#7a6a58";
    ctx.lineWidth = 6.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-15, 6);
    ctx.quadraticCurveTo(-32, -2 + Math.sin(frame / 8) * 7, -27, -18);
    ctx.stroke();

    // 몸통 그라데이션 (회갈색, 통통)
    const bodyGrad = ctx.createRadialGradient(-6, -7, 3, 0, 0, 24);
    bodyGrad.addColorStop(0, "#a08d78");
    bodyGrad.addColorStop(1, "#71614f");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 3, 19, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // 태비 줄무늬 (이마 M자 느낌)
    ctx.strokeStyle = "#544737";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    [
      [-9, -10, -7, 1],
      [-1, -12, 0, 2],
      [7, -10, 8, 1],
    ].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2 + 2, (y1 + y2) / 2, x2, y2);
      ctx.stroke();
    });

    // 크림색 턱/가슴 패치
    ctx.fillStyle = "#e9dfc9";
    ctx.beginPath();
    ctx.ellipse(10, 5, 7.5, 9, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // 귀 (둥글고 두툼한 British Shorthair 느낌)
    ctx.fillStyle = "#71614f";
    ctx.beginPath();
    ctx.ellipse(8, -15, 6, 7, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-4, -16, 6, 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c99b8f";
    ctx.beginPath();
    ctx.ellipse(8, -13, 3, 3.6, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-3.5, -14, 3, 3.6, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // 얼굴 - 졸린 듯 매서운 눈 (반쯤 깜빡)
    const blink = Math.min(blinkAmount(90), 0.55);
    ctx.save();
    ctx.translate(11, -4);
    ctx.scale(1, Math.max(0.1, blink));
    ctx.fillStyle = "#f0ead0";
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    const eyeGrad2 = ctx.createRadialGradient(0.5, 0, 0.4, 0, 0, 3.4);
    eyeGrad2.addColorStop(0, "#d9a45c");
    eyeGrad2.addColorStop(1, "#8a5a24");
    ctx.fillStyle = eyeGrad2;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1207";
    ctx.beginPath();
    ctx.ellipse(0.5, 0, 1, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 처진 눈매 라인 (졸리고 매서운 인상)
    ctx.strokeStyle = "#3a2e20";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(5, -8);
    ctx.lineTo(11, -6);
    ctx.stroke();

    // 코 & 입
    ctx.fillStyle = "#d99a8c";
    ctx.beginPath();
    ctx.moveTo(17, -1);
    ctx.lineTo(20, -1);
    ctx.lineTo(18.5, 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3a2e20";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(18.5, 1);
    ctx.lineTo(18.5, 2.6);
    ctx.moveTo(18.5, 2.6);
    ctx.quadraticCurveTo(16, 4.4, 14, 2.6);
    ctx.moveTo(18.5, 2.6);
    ctx.quadraticCurveTo(21, 4.4, 23, 2.6);
    ctx.stroke();

    // 수염
    ctx.strokeStyle = "rgba(50,40,30,0.55)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(16, -1);
    ctx.lineTo(28, -5);
    ctx.moveTo(16, 2);
    ctx.lineTo(28, 2);
    ctx.moveTo(16, 4);
    ctx.lineTo(27, 7);
    ctx.stroke();

    ctx.restore();
  }

  /* ================= 게임 로직 ================= */
  function isGameViewActive() {
    const v = document.getElementById("view-game");
    return !!v && v.classList.contains("active");
  }

  function resetGame() {
    score = 0;
    speed = 6;
    lives = 3;
    obstacles = [];
    particles = [];
    spawnTimer = 0;
    stageIdx = 0;
    stageToastUntil = 0;
    nextSpawnIn = randSpawnGap();
    bee.x = 120;
    bee.y = (PLAY_TOP + PLAY_BOTTOM) / 2;
    bee.vx = 0;
    bee.vy = 0;
    invincibleUntil = 0;
    hitFlash = 0;
    updateLivesLabel();
  }

  function currentStage() {
    for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
      if (score >= STAGE_THRESHOLDS[i]) return i;
    }
    return 0;
  }

  function randSpawnGap() {
    const base = Math.max(26, 78 - speed * 2.6 - stageIdx * 2.5);
    return base + Math.random() * 34;
  }

  function makeObstacle(x, stage) {
    const def = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    const y = PLAY_TOP + Math.random() * (PLAY_BOTTOM - PLAY_TOP - def.h);
    const bobChance = stage >= 1 ? 0.35 + stage * 0.1 : 0;
    return {
      ...def,
      x,
      y,
      baseY: y,
      bob: Math.random() < bobChance,
      bobAmp: 10 + Math.min(stage, 4) * 4,
      bobFreq: 0.035 + Math.min(stage, 4) * 0.01,
      bobPhase: Math.random() * Math.PI * 2,
    };
  }

  function spawnObstacle() {
    const stage = currentStage();
    const first = makeObstacle(W, stage);
    obstacles.push(first);

    // 3단계부터는 가끔 장애물을 동시에 두 개 띄워 긴박감을 더한다
    if (stage >= 2 && Math.random() < 0.16 + stage * 0.06) {
      const second = makeObstacle(W + 50, stage);
      if (Math.abs(second.y - first.y) < 55) {
        second.y = second.y > (PLAY_TOP + PLAY_BOTTOM) / 2 ? PLAY_TOP + 2 : PLAY_BOTTOM - second.h - 2;
        second.baseY = second.y;
      }
      obstacles.push(second);
    }
  }

  function getBeeHitbox() {
    return { x: bee.x - bee.w / 2 + 5, y: bee.y - bee.h / 2 + 4, w: bee.w - 10, h: bee.h - 8 };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function updateLivesLabel() {
    const el = document.getElementById("gameLivesLabel");
    if (el) el.textContent = "❤️".repeat(Math.max(lives, 0)) + "🖤".repeat(3 - Math.max(lives, 0));
  }

  function applyMovement() {
    if (input.up) bee.vy -= ACCEL;
    if (input.down) bee.vy += ACCEL;
    if (input.left) bee.vx -= ACCEL;
    if (input.right) bee.vx += ACCEL;

    bee.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, bee.vx));
    bee.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, bee.vy));

    bee.x += bee.vx;
    bee.y += bee.vy;

    bee.vx *= FRICTION;
    bee.vy *= FRICTION;

    if (bee.x < PLAY_LEFT) {
      bee.x = PLAY_LEFT;
      bee.vx = 0;
    }
    if (bee.x > PLAY_RIGHT) {
      bee.x = PLAY_RIGHT;
      bee.vx = 0;
    }
    if (bee.y < PLAY_TOP) {
      bee.y = PLAY_TOP;
      bee.vy = 0;
    }
    if (bee.y > PLAY_BOTTOM) {
      bee.y = PLAY_BOTTOM;
      bee.vy = 0;
    }
  }

  function triggerHit() {
    lives--;
    updateLivesLabel();
    hitFlash = 12;
    invincibleUntil = performance.now() + INVINCIBLE_MS;
    bee.x = Math.max(PLAY_LEFT, bee.x - 24);
    if (lives <= 0) {
      gameOver();
    }
  }

  function spawnDust() {
    if (Math.abs(bee.vx) + Math.abs(bee.vy) < 0.7) return;
    particles.push({
      x: bee.x - 13,
      y: bee.y + 5 + (Math.random() * 8 - 4),
      vx: -1.3 - Math.random() * 1.1 - Math.max(0, bee.vx * -0.4),
      vy: (Math.random() - 0.5) * 0.7,
      life: 0,
      maxLife: 20 + Math.random() * 12,
      r: 1.4 + Math.random() * 1.6,
    });
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      if (p.life > p.maxLife) particles.splice(i, 1);
    }
  }

  function update() {
    frame++;
    bee.wing += 0.9;
    applyMovement();
    if (frame % 2 === 0) spawnDust();
    updateParticles();

    const prevStage = stageIdx;
    speed = Math.min(6 + score * 0.01, 20);
    score += speed * 0.05;
    stageIdx = currentStage();
    if (stageIdx > prevStage) {
      stageToastUntil = performance.now() + 1500;
      stageToastText = STAGE_LABELS[stageIdx] || "난이도 상승!";
    }

    bgOffset1 += speed * 0.25;
    bgOffset2 += speed * 0.55;
    cloudOffset += speed * 0.12;
    groundOffset += speed;

    cat.x = bee.x - (110 - Math.min(speed - 6, 14) * 5);
    cat.y += (bee.y - cat.y) * 0.06;

    spawnTimer++;
    if (spawnTimer >= nextSpawnIn) {
      spawnObstacle();
      spawnTimer = 0;
      nextSpawnIn = randSpawnGap();
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= speed;
      if (o.bob) {
        o.y = Math.max(PLAY_TOP, Math.min(PLAY_BOTTOM - o.h, o.baseY + Math.sin(frame * o.bobFreq + o.bobPhase) * o.bobAmp));
      }
      if (o.x + o.w < 0) obstacles.splice(i, 1);
    }

    const invincible = performance.now() < invincibleUntil;
    if (!invincible) {
      const hitbox = getBeeHitbox();
      for (const o of obstacles) {
        if (rectsOverlap(hitbox, o)) {
          triggerHit();
          break;
        }
      }
    }

    if (hitFlash > 0) hitFlash--;
  }

  function drawParticles() {
    particles.forEach((p) => {
      const t = 1 - p.life / p.maxLife;
      ctx.fillStyle = `rgba(255,255,255,${(t * 0.5).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.r * t), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawStageToast() {
    const now = performance.now();
    if (now >= stageToastUntil) return;
    const remain = stageToastUntil - now;
    const alpha = Math.min(1, remain / 300, (1500 - remain) / 200 + 0.001);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '900 26px "Baloo 2", "Noto Sans KR", sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#3a2412";
    ctx.strokeText(stageToastText, W / 2, 90);
    ctx.fillStyle = "#ffc700";
    ctx.fillText(stageToastText, W / 2, 90);
    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawParticles();

    if (hitFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${hitFlash / 40})`;
      ctx.fillRect(0, 0, W, H);
    }

    const catBob = Math.sin(frame / 8) * 3;
    drawCat(cat.x, cat.y, catBob);

    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (const o of obstacles) {
      ctx.font = `${o.h}px sans-serif`;
      ctx.fillText(o.emoji, o.x + o.w / 2, o.y);
    }

    const invincible = performance.now() < invincibleUntil;
    drawBee(bee.x, bee.y, bee.wing, invincible);

    drawStageToast();

    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 16px "Noto Sans KR", sans-serif';
    ctx.fillText(`SCORE ${Math.floor(score)}`, W - 12, 12);

    updateScoreLabels();
  }

  function updateScoreLabels() {
    const scoreEl = document.getElementById("gameScoreLabel");
    const highEl = document.getElementById("gameHighLabel");
    if (scoreEl) scoreEl.textContent = Math.floor(score);
    if (highEl) highEl.textContent = highScore;
  }

  function loop() {
    if (state !== "running" || leaderboardOpen) {
      isLooping = false;
      return;
    }
    update();
    if (state !== "running") {
      draw();
      isLooping = false;
      return;
    }
    draw();
    if (isGameViewActive() && !leaderboardOpen) {
      requestAnimationFrame(loop);
    } else {
      isLooping = false;
    }
  }

  function startLoopIfNeeded() {
    if (!isLooping && state === "running" && !leaderboardOpen) {
      isLooping = true;
      requestAnimationFrame(loop);
    }
  }

  async function startGame() {
    const nameInput = document.getElementById("gamePlayerName");
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    playerName = name;
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch (e) {}

    resetGame();
    state = "running";
    document.getElementById("gameStartOverlay").hidden = true;
    document.getElementById("gameOverOverlay").hidden = true;
    startMusic();
    startLoopIfNeeded();
  }

  async function gameOver() {
    state = "over";
    stopMusic();
    const finalScore = Math.floor(score);
    if (finalScore > highScore) {
      highScore = finalScore;
      try {
        localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
      } catch (e) {}
    }
    document.getElementById("gameOverName").textContent = playerName;
    document.getElementById("gameFinalScore").textContent = finalScore;
    document.getElementById("gameFinalHigh").textContent = highScore;
    document.getElementById("gameOverOverlay").hidden = false;
    updateScoreLabels();

    try {
      const res = await fetch("/api/game-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName, score: finalScore }),
      });
      const record = await res.json();
      lastScoreId = record.id;
    } catch (e) {
      lastScoreId = null;
    }

    renderLeaderboard(document.getElementById("gameLeaderboardInline"));
  }

  function handlePrimaryAction() {
    if (state === "ready") startGame();
    else if (state === "over") startGame();
  }

  /* ================= 순위표 ================= */
  async function fetchLeaderboard() {
    try {
      const res = await fetch("/api/game-scores?limit=10");
      return await res.json();
    } catch (e) {
      return [];
    }
  }

  async function renderLeaderboard(container) {
    if (!container) return;
    const list = await fetchLeaderboard();
    if (!list.length) {
      container.innerHTML = `<p class="empty-state">아직 기록이 없습니다. 첫 기록의 주인공이 되어보세요!</p>`;
      return;
    }
    container.innerHTML = `
      <table>
        <tr><th>#</th><th>이름</th><th>점수</th></tr>
        ${list
          .map(
            (r, i) => `
            <tr class="${r.id === lastScoreId ? "is-me" : ""}">
              <td>${i + 1}</td>
              <td>${escapeHtml(r.name)}</td>
              <td>${r.score}</td>
            </tr>`
          )
          .join("")}
      </table>
    `;
  }

  let leaderboardPollTimer = null;

  function openLeaderboardOverlay() {
    leaderboardOpen = true;
    ["gameStartOverlay", "gameOverOverlay"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el.hidden) el.dataset.wasVisible = "1";
      el.hidden = true;
    });
    document.getElementById("gameLeaderboardOverlay").hidden = false;
    renderLeaderboard(document.getElementById("gameLeaderboardFull"));
    leaderboardPollTimer = setInterval(() => {
      renderLeaderboard(document.getElementById("gameLeaderboardFull"));
    }, 5000);
  }

  function closeLeaderboardOverlay() {
    leaderboardOpen = false;
    document.getElementById("gameLeaderboardOverlay").hidden = true;
    ["gameStartOverlay", "gameOverOverlay"].forEach((id) => {
      const el = document.getElementById(id);
      if (el.dataset.wasVisible) {
        el.hidden = false;
        delete el.dataset.wasVisible;
      }
    });
    if (leaderboardPollTimer) clearInterval(leaderboardPollTimer);
    leaderboardPollTimer = null;
    startLoopIfNeeded();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  /* ================= 입력 처리 ================= */
  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (!isGameViewActive()) return;
      const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
      if (map[e.key]) {
        input[map[e.key]] = true;
        e.preventDefault();
      }
      if (e.code === "Space" || e.code === "Enter") {
        if (state !== "running") handlePrimaryAction();
        e.preventDefault();
      }
    });
    document.addEventListener("keyup", (e) => {
      const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
      if (map[e.key]) input[map[e.key]] = false;
    });
  }

  function bindDpad() {
    document.querySelectorAll(".game-dpad__btn").forEach((btn) => {
      const dir = btn.dataset.dir;
      const press = (e) => {
        e.preventDefault();
        input[dir] = true;
      };
      const release = () => {
        input[dir] = false;
      };
      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointerleave", release);
      btn.addEventListener("pointercancel", release);
    });
  }

  function initGame() {
    canvas = document.getElementById("gameCanvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");

    try {
      highScore = Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
      const savedName = localStorage.getItem(NAME_KEY);
      if (savedName) document.getElementById("gamePlayerName").value = savedName;
    } catch (e) {
      highScore = 0;
    }
    updateScoreLabels();
    updateLivesLabel();
    updateMuteBtn();

    bee.y = (PLAY_TOP + PLAY_BOTTOM) / 2;
    drawBackground();
    drawCat(cat.x, cat.y, 0);
    drawBee(bee.x, bee.y, 0, false);

    canvas.addEventListener("pointerdown", () => {
      if (state !== "running") handlePrimaryAction();
    });
    document.getElementById("gameStartBtn").addEventListener("click", startGame);
    document.getElementById("gameRestartBtn").addEventListener("click", startGame);
    document.getElementById("gamePlayerName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") startGame();
    });

    document.getElementById("gameMuteBtn").addEventListener("click", toggleMute);
    document.getElementById("gameLeaderboardBtn").addEventListener("click", openLeaderboardOverlay);
    document.getElementById("gameLeaderboardCloseBtn").addEventListener("click", closeLeaderboardOverlay);

    bindKeyboard();
    bindDpad();

    document.addEventListener("view:changed", (e) => {
      if (e.detail.view === "game") {
        startLoopIfNeeded();
      } else {
        input.up = input.down = input.left = input.right = false;
      }
    });
  }

  document.addEventListener("layout:ready", initGame);
})();
