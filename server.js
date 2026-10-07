const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// 대한민국 공식 공휴일 (public/js/vet.js의 목록과 동일 — 매년 새로 확인해서 업데이트 필요).
// 회의실/차량 예약이 공휴일에는 잡히지 않도록 서버에서도 막는다.
const HOLIDAYS = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02",
  "2026-05-05", "2026-05-24", "2026-05-25", "2026-06-06", "2026-07-17", "2026-08-15",
  "2026-08-17", "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05",
  "2026-10-09", "2026-12-25",
]);

function toMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlapsExisting(list, start, end, excludeId) {
  const s = toMin(start);
  const e = toMin(end);
  return list.some((r) => String(r.id) !== String(excludeId) && s < toMin(r.end) && e > toMin(r.start));
}

// 서버(Render)는 UTC 시간대이므로, 날짜가 필요한 모든 곳에서 이 함수로 한국 시간 기준
// 날짜 문자열을 직접 계산한다 (new Date().toISOString()을 그대로 쓰면 날짜가 하루씩
// 밀릴 수 있다).
function kstDateStr(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// 매주 고정으로 자동 예약되는 정기 회의 (요일은 Date.getDay() 기준: 1=월, 3=수, 4=목).
// 본인 소유가 아니라 username을 "system-recurring"으로 심어두므로, 직원들은 수정/취소
// 버튼이 안 보이고 관리자만 필요하면 손댈 수 있다(예약 소유권 검사 로직 그대로 재사용).
const RECURRING_MEETINGS = [
  { weekday: 1, start: "14:00", end: "15:30", name: "제품컨셉회의" },
  { weekday: 3, start: "10:00", end: "11:30", name: "개발회의" },
  { weekday: 4, start: "14:00", end: "15:30", name: "간부회의" },
];
const RECURRING_ROOM_ID = "room-1";
const RECURRING_ROOM_NAME = "원형회의실";
const RECURRING_WEEKS_AHEAD = 12;

// 앞으로 12주치 정기 회의를 미리 채워둔다. 이미 그 시간에 다른 예약이 있으면(과거에
// 누가 먼저 잡아둔 경우) 건너뛰고, 이미 생성된 주는 중복 생성하지 않는다.
function ensureRecurringMeetings() {
  const today = new Date();
  for (let i = 0; i < RECURRING_WEEKS_AHEAD * 7; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (HOLIDAYS.has(dateStr)) continue;
    RECURRING_MEETINGS.forEach((m) => {
      if (m.weekday !== d.getDay()) return;
      const list = db.readList("meeting-reservations");
      const alreadyExists = list.some((r) => r.date === dateStr && r.roomId === RECURRING_ROOM_ID && r.start === m.start && r.recurring);
      if (alreadyExists) return;
      const sameDay = list.filter((r) => r.date === dateStr && r.roomId === RECURRING_ROOM_ID);
      if (overlapsExisting(sameDay, m.start, m.end)) {
        console.log(`[고정회의] ${dateStr} ${m.name}은(는) 겹치는 예약이 있어 건너뜀`);
        return;
      }
      db.appendToList("meeting-reservations", {
        date: dateStr,
        roomId: RECURRING_ROOM_ID,
        roomName: RECURRING_ROOM_NAME,
        start: m.start,
        end: m.end,
        name: m.name,
        dept: "",
        purpose: "매주 고정 회의",
        username: "system-recurring",
        recurring: true,
      });
    });
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 회사 관리부 요청으로 전 직원 로그인(회원가입 승인제)을 걸어둔다.
// /api/auth/* (로그인/가입신청)와 /api/admin/* (관리자 전용, 별도의 독립적인 인증)를
// 제외한 모든 API는 로그인한 사용자만 쓸 수 있다.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/api/auth/") || req.path.startsWith("/api/admin/")) return next();
  if (req.path.startsWith("/api/public/")) return next();
  return requireUser(req, res, next);
});

// 실행 중 쌓이는 데이터 파일은 git에 포함하지 않으므로, 없으면 최초 1회 만들어준다.
db.ensureFile("meeting-reservations", []);
db.ensureFile("vehicle-reservations", []);
db.ensureFile("driving-logs", []);
db.ensureFile("vehicle-log-violations", []);
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
db.ensureFile("updates", [
  {
    id: 1,
    createdAt: new Date().toISOString(),
    content: "예약 사이에 좁게 남은 빈 시간대도 이제 정상적으로 선택할 수 있도록 고쳤어요.",
  },
  {
    id: 2,
    createdAt: new Date().toISOString(),
    content: "법인차량 예약현황이 이제 선택한 차량별로 따로 정리돼서 보여요.",
  },
  {
    id: 3,
    createdAt: new Date().toISOString(),
    content: "청소분담표가 5주차까지 확장되고, 주차별 담당 날짜 범위도 함께 표시돼요.",
  },
  {
    id: 4,
    createdAt: new Date().toISOString(),
    content: "회의실 앞에 QR코드를 붙여두면, 로그인 없이 스캔만으로 그날 예약 현황을 바로 볼 수 있어요.",
  },
  {
    id: 5,
    createdAt: new Date().toISOString(),
    content: "바프/베프 병원 기록 달력에도 공식 공휴일이 빨간색으로 표시돼요.",
  },
  {
    id: 6,
    createdAt: new Date().toISOString(),
    content: "회의실/차량 예약은 이제 본인이 등록한 예약만 수정·취소할 수 있어요. (관리자는 모든 예약을 관리할 수 있어요)",
  },
  {
    id: 7,
    createdAt: new Date().toISOString(),
    content: "예약 날짜를 고를 때 달력에 공휴일이 빨간색으로 표시되고, 공휴일에는 예약이 자동으로 막혀요.",
  },
]);

// 로그인 토큰 서명에 쓰는 비밀키. 파일로 저장해두면(퍼시스턴트 디스크에 보관되므로)
// 서버가 재배포/재시작돼도 같은 키를 계속 쓸 수 있어 로그인이 풀리지 않는다.
db.ensureFile("auth-secret", { secret: crypto.randomBytes(32).toString("hex") });

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

// ---------- 로그인 토큰 서명/검증 ----------
// 로그인 토큰에 "누구인지"를 직접 담아 서명해두는 방식(자체 검증 토큰)이라, 서버가
// 재배포되거나 재시작돼도(무료 요금제의 슬립, 배포 등) 서버 메모리에 저장해둔 세션
// 목록이 사라지는 것과 무관하게 로그인이 계속 유지된다 — 직접 로그아웃하기 전까지는
// 만료일(아래 TOKEN_MAX_AGE) 안에서 계속 로그인 상태가 이어진다.
const AUTH_SECRET = db.readJSON("auth-secret").secret;
const TOKEN_MAX_AGE = 1000 * 60 * 60 * 24 * 180; // 180일

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.iat || Date.now() - payload.iat > TOKEN_MAX_AGE) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- 관리자 인증 ----------
// 배포 환경에서는 Render 대시보드의 ADMIN_PASSWORD 환경변수가 우선 적용되고
// (깃허브에 올라가는 값이 아니라 안전), 없으면 data/admin-config.json 값을 쓴다.
function getAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return db.readJSON("admin-config").password;
}

function requireAdmin(req, res, next) {
  const payload = verifyToken(req.headers["x-admin-token"]);
  if (!payload || payload.role !== "admin") {
    return res.status(403).json({ error: "관리자 권한이 필요합니다." });
  }
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password !== getAdminPassword()) {
    return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
  }
  res.json({ token: signToken({ role: "admin" }) });
});

app.post("/api/admin/logout", (req, res) => {
  res.json({ ok: true });
});

// ---------- 직원 회원가입 / 로그인 (관리자 승인제) ----------
// 비밀번호는 bcrypt로 해시해서 data/users.json에 저장한다.
function requireUser(req, res, next) {
  const adminPayload = verifyToken(req.headers["x-admin-token"]);
  if (adminPayload && adminPayload.role === "admin") {
    req.user = { id: "admin", name: "관리자", username: "admin" };
    return next();
  }
  const payload = verifyToken(req.headers["x-user-token"]);
  if (!payload || payload.role !== "user") {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  req.user = { id: payload.id, name: payload.name, username: payload.username };
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
  const token = signToken({ role: "user", id: user.id, name: user.name, username: user.username });
  res.json({ token, name: user.name, username: user.username });
});

app.post("/api/auth/logout", (req, res) => {
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
const VEHICLE_LOG_VIOLATION_LIMIT = 3;

// 차량 예약은 날짜가 지나면 "현황"에서 자동으로 사라지므로, 사라지기 직전에 운행일지를
// 안 쓴 채로 끝난 건이 있으면 그 사람 이름으로 "미기록"을 하나 남겨둔다. 이 기록은
// 예약과 달리 지워지지 않아서, 나중에 몇 번 누적됐는지 계속 추적할 수 있다.
// 운행일지 한 건을 예약 한 건과 짝지어 "썼다"고 인정하는 규칙. 이용일(한국 시간) 기준으로 찾고,
// 실제로 일지를 쓴 사람이 억울하게 미기록으로 잡히지 않도록 아래 순서로 너그럽게 본다.
//  1) 같은 사람이 같은 차량으로 쓴 일지
//  2) 누가 썼든 같은 날 같은 차량 일지 (예약한 사람과 운전해서 쓴 사람이 다른 경우,
//     관리자 모드를 켠 채 써서 작성자 ID가 "admin"으로 남은 경우, 예전 일지라 작성자 정보가 없는 경우)
//  3) 같은 사람이 같은 날 차량을 잘못 골라서 쓴 일지 (일지 폼 차량 기본값이 첫 번째 차량이라 흔함)
// 일지 한 건은 예약 한 건에만 쓰이고, graceDays > 0이면 이용일 이후 그 일수 안에 늦게 쓴 것도 인정한다(1·3번 규칙).
function buildLogIndex() {
  return db
    .readList("driving-logs")
    .filter((l) => l.createdAt)
    .map((l) => ({ username: l.username, vehicleId: l.vehicleId, date: kstDateStr(new Date(l.createdAt)), used: false }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function claimMatchingLog(logIndex, { username, vehicleId, date }, graceDays) {
  const lateDays = (d) => Math.round((Date.parse(d) - Date.parse(date)) / 86400000);
  const inWindow = logIndex.filter((l) => !l.used && lateDays(l.date) >= 0 && lateDays(l.date) <= graceDays);
  const sameDay = inWindow.filter((l) => l.date === date);
  const log =
    inWindow.find((l) => l.username === username && l.vehicleId === vehicleId) ||
    sameDay.find((l) => l.vehicleId === vehicleId) ||
    inWindow.find((l) => l.username && l.username === username);
  if (!log) return false;
  log.used = true;
  return true;
}

function purgeVehicleReservationsAndTrackViolations() {
  const today = kstDateStr(new Date());
  const reservations = db.readList("vehicle-reservations");
  const toKeep = reservations.filter((r) => !r.date || r.date >= today);
  const expiring = reservations.filter((r) => r.date && r.date < today).sort((a, b) => a.date.localeCompare(b.date));

  if (expiring.length) {
    const logIndex = buildLogIndex();
    const alreadyTracked = new Set(db.readList("vehicle-log-violations").map((v) => String(v.reservationId)));
    expiring.forEach((r) => {
      if (!r.username || alreadyTracked.has(String(r.id))) return;
      if (claimMatchingLog(logIndex, r, 0)) return;
      db.appendToList("vehicle-log-violations", {
        reservationId: r.id,
        username: r.username,
        name: r.name,
        vehicleId: r.vehicleId,
        vehicleName: r.vehicleName,
        date: r.date,
      });
    });
  }

  db.writeJSON("vehicle-reservations", toKeep);
}

function getVehicleLogViolationCount(username) {
  return db.readList("vehicle-log-violations").filter((v) => v.username === username).length;
}

function kstNowMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

// 이용일 당일에 못 쓰고 며칠 늦게라도 운행일지를 쓴 사람은 미기록에서 빼준다.
// 로그 한 건은 미기록 한 건만 풀어주고(같은 사람·같은 차량), 이용일 이후 3일 안에 쓴 것만 인정한다.
const VEHICLE_LOG_LATE_GRACE_DAYS = 3;

function reconcileVehicleViolations() {
  const violations = db.readList("vehicle-log-violations");
  if (!violations.length) return;
  const logIndex = buildLogIndex();
  const forgiven = new Set();
  [...violations]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((v) => {
      if (claimMatchingLog(logIndex, v, VEHICLE_LOG_LATE_GRACE_DAYS)) forgiven.add(v.id);
    });
  if (forgiven.size) {
    db.writeJSON("vehicle-log-violations", violations.filter((v) => !forgiven.has(v.id)));
  }
}

// 오늘 이용이 끝났는데 아직 운행일지가 없는 예약 (자정이 지나야 정식 미기록으로 확정된다)
function getPendingUnloggedToday() {
  const today = kstDateStr(new Date());
  const nowMin = kstNowMinutes();
  const logIndex = buildLogIndex().filter((l) => l.date === today);
  return db
    .readList("vehicle-reservations")
    .filter((r) => r.date === today && r.username && toMin(r.end) <= nowMin)
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((r) => !claimMatchingLog(logIndex, r, 0));
}

function purgeOldReservations() {
  db.purgeBeforeToday("meeting-reservations");
  purgeVehicleReservationsAndTrackViolations();
}
purgeOldReservations();
ensureRecurringMeetings();
setInterval(purgeOldReservations, 30 * 60 * 1000);
setInterval(ensureRecurringMeetings, 60 * 60 * 1000);

// ---------- 회의실 예약 ----------
app.get("/api/meeting-reservations", (req, res) => {
  res.json(db.purgeBeforeToday("meeting-reservations"));
});

app.post("/api/meeting-reservations", (req, res) => {
  const { date, roomId, roomName, start, end, name, dept, purpose } = req.body;
  if (!date || !roomId || !start || !end || !name) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  if (HOLIDAYS.has(date)) {
    return res.status(400).json({ error: "공휴일에는 예약할 수 없습니다." });
  }
  const sameDay = db.readList("meeting-reservations").filter((r) => r.date === date && r.roomId === roomId);
  if (overlapsExisting(sameDay, start, end)) {
    return res.status(409).json({ error: "이미 예약된 시간대와 겹칩니다." });
  }
  const record = db.appendToList("meeting-reservations", {
    date, roomId, roomName, start, end, name, dept, purpose, username: req.user.username,
  });
  res.status(201).json(record);
});

app.put("/api/meeting-reservations/:id", (req, res) => {
  const all = db.readList("meeting-reservations");
  const existing = all.find((r) => String(r.id) === String(req.params.id));
  if (!existing) return res.status(404).json({ error: "예약을 찾을 수 없습니다." });
  const isOwner = existing.username && existing.username === req.user.username;
  if (!isOwner && req.user.id !== "admin") {
    return res.status(403).json({ error: "본인이 등록한 예약만 수정할 수 있습니다." });
  }
  const { date, start, end, name, dept, purpose } = req.body;
  if (!date || !start || !end || !name) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  if (HOLIDAYS.has(date)) {
    return res.status(400).json({ error: "공휴일에는 예약할 수 없습니다." });
  }
  const sameDay = all.filter((r) => r.date === date && r.roomId === existing.roomId);
  if (overlapsExisting(sameDay, start, end, existing.id)) {
    return res.status(409).json({ error: "이미 예약된 시간대와 겹칩니다." });
  }
  const updated = db.updateInList("meeting-reservations", req.params.id, { date, start, end, name, dept, purpose });
  res.json(updated);
});

app.delete("/api/meeting-reservations/:id", (req, res) => {
  const existing = db.readList("meeting-reservations").find((r) => String(r.id) === String(req.params.id));
  if (!existing) return res.status(404).json({ ok: false });
  const isOwner = existing.username && existing.username === req.user.username;
  if (!isOwner && req.user.id !== "admin") {
    return res.status(403).json({ error: "본인이 등록한 예약만 취소할 수 있습니다." });
  }
  const ok = db.removeFromList("meeting-reservations", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

// 회의실 문 앞 QR코드용 공개 API (로그인 불필요). 링크를 아는 누구나 볼 수 있으므로
// 오늘 날짜의 원형회의실 예약 시간/예약자/부서만 내려주고 회의 목적 등은 뺀다.
// 서버(Render)는 UTC 시간대라서 날짜와 현재 시각은 항상 한국 시간으로 직접 계산한다.
app.get("/api/public/room-today", (req, res) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const reservations = db
    .readList("meeting-reservations")
    .filter((r) => r.date === date && r.roomId === "room-1")
    .map((r) => ({ start: r.start, end: r.end, name: r.name, dept: r.dept || "" }))
    .sort((a, b) => a.start.localeCompare(b.start));
  res.set("Cache-Control", "no-store");
  res.json({ roomName: "원형회의실", date, now: `${parts.hour}:${parts.minute}`, reservations });
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
  if (HOLIDAYS.has(date)) {
    return res.status(400).json({ error: "공휴일에는 예약할 수 없습니다." });
  }
  if (req.user.id !== "admin" && getVehicleLogViolationCount(req.user.username) >= VEHICLE_LOG_VIOLATION_LIMIT) {
    // 늦게라도 운행일지를 쓴 게 있으면 먼저 반영해보고, 그래도 3회 이상이면 막는다.
    reconcileVehicleViolations();
    if (getVehicleLogViolationCount(req.user.username) >= VEHICLE_LOG_VIOLATION_LIMIT) {
      return res.status(403).json({
        error:
          "운행일지 미작성이 3회 누적되어 새 예약이 제한되었습니다.\n관리자에게 문의해 주세요.",
      });
    }
  }
  const sameDay = db.readList("vehicle-reservations").filter((r) => r.date === date && r.vehicleId === vehicleId);
  if (overlapsExisting(sameDay, start, end)) {
    return res.status(409).json({ error: "이미 예약된 시간대와 겹칩니다." });
  }
  const record = db.appendToList("vehicle-reservations", {
    date, vehicleId, vehicleName, start, end, name, dept, destination, username: req.user.username,
  });
  res.status(201).json(record);
});

app.put("/api/vehicle-reservations/:id", (req, res) => {
  const all = db.readList("vehicle-reservations");
  const existing = all.find((r) => String(r.id) === String(req.params.id));
  if (!existing) return res.status(404).json({ error: "예약을 찾을 수 없습니다." });
  const isOwner = existing.username && existing.username === req.user.username;
  if (!isOwner && req.user.id !== "admin") {
    return res.status(403).json({ error: "본인이 등록한 예약만 수정할 수 있습니다." });
  }
  const { date, start, end, name, dept, destination } = req.body;
  if (!date || !start || !end || !name) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  if (HOLIDAYS.has(date)) {
    return res.status(400).json({ error: "공휴일에는 예약할 수 없습니다." });
  }
  const sameDay = all.filter((r) => r.date === date && r.vehicleId === existing.vehicleId);
  if (overlapsExisting(sameDay, start, end, existing.id)) {
    return res.status(409).json({ error: "이미 예약된 시간대와 겹칩니다." });
  }
  const updated = db.updateInList("vehicle-reservations", req.params.id, { date, start, end, name, dept, destination });
  res.json(updated);
});

app.delete("/api/vehicle-reservations/:id", (req, res) => {
  const existing = db.readList("vehicle-reservations").find((r) => String(r.id) === String(req.params.id));
  if (!existing) return res.status(404).json({ ok: false });
  const isOwner = existing.username && existing.username === req.user.username;
  if (!isOwner && req.user.id !== "admin") {
    return res.status(403).json({ error: "본인이 등록한 예약만 취소할 수 있습니다." });
  }
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
    username: req.user.username,
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

// ---------- 운행일지 미기록 현황 (관리자 전용) ----------
// 사람별로 몇 번 누적됐는지 모아서 보여주고, 필요하면 관리자가 초기화해서
// 다시 예약할 수 있게 풀어줄 수 있다.
// 열 때마다 "지금 시점" 기준으로 다시 계산한다: 지난 날짜 예약을 바로 정리해 미기록으로 확정하고,
// 늦게라도 쓴 운행일지는 미기록에서 빼고, 오늘 이미 끝났는데 아직 안 쓴 건은 "오늘 미작성"으로 따로 보여준다.
app.get("/api/admin/vehicle-violations", requireAdmin, (req, res) => {
  purgeVehicleReservationsAndTrackViolations();
  reconcileVehicleViolations();

  const byUser = new Map();
  const entryFor = (username, name) => {
    const entry = byUser.get(username) || { username, name, count: 0, items: [], pending: [] };
    entry.name = name || entry.name;
    byUser.set(username, entry);
    return entry;
  };
  db.readList("vehicle-log-violations").forEach((v) => {
    const entry = entryFor(v.username, v.name);
    entry.count += 1;
    entry.items.push({ date: v.date, vehicleName: v.vehicleName });
  });
  getPendingUnloggedToday().forEach((r) => {
    const entry = entryFor(r.username, r.name);
    entry.pending.push({ vehicleName: r.vehicleName || r.vehicleId, start: r.start, end: r.end });
  });
  res.json(
    [...byUser.values()].sort((a, b) => b.count - a.count || b.pending.length - a.pending.length)
  );
});

app.delete("/api/admin/vehicle-violations/:username", requireAdmin, (req, res) => {
  const violations = db.readList("vehicle-log-violations");
  const kept = violations.filter((v) => v.username !== req.params.username);
  db.writeJSON("vehicle-log-violations", kept);
  res.json({ ok: true, removed: violations.length - kept.length });
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

app.put("/api/vet-records/:id", (req, res) => {
  const { date, cat, notes } = req.body;
  if (!date || !cat || !notes) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const updated = db.updateInList("vet-records", req.params.id, { date, cat, notes });
  res.status(updated ? 200 : 404).json(updated || { ok: false });
});

app.delete("/api/vet-records/:id", (req, res) => {
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

// ---------- 업데이트 소식 (관리자가 작성, 홈화면에 공지) ----------
app.get("/api/updates", (req, res) => {
  const list = db.readList("updates").sort((a, b) => b.id - a.id);
  res.json(list);
});

app.post("/api/updates", requireAdmin, (req, res) => {
  const { content } = req.body;
  const cleanContent = String(content || "").trim().slice(0, 300);
  if (!cleanContent) {
    return res.status(400).json({ error: "업데이트 내용을 입력해주세요." });
  }
  const record = db.appendToList("updates", { content: cleanContent });
  res.status(201).json(record);
});

app.delete("/api/updates/:id", requireAdmin, (req, res) => {
  const ok = db.removeFromList("updates", req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

app.listen(PORT, () => {
  console.log(`HBAF 사내 포털 서버 실행 중: http://localhost:${PORT}`);
});
