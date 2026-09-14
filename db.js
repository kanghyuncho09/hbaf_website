const fs = require("fs");
const path = require("path");

// 로컬에서는 프로젝트 안의 data/ 폴더를 쓰고, Render 등에 배포할 때는
// DATA_DIR 환경변수로 영구 디스크 마운트 경로를 지정하면 그쪽에 저장된다.
// (Render의 기본 파일시스템은 재배포/재시작 시 초기화되므로, 예약/게시글 등을
// 계속 보존하려면 Persistent Disk를 붙이고 DATA_DIR을 그 경로로 맞춰야 한다.)
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function fileExists(name) {
  return fs.existsSync(filePath(name));
}

function ensureFile(name, defaultValue) {
  if (!fileExists(name)) {
    writeJSON(name, defaultValue);
  }
}

function readJSON(name) {
  const raw = fs.readFileSync(filePath(name), "utf-8");
  return JSON.parse(raw);
}

function writeJSON(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

function readList(name) {
  return readJSON(name);
}

function appendToList(name, item) {
  const list = readList(name);
  const nextId = list.reduce((max, i) => Math.max(max, i.id || 0), 0) + 1;
  const record = { id: nextId, createdAt: new Date().toISOString(), ...item };
  list.push(record);
  writeJSON(name, list);
  return record;
}

function removeFromList(name, id) {
  const list = readList(name);
  const filtered = list.filter((i) => String(i.id) !== String(id));
  const removed = filtered.length !== list.length;
  if (removed) writeJSON(name, filtered);
  return removed;
}

function updateInList(name, id, patch) {
  const list = readList(name);
  const idx = list.findIndex((i) => String(i.id) === String(id));
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id: list[idx].id, updatedAt: new Date().toISOString() };
  writeJSON(name, list);
  return list[idx];
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// date가 지난(오늘 이전) 예약 항목을 파일에서 정리한다. 회의실/차량 "예약 현황"이
// 끝없이 쌓이지 않도록 매일 자동으로 비워주는 용도 (운행일지 등 기록성 데이터에는 사용하지 않음).
function purgeBeforeToday(name) {
  const today = todayStr();
  const list = readList(name);
  const kept = list.filter((i) => !i.date || i.date >= today);
  if (kept.length !== list.length) writeJSON(name, kept);
  return kept;
}

module.exports = {
  readJSON,
  writeJSON,
  readList,
  appendToList,
  removeFromList,
  updateInList,
  purgeBeforeToday,
  ensureFile,
  fileExists,
};
