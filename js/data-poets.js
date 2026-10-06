/* ============================================================
 * 墨韵诗境 · 数据合并与检索
 * 精编诗人（手选小传+代表作） + 全语料索引（千余诗人，按需懒加载）
 * ============================================================ */

const POETS = [...POETS_TANG, ...POETS_SONG, ...POETS_OTHER];

/* 拍平精编诗词，附诗人信息，便于首页名篇与全文检索 */
const ALL_POEMS = [];
POETS.forEach(p => {
  p.poems.forEach((poem, idx) => {
    ALL_POEMS.push({
      ...poem,
      poetId: p.id,
      poetName: p.name,
      poetHonor: p.honor,
      dynasty: p.dynasty,
      uid: p.id + "_" + idx
    });
  });
});

const DYNASTIES = ["全部", "先秦", "汉", "魏晋", "南北朝", "隋", "唐", "五代", "宋", "辽", "金", "元", "明", "清"];

/* 首页名篇筛选用到的朝代（只列有名篇的） */
const HOME_DYNASTIES = DYNASTIES.filter(d => d === "全部" || ALL_POEMS.some(p => p.dynasty === d));

/* 全部类型标签（参照古诗文网分类方式） */
const ALL_TAGS = (() => {
  const order = ["写景", "山水", "月", "雨", "雪", "春", "秋", "夏", "冬", "花", "梅", "竹", "菊", "荷", "送别", "思乡", "爱情", "相思", "闺怨", "友情", "亲情", "爱国", "边塞", "田园", "咏物", "咏史", "怀古", "哲理", "言志", "羁旅", "酒", "豪放", "婉约", "词", "曲", "童趣", "悼亡"];
  const set = new Set();
  ALL_POEMS.forEach(p => (p.tags || []).forEach(t => set.add(t)));
  return order.filter(t => set.has(t));
})();

function findPoet(id) { return POETS.find(p => p.id === id); }

/* ---------------- 肖像与简介 ---------------- */
const DYN_CONTEXT = {
  先秦: "其时风雅未歇，楚辞方兴，诗以歌咏言志，为后世抒情传统奠基。",
  汉: "两汉乐府采诗观风，文人五言渐兴，诗由里巷走向庙堂与书斋。",
  魏晋: "建安风骨、正始之音与太康绮丽递嬗，诗始成为士人生命之寄托。",
  南北朝: "永明声律发明，山水与宫体并盛，近体之先声已隐然可闻。",
  隋: "南北文风合流，诗律渐密，已为盛唐铺路。",
  唐: "近体大备，诗至于唐而极盛，体备众家，气象万千。",
  五代: "乱世短章，词体勃兴，诗则承唐余绪而渐趋婉约。",
  宋: "宋人「以文字为诗、以才学为诗、以议论为诗」，别开境界；词亦至宋而大成。",
  辽: "北地诗坛规模虽简，亦存华夷之间的歌咏。",
  金: "金源文学上承北宋，下启遗山一脉，诗多苍劲。",
  元: "散曲、杂剧崛起，诗则宗唐而参宋，多民族诗人并出。",
  明: "前后七子、公安、竟陵递变，复古与性灵交争。",
  清: "诗、词中兴，神韵、格调、性灵、肌理诸派并立，结集之富超迈前代。"
};

/** 无精编增补时，按朝代给出可读的「诗风 / 影响」默认段 */
const DYN_ART_DEFAULT = {
  先秦: "先秦歌诗或出里巷讽诵，或出宗庙祭祀，或以楚辞之体写忠怨求索。语言古朴而意象丰厚，比兴手法深刻影响后世。",
  汉: "汉代诗歌上承《诗经》、楚辞，乐府「感于哀乐，缘事而发」；五言由民谣而文人化，叙事与抒情并进。",
  魏晋: "魏晋诗人重风骨与个性，或慷慨任气，或隐约咏怀，或绮丽工炼。五言至此成为主要体式，为唐诗蓄势。",
  南北朝: "南朝诗重声律与写景，北朝诗多质朴刚健。山水、宫体、永明新体交错演进，近体格律渐趋完成。",
  隋: "隋诗承齐梁而趋南北融合，律对日密，短章清丽，已见唐音端倪。",
  唐: "唐诗诸体皆备：古风、乐府、律绝各骋所长。或气象雄浑，或兴象玲珑，或沉郁顿挫，或清奇僻苦，一代有一代之胜。",
  五代: "五代干戈不息，诗多短制；词则于花间、南唐蔚为大观，文人日常抒情多寄于词。",
  宋: "宋诗重理趣、才学与日常化书写；宋词则婉约、豪放双峰并峙，慢词长调极尽铺叙之能。",
  辽: "辽代诗文存世较少，多与契丹、汉文化交融相关，可见北地歌咏之一斑。",
  金: "金源诗人多学苏、黄，兼染北地刚健，丧乱之际尤多苍凉纪实之作。",
  元: "元人诗词之外，散曲以口语入乐、以直率写情；杂剧叙事则别开戏曲文学天地。",
  明: "明诗流派纷繁：格调复古与性灵抒写迭为消长，前后七子、公安、竟陵各有主张。",
  清: "清人结集之富空前，诗话、词话发达；或主神韵，或主格调，或主性灵，或主肌理，众美并陈。"
};
const DYN_LEGACY_DEFAULT = {
  先秦: "先秦歌诗与楚辞并称「风骚」，是中华文学抒情传统的源头，历代诗人无不取法。",
  汉: "汉乐府与古诗十九首为五言典范，叙事、比兴与人生感慨，深刻塑造魏晋以下诗心。",
  魏晋: "建安、正始、太康诸家，确立「诗言志」与「诗缘情」的张力，是中古文学关键转折。",
  南北朝: "声律与山水传统至唐而大成；庾信北渡、南北文风合流，尤为唐诗所取资。",
  隋: "隋代诗人数量虽不敌唐宋，却是近体完成前的重要过渡，不可略而不论。",
  唐: "唐诗为古典诗歌巅峰，其格律、意象与人格境界，成为后世永恒的参照。",
  五代: "南唐、西蜀词人开启宋词繁荣之门；乱世短歌亦保存一代声情。",
  宋: "宋诗、宋词各开生面，理趣与日常、豪放与婉约，共同构成古典文学的第二高峰。",
  辽: "辽诗文献虽稀，却是理解多民族王朝文学版图的必要一环。",
  金: "金源文学上承北宋、下启元好问一脉，在南北文学史上具有桥梁意义。",
  元: "元曲与元诗并观，可见俗文学崛起与文人传统并存的时代面貌。",
  明: "明人流派之争推动诗学自觉，其复古与革新之辩影响清初诗坛甚深。",
  清: "清诗、清词中兴，文献整理与理论批评并盛，古典传统于此作一总结。"
};

function poetPortraitFile(id) {
  const map = typeof POET_PORTRAITS !== "undefined" ? POET_PORTRAITS : (window.POET_PORTRAITS || {});
  return map[id] || "";
}

function _poetEsc(s) {
  if (typeof esc === "function") return esc(s);
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function poetPortraitHTML(id, name, large) {
  const file = poetPortraitFile(id);
  const sz = large ? " large" : "";
  if (file) {
    const w = large ? 360 : 160;
    const src = "/api/thumb?path=poets/" + encodeURIComponent(file) + "&w=" + w;
    return `<figure class="poet-portrait${sz}">
      <img src="${_poetEsc(src)}" alt="${_poetEsc(name)}像" loading="lazy" decoding="async">
    </figure>`;
  }
  return poetPortraitEmptyHTML(name, large);
}

function poetPortraitEmptyHTML(name, large) {
  const sz = large ? " large" : "";
  return `<figure class="poet-portrait poet-portrait--none${sz}">
    <span>${_poetEsc((name || "无").charAt(0))}</span>
    <figcaption>无留存像</figcaption>
  </figure>`;
}

function bindPoetPortraitFallback(root) {
  const img = root && root.querySelector && root.querySelector(".poet-portrait img");
  if (!img) return;
  img.addEventListener("error", () => {
    const fig = img.closest(".poet-portrait");
    if (!fig) return;
    const large = fig.classList.contains("large");
    const name = (img.alt || "").replace(/像$/, "") || "无";
    fig.outerHTML = poetPortraitEmptyHTML(name, large);
  });
}

function corpusBioText(idx) {
  const name = idx.name || "";
  const dyn = idx.dyn || "";
  const cnt = idx.cnt || 0;
  const bio = idx.bio || "";
  const m = bio.match(/本站收录\s*(\d+)\s*首/);
  const shown = m ? +m[1] : cnt;
  const era = DYN_CONTEXT[dyn] || "";
  if (name === "诗经") {
    return `《诗经》为中华诗歌总集之祖，收西周初年至春秋中叶歌诗三百零五篇，分「风」「雅」「颂」三体。十五国风多里巷歌谣，大小雅多朝会宴飨与讽谏，颂则宗庙祭祀之乐。孔子删诗之说虽难确证，而「诗三百，一言以蔽之，曰思无邪」「不学诗，无以言」已成经典表述。本馆收录 ${shown} 首，可由此想见风雅比兴与华夏诗教之源。`;
  }
  if (name === "两汉乐府") {
    return `两汉乐府由乐府官署制礼作乐、采诗观风，既有郊庙朝会之章，亦有赵、代、秦、楚之讴。或叙事宛转如《孔雀东南飞》《陌上桑》，或抒情质朴如《上邪》《长歌行》，「感于哀乐，缘事而发」，开后世乐府与叙事诗法门。本馆收录 ${shown} 首。${era}`;
  }
  if (name === "无名氏" || /无名/.test(name)) {
    return `此卷汇录${dyn}代姓名无考、群工合作，或因传抄而失其主名之篇什。历代著录约 ${cnt} 首，本馆收录 ${shown} 首。其中或为里巷歌谣，或为宫廷乐府，或为文人佚题，正可见一代诗风之公共面貌与传播生态。${era}`;
  }
  /* 乐府、合集类 */
  if (/乐府|奉诏|等作|合集/.test(name)) {
    return `「${name}」属${dyn}代乐府或集体创作传统。${era}本馆著录相关作品约 ${cnt} 首，选录 ${shown} 首。此类篇章或应制、或配乐、或出于官署与教坊，可与文人别集对照阅读。`;
  }
  const hold = shown < cnt
    ? `历代著录约 ${cnt} 首，本馆选录 ${shown} 首，便于展卷品读`
    : `本馆尽数收录其诗 ${cnt} 首`;
  return `${name}，${dyn}代诗人。${era}${hold}。正史、方志与诗话对其生平详略不一：显达者或有本传可稽，寒士、方外、闺阁作者则往往仅存诗名。读者可于下方作品中寻其声情气骨；载籍有阙处，则以诗存人，因声求志。`;
}

function defaultArtText(dyn) {
  return DYN_ART_DEFAULT[dyn] || "其诗承一代风气，具体风貌可于作品中细味。";
}
function defaultLegacyText(dyn, name) {
  const base = DYN_LEGACY_DEFAULT[dyn] || "其作品为一代文献之组成部分，可供知人论世。";
  return `${name}之名因诗而传。${base}`;
}

function composePoetBioHTML(feat, idx) {
  const id = feat ? feat.id : (idx && idx.id);
  const name = feat ? feat.name : (idx && idx.name) || "";
  const dyn = feat ? feat.dynasty : (idx && idx.dyn) || "";
  const extra = (typeof POET_BIO_EXTRA !== "undefined" ? POET_BIO_EXTRA : (window.POET_BIO_EXTRA || {}))[id] || null;
  const life = feat && feat.bio ? feat.bio : (idx ? corpusBioText(idx) : "");
  const art = (extra && extra.art) || defaultArtText(dyn);
  const legacy = (extra && extra.legacy) || defaultLegacyText(dyn, name);

  let html = `<h5>生平</h5><p>${_poetEsc(life)}</p>`;
  html += `<h5>诗风与成就</h5><p>${_poetEsc(art)}</p>`;
  html += `<h5>影响与评价</h5><p>${_poetEsc(legacy)}</p>`;
  if (!poetPortraitFile(id)) {
    html += `<p class="poet-portrait-note">肖像：历代未见可靠公有领域存像，故阙如，标「无留存像」。</p>`;
  }
  return html;
}

/* ---------------- 全语料诗人索引 ---------------- */
const IDX_BY_ID = {};
(typeof POETS_INDEX !== "undefined" ? POETS_INDEX : []).forEach(p => { IDX_BY_ID[p.id] = p; });
function findIndexPoet(id) { return IDX_BY_ID[id]; }

/* 按诗人懒加载作品库（script 注入方式，兼容 file:// 直接打开） */
const _poemLoadPromises = {};
const _pendingScripts = new Set();
function _injectScript(src, onload, onerror) {
  const s = document.createElement("script");
  s.src = src;
  s.onload = () => { _pendingScripts.delete(s); onload && onload(); };
  s.onerror = () => { _pendingScripts.delete(s); onerror && onerror(); };
  _pendingScripts.add(s);
  document.head.appendChild(s);
  return s;
}
function loadPoetPoems(id) {
  if (window.POEM_DB && window.POEM_DB[id]) return Promise.resolve(window.POEM_DB[id]);
  if (_poemLoadPromises[id]) return _poemLoadPromises[id];
  _poemLoadPromises[id] = new Promise(resolve => {
    _injectScript(
      "js/data/poems/" + encodeURIComponent(id) + ".js",
      () => resolve((window.POEM_DB && window.POEM_DB[id]) || null),
      () => resolve(null)
    );
  });
  return _poemLoadPromises[id];
}

/* ---------------- 全库诗题索引（懒加载，供全局检索） ---------------- */
let _titlesPromise = null, _titlesArr = null;
function ensureTitles() {
  if (_titlesArr) return Promise.resolve(_titlesArr);
  if (_titlesPromise) return _titlesPromise;
  _titlesPromise = new Promise(resolve => {
    _injectScript("js/data/titles.js", () => {
      _titlesArr = (typeof TITLES_INDEX !== "undefined" ? TITLES_INDEX : "")
        .split(";").filter(Boolean).map(pair => {
          const i = pair.indexOf("|");
          return { poetId: pair.slice(0, i), title: pair.slice(i + 1) };
        });
      resolve(_titlesArr);
    }, () => { _titlesArr = []; resolve(_titlesArr); });
  });
  return _titlesPromise;
}
function searchTitles(q, dyn) {
  if (!_titlesArr) return [];
  const hits = [];
  for (const h of _titlesArr) {
    if (h.title.includes(q)) {
      const idx = IDX_BY_ID[h.poetId];
      if (!idx) continue;
      if (dyn && dyn !== "全部" && idx.dyn !== dyn) continue;
      hits.push({ poetId: h.poetId, title: h.title, poetName: idx.name, dynasty: idx.dyn });
      if (hits.length >= 200) break;
    }
  }
  return hits;
}

/* ---------------- 精编委全文检索 ---------------- */
function searchAll(q) {
  q = (q || "").trim();
  if (!q) return { poets: [], poems: [] };
  const poets = POETS.filter(p =>
    p.name.includes(q) || (p.zi && p.zi.includes(q)) || (p.hao && p.hao.includes(q)) ||
    (p.honor && p.honor.includes(q)) || p.bio.includes(q));
  const poems = ALL_POEMS.filter(p =>
    p.title.includes(q) || p.poetName.includes(q) ||
    p.content.some(line => line.includes(q)) ||
    (p.tags || []).some(t => t === q));
  return { poets, poems };
}
