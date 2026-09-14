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

  let canvas, ctx;
  let state = "ready"; // ready | running | over
  let isLooping = false;
  let leaderboardOpen = false;

  let score = 0;
  let highScore = 0;
  let lives = 3;
  let speed = 6;
  let obstacles = [];
  let spawnTimer = 0;
  let nextSpawnIn = 70;
  let invincibleUntil = 0;
  let hitFlash = 0;
  let bgOffset1 = 0;
  let bgOffset2 = 0;
  let groundOffset = 0;
  let frame = 0;
  let playerName = "";
  let lastScoreId = null;

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

  /* ================= 배경 (서울 도심 실루엣, 패럴랙스) ================= */
  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#2b1f4a");
    grad.addColorStop(0.45, "#6b3f6b");
    grad.addColorStop(0.75, "#e8794f");
    grad.addColorStop(1, "#f5b942");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H - 40);
  }

  function drawBuildingLayer(offset, baseY, buildings, color, patternWidth) {
    const shift = offset % patternWidth;
    for (let rep = -1; rep <= Math.ceil(W / patternWidth) + 1; rep++) {
      const startX = rep * patternWidth - shift;
      buildings.forEach((b) => {
        ctx.fillStyle = color;
        ctx.fillRect(startX + b.x, baseY - b.h, b.w, b.h);
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

    // 인도 / 도로
    ctx.fillStyle = "#3a3a42";
    ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = "#55555f";
    ctx.fillRect(0, H - 40, W, 4);

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

  function drawBackground() {
    drawSky();
    drawTower(bgOffset1);
    drawBuildingLayer(bgOffset1, H - 40, FAR_BUILDINGS, "#3a2a52", 400);
    drawBuildingLayer(bgOffset2, H - 40, NEAR_BUILDINGS, "#241c38", 400);
    drawGroundAndWindows();
  }

  /* ================= 캐릭터 (캔버스 벡터 드로잉) ================= */
  function drawBee(x, y, wing, flashing) {
    if (flashing && frame % 6 < 3) return; // 피격 무적 시간 깜빡임

    ctx.save();
    ctx.translate(x, y);

    // 날개
    const flap = Math.sin(wing) * 10;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(-4, -10 - Math.abs(flap) * 0.3, 10, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, -10 - Math.abs(flap) * 0.3, 10, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // 몸통 (그라데이션으로 입체감)
    const bodyGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 18);
    bodyGrad.addColorStop(0, "#ffe066");
    bodyGrad.addColorStop(1, "#f5b400");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // 줄무늬
    ctx.fillStyle = "#2b2b2b";
    [-6, 1, 8].forEach((sx) => {
      ctx.beginPath();
      ctx.ellipse(sx, 0, 2.4, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // 얼굴
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(11, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(12, -2, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // 침
    ctx.strokeStyle = "#5a3d00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 2);
    ctx.lineTo(20, 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawCat(x, y, bob) {
    ctx.save();
    ctx.translate(x, y + bob);

    // 꼬리
    ctx.strokeStyle = "#5b4636";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-14, 4);
    ctx.quadraticCurveTo(-30, -4 + Math.sin(frame / 8) * 6, -26, -16);
    ctx.stroke();

    // 몸통 그라데이션
    const bodyGrad = ctx.createRadialGradient(-5, -6, 3, 0, 0, 22);
    bodyGrad.addColorStop(0, "#8a6a52");
    bodyGrad.addColorStop(1, "#5b4636");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2, 17, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // 귀
    ctx.fillStyle = "#5b4636";
    ctx.beginPath();
    ctx.moveTo(6, -12);
    ctx.lineTo(10, -22);
    ctx.lineTo(15, -11);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2, -13);
    ctx.lineTo(-1, -23);
    ctx.lineTo(6, -13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f2b6c6";
    ctx.beginPath();
    ctx.moveTo(8, -13);
    ctx.lineTo(10.5, -19);
    ctx.lineTo(13, -13);
    ctx.closePath();
    ctx.fill();

    // 얼굴 (화난 표정)
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(10, -4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(11, -4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, -9);
    ctx.lineTo(9, -7);
    ctx.stroke();

    // 수염
    ctx.beginPath();
    ctx.moveTo(14, -2);
    ctx.lineTo(24, -4);
    ctx.moveTo(14, 1);
    ctx.lineTo(24, 2);
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
    spawnTimer = 0;
    nextSpawnIn = randSpawnGap();
    bee.x = 120;
    bee.y = (PLAY_TOP + PLAY_BOTTOM) / 2;
    bee.vx = 0;
    bee.vy = 0;
    invincibleUntil = 0;
    hitFlash = 0;
    updateLivesLabel();
  }

  function randSpawnGap() {
    const base = Math.max(38, 78 - speed * 2.6);
    return base + Math.random() * 34;
  }

  function spawnObstacle() {
    const def = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    const y = PLAY_TOP + Math.random() * (PLAY_BOTTOM - PLAY_TOP - def.h);
    obstacles.push({ ...def, x: W, y });
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

  function update() {
    frame++;
    bee.wing += 0.9;
    applyMovement();

    speed = Math.min(6 + score * 0.012, 14);
    score += speed * 0.05;

    bgOffset1 += speed * 0.25;
    bgOffset2 += speed * 0.55;
    groundOffset += speed;

    cat.x = bee.x - (110 - Math.min(speed - 6, 8) * 6);
    cat.y += (bee.y - cat.y) * 0.06;

    spawnTimer++;
    if (spawnTimer >= nextSpawnIn) {
      spawnObstacle();
      spawnTimer = 0;
      nextSpawnIn = randSpawnGap();
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= speed;
      if (obstacles[i].x + obstacles[i].w < 0) obstacles.splice(i, 1);
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

  function draw() {
    drawBackground();

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
