/**
 * 用户账号 SQLite 数据库（server/data/users.db）
 * 注册账号持久保存，关服 / 重启后仍可登录
 * 首次启动若存在旧版 users.json，自动迁入
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const {
  DATA_DIR,
  hashPass,
  newSalt,
  ADMIN_NAME
} = require("./store");

const DB_PATH = path.join(DATA_DIR, "users.db");
const JSON_LEGACY = path.join(DATA_DIR, "users.json");

let db = null;

function open() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS users (
      name TEXT PRIMARY KEY NOT NULL,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      ts INTEGER NOT NULL DEFAULT 0,
      admin INTEGER NOT NULL DEFAULT 0
    );
  `);
  migrateFromJsonIfNeeded();
  return db;
}

function rowToRec(row) {
  if (!row) return null;
  return {
    s: row.salt,
    h: row.hash,
    ts: Number(row.ts) || 0,
    admin: !!row.admin
  };
}

function migrateFromJsonIfNeeded() {
  const n = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (n > 0) return;
  if (!fs.existsSync(JSON_LEGACY)) return;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(JSON_LEGACY, "utf8"));
  } catch {
    return;
  }
  if (!raw || typeof raw !== "object") return;
  const ins = db.prepare(
    "INSERT OR IGNORE INTO users (name, salt, hash, ts, admin) VALUES (?, ?, ?, ?, ?)"
  );
  let migrated = 0;
  for (const [name, rec] of Object.entries(raw)) {
    if (!name || !rec || !rec.s || !rec.h) continue;
    const info = ins.run(name, rec.s, rec.h, Number(rec.ts) || 0, rec.admin ? 1 : 0);
    if (info.changes) migrated += 1;
  }
  if (migrated) console.log("  [账号库] 已从 users.json 迁入 " + migrated + " 个账号 → " + DB_PATH);
}

/* 按要求不创建站长账号：站点不存在可登录的管理员，站长后台仅保留功能代码 */

function ensureAdmin() {
  open();
  return getAllUsers();
}

function getUser(name) {
  open();
  const row = db.prepare(
    "SELECT name, salt, hash, ts, admin FROM users WHERE name = ?"
  ).get(name);
  return rowToRec(row);
}

function getAllUsers() {
  open();
  const rows = db.prepare(
    "SELECT name, salt, hash, ts, admin FROM users ORDER BY ts ASC"
  ).all();
  const out = {};
  for (const row of rows) out[row.name] = rowToRec(row);
  return out;
}

function userCount() {
  open();
  return db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
}

function createUser(name, pass, admin = false) {
  open();
  if (getUser(name)) {
    const err = new Error("此名已有墨客用过，换一个或直接登录");
    err.code = "EXISTS";
    throw err;
  }
  const salt = newSalt();
  const hash = hashPass(pass, salt);
  const ts = Date.now();
  db.prepare(
    "INSERT INTO users (name, salt, hash, ts, admin) VALUES (?, ?, ?, ?, ?)"
  ).run(name, salt, hash, ts, admin ? 1 : 0);
  return { s: salt, h: hash, ts, admin: !!admin };
}

function setAdmin(name, admin) {
  open();
  const rec = getUser(name);
  if (!rec) return null;
  db.prepare("UPDATE users SET admin = ? WHERE name = ?").run(admin ? 1 : 0, name);
  rec.admin = !!admin;
  return rec;
}

function setPassword(name, pass) {
  open();
  const salt = newSalt();
  const hash = hashPass(pass, salt);
  const info = db.prepare(
    "UPDATE users SET salt = ?, hash = ? WHERE name = ?"
  ).run(salt, hash, name);
  if (!info.changes) return null;
  return { s: salt, h: hash };
}

function removeUser(name) {
  open();
  if (!name || name === ADMIN_NAME) return false;
  return db.prepare("DELETE FROM users WHERE name = ?").run(name).changes > 0;
}

function verifyLogin(name, pass) {
  const rec = getUser(name);
  if (!rec) return { ok: false, reason: "missing" };
  if (hashPass(pass, rec.s) !== rec.h) return { ok: false, reason: "badpass" };
  return { ok: true, user: rec };
}

function dbPath() {
  return DB_PATH;
}

module.exports = {
  open,
  ensureAdmin,
  getUser,
  getAllUsers,
  userCount,
  createUser,
  setAdmin,
  setPassword,
  removeUser,
  verifyLogin,
  dbPath,
  ADMIN_NAME
};
