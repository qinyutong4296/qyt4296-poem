/* ============================================================
 * 墨韵诗境 · 应用主逻辑
 * 首页 / 觅句 / 墨馆（水墨画展） / 诗人 / 留言
 * 局域网多人：账号/诗笺墙/留言板经服务端共享；关页停后台并登出
 * ============================================================ */

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const ADMIN_NAME = "站长";

/* 内存缓存（由 API 拉取） */
let _wallCache = [];
let _boardCache = [];
let _usersCache = {};
let _registeredAt = null;
let _pollErrToasted = false;
let _pollTimer = null;
let _syncRev = "";
let _syncInFlight = false;

/* ---------------- 后台操作管理 ----------------
 * 所有定时器统一登记；页面隐藏时暂停轮播；
 * 页面关闭（pagehide/beforeunload）时：清除定时器与懒加载脚本、
 * 关闭站长后台等全部弹层，退出账户；
 * 若为本机 127.0.0.1 访问，再通知 Node 服务优雅退出。 */
const _bgTimers = new Set();
function bgSetInterval(fn, ms) { const id = setInterval(fn, ms); _bgTimers.add(id); return id; }
function bgSetTimeout(fn, ms) {
  const id = setTimeout((...a) => { _bgTimers.delete(id); fn(...a); }, ms);
  _bgTimers.add(id); return id;
}
function bgClear(id) { if (id == null) return; clearInterval(id); clearTimeout(id); _bgTimers.delete(id); }

let _cleanedUp = false;
function cleanupBackground() {
  if (_cleanedUp) return;
  _cleanedUp = true;
  _bgTimers.forEach(id => { clearInterval(id); clearTimeout(id); });
  _bgTimers.clear();
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  mingjuTimer = null;
  if (typeof _pendingScripts !== "undefined") {
    _pendingScripts.forEach(s => { s.onload = s.onerror = null; s.remove(); });
    _pendingScripts.clear();
  }
  document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open"));
  const chip = document.getElementById("user-chip");
  if (chip) chip.hidden = true;
  if (typeof MoyunAPI !== "undefined") {
    MoyunAPI.logoutBeacon();
    /* 仅本机网页关闭时停掉后台 Node；局域网访客关页不影响服务 */
    MoyunAPI.shutdownBeacon(1200);
  }
}
function resumeAfterBfcache() {
  _cleanedUp = false;
  if (typeof MoyunAPI !== "undefined") MoyunAPI.cancelShutdownBeacon();
  /* bfcache 会恢复上一用户停留的页签，统一拉回首页 */
  if (typeof landOnHome === "function") landOnHome();
  if (!loadSession()) {
    document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open"));
    if (typeof renderUserChip === "function") renderUserChip();
    if (typeof showGate === "function") showGate();
  } else {
    startOnlinePoll();
  }
  if (typeof startMingju === "function") startMingju();
}
window.addEventListener("pagehide", cleanupBackground);
window.addEventListener("beforeunload", cleanupBackground);
window.addEventListener("pageshow", e => {
  if (e.persisted) resumeAfterBfcache();
  else if (typeof MoyunAPI !== "undefined") MoyunAPI.cancelShutdownBeacon();
});
/* 本机刷新：pageshow 可能不带 persisted，靠 load 再取消一次停服 */
window.addEventListener("load", () => {
  if (typeof MoyunAPI !== "undefined") MoyunAPI.cancelShutdownBeacon();
});

/* ---------------- 通用 ---------------- */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  bgClear(t._timer);
  t._timer = bgSetTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------------- 页签导航 ---------------- */
$$(".nav-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".nav-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    $$(".page").forEach(p => p.classList.remove("active"));
    $("#page-" + btn.dataset.page).classList.add("active");
    setPageBackground(btn.dataset.page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});
function setPageBackground(name) {
  document.body.dataset.page = name;
  [...document.body.classList].forEach(c => {
    if (c.startsWith("on-page-")) document.body.classList.remove(c);
  });
  document.body.classList.add("on-page-" + name);
  $$(".bg-ink-img").forEach(img => {
    const on = img.dataset.page === name;
    if (on && img.dataset.src) {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    }
    img.classList.toggle("is-on", on);
  });
}
function gotoPage(name) {
  const btn = $(`.nav-tab[data-page="${name}"]`);
  if (btn) {
    $$(".nav-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  $$(".page").forEach(p => p.classList.remove("active"));
  const page = $("#page-" + name);
  if (page) page.classList.add("active");
  setPageBackground(name);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** 回到首页并清空创作/留言草稿（登录、退出、换号时统一调用） */
function landOnHome() {
  if (typeof resetUserTraces === "function") resetUserTraces();
  gotoPage("home");
}

/* ---------------- 首页：名句轮播 ---------------- */
let mingjuIdx = Math.floor(Math.random() * MINGJU.length);
let mingjuTimer = null;
function rotateMingju() {
  const el = $("#hero-mingju"), src = $("#hero-source");
  el.classList.add("fade");
  bgSetTimeout(() => {
    if (_cleanedUp) return;
    mingjuIdx = (mingjuIdx + 1 + Math.floor(Math.random() * 3)) % MINGJU.length;
    const m = MINGJU[mingjuIdx];
    el.innerHTML = m.text.split(/(?<=[，。？！；])/).map(s => `<span>${esc(s)}</span>`).join("<br>");
    src.textContent = "—— " + m.source;
    el.classList.remove("fade");
  }, 450);
}
function startMingju() { if (!mingjuTimer) mingjuTimer = bgSetInterval(rotateMingju, 6000); }
function stopMingju() { bgClear(mingjuTimer); mingjuTimer = null; }
rotateMingju();
startMingju();
$("#hero-mingju").addEventListener("click", rotateMingju);

/* 页面隐藏时暂停轮播；回到前台时校验会话（工坊换号常不刷新 iframe） */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopMingju();
    return;
  }
  if (_cleanedUp) return;
  startMingju();
  refreshWallBoard(false);
  /* 嵌入工坊时：父页切账号后 iframe 可能仍停在旧页签，回前台时拉回首页并核对身分 */
  revalidateSessionOnShow();
});

async function revalidateSessionOnShow() {
  if (typeof MoyunAPI === "undefined") return;
  const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const prev = _sessionUserKey;
  /* 工坊 iframe：父页切号/回大厅再进时常不重载，回前台一律回首页 */
  if (embedded && typeof landOnHome === "function") landOnHome();
  if (!MoyunAPI.getToken()) {
    if (prev || loadSession()) {
      saveSession(null);
      renderUserChip();
      showGate();
    } else if (!embedded && typeof landOnHome === "function") {
      landOnHome();
    }
    return;
  }
  try {
    const data = await MoyunAPI.me();
    const key = sessionUserKey(data.user);
    saveSession(data.user);
    renderUserChip();
    if (key !== prev) {
      _sessionUserKey = key;
      if (!embedded) landOnHome();
      hideGate();
      updateBoardSign();
      renderBoard();
      renderWall();
    }
  } catch {
    MoyunAPI.setToken("");
    saveSession(null);
    renderUserChip();
    showGate();
  }
}

/* ---------------- 首页：精选名篇 ---------------- */
let tagFilter = "全部", dynastyFilter = "全部";

function featuredPool() {
  let pool = ALL_POEMS;
  if (dynastyFilter !== "全部") pool = pool.filter(p => p.dynasty === dynastyFilter);
  if (tagFilter !== "全部") pool = pool.filter(p => (p.tags || []).includes(tagFilter));
  return pool;
}

function renderFeatured(shuffle = true) {
  let pool = [...featuredPool()];
  if (shuffle) pool.sort(() => Math.random() - 0.5);
  pool = pool.slice(0, 9);
  $("#featured-grid").innerHTML = pool.map(p => `
    <article class="poem-card" data-uid="${p.uid}">
      <div class="poem-card-head">
        <h4>${esc(p.title)}</h4>
        <span class="poet-tag">${esc(p.poetName)} · ${esc(p.dynasty)}</span>
      </div>
      <p class="poem-excerpt">${esc(p.content.slice(0, 2).join(" "))}</p>
      <div class="poem-card-foot">
        <span class="form-tag">${esc(p.form)}</span>
        ${(p.tags || []).slice(0, 2).map(t => `<span class="mini-tag">${esc(t)}</span>`).join("")}
      </div>
    </article>`).join("");
  $$("#featured-grid .poem-card").forEach(card => {
    card.addEventListener("click", () => {
      const p = ALL_POEMS.find(x => x.uid === card.dataset.uid);
      if (p) openPoemModal(p);
    });
  });
  $("#featured-count").textContent = `共 ${featuredPool().length} 篇`;
}

function renderFilters() {
  $("#dynasty-chips").innerHTML = HOME_DYNASTIES.map(d =>
    `<button class="chip ${d === dynastyFilter ? "on" : ""}" data-d="${d}">${d}</button>`).join("");
  $("#tag-chips").innerHTML = ["全部", ...ALL_TAGS].map(t =>
    `<button class="chip ${t === tagFilter ? "on" : ""}" data-t="${t}">${t}</button>`).join("");
  $$("#dynasty-chips .chip").forEach(c => c.addEventListener("click", () => {
    dynastyFilter = c.dataset.d; renderFilters(); renderFeatured(false);
  }));
  $$("#tag-chips .chip").forEach(c => c.addEventListener("click", () => {
    tagFilter = c.dataset.t; renderFilters(); renderFeatured(false);
  }));
}

$("#btn-refresh-featured").addEventListener("click", () => renderFeatured(true));

/* ---------------- 诗笺墙 / 留言板（服务端共享） ---------------- */
function loadWall() { return _wallCache; }
function loadBoard() { return _boardCache; }

function applySyncRev(data) {
  if (data && data.rev) _syncRev = data.rev;
}

function wallSnapshot(list) {
  return JSON.stringify((list || []).map(w => [w.id, w.likes, w.ts]));
}
function boardSnapshot(list) {
  return JSON.stringify((list || []).map(m => [m.id, m.ts, !!m.applyDone]));
}

async function refreshWallBoard(forceRender) {
  if (typeof MoyunAPI === "undefined") return;
  if (_syncInFlight && !forceRender) return;
  _syncInFlight = true;
  try {
    const data = await MoyunAPI.sync(forceRender ? "" : _syncRev);
    if (data && data.notModified) {
      _pollErrToasted = false;
      return;
    }
    const wall = (data && data.wall) || [];
    const board = (data && data.board) || [];
    if (data && data.rev) _syncRev = data.rev;
    const wallChanged = forceRender || wallSnapshot(_wallCache) !== wallSnapshot(wall);
    const boardChanged = forceRender || boardSnapshot(_boardCache) !== boardSnapshot(board);
    _wallCache = wall;
    _boardCache = board;
    _pollErrToasted = false;
    if (wallChanged) renderWall();
    if (boardChanged) renderBoard();
    if ((wallChanged || boardChanged) && $("#admin-modal").classList.contains("open")) {
      renderAdmin();
    }
  } catch (e) {
    if (!_pollErrToasted) {
      _pollErrToasted = true;
      toast(e.offline ? "无法连接服务器，请先运行 start.bat" : (e.message || "同步失败"));
    }
  } finally {
    _syncInFlight = false;
  }
}

function startOnlinePoll() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(() => {
    if (_cleanedUp || document.hidden) return;
    refreshWallBoard(false);
  }, 8000);
}

function renderWall() {
  const wall = loadWall();
  const s = loadSession();
  const canTakeDown = !!(s && s.admin);
  $("#wall-count").textContent = wall.length ? `${wall.length} 笺` : "";
  if (!wall.length) {
    $("#wall-grid").innerHTML = `<div class="wall-empty">
      <p>诗笺墙上还空空如也。</p>
      <p>去「觅句」以关键词赋诗一首，将得意之作张贴于此，与同好共赏。</p>
      <button class="btn btn-ink" id="goto-create">前往觅句</button>
    </div>`;
    $("#goto-create").addEventListener("click", () => gotoPage("create"));
    return;
  }
  $("#wall-grid").innerHTML = wall.map(w => {
    const v = wallLinesHTML(w.lines);
    return `
    <article class="wall-card">
      <div class="wall-art">${inkArt(w.scene, w.seed, { era: eraOfDynasty(w.style), motifs: motifsFromLines(w.lines) })}</div>
      <div class="wall-body">
        <div class="wall-poem ${v.cls}">${v.html}</div>
        <div class="wall-meta">
          <h4>${esc(w.title)}</h4>
          <p class="wall-author">落款 · ${esc(w.author)}</p>
          <p class="wall-date">${new Date(w.ts).toLocaleDateString("zh-CN")}</p>
        </div>
        <div class="wall-actions">
          <button class="wall-btn" data-act="like" data-id="${esc(w.id)}">♥ <span>${w.likes || 0}</span></button>
          ${canTakeDown ? `<button class="wall-btn" data-act="del" data-id="${esc(w.id)}">取下</button>` : ""}
        </div>
      </div>
    </article>`;
  }).join("");
  $$("#wall-grid .wall-btn").forEach(btn => btn.addEventListener("click", async e => {
    e.stopPropagation();
    const id = btn.dataset.id;
    if (btn.dataset.act === "like") {
      try {
        const data = await MoyunAPI.wall.like(id);
        applySyncRev(data);
        if (data.wall) {
          _wallCache = data.wall;
        } else {
          const item = _wallCache.find(w => w.id === id);
          if (item) item.likes = data.likes != null ? data.likes : ((item.likes || 0) + 1);
        }
        const item = _wallCache.find(w => w.id === id);
        btn.querySelector("span").textContent = (item && item.likes) || data.likes || 0;
        btn.classList.add("liked");
      } catch (err) { toast(err.message || "点赞失败"); }
    } else {
      const cur = loadSession();
      if (!(cur && cur.admin)) { toast("仅站长可取下诗笺"); return; }
      try {
        const data = await MoyunAPI.wall.remove(id);
        applySyncRev(data);
        if (data.wall) _wallCache = data.wall;
        else _wallCache = _wallCache.filter(w => w.id !== id);
        renderWall();
        toast("已将诗笺取下");
      } catch (err) { toast(err.message || "取下失败"); }
    }
  }));
}

function updateBoardSign() {
  const s = loadSession();
  $("#board-name").textContent = s ? s.name : "无名墨客";
  /* 站长本人无须应聘，藏起勾选 */
  const isMaster = !!(s && s.admin && s.name === ADMIN_NAME);
  document.querySelector(".board-applychk").hidden = isMaster;
}

function renderBoard() {
  const board = loadBoard();
  const s = loadSession();
  const isMaster = !!(s && s.admin && s.name === ADMIN_NAME);
  $("#board-count").textContent = board.length ? `${board.length} 则` : "";
  if (!board.length) {
    $("#board-grid").innerHTML = `<div class="board-empty">
      <p>—— 留言板上还静悄悄的 ——</p>
      <p>题一句心爱的诗，或留一声问候，作第一个过境留痕的人。</p>
    </div>`;
    return;
  }
  /* 站长视角：应聘留言醒目（金边卡片 + 横幅），可直接任用 */
  const pending = board.filter(m => m.apply && !m.applyDone);
  const applicants = new Set(pending.map(m => m.name));
  let html = "";
  if (isMaster && applicants.size) {
    html += `<div class="apply-banner">有 <b>${applicants.size}</b> 位墨客留言应聘管理员 —— 金边处可当场任用，或入「站长后台」料理。</div>`;
  }
  html += board.map(m => {
    const canDel = s && (s.admin || m.name === s.name);
    const isApply = !!(m.apply && !m.applyDone);
    const applyBtns = isMaster && isApply
      ? `<button class="board-btn act-ok" data-act="ok" data-name="${esc(m.name)}">任为管理员</button>
         <button class="board-btn" data-act="ignore" data-ts="${m.ts}">忽 略</button>`
      : "";
    const delBtn = canDel ? `<button class="board-btn" data-act="del" data-id="${esc(m.id)}">取 下</button>` : "";
    const foot = (applyBtns || delBtn) ? `<div class="board-foot">${applyBtns}${delBtn}</div>` : "";
    return `
    <article class="board-card${isApply && isMaster ? " apply-card" : ""}">
      <div class="board-head">
        <div class="board-avatar">${esc((m.name || "客").charAt(0))}</div>
        <div class="board-who">
          <b>${esc(m.name)}</b>${isApply ? ` <span class="apply-tag">求职管理员</span>` : ""}
          <small>${new Date(m.ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
        </div>
      </div>
      <p class="board-text">${esc(m.text)}</p>
      ${foot}
    </article>`;
  }).join("");
  $("#board-grid").innerHTML = html;
  $$("#board-grid .board-btn").forEach(btn => btn.addEventListener("click", async () => {
    const act = btn.dataset.act;
    if (act === "ok") { appointAdmin(btn.dataset.name); return; }
    if (act === "ignore") { ignoreApply(+btn.dataset.ts); return; }
    if (!btn.classList.contains("arm")) {
      btn.classList.add("arm");
      btn.textContent = "确认？";
      bgSetTimeout(() => { btn.classList.remove("arm"); btn.textContent = "取 下"; }, 2600);
      return;
    }
    try {
      const data = await MoyunAPI.board.remove(btn.dataset.id);
      applySyncRev(data);
      if (data.board) _boardCache = data.board;
      else _boardCache = _boardCache.filter(m => m.id !== btn.dataset.id);
      renderBoard();
      toast("已将留言取下");
    } catch (err) { toast(err.message || "取下失败"); }
  }));
}

$("#board-input").addEventListener("input", e => {
  $("#board-len").textContent = `${e.target.value.length} / 200`;
});
$("#board-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#board-submit").click();
});
$("#board-submit").addEventListener("click", async () => {
  const text = $("#board-input").value.trim();
  if (!text) { toast("先题几个字吧"); return; }
  if (!loadSession()) { toast("请先登录或游客进入"); return; }
  const apply = $("#board-applychk").checked;
  try {
    const data = await MoyunAPI.board.post(text, apply);
    applySyncRev(data);
    if (data.board) {
      _boardCache = data.board;
    } else if (data.item) {
      _boardCache = [data.item, ..._boardCache].slice(0, 200);
    }
    $("#board-input").value = "";
    $("#board-applychk").checked = false;
    $("#board-len").textContent = "0 / 200";
    renderBoard();
    toast("墨迹已题上留言板");
  } catch (err) { toast(err.message || "留言失败"); }
});

/* ---- 站长任用 / 撤职 / 料理应聘 ---- */
async function syncMe() {
  try {
    const data = await MoyunAPI.me();
    _registeredAt = data.registeredAt;
    saveSession(data.user);
    renderUserChip();
    updateBoardSign();
  } catch (_) {}
}
async function appointAdmin(name) {
  try {
    const data = await MoyunAPI.admin.appoint(name);
    applySyncRev(data);
    if (data.board) _boardCache = data.board;
    if (data.users) _usersCache = data.users;
    await syncMe();
    renderAdmin();
    renderBoard();
    toast("已任 " + name + " 为管理员");
  } catch (err) { toast(err.message || "任用失败"); }
}
async function revokeAdmin(name) {
  try {
    const data = await MoyunAPI.admin.revoke(name);
    if (data.users) _usersCache = data.users;
    await syncMe();
    renderAdmin();
    toast("已撤 " + name + " 的管理员");
  } catch (err) { toast(err.message || "撤职失败"); }
}
async function ignoreApply(ts) {
  try {
    const data = await MoyunAPI.admin.ignoreApply(ts);
    applySyncRev(data);
    _boardCache = data.board || _boardCache;
    renderBoard();
    renderAdmin();
  } catch (err) { toast(err.message || "操作失败"); }
}

/* ---------------- 账号：服务端注册 / 登录 / 游客 ---------------- */
function loadSession() {
  return (typeof MoyunAPI !== "undefined" && MoyunAPI.loadSession()) || null;
}
function saveSession(s) {
  if (typeof MoyunAPI !== "undefined") MoyunAPI.saveSession(s);
}

let authMode = "login";
function setAuthMode(m) {
  authMode = m;
  $("#auth-tab-login").classList.toggle("on", m === "login");
  $("#auth-tab-register").classList.toggle("on", m === "register");
  $("#auth-error").textContent = "";
}
function authError(msg) { $("#auth-error").textContent = msg; }

async function authSubmit() {
  const name = $("#auth-name").value.trim();
  const pass = $("#auth-pass").value;
  if (!/^[A-Za-z0-9\u4e00-\u9fff]{2,20}$/.test(name)) return authError("用户名须为 2 – 20 位中文 / 字母 / 数字");
  if (pass.length < 4) return authError("密码至少 4 位");
  try {
    if (authMode === "register") {
      if (name === ADMIN_NAME) return authError("「站长」名号为本站专设，不可注册");
      const u = await MoyunAPI.register(name, pass);
      enterSession(u, "私印已钤，欢迎入诗境");
    } else {
      const u = await MoyunAPI.login(name, pass);
      enterSession(u, "欢迎回来，" + name);
    }
    startOnlinePoll();
    refreshWallBoard(true);
  } catch (err) {
    authError(err.message || "出错了，再试一次");
  }
}

let _sessionUserKey = "";
function sessionUserKey(s) {
  return s && s.name ? (s.name + "\0" + (s.guest ? "1" : "0")) : "";
}

function enterSession(s, msg) {
  saveSession(s);
  _sessionUserKey = sessionUserKey(s);
  landOnHome(); /* 无论从哪一页登录，统一进首页并清痕迹 */
  hideGate();
  renderUserChip();
  updateBoardSign();
  renderBoard();
  renderWall();
  toast(msg || (s.guest ? "以游客身分入诗境" : "欢迎，" + s.name));
}
function showGate() {
  _sessionUserKey = "";
  landOnHome(); /* 出门禁时背后也停在首页，下一用户登录即见首页 */
  $("#auth-gate").classList.add("open");
  setAuthMode("login"); /* 退出后回到登录页签 */
  $("#auth-name").value = "";
  $("#auth-pass").value = "";
  $("#auth-error").textContent = "";
  bgSetTimeout(() => $("#auth-name").focus(), 60);
}
function hideGate() { $("#auth-gate").classList.remove("open"); }

function renderUserChip() {
  const chip = $("#user-chip");
  const s = loadSession();
  if (!s) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.classList.toggle("guest", !!s.guest);
  const isMaster = !!(s.admin && s.name === ADMIN_NAME);
  chip.innerHTML = `<span class="dot"></span>`
    + (s.admin ? `<i class="admin-badge${isMaster ? "" : " deputy"}">${isMaster ? "掌" : "管"}</i>` : "")
    + esc(s.guest ? "游客 · " + s.name : s.name);
}

function openAccountModal() {
  const s = loadSession();
  if (!s) return;
  const regTs = _registeredAt;
  const isMaster = !!(s.admin && s.name === ADMIN_NAME);
  $("#ac-title").textContent = s.guest ? "游客身分" : (isMaster ? "站长 · 账号" : (s.admin ? "管理员 · 账号" : "账号"));
  $("#ac-tip").textContent = s.guest ? "进度与诗笺均存于本站服务器，局域网同好共见" : "账号存于本站服务器 · 局域网同好共享";
  $("#ac-admin").hidden = !s.admin;
  $("#ac-body").innerHTML = s.guest
    ? `<p>当前以<b>游客</b>身分游历，落款为「${esc(s.name)}」。</p>
       <p>诗笺墙与留言存于本站服务器；若想留存私印，可退出后注册账号。</p>`
    : `<p>账号 <b>${esc(s.name)}</b>${regTs ? ` · 钤印于 ${new Date(regTs).toLocaleDateString("zh-CN")}` : (isMaster ? " · 与站同在" : "")}${isMaster ? ` · <b style="color:var(--gold)">站长</b>` : (s.admin ? ` · <b style="color:var(--ink-mid)">管理员（站长所任）</b>` : "")}</p>
       <p>登录期间发表的诗笺皆以此名落款；退出后可再以此名登录。</p>`
    + (isMaster
      ? `<p>于「站长后台」可删改诗笺与留言，任用或撤职管理员，并掌口令。</p>`
      : s.admin
        ? `<p>站长任你为管理员：于「站长后台」可删改诗笺墙上发布之作与留言板留言。</p>`
        : `<p style="color:var(--ink-soft);font-size:13px">「站长后台」由站长与所任管理员执掌。想成为管理员？去留言板勾选「应聘管理员」自荐，待站长任用。</p>`);
  $("#account-modal").classList.add("open");
  MoyunAPI.me().then(data => {
    _registeredAt = data.registeredAt;
    saveSession(data.user);
    renderUserChip();
  }).catch(() => {});
}

/* ---------------- 管理后台（站长 / 管理员） ---------------- */
function openAdminModal() {
  $("#account-modal").classList.remove("open");
  $("#admin-modal").classList.add("open");
  refreshAdminFromServer();
}

async function refreshAdminFromServer() {
  try {
    /* 先轻量同步墙/板，再拉用户名册（overview 不再整包回传墙板） */
    await refreshWallBoard(true);
    const data = await MoyunAPI.admin.overview();
    applySyncRev(data);
    if (data.wall) _wallCache = data.wall;
    if (data.board) _boardCache = data.board;
    _usersCache = data.users || {};
    renderAdmin();
  } catch (err) {
    toast(err.message || "无法打开后台");
    $("#admin-modal").classList.remove("open");
  }
}

function renderAdmin() {
  const s = loadSession();
  const isMaster = !!(s && s.admin && s.name === ADMIN_NAME);
  const wall = loadWall();
  const board = loadBoard();
  const users = _usersCache;
  $("#admin-stats").innerHTML =
    `<span>诗笺 <b>${wall.length}</b> 笺</span>` +
    `<span>留言 <b>${board.length}</b> 则</span>` +
    `<span>注册墨客 <b>${Object.keys(users).length}</b> 位</span>` +
    `<span>删除即时生效 · 存于本站</span>`;
  /* 求职、在任、口令、清空：站长专司；所任管理员只管删改 */
  $("#admin-applybox").hidden = !isMaster;
  $("#admin-rosterbox").hidden = !isMaster;
  $("#admin-passrow").hidden = !isMaster;
  $("#admin-clear").hidden = !isMaster;
  if (isMaster) {
    /* 求职管理员：按人去重，取其最新一条待任留言 */
    const seen = new Set();
    const rows = [];
    for (const m of board) {
      if (!m.apply || m.applyDone || seen.has(m.name)) continue;
      seen.add(m.name);
      rows.push(m);
    }
    const applyBox = $("#admin-apply");
    if (!rows.length) {
      applyBox.innerHTML = `<p class="admin-empty">—— 暂无人应聘 ——</p>`;
    } else {
      applyBox.innerHTML = rows.map(m => `
        <div class="admin-item">
          <div class="admin-item-main">
            <b>${esc(m.name)}</b>${users[m.name] ? `<span class="admin-meta">注册墨客</span>` : `<span class="admin-meta">游客 · 不可任用</span>`}
            <p>${esc(m.text)}</p>
          </div>
          <button class="admin-act" data-name="${esc(m.name)}">任 为 管 理 员</button>
          <button class="admin-act dim" data-ts="${m.ts}">忽 略</button>
        </div>`).join("");
      $$("#admin-apply .admin-act").forEach(btn => btn.addEventListener("click", () => {
        if (btn.dataset.name) appointAdmin(btn.dataset.name);
        else ignoreApply(+btn.dataset.ts);
      }));
    }
    /* 在任管理员 */
    const roster = Object.keys(users).filter(n => users[n].admin && n !== ADMIN_NAME);
    const rBox = $("#admin-roster");
    if (!roster.length) {
      rBox.innerHTML = `<p class="admin-empty">—— 尚无站长任用的管理员 ——</p>`;
    } else {
      rBox.innerHTML = roster.map(n => `
        <div class="admin-item">
          <div class="admin-item-main"><b>${esc(n)}</b><span class="admin-meta">管理员 · 站长所任</span></div>
          <button class="admin-act dim" data-name="${esc(n)}">撤 职</button>
        </div>`).join("");
      $$("#admin-roster .admin-act").forEach(btn => btn.addEventListener("click", () => revokeAdmin(btn.dataset.name)));
    }
  }
  const box = $("#admin-list");
  if (!wall.length) {
    box.innerHTML = `<p class="admin-empty">—— 诗笺墙上空空如也 ——</p>`;
  } else {
    box.innerHTML = wall.map(w => `
      <div class="admin-item">
        <div class="admin-item-main">
          <b>${esc(w.title)}</b>
          <span class="admin-meta">落款 · ${esc(w.author)} · ${new Date(w.ts).toLocaleDateString("zh-CN")}</span>
          <p>${esc((w.lines.find(l => l) || "") + (w.formName ? "　—　" + w.formName : ""))}</p>
        </div>
        <button class="admin-del" data-id="${esc(w.id)}">删 除</button>
      </div>`).join("");
    $$("#admin-list .admin-del").forEach(btn => btn.addEventListener("click", async () => {
      /* 两步确认：先点亮，再点才真删 */
      if (!btn.classList.contains("arm")) {
        btn.classList.add("arm");
        btn.textContent = "确认？";
        bgSetTimeout(() => { btn.classList.remove("arm"); btn.textContent = "删 除"; }, 2600);
        return;
      }
      try {
        const data = await MoyunAPI.wall.remove(btn.dataset.id);
        applySyncRev(data);
        if (data.wall) _wallCache = data.wall;
        else _wallCache = _wallCache.filter(w => w.id !== btn.dataset.id);
        renderAdmin();
        renderWall();
        toast("已将该诗笺取下");
      } catch (err) { toast(err.message || "删除失败"); }
    }));
  }
  /* 留言板整饬 */
  const bb = $("#admin-board");
  if (!board.length) {
    bb.innerHTML = `<p class="admin-empty">—— 留言板上静悄悄 ——</p>`;
  } else {
    bb.innerHTML = board.map(m => `
      <div class="admin-item">
        <div class="admin-item-main">
          <b>${esc(m.name)}</b>${m.apply && !m.applyDone ? ` <span class="apply-tag">求职管理员</span>` : ""}
          <span class="admin-meta">${new Date(m.ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <p>${esc(m.text)}</p>
        </div>
        <button class="admin-del" data-id="${esc(m.id)}">删 除</button>
      </div>`).join("");
    $$("#admin-board .admin-del").forEach(btn => btn.addEventListener("click", async () => {
      if (!btn.classList.contains("arm")) {
        btn.classList.add("arm");
        btn.textContent = "确认？";
        bgSetTimeout(() => { btn.classList.remove("arm"); btn.textContent = "删 除"; }, 2600);
        return;
      }
      try {
        const data = await MoyunAPI.board.remove(btn.dataset.id);
        applySyncRev(data);
        if (data.board) _boardCache = data.board;
        else _boardCache = _boardCache.filter(m => m.id !== btn.dataset.id);
        renderAdmin();
        renderBoard();
        toast("已将该留言取下");
      } catch (err) { toast(err.message || "删除失败"); }
    }));
  }
}

$("#ac-admin").addEventListener("click", openAdminModal);
$("#admin-done").addEventListener("click", () => $("#admin-modal").classList.remove("open"));
/* 站长改口令：写入服务器 */
$("#admin-setpass").addEventListener("click", async () => {
  const pass = $("#admin-newpass").value;
  if (pass.length < 4) { toast("新口令至少 4 位"); return; }
  try {
    await MoyunAPI.admin.setPass(pass);
    $("#admin-newpass").value = "";
    toast("站长口令已更新");
  } catch (err) { toast(err.message || "改口令失败"); }
});
$("#admin-clear").addEventListener("click", async e => {
  /* 两步确认 */
  const btn = e.currentTarget;
  if (!btn.classList.contains("arm")) {
    btn.classList.add("arm");
    btn.textContent = "再点一次，清空全墙";
    bgSetTimeout(() => { btn.classList.remove("arm"); btn.textContent = "清空诗笺墙"; }, 2600);
    return;
  }
  try {
    const data = await MoyunAPI.admin.clearWall();
    applySyncRev(data);
    _wallCache = data.wall || [];
    btn.classList.remove("arm");
    btn.textContent = "清空诗笺墙";
    renderAdmin();
    renderWall();
    toast("诗笺墙已清空");
  } catch (err) { toast(err.message || "清空失败"); }
});

$("#auth-tab-login").addEventListener("click", () => setAuthMode("login"));
$("#auth-tab-register").addEventListener("click", () => setAuthMode("register"));
$("#auth-submit").addEventListener("click", () => { authSubmit().catch(() => authError("出错了，再试一次")); });
$("#auth-pass").addEventListener("keydown", e => { if (e.key === "Enter") $("#auth-submit").click(); });
$("#auth-name").addEventListener("keydown", e => { if (e.key === "Enter") $("#auth-pass").focus(); });
$("#auth-guest").addEventListener("click", async () => {
  try {
    const u = await MoyunAPI.guest();
    enterSession(u, "以游客身分入诗境");
    startOnlinePoll();
    refreshWallBoard(true);
  } catch (err) { authError(err.message || "无法进入，请确认已运行 start.bat"); }
});
$("#user-chip").addEventListener("click", openAccountModal);
$("#ac-close").addEventListener("click", () => $("#account-modal").classList.remove("open"));
$("#ac-logout").addEventListener("click", async () => {
  try { await MoyunAPI.logout(); } catch (_) { saveSession(null); }
  $("#account-modal").classList.remove("open");
  renderUserChip();
  updateBoardSign();
  renderBoard();
  renderWall();
  showGate(); /* 内含 landOnHome：回首页并清痕迹 */
  toast("已退出，期待再会");
});

/* ---------------- 觅句（创作） ---------------- */
let currentPoem = null;

/** 清空本机界面上的用户痕迹（关键词、生成结果、留言草稿等），避免换账号后残留 */
function resetUserTraces() {
  currentPoem = null;
  const kw = $("#kw-input");
  if (kw) kw.value = "";
  const form = $("#form-select");
  if (form && form.options.length) form.value = "random";
  const style = $("#style-select");
  if (style && style.options.length) style.value = "random";
  const theme = $("#theme-select");
  if (theme && theme.options.length) theme.value = "auto";
  const empty = $("#result-empty");
  if (empty) empty.style.display = "";
  const box = $("#result-box");
  if (box) {
    box.style.display = "none";
    box.classList.remove("ink-in");
  }
  const art = $("#result-art");
  if (art) art.innerHTML = "";
  const title = $("#result-title");
  if (title) title.textContent = "";
  const formTag = $("#result-form");
  if (formTag) formTag.textContent = "";
  const prose = $("#result-prose");
  if (prose) prose.textContent = "";
  const appr = $("#result-appreciation");
  if (appr) appr.textContent = "";
  const lines = $("#result-lines");
  if (lines) { lines.className = "result-lines t1"; lines.innerHTML = ""; }
  const pub = $("#publish-modal");
  if (pub) pub.classList.remove("open");
  const pubName = $("#publish-name");
  if (pubName) pubName.value = "";
  const board = $("#board-input");
  if (board) {
    board.value = "";
    const len = $("#board-len");
    if (len) len.textContent = "0 / 200";
  }
  const applyChk = $("#board-applychk");
  if (applyChk) applyChk.checked = false;
}

/* 横排（一句一行）：自上而下排句，句多则缩小字号以少留白 */
function linesFlowHTML(lines, tiers) {
  const sent = (lines || []).filter(l => l);
  if (!sent.length) sent.push("　");
  const n = sent.length;
  let cls = tiers[tiers.length - 1];
  for (const [maxLines, c] of tiers) {
    if (n <= maxLines) { cls = c; break; }
  }
  return { html: sent.map(c => `<p>${esc(c)}</p>`).join(""), cls };
}
function resultLinesHTML(lines) {
  return linesFlowHTML(lines, [[4, "t1"], [8, "t2"], [16, "t3"], [Infinity, "t4"]]);
}
function wallLinesHTML(lines) {
  return linesFlowHTML(lines, [[6, "t1"], [Infinity, "t2"]]);
}

function cipaiTotal(id) {
  return CIPAI[id].lines.reduce((s, n) => s + n, 0);
}

function buildFormOptions() {
  /* 体裁：诗（绝句/律诗/古体） + 词（小令/中调/长调） + 曲 */
  const shiGroups = [
    ["绝句", ["wjue", "qjue", "ljue"]],
    ["律诗", ["wlv", "qlv"]],
    ["古体", ["syan", "wgu", "qgu", "cishu"]]
  ];
  const ciIds = Object.keys(CIPAI).filter(id => CIPAI[id].cat !== "qu");
  const quIds = Object.keys(CIPAI).filter(id => CIPAI[id].cat === "qu");
  const ling = ciIds.filter(id => cipaiTotal(id) <= 58);
  const diao = ciIds.filter(id => cipaiTotal(id) > 58 && cipaiTotal(id) <= 90);
  const chang = ciIds.filter(id => cipaiTotal(id) > 90);
  const opt = (v, t) => `<option value="${v}">${t}</option>`;
  const group = (label, ids, prefix) => ids.length
    ? `<optgroup label="${label}">${ids.map(id => opt(prefix + id, CIPAI[id].name)).join("")}</optgroup>`
    : "";
  $("#form-select").innerHTML =
    `<option value="random">随缘 · 不限体裁</option>` +
    `<optgroup label="现代"><option value="modern">现代诗 · 自由体</option></optgroup>` +
    shiGroups.map(([label, ids]) =>
      `<optgroup label="${label}">${ids.map(id => opt(id, POEM_FORMS[id].name)).join("")}</optgroup>`
    ).join("") +
    group("词 · 小令", ling, "ci_") +
    group("词 · 中调", diao, "ci_") +
    group("词 · 长调", chang, "ci_") +
    group("曲", quIds, "ci_");

  /* 风格：习全站语料，按朝代仿其遣词造句 */
  const dyns = (window.STYLE_INDEX && window.STYLE_INDEX.dyns) || [];
  $("#style-select").innerHTML =
    `<option value="random">随缘 · 千年诗风</option>` +
    dyns.map(d => `<option value="${d.id}">${d.name}风 · ${d.desc}</option>`).join("");

  $("#theme-select").innerHTML = `<option value="auto">自动 · 由关键词而定</option>` +
    THEME_GROUPS.map(g => `<optgroup label="${g.name}">` +
      g.themes.map(id => `<option value="${id}">${THEMES[id].name}</option>`).join("") +
      `</optgroup>`).join("");
}

async function doGenerate() {
  const raw = $("#kw-input").value.trim();
  const keywords = raw ? raw.split(/[\s,，、;；]+/).filter(Boolean).slice(0, 6) : [];
  const btns = [$("#btn-generate"), $("#btn-regenerate")];
  btns.forEach(b => { if (b) { b.disabled = true; b.dataset.txt = b.textContent; b.textContent = "研墨构思中…"; } });
  try {
    const poem = await PoemEngine.generate({
      keywords,
      form: $("#form-select").value,
      theme: $("#theme-select").value,
      style: $("#style-select") ? $("#style-select").value : "random"
    });
    currentPoem = poem;
    renderPoemResult(poem);
  } finally {
    btns.forEach(b => { if (b) { b.disabled = false; b.textContent = b.dataset.txt || "挥毫赋诗"; } });
  }
}

function renderPoemResult(p) {
  $("#result-empty").style.display = "none";
  const box = $("#result-box");
  box.style.display = "";
  box.classList.remove("ink-in");
  void box.offsetWidth;
  box.classList.add("ink-in");
  /* 配画：依诗之朝代取画派笔意，并取诗句中意象入画 */
  $("#result-art").innerHTML = inkArt(p.scene, p.title + p.lines[0] + p.seed, {
    era: eraOfDynasty(p.style),
    motifs: motifsFromLines(p.lines)
  });
  $("#result-title").textContent = p.title;
  $("#result-form").textContent = p.formName
    + (p.rhymeName ? " · 押" + p.rhymeName : "")
    + (p.style ? " · 仿" + p.style + "风" : "");
  $("#result-prose").textContent = p.prose;
  $("#result-appreciation").textContent = p.appreciation;
  const v = resultLinesHTML(p.lines);
  const linesEl = $("#result-lines");
  linesEl.className = "result-lines " + v.cls;
  linesEl.innerHTML = v.html;
}

$("#btn-generate").addEventListener("click", doGenerate);
$("#btn-regenerate").addEventListener("click", doGenerate);
$("#kw-input").addEventListener("keydown", e => { if (e.key === "Enter") doGenerate(); });
$$(".kw-suggest").forEach(b => b.addEventListener("click", () => {
  $("#kw-input").value = b.dataset.kw;
  doGenerate();
}));

$("#btn-copy").addEventListener("click", async () => {
  if (!currentPoem) return;
  const p = currentPoem;
  const text = `${p.title}\n${p.formName}\n\n${p.lines.join("\n")}\n\n${p.appreciation}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制到剪贴板");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("已复制到剪贴板");
  }
});

/* 发表 */
$("#btn-publish").addEventListener("click", () => {
  if (!currentPoem) return;
  const s = loadSession();
  $("#publish-name").value = s && s.name ? s.name : "";
  $("#publish-modal").classList.add("open");
  $("#publish-name").focus();
});
$("#publish-cancel").addEventListener("click", () => $("#publish-modal").classList.remove("open"));
$("#publish-confirm").addEventListener("click", async () => {
  const name = $("#publish-name").value.trim() || "无名墨客";
  const p = currentPoem;
  if (!p) return;
  try {
    const data = await MoyunAPI.wall.publish({
      title: p.title, formName: p.formName, lines: p.lines,
      scene: p.scene, prose: p.prose, seed: p.seed, style: p.style || "",
      author: name
    });
    applySyncRev(data);
    if (data.wall) {
      _wallCache = data.wall;
    } else if (data.item) {
      _wallCache = [data.item, ..._wallCache].slice(0, 60);
    }
    $("#publish-modal").classList.remove("open");
    $("#publish-name").value = "";
    renderWall();
    toast("诗笺已张贴上墙，可去首页查看");
    gotoPage("home");
  } catch (err) { toast(err.message || "发表失败"); }
});

/* ---------------- 诗人查询 ---------------- */
let poetDynasty = "全部";

function poetCountOf(d) {
  return (typeof POETS_INDEX !== "undefined" ? POETS_INDEX : []).filter(p => p.dyn === d).length;
}

function renderPoetDynastyChips() {
  $("#poet-dynasty-chips").innerHTML = DYNASTIES.map(d => {
    const n = d === "全部" ? (typeof POETS_INDEX !== "undefined" ? POETS_INDEX.length : 0) : poetCountOf(d);
    return `<button class="chip ${d === poetDynasty ? "on" : ""}" data-d="${d}" title="${n} 位">${d}${n ? `<small> ${n}</small>` : ""}</button>`;
  }).join("");
  $$("#poet-dynasty-chips .chip").forEach(c => c.addEventListener("click", () => {
    poetDynasty = c.dataset.d;
    poetGridLimit = 60;
    renderPoetDynastyChips();
    renderPoets($("#poet-search").value);
  }));
}

function poetCard(p) {
  const feat = p.feat ? findPoet(p.id) : null;
  const sub = feat ? `${esc(feat.honor)} · ${esc(feat.years)}` : `存诗 ${p.cnt} 首`;
  const style = feat ? feat.style : (typeof corpusBioText === "function" ? corpusBioText(p) : (p.bio || ""));
  return `<article class="poet-card" data-id="${p.id}">
    ${typeof poetPortraitHTML === "function" ? poetPortraitHTML(p.id, p.name, false) : `<div class="poet-avatar"><span>${esc(p.name.charAt(0))}</span></div>`}
    <div class="poet-info">
      <h4>${esc(p.name)} <small>${esc(p.dyn)}</small></h4>
      <p class="poet-honor">${sub}</p>
      <p class="poet-style">${esc(style.length > 42 ? style.slice(0, 42) + "…" : style)}</p>
      <p class="poet-works">${feat ? `精编小传 · 存诗 ${p.cnt} 首` : "点击展卷"}</p>
    </div>
  </article>`;
}

let _poemHitSeq = 0; /* 防止异步检索乱序覆盖 */
let poetGridLimit = 60; /* 诗人卡片分页展示，避免千位诗人一次渲染 */

function renderPoets(q) {
  q = (q || "").trim();
  const index = typeof POETS_INDEX !== "undefined" ? POETS_INDEX : [];
  let poets = index.filter(p => poetDynasty === "全部" || p.dyn === poetDynasty);
  let featPoemHits = [];
  if (q) {
    poets = poets.filter(p => {
      if (p.name.includes(q)) return true;
      if (p.feat) {
        const f = findPoet(p.id);
        if (f && ((f.zi || "").includes(q) || (f.hao || "").includes(q) ||
          (f.honor || "").includes(q) || f.bio.includes(q))) return true;
      }
      return false;
    });
    const r = searchAll(q);
    featPoemHits = r.poems.filter(p => poetDynasty === "全部" || p.dynasty === poetDynasty);
  }
  const shown = q ? poets : poets.slice(0, poetGridLimit);
  $("#poet-grid").innerHTML = (shown.length
    ? shown.map(poetCard).join("")
    : `<p class="empty-hint">未寻得相关诗人</p>`) +
    (!q && poets.length > poetGridLimit
      ? `<div class="grid-more"><button class="btn btn-ghost" id="poet-more">再展 60 位（余 ${poets.length - poetGridLimit} 位）</button></div>`
      : (!q && poets.length > 60 ? `<p class="empty-hint">—— 共 ${poets.length} 位，已全部展开 ——</p>` : ""));
  $$("#poet-grid .poet-card").forEach(card => {
    card.addEventListener("click", () => openPoetModal(card.dataset.id));
    if (typeof bindPoetPortraitFallback === "function") bindPoetPortraitFallback(card);
  });
  const moreBtn = $("#poet-more");
  if (moreBtn) moreBtn.addEventListener("click", () => { poetGridLimit += 60; renderPoets(""); });

  renderPoemHits(q, featPoemHits);
}

/* 相关诗词：精编全文命中 + 全库诗题命中（懒加载 titles.js） */
function renderPoemHits(q, featHits) {
  const sec = $("#poem-search-result");
  const seq = ++_poemHitSeq;
  if (!q) { sec.style.display = "none"; return; }

  const draw = titleHits => {
    if (seq !== _poemHitSeq) return; /* 已有更新的检索 */
    const seen = new Set(featHits.map(p => p.poetId + "|" + p.title));
    const merged = [
      ...featHits.map(p => ({ kind: "feat", p })),
      ...titleHits.filter(h => !seen.has(h.poetId + "|" + h.title)).map(h => ({ kind: "title", h }))
    ];
    if (!merged.length) { sec.style.display = "none"; return; }
    sec.style.display = "";
    const shown = merged.slice(0, 24);
    $("#poem-search-grid").innerHTML = shown.map((m, i) => {
      const title = m.kind === "feat" ? m.p.title : m.h.title;
      const poetName = m.kind === "feat" ? m.p.poetName : m.h.poetName;
      const dynasty = m.kind === "feat" ? m.p.dynasty : m.h.dynasty;
      const excerpt = m.kind === "feat" ? m.p.content.slice(0, 2).join(" ") : "点击查看全文";
      const form = m.kind === "feat" ? m.p.form : "语料库";
      return `<article class="poem-card" data-kind="${m.kind}" data-i="${i}">
        <div class="poem-card-head"><h4>${esc(title)}</h4>
        <span class="poet-tag">${esc(poetName)} · ${esc(dynasty)}</span></div>
        <p class="poem-excerpt">${esc(excerpt)}</p>
        <div class="poem-card-foot"><span class="form-tag">${esc(form)}</span></div>
      </article>`;
    }).join("") + (merged.length > 24 ? `<p class="empty-hint">…共 ${merged.length} 条，输入更精确的关键词可缩小范围</p>` : "");
    $$("#poem-search-grid .poem-card").forEach(card => card.addEventListener("click", () => {
      const m = shown[+card.dataset.i];
      if (m.kind === "feat") openPoemModal(m.p);
      else openPoemByTitle(m.h.poetId, m.h.title);
    }));
  };

  if (typeof ensureTitles === "function") {
    ensureTitles().then(() => draw(searchTitles(q, poetDynasty)));
  } else {
    draw([]);
  }
}

let poetSearchTimer;
$("#poet-search").addEventListener("input", e => {
  bgClear(poetSearchTimer);
  poetGridLimit = 60;
  poetSearchTimer = bgSetTimeout(() => renderPoets(e.target.value), 260);
});

/* ---------------- 弹窗：诗人详情（懒加载全作品） ---------------- */
const MODAL_PAGE = 80;
let _modalCtx = null; /* { poems, shown, filter } */

function openPoetModal(id) {
  const feat = findPoet(id);
  const idx = findIndexPoet(id);
  if (!feat && !idx) return;
  const name = feat ? feat.name : idx.name;
  const dyn = feat ? feat.dynasty : idx.dyn;

  const badges = feat
    ? `<span class="badge red">${esc(feat.honor)}</span>
       <span class="badge">字 ${esc(feat.zi)}</span>
       <span class="badge">号 ${esc(feat.hao)}</span>
       <span class="badge">${esc(feat.style)}</span>`
    : `<span class="badge red">存诗 ${idx.cnt} 首</span><span class="badge">${esc(dyn)}代</span>`;
  const years = feat ? ` · ${esc(feat.years)}` : "";
  const bioHTML = typeof composePoetBioHTML === "function"
    ? composePoetBioHTML(feat, idx)
    : `<h5>生平</h5><p>${esc(feat ? feat.bio : (idx.bio || ""))}</p>`;

  $("#poet-modal-body").innerHTML = `
    <div class="poet-detail">
      <div class="poet-detail-head">
        ${typeof poetPortraitHTML === "function" ? poetPortraitHTML(id, name, true) : `<div class="poet-avatar large"><span>${esc(name.charAt(0))}</span></div>`}
        <div>
          <h3>${esc(name)} <small>${esc(dyn)}${years}</small></h3>
          <div class="badge-row">${badges}</div>
        </div>
      </div>
      <div class="poet-bio">${bioHTML}</div>
      <div class="poet-poems" id="poet-poems-box">
        <h5>诗词作品 <small>（卷帙展开中…）</small></h5>
        <p class="empty-hint">正在加载「${esc(name)}」的作品…</p>
      </div>
    </div>`;
  $("#poet-modal").classList.add("open");
  if (typeof bindPoetPortraitFallback === "function") bindPoetPortraitFallback($("#poet-modal-body"));

  loadPoetPoems(id).then(data => {
    if (_cleanedUp) return;
    let poems = [];
    if (feat) poems = feat.poems.map(p => ({ title: p.title, form: p.form, content: p.content, tags: p.tags, note: p.note }));
    if (data && data.poems) {
      const seen = new Set(poems.map(p => p.title));
      data.poems.forEach(cp => {
        if (!seen.has(cp.t)) poems.push({ title: cp.t, form: cp.f, content: cp.c });
      });
    }
    _modalCtx = { poems, shown: 0, filter: "", poetId: id, poetName: name, dynasty: dyn };
    renderModalPoemHead();
    renderModalPoemList(true);
  });
}

function renderModalPoemHead() {
  const box = $("#poet-poems-box");
  if (!box || !_modalCtx) return;
  const total = _modalCtx.poems.length;
  box.innerHTML = `
    <h5>诗词作品 <small>（共 ${total} 首，点击可读全文）</small></h5>
    ${total > 30 ? `<div class="poet-poem-filter"><input id="pp-filter" type="text" placeholder="在「${esc(_modalCtx.poetName)}」的作品中筛选诗题…"></div>` : ""}
    <div id="pp-list"></div>
    <div id="pp-more-box"></div>`;
  const fi = $("#pp-filter");
  if (fi) fi.addEventListener("input", () => {
    _modalCtx.filter = fi.value.trim();
    renderModalPoemList(true);
  });
}

function renderModalPoemList(reset) {
  if (!_modalCtx) return;
  const { poems, filter } = _modalCtx;
  const list = filter
    ? poems.filter(p => p.title.includes(filter) || (p.content[0] || "").includes(filter))
    : poems;
  if (reset) _modalCtx.shown = 0;
  _modalCtx.shown = Math.min(list.length, _modalCtx.shown + MODAL_PAGE);
  const slice = list.slice(0, _modalCtx.shown);
  $("#pp-list").innerHTML = slice.map((poem, i) => `
    <div class="poet-poem-item" data-i="${i}">
      <span class="pp-title">${esc(poem.title)}</span>
      <span class="pp-form">${esc(poem.form)}</span>
      <span class="pp-excerpt">${esc(poem.content[0] || "")}</span>
    </div>`).join("") || `<p class="empty-hint">无匹配作品</p>`;
  $("#pp-more-box").innerHTML = list.length > _modalCtx.shown
    ? `<button class="btn btn-ghost" id="pp-more">再展 ${Math.min(MODAL_PAGE, list.length - _modalCtx.shown)} 首（余 ${list.length - _modalCtx.shown}）</button>`
    : (list.length > MODAL_PAGE ? `<p class="empty-hint">—— 已全部展开，共 ${list.length} 首 ——</p>` : "");
  $$("#pp-list .poet-poem-item").forEach(item => item.addEventListener("click", () => {
    const poem = slice[+item.dataset.i];
    openPoemModal({ ...poem, poetId: _modalCtx.poetId, poetName: _modalCtx.poetName, dynasty: _modalCtx.dynasty });
  }));
  const more = $("#pp-more");
  if (more) more.addEventListener("click", () => renderModalPoemList(false));
}

/* 由诗题检索结果打开某首诗（先加载该诗人作品） */
function openPoemByTitle(poetId, title) {
  const idx = findIndexPoet(poetId);
  const feat = findPoet(poetId);
  if (feat) {
    const h = feat.poems.find(p => p.title === title);
    if (h) { openPoemModal({ ...h, poetId, poetName: feat.name, dynasty: feat.dynasty }); return; }
  }
  loadPoetPoems(poetId).then(data => {
    if (_cleanedUp) return;
    if (data && data.poems) {
      const cp = data.poems.find(p => p.t === title);
      if (cp) {
        openPoemModal({
          title: cp.t, form: cp.f, content: cp.c,
          poetId, poetName: feat ? feat.name : (idx ? idx.name : data.n),
          dynasty: feat ? feat.dynasty : (idx ? idx.dyn : data.dyn)
        });
        return;
      }
    }
    openPoetModal(poetId);
  });
}

/* ---------------- 弹窗：诗词全文 ---------------- */
/** 按配画宽高比放大弹窗：宽幅略扩，长卷置顶全宽展示 */
function fitWideInkLayout(card, detailSel, imgSel) {
  if (!card) return;
  card.classList.remove("is-panorama", "is-scroll");
  const detail = detailSel ? card.querySelector(detailSel) : null;
  if (detail) detail.classList.remove("is-panorama", "is-scroll");
  const img = card.querySelector(imgSel);
  if (!img) return;
  const apply = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    const ratio = w / h;
    card.classList.remove("is-panorama", "is-scroll");
    if (detail) detail.classList.remove("is-panorama", "is-scroll");
    if (ratio >= 2.3) {
      card.classList.add("is-scroll");
      if (detail) detail.classList.add("is-scroll");
    } else if (ratio >= 1.65) {
      card.classList.add("is-panorama");
      if (detail) detail.classList.add("is-panorama");
    }
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener("load", apply, { once: true });
}

function openPoemModal(p) {
  const poet = p.poetId ? findPoet(p.poetId) : null;
  const card = $("#poem-modal .modal-card");
  card.classList.remove("is-panorama", "is-scroll");
  $("#poem-modal-body").innerHTML = `
    <div class="poem-detail">
      <div class="poem-detail-art">${inkArt(sceneOfPoem(p), p.title + p.content.join(""), { era: eraOfDynasty(p.dynasty), motifs: motifsFromLines(p.content) })}</div>
      <div class="poem-detail-main">
        <h3>${esc(p.title)}</h3>
        <p class="poem-detail-meta">
          <a href="javascript:void 0" id="pm-poet-link">${esc(p.poetName)}</a> · ${esc(p.dynasty)} · ${esc(p.form)}
        </p>
        <div class="poem-text">${p.content.map(l => `<p>${esc(l)}</p>`).join("")}</div>
        <div class="poem-detail-tags">${(p.tags || []).map(t => `<span class="mini-tag">${esc(t)}</span>`).join("")}</div>
        ${p.note ? `<div class="poem-note"><h5>赏析</h5><p>${esc(p.note)}</p></div>` : ""}
      </div>
    </div>`;
  if (poet || findIndexPoet(p.poetId)) {
    $("#pm-poet-link").addEventListener("click", () => {
      closeModals();
      openPoetModal(p.poetId);
    });
  }
  $("#poem-modal").classList.add("open");
  fitWideInkLayout(card, ".poem-detail", ".poem-detail-art img");
}

function sceneOfPoem(p) {
  const tags = p.tags || [];
  for (const id in THEMES) {
    if (THEMES[id].alias.some(a => tags.includes(a)) || tags.includes(THEMES[id].name)) return THEMES[id].scene;
  }
  const map = { 雪: "snow", 雨: "rain", 月: "moon", 春: "spring", 秋: "autumn", 荷: "river", 江: "river", 山: "mountain", 酒: "wine", 竹: "bamboo", 梅: "plum", 兰: "orchid", 菊: "chrys", 送别: "farewell", 思乡: "home", 爱情: "love", 相思: "love", 田园: "field", 边塞: "frontier", 爱国: "nation", 夜: "night", 悼亡: "autumn", 梦: "dream" };
  for (const t of tags) if (map[t]) return map[t];
  /* 无标签的语料诗词：由诗题/首句猜一个景 */
  const text = (p.title || "") + (p.content ? p.content[0] : "");
  for (const k in map) if (text.includes(k)) return map[k];
  return "default";
}

/* ---------------- 弹窗通用 ---------------- */
function closeModals() {
  $$(".modal").forEach(m => m.classList.remove("open"));
  $$(".modal-card.is-panorama, .modal-card.is-scroll").forEach(c => {
    c.classList.remove("is-panorama", "is-scroll");
  });
}
$$(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) closeModals(); }));
$$(".modal-close").forEach(b => b.addEventListener("click", closeModals));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModals(); });

/* ---------------- 墨馆 · 水墨画展 ---------------- */
const MOTIF_LABELS = {
  mountain: "山", mist: "云烟", figure: "人物", water: "水", pine: "松",
  blossom: "花", spring: "春", hut: "茅舍", geese: "禽鸟", bamboo: "竹",
  rock: "石", autumn: "秋", willow: "柳", moon: "月", plum: "梅",
  leaves: "落叶", night: "夜", boat: "舟", waterfall: "瀑泉", orchid: "兰",
  pavilion: "亭阁", rain: "雨", snow: "雪", wine: "酒", bridge: "桥",
  temple: "寺", horse: "马", fort: "关塞", lamp: "灯", stars: "星",
  chrys: "菊", travel: "行旅", zen: "禅", farewell: "送别", home: "归隐",
  winter: "冬", summer: "夏", river: "江河", wind: "风"
};
const GALLERY_DYN_ORDER = ["五代", "宋", "元", "明", "清", "现代"];
const GALLERY_PAGE = 12;

let galleryDynasty = "全部";
let galleryMotif = "全部";
let gallerySort = "dynasty";
let galleryLimit = GALLERY_PAGE;
let gallerySearchTimer = null;

function galleryAll() {
  return (typeof inkGallery === "function" ? inkGallery() : (window.INK_GALLERY || []));
}

function motifLabel(m) { return MOTIF_LABELS[m] || m; }

function gallerySearchBlob(g) {
  const motifs = (g.motifs || []).map(motifLabel).join("");
  const scenes = (g.scenes || []).map(motifLabel).join("");
  const loc = typeof inkLocalBlob === "function" ? inkLocalBlob(g) : "";
  return [g.title, g.artist, g.dynasty, motifs, scenes, loc, (g.motifs || []).join(""), (g.scenes || []).join("")].join("|");
}

function galleryMatchesQuery(g, q) {
  if (!q) return true;
  const blob = gallerySearchBlob(g);
  if (blob.includes(q) || blob.toLowerCase().includes(q.toLowerCase())) return true;
  if (typeof MOTIF_WORDS === "object") {
    for (const key in MOTIF_WORDS) {
      if (!MOTIF_WORDS[key].some(w => q.includes(w) || w.includes(q))) continue;
      if ((g.motifs || []).includes(key) || (g.scenes || []).includes(key)) return true;
    }
  }
  if (MOTIF_LABELS) {
    for (const key in MOTIF_LABELS) {
      const lab = MOTIF_LABELS[key];
      if (q.includes(lab) && ((g.motifs || []).includes(key) || (g.scenes || []).includes(key))) return true;
    }
  }
  return false;
}

function galleryPool() {
  let pool = galleryAll().slice();
  if (galleryDynasty !== "全部") pool = pool.filter(g => g.dynasty === galleryDynasty);
  if (galleryMotif !== "全部") {
    pool = pool.filter(g =>
      (g.motifs || []).includes(galleryMotif) || (g.scenes || []).includes(galleryMotif));
  }
  const q = ($("#gallery-search")?.value || "").trim();
  if (q) pool = pool.filter(g => galleryMatchesQuery(g, q));
  const dynRank = d => {
    const i = GALLERY_DYN_ORDER.indexOf(d);
    return i < 0 ? 99 : i;
  };
  pool.sort((a, b) => {
    if (gallerySort === "artist") {
      return a.artist.localeCompare(b.artist, "zh") || a.title.localeCompare(b.title, "zh");
    }
    if (gallerySort === "title") {
      return a.title.localeCompare(b.title, "zh") || a.artist.localeCompare(b.artist, "zh");
    }
    return dynRank(a.dynasty) - dynRank(b.dynasty) ||
      a.artist.localeCompare(b.artist, "zh") ||
      a.title.localeCompare(b.title, "zh");
  });
  return pool;
}

function renderGalleryDynastyChips() {
  const all = galleryAll();
  const counts = {};
  all.forEach(g => { counts[g.dynasty] = (counts[g.dynasty] || 0) + 1; });
  const dyns = ["全部", ...GALLERY_DYN_ORDER.filter(d => counts[d])];
  $("#gallery-dynasty-chips").innerHTML = dyns.map(d => {
    const n = d === "全部" ? all.length : (counts[d] || 0);
    return `<button type="button" class="chip ${d === galleryDynasty ? "on" : ""}" data-gd="${esc(d)}">${esc(d)}<small> ${n}</small></button>`;
  }).join("");
  $$("#gallery-dynasty-chips .chip").forEach(c => c.addEventListener("click", () => {
    galleryDynasty = c.dataset.gd;
    galleryLimit = GALLERY_PAGE;
    renderGalleryDynastyChips();
    renderGallery();
  }));
}

function renderGalleryMotifChips() {
  const counts = {};
  galleryAll().forEach(g => {
    new Set([...(g.motifs || []), ...(g.scenes || [])]).forEach(m => {
      if (!MOTIF_LABELS[m]) return;
      counts[m] = (counts[m] || 0) + 1;
    });
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 14).map(e => e[0]);
  const keys = ["全部", ...top];
  $("#gallery-motif-chips").innerHTML = keys.map(m => {
    const label = m === "全部" ? "全部" : motifLabel(m);
    const n = m === "全部" ? galleryAll().length : (counts[m] || 0);
    return `<button type="button" class="chip ${m === galleryMotif ? "on" : ""}" data-gm="${esc(m)}">${esc(label)}<small> ${n}</small></button>`;
  }).join("");
  $$("#gallery-motif-chips .chip").forEach(c => c.addEventListener("click", () => {
    galleryMotif = c.dataset.gm;
    galleryLimit = GALLERY_PAGE;
    renderGalleryMotifChips();
    renderGallery();
  }));
}

function renderHomeGalleryPreview() {
  const box = $("#home-gallery-preview");
  if (!box) return;
  const pool = [...galleryAll()].sort(() => Math.random() - 0.5).slice(0, 4);
  if (!pool.length) { box.innerHTML = ""; return; }
  box.innerHTML = pool.map(galleryCard).join("");
  $$("#home-gallery-preview .gallery-card").forEach(card => {
    card.addEventListener("click", () => openGalleryModal(card.dataset.inkId));
  });
}

function galleryCard(g) {
  const L = typeof localizeInk === "function" ? localizeInk(g) : { title: g.title, artist: g.artist, showTitleZh: false, showArtistZh: false };
  const tags = (g.motifs || []).slice(0, 3).map(m => `<span>${esc(motifLabel(m))}</span>`).join("");
  const artistLine = L.showArtistZh
    ? `${esc(L.artistZh)} · ${esc(g.dynasty)}`
    : `${esc(L.artist)} · ${esc(g.dynasty)}`;
  return `<article class="gallery-card" data-ink-id="${esc(g.id)}" title="点击鉴赏">
    <div class="gallery-card-frame">
      <img src="${typeof inkThumbUrl === "function" ? inkThumbUrl(g.file, 420) : ("assets/inkart/" + esc(g.file))}" alt="${esc(L.titleZh || L.title)}" loading="lazy" decoding="async">
    </div>
    <div class="gallery-card-meta">
      <h4 class="gallery-card-title">${esc(L.title)}</h4>
      ${L.showTitleZh ? `<p class="gallery-card-title-zh">${esc(L.titleZh)}</p>` : ""}
      <p class="gallery-card-sub">${artistLine}</p>
      ${tags ? `<div class="gallery-card-tags">${tags}</div>` : ""}
    </div>
  </article>`;
}

function renderGallery() {
  const pool = galleryPool();
  const shown = pool.slice(0, galleryLimit);
  const grid = $("#gallery-grid");
  if (!grid) return;
  grid.innerHTML = shown.length
    ? shown.map(galleryCard).join("")
    : `<p class="gallery-empty">未寻得相关画作，可换个关键词或清空筛选再试。</p>`;
  $$("#gallery-grid .gallery-card").forEach(card => {
    card.addEventListener("click", () => openGalleryModal(card.dataset.inkId));
  });
  const more = $("#gallery-more");
  if (more) {
    const rest = pool.length - shown.length;
    more.hidden = rest <= 0;
    more.textContent = rest > 0 ? `再展一批（余 ${rest} 幅）` : "已全部展开";
  }
  const cnt = $("#gallery-count");
  if (cnt) {
    const q = ($("#gallery-search")?.value || "").trim();
    cnt.textContent = q || galleryDynasty !== "全部" || galleryMotif !== "全部"
      ? `得 ${pool.length} 幅 · 已展 ${shown.length}`
      : `馆藏 ${pool.length} 幅 · 已展 ${shown.length}`;
  }
  const clearBtn = $("#gallery-clear");
  if (clearBtn) clearBtn.hidden = !($("#gallery-search")?.value || "").trim();
}

function openGalleryModal(id) {
  const g = galleryAll().find(x => x.id === id);
  if (!g) return;
  const L = typeof localizeInk === "function" ? localizeInk(g) : { title: g.title, artist: g.artist, titleZh: g.title, artistZh: g.artist, showTitleZh: false, showArtistZh: false };
  const motifs = (g.motifs || []).map(m => `<span class="badge">${esc(motifLabel(m))}</span>`).join("");
  const scenes = (g.scenes || []).map(m => `<span class="badge">${esc(motifLabel(m))}</span>`).join("");
  const eraName = (typeof ERAS !== "undefined" && ERAS[g.era]) ? ERAS[g.era].name : "";
  const artistDisp = L.showArtistZh ? `${esc(L.artistZh)}（${esc(L.artist)}）` : esc(L.artist);
  const searchName = L.showTitleZh ? L.titleZh : L.title;
  const searchArtist = L.showArtistZh ? L.artistZh : L.artist;
  const card = $("#gallery-modal .modal-card");
  card.classList.remove("is-panorama", "is-scroll");
  $("#gallery-modal-body").innerHTML = `
    <div class="gallery-view">
      <img src="${typeof inkFullUrl === "function" ? inkFullUrl(g.file) : ("assets/inkart/" + esc(g.file))}" alt="${esc(L.titleZh || L.title)}" decoding="async" fetchpriority="high">
    </div>
    <div class="gallery-info">
      <h3>${esc(L.title)}</h3>
      ${L.showTitleZh ? `<p class="gallery-title-zh">${esc(L.titleZh)}</p>` : ""}
      <p class="gallery-artist">${artistDisp} · ${esc(g.dynasty)}${eraName ? ` · ${esc(eraName)}` : ""}</p>
      <div class="badge-row">${motifs}${scenes}</div>
      <h5>画意</h5>
      <p>此帧为公有领域历代书画藏本，收入墨馆以供观摩。觅句配图时，引擎亦依诗之朝代与意象，自此馆择最契者相配。</p>
      <h5>检索</h5>
      <p>可在墨馆以画名「${esc(searchName)}」、画家「${esc(searchArtist)}」或意象再搜同类。</p>
    </div>`;
  $("#gallery-modal").classList.add("open");
  fitWideInkLayout(card, "#gallery-modal-body", ".gallery-view img");
}

/* 配画点击 → 鉴赏 */
document.addEventListener("click", e => {
  const fig = e.target.closest?.(".ink-painting--open[data-ink-id]");
  if (!fig) return;
  e.preventDefault();
  openGalleryModal(fig.dataset.inkId);
});

function initGallery() {
  const total = $("#gallery-total");
  const n = galleryAll().length;
  if (total) total.textContent = n ? String(n) : "0";
  renderHomeGalleryPreview();
  if (!n) {
    const grid = $("#gallery-grid");
    if (grid) grid.innerHTML = `<p class="gallery-empty">墨馆暂未装裱藏画。</p>`;
    return;
  }
  renderGalleryDynastyChips();
  renderGalleryMotifChips();
  renderGallery();

  const goto = $("#goto-gallery");
  if (goto) goto.addEventListener("click", () => gotoPage("gallery"));

  const input = $("#gallery-search");
  if (input) {
    input.addEventListener("input", () => {
      bgClear(gallerySearchTimer);
      galleryLimit = GALLERY_PAGE;
      gallerySearchTimer = bgSetTimeout(renderGallery, 220);
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        input.value = "";
        galleryLimit = GALLERY_PAGE;
        renderGallery();
      }
    });
  }
  const clearBtn = $("#gallery-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (input) input.value = "";
      galleryLimit = GALLERY_PAGE;
      renderGallery();
      input?.focus();
    });
  }
  $$(".gallery-sort .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".gallery-sort .chip").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      gallerySort = btn.dataset.gsort || "dynasty";
      galleryLimit = GALLERY_PAGE;
      renderGallery();
    });
  });
  const more = $("#gallery-more");
  if (more) {
    more.addEventListener("click", () => {
      galleryLimit += GALLERY_PAGE;
      renderGallery();
    });
  }
}

/* ---------------- 诗人库统计数字 ---------------- */
if (typeof POETS_STATS !== "undefined") {
  const sp = $("#stat-poets"), sm = $("#stat-poems");
  if (sp) sp.textContent = POETS_STATS.poets;
  if (sm) sm.textContent = POETS_STATS.poems >= 10000
    ? (POETS_STATS.poems / 10000).toFixed(1).replace(/\.0$/, "") + " 万"
    : POETS_STATS.poems;
}

/* ---------------- 初始化 ---------------- */
/* 校验令牌会话，拉取墙与板，启动 5 秒轮询 */
(async function bootOnline() {
  if (typeof MoyunAPI === "undefined") {
    showGate();
    authError("缺少 api.js，请通过 start.bat 启动服务访问");
    return;
  }
  if (MoyunAPI.getToken()) {
    try {
      const data = await MoyunAPI.me();
      _registeredAt = data.registeredAt;
      saveSession(data.user);
      _sessionUserKey = sessionUserKey(data.user);
      landOnHome(); /* 每次进站（含工坊重开）都从首页开始 */
      renderUserChip();
      hideGate();
    } catch {
      MoyunAPI.setToken("");
      saveSession(null);
      showGate();
    }
  } else {
    showGate();
  }
  updateBoardSign();
  await refreshWallBoard(true);
  if (loadSession()) startOnlinePoll();
})();
buildFormOptions();
renderFilters();
renderFeatured(true);
renderPoetDynastyChips();
renderPoets("");
initGallery();
