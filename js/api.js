/**
 * 墨韵诗境 · 前端 API 客户端
 * token 存 sessionStorage：关标签即无；关页时 sendBeacon 登出
 * sync 支持 ETag / 304，局域网轮询几乎零流量
 */
(function (global) {
  const TOKEN_KEY = "moyun_token_v1";
  const SESSION_KEY = "moyun_session_v1"; /* 仅缓存当前用户展示信息 */

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  }
  function setToken(t) {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  function loadSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      return s && s.name ? s : null;
    } catch { return null; }
  }
  function saveSession(s) {
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (!opts.skipJsonHeader && opts.method && opts.method !== "GET") {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
    const tok = getToken();
    if (tok) headers.Authorization = "Bearer " + tok;
    let res;
    try {
      res = await fetch(path, Object.assign({}, opts, { headers }));
    } catch (e) {
      const err = new Error("无法连接服务器，请确认已运行 start.bat");
      err.offline = true;
      throw err;
    }
    if (res.status === 304) {
      return { notModified: true, status: 304 };
    }
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
    if (!res.ok) {
      const err = new Error((data && data.error) || ("请求失败 " + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function register(name, pass) {
    const data = await api("/api/register", { method: "POST", body: JSON.stringify({ name, pass }) });
    setToken(data.token);
    saveSession(data.user);
    return data.user;
  }

  async function login(name, pass) {
    const data = await api("/api/login", { method: "POST", body: JSON.stringify({ name, pass }) });
    setToken(data.token);
    saveSession(data.user);
    return data.user;
  }

  async function guest() {
    const data = await api("/api/guest", { method: "POST", body: "{}" });
    setToken(data.token);
    saveSession(data.user);
    return data.user;
  }

  function logoutBeacon() {
    const tok = getToken();
    if (tok && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify({ token: tok })], { type: "application/json" });
      navigator.sendBeacon("/api/logout", blob);
    }
    setToken("");
    saveSession(null);
  }

  function isLocalHost() {
    const h = location.hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "[::1]";
  }

  /** 本机关页 → 通知服务端停掉 Node（局域网访客关页不会触发） */
  function shutdownBeacon(delay) {
    if (!isLocalHost() || !navigator.sendBeacon) return false;
    const ms = delay == null ? 1200 : delay;
    try {
      return navigator.sendBeacon(
        "/api/shutdown",
        new URLSearchParams({ delay: String(ms) })
      );
    } catch (_) {
      return false;
    }
  }

  function cancelShutdownBeacon() {
    if (!isLocalHost() || !navigator.sendBeacon) return false;
    try {
      return navigator.sendBeacon("/api/shutdown/cancel", new URLSearchParams({ ok: "1" }));
    } catch (_) {
      return false;
    }
  }

  async function logout() {
    try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (_) {}
    setToken("");
    saveSession(null);
  }

  async function me() {
    const data = await api("/api/me");
    saveSession(data.user);
    return data;
  }

  /** 合并拉取墙+板；传 rev / ETag，无变更则 { notModified: true } */
  async function sync(rev) {
    const headers = {};
    if (rev) headers["If-None-Match"] = "W/\"" + rev + "\"";
    const q = rev ? ("?rev=" + encodeURIComponent(rev)) : "";
    return api("/api/sync" + q, { headers, skipJsonHeader: true });
  }

  const wall = {
    list: () => api("/api/wall"),
    publish: (body) => api("/api/wall", { method: "POST", body: JSON.stringify(body) }),
    like: (id) => api("/api/wall/" + encodeURIComponent(id) + "/like", { method: "POST", body: "{}" }),
    remove: (id) => api("/api/wall/" + encodeURIComponent(id), { method: "DELETE" })
  };

  const board = {
    list: () => api("/api/board"),
    post: (text, apply) => api("/api/board", { method: "POST", body: JSON.stringify({ text, apply: !!apply }) }),
    remove: (id) => api("/api/board/" + encodeURIComponent(id), { method: "DELETE" })
  };

  const admin = {
    overview: () => api("/api/admin/overview"),
    appoint: (name) => api("/api/admin/appoint", { method: "POST", body: JSON.stringify({ name }) }),
    revoke: (name) => api("/api/admin/revoke", { method: "POST", body: JSON.stringify({ name }) }),
    ignoreApply: (ts) => api("/api/admin/ignore-apply", { method: "POST", body: JSON.stringify({ ts }) }),
    clearWall: () => api("/api/admin/clear-wall", { method: "POST", body: "{}" }),
    setPass: (pass) => api("/api/admin/set-pass", { method: "POST", body: JSON.stringify({ pass }) })
  };

  global.MoyunAPI = {
    getToken, setToken, loadSession, saveSession,
    api, register, login, guest, logout, logoutBeacon, me, sync,
    isLocalHost, shutdownBeacon, cancelShutdownBeacon,
    wall, board, admin
  };
})(window);
