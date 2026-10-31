#!/usr/bin/env node
/**
 * リール用に、公開中のサンプルサイトの調整版を public/sites/ に作り直す。
 *
 * なぜ複製が要るか:
 *   リールは「スマホの中をスクロールしていく」絵にしている。
 *   公開ページをそのまま背の高いiframeで読むと 100svh が iframe の高さになり、
 *   ヒーローだけでページ全体が埋まってスクロールできない。
 *   そこでヒーローを790px（スマホ1画面）に固定した複製を使う。
 *
 * 使い方:  node scripts/sync-reel-sites.js
 * サイトを直したら、これを実行してからリールを書き出すこと。
 */
const fs = require("fs");
const path = require("path");

const BASE = "https://ramuram.drca-business.workers.dev/works/";
const OUT = path.resolve(__dirname, "../reels-video/public/sites");
const MAP = { "komichi-cafe": "cafe", "lino-hair": "hair", "lune-nail": "nail" };

const FIX = `<style id="reelfix">
  .hero{height:790px !important;min-height:790px !important}
  .demo-bar{display:none !important}
  body{padding-bottom:0 !important}
  .hd{position:absolute !important;top:0 !important}
  .rail,.callbtn,.resv,.scroll{display:none !important}
  .rv{opacity:1 !important;transform:none !important}
  html{scroll-behavior:auto !important}
  *{animation:none !important}
</style></head>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [slug, name] of Object.entries(MAP)) {
    const r = await fetch(BASE + slug + "/");
    if (!r.ok) { console.error("取得失敗:", slug, r.status); continue; }
    let t = await r.text();
    if (!t.includes("</head>")) { console.error("head なし:", slug); continue; }
    t = t.replace("</head>", FIX);
    fs.writeFileSync(path.join(OUT, name + ".html"), t, "utf8");
    console.log("書き出し:", name + ".html", (t.length / 1024).toFixed(0) + "KB");
  }
  console.log("\n高さが変わった場合は src/SiteScrollReel.tsx の pageHeight も更新すること");
})();
