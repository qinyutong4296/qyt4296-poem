/* ============================================================
 * 墨韵诗境 · 水墨配图引擎 v2
 *
 * 「习古近诸家笔意」：以历代画派之法度为范式，程序化出图——
 *   上古帛画拙朴 → 唐人金碧青绿 → 北宋全景雨点皴 → 南宋边角斧劈皴
 *   → 元人逸笔披麻皴浅绛 → 明人吴门细笔 → 清人八大简逸/石涛泼点 → 近代泼彩
 * 每派各有一套构图（全景/边角/一河两岸）、皴法、设色与惯用点缀，
 * 依诗之朝代取其画风；并「取意入画」——扫读诗句中的意象
 * （月舟雁柳雪酒亭桥瀑……），把诗里写到之物画进画中。
 * 以诗为种，同一首诗永远得到同一幅画。
 * ============================================================ */

/* 种子随机数 */
function inkSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const INK = {
  deep: "#2b2b2b", mid: "#4a4a48", soft: "#6f6f6a", faint: "#9a9a92",
  mist: "#c9c9bf", paper: "#f6f1e5", red: "#9e2b25", plumRed: "#b03a3a",
  /* 设色：石青石绿赭石花青（青绿/浅绛/泼彩所用） */
  lvlu: "#4e7f6a", lvshen: "#39635a", shiqing: "#3f6a8c", zhes: "#b08a5e",
  huaqing: "#5a7d9a", zhuhong: "#a84a3f"
};

/* ============================================================
 * 朝代 → 画派
 * ============================================================ */
const DYN_ERA = {
  "先秦": "antique", "汉": "antique", "魏晋": "antique", "南北朝": "antique", "隋": "antique",
  "唐": "tang", "五代": "northsong", "宋": "song", "金": "northsong", "辽": "northsong",
  "元": "yuan", "明": "ming", "清": "qing", "现代": "modern"
};
/* 画派家族：同族真迹优先；唐/上古/现代藏少，可借邻近画派真迹，不再用程序生成图 */
const ERA_FAMILY = {
  antique: ["antique", "tang", "northsong", "song"],
  tang: ["tang", "northsong", "song", "southsong"],
  northsong: ["northsong", "song", "southsong"],
  song: ["song", "southsong", "northsong"],
  southsong: ["southsong", "song", "northsong"],
  yuan: ["yuan", "song", "ming"],
  ming: ["ming", "yuan", "qing"],
  qing: ["qing", "ming"],
  modern: ["modern", "qing", "ming"]
};
function eraOfDynasty(dyn) {
  return DYN_ERA[dyn] || null; /* null = 随缘，由种子定 */
}

/* 各画派范式：构图、皴法、设色、惯用点缀、笔性 */
const ERAS = {
  antique: {
    name: "上古拙朴",
    comp: ["full"], tex: null, wash: "plain",
    brush: { wet: 0.7, rough: 0.9 }, tone: 0.85,
    extras: ["sun"]
  },
  tang: {
    name: "唐人金碧",
    comp: ["full", "corner"], tex: "plain", wash: "lvse",
    brush: { wet: 0.75, rough: 0.6 }, tone: 0.9,
    extras: ["pavilion", "geese"]
  },
  northsong: {
    name: "北宋全景",
    comp: ["full"], tex: "yudian", wash: "ink",
    brush: { wet: 0.55, rough: 0.8 }, tone: 1.0,
    extras: ["barewood", "waterfall", "temple"]
  },
  song: {
    name: "两宋",
    comp: ["full", "corner", "two"], tex: "fupi", wash: "ink",
    brush: { wet: 0.6, rough: 0.7 }, tone: 0.95,
    extras: ["boat", "mist"]
  },
  southsong: {
    name: "南宋边角",
    comp: ["corner", "corner", "two"], tex: "fupi", wash: "ink",
    brush: { wet: 0.5, rough: 0.75 }, tone: 0.9,
    extras: ["boat", "mist", "pavilion"]
  },
  yuan: {
    name: "元人逸笔",
    comp: ["two", "full"], tex: "pima", wash: "qianjiang",
    brush: { wet: 0.35, rough: 0.5 }, tone: 0.75,
    extras: ["boat", "hut", "mist"]
  },
  ming: {
    name: "吴门细笔",
    comp: ["full", "two", "corner"], tex: "zhedai", wash: "light",
    brush: { wet: 0.45, rough: 0.35 }, tone: 0.85,
    extras: ["pavilion", "bridge", "boat"]
  },
  qing: {
    name: "清人简逸",
    comp: ["corner", "two", "full"], tex: "midian", wash: "splashdot",
    brush: { wet: 0.65, rough: 0.7 }, tone: 0.9,
    extras: ["rock", "boat", "mist"]
  },
  modern: {
    name: "近代泼彩",
    comp: ["full", "corner"], tex: "niumao", wash: "pocai",
    brush: { wet: 0.85, rough: 0.6 }, tone: 0.95,
    extras: ["blossom", "boat"]
  }
};
const ERA_KEYS = Object.keys(ERAS);

/* ============================================================
 * 取意入画：扫读诗句中的意象
 * 返回 motif 数组（画中要素），至多 4 个
 * ============================================================ */
const MOTIF_WORDS = {
  moon: ["月", "婵娟", "桂魄", "玉盘", "冰轮"],
  boat: ["舟", "帆", "船", "棹", "舻", "扁舟"],
  water: ["水", "江", "河", "溪", "湖", "海", "波", "浪", "潮", "泽", "浦"],
  mountain: ["山", "峰", "岳", "岭", "峦", "崖", "岩", "嶂", "岑"],
  snow: ["雪", "霜华", "琼"],
  rain: ["雨", "潇潇", "滴"],
  willow: ["柳", "杨"],
  blossom: ["桃", "杏", "梨", "花", "芳", "英", "蕊", "樱"],
  plum: ["梅"],
  bamboo: ["竹", "篁", "筠"],
  pine: ["松"],
  orchid: ["兰"],
  chrys: ["菊", "黄花"],
  geese: ["雁", "燕", "鹤", "莺", "鹊", "鸥", "鸟", "鸿", "鹭"],
  pavilion: ["楼", "亭", "阁", "台", "轩", "榭", "阙"],
  wine: ["酒", "樽", "杯", "酌", "觞", "醉", "醅"],
  lamp: ["灯", "烛", "檠"],
  bridge: ["桥"],
  mist: ["云", "烟", "雾", "霭", "岚"],
  leaves: ["叶", "枫", "梧"],
  fort: ["城", "关", "塞", "戍", "烽"],
  temple: ["寺", "刹", "禅", "钟", "僧"],
  hut: ["舍", "庐", "茅", "扉", "家园", "篱", "炊"],
  horse: ["马", "鞍", "嘶"],
  stars: ["星", "河汉", "银河", "斗牛"],
  figure: ["人", "客", "翁", "君", "我", "谁", "子", "僧", "渔", "樵", "妾", "佳"],
  waterfall: ["瀑", "泉", "悬流", "飞流"]
};
function motifsFromLines(lines) {
  const text = (lines || []).join("");
  if (!text) return [];
  const hits = [];
  for (const key in MOTIF_WORDS) {
    if (MOTIF_WORDS[key].some(w => text.includes(w))) hits.push(key);
  }
  /* 依诗句出现顺序（首次命中位置）取前四，画随诗起 */
  const order = hits.map(k => {
    let pos = -1;
    for (const w of MOTIF_WORDS[k]) { const i = text.indexOf(w); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
    return [k, pos];
  }).sort((a, b) => a[1] - b[1]).map(e => e[0]);
  return order.slice(0, 4);
}

/* ============================================================
 * 基础笔触（沿用 v1 并扩充）
 * ============================================================ */
function ridgePath(rnd, baseY, amp, width, steps) {
  let d = `M -10 ${baseY}`;
  let y = baseY;
  for (let i = 0; i <= steps; i++) {
    const x = (width / steps) * i;
    y = baseY - Math.abs(Math.sin(i * 0.9 + rnd() * 2)) * amp * (0.5 + rnd() * 0.8);
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ` L ${width + 10} ${baseY} L ${width + 10} 320 L -10 320 Z`;
  return d;
}

function seal(rnd, x, y, char) {
  return `<g transform="translate(${x},${y})">
    <rect width="30" height="30" rx="4" fill="${INK.red}" opacity="0.88"/>
    <text x="15" y="22" text-anchor="middle" font-size="17" fill="#f6f1e5" font-family="'Ma Shan Zheng','KaiTi',serif">${char}</text>
  </g>`;
}

function waterLines(rnd, y0, count) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const y = y0 + i * (8 + rnd() * 6);
    const x = rnd() * 300, w = 40 + rnd() * 80;
    s += `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x + w).toFixed(0)}" y2="${y.toFixed(0)}" stroke="${INK.soft}" stroke-width="1" opacity="${0.25 + rnd() * 0.2}"/>`;
  }
  return s;
}

function boat(rnd, x, y, scale) {
  return `<g transform="translate(${x},${y}) scale(${scale})" fill="${INK.deep}" opacity="0.85">
    <path d="M0 0 Q14 8 30 0 L26 6 Q14 12 4 6 Z"/>
    <line x1="15" y1="-14" x2="15" y2="0" stroke="${INK.deep}" stroke-width="1.6"/>
    <path d="M15 -13 Q24 -8 15 -2 Z" opacity="0.7"/>
  </g>`;
}

function moon(rnd, x, y, r, glow) {
  return `<circle cx="${x}" cy="${y}" r="${r + glow}" fill="${INK.mist}" opacity="0.35" filter="url(#inkblurX)"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="#e9e2cf" opacity="0.95"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK.soft}" stroke-width="0.6" opacity="0.5"/>`;
}

function sun(rnd, x, y) {
  return `<circle cx="${x}" cy="${y}" r="${24 + rnd() * 8}" fill="#d9b48a" opacity="0.75"/>`;
}

function geese(rnd, x, y, n) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const gx = x + i * (18 + rnd() * 10), gy = y + (i % 2 ? -8 - rnd() * 6 : 4 + rnd() * 6);
    const k = 5 + rnd() * 3;
    s += `<path d="M ${gx - k} ${gy} Q ${gx} ${gy - k * 0.9} ${gx} ${gy} Q ${gx} ${gy - k * 0.9} ${gx + k} ${gy}" stroke="${INK.mid}" fill="none" stroke-width="1.4" opacity="0.75" stroke-linecap="round"/>`;
  }
  return s;
}

function plumBranch(rnd, x0, y0, angle, len, depth, parts) {
  if (depth <= 0 || len < 8) return;
  const x1 = x0 + Math.cos(angle) * len, y1 = y0 + Math.sin(angle) * len;
  parts.push(`<path d="M ${x0} ${y0} Q ${(x0 + x1) / 2 + (rnd() - 0.5) * 14} ${(y0 + y1) / 2 + (rnd() - 0.5) * 14} ${x1} ${y1}" stroke="${INK.deep}" stroke-width="${depth * 1.15}" fill="none" opacity="0.9" stroke-linecap="round"/>`);
  const blossoms = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < blossoms; i++) {
    const t = 0.35 + rnd() * 0.6;
    const bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t;
    const br = 2.4 + rnd() * 2.6;
    parts.push(`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${br.toFixed(1)}" fill="${INK.plumRed}" opacity="${0.55 + rnd() * 0.35}"/>
      <circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(br * 0.4).toFixed(1)}" fill="#e8b4a0" opacity="0.5"/>`);
  }
  plumBranch(rnd, x1, y1, angle - 0.5 - rnd() * 0.5, len * (0.6 + rnd() * 0.2), depth - 1, parts);
  plumBranch(rnd, x1, y1, angle + 0.4 + rnd() * 0.6, len * (0.6 + rnd() * 0.2), depth - 1, parts);
}

function bamboo(rnd, x, h, parts) {
  const segs = 4 + Math.floor(rnd() * 3);
  let y = 300, segH = h / segs;
  for (let i = 0; i < segs; i++) {
    parts.push(`<rect x="${x}" y="${(y - segH).toFixed(0)}" width="7" height="${(segH - 3).toFixed(0)}" rx="3.5" fill="${INK.soft}" opacity="${0.65 + rnd() * 0.2}"/>`);
    const ly = y - segH + rnd() * segH * 0.5;
    for (let l = 0; l < 3; l++) {
      const dir = rnd() > 0.5 ? 1 : -1;
      const lw = 12 + rnd() * 16;
      parts.push(`<path d="M ${x + 3} ${ly} q ${dir * lw * 0.5} ${-4 - rnd() * 4} ${dir * lw} ${-3 - rnd() * 6} q ${-dir * lw * 0.55} ${3 + rnd() * 3} ${-dir * lw} ${4 + rnd() * 4} Z" fill="${INK.mid}" opacity="${0.5 + rnd() * 0.3}"/>`);
    }
    y -= segH;
  }
}

function rainStreaks(rnd, count) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = rnd() * 400, y = rnd() * 220, l = 14 + rnd() * 22;
    s += `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x - l * 0.25).toFixed(0)}" y2="${(y + l).toFixed(0)}" stroke="${INK.faint}" stroke-width="1" opacity="${0.3 + rnd() * 0.3}"/>`;
  }
  return s;
}

function snowDots(rnd, count) {
  let s = "";
  for (let i = 0; i < count; i++) {
    s += `<circle cx="${(rnd() * 400).toFixed(0)}" cy="${(rnd() * 300).toFixed(0)}" r="${(0.8 + rnd() * 1.8).toFixed(1)}" fill="#fdfbf3" opacity="${0.5 + rnd() * 0.5}"/>`;
  }
  return s;
}

function leaves(rnd, count) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = rnd() * 400, y = 60 + rnd() * 230, r = rnd() * 360;
    s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(2.5 + rnd() * 2).toFixed(1)}" ry="${(1.4 + rnd()).toFixed(1)}" fill="${INK.soft}" opacity="${0.35 + rnd() * 0.35}" transform="rotate(${r.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }
  return s;
}

function hut(rnd, x, y) {
  return `<g transform="translate(${x},${y})" opacity="0.8">
    <rect x="0" y="0" width="46" height="30" fill="${INK.soft}" opacity="0.55"/>
    <path d="M -6 2 L 23 -18 L 52 2 Z" fill="${INK.deep}" opacity="0.8"/>
    <rect x="18" y="12" width="10" height="18" fill="${INK.deep}" opacity="0.7"/>
    <path d="M 40 -10 q 4 -8 1 -14 q -3 -6 1 -12" stroke="${INK.faint}" stroke-width="2.5" fill="none" opacity="0.6" stroke-linecap="round"/>
  </g>`;
}

function willow(rnd, x, y, parts) {
  parts.push(`<path d="M ${x} ${y} q -4 60 -2 100" stroke="${INK.deep}" stroke-width="3.5" fill="none" opacity="0.8" stroke-linecap="round"/>`);
  for (let i = 0; i < 7; i++) {
    const bx = x - 2 + (rnd() - 0.5) * 14;
    const len = 40 + rnd() * 55, sw = (rnd() - 0.5) * 26;
    parts.push(`<path d="M ${bx.toFixed(0)} ${y + 4} q ${sw.toFixed(0)} ${(len * 0.55).toFixed(0)} ${(sw * 1.4).toFixed(0)} ${len.toFixed(0)}" stroke="${INK.soft}" stroke-width="1.3" fill="none" opacity="0.55" stroke-linecap="round"/>`);
  }
}

/* ---- 新增点缀 ---- */
function pavilion(rnd, x, y, scale) {
  const s = scale || 1;
  return `<g transform="translate(${x},${y}) scale(${s})" opacity="0.85">
    <path d="M -20 0 Q 0 -16 20 0 L 16 4 L -16 4 Z" fill="${INK.deep}" opacity="0.85"/>
    <rect x="-12" y="4" width="24" height="18" fill="none" stroke="${INK.deep}" stroke-width="2" opacity="0.8"/>
    <line x1="0" y1="4" x2="0" y2="22" stroke="${INK.deep}" stroke-width="1.6" opacity="0.7"/>
  </g>`;
}
function bridge(rnd, x, y) {
  return `<g opacity="0.8">
    <path d="M ${x - 40} ${y + 12} Q ${x} ${y - 22} ${x + 40} ${y + 12}" stroke="${INK.deep}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M ${x - 40} ${y + 18} Q ${x} ${y - 14} ${x + 40} ${y + 18}" stroke="${INK.soft}" stroke-width="1.6" fill="none" opacity="0.7"/>
    <line x1="${x - 12}" y1="${y - 13}" x2="${x - 12}" y2="${y + 5}" stroke="${INK.deep}" stroke-width="2" opacity="0.75"/>
    <line x1="${x + 12}" y1="${y - 13}" x2="${x + 12}" y2="${y + 5}" stroke="${INK.deep}" stroke-width="2" opacity="0.75"/>
  </g>`;
}
function figure(rnd, x, y) {
  return `<g transform="translate(${x},${y})" opacity="0.85" stroke="${INK.deep}" fill="none" stroke-linecap="round">
    <circle cx="0" cy="-14" r="3.4" fill="${INK.deep}" stroke="none"/>
    <path d="M 0 -10 Q -4 -2 -3 8" stroke-width="2.6"/>
    <path d="M -3 8 L -7 20 M -3 8 L 3 20" stroke-width="2"/>
    <path d="M -1 -7 L -9 0 M -1 -7 L 8 -2" stroke-width="2"/>
  </g>`;
}
function barewood(rnd, x, y, parts) {
  parts.push(`<path d="M ${x} ${y} q 3 -34 -2 -52 M ${x - 1} ${y - 22} q -14 -8 -20 -22 M ${x} ${y - 30} q 13 -9 18 -24" stroke="${INK.deep}" stroke-width="2.2" fill="none" opacity="0.75" stroke-linecap="round"/>`);
  for (let i = 0; i < 4; i++) {
    const tw = 10 + rnd() * 14, dir = rnd() > 0.5 ? 1 : -1;
    const ty = y - 18 - rnd() * 34;
    parts.push(`<path d="M ${x + dir * 4} ${ty} q ${dir * tw * 0.6} ${-6} ${dir * tw} ${-3}" stroke="${INK.soft}" stroke-width="1.4" fill="none" opacity="0.55" stroke-linecap="round"/>`);
  }
}
function temple(rnd, x, y) {
  return `<g transform="translate(${x},${y})" opacity="0.7">
    <path d="M -12 0 L 0 -30 L 12 0 Z" fill="${INK.mid}" opacity="0.75"/>
    <path d="M -7 -2 L 0 -22 L 7 -2 Z" fill="${INK.soft}" opacity="0.6"/>
    <line x1="0" y1="0" x2="0" y2="6" stroke="${INK.deep}" stroke-width="2"/>
  </g>`;
}
function rock(rnd, x, y) {
  return `<g transform="translate(${x},${y})" opacity="0.85">
    <path d="M 0 0 Q -16 -8 -12 -26 Q -6 -40 8 -34 Q 22 -28 16 -12 Q 12 -2 0 0 Z" fill="${INK.soft}" opacity="0.5"/>
    <path d="M -8 -10 Q -2 -22 8 -26" stroke="${INK.deep}" stroke-width="1.8" fill="none" opacity="0.7"/>
    <circle cx="14" cy="-30" r="2.2" fill="${INK.deep}" opacity="0.7"/>
  </g>`;
}
function waterfall(rnd, x, y, len) {
  const l = len || 60 + rnd() * 40;
  return `<g opacity="0.8">
    <path d="M ${x} ${y} q 2 ${l * 0.4} 0 ${l}" stroke="#e7e2d0" stroke-width="5" fill="none" opacity="0.9"/>
    <path d="M ${x - 2} ${y} q 1 ${l * 0.5} -1 ${l}" stroke="${INK.faint}" stroke-width="1.4" fill="none" opacity="0.7"/>
    <ellipse cx="${x}" cy="${y + l + 4}" rx="10" ry="3" fill="${INK.faint}" opacity="0.4"/>
  </g>`;
}
function stars(rnd, count) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = rnd() * 380 + 10, y = 20 + rnd() * 120;
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(0.7 + rnd()).toFixed(1)}" fill="${INK.mid}" opacity="${0.4 + rnd() * 0.4}"/>`;
  }
  return s;
}
function smoke(rnd, x, y) {
  return `<path d="M ${x} ${y} q 4 -12 -1 -20 q -5 -9 1 -18" stroke="${INK.faint}" stroke-width="2" fill="none" opacity="0.55" stroke-linecap="round"/>`;
}
function mistBand(rnd, y, w, h) {
  return `<ellipse cx="${rnd() * 200 + 100}" cy="${y}" rx="${w}" ry="${h}" fill="${INK.mist}" opacity="0.5" filter="url(#inkblurX)"/>`;
}

/* ============================================================
 * 皴法（各派山石墨法）
 * ============================================================ */
const TEXTURES = {
  /* 披麻皴：长线松毛，元人常用 */
  pima(rnd, peaks) {
    let s = "";
    for (const p of peaks) {
      const n = 7 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) {
        const x = p.x0 + rnd() * p.w, y0 = p.y0 + rnd() * 18, len = 26 + rnd() * 40;
        const drift = (rnd() - 0.5) * 16;
        s += `<path d="M ${x.toFixed(0)} ${y0.toFixed(0)} q ${drift.toFixed(0)} ${(len * 0.5).toFixed(0)} ${(drift * 0.4).toFixed(0)} ${len.toFixed(0)}" stroke="${INK.mid}" stroke-width="1.1" fill="none" opacity="${0.3 + rnd() * 0.25}" stroke-linecap="round"/>`;
      }
    }
    return s;
  },
  /* 雨点皴：密密麻麻的点，范宽家法 */
  yudian(rnd, peaks) {
    let s = "";
    for (const p of peaks) {
      const n = 90 + Math.floor(rnd() * 60);
      for (let i = 0; i < n; i++) {
        const x = p.x0 + rnd() * p.w, y = p.y0 + rnd() * p.h;
        s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(1 + rnd() * 1.6).toFixed(1)}" ry="${(1.6 + rnd() * 1.8).toFixed(1)}" fill="${INK.mid}" opacity="${0.18 + rnd() * 0.3}"/>`;
      }
    }
    return s;
  },
  /* 斧劈皴：侧笔方硬，南宋家法 */
  fupi(rnd, peaks) {
    let s = "";
    for (const p of peaks) {
      const n = 12 + Math.floor(rnd() * 8);
      for (let i = 0; i < n; i++) {
        const x = p.x0 + rnd() * p.w, y = p.y0 + rnd() * p.h;
        const dx = (rnd() > 0.5 ? 1 : -1) * (8 + rnd() * 14), dy = 6 + rnd() * 14;
        s += `<path d="M ${x.toFixed(0)} ${y.toFixed(0)} l ${dx.toFixed(0)} ${dy.toFixed(0)}" stroke="${INK.deep}" stroke-width="${(1.4 + rnd() * 1.8).toFixed(1)}" opacity="${0.3 + rnd() * 0.3}" stroke-linecap="butt"/>`;
      }
    }
    return s;
  },
  /* 折带皴：横拖直劈，倪迂家法 */
  zhedai(rnd, peaks) {
    let s = "";
    for (const p of peaks) {
      const n = 9 + Math.floor(rnd() * 6);
      for (let i = 0; i < n; i++) {
        const x = p.x0 + rnd() * p.w, y = p.y0 + rnd() * p.h;
        const w = 8 + rnd() * 14, d = 8 + rnd() * 12, dir = rnd() > 0.5 ? 1 : -1;
        s += `<path d="M ${x.toFixed(0)} ${y.toFixed(0)} h ${dir * w.toFixed(0)} l ${(dir * -4).toFixed(0)} ${d.toFixed(0)}" stroke="${INK.soft}" stroke-width="1.2" fill="none" opacity="${0.3 + rnd() * 0.25}"/>`;
      }
    }
    return s;
  },
  /* 米点皴：横点叠染，米家云山 */
  midian(rnd, peaks) {
    let s = "";
    for (const p of peaks) {
      const n = 40 + Math.floor(rnd() * 30);
      for (let i = 0; i < n; i++) {
        const x = p.x0 + rnd() * p.w, y = p.y0 + rnd() * p.h;
        s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(3 + rnd() * 3.5).toFixed(1)}" ry="${(1.8 + rnd() * 1.6).toFixed(1)}" fill="${INK.mid}" opacity="${0.2 + rnd() * 0.3}" filter="url(#inkblurS)"/>`;
      }
    }
    return s;
  },
  /* 牛毛皴：细若盘丝，王蒙家法 */
  niumao(rnd, peaks) {
    let s = "";
    for (const p of peaks) {
      const n = 60 + Math.floor(rnd() * 40);
      for (let i = 0; i < n; i++) {
        const x = p.x0 + rnd() * p.w, y0 = p.y0 + rnd() * p.h * 0.4, len = 14 + rnd() * 22;
        const drift = (rnd() - 0.5) * 10;
        s += `<path d="M ${x.toFixed(0)} ${y0.toFixed(0)} q ${drift.toFixed(0)} ${(len * 0.6).toFixed(0)} ${(drift * 0.3).toFixed(0)} ${len.toFixed(0)}" stroke="${INK.soft}" stroke-width="0.7" fill="none" opacity="${0.25 + rnd() * 0.25}"/>`;
      }
    }
    return s;
  },
  /* 勾勒而已（唐人与上古） */
  plain(rnd, peaks) { return ""; }
};

/* ============================================================
 * 构图与山体
 * ============================================================ */
/* 依画派构图造山，返回 {body, peaks(供皴), ridgeY} */
function buildMountains(comp, era, rnd, id) {
  const peaks = [];
  let body = "", waterY = 235;

  if (comp === "full") {
    /* 北宋式全景：主峰当堂，远岫铺陈 */
    const mainY = 95 + rnd() * 35;
    body += `<path d="${ridgePath(rnd, mainY + 120, 150 + rnd() * 40, 210, 6)}" fill="${INK.mid}" opacity="${0.62 * era.tone}" transform="translate(100,0) scale(1,1.25)" filter="url(#inkblur${id})"/>`;
    peaks.push({ x0: 120, y0: mainY + 120, w: 170, h: 130 });
    body += `<path d="${ridgePath(rnd, 150 + rnd() * 20, 55 + rnd() * 25, 230, 6)}" fill="${INK.soft}" opacity="${0.5 * era.tone}" filter="url(#inkblur${id})"/>`;
    peaks.push({ x0: 0, y0: 150, w: 230, h: 70 });
    body += `<path d="${ridgePath(rnd, 175 + rnd() * 20, 45 + rnd() * 25, 200, 5)}" fill="${INK.soft}" opacity="${0.42 * era.tone}" transform="translate(200,0)" filter="url(#inkblur${id})"/>`;
    peaks.push({ x0: 200, y0: 175, w: 200, h: 60 });
    waterY = 268;
  } else if (comp === "corner") {
    /* 南宋式边角：实于一隅，虚于大块 */
    const side = rnd() > 0.5;
    const tx = side ? -30 : 200, baseY = 225 + rnd() * 30;
    body += `<path d="${ridgePath(rnd, baseY, 110 + rnd() * 40, 230, 6)}" fill="${INK.mid}" opacity="${0.68 * era.tone}" transform="translate(${tx},0)" filter="url(#inkblur${id})"/>`;
    peaks.push({ x0: Math.max(tx, 0), y0: baseY - 80, w: 200, h: 110 });
    body += `<path d="${ridgePath(rnd, baseY + 28, 60, 190, 5)}" fill="${INK.soft}" opacity="${0.45 * era.tone}" transform="translate(${tx + (side ? 150 : -60)},0)" filter="url(#inkblur${id})"/>`;
    body += mistBand(rnd, baseY - 60, 170, 34);
    waterY = baseY + 42;
  } else {
    /* 元人式一河两岸：近坡远岸，中留虚空 */
    body += `<path d="${ridgePath(rnd, 92 + rnd() * 18, 40 + rnd() * 20, 190, 5)}" fill="${INK.faint}" opacity="${0.5 * era.tone}" transform="translate(200,0)" filter="url(#inkblur${id})"/>`;
    peaks.push({ x0: 210, y0: 60, w: 180, h: 45 });
    body += `<path d="M -10 ${272 + rnd() * 10} Q 90 ${252 + rnd() * 12} 200 ${264 + rnd() * 8} Q 300 ${274} 410 ${262} L 410 320 L -10 320 Z" fill="${INK.soft}" opacity="${0.55 * era.tone}"/>`;
    waterY = 196 + rnd() * 20;
  }
  return { body, peaks, waterY };
}

/* 设色层：青绿 / 浅绛 / 泼彩 / 水墨 */
function colorWash(kind, rnd, peaks, comp) {
  if (kind === "lvse") {
    let s = "";
    for (const p of peaks) {
      s += `<path d="M ${p.x0} ${p.y0} q ${(p.w / 2).toFixed(0)} ${-p.h * 0.35} ${p.w} ${p.h * 0.15} L ${p.x0 + p.w} ${p.y0 + p.h} L ${p.x0} ${p.y0 + p.h} Z" fill="${rnd() > 0.5 ? INK.lvlu : INK.shiqing}" opacity="0.14" filter="url(#inkblurS)"/>`;
      s += `<path d="M ${p.x0 + 12} ${p.y0 + 14} q ${(p.w / 2.4).toFixed(0)} ${-p.h * 0.22} ${p.w * 0.7} ${p.h * 0.1}" stroke="${INK.zhes}" stroke-width="5" fill="none" opacity="0.18" filter="url(#inkblurS)"/>`;
    }
    return s;
  }
  if (kind === "qianjiang") {
    let s = `<rect width="400" height="300" fill="${INK.zhes}" opacity="0.05"/>`;
    for (const p of peaks) {
      s += `<path d="M ${p.x0} ${p.y0 + p.h * 0.2} q ${(p.w / 2).toFixed(0)} ${-p.h * 0.2} ${p.w} 0 L ${p.x0 + p.w} ${p.y0 + p.h} L ${p.x0} ${p.y0 + p.h} Z" fill="${INK.zhes}" opacity="0.13" filter="url(#inkblurS)"/>`;
    }
    return s;
  }
  if (kind === "pocai") {
    let s = "";
    const cols = [INK.shiqing, INK.lvlu, INK.zhes, INK.huaqing];
    for (let i = 0; i < 4; i++) {
      s += `<ellipse cx="${(40 + rnd() * 320).toFixed(0)}" cy="${(60 + rnd() * 180).toFixed(0)}" rx="${(50 + rnd() * 70).toFixed(0)}" ry="${(28 + rnd() * 44).toFixed(0)}" fill="${cols[Math.floor(rnd() * cols.length)]}" opacity="${0.12 + rnd() * 0.12}" filter="url(#inkblurX)"/>`;
    }
    return s;
  }
  if (kind === "splashdot") {
    let s = "";
    for (let i = 0; i < 12; i++) {
      s += `<ellipse cx="${(30 + rnd() * 340).toFixed(0)}" cy="${(50 + rnd() * 210).toFixed(0)}" rx="${(3 + rnd() * 9).toFixed(1)}" ry="${(2 + rnd() * 5).toFixed(1)}" fill="${INK.deep}" opacity="${0.12 + rnd() * 0.22}" transform="rotate(${(rnd() * 360).toFixed(0)} ${(30 + rnd() * 340).toFixed(0)} ${(50 + rnd() * 210).toFixed(0)})"/>`;
    }
    return s;
  }
  if (kind === "light") return `<rect width="400" height="300" fill="${INK.zhes}" opacity="0.04"/>`;
  return "";
}

/* ============================================================
 * 场景组装：画派为体，诗意为魂
 * ============================================================ */
function motifLayer(motifs, era, comp, rnd, waterY) {
  const used = {};
  let s = "";
  const draw = {
    moon: () => { if (!used.moon) { used.moon = 1; s += moon(rnd, 300 + rnd() * 50, 62 + rnd() * 26, 26 + rnd() * 8, 22); } },
    boat: () => { if (!used.boat) { used.boat = 1; s += boat(rnd, 90 + rnd() * 220, waterY + 8 + rnd() * 22, 0.9 + rnd() * 0.4); } },
    water: () => { if (!used.water) { used.water = 1; s += waterLines(rnd, waterY, 8); } },
    mountain: () => {}, /* 山为体，已在构图层 */
    snow: () => { if (!used.snow) { used.snow = 1; s += snowDots(rnd, 80); } },
    rain: () => { if (!used.rain) { used.rain = 1; s += rainStreaks(rnd, 48); } },
    willow: () => { const p = []; willow(rnd, 70 + rnd() * 60, 90 + rnd() * 40, p); s += p.join(""); },
    blossom: () => { const p = []; plumBranch(rnd, 50 + rnd() * 40, 280, -0.9 - rnd() * 0.3, 70 + rnd() * 20, 4, p, INK.zhuhong); s += p.join(""); },
    plum: () => { const p = []; plumBranch(rnd, 60, 285, -0.85 - rnd() * 0.4, 80 + rnd() * 25, 4, p); s += p.join(""); },
    bamboo: () => { const p = []; bamboo(rnd, 100 + rnd() * 220, 200 + rnd() * 60, p); s += p.join(""); },
    pine: () => {
      const px = 60 + rnd() * 280;
      s += `<path d="M ${px} 262 q 8 -44 -4 -78" stroke="${INK.deep}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path d="M ${px - 28} ${196} q 22 -12 50 -4 q -24 5 -50 4 Z" fill="${INK.mid}" opacity="0.8"/>
        <path d="M ${px - 20} ${176} q 20 -12 44 -5 q -22 5 -44 5 Z" fill="${INK.mid}" opacity="0.65"/>`;
    },
    orchid: () => {
      for (let i = 0; i < 5; i++) {
        const ox = 90 + i * 30 + rnd() * 14;
        s += `<path d="M ${ox} 285 q ${(rnd() - 0.5) * 40} ${-60 - rnd() * 40} ${(rnd() - 0.3) * 50} ${-105 - rnd() * 30}" stroke="${INK.soft}" stroke-width="2" fill="none" opacity="0.7" stroke-linecap="round"/>`;
      }
    },
    chrys: () => {
      for (let i = 0; i < 4; i++) {
        const cx = 90 + i * 55 + rnd() * 20, cy = 205 + rnd() * 45, cr = 11 + rnd() * 8;
        for (let ptl = 0; ptl < 10; ptl++) {
          const a = (Math.PI * 2 * ptl) / 10;
          s += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * cr).toFixed(1)}" y2="${(cy + Math.sin(a) * cr).toFixed(1)}" stroke="${INK.soft}" stroke-width="2" opacity="0.7" stroke-linecap="round"/>`;
        }
        s += `<circle cx="${cx}" cy="${cy}" r="3" fill="${INK.deep}" opacity="0.8"/>`;
      }
    },
    geese: () => { if (!used.geese) { used.geese = 1; s += geese(rnd, 80 + rnd() * 80, 62 + rnd() * 30, 3 + Math.floor(rnd() * 3)); } },
    pavilion: () => { s += pavilion(rnd, 70 + rnd() * 250, waterY - 28 - rnd() * 20, 0.9 + rnd() * 0.4); },
    wine: () => { s += `<g transform="translate(${90 + rnd() * 200},${waterY + 14})" opacity="0.85">
      <path d="M 0 0 q 11 -5 22 0 l -3 22 q -8 4 -16 0 Z" fill="${INK.deep}" opacity="0.8"/></g>`; },
    lamp: () => { s += `<g transform="translate(${70 + rnd() * 240},${waterY + 16})" opacity="0.85">
      <rect x="0" y="-16" width="7" height="16" rx="2" fill="${INK.deep}" opacity="0.85"/>
      <ellipse cx="3.5" cy="-20" rx="5" ry="3.4" fill="${INK.zhuhong}" opacity="0.75"/></g>`; },
    bridge: () => { s += bridge(rnd, 110 + rnd() * 180, waterY + 18); },
    mist: () => { s += mistBand(rnd, 130 + rnd() * 80, 190, 36); },
    leaves: () => { s += leaves(rnd, 20); },
    fort: () => {
      const fx = 60 + rnd() * 240;
      s += `<path d="M ${fx} ${waterY} v -36 l 8 8 v 28 Z M ${fx - 5} ${waterY - 30} h 12" stroke="${INK.deep}" fill="${INK.deep}" opacity="0.85"/>
        <path d="M ${fx} ${waterY - 36} q 24 -7 44 2 q -20 3 -44 0 Z" fill="${INK.deep}" opacity="0.9"/>`;
    },
    temple: () => { s += temple(rnd, 70 + rnd() * 250, waterY - 20); },
    hut: () => { s += hut(rnd, 60 + rnd() * 240, waterY - 26); smoke(rnd, 300, 150); },
    horse: () => { s += figure(rnd, 90 + rnd() * 200, waterY + 26); },
    stars: () => { s += stars(rnd, 26); },
    figure: () => { s += figure(rnd, 110 + rnd() * 180, waterY + 30); },
    waterfall: () => { s += waterfall(rnd, 130 + rnd() * 140, 130 + rnd() * 40, 55 + rnd() * 35); }
  };
  motifs.forEach(m => { if (draw[m]) draw[m](); });
  return s;
}

function buildScene(scene, era, motifs, rnd) {
  const id = Math.floor(rnd() * 1e6);
  const comp = era.comp[Math.floor(rnd() * era.comp.length)];
  const texFn = era.tex ? TEXTURES[era.tex] : null;

  const mtn = buildMountains(comp, era, rnd, id);
  let body = "";
  body += colorWash(era.wash === "ink" ? "" : era.wash, rnd, mtn.peaks, comp);
  body += mtn.body;
  if (texFn) body += texFn(rnd, mtn.peaks);
  let waterY = mtn.waterY;

  /* 画派惯用点缀（择一二，不喧宾） */
  const extraPool = [...era.extras];
  const extras = [];
  for (let i = 0; i < 2 && extraPool.length; i++) {
    extras.push(extraPool.splice(Math.floor(rnd() * extraPool.length), 1)[0]);
  }
  body += motifLayer(extras, era, comp, rnd, waterY);

  /* 诗中意象入画（画随诗起） */
  body += motifLayer(motifs, era, comp, rnd, waterY);

  /* 场景底色：诗题场景决定基本物象（沿用并整合 v1） */
  switch (scene) {
    case "moon":
    case "night":
    case "dream":
      body += motifLayer(["moon", "boat", "geese"], era, comp, rnd, waterY);
      break;
    case "mountain":
    case "zen":
      body += motifLayer(["geese"], era, comp, rnd, waterY);
      break;
    case "pine":
      body += motifLayer(["pine"], era, comp, rnd, waterY);
      break;
    case "river":
    case "travel":
      body += motifLayer(["boat", "water"], era, comp, rnd, waterY);
      break;
    case "home":
      body += motifLayer(["hut"], era, comp, rnd, waterY);
      break;
    case "plum":
      body += motifLayer(["plum", "moon"], era, comp, rnd, waterY);
      break;
    case "bamboo":
      body += motifLayer(["bamboo", "moon"], era, comp, rnd, waterY);
      break;
    case "rain":
      body += motifLayer(["hut", "rain"], era, comp, rnd, waterY);
      break;
    case "snow":
      body += `<path d="${ridgePath(rnd, 262, 62, 400, 6)}" fill="#e8e4d5" opacity="0.8"/>` + motifLayer(["snow", "boat"], era, comp, rnd, waterY);
      break;
    case "autumn":
      body += motifLayer(["geese", "leaves"], era, comp, rnd, waterY);
      break;
    case "spring":
      { const p = []; willow(rnd, 90 + rnd() * 40, 66, p); body += p.join(""); }
      body += motifLayer(["water", "geese"], era, comp, rnd, waterY);
      break;
    case "farewell":
      { const p = []; willow(rnd, 336, 74, p); body += p.join(""); }
      body += motifLayer(["boat", "water"], era, comp, rnd, waterY);
      body += `<path d="M 60 ${waterY + 6} h 46 l -6 -12 h -34 Z" fill="${INK.deep}" opacity="0.8"/><rect x="78" y="${waterY - 18}" width="5" height="14" fill="${INK.deep}" opacity="0.8"/>`;
      break;
    case "love":
      body += motifLayer(["moon", "geese"], era, comp, rnd, waterY);
      break;
    case "field":
      body += motifLayer(["hut", "willow"], era, comp, rnd, waterY);
      body += `<line x1="120" y1="${waterY + 8}" x2="380" y2="${waterY + 8}" stroke="${INK.soft}" stroke-width="1" opacity="0.4"/>
        <line x1="135" y1="${waterY + 22}" x2="380" y2="${waterY + 22}" stroke="${INK.soft}" stroke-width="1" opacity="0.3"/>`;
      break;
    case "frontier":
    case "nation":
      body += sun(rnd, 310 + rnd() * 40, 85 + rnd() * 20) + motifLayer(["fort", "geese"], era, comp, rnd, waterY);
      break;
    case "wine":
      body += motifLayer(["moon", "wine"], era, comp, rnd, waterY);
      break;
    case "wind":
      for (let i = 0; i < 5; i++) {
        const wy = 70 + rnd() * 170;
        body += `<path d="M ${20 + rnd() * 60} ${wy} q 90 ${-14 - rnd() * 10} 180 0 q 70 10 120 -6" stroke="${INK.soft}" stroke-width="${1 + rnd()}" fill="none" opacity="${0.3 + rnd() * 0.25}" stroke-linecap="round"/>`;
      }
      body += leaves(rnd, 14);
      break;
    case "orchid":
      body += motifLayer(["orchid"], era, comp, rnd, waterY);
      break;
    case "chrys":
      body += motifLayer(["chrys"], era, comp, rnd, waterY);
      break;
    default:
      body += motifLayer(["boat", "water"], era, comp, rnd, waterY);
  }

  const sealChars = "墨韵诗境心山水风月";
  return `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" class="ink-svg">
    <defs>
      <filter id="inkblur${id}"><feGaussianBlur stdDeviation="2.2"/></filter>
      <filter id="inkblurS"><feGaussianBlur stdDeviation="1.2"/></filter>
      <filter id="inkblurX"><feGaussianBlur stdDeviation="8"/></filter>
      <filter id="inktex${id}">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="4"/>
      </filter>
    </defs>
    <rect width="400" height="300" fill="none"/>
    <g filter="url(#inktex${id})">${body}</g>
    ${seal(rnd, 356, 256, sealChars[Math.floor(rnd() * sealChars.length)])}
  </svg>`;
}

/* ============================================================
 * 真迹图库配对：依诗意象 / 场景 / 朝代，从本地水墨画中择最契者
 * ============================================================ */
const SCENE_MOTIFS = {
  moon: ["moon", "night"], night: ["moon", "night"], dream: ["moon", "mist", "night"],
  mountain: ["mountain"], zen: ["mountain", "mist", "temple"], pine: ["pine"],
  river: ["water", "boat"], travel: ["mountain", "boat", "mist"], home: ["hut"],
  plum: ["plum", "blossom"], bamboo: ["bamboo"], rain: ["rain", "mist"], snow: ["snow"],
  autumn: ["autumn", "leaves", "geese"], spring: ["spring", "willow", "blossom"],
  farewell: ["willow", "boat", "water"], love: ["moon", "blossom"], field: ["hut", "willow"],
  frontier: ["fort", "horse"], nation: ["fort", "horse"], wine: ["wine", "moon"],
  wind: ["wind", "leaves"], orchid: ["orchid"], chrys: ["chrys"]
};

function inkGallery() {
  return (typeof window !== "undefined" && Array.isArray(window.INK_GALLERY))
    ? window.INK_GALLERY : [];
}

/* 鬼神之作不入随机配画：其著录意象（月/夜/梦/山）极易与寻常诗境相撞，
 * 致温柔之诗配出《鬼趣图》；墨馆页仍可按名检索鉴赏 */
const HAUNTED = /鬼|魅|魑|魍|骷髅|罗刹|夜叉|地狱|钟馗|妖|僵尸|ghost|skeleton|demon|zhong\s*kui/i;

function paintableGallery() {
  return inkGallery().filter(g =>
    !HAUNTED.test([g.id, g.title, g.source || "", (g.motifs || []).join("|")].join("|")));
}

/* 为一首诗打分选画；同分用种子稳定择优。
 * 优先同画派家族真迹；家族无藏则退到全库，永不回退程序生成图 */
function matchInkPainting(scene, motifs, era, seedText) {
  const gallery = paintableGallery();
  if (!gallery.length) return null;
  const want = new Set([...(motifs || [])]);
  (SCENE_MOTIFS[scene] || []).forEach(m => want.add(m));
  const rnd = inkSeed((seedText || "墨韵") + "|配画");

  const family = (era && ERA_FAMILY[era]) || (era ? [era] : null);
  let pool = family ? gallery.filter(g => family.includes(g.era)) : gallery;
  if (!pool.length) pool = gallery;

  let best = null, bestScore = -1;
  for (const g of pool) {
    let score = 0;
    const gMotifs = g.motifs || [];
    const gScenes = g.scenes || [];
    for (const m of gMotifs) if (want.has(m)) score += 3;
    if (scene && gScenes.includes(scene)) score += 4;
    if (era && g.era === era) score += 2;
    else if (family && family.includes(g.era)) score += 1;
    if (gMotifs.length) {
      const hit = gMotifs.filter(m => want.has(m)).length;
      score += hit / gMotifs.length;
    }
    score += rnd() * 0.35;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best;
}

/** 局域网缩略图：列表/配图用小图，鉴赏弹层再用原图 */
function inkThumbUrl(file, w) {
  if (!file) return "";
  const width = w || 480;
  return "/api/thumb?path=inkart/" + encodeURIComponent(file) + "&w=" + width;
}
function inkFullUrl(file) {
  return file ? ("assets/inkart/" + file) : "";
}

function inkPaintingHTML(painting) {
  if (!painting || !painting.file) return "";
  const src = inkThumbUrl(painting.file, 520);
  const L = typeof localizeInk === "function" ? localizeInk(painting) : null;
  const zh = L && L.showTitleZh ? L.titleZh : "";
  const artist = L && L.showArtistZh ? L.artistZh : painting.artist;
  const cap = zh
    ? `${zh} · ${artist}${painting.dynasty ? "（" + painting.dynasty + "）" : ""}`
    : `${painting.title} · ${artist}${painting.dynasty ? "（" + painting.dynasty + "）" : ""}`;
  const alt = zh ? `${painting.title} / ${zh}` : cap;
  return `<figure class="ink-painting ink-painting--open" data-ink-id="${painting.id}" title="点击鉴赏">
    <img src="${src}" alt="${alt}" loading="lazy" decoding="async"/>
    <figcaption>${cap}</figcaption>
  </figure>`;
}

/* 对外接口：
 * inkArt(scene, seedText, opts)
 *   opts.era     画派（eraOfDynasty 之返回值；缺省随缘）
 *   opts.motifs  诗中意象数组（motifsFromLines 之返回值）
 *   opts.real    是否用真迹（默认 true；已禁用程序生成 SVG 配图）
 * 返回 HTML：真迹 figure（图库为空时才留空） */
function inkArt(scene, seedText, opts) {
  const rnd = inkSeed(seedText || "墨韵");
  let eraKey = opts && opts.era;
  if (!eraKey || !ERAS[eraKey]) {
    const pool = ERA_KEYS.filter(k => k !== "modern");
    eraKey = rnd() < 0.14 ? "modern" : pool[Math.floor(rnd() * pool.length)];
  }
  const motifs = (opts && opts.motifs || []).slice(0, 4);
  const useReal = !(opts && opts.real === false);
  if (useReal) {
    const hit = matchInkPainting(scene, motifs, eraKey, seedText);
    if (hit) return inkPaintingHTML(hit);
  }
  /* 不再输出带红印的程序生成水墨；图库空时显示占位 */
  return `<figure class="ink-painting ink-painting--empty"><figcaption>暂无匹配藏画</figcaption></figure>`;
}
