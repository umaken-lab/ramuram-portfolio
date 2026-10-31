#!/usr/bin/env node
/**
 * Instagram 投稿スクリプト
 *
 * Meta の「Instagram API with Instagram Login」を使う。
 * この経路は Facebookページの紐づけが不要。
 *   ベースURL : https://graph.instagram.com
 *   必要な権限 : instagram_business_content_publish
 *   画像形式   : JPEG のみ（PNG不可）
 *   画像の置き場: 公開URL（Meta側が取りに来るため）
 *
 * 使い方
 *   # 何が送られるかを表示するだけ（既定・安全）
 *   node scripts/ig-publish.js --post cafe
 *
 *   # 実際に投稿する
 *   node scripts/ig-publish.js --post cafe --go
 *
 *   # 投稿可能な残り回数を確認
 *   node scripts/ig-publish.js --limit
 *
 * 必要な環境変数（.env.ig に書く。このファイルは公開されない）
 *   IG_USER_ID      Instagramのユーザー番号
 *   IG_ACCESS_TOKEN 長期アクセストークン（60日で失効。要更新）
 */

const fs = require("fs");
const path = require("path");

const BASE = "https://graph.instagram.com";
const SITE = "https://ramuram.drca-business.workers.dev/assets/ig";
const ROOT = path.resolve(__dirname, "..");

/* ── 投稿の定義 ───────────────────────────── */
const POSTS = {
  cafe: {
    images: ["cafe_01", "cafe_02", "cafe_03", "cafe_04", "cafe_05", "cafe_06", "cafe_07"],
    captionFile: "captions/cafe.txt",
  },
  hair: {
    images: ["hair_01", "hair_02", "hair_03", "hair_04", "hair_05", "hair_06", "hair_07"],
    captionFile: "captions/hair.txt",
  },
  nail: {
    images: ["nail_01", "nail_02", "nail_03", "nail_04", "nail_05", "nail_06", "nail_07"],
    captionFile: "captions/nail.txt",
  },
  text1: { images: ["text_01"], captionFile: "captions/text1.txt" },
  text2: { images: ["text_02"], captionFile: "captions/text2.txt" },
  text3: { images: ["text_03"], captionFile: "captions/text3.txt" },
};

/* ── 設定の読み込み ───────────────────────── */
function loadEnv() {
  const f = path.join(ROOT, ".env.ig");
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return {
    id: process.env.IG_USER_ID,
    token: process.env.IG_ACCESS_TOKEN,
  };
}

async function api(endpoint, params, token, method = "POST") {
  const url = new URL(`${BASE}/v23.0/${endpoint}`);
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (method === "POST") {
    opts.body = new URLSearchParams(params);
  } else {
    for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  }
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    throw new Error(
      `API ${r.status}: ${JSON.stringify(j.error || j).slice(0, 400)}`
    );
  }
  return j;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 本体 ─────────────────────────────────── */
async function main() {
  const args = process.argv.slice(2);
  const go = args.includes("--go");
  const limitOnly = args.includes("--limit");
  const key = args[args.indexOf("--post") + 1];

  const { id, token } = loadEnv();

  if (limitOnly) {
    if (!id || !token) return fail("IG_USER_ID と IG_ACCESS_TOKEN が未設定です。");
    const j = await api(`${id}/content_publishing_limit`, { fields: "quota_usage,config" }, token, "GET");
    console.log("投稿枠:", JSON.stringify(j, null, 2));
    return;
  }

  const post = POSTS[key];
  if (!post) {
    return fail(`--post に ${Object.keys(POSTS).join(" / ")} のいずれかを指定してください。`);
  }

  /* 画像の存在とキャプションを確認 */
  const urls = post.images.map((n) => `${SITE}/${n}.jpg`);
  const capPath = path.join(__dirname, post.captionFile);
  if (!fs.existsSync(capPath)) return fail(`キャプションがありません: ${capPath}`);
  const caption = fs.readFileSync(capPath, "utf8").trim();

  console.log(`\n投稿: ${key}`);
  console.log(`枚数: ${urls.length}`);
  urls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
  console.log(`\nキャプション (${caption.length}文字):\n${"-".repeat(50)}\n${caption}\n${"-".repeat(50)}`);

  /* 画像が実際に取得できるか（Meta側が取りに来るため必須） */
  console.log("\n画像の到達確認:");
  let ng = 0;
  for (const u of urls) {
    const r = await fetch(u, { method: "HEAD" }).catch(() => null);
    const ct = r && r.headers.get("content-type");
    const ok = r && r.ok && /jpeg/i.test(ct || "");
    console.log(`  ${ok ? "OK " : "NG "} ${r ? r.status : "---"} ${ct || ""}  ${u}`);
    if (!ok) ng++;
  }
  if (ng) return fail(`${ng}件の画像が取得できません。公開されているか確認してください。`);

  if (!go) {
    console.log("\n[確認のみ] 実際に投稿するには --go を付けてください。");
    return;
  }

  if (!id || !token) return fail("IG_USER_ID と IG_ACCESS_TOKEN が未設定です。");

  /* 単体投稿 */
  if (urls.length === 1) {
    console.log("\n単体投稿を作成します…");
    const c = await api(`${id}/media`, { image_url: urls[0], caption }, token);
    console.log("  コンテナ:", c.id);
    const p = await api(`${id}/media_publish`, { creation_id: c.id }, token);
    console.log("  公開完了:", p.id);
    return;
  }

  /* カルーセル */
  console.log("\n各画像のコンテナを作成します…");
  const children = [];
  for (const u of urls) {
    const c = await api(`${id}/media`, { image_url: u, is_carousel_item: "true" }, token);
    console.log("  ", c.id, u.split("/").pop());
    children.push(c.id);
    await wait(1000);
  }

  console.log("\nカルーセルをまとめます…");
  const car = await api(
    `${id}/media`,
    { media_type: "CAROUSEL", children: children.join(","), caption },
    token
  );
  console.log("  コンテナ:", car.id);

  /* 準備完了を待つ */
  for (let i = 0; i < 10; i++) {
    const s = await api(car.id, { fields: "status_code" }, token, "GET");
    console.log("  状態:", s.status_code);
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR") return fail("コンテナの作成に失敗しました。");
    await wait(6000);
  }

  const p = await api(`${id}/media_publish`, { creation_id: car.id }, token);
  console.log("\n公開完了:", p.id);
}

function fail(msg) {
  console.error("\n[中止] " + msg);
  process.exitCode = 1;
}

main().catch((e) => fail(e.message));
