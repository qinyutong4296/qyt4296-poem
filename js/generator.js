/* ============================================================
 * 墨韵诗境 · 觅句引擎
 *
 * 仿古作句两条路子：
 * 1) 诗风语言模型（主路）：离线由 tools/build-style-model.mjs
 *    自全站语料（二十七万余首，先秦至清）按朝代统计出
 *    n-gram 语言模型 —— 起字表、二字/三字/四字接续、句尾字表，
 *    并以近体互押聚类出韵部。觅句时按所选朝代懒加载模型，
 *    逐字采样成句：接续与收字皆出自该朝真实用字习惯，
 *    韵脚取自同一韵部，故遣词造句随朝代而变。
 * 2) 内置意象片段引擎（备路）：模型缺失或采样失败时，
 *    以主题意象库 + 韵尾词组拼句兜底。
 * ============================================================ */

const PoemEngine = (() => {

  /* ================= 通用工具 ================= */

  function pick(arr, used) {
    if (!arr || !arr.length) return "";
    for (let t = 0; t < 40; t++) {
      const c = arr[Math.floor(Math.random() * arr.length)];
      if (!used || !used.has(c)) { if (used) used.add(c); return c; }
    }
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  /* 加权随机：list = [[item, w], …] */
  function weighted(list) {
    let total = 0;
    for (const e of list) total += e[1];
    if (!total) return null;
    let r = Math.random() * total;
    for (const e of list) { r -= e[1]; if (r <= 0) return e[0]; }
    return list[list.length - 1][0];
  }

  /* 行内重复二字子串（防「故园故园中」） */
  function hasRepeat2(line) {
    const seen = new Set();
    for (let i = 0; i < line.length - 1; i++) {
      const g = line.slice(i, i + 2);
      if (seen.has(g)) return true;
      seen.add(g);
    }
    return false;
  }
  /* 与已有句 ≥3 字公共子串（防跨行撞车） */
  function crossConflict(line, usedLines) {
    for (const l of usedLines) {
      for (let i = 0; i <= line.length - 3; i++) {
        if (l.includes(line.slice(i, i + 3))) return true;
      }
    }
    return false;
  }
  const CJK_OK = s => /^[\u3400-\u9fff]+$/.test(s);

  /* ================= 风格模型仓库 ================= */

  const StyleStore = {
    _cache: {}, _promises: {},
    index() { return (typeof window !== "undefined" && window.STYLE_INDEX) || null; },
    get(id) {
      if (this._cache[id]) return this._cache[id];
      const w = typeof window !== "undefined" ? window : null;
      if (w && w.STYLE_MODELS && w.STYLE_MODELS[id]) {
        this._cache[id] = w.STYLE_MODELS[id];
        return this._cache[id];
      }
      return null;
    },
    ensure(id) {
      const m = this.get(id);
      if (m) return Promise.resolve(m);
      if (typeof _injectScript !== "function") return Promise.resolve(null);
      if (!this._promises[id]) {
        this._promises[id] = new Promise(res => {
          _injectScript("js/data/style/" + encodeURIComponent(id) + ".js",
            () => res(this.get(id)),
            () => res(null));
        });
      }
      return this._promises[id];
    },
    ensureHub() { return this.ensure("__hub__"); },
    setModel(id, m) { this._cache[id] = m; } /* 供离线试验台注入 */
  };

  /* ---------- 模型查询（本朝优先，hub 兜底） ---------- */
  function mB2(m, h, ch) { return m.b2[ch] || (h && h.b2[ch]) || null; }
  function mB3(m, h, ctx) { return m.b3[ctx] || (h && h.b3[ctx]) || null; }
  function mB4(m, h, ctx) { return m.b4[ctx] || (h && h.b4[ctx]) || null; }

  /* 池化起字/句尾表（各句长合并，带缓存） */
  function pooledL(m) {
    if (m._pooled) return m._pooled;
    const st = new Map(), ed = new Map();
    for (const bk in m.L) {
      for (const [ch, c] of m.L[bk].st) st.set(ch, (st.get(ch) || 0) + c);
      for (const [ch, c] of m.L[bk].ed) ed.set(ch, (ed.get(ch) || 0) + c);
    }
    m._pooled = {
      st: [...st.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300),
      ed: [...ed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300)
    };
    return m._pooled;
  }
  function startList(m, bk) {
    const L = m.L[bk];
    return (L && L.st.length >= 10) ? L.st : pooledL(m).st;
  }
  function endList(m, bk) {
    const L = m.L[bk];
    return (L && L.ed.length >= 8) ? L.ed : pooledL(m).ed;
  }

  /* ---------- 韵部 ---------- */
  /* 语料聚类韵部 → 借用 RHYMES 组名显示 */
  function clusterName(chars) {
    for (const id in RHYMES) {
      const g = RHYMES[id];
      const set = new Set([...g.tail3, ...g.tail2].map(t => t.slice(-1)));
      let n = 0;
      for (const c of chars) if (set.has(c)) n++;
      if (n >= 2) return g.name;
    }
    return "宽韵";
  }
  function clustersOf() {
    const idx = StyleStore.index();
    return (idx && idx.clusters && idx.clusters.length) ? idx.clusters : ["花霞家茶", "风空中东", "山间关颜"];
  }
  function zePoolSet() {
    const idx = StyleStore.index();
    const arr = (idx && idx.zePool && idx.zePool.length) ? idx.zePool
      : ["晓", "水", "里", "外", "处", "事", "意", "月", "雪", "夜", "客", "梦", "色", "白", "落"];
    return new Set(arr);
  }
  /* 仄韵词组 → 收字集合 */
  function zeGroupChars(g) {
    return new Set([...g.tail2, ...g.tail3].map(t => t.slice(-1)));
  }

  /* ================= 词牌句脚规划（两引擎共用） ================= */
  /* 依 seq/stanzas/changeRhyme 算出每句收脚：
   * ping=平韵（默认一韵到底，changeRhyme 逐片换韵）
   * ze=仄韵（默认一韵到底，changeRhyme 逐片换组）
   * free=不入韵 */
  function ciPlan(cp) {
    const seq = cp.seq || cp.lines.map((_, i) => (cp.rhyme === "ze" ? "ze" : cp.rhyme === "ping" ? "ping" : (i % 4 < 2 ? "ze" : "ping")));
    const stanzas = cp.stanzas || [seq.length];
    const stanzaOf = (() => {
      const bounds = [];
      let acc = 0;
      for (const n of stanzas) { bounds.push(acc); acc += n; }
      return i => { for (let s = bounds.length - 1; s >= 0; s--) if (i >= bounds[s]) return s; return 0; };
    })();
    const ends = [];
    let pingId = 0, zeId = 0, pingStanza = -1, zeStanza = -1;
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i], st = stanzaOf(i);
      if (t === "ping") {
        if (!ends._ping || (cp.changeRhyme && st !== pingStanza)) { ends._ping = "P" + (pingId++); pingStanza = st; }
        ends.push({ type: "ping", id: ends._ping });
      } else if (t === "ze") {
        if (!ends._ze || (cp.changeRhyme && st !== zeStanza)) { ends._ze = "Z" + (zeId++); zeStanza = st; }
        ends.push({ type: "ze", id: ends._ze });
      } else {
        ends.push({ type: "free" });
      }
    }
    const dups = cp.dups || (cp.dup !== undefined ? [cp.dup + 1] : []);
    /* dupTail: 取前句末 N 字的叠句（如忆秦娥「秦楼月」） */
    const dupTail = cp.dupTail || [];
    return { ends, dups, dupTail };
  }

  /* ================= 备路：意象片段引擎 ================= */

  const ALL_TAIL3 = [].concat(...Object.values(RHYMES).map(r => r.tail3));
  const ALL_TAIL2 = [].concat(...Object.values(RHYMES).map(r => r.tail2));

  /* end: {type:"rhyme",group}|{type:"zeRhyme",group}|{type:"ze"}|{type:"free"}
   * ctx: {imgPool, used, usedLines, kwImg} */
  function composeLine(len, end, ctx) {
    const tailSet = end.type === "rhyme" || end.type === "zeRhyme"
      ? { t3: end.group.tail3, t2: end.group.tail2 }
      : end.type === "ze" ? { t3: ZE_TAIL3, t2: ZE_TAIL2 }
      : { t3: ALL_TAIL3, t2: ALL_TAIL2 };

    for (let attempt = 0; attempt < 14; attempt++) {
      const snapshot = new Set(ctx.used);
      let kwUsed = false;
      const img = () => {
        if (ctx.kwImg && !kwUsed) { kwUsed = true; return ctx.kwImg; }
        return pick(ctx.imgPool, ctx.used);
      };
      const t3 = () => pick(tailSet.t3, ctx.used);
      const t2 = () => pick(tailSet.t2, ctx.used);

      let line = "";
      switch (len) {
        case 7: {
          const p = Math.random();
          if (p < 0.5) line = img() + pick(VP2, ctx.used) + t3();
          else if (p < 0.8) line = img() + img() + t3();
          else line = pick(PHRASE4, ctx.used) + t3();
          break;
        }
        case 6: {
          const p = Math.random();
          if (p < 0.45) line = img() + img() + t2();
          else if (p < 0.75) line = img() + pick(VP2, ctx.used) + t2();
          else line = pick(PHRASE4, ctx.used) + t2();
          break;
        }
        case 5:
          line = Math.random() < 0.6 ? img() + t3() : pick(VP2, ctx.used) + t3();
          break;
        case 4:
          line = Math.random() < 0.5 ? img() + img() : pick(PHRASE4, ctx.used);
          break;
        case 8:
          line = pick(PHRASE4, ctx.used) + pick(VP2, ctx.used) + t2();
          break;
        case 9:
          line = pick(PHRASE4, ctx.used) + img() + t3();
          break;
        case 3:
          line = pick(PHRASE3, ctx.used);
          break;
        case 2:
          line = t2();
          break;
        default:
          line = img() + t3();
      }

      if (!hasRepeat2(line) && !crossConflict(line, ctx.usedLines)) {
        if (ctx.kwImg && kwUsed) ctx.used.add(ctx.kwImg);
        ctx.usedLines.push(line);
        return line;
      }
      ctx.used = snapshot;
    }
    const fb = pick(ctx.imgPool, ctx.used) + pick(tailSet.t3, ctx.used);
    ctx.usedLines.push(fb);
    return fb;
  }

  function buildImgPool(themeIds) {
    let pool = [];
    themeIds.forEach(id => { pool = pool.concat(THEMES[id].img2); });
    if (!pool.length) pool = THEMES.yue.img2.concat(THEMES.shan.img2);
    return pool;
  }

  function fragShi(formId, themeIds, kwImg) {
    const form = POEM_FORMS[formId];
    const group = randOf(Object.values(RHYMES));
    const ctx = { imgPool: buildImgPool(themeIds), used: new Set(), usedLines: [], kwImg: null };
    const lines = [];
    for (let i = 0; i < form.lineCount; i++) {
      const isRhyme = form.rhymeLines.includes(i);
      const end = isRhyme ? { type: "rhyme", group } : { type: "ze" };
      ctx.kwImg = (i <= 1 && kwImg && !ctx.used.has(kwImg)) ? kwImg : null;
      lines.push(composeLine(form.lineLen, end, ctx));
    }
    return { kind: "shi", formName: form.name, lines, rhymeName: group.name };
  }

  function fragCi(cipaiId, themeIds, kwImg) {
    const cp = CIPAI[cipaiId];
    const plan = ciPlan(cp);
    const pingGroups = {}, zeGroups = {};
    const ctx = { imgPool: buildImgPool(themeIds), used: new Set(), usedLines: [], kwImg: null };
    const lines = [];
    cp.lines.forEach((len, i) => {
      if (plan.dups.includes(i)) { lines.push(lines[i - 1]); return; }
      if (plan.dupTail.includes(i)) { lines.push((lines[i - 1] || "").slice(-len)); return; }
      const e = plan.ends[i];
      let endSpec;
      if (e.type === "ping") {
        const g = pingGroups[e.id] || (pingGroups[e.id] = randOf(Object.values(RHYMES)));
        endSpec = { type: "rhyme", group: g };
      } else if (e.type === "ze") {
        const g = zeGroups[e.id] || (zeGroups[e.id] = randOf(Object.values(ZE_RHYMES)));
        endSpec = { type: "zeRhyme", group: g };
      } else endSpec = { type: "free" };
      ctx.kwImg = (i === 0 && kwImg && !ctx.used.has(kwImg)) ? kwImg : null;
      lines.push(composeLine(len, endSpec, ctx));
    });
    const names = [...new Set([...Object.values(pingGroups), ...Object.values(zeGroups)].map(g => g.name))];
    return { kind: "ci", formName: (CIPAI[cipaiId].cat === "qu" ? "曲 · " : "词 · ") + cp.name, lines, rhymeName: names.join("·") || "宽韵" };
  }

  /* 片段引擎的短句收尾（2 字及以下、模型作句失败时的兜底） */
  function fragTail(len, endSpec, ctx) {
    if (len <= 0) return "";
    if (len === 1) return "兮";
    const t2 = endSpec.group ? endSpec.group.tail2 : ZE_TAIL2;
    if (len === 2) return pick(t2, ctx.used).slice(0, 2);
    return pick(PHRASE3, ctx.used).slice(0, 3);
  }

  /* ================= 主路：诗风模型引擎 ================= */

  const DBG = { n: 0, ok: 0, failStart: 0, failMid: 0, failEnd: 0, failCheck: 0 };

  /* 种子候选：关键词 / 主题意象的真实接续大都在 b2 中可查 */
  function seedCandidates(m, h, kwInfo, themeIds) {
    const seeds = [];
    const known = (a, b) => !!(mB2(m, h, a) || []).some(e => e[0] === b);
    if (kwInfo) {
      if (kwInfo.bigram && known(kwInfo.bigram[0], kwInfo.bigram[1])) seeds.push([kwInfo.bigram, 6]);
      if (kwInfo.char) {
        const c = kwInfo.char;
        const mods = [...MODIFIERS].sort(() => Math.random() - 0.5);
        let got = 0;
        for (const mod of mods) {
          if (known(mod, c)) { seeds.push([mod + c, 4]); if (++got >= 2) break; }
          if (known(c, mod)) { seeds.push([c + mod, 3]); if (++got >= 2) break; }
        }
        if (!got && ((m.b2[c] || (h && h.b2[c])))) seeds.push([c, 2]);
      }
    }
    const pool = buildImgPool(themeIds);
    for (let t = 0; t < 2; t++) {
      const img = pool[Math.floor(Math.random() * pool.length)];
      if (img && img.length === 2 && known(img[0], img[1])) seeds.push([img, 1.5]);
    }
    return seeds;
  }

  /* 依模型采样一句 L 字；endInfo:
   * {type:"ping",chars:Set} | {type:"ze",chars:Set} | {type:"free"} */
  function modelLine(m, h, L, endInfo, ctx, seeds) {
    if (L < 3) return null;
    const bk = String(Math.min(L, 9));
    const sList = startList(m, bk);
    const eList = endList(m, bk);

    /* 收字候选集 */
    let endCands;
    if (endInfo.type === "free") {
      endCands = eList;
    } else {
      endCands = eList.filter(e => endInfo.chars.has(e[0]));
      if (endCands.length < 3) {
        for (const ch of endInfo.chars) endCands.push([ch, 1]);
      }
    }
    const endSet = new Set(endCands.map(e => e[0]));
    const endW = {};
    for (const [ch, w] of endCands) endW[ch] = w;

    for (let attempt = 0; attempt < 48; attempt++) {
      DBG.n++;
      /* 起头：关键词/意象种子优先，其次该朝起字表 */
      let line = null;
      if (seeds && seeds.length && Math.random() < 0.72) {
        const s = weighted(seeds);
        if (s && s.length <= L) line = s;
      }
      if (!line) {
        const st = weighted(sList.map(e => [e[0], e[1]]));
        if (st) line = st;
      }
      if (!line) { DBG.failStart++; continue; }

      /* 逐字接续：b4/b3/b2 三级合并加权（高层级权重高）；
       * 白话新语料（ctx.hiW）更倚重高阶接续，句块贴近原作 */
      let ok = true;
      while (line.length < L - 1) {
        const c3 = line.slice(-3), c2 = line.slice(-2), c1 = line.slice(-1);
        const acc = new Map();
        const add = (arr, w) => { if (arr) for (const e of arr) acc.set(e[0], (acc.get(e[0]) || 0) + e[1] * w); };
        add(mB4(m, h, c3), ctx.hiW ? 10 : 4);
        add(mB3(m, h, c2), ctx.hiW ? 5 : 2);
        add(mB2(m, h, c1), 1);
        if (!acc.size) { ok = false; break; }
        /* 忌 ABA/AAA（言语言），容 AA（悠悠） */
        let list = [...acc.entries()];
        if (line.length >= 2) {
          const prev2 = line[line.length - 2];
          list = list.filter(e => e[0] !== prev2);
        }
        const need2 = L - line.length === 2; /* 本字为倒数第二字 */
        if (need2) {
          const good = list.filter(e => {
            const nx = m.b2[e[0]] || (h && h.b2[e[0]]);
            return nx && nx.some(x => endSet.has(x[0]));
          });
          if (good.length) list = good;
        }
        const ch = weighted(list);
        if (!ch) { ok = false; break; }
        line += ch;
      }
      if (!ok) { DBG.failMid++; continue; }

      /* 收字：优先有真实接续（前字→韵脚），偶尔才容许强塞；
       * 叠字收尾（悠悠/年年）须是语料高频叠字才放行；
       * 已用过的句尾二字组合尽量不再选，免得通篇「有酒」连收 */
      const prev = line.slice(-1);
      const nx = (m.b2[prev] || (h && h.b2[prev]) || []).filter(e => endSet.has(e[0]));
      let fin = null;
      if (nx.length) {
        const cand = nx.filter(e => e[0] !== prev || e[1] >= 8);
        const usedTails = new Set((ctx.usedLines || []).map(l => String(l).slice(-2)));
        const fresh = cand.filter(e => !usedTails.has(prev + e[0]));
        const pool = fresh.length ? fresh : cand;
        if (pool.length) fin = weighted(pool.map(e => [e[0], e[1] * (endW[e[0]] || 1)]));
      }
      if (!fin && Math.random() < 0.07) fin = weighted(endCands.map(e => [e[0], e[1]]));
      if (!fin) { DBG.failEnd++; continue; }
      line += fin;

      if (line.length !== L || !CJK_OK(line)) { DBG.failCheck++; continue; }
      if (/(.)\1\1/.test(line) || hasRepeat2(line) || crossConflict(line, ctx.usedLines)) { DBG.failCheck++; continue; }
      /* 白话句忌「的」字空转：一行至多两个 */
      if (ctx.hiW && (line.match(/的/g) || []).length > 2) { DBG.failCheck++; continue; }
      ctx.usedLines.push(line);
      DBG.ok++;
      return line;
    }
    return null;
  }

  function kwInfoOf(keywords, m, h) {
    const kw = keywords.length ? keywords[0] : "";
    if (!kw || kw.length > 2) return null;
    if (kw.length === 2) return { bigram: kw, char: null };
    return { bigram: null, char: kw };
  }

  /* ---------- 现代自由体（白话新诗） ----------
   * 行末不押古典韵部，收字一任模型句尾表（的/了/我/花/雨…），
   * 行长自由、分节书写，节间以空行隔开。 */

  /* 短句（1..2 字）直接由句长起字表与接续表采样，避免古体词尾混入 */
  function modelShort(m, L, ctx) {
    if (L === 1) {
      const c = pick(pooledL(m).st.map(e => e[0]), ctx.used);
      if (!c || crossConflict(c, ctx.usedLines)) return null;
      ctx.usedLines.push(c);
      return c;
    }
    const st = m.L && m.L["2"] && m.L["2"].st;
    if (!st || st.length < 4) return null;
    for (let attempt = 0; attempt < 20; attempt++) {
      let line = weighted(st.map(e => [e[0], e[1]]));
      while (line && line.length < L) {
        const nx = m.b2[line.slice(-1)];
        if (!nx) { line = null; break; }
        line += weighted(nx.map(e => [e[0], e[1]]));
      }
      if (!line) continue;
      if (hasRepeat2(line) || crossConflict(line, ctx.usedLines)) continue;
      ctx.usedLines.push(line);
      return line;
    }
    return null;
  }

  /* 自由体行长分布：3..10 字，中长行为主 */
  function modernLineLen() {
    const bag = [3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 9, 10];
    return bag[Math.floor(Math.random() * bag.length)];
  }

  /* 真实句块池（模型内置 S 表，仅白话新语料）：径取语料原句为行。
   * minL/maxL 限定句长；L 固定的旧体裁须精确等长，自由体取 4..10 字。 */
  function realSegment(m, minL, maxL, ctx) {
    if (!m || !m.S) return null;
    const bk = String(Math.min(minL, 9));
    const arr = m.S[bk] || (maxL > 9 ? m.S["9"] : null);
    if (!arr || !arr.length) return null;
    for (let t = 0; t < 24; t++) {
      const s = weighted(arr);
      if (!s || s.length < minL || s.length > maxL) continue;
      if (hasRepeat2(s) || crossConflict(s, ctx.usedLines)) continue;
      ctx.usedLines.push(s);
      return s;
    }
    return null;
  }

  /* 一首现代诗：2~3 节，每节 2~4 行，共 7~9 行，节间空行 */
  function genModern(m, h, themeIds, kwInfo) {
    const fragCtx = makeFragCtx(themeIds, null);
    const seeds = m ? seedCandidates(m, h, kwInfo, themeIds) : [];
    const ctx = m ? { usedLines: fragCtx.usedLines, used: fragCtx.used, hiW: true } : fragCtx;
    const lines = [];
    const stanzaN = 2 + (Math.random() < 0.45 ? 1 : 0);
    let left = 7 + Math.floor(Math.random() * 3);
    for (let s = 0; s < stanzaN; s++) {
      const n = Math.max(2, Math.round(left / (stanzaN - s)));
      left -= n;
      for (let i = 0; i < n; i++) {
        const L = modernLineLen();
        const useSeeds = (s === 0 && i === 0) ? seeds : null;
        /* 六成径取语料原句（句块池），余者模型采样 */
        let seg = (m && Math.random() < 0.6 && realSegment(m, 4, 10, ctx)) || null;
        if (!seg && m) seg = modelLine(m, h, L, { type: "free" }, ctx, useSeeds);
        if (!seg) seg = composeLine(L, { type: "free" }, fragCtx);
        lines.push(seg);
      }
      if (s < stanzaN - 1) lines.push("");
    }
    return { kind: "shi", formName: "现代诗 · 自由体", lines, rhymeName: "" };
  }

  /* noRhyme：白话新语料（现代风）不入古典韵部，句脚一任句尾表 */
  function genShiModel(formId, m, h, themeIds, kwInfo, noRhyme) {
    const form = POEM_FORMS[formId];
    const cluster = randOf(clustersOf());
    const cSet = new Set(cluster.split(""));
    const zeSet = zePoolSet();
    const ctx = { usedLines: [], used: new Set(), hiW: !!noRhyme };
    const fragCtx = makeFragCtx(themeIds, null);
    const seeds = seedCandidates(m, h, kwInfo, themeIds);
    if (fragCtx.kwImg === null && seeds.length) {
      for (const s of seeds) if (s[0].length === 2) { fragCtx.kwImg = s[0]; break; }
    }
    const lines = [];
    for (let i = 0; i < form.lineCount; i++) {
      const L = form.lineLen;
      if (form.xi && form.xi.includes(i)) { /* 楚辞体：兮句不入韵 */
        const seg = modelLine(m, h, L, { type: "free" }, ctx, i === 0 ? seeds : null)
          || composeLine(L, { type: "free" }, fragCtx);
        lines.push(seg + "兮");
        continue;
      }
      const endInfo = noRhyme ? { type: "free" }
        : form.rhymeLines.includes(i)
          ? { type: "ping", chars: cSet }
          : { type: "ze", chars: zeSet };
      const fragEnd = noRhyme || endInfo.type === "free" ? { type: "free" }
        : endInfo.type === "ping" ? { type: "rhyme", group: nearGroup(cluster) }
        : { type: "ze" };
      const seg = (noRhyme && Math.random() < 0.6 && realSegment(m, L, L, ctx))
        || modelLine(m, h, L, endInfo, ctx, i <= 1 ? seeds : null)
        || composeLine(L, fragEnd, fragCtx);
      lines.push(seg);
    }
    return { kind: "shi", formName: form.name, lines, rhymeName: noRhyme ? "" : clusterName(cluster) };
  }

  function genCiModel(cipaiId, m, h, themeIds, kwInfo, noRhyme) {
    const cp = CIPAI[cipaiId];
    const plan = ciPlan(cp);
    const pingClusters = {}, zeSets = {};
    const fragCtx = makeFragCtx(themeIds, null);
    const seeds = seedCandidates(m, h, kwInfo, themeIds);
    if (fragCtx.kwImg === null && seeds.length) {
      for (const s of seeds) if (s[0].length === 2) { fragCtx.kwImg = s[0]; break; }
    }
    const ctx = { usedLines: fragCtx.usedLines, used: fragCtx.used, hiW: !!noRhyme };
    const lines = [];
    cp.lines.forEach((len, i) => {
      if (plan.dups.includes(i)) { lines.push(lines[i - 1]); return; }
      if (plan.dupTail.includes(i)) { lines.push((lines[i - 1] || "").slice(-len)); return; }
      const e = plan.ends[i];
      let endInfo, fragEnd;
      if (e.type === "ping" && !noRhyme) {
        const cl = pingClusters[e.id] || (pingClusters[e.id] = randOf(clustersOf()));
        endInfo = { type: "ping", chars: new Set(cl.split("")) };
        fragEnd = { type: "rhyme", group: nearGroup(cl) };
      } else if (e.type === "ze" && !noRhyme) {
        const g = zeSets[e.id] || (zeSets[e.id] = randOf(Object.values(ZE_RHYMES)));
        endInfo = { type: "ze", chars: zeGroupChars(g) };
        fragEnd = { type: "zeRhyme", group: g };
      } else {
        endInfo = { type: "free" };
        fragEnd = { type: "free" };
      }
      const useSeeds = i === 0 ? seeds : null;
      const seg = len >= 3
        ? ((noRhyme && Math.random() < 0.6 && realSegment(m, len, len, ctx))
          || modelLine(m, h, len, endInfo, ctx, useSeeds)
          || composeLine(len, fragEnd, fragCtx))
        : (noRhyme
          ? (realSegment(m, len, len, ctx) || modelShort(m, len, ctx) || fragTail(len, fragEnd, fragCtx) || "")
          : fragTail(len, fragEnd, fragCtx));
      lines.push(seg);
    });
    const names = noRhyme ? []
      : [...new Set(Object.values(pingClusters).map(cl => clusterName(cl)))
        ].concat([...new Set(Object.values(zeSets).map(g => g.name))]);
    return {
      kind: "ci", formName: (cp.cat === "qu" ? "曲 · " : "词 · ") + cp.name,
      lines, rhymeName: names.join("·") || ""
    };
  }

  /* 聚类韵部 → 就近的 RHYMES 组（片段引擎兜底用） */
  function nearGroup(clusterChars) {
    let best = null, bestN = -1;
    for (const id in RHYMES) {
      const g = RHYMES[id];
      const set = new Set([...g.tail3, ...g.tail2].map(t => t.slice(-1)));
      let n = 0;
      for (const c of clusterChars) if (set.has(c)) n++;
      if (n > bestN) { bestN = n; best = g; }
    }
    return best || randOf(Object.values(RHYMES));
  }
  function makeFragCtx(themeIds, seeds) {
    const ctx = { imgPool: buildImgPool(themeIds), used: new Set(), usedLines: [], kwImg: null };
    if (seeds) for (const s of seeds) if (s[0].length === 2) { ctx.kwImg = s[0]; break; }
    return ctx;
  }

  /* ================= 关键词 → 主题（沿用 v1） ================= */
  function matchOne(kw) {
    for (const id in THEMES) if (THEMES[id].alias.includes(kw)) return id;
    let best = null, bestLen = 0;
    for (const id in THEMES) {
      for (const a of THEMES[id].alias) {
        if (kw.includes(a) && a.length > bestLen) { best = id; bestLen = a.length; }
      }
    }
    if (best) return best;
    if (kw.length === 1) {
      for (const id in THEMES) if (THEMES[id].alias.some(a => a.includes(kw))) return id;
    }
    return null;
  }
  function matchThemes(keywords) {
    const ids = [];
    keywords.forEach(kw => {
      const id = matchOne(kw);
      if (id && !ids.includes(id)) ids.push(id);
    });
    return ids.slice(0, 3);
  }

  /* ================= 标题与配文 ================= */
  function makeTitle(keywords, themeIds, bare) {
    let head = "";
    const firstMatch = keywords.length ? matchOne(keywords[0]) : null;
    if (firstMatch) {
      head = randOf(THEMES[firstMatch].titleWords);
    } else if (keywords.length && keywords[0].length <= 3) {
      head = keywords[0];
    } else if (themeIds.length) {
      head = randOf(THEMES[themeIds[0]].titleWords);
    } else head = "无题";
    if (bare) return head;
    return "《" + head + pick(TITLE_SUFFIX) + "》";
  }

  function genNotes(themeIds, keywords, formName) {
    const t = themeIds.length ? THEMES[themeIds[0]] : THEMES.yue;
    const imgs = [...t.img2].sort(() => Math.random() - 0.5);
    const k = keywords.length ? keywords[0] : t.name;
    const appreciation = pick(APPRECIATION_TPL)
      .replaceAll("{k}", k)
      .replaceAll("{t}", t.name)
      .replaceAll("{m}", t.mood)
      .replaceAll("{i1}", imgs[0])
      .replaceAll("{i2}", imgs[1] || imgs[0])
      .replaceAll("{f}", formName)
      + "整体来看" + pick(STYLE_NOTES) + "。";
    const proseArr = PROSE_TPL[t.scene] || PROSE_TPL.default;
    return { appreciation, prose: pick(proseArr), scene: t.scene, mood: t.mood };
  }

  /* ================= 主入口 ================= */
  async function generate(opt) {
    const keywords = (opt.keywords || []).map(s => s.trim()).filter(Boolean);
    let themeIds = matchThemes(keywords);
    if (opt.theme && opt.theme !== "auto" && THEMES[opt.theme]) {
      themeIds = [opt.theme, ...themeIds.filter(id => id !== opt.theme)];
    }
    if (!themeIds.length) themeIds = [randOf(Object.keys(THEMES))];

    /* 关键词字面：≤2 字入句，长词入题 */
    const kwImg = keywords.length
      ? (keywords[0].length === 1 ? randOf(MODIFIERS) + keywords[0]
        : keywords[0].length === 2 ? keywords[0] : null)
      : null;

    /* 体裁 */
    let form = opt.form || "random";
    if (form === "random") {
      const all = [...Object.keys(POEM_FORMS), ...Object.keys(CIPAI).map(c => "ci_" + c)];
      form = randOf(all);
    }

    /* 风格：默认依语料规模加权随缘 */
    const idx = StyleStore.index();
    let styleId = opt.style || "random";
    if (styleId === "random") {
      /* 现代自由体若未指定风格，默认习现代语料 */
      if (form === "modern") styleId = "xiandai";
      else {
        const dyns = (idx && idx.dyns) || [];
        if (dyns.length) {
          const total = dyns.reduce((s, d) => s + Math.sqrt(d.segs), 0);
          let r = Math.random() * total;
          styleId = dyns[dyns.length - 1].id;
          for (const d of dyns) { r -= Math.sqrt(d.segs); if (r <= 0) { styleId = d.id; break; } }
        } else styleId = "tang";
      }
    }

    let result = null, styleName = "";
    try {
      const [m, hub] = await Promise.all([StyleStore.ensure(styleId), StyleStore.ensureHub()]);
      /* 现代语料不并入 hub，以免白话功能字混入古体；故现代风以本模型自为兜底 */
      const h = styleId === "xiandai" ? m : hub;
      if (m) {
        const noRhyme = styleId === "xiandai";
        const kwInfo = kwInfoOf(keywords, m, h);
        result = form === "modern"
          ? genModern(m, h, themeIds, kwInfo)
          : form.startsWith("ci_")
            ? genCiModel(form.slice(3), m, h, themeIds, kwInfo, noRhyme)
            : genShiModel(form, m, h, themeIds, kwInfo, noRhyme);
        const meta = idx && idx.dyns.find(d => d.id === styleId);
        styleName = meta ? meta.name : "";
      }
    } catch (e) { /* 模型不可用，走备路 */ }

    if (!result) {
      if (form === "modern") {
        result = genModern(null, null, themeIds, null);
      } else {
        result = form.startsWith("ci_")
          ? fragCi(form.slice(3), themeIds, kwImg)
          : fragShi(form, themeIds, kwImg);
      }
      result.fallback = true;
    }

    result.title = result.kind === "ci"
      ? result.formName.replace(/^[词曲] · /, "") + "·" + makeTitle(keywords, themeIds, true)
      : makeTitle(keywords, themeIds, false);
    result.themeIds = themeIds;

    const notes = genNotes(themeIds, keywords, result.formName);
    result.appreciation = notes.appreciation;
    if (styleName) result.appreciation += pick(STYLE_TPL).replaceAll("{d}", styleName);
    result.prose = notes.prose;
    result.scene = notes.scene;
    result.keywords = keywords;
    result.style = styleName;
    result.seed = result.title + result.lines.join("") + Date.now();
    return result;
  }

  return { generate, matchThemes, StyleStore, _dbg: DBG };
})();
