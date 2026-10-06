/**
 * 自 Wikimedia Commons 下载精编诗人公有领域肖像
 * 找不到则不写入映射（前端显示「无留存像」）
 * 用法: node tools/download-poet-portraits.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "poets");
const MAP_JS = path.join(ROOT, "js", "data", "poet-portraits.js");
const UA = "MoyunShijing/1.0 (poetry education; local)";
const THUMB = 640;

fs.mkdirSync(OUT_DIR, { recursive: true });

/** 精编诗人：优先用已知文件名，否则按关键词搜索 */
const POETS = [
  { id: "libai", name: "李白", files: ["Li Bai.jpg", "Libai.jpg", "Li Bai Portrait.jpg"], q: ["Li Bai poet", "李白 像"] },
  { id: "dufu", name: "杜甫", files: ["Du Fu.jpg", "Dufu.jpg", "Du Fu Portrait.jpg"], q: ["Du Fu poet", "杜甫 像"] },
  { id: "baijuyi", name: "白居易", files: ["Bai Juyi.jpg", "Baijuyi.jpg"], q: ["Bai Juyi", "白居易 像"] },
  { id: "wangwei", name: "王维", files: ["Wang Wei.jpg", "Wangwei.jpg", "Wang Wei poet.jpg"], q: ["Wang Wei Tang poet", "王维 像"] },
  { id: "menghaoran", name: "孟浩然", files: ["Meng Haoran.jpg"], q: ["Meng Haoran", "孟浩然 像"] },
  { id: "lishangyin", name: "李商隐", files: ["Li Shangyin.jpg"], q: ["Li Shangyin", "李商隐 像"] },
  { id: "dumu", name: "杜牧", files: ["Du Mu.jpg"], q: ["Du Mu poet", "杜牧 像"] },
  { id: "wangchangling", name: "王昌龄", files: [], q: ["Wang Changling", "王昌龄 像"] },
  { id: "wangzhihuan", name: "王之涣", files: [], q: ["Wang Zhihuan", "王之涣 像"] },
  { id: "liuyuxi", name: "刘禹锡", files: ["Liu Yuxi.jpg"], q: ["Liu Yuxi", "刘禹锡 像"] },
  { id: "mengjiao", name: "孟郊", files: [], q: ["Meng Jiao", "孟郊 像"] },
  { id: "jiadao", name: "贾岛", files: [], q: ["Jia Dao", "贾岛 像"] },
  { id: "lihe", name: "李贺", files: ["Li He.jpg"], q: ["Li He poet", "李贺 像"] },
  { id: "censhen", name: "岑参", files: [], q: ["Cen Shen", "岑参 像"] },
  { id: "gaoshi", name: "高适", files: [], q: ["Gao Shi poet", "高适 像"] },
  { id: "wentingyun", name: "温庭筠", files: [], q: ["Wen Tingyun", "温庭筠 像"] },
  { id: "zhangjiuling", name: "张九龄", files: [], q: ["Zhang Jiuling", "张九龄 像"] },
  { id: "wangbo", name: "王勃", files: ["Wang Bo.jpg"], q: ["Wang Bo poet", "王勃 像"] },
  { id: "zhangruoxu", name: "张若虚", files: [], q: ["Zhang Ruoxu", "张若虚 像"] },
  { id: "weiyingwu", name: "韦应物", files: [], q: ["Wei Yingwu", "韦应物 像"] },
  { id: "liuzongyuan", name: "柳宗元", files: ["Liu Zongyuan.jpg"], q: ["Liu Zongyuan", "柳宗元 像"] },
  { id: "hanyu", name: "韩愈", files: ["Han Yu.jpg", "HanYu.jpg"], q: ["Han Yu Tang", "韩愈 像"] },
  { id: "yuanzhen", name: "元稹", files: [], q: ["Yuan Zhen", "元稹 像"] },
  { id: "sushi", name: "苏轼", files: ["Su Shi.jpg", "Su Dongpo.jpg", "蘇軾.jpg"], q: ["Su Shi poet", "苏轼 像"] },
  { id: "xinqiji", name: "辛弃疾", files: ["Xin Qiji.jpg"], q: ["Xin Qiji", "辛弃疾 像"] },
  { id: "liqingzhao", name: "李清照", files: ["Li Qingzhao.jpg", "李清照.jpg"], q: ["Li Qingzhao", "李清照 像"] },
  { id: "luyou", name: "陆游", files: ["Lu You.jpg", "LuYou.jpg"], q: ["Lu You poet", "陆游 像"] },
  { id: "wanganshi", name: "王安石", files: ["Wang Anshi.jpg"], q: ["Wang Anshi", "王安石 像"] },
  { id: "liuyong", name: "柳永", files: [], q: ["Liu Yong poet", "柳永 像"] },
  { id: "liyu", name: "李煜", files: ["Li Yu.jpg", "Li Houzhu.jpg"], q: ["Li Yu Southern Tang", "李煜 像"] },
  { id: "ouyangxiu", name: "欧阳修", files: ["Ouyang Xiu.jpg"], q: ["Ouyang Xiu", "欧阳修 像"] },
  { id: "yanshu", name: "晏殊", files: [], q: ["Yan Shu", "晏殊 像"] },
  { id: "fanzhongyan", name: "范仲淹", files: ["Fan Zhongyan.jpg"], q: ["Fan Zhongyan", "范仲淹 像"] },
  { id: "zhuxi", name: "朱熹", files: ["Zhu Xi.jpg", "ZhuXi.jpg"], q: ["Zhu Xi", "朱熹 像"] },
  { id: "wentianxiang", name: "文天祥", files: ["Wen Tianxiang.jpg"], q: ["Wen Tianxiang", "文天祥 像"] },
  { id: "yangwanli", name: "杨万里", files: [], q: ["Yang Wanli", "杨万里 像"] },
  { id: "qinguan", name: "秦观", files: [], q: ["Qin Guan", "秦观 像"] },
  { id: "zhoubangyan", name: "周邦彦", files: [], q: ["Zhou Bangyan", "周邦彦 像"] },
  { id: "zhushuzhen", name: "朱淑真", files: [], q: ["Zhu Shuzhen", "朱淑真 像"] },
  { id: "quyuan", name: "屈原", files: ["Qu Yuan.jpg", "屈原.jpg", "Qu Yuan Portrait.jpg"], q: ["Qu Yuan", "屈原 像"] },
  { id: "taoyuanming", name: "陶渊明", files: ["Tao Yuanming.jpg", "Tao Qian.jpg"], q: ["Tao Yuanming", "陶渊明 像"] },
  { id: "caocao", name: "曹操", files: ["Cao Cao.jpg", "曹操.jpg"], q: ["Cao Cao", "曹操 像"] },
  { id: "mazhiyuan", name: "马致远", files: [], q: ["Ma Zhiyuan", "马致远 像"] },
  { id: "zhangyanghao", name: "张养浩", files: [], q: ["Zhang Yanghao", "张养浩 像"] },
  { id: "wangmian", name: "王冕", files: ["Wang Mian.jpg"], q: ["Wang Mian painter", "王冕 像"] },
  { id: "yuqian", name: "于谦", files: ["Yu Qian.jpg"], q: ["Yu Qian Ming", "于谦 像"] },
  { id: "tangyin", name: "唐寅", files: ["Tang Yin.jpg", "Tang Yin painter.jpg"], q: ["Tang Yin", "唐寅 像"] },
  { id: "nalanxingde", name: "纳兰性德", files: ["Nalan Xingde.jpg"], q: ["Nalan Xingde", "纳兰性德 像"] },
  { id: "zhengxie", name: "郑燮", files: ["Zheng Xie.jpg", "Zheng Banqiao.jpg"], q: ["Zheng Xie Banqiao", "郑板桥 像"] },
  { id: "gongzizhen", name: "龚自珍", files: ["Gong Zizhen.jpg"], q: ["Gong Zizhen", "龚自珍 像"] },
  { id: "yuanmei", name: "袁枚", files: ["Yuan Mei.jpg"], q: ["Yuan Mei poet", "袁枚 像"] },
  { id: "wj_001", name: "曹植", files: ["Cao Zhi.jpg"], q: ["Cao Zhi poet", "曹植 像"] },
  { id: "wj_005", name: "阮籍", files: ["Ruan Ji.jpg"], q: ["Ruan Ji poet", "阮籍 像"] },
  { id: "wj_007", name: "曹丕", files: ["Cao Pi.jpg"], q: ["Cao Pi", "曹丕 像"] },
  { id: "wj_009", name: "嵇康", files: ["Ji Kang.jpg", "Xi Kang.jpg"], q: ["Ji Kang poet", "嵇康 像"] },
  { id: "nbc_001", name: "庾信", files: ["Yu Xin.jpg"], q: ["Yu Xin poet", "庾信 像"] },
  { id: "nbc_004", name: "鲍照", files: ["Bao Zhao.jpg"], q: ["Bao Zhao poet", "鲍照 像"] },
  { id: "nbc_005", name: "谢朓", files: ["Xie Tiao.jpg"], q: ["Xie Tiao", "谢朓 像"] },
  { id: "nbc_010", name: "谢灵运", files: ["Xie Lingyun.jpg"], q: ["Xie Lingyun", "谢灵运 像"] },
  { id: "tang_092", name: "陈子昂", files: ["Chen Zi'ang.jpg", "Chen Ziang.jpg"], q: ["Chen Zi'ang", "陈子昂 像"] },
  { id: "tang_090", name: "骆宾王", files: ["Luo Binwang.jpg"], q: ["Luo Binwang", "骆宾王 像"] },
  { id: "tang_018", name: "刘长卿", files: ["Liu Changqing.jpg"], q: ["Liu Changqing", "刘长卿 像"] },
  { id: "tang_029", name: "韦庄", files: ["Wei Zhuang.jpg"], q: ["Wei Zhuang poet", "韦庄 像"] },
  { id: "song_008", name: "梅尧臣", files: ["Mei Yaochen.jpg"], q: ["Mei Yaochen", "梅尧臣 像"] },
  { id: "song_009", name: "黄庭坚", files: ["Huang Tingjian.jpg"], q: ["Huang Tingjian", "黄庭坚 像"] },
  { id: "song_014", name: "范成大", files: ["Fan Chengda.jpg"], q: ["Fan Chengda", "范成大 像"] },
  { id: "song_015", name: "苏辙", files: ["Su Zhe.jpg"], q: ["Su Zhe poet", "苏辙 像"] },
  { id: "song_034", name: "司马光", files: ["Sima Guang.jpg"], q: ["Sima Guang", "司马光 像"] },
  { id: "yuan_004", name: "元好问", files: ["Yuan Haowen.jpg"], q: ["Yuan Haowen", "元好问 像"] },
  { id: "yuan_011", name: "关汉卿", files: ["Guan Hanqing.jpg"], q: ["Guan Hanqing", "关汉卿 像"] },
  { id: "yuan_014", name: "赵孟頫", files: ["Zhao Mengfu.jpg", "Zhao Mengfu portrait.jpg"], q: ["Zhao Mengfu", "赵孟頫 像"] },
  { id: "ming_026", name: "刘基", files: ["Liu Ji.jpg", "Liu Bowen.jpg"], q: ["Liu Bowen", "刘基 像"] },
  { id: "ming_027", name: "徐渭", files: ["Xu Wei.jpg", "Xu Wei painter.jpg"], q: ["Xu Wei painter", "徐渭 像"] },
  { id: "ming_065", name: "高启", files: ["Gao Qi.jpg"], q: ["Gao Qi poet", "高启 像"] },
  { id: "ming_096", name: "王守仁", files: ["Wang Yangming.jpg", "Wang Shouren.jpg"], q: ["Wang Yangming", "王阳明 像"] },
  { id: "qing_054", name: "钱谦益", files: ["Qian Qianyi.jpg"], q: ["Qian Qianyi", "钱谦益 像"] },
  { id: "qing_083", name: "吴伟业", files: ["Wu Weiye.jpg"], q: ["Wu Weiye", "吴伟业 像"] },
  { id: "qing_050", name: "王士禛", files: ["Wang Shizhen.jpg"], q: ["Wang Shizhen poet Qing", "王士禛 像"] },
  { id: "qing_057", name: "朱彝尊", files: ["Zhu Yizun.jpg"], q: ["Zhu Yizun", "朱彝尊 像"] },
  { id: "han_016", name: "蔡琰", files: ["Cai Wenji.jpg", "Cai Yan.jpg"], q: ["Cai Wenji", "蔡文姬 像"] },
  { id: "xq_003", name: "宋玉", files: ["Song Yu.jpg"], q: ["Song Yu poet", "宋玉 像"] }
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const map = fs.existsSync(MAP_JS)
  ? (() => {
      try {
        const t = fs.readFileSync(MAP_JS, "utf8");
        const m = t.match(/POET_PORTRAITS\s*=\s*(\{[\s\S]*?\});/);
        return m ? JSON.parse(m[1]) : {};
      } catch { return {}; }
    })()
  : {};
let ok = Object.keys(map).length, miss = 0;

async function api(params, retries = 4) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) {
      const wait = 4000 * (i + 1);
      process.stdout.write(`(429 等待 ${wait / 1000}s) `);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  }
  throw new Error("API 429");
}

async function resolveFile(commonsTitle) {
  const title = commonsTitle.startsWith("File:") ? commonsTitle : `File:${commonsTitle}`;
  const data = await api({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: String(THUMB)
  });
  const page = Object.values(data.query.pages)[0];
  if (!page || page.missing != null || !page.imageinfo) return null;
  const info = page.imageinfo[0];
  const mime = info.mime || "";
  if (!/^image\/(jpeg|png|webp)/.test(mime)) return null;
  return { url: info.thumburl || info.url, mime, title: page.title };
}

async function searchFile(query) {
  const data = await api({
    action: "query",
    list: "search",
    srsearch: `filetype:bitmap ${query}`,
    srnamespace: "6",
    srlimit: "8"
  });
  for (const h of data.query?.search || []) {
    const low = (h.title || "").toLowerCase();
    // 跳过明显非肖像：书法、风景、书影等
    if (/calligraphy|landscape|mountains|poem text|book cover|stele|inscription/.test(low)) continue;
    const file = await resolveFile(h.title);
    if (file) return file;
    await sleep(120);
  }
  return null;
}

function extFromMime(mime) {
  if (mime?.includes("png")) return ".png";
  if (mime?.includes("webp")) return ".webp";
  return ".jpg";
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function findPortrait(p) {
  for (const f of p.files || []) {
    const hit = await resolveFile(f);
    if (hit) return hit;
    await sleep(200);
  }
  for (const q of p.q || []) {
    const hit = await searchFile(q);
    if (hit) return hit;
    await sleep(400);
  }
  return null;
}

for (const p of POETS) {
  if (map[p.id] && fs.existsSync(path.join(OUT_DIR, map[p.id]))) {
    console.log(`· ${p.name} (${p.id}) … 已有`);
    continue;
  }
  process.stdout.write(`· ${p.name} (${p.id}) … `);
  try {
    const hit = await findPortrait(p);
    if (!hit) {
      console.log("无留存像");
      miss++;
      continue;
    }
    const ext = extFromMime(hit.mime);
    const file = `${p.id}${ext}`;
    const dest = path.join(OUT_DIR, file);
    await download(hit.url, dest);
    map[p.id] = file;
    console.log(`✓ ${hit.title} → ${file}`);
    ok++;
  } catch (e) {
    console.log("失败:", e.message);
    miss++;
  }
  await sleep(1200);
}

const body = `/* 诗人肖像映射：有公有领域存像者才收录；其余前端显示「无留存像」 */
window.POET_PORTRAITS = ${JSON.stringify(map, null, 2)};
`;
fs.writeFileSync(MAP_JS, body, "utf8");
console.log(`\n完成：有像 ${Object.keys(map).length}（本轮新增/确认），未得 ${miss} → ${MAP_JS}`);
