/**
 * 墨韵诗境 · 局域网多人在线服务（跨机流畅优化版）
 * - 流式 gzip：JS/CSS/JSON 边压边发；图片绝不整包缓冲
 * - /api/thumb 按需缩略图 + 磁盘缓存（需 sharp）
 * - 静态长缓存 + ETag 304
 * - JSON 内存缓存；/api/sync 合并轮询，无变更 304
 * - 写操作响应减负，避免每次回传整墙
 */
const express = require("express");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const compression = require("compression");
const {
  readJSON, writeJSON, syncRev, newId, ADMIN_NAME
} = require("./store");
const UsersDB = require("./users-db");
const { createThumbHandler, sharpReady } = require("./thumb");

const PORT = Number(process.env.PORT) || 8787;
const ROOT = path.join(__dirname, "..");
const WALL_MAX = 60;
const BOARD_MAX = 200;

const app = express();
app.disable("x-powered-by");
app.set("etag", "weak");

/* 流式 gzip：图片 / 字体等跳过，JS/CSS/JSON/HTML 边压边发（不整包缓冲） */
app.use(compression({
  level: 4,
  threshold: 1024,
  filter(req, res) {
    if (/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp[34]|zip|gz|br)$/i.test(req.path || "")) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

/* ---- 会话：内存令牌 ---- */
const sessions = new Map(); /* token -> { name, guest, admin } */

function issueToken(user) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    name: user.name,
    guest: !!user.guest,
    admin: !!user.admin
  });
  return token;
}

function getAuth(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  return sessions.get(m[1]) || null;
}

function requireUser(req, res) {
  const u = getAuth(req);
  if (!u) { res.status(401).json({ error: "请先登录" }); return null; }
  return u;
}

function requireAdmin(req, res) {
  const u = requireUser(req, res);
  if (!u) return null;
  if (!u.admin) { res.status(403).json({ error: "需要管理员权限" }); return null; }
  return u;
}

function requireMaster(req, res) {
  const u = requireAdmin(req, res);
  if (!u) return null;
  if (u.name !== ADMIN_NAME) { res.status(403).json({ error: "仅站长可操作" }); return null; }
  return u;
}

function publicUser(u) {
  return { name: u.name, guest: !!u.guest, admin: !!u.admin };
}

function refreshAdminFlag(sess) {
  if (sess.guest) return sess;
  const rec = UsersDB.getUser(sess.name);
  sess.admin = !!(rec && rec.admin);
  return sess;
}

function sendJSON(res, data) {
  const body = JSON.stringify(data);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(body);
}

/** 条件请求：匹配则 304 */
function tryNotModified(req, res, rev) {
  const etag = "W/\"" + rev + "\"";
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-cache");
  const inm = req.headers["if-none-match"];
  if (inm && inm === etag) {
    res.status(304).end();
    return true;
  }
  if (req.query.rev && String(req.query.rev) === String(rev)) {
    res.status(304).end();
    return true;
  }
  return false;
}

function publicUsersMap(users) {
  return Object.fromEntries(
    Object.entries(users).map(([n, v]) => [n, { admin: !!v.admin, ts: v.ts || 0 }])
  );
}

UsersDB.open();
console.log("  [账号库] SQLite → " + UsersDB.dbPath());

/* ---- 缩略图（墨馆 / 诗笺墙 / 诗人像） ---- */
app.get("/api/thumb", createThumbHandler(ROOT));
app.get("/api/meta", (_req, res) => {
  sendJSON(res, { thumb: sharpReady(), rev: syncRev() });
});

/* ---- 合并同步：局域网轮询主入口 ---- */
app.get("/api/sync", (req, res) => {
  const rev = syncRev();
  if (tryNotModified(req, res, rev)) return;
  sendJSON(res, {
    rev,
    wall: readJSON("wall.json", []),
    board: readJSON("board.json", [])
  });
});

/* ---- 认证 ---- */
app.post("/api/register", (req, res) => {
  const name = String(req.body.name || "").trim();
  const pass = String(req.body.pass || "");
  if (!/^[A-Za-z0-9\u4e00-\u9fff]{2,20}$/.test(name)) {
    return res.status(400).json({ error: "用户名须为 2 – 20 位中文 / 字母 / 数字" });
  }
  if (pass.length < 4) return res.status(400).json({ error: "密码至少 4 位" });
  if (name === ADMIN_NAME) return res.status(400).json({ error: "「站长」名号为本站专设，不可注册" });
  if (UsersDB.getUser(name)) return res.status(400).json({ error: "此名已有墨客用过，换一个或直接登录" });
  try {
    UsersDB.createUser(name, pass, false);
  } catch (err) {
    return res.status(400).json({ error: err.message || "注册失败" });
  }
  const token = issueToken({ name, guest: false, admin: false });
  sendJSON(res, { token, user: { name, guest: false, admin: false } });
});

app.post("/api/login", (req, res) => {
  const name = String(req.body.name || "").trim();
  const pass = String(req.body.pass || "");
  const result = UsersDB.verifyLogin(name, pass);
  if (!result.ok && result.reason === "missing") {
    return res.status(400).json({ error: "未寻得此号，可先注册" });
  }
  if (!result.ok) return res.status(400).json({ error: "密码不对，再想想" });
  const token = issueToken({ name, guest: false, admin: !!result.user.admin });
  sendJSON(res, { token, user: { name, guest: false, admin: !!result.user.admin } });
});

app.post("/api/guest", (_req, res) => {
  const token = issueToken({ name: "无名墨客", guest: true, admin: false });
  sendJSON(res, { token, user: { name: "无名墨客", guest: true, admin: false } });
});

app.post("/api/logout", (req, res) => {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) sessions.delete(m[1]);
  const bodyTok = req.body && req.body.token;
  if (bodyTok) sessions.delete(String(bodyTok));
  sendJSON(res, { ok: true });
});

app.get("/api/me", (req, res) => {
  const u = getAuth(req);
  if (!u) return res.status(401).json({ error: "未登录" });
  refreshAdminFlag(u);
  const reg = UsersDB.getUser(u.name);
  sendJSON(res, {
    user: publicUser(u),
    registeredAt: reg && reg.ts ? reg.ts : null,
    userCount: UsersDB.userCount()
  });
});

/* ---- 诗笺墙 ---- */
app.get("/api/wall", (req, res) => {
  const rev = syncRev();
  if (tryNotModified(req, res, "w-" + rev)) return;
  sendJSON(res, { wall: readJSON("wall.json", []), rev });
});

app.post("/api/wall", (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const b = req.body || {};
  const item = {
    id: newId(),
    title: String(b.title || "").slice(0, 80),
    formName: String(b.formName || "").slice(0, 40),
    lines: Array.isArray(b.lines) ? b.lines.map(l => String(l).slice(0, 120)).slice(0, 40) : [],
    scene: String(b.scene || "").slice(0, 40),
    prose: String(b.prose || "").slice(0, 500),
    seed: String(b.seed || "").slice(0, 80),
    style: String(b.style || "").slice(0, 20),
    author: String(b.author || u.name).trim().slice(0, 20) || u.name,
    likes: 0,
    ts: Date.now()
  };
  if (!item.title || !item.lines.length) {
    return res.status(400).json({ error: "诗笺内容不完整" });
  }
  const wall = readJSON("wall.json", []);
  wall.unshift(item);
  writeJSON("wall.json", wall.slice(0, WALL_MAX));
  /* 只回新增条目，避免整墙回传 */
  sendJSON(res, { item, rev: syncRev() });
});

app.post("/api/wall/:id/like", (req, res) => {
  const wall = readJSON("wall.json", []);
  const item = wall.find(w => w.id === req.params.id);
  if (!item) return res.status(404).json({ error: "诗笺不存在" });
  item.likes = (item.likes || 0) + 1;
  writeJSON("wall.json", wall);
  sendJSON(res, { id: item.id, likes: item.likes, rev: syncRev() });
});

app.delete("/api/wall/:id", (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  let wall = readJSON("wall.json", []);
  const before = wall.length;
  wall = wall.filter(w => w.id !== req.params.id);
  if (wall.length === before) return res.status(404).json({ error: "诗笺不存在" });
  writeJSON("wall.json", wall);
  sendJSON(res, { id: req.params.id, wall, rev: syncRev() });
});

/* ---- 留言板 ---- */
app.get("/api/board", (req, res) => {
  const rev = syncRev();
  if (tryNotModified(req, res, "b-" + rev)) return;
  sendJSON(res, { board: readJSON("board.json", []), rev });
});

app.post("/api/board", (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const text = String(req.body.text || "").trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: "先题几个字吧" });
  const isMaster = u.admin && u.name === ADMIN_NAME;
  const item = {
    id: newId(),
    name: u.name,
    text,
    ts: Date.now(),
    apply: !isMaster && !!req.body.apply ? true : undefined
  };
  const board = readJSON("board.json", []);
  board.unshift(item);
  writeJSON("board.json", board.slice(0, BOARD_MAX));
  sendJSON(res, { item, rev: syncRev() });
});

app.delete("/api/board/:id", (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  let board = readJSON("board.json", []);
  const item = board.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "留言不存在" });
  if (!u.admin && item.name !== u.name) {
    return res.status(403).json({ error: "只能取下自己的留言" });
  }
  board = board.filter(m => m.id !== req.params.id);
  writeJSON("board.json", board);
  sendJSON(res, { id: req.params.id, rev: syncRev() });
});

/* ---- 管理（overview 不再整包回传墙/板，用本地 sync 缓存） ---- */
app.get("/api/admin/overview", (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  refreshAdminFlag(u);
  const users = UsersDB.getAllUsers();
  const wall = readJSON("wall.json", []);
  const board = readJSON("board.json", []);
  const roster = Object.keys(users).filter(n => users[n].admin && n !== ADMIN_NAME);
  sendJSON(res, {
    rev: syncRev(),
    users: publicUsersMap(users),
    roster,
    userCount: Object.keys(users).length,
    wallCount: wall.length,
    boardCount: board.length,
    isMaster: u.name === ADMIN_NAME
  });
});

app.post("/api/admin/appoint", (req, res) => {
  const u = requireMaster(req, res);
  if (!u) return;
  const name = String(req.body.name || "").trim();
  const rec = UsersDB.getUser(name);
  if (!rec) return res.status(400).json({ error: "游客无名籍，注册后方可用" });
  if (rec.admin) return res.status(400).json({ error: name + " 已是管理员" });
  UsersDB.setAdmin(name, true);
  const users = UsersDB.getAllUsers();
  const board = readJSON("board.json", []);
  board.forEach(m => { if (m.name === name) m.applyDone = true; });
  writeJSON("board.json", board);
  for (const s of sessions.values()) {
    if (s.name === name && !s.guest) s.admin = true;
  }
  sendJSON(res, { ok: true, board, users: publicUsersMap(users), rev: syncRev() });
});

app.post("/api/admin/revoke", (req, res) => {
  const u = requireMaster(req, res);
  if (!u) return;
  const name = String(req.body.name || "").trim();
  if (!name || name === ADMIN_NAME) return res.status(400).json({ error: "不可撤站长" });
  if (!UsersDB.getUser(name)) return res.status(404).json({ error: "无此用户" });
  UsersDB.setAdmin(name, false);
  const users = UsersDB.getAllUsers();
  for (const s of sessions.values()) {
    if (s.name === name && !s.guest) s.admin = false;
  }
  sendJSON(res, { ok: true, users: publicUsersMap(users) });
});

app.post("/api/admin/ignore-apply", (req, res) => {
  const u = requireMaster(req, res);
  if (!u) return;
  const ts = Number(req.body.ts);
  const board = readJSON("board.json", []);
  const m = board.find(x => x.ts === ts);
  if (m) { m.applyDone = true; writeJSON("board.json", board); }
  sendJSON(res, { board, rev: syncRev() });
});

app.post("/api/admin/clear-wall", (req, res) => {
  const u = requireMaster(req, res);
  if (!u) return;
  writeJSON("wall.json", []);
  sendJSON(res, { wall: [], rev: syncRev() });
});

app.post("/api/admin/set-pass", (req, res) => {
  const u = requireMaster(req, res);
  if (!u) return;
  const pass = String(req.body.pass || "");
  if (pass.length < 4) return res.status(400).json({ error: "新口令至少 4 位" });
  UsersDB.ensureAdmin();
  if (!UsersDB.setPassword(ADMIN_NAME, pass)) {
    return res.status(500).json({ error: "修改口令失败" });
  }
  sendJSON(res, { ok: true });
});

/* ---- 本机关闭网页 → 优雅停服（仅 127.0.0.1，刷新可取消） ---- */
let server = null;
let _shutdownTimer = null;
let _shuttingDown = false;

function clientIp(req) {
  const raw = (req.socket && req.socket.remoteAddress) || "";
  return String(raw).replace(/^::ffff:/i, "");
}

function isLocalRequest(req) {
  const ip = clientIp(req);
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

function cancelScheduledShutdown() {
  if (_shutdownTimer) {
    clearTimeout(_shutdownTimer);
    _shutdownTimer = null;
  }
}

function scheduleShutdown(ms) {
  cancelScheduledShutdown();
  const delay = Math.max(400, Math.min(8000, Number(ms) || 1200));
  console.log("  [停服] 本机网页已关闭，" + (delay / 1000).toFixed(1) + " 秒后停止服务（刷新可取消）…");
  _shutdownTimer = setTimeout(() => {
    _shutdownTimer = null;
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log("  [停服] 正在关闭服务…");
    const done = () => {
      console.log("  [停服] 已停止。窗口即将关闭。");
      process.exit(0);
    };
    if (server) server.close(done);
    else done();
    setTimeout(done, 2500).unref();
  }, delay);
}

app.post("/api/shutdown", (req, res) => {
  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: "仅本机可停止服务" });
  }
  const raw = req.body && req.body.delay != null ? req.body.delay : 1200;
  scheduleShutdown(raw);
  sendJSON(res, { ok: true, delay: Math.max(400, Math.min(8000, Number(raw) || 1200)) });
});

app.post("/api/shutdown/cancel", (req, res) => {
  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: "仅本机可取消停服" });
  }
  if (_shutdownTimer) {
    cancelScheduledShutdown();
    console.log("  [停服] 已取消（页面仍在）");
  }
  sendJSON(res, { ok: true });
});

/* ---- 静态站点：长缓存 + ETag，html 不缓存 ---- */
/* 静态根即项目根，须先拦下非站点资源：服务器源码与账号库（server/）、
 * 开发工具（tools/）、批处理与文档 —— 局域网任何设备都可达本服务 */
const PRIVATE_RE = /^\/(?:server|tools)(?:\/|$)|\/(?:start\.bat|修改日志\.docx)$|\.(?:db|db-wal|db-shm|bat|log|docx|py|mjs|json\.tmp)$/i;
app.use((req, res, next) => {
  let p = req.path || "";
  try { p = decodeURIComponent(p); } catch (_) { /* 异常编码按原样判 */ }
  if (PRIVATE_RE.test(p)) return res.status(404).end();
  next();
});
app.use(express.static(ROOT, {
  index: "index.html",
  extensions: ["html"],
  etag: true,
  lastModified: true,
  maxAge: 0,
  fallthrough: true,
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".html") {
      res.setHeader("Cache-Control", "no-cache");
      return;
    }
    if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(ext)) {
      /* 图片一周；带 ETag，改文件仍能 304/更新 */
      res.setHeader("Cache-Control", "public, max-age=604800");
      /* 允许 Range，大图可分段拉取 */
      res.setHeader("Accept-Ranges", "bytes");
      return;
    }
    if (/\.(js|css|map)$/i.test(ext)) {
      /* 业务脚本改动需立刻生效（登录回首页等），勿长缓存 */
      res.setHeader("Cache-Control", "no-cache");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=300");
  }
}));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "接口不存在" });
  res.status(404).send("未找到");
});

function lanIPs() {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

server = app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  墨韵诗境 · 局域网服务已启动（流式 gzip · 缩略图 · 轻量同步）");
  console.log("  本机访问:  http://127.0.0.1:" + PORT);
  const ips = lanIPs();
  if (ips.length) {
    ips.forEach(ip => console.log("  局域网:    http://" + ip + ":" + PORT));
  } else {
    console.log("  （未检测到局域网 IP，仅本机可访问）");
  }
  console.log("  缩略图:    " + (sharpReady() ? "已启用（sharp）" : "未启用（将 npm install sharp）"));
  console.log("  站长账号:  站长（口令以你设置的为准；新库首次启动会随机生成并打印一次）");
  console.log("  提示:      关闭本机网页将自动停止后台服务");
  console.log("  按 Ctrl+C 亦可手动停止");
  console.log("");
});

/* Wi‑Fi 下保持连接，减少握手；提高并发吞吐 */
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 120000;
server.maxConnections = 200;
if (typeof server.setTimeout === "function") server.setTimeout(120000);

process.on("SIGINT", () => {
  cancelScheduledShutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});
process.on("SIGTERM", () => {
  cancelScheduledShutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});

