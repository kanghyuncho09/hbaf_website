// 미니게임 · 냥냥 블록 쌓기 (떨어지는 블록 퍼즐)
// 바프·베프가 좋아하는 상자 블록을 돌리고 옮겨서 가로 한 줄을 꽉 채우면 사라진다.
// 줄을 지울수록 레벨이 올라 블록이 빨리 떨어지고, 맨 위까지 쌓이면 게임 오버.
(function () {
  const COLS = 10;
  const ROWS = 20;
  const CELL = 30;
  const BOARD_W = COLS * CELL; // 300
  const SIDE_X = BOARD_W + 16;
  const W = 480;
  const H = ROWS * CELL; // 600
  const GAME_ID = "block";
  const HIGH_SCORE_KEY = "hbaf-block-game-high";
  const NAME_KEY = "hbaf-bee-game-name";
  const MUTE_KEY = "hbaf-bee-game-muted";

  // 블록 모양 7종 (각 모양은 회전 상태를 계산해서 쓴다)
  const SHAPES = [
    { m: [[1, 1, 1, 1]], color: "#ffc700" },
    { m: [[1, 1], [1, 1]], color: "#ff9f43" },
    { m: [[0, 1, 0], [1, 1, 1]], color: "#a77bd9" },
    { m: [[1, 0, 0], [1, 1, 1]], color: "#4aa3df" },
    { m: [[0, 0, 1], [1, 1, 1]], color: "#f27da6" },
    { m: [[0, 1, 1], [1, 1, 0]], color: "#5cc48a" },
    { m: [[1, 1, 0], [0, 1, 1]], color: "#e6544c" },
  ];
  const LINE_POINTS = [0, 100, 300, 500, 800];

  let canvas, ctx;
  let state = "ready"; // ready | running | paused | over
  let leaderboardOpen = false;
  let board = [];
  let piece = null;
  let nextPiece = null;
  let bag = [];
  let score = 0;
  let highScore = 0;
  let lines = 0;
  let level = 1;
  let dropTimer = 0;
  let lastTime = 0;
  let rafId = null;
  let clearingRows = [];
  let clearAnim = 0;
  let playerName = "";
  let lastScoreId = null;
  let toastText = "";
  let toastUntil = 0;

  /* ================= 오디오 (짧은 효과음 + 잔잔한 BGM) ================= */
  let audioCtx = null;
  let masterGain = null;
  let musicTimer = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (e) {}

  const MOTIF = [392, 330, 392, 440, 392, 330, 294, 330, 349, 294, 349, 392, 349, 294, 262, 294];
  let motifIdx = 0;

  function ensureAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.12;
    masterGain.connect(audioCtx.destination);
  }

  function playNote(freq, dur, type, vol) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }

  function sfx(kind) {
    if (!audioCtx) return;
    if (kind === "rotate") playNote(660, 0.05, "square", 0.25);
    else if (kind === "lock") playNote(180, 0.08, "square", 0.35);
    else if (kind === "drop") playNote(120, 0.12, "sawtooth", 0.4);
    else if (kind === "clear") [523, 659, 784].forEach((f, i) => setTimeout(() => playNote(f, 0.12, "square", 0.4), i * 60));
    else if (kind === "over") [392, 330, 262, 196].forEach((f, i) => setTimeout(() => playNote(f, 0.2, "triangle", 0.6), i * 140));
  }

  function scheduleMusic() {
    if (!audioCtx) return;
    const tempo = Math.max(150, 300 - level * 12);
    if (state === "running") playNote(MOTIF[motifIdx % MOTIF.length], tempo / 1000, "triangle", 0.45);
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
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.12;
    updateMuteBtn();
  }

  function updateMuteBtn() {
    const btn = document.getElementById("gameMuteBtn");
    if (btn) btn.textContent = muted ? "🔇" : "🔊";
  }

  /* ================= 블록 / 보드 ================= */
  function emptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function rotateMatrix(m) {
    return m[0].map((_, c) => m.map((row) => row[c]).reverse());
  }

  function takeFromBag() {
    if (!bag.length) {
      bag = SHAPES.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    const s = SHAPES[bag.pop()];
    return { m: s.m.map((r) => r.slice()), color: s.color, x: 0, y: 0 };
  }

  function spawn() {
    piece = nextPiece || takeFromBag();
    nextPiece = takeFromBag();
    piece.x = Math.floor((COLS - piece.m[0].length) / 2);
    piece.y = 0;
    if (collides(piece.m, piece.x, piece.y)) gameOver();
  }

  function collides(m, px, py) {
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        const x = px + c;
        const y = py + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && board[y][x]) return true;
      }
    }
    return false;
  }

  function move(dx) {
    if (!piece || clearingRows.length) return;
    if (!collides(piece.m, piece.x + dx, piece.y)) piece.x += dx;
  }

  function rotate() {
    if (!piece || clearingRows.length) return;
    const rotated = rotateMatrix(piece.m);
    // 벽이나 다른 블록에 막히면 좌우로 살짝 밀어서 돌려본다
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(rotated, piece.x + kick, piece.y)) {
        piece.m = rotated;
        piece.x += kick;
        sfx("rotate");
        return;
      }
    }
  }

  function softDrop() {
    if (!piece || clearingRows.length) return;
    if (!collides(piece.m, piece.x, piece.y + 1)) {
      piece.y += 1;
      score += 1;
      updateScoreLabels();
    } else {
      lockPiece();
    }
    dropTimer = 0;
  }

  function hardDrop() {
    if (!piece || clearingRows.length) return;
    let dist = 0;
    while (!collides(piece.m, piece.x, piece.y + 1)) {
      piece.y += 1;
      dist++;
    }
    score += dist * 2;
    sfx("drop");
    lockPiece();
  }

  function ghostY() {
    let y = piece.y;
    while (!collides(piece.m, piece.x, y + 1)) y++;
    return y;
  }

  function lockPiece() {
    piece.m.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v && piece.y + r >= 0) board[piece.y + r][piece.x + c] = piece.color;
      })
    );
    piece = null;
    const full = [];
    board.forEach((row, r) => {
      if (row.every(Boolean)) full.push(r);
    });
    if (full.length) {
      clearingRows = full;
      clearAnim = 0;
      sfx("clear");
    } else {
      sfx("lock");
      spawn();
    }
    updateScoreLabels();
  }

  function finishClear() {
    const n = clearingRows.length;
    board = board.filter((_, r) => !clearingRows.includes(r));
    while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
    clearingRows = [];
    score += LINE_POINTS[n] * level;
    lines += n;
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel > level) {
      level = newLevel;
      showToast(`레벨 ${level}! 더 빨라져요`);
    } else if (n === 4) {
      showToast("냥냥 4줄 콤보!! 🐾");
    }
    updateScoreLabels();
    spawn();
  }

  function dropInterval() {
    return Math.max(70, 800 - (level - 1) * 65);
  }

  function showToast(text) {
    toastText = text;
    toastUntil = performance.now() + 1400;
  }

  /* ================= 그리기 ================= */
  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function drawPaw(x, y, size, color) {
    ctx.fillStyle = color;
    const s = size;
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.18, s * 0.26, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    [[-0.26, -0.12], [-0.09, -0.26], [0.09, -0.26], [0.26, -0.12]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawCell(x, y, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const px = x * CELL;
    const py = y * CELL;
    ctx.fillStyle = color;
    roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 6);
    ctx.fill();
    ctx.fillStyle = shade(color, 18);
    roundRect(px + 3, py + 3, CELL - 6, (CELL - 6) / 2.4, 4);
    ctx.fill();
    drawPaw(px + CELL / 2, py + CELL / 2 + 2, CELL * 0.62, shade(color, -22));
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBoardBg() {
    ctx.fillStyle = "#fffae8";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(0, 0, BOARD_W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL + 0.5, 0);
      ctx.lineTo(c * CELL + 0.5, H);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL + 0.5);
      ctx.lineTo(BOARD_W, r * CELL + 0.5);
      ctx.stroke();
    }
  }

  function drawSide() {
    ctx.fillStyle = "#212121";
    ctx.font = "700 15px 'Noto Sans KR', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("다음 블록", SIDE_X, 30);

    ctx.fillStyle = "#ffffff";
    roundRect(SIDE_X, 42, 148, 100, 12);
    ctx.fill();
    ctx.strokeStyle = "#212121";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (nextPiece) {
      const m = nextPiece.m;
      const s = 24;
      const ox = SIDE_X + (148 - m[0].length * s) / 2;
      const oy = 42 + (100 - m.length * s) / 2;
      m.forEach((row, r) =>
        row.forEach((v, c) => {
          if (!v) return;
          ctx.save();
          ctx.translate(ox + c * s, oy + r * s);
          ctx.scale(s / CELL, s / CELL);
          drawCell(0, 0, nextPiece.color);
          ctx.restore();
        })
      );
    }

    const stats = [
      ["레벨", level],
      ["지운 줄", lines],
      ["점수", score],
    ];
    stats.forEach(([label, val], i) => {
      const y = 180 + i * 62;
      ctx.fillStyle = "#767676";
      ctx.font = "500 13px 'Noto Sans KR', sans-serif";
      ctx.fillText(label, SIDE_X, y);
      ctx.fillStyle = "#212121";
      ctx.font = "800 26px 'Baloo 2', 'Noto Sans KR', sans-serif";
      ctx.fillText(String(val), SIDE_X, y + 30);
    });

    ctx.fillStyle = "#767676";
    ctx.font = "500 12px 'Noto Sans KR', sans-serif";
    ["← → 이동", "↑ 회전", "↓ 천천히 내리기", "Space 바로 떨어뜨리기", "P 일시정지"].forEach((t, i) => {
      ctx.fillText(t, SIDE_X, 400 + i * 22);
    });

    // 구석에서 지켜보는 고양이
    drawCatFace(SIDE_X + 74, 555);
  }

  function drawCatFace(cx, cy) {
    ctx.save();
    ctx.fillStyle = "#ffc700";
    ctx.strokeStyle = "#212121";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy - 8);
    ctx.lineTo(cx - 24, cy - 38);
    ctx.lineTo(cx - 8, cy - 22);
    ctx.lineTo(cx + 8, cy - 22);
    ctx.lineTo(cx + 24, cy - 38);
    ctx.lineTo(cx + 30, cy - 8);
    ctx.quadraticCurveTo(cx + 32, cy + 22, cx, cy + 24);
    ctx.quadraticCurveTo(cx - 32, cy + 22, cx - 30, cy - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const blink = Math.floor(performance.now() / 180) % 22 === 0;
    ctx.fillStyle = "#212121";
    if (blink) {
      ctx.fillRect(cx - 15, cy - 2, 9, 2.5);
      ctx.fillRect(cx + 6, cy - 2, 9, 2.5);
    } else {
      ctx.beginPath();
      ctx.arc(cx - 11, cy - 1, 3.5, 0, Math.PI * 2);
      ctx.arc(cx + 11, cy - 1, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy + 7);
    ctx.lineTo(cx + 3, cy + 7);
    ctx.lineTo(cx, cy + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    drawBoardBg();
    const flashOn = Math.floor(clearAnim / 60) % 2 === 0;
    board.forEach((row, r) =>
      row.forEach((color, c) => {
        if (!color) return;
        if (clearingRows.includes(r)) drawCell(c, r, flashOn ? "#ffffff" : color);
        else drawCell(c, r, color);
      })
    );
    if (piece && state !== "over") {
      const gy = ghostY();
      piece.m.forEach((row, r) =>
        row.forEach((v, c) => {
          if (v && gy + r >= 0) drawCell(piece.x + c, gy + r, piece.color, 0.22);
        })
      );
      piece.m.forEach((row, r) =>
        row.forEach((v, c) => {
          if (v && piece.y + r >= 0) drawCell(piece.x + c, piece.y + r, piece.color);
        })
      );
    }
    drawSide();

    if (performance.now() < toastUntil) {
      ctx.save();
      ctx.fillStyle = "rgba(33,33,33,0.85)";
      roundRect(BOARD_W / 2 - 120, H / 2 - 26, 240, 52, 14);
      ctx.fill();
      ctx.fillStyle = "#ffc700";
      ctx.font = "800 18px 'Noto Sans KR', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(toastText, BOARD_W / 2, H / 2 + 6);
      ctx.restore();
    }

    if (state === "paused") {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, BOARD_W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "800 24px 'Noto Sans KR', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("일시정지", BOARD_W / 2, H / 2);
      ctx.font = "500 13px 'Noto Sans KR', sans-serif";
      ctx.fillText("P 또는 ⏸ 버튼으로 계속하기", BOARD_W / 2, H / 2 + 26);
      ctx.textAlign = "left";
    }
  }

  /* ================= 게임 루프 ================= */
  function isGameViewActive() {
    const v = document.getElementById("view-game");
    return !!v && v.classList.contains("active");
  }

  function frame(t) {
    rafId = null;
    const dt = lastTime ? Math.min(100, t - lastTime) : 16;
    lastTime = t;
    if (state === "running" && !leaderboardOpen) {
      if (clearingRows.length) {
        clearAnim += dt;
        if (clearAnim > 360) finishClear();
      } else if (piece) {
        dropTimer += dt;
        if (dropTimer >= dropInterval()) {
          dropTimer = 0;
          if (!collides(piece.m, piece.x, piece.y + 1)) piece.y += 1;
          else lockPiece();
        }
      }
    }
    draw();
    if (state === "running" && isGameViewActive() && !leaderboardOpen) {
      rafId = requestAnimationFrame(frame);
    }
  }

  function startLoopIfNeeded() {
    if (!rafId && state === "running" && !leaderboardOpen && isGameViewActive()) {
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  function updateScoreLabels() {
    const scoreEl = document.getElementById("gameScoreLabel");
    const highEl = document.getElementById("gameHighLabel");
    const levelEl = document.getElementById("gameLevelLabel");
    if (scoreEl) scoreEl.textContent = score;
    if (highEl) highEl.textContent = Math.max(highScore, score);
    if (levelEl) levelEl.textContent = level;
  }

  function resetGame() {
    board = emptyBoard();
    bag = [];
    nextPiece = null;
    score = 0;
    lines = 0;
    level = 1;
    dropTimer = 0;
    clearingRows = [];
    toastUntil = 0;
    spawn();
    updateScoreLabels();
  }

  function startGame() {
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
    state = "running";
    resetGame();
    document.getElementById("gameStartOverlay").hidden = true;
    document.getElementById("gameOverOverlay").hidden = true;
    startMusic();
    updatePauseBtn();
    startLoopIfNeeded();
  }

  function togglePause() {
    if (state === "running") {
      state = "paused";
      draw();
    } else if (state === "paused") {
      state = "running";
      startLoopIfNeeded();
    }
    updatePauseBtn();
  }

  function updatePauseBtn() {
    const btn = document.getElementById("gamePauseBtn");
    if (btn) btn.textContent = state === "paused" ? "▶️" : "⏸";
  }

  async function gameOver() {
    state = "over";
    stopMusic();
    sfx("over");
    if (score > highScore) {
      highScore = score;
      try {
        localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
      } catch (e) {}
    }
    draw();
    document.getElementById("gameOverName").textContent = playerName;
    document.getElementById("gameFinalScore").textContent = score;
    document.getElementById("gameFinalHigh").textContent = highScore;
    document.getElementById("gameOverOverlay").hidden = false;
    updateScoreLabels();
    updatePauseBtn();

    try {
      const res = await fetch("/api/game-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName, score, game: GAME_ID }),
      });
      const record = await res.json();
      lastScoreId = record.id;
    } catch (e) {
      lastScoreId = null;
    }
    renderLeaderboard(document.getElementById("gameLeaderboardInline"));
  }

  /* ================= 순위표 ================= */
  async function fetchLeaderboard() {
    try {
      const res = await fetch(`/api/game-scores?limit=10&game=${GAME_ID}`);
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
      </table>`;
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
    leaderboardPollTimer = setInterval(() => renderLeaderboard(document.getElementById("gameLeaderboardFull")), 5000);
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

  /* ================= 입력 ================= */
  function doAction(action) {
    if (state !== "running" || leaderboardOpen) return;
    if (action === "left") move(-1);
    else if (action === "right") move(1);
    else if (action === "rotate") rotate();
    else if (action === "down") softDrop();
    else if (action === "drop") hardDrop();
    draw();
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (!isGameViewActive()) return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const map = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "rotate",
        ArrowDown: "down",
        a: "left",
        d: "right",
        w: "rotate",
        s: "down",
      };
      if (map[e.key]) {
        doAction(map[e.key]);
        e.preventDefault();
      } else if (e.code === "Space") {
        if (state === "running") doAction("drop");
        else if (state === "ready" || state === "over") startGame();
        e.preventDefault();
      } else if (e.key === "p" || e.key === "P") {
        togglePause();
      } else if (e.code === "Enter" && (state === "ready" || state === "over")) {
        startGame();
      }
    });
  }

  function bindPad() {
    document.querySelectorAll(".game-pad__btn").forEach((btn) => {
      const action = btn.dataset.action;
      let repeat = null;
      const stop = () => {
        if (repeat) clearInterval(repeat);
        repeat = null;
      };
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        doAction(action);
        if (action === "left" || action === "right" || action === "down") {
          stop();
          repeat = setInterval(() => doAction(action), 110);
        }
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, stop));
    });
  }

  function initGame() {
    canvas = document.getElementById("gameCanvas");
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext("2d");

    try {
      highScore = Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
      const savedName = localStorage.getItem(NAME_KEY);
      if (savedName) document.getElementById("gamePlayerName").value = savedName;
    } catch (e) {
      highScore = 0;
    }
    board = emptyBoard();
    nextPiece = takeFromBag();
    updateScoreLabels();
    updateMuteBtn();
    draw();

    document.getElementById("gameStartBtn").addEventListener("click", startGame);
    document.getElementById("gameRestartBtn").addEventListener("click", startGame);
    document.getElementById("gamePlayerName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") startGame();
    });
    document.getElementById("gameMuteBtn").addEventListener("click", toggleMute);
    document.getElementById("gamePauseBtn").addEventListener("click", togglePause);
    document.getElementById("gameLeaderboardBtn").addEventListener("click", openLeaderboardOverlay);
    document.getElementById("gameLeaderboardCloseBtn").addEventListener("click", closeLeaderboardOverlay);

    bindKeyboard();
    bindPad();

    document.addEventListener("view:changed", (e) => {
      if (e.detail.view === "game") {
        startLoopIfNeeded();
      } else if (state === "running") {
        // 다른 화면으로 가면 자동으로 일시정지
        togglePause();
      }
    });
  }

  document.addEventListener("layout:ready", initGame);
})();
