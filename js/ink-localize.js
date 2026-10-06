/* ============================================================
 * 墨馆 · 英文画名 / 画家名 本土化
 * 馆藏多自海外博物馆英文著录，展出时补中文译名以利阅览与检索。
 * ============================================================ */

const ARTIST_ZH = {
  "Chen Hongshou": "陈洪绶", "Hua Yan": "华喦", "Shen Zhou": "沈周",
  "Zha Shibiao": "查士标", "Mei Qing": "梅清", "Min Zhen": "闵贞",
  "Hu Zhengyan": "胡正言", "Xiao Yuncong": "萧云从", "Fan Qi": "樊圻",
  "Zhang Ruoai": "张若霭", "Wen Zhengming": "文徵明", "Zhai Dakun": "翟大坤",
  "Wang Hui": "王翚", "Qiu Ying": "仇英", "Shitao": "石涛", "Shi Tao": "石涛",
  "Ma Lin": "马麟", "Fachang Muqi": "牧溪", "Muqi": "牧溪", "Guo Min": "郭敏",
  "Tang Yin": "唐寅", "Tao Hong": "陶泓", "Bada Shanren": "八大山人",
  "Dong Qichang": "董其昌", "Zhao Mengfu": "赵孟頫", "Shi Rui": "石锐",
  "Chen Ruyan": "陈汝言", "Song Xu": "宋旭", "Wu Bin": "吴彬",
  "Gong Xian": "龚贤", "Wang Yuanqi": "王原祁", "Yan Hui": "颜辉",
  "Lan Ying": "蓝瑛", "Xie Shichen": "谢时臣", "Wen Boren": "文伯仁",
  "Liu Du": "刘度", "Puming (Xuechuang)": "普明（雪窗）", "Puming": "普明",
  "Hong Fan": "洪范", "Liu Shanshou": "刘善寿", "Peng Xu": "彭旭",
  "Wang Mian": "王冕", "Gao Fenghan": "高凤翰", "Wang Shishen": "汪士慎",
  "Du Jin": "杜堇", "Zhang Xiong": "张熊", "Fan Yi": "樊沂", "Li Shan": "李鱓",
  "Wang Yuan": "王渊", "Wang Guxiang": "王谷祥", "Fa Ruozhen": "法若真",
  "Zhao Yong": "赵雍", "Qian Hui'an": "钱慧安", "Qian Gu": "钱谷",
  "Xiang Shengmo": "项圣谟", "Luo Ping": "罗聘", "Xu Ben": "徐贲",
  "Ren Renfa": "任仁发", "Jiao Bingzhen": "焦秉贞", "Jueji Yongzhong": "觉际永忠",
  "Wu Li": "吴历", "Wang Meng": "王蒙", "Song Tian": "宋田", "Yin Hong": "殷宏",
  "Tao Cheng": "陶成", "Wang Gai": "王概", "Kuncan": "髡残", "Li Anzhong": "李安忠",
  "Huang Gongwang": "黄公望", "Fang Congyi": "方从义", "Gu Tianzhi": "顾天植",
  "Cui Zizhong": "崔子忠", "Wu Bing": "吴炳", "Ni Zan": "倪瓒",
  "Bian Wenjin": "边文进", "Yu Yuan": "余元", "Yintuoluo": "因陀罗",
  "Qian Du": "钱杜", "Juran": "巨然", "Li Song": "李嵩", "Song Lizong": "宋理宗",
  "Mi Youren": "米友仁", "Zhou Wenju": "周文矩", "Zhang Wo": "张渥",
  "Chen Juzhong": "陈居中", "Ma Yuan": "马远", "Wang Fu": "王绂",
  "Cheng Zhengkui": "程正揆", "Li Shizhuo": "李世倬", "Zeng Yandong": "曾衍东",
  "Du Qiong": "杜琼", "Lu Zhi": "陆治", "Wang Jianzhang": "王建章",
  "Yao Tingmei": "姚廷美", "Yun Shouping": "恽寿平", "Zheng Xie": "郑燮",
  "Dai Jin": "戴进", "Yu Zhiding": "禹之鼎", "Qian Xuan": "钱选",
  "Fang Shishu": "方士庶", "Su Hanchen": "苏汉臣", "Liu Songnian": "刘松年",
  "Wang Jian": "王鉴", "Zhang Feng": "张风", "Song Ke": "宋克", "Liang Kai": "梁楷",
  "Chen Jiru": "陈继儒", "Yuan Yao": "袁耀", "Xu Wei": "徐渭", "Fan Kuan": "范宽",
  "Dong Yuan": "董源", "Guan Tong": "关仝", "Guo Xi": "郭熙", "Li Cheng": "李成",
  "Xia Gui": "夏圭", "Wang Wei": "王维", "Wu Zhen": "吴镇", "Shen Quan": "沈铨",
  "Gao Qipei": "高其佩", "Huang Shen": "黄慎", "Jin Nong": "金农",
  "Li Fangying": "李方膺", "Zhu Da": "朱耷", "Wang Shimin": "王时敏",
  "Yunxi": "允禧", "Lang Shining": "郎世宁",
  "Giuseppe Castiglione": "郎世宁", "Emperor Huizong": "宋徽宗", "Zhao Ji": "赵佶",
  "Guo Zhongshu": "郭忠恕", "Wang Meng": "王蒙", "Lin Bu": "林逋",
  "Wang Me": "王翚", "Wang Mei": "王翚"
};

/* 短语优先（长词在前） */
const TITLE_PHRASES = [
  [/paintings after ancient masters\s*:\s*daoist and cran(?:e)?s?/gi, "仿古人物册·道士与鹤"],
  [/paintings after ancient masters\s*:\s*landscape[^\n]*/gi, "仿古人物册·山水"],
  [/paintings after ancient masters/gi, "仿古人物册"],
  [/album of seasonal landscapes\s*,?\s*leaf\s*([a-h])\b[^\n]*/gi, (_, L) => `节令山水册·${L.toUpperCase()}叶`],
  [/album of seasonal landscapes/gi, "节令山水册"],
  [/album of miscellaneous subjects\s*,?\s*leaf\s*(\d+)\b[^\n]*/gi, (_, n) => `杂画册·第${n}开`],
  [/album of miscellaneous subjects/gi, "杂画册"],
  [/landscape album in various styles\s*:\s*the stream of[^\n]*/gi, "诸体山水册·溪涧"],
  [/landscape album in various styles/gi, "诸体山水册"],
  [/landscapes after song and yuan masters/gi, "仿宋元山水"],
  [/landscapes after old masters/gi, "仿古山水"],
  [/paintings after old masters/gi, "仿古画册"],
  [/tall bamboo and distant mountains[^\n]*/gi, "修竹远山"],
  [/bamboo,?\s*rocks?,?\s*and\s*lonely orchids?/gi, "竹石幽兰"],
  [/bamboo in the wind/gi, "风竹"],
  [/bamboo in snow/gi, "雪竹"],
  [/ink bamboo/gi, "墨竹"],
  [/ink plum/gi, "墨梅"],
  [/ink orchid/gi, "墨兰"],
  [/a prunus in the moonlight/gi, "月下墨梅"],
  [/plum blossoms? and peonies?/gi, "梅花牡丹"],
  [/plum blossoms?/gi, "梅花"],
  [/lily and butterflies/gi, "百合蛱蝶"],
  [/garden for solitary enjoyment/gi, "独乐园图"],
  [/the poet lin bu wandering in the moonlight/gi, "林逋踏月"],
  [/reminiscences of qinhuai river/gi, "秦淮忆旧"],
  [/river and mountains on a clear autumn day/gi, "秋日江山"],
  [/river village\s*:?\s*fisherman'?s? joy/gi, "江村渔乐"],
  [/landscape after guo zhongshu/gi, "仿郭忠恕山水"],
  [/landscape after ([a-z\s']{2,40})/gi, (_, name) => `仿${artistZh(name.trim()) || "古"}山水`],
  [/after ancient masters/gi, "仿古"],
  [/after old masters/gi, "仿古"],
  [/miscellaneous subjects/gi, "杂画"],
  [/illustrating the ten/gi, "十咏"],
  [/poetical ideas/gi, "诗意"],
  [/poetic ideas/gi, "诗意"],
  [/clear autumn day/gi, "清秋"],
  [/fisherman'?s? joy/gi, "渔乐"],
  [/returning home/gi, "归庄"],
  [/listening to the wind/gi, "听风"],
  [/viewing plum blossoms/gi, "赏梅"],
  [/by moonlight/gi, "月下"],
  [/in the wind/gi, "风中"],
  [/in splashed ink/gi, "泼墨"],
  [/splashed ink/gi, "泼墨"],
  [/distant mountains/gi, "远山"],
  [/cloudy mountains/gi, "云山"],
  [/river village/gi, "江村"],
  [/river and mountains/gi, "江山"],
  [/tall bamboo/gi, "修竹"],
  [/lonely orchids?/gi, "幽兰"],
  [/bamboo.?and.?rocks?/gi, "竹石"],
  [/pine.?and.?rocks?/gi, "松石"],
  [/flowers? and birds?/gi, "花鸟"],
  [/bird and flower/gi, "花鸟"],
  [/in the style of/gi, "仿"],
  [/after the style of/gi, "仿"],
  [/in the manner of/gi, "仿"],
  [/handscroll/gi, "手卷"],
  [/hanging scroll/gi, "立轴"],
  [/album leaf/gi, "册页"],
  [/\(\s*previous[^)]*\)/gi, ""],
  [/previous l(?:eaf)?/gi, ""],
  [/smithsonian/gi, ""],
  [/twelve views/gi, "十二景"],
  [/ten views/gi, "十景"],
  [/five views/gi, "五景"],
  [/tiger hill/gi, "虎丘"],
  [/daoist and cran(?:e)?s?/gi, "道士与鹤"],
  [/daoist/gi, "道士"],
  [/the stream of/gi, "溪涧"],
  [/stream of/gi, "溪"],
  [/scholar'?s? studio/gi, "书斋"],
  [/studio desk/gi, "书案"],
  [/leaf\s*([a-h])/gi, (_, L) => `·${L.toUpperCase()}叶`],
  [/leaf\s*(\d+)/gi, (_, n) => `·第${n}开`],
  [/leaf\s+/gi, "叶"]
];

const TITLE_WORDS = {
  landscape: "山水", landscapes: "山水", painting: "图", paintings: "画册",
  album: "册", bamboo: "竹", pine: "松", plum: "梅", orchid: "兰", orchids: "兰",
  chrysanthemum: "菊", flower: "花", flowers: "花卉", blossom: "花", blossoms: "花",
  bird: "禽", birds: "禽鸟", crane: "鹤", cranes: "鹤", goose: "雁", geese: "雁",
  duck: "鸭", fish: "鱼", horse: "马", horses: "马", tiger: "虎",
  mountain: "山", mountains: "山", peak: "峰", peaks: "峰", hill: "丘", hills: "丘",
  river: "江", rivers: "江", stream: "溪", streams: "溪", lake: "湖", lakes: "湖",
  waterfall: "瀑", spring: "春", autumn: "秋", summer: "夏", winter: "冬",
  snow: "雪", rain: "雨", mist: "烟岚", cloud: "云", clouds: "云",
  wind: "风", moon: "月", moonlight: "月色", night: "夜", dawn: "晓",
  rock: "石", rocks: "石", stone: "石", willow: "柳", willows: "柳",
  pavilion: "亭", temple: "寺", hut: "茅舍", dwelling: "幽居", retreat: "隐居",
  scholar: "高士", fisherman: "渔父", boat: "舟", sailboat: "帆舟",
  village: "村", bridge: "桥", forest: "林", tree: "树", trees: "树",
  lotus: "荷", grape: "葡萄", grapes: "葡萄", peach: "桃", peony: "牡丹", peonies: "牡丹",
  portrait: "像", calligraphy: "书法", poem: "诗", poetry: "诗意", poet: "诗人",
  garden: "园", solitary: "独", enjoyment: "乐", lily: "百合", butterflies: "蝶",
  butterfly: "蝶", prunus: "梅", wandering: "漫步", reminiscences: "忆旧",
  after: "仿", ancient: "古", old: "古", masters: "诸家", master: "名家",
  various: "诸", styles: "体", style: "体", seasonal: "节令",
  clear: "清", distant: "远", lonely: "幽", tall: "修",
  returning: "归", home: "庄", viewing: "赏", listening: "听",
  illustrating: "图咏", subjects: "题材", miscellaneous: "杂",
  desk: "案", studio: "斋", views: "景", view: "景",
  and: "", of: "", the: "", in: "", on: "", at: "", with: "", to: "",
  a: "", an: "", from: "", by: "", for: ""
};

const MOTIF_ZH_FALLBACK = {
  mountain: "山水", mist: "烟岚", water: "江河", pine: "松", bamboo: "竹",
  plum: "梅", orchid: "兰", blossom: "花卉", geese: "禽鸟", moon: "月",
  snow: "雪", boat: "渔舟", pavilion: "亭台", hut: "幽居", spring: "春",
  autumn: "秋", figure: "人物", rock: "石", willow: "柳", wine: "酒"
};

function isLatinTitle(title) {
  const t = String(title || "");
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  return latin >= 3 && latin > cjk;
}

function isLatinArtist(artist) {
  return /[A-Za-z]{2,}/.test(String(artist || ""));
}

function artistZh(artist) {
  const a = String(artist || "").trim();
  if (!a) return "";
  if (ARTIST_ZH[a]) return ARTIST_ZH[a];
  const short = a.replace(/\s*\([^)]*japanese[^)]*\)/i, "").replace(/\s*—.*$/, "").trim();
  if (ARTIST_ZH[short]) return ARTIST_ZH[short];
  for (const [en, zh] of Object.entries(ARTIST_ZH)) {
    if (a.startsWith(en) || short.startsWith(en)) return zh;
  }
  if (!isLatinArtist(a)) return a;
  return a;
}

function titleZh(title, motifs) {
  let t = String(title || "").trim();
  if (!t) return "";
  if (!isLatinTitle(t)) return t;
  const original = t;

  for (const [re, zh] of TITLE_PHRASES) t = t.replace(re, zh);

  for (const [en, zh] of Object.entries(ARTIST_ZH)) {
    const re = new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    t = t.replace(re, zh);
  }

  t = t.replace(/[A-Za-z][A-Za-z'’-]*/g, w => {
    if (/^[A-Ha-h]$/.test(w)) return w.toUpperCase();
    const low = w.toLowerCase().replace(/’/g, "'");
    if (TITLE_WORDS[low] !== undefined) return TITLE_WORDS[low];
    return w;
  });

  t = t
    .replace(/\([^)]*\)/g, "")
    .replace(/\([^)]*$/g, "")
    .replace(/[,:;|/]+/g, "·")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, "")
    .replace(/·+/g, "·")
    .replace(/^·|·$/g, "")
    .replace(/([图册页轴卷开])\1+/g, "$1");

  /* 册页字母保留为拉丁单字符标记，暂换成中文干支感叹号式：A叶→甲叶 等太重，直接「第X叶」 */
  t = t.replace(/·([A-H])叶/g, (_, L) => `·${L}叶`);

  const left = (t.match(/[A-Za-z]/g) || []).length;
  if (left >= 4 || t.length < 2) {
    const parts = [];
    const low = original.toLowerCase();
    const push = s => { if (s && !parts.includes(s)) parts.push(s); };
    if (/after/.test(low)) push("仿古");
    if (/album/.test(low)) push("册页");
    if (/bamboo/.test(low)) push("竹");
    if (/plum|prunus/.test(low)) push("梅");
    if (/orchid/.test(low)) push("兰");
    if (/pine/.test(low)) push("松");
    if (/landscape|mountain/.test(low)) push("山水");
    if (/bird|crane|flower|lily|butterfly/.test(low)) push("花鸟");
    if (/snow/.test(low)) push("雪景");
    if (/moon/.test(low)) push("月");
    if (/garden|retreat|dwelling/.test(low)) push("园林");
    if (/poet|scholar|portrait/.test(low)) push("人物");
    if (/river|stream|lake/.test(low)) push("江河");
    (motifs || []).forEach(m => { if (MOTIF_ZH_FALLBACK[m]) push(MOTIF_ZH_FALLBACK[m]); });
    t = (parts.length ? parts.slice(0, 3).join("") : "书画") + (parts.includes("册页") ? "" : "图");
    t = t.replace(/册页图/, "册页").replace(/图图/, "图");
  } else {
    /* 保留单个册页字母 A-H */
    t = t.replace(/[A-Za-z'’.-]+/g, (m) => /^[A-H]$/.test(m) ? m : "");
  }

  if (!/[图册页轴卷意景开叶]$/.test(t) && t.length >= 2 && t.length <= 12) t += "图";
  return t || "书画图";
}

/** 返回 { title, titleZh, artist, artistZh, showTitleZh, showArtistZh } */
function localizeInk(g) {
  const title = g.title || "";
  const artist = g.artist || "";
  const tZh = g.titleZh || titleZh(title, g.motifs);
  const aZh = g.artistZh || artistZh(artist);
  const showTitleZh = isLatinTitle(title) && tZh && tZh !== title;
  const showArtistZh = isLatinArtist(artist) && aZh && aZh !== artist && !/[\u4e00-\u9fff]/.test(artist);
  return { title, titleZh: tZh, artist, artistZh: aZh, showTitleZh, showArtistZh };
}

function inkLocalBlob(g) {
  const L = localizeInk(g);
  return [L.title, L.titleZh, L.artist, L.artistZh].filter(Boolean).join("|");
}
