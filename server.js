const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 회사 관리부 요청으로 전 직원 로그인(회원가입 승인제)을 걸어둔다.
// /api/auth/* (로그인/가입신청)와 /api/admin/* (관리자 전용, 별도의 독립적인 인증)를
// 제외한 모든 API는 로그인한 사용자만 쓸 수 있다.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/api/auth/") || req.path.startsWith("/api/admin/")) return next();
  return requireUser(req, res, next);
});

// 실행 중 쌓이는 데이터 파일은 git에 포함하지 않으므로, 없으면 최초 1회 만들어준다.
db.ensureFile("meeting-reservations", []);
db.ensureFile("vehicle-reservations", []);
db.ensureFile("driving-logs", []);
db.ensureFile("song-requests", []);
db.ensureFile("lunch-menu", [
  { id: 1, createdAt: new Date().toISOString(), name: "김치찌개" },
  { id: 2, createdAt: new Date().toISOString(), name: "제육볶음" },
  { id: 3, createdAt: new Date().toISOString(), name: "돈까스" },
  { id: 4, createdAt: new Date().toISOString(), name: "비빔밥" },
  { id: 5, createdAt: new Date().toISOString(), name: "냉면" },
  { id: 6, createdAt: new Date().toISOString(), name: "짜장면" },
  { id: 7, createdAt: new Date().toISOString(), name: "샐러드" },
  { id: 8, createdAt: new Date().toISOString(), name: "국밥" },
]);
db.ensureFile("free-posts", [
  {
    id: 1,
    createdAt: new Date().toISOString(),
    title: "게시판 오픈했습니다 :)",
    author: "관리자",
    content: "자유롭게 회사 소식, 정보, 잡담을 나눠주세요. 즐거운 사내 문화를 만들어가요!",
  },
]);
db.ensureFile("game-scores", []);
db.ensureFile("vet-records", []);
db.ensureFile("suggestions", []);
db.ensureFile("users", []);

// admin-config.json은 git에 올라가지 않는다(공개 저장소에 비밀번호가 남지 않도록).
// 파일이 없으면 매번 랜덤 비밀번호를 만들어서 콘솔에 한 번 출력해준다 — 그 값을
// 확인해서 로그인하거나, ADMIN_PASSWORD 환경변수로 원하는 값을 직접 정해도 된다.
if (!process.env.ADMIN_PASSWORD && !db.fileExists("admin-config")) {
  const generated = crypto.randomBytes(6).toString("hex");
  db.writeJSON("admin-config", { password: generated });
  console.log(`[관리자 비밀번호 생성됨] ${generated}  (data/admin-config.json 에서 언제든 변경 가능)`);
}

// cleaning-schedule은 부서명 등 공개돼도 무방한 정보라 실제 값이 git에 커밋돼 있지만,
// DATA_DIR을 빈 디스크로 돌린 배포 환경에서는 최초 1회 기본값으로 만들어준다.
db.ensureFile("cleaning-schedule", {
  month: new Date().getMonth() + 1,
  pantry: { "고양이 사무실": "", "테라스 사무실": "" },
  pantryNote: "",
  care: { "1주차": "", "2주차": "", "3주차": "", "4주차": "" },
  updatedAt: new Date().toISOString(),
});

// ---------- 관리자 인증 ----------
// 토큰은 서버 메모리에만 보관 (서버 재시작 시 재로그인 필요). 사내 전용 툴 수준의
// 간단한 보호. 배포 환경에서는 Render 대시보드의 ADMIN_PASSWORD 환경변수가 우선
// 적용되고(깃허브에 올라가는 값이 아니라 안전), 없으면 data/admin-config.json 값을 쓴다.
const adminTokens = new Set();

function getAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return db.readJSON("admin-config").password;
}

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || !adminTokens.has(token)) {
    return res.status(403).json({ error: "관리자 권한이 필요합니다." });
  }
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password !== getAdminPassword()) {
    return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
  }
  const token = crypto.randomBytes(24).toString("hex");
  adminTokens.add(token);
  res.json({ token });
});

app.post("/api/admin/logout", (req, res) => {
  adminTokens.delete(req.headers["x-admin-token"]);
  res.json({ ok: true });
});

// ---------- 직원 회원가입 / 로그인 (관리자 승인제) ----------
// 세션 토큰은 서버 메모리에만 보관한다 (서버 재시작 시 전원 재로그인 필요 — 관리자
// 세션과 동일한 방식). 비밀번호는 bcrypt로 해시해서 data/users.json에 저장한다.
const userSessions = new Map(); // token -> { id, name, username }

function requireUser(req, res, next) {
  const adminToken = req.headers["x-admin-token"];
  if (adminToken && adminTokens.has(adminToken)) {
    req.user = { id: "admin", name: "관리자", username: "admin" };
    return next();
  }
  const token = req.headers["x-user-token"];
  const user = token && userSessions.get(token);
  if (!user) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  req.user = user;
  next();
}

app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 20);
  const username = String(req.body.username || "").trim().toLowerCase().slice(0, 30);
  const password = String(req.body.password || "");
  if (!name || !username || password.length < 4) {
    return res.status(400).json({ error: "이름, 아이디, 4자 이상의 비밀번호를 입력해주세요." });
  }
  const users = db.readList("users");
  if (users.some((u) => u.username === username)) {
    return res.status(409).json({ error: "이미 사용 중인 아이디입니다." });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  db.appendToList("users", { name, username, passwordHash, status: "pending" });
  res.status(201).json({ ok: true });
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.readList("users").find((u) => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }
  if (user.status === "pending") {
    return res.status(403).json({ error: "아직 관리자 승인 대기 중입니다. 승인 후 이용해주세요." });
  }
  if (user.status === "rejected") {
    return res.status(403).json({ error: "가입이 승인되지 않았습니다. 관리자에게 문의해주세요." });
  }
  const token = crypto.randomBytes(24).toString("hex");
  userSessions.set(token, { id: user.id, name: user.name, username: user.username });
  res.json({ token, name: user.name });
});

app.post("/api/auth/logout", (req, res) => {
  userSessions.delete(req.headers["x-user-token"]);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireUser, (req, res) => {
  res.json(req.user);
});

// ---------- 관리자: 회원가입 승인 관리 ----------
app.get("/api/admin/users", requireAdmin, (req, res) => {
  const users = db.readList("users").map(({ passwordHash, ...rest }) => rest);
  res.json(users.sort((a, b) => b.id - a.id));
});

app.post("/api/admin/users/:id/approve", requireAdmin, (req, res) => {
  const updated = db.updateInList("users", req.params.id, { status: "approved" });
  res.status(updated ? 200 : 404).json({ ok: !!updated });
});

app.post("/api/admin/users/:id/reject", requireAdmin, (req, res) => {
  const updated = db.updateInList("users", req.params.id, { status: "rejected" });
  res.status(updated ? 200 : 404).json({ ok: !!updated });
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const ok = db.removeFromList("users", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

// ---------- 회의실/차량 예약 자동 정리 ----------
// 지난 날짜의 예약 "현황"은 매일 자동으로 비운다 (운행일지 등 기록성 데이터는 대상이 아님).
function purgeOldReservations() {
  db.purgeBeforeToday("meeting-reservations");
  db.purgeBeforeToday("vehicle-reservations");
}
purgeOldReservations();
setInterval(purgeOldReservations, 30 * 60 * 1000);

// ---------- 회의실 예약 ----------
app.get("/api/meeting-reservations", (req, res) => {
  res.json(db.purgeBeforeToday("meeting-reservations"));
});

app.post("/api/meeting-reservations", (req, res) => {
  const { date, roomId, roomName, start, end, name, dept, purpose } = req.body;
  if (!date || !roomId || !start || !end || !name) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const record = db.appendToList("meeting-reservations", {
    date, roomId, roomName, start, end, name, dept, purpose,
  });
  res.status(201).json(record);
});

app.delete("/api/meeting-reservations/:id", (req, res) => {
  const ok = db.removeFromList("meeting-reservations", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

// ---------- 법인차량 예약 ----------
app.get("/api/vehicle-reservations", (req, res) => {
  res.json(db.purgeBeforeToday("vehicle-reservations"));
});

app.post("/api/vehicle-reservations", (req, res) => {
  const { date, vehicleId, vehicleName, start, end, name, dept, destination } = req.body;
  if (!date || !vehicleId || !start || !end || !name) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const record = db.appendToList("vehicle-reservations", {
    date, vehicleId, vehicleName, start, end, name, dept, destination,
  });
  res.status(201).json(record);
});

app.delete("/api/vehicle-reservations/:id", (req, res) => {
  const ok = db.removeFromList("vehicle-reservations", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

// ---------- 차량 운행일지 ----------
app.get("/api/driving-logs", (req, res) => {
  res.json(db.readList("driving-logs"));
});

app.post("/api/driving-logs", (req, res) => {
  const {
    reservationId, vehicleId, vehicleName, driver, dept,
    departure, destination, startOdo, endOdo, passengers, notes,
  } = req.body;
  if (!vehicleId || !driver || !departure || !destination || startOdo == null || endOdo == null) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const record = db.appendToList("driving-logs", {
    reservationId, vehicleId, vehicleName, driver, dept,
    departure, destination, startOdo, endOdo, passengers, notes,
  });
  res.status(201).json(record);
});

app.put("/api/driving-logs/:id", requireAdmin, (req, res) => {
  const {
    vehicleId, vehicleName, driver, dept,
    departure, destination, startOdo, endOdo, passengers, notes,
  } = req.body;
  if (!vehicleId || !driver || !departure || !destination || startOdo == null || endOdo == null) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const updated = db.updateInList("driving-logs", req.params.id, {
    vehicleId, vehicleName, driver, dept,
    departure, destination, startOdo, endOdo, passengers, notes,
  });
  res.status(updated ? 200 : 404).json(updated || { error: "운행일지를 찾을 수 없습니다." });
});

app.delete("/api/driving-logs/:id", requireAdmin, (req, res) => {
  const ok = db.removeFromList("driving-logs", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

app.get("/api/driving-logs/export/csv", requireAdmin, (req, res) => {
  const logs = db.readList("driving-logs").sort((a, b) => b.id - a.id);
  const header = [
    "작성일시", "차량", "운전자", "부서", "출발지", "도착지",
    "출발계기판(km)", "도착계기판(km)", "주행거리(km)", "동승자", "특이사항",
  ];
  const escapeCsv = (value) => {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = logs.map((l) => [
    new Date(l.createdAt).toLocaleString("ko-KR"),
    l.vehicleName, l.driver, l.dept || "", l.departure, l.destination,
    l.startOdo, l.endOdo, l.endOdo - l.startOdo, l.passengers || "", l.notes || "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="driving-logs.csv"`);
  res.send("﻿" + csv);
});

// ---------- 점심 메뉴 (룰렛) ----------
app.get("/api/lunch-menu", (req, res) => {
  res.json(db.readList("lunch-menu"));
});

app.post("/api/lunch-menu", (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "메뉴 이름이 필요합니다." });
  }
  const record = db.appendToList("lunch-menu", { name });
  res.status(201).json(record);
});

app.delete("/api/lunch-menu/:id", (req, res) => {
  const ok = db.removeFromList("lunch-menu", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

// ---------- 청소분담표 ----------
app.get("/api/cleaning-schedule", (req, res) => {
  res.json(db.readJSON("cleaning-schedule"));
});

app.put("/api/cleaning-schedule", requireAdmin, (req, res) => {
  const { month, pantry, pantryNote, care } = req.body;
  if (!month || !pantry || !care) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const updated = {
    month, pantry, pantryNote: pantryNote || "", care,
    updatedAt: new Date().toISOString(),
  };
  db.writeJSON("cleaning-schedule", updated);
  res.json(updated);
});

// ---------- 자유게시판 ----------
app.get("/api/free-posts", (req, res) => {
  const list = db.readList("free-posts").sort((a, b) => b.id - a.id);
  res.json(list);
});

app.post("/api/free-posts", (req, res) => {
  const { title, author, content } = req.body;
  if (!title || !author || !content) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const record = db.appendToList("free-posts", { title, author, content });
  res.status(201).json(record);
});

app.put("/api/free-posts/:id", requireAdmin, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const updated = db.updateInList("free-posts", req.params.id, { title, content });
  res.status(updated ? 200 : 404).json(updated || { error: "게시글을 찾을 수 없습니다." });
});

app.delete("/api/free-posts/:id", requireAdmin, (req, res) => {
  const ok = db.removeFromList("free-posts", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

// ---------- 오늘의 신청곡 ----------
app.get("/api/song-requests", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const list = db.readList("song-requests").filter((r) => r.createdAt.slice(0, 10) === today);
  res.json(list);
});

app.post("/api/song-requests", (req, res) => {
  const { song, artist, requester } = req.body;
  if (!song || !requester) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const record = db.appendToList("song-requests", { song, artist, requester });
  res.status(201).json(record);
});

// ---------- 미니게임 순위표 (전 직원 공유) ----------
app.get("/api/game-scores", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const list = db
    .readList("game-scores")
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, limit);
  res.json(list);
});

app.post("/api/game-scores", (req, res) => {
  const { name, score } = req.body;
  const cleanName = String(name || "").trim().slice(0, 12);
  const cleanScore = Math.max(0, Math.floor(Number(score)));
  if (!cleanName || !Number.isFinite(cleanScore)) {
    return res.status(400).json({ error: "이름과 점수가 필요합니다." });
  }
  const record = db.appendToList("game-scores", { name: cleanName, score: cleanScore });
  res.status(201).json(record);
});

// ---------- 바프/베프 병원 기록 ----------
app.get("/api/vet-records", (req, res) => {
  res.json(db.readList("vet-records"));
});

app.post("/api/vet-records", (req, res) => {
  const { date, cat, notes } = req.body;
  if (!date || !cat || !notes) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const record = db.appendToList("vet-records", { date, cat, notes });
  res.status(201).json(record);
});

app.delete("/api/vet-records/:id", requireAdmin, (req, res) => {
  const ok = db.removeFromList("vet-records", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

// ---------- 기능 건의함 (스티커 메모, 영구 보관 - 삭제는 관리자만) ----------
app.get("/api/suggestions", (req, res) => {
  const list = db.readList("suggestions").sort((a, b) => b.id - a.id);
  res.json(list);
});

app.post("/api/suggestions", (req, res) => {
  const { author, content } = req.body;
  const cleanContent = String(content || "").trim().slice(0, 200);
  if (!cleanContent) {
    return res.status(400).json({ error: "건의 내용을 입력해주세요." });
  }
  const record = db.appendToList("suggestions", {
    author: String(author || "").trim().slice(0, 12) || "익명",
    content: cleanContent,
  });
  res.status(201).json(record);
});

app.delete("/api/suggestions/:id", requireAdmin, (req, res) => {
  const ok = db.removeFromList("suggestions", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

app.listen(PORT, () => {
  console.log(`HBAF 사내 포털 서버 실행 중: http://localhost:${PORT}`);
});
