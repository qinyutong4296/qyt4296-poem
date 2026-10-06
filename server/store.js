/**
 * JSON 文件存储：内存缓存 + 原子写入，避免并发写坏与重复读盘
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");

/** @type {Map<string, { data: any, rev: number }>} */
const mem = new Map();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function readJSON(name, fallback) {
  const hit = mem.get(name);
  if (hit) return hit.data;
  ensureDir();
  const p = filePath(name);
  let data;
  try {
    if (!fs.existsSync(p)) data = structuredClone(fallback);
    else data = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    data = structuredClone(fallback);
  }
  mem.set(name, { data, rev: 1 });
  return data;
}

function writeJSON(name, data) {
  ensureDir();
  const p = filePath(name);
  const tmp = p + ".tmp." + process.pid;
  const body = JSON.stringify(data);
  fs.writeFileSync(tmp, body, "utf8");
  try {
    /* Windows 上 rename 到已存在文件常 EPERM，失败则改为覆盖写入 */
    fs.renameSync(tmp, p);
  } catch (_) {
    try {
      fs.writeFileSync(p, body, "utf8");
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  }
  const prev = mem.get(name);
  mem.set(name, { data, rev: (prev ? prev.rev : 0) + 1 });
}

function getRev(name) {
  if (!mem.has(name)) {
    const fb = name === "users.json" ? {} : [];
    readJSON(name, fb);
  }
  return mem.get(name).rev;
}

/** 墙+板合并版本，供 /api/sync 与 ETag */
function syncRev() {
  return getRev("wall.json") + "-" + getRev("board.json");
}

function invalidate(name) {
  mem.delete(name);
}

function newId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

function hashPass(pass, salt) {
  return crypto.createHash("sha256").update(salt + ":" + pass).digest("hex");
}

function newSalt() {
  return crypto.randomBytes(8).toString("hex");
}

const ADMIN_NAME = "站长";

/** @deprecated 账号已迁至 SQLite（users-db.js）；保留仅作兼容 */
function ensureAdmin() {
  const users = readJSON("users.json", {});
  return users;
}

module.exports = {
  DATA_DIR,
  readJSON,
  writeJSON,
  getRev,
  syncRev,
  invalidate,
  newId,
  hashPass,
  newSalt,
  ensureAdmin,
  ADMIN_NAME
};
