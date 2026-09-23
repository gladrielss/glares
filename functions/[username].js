// glaress.pages.dev/<username> — the shareable profile link people put in
// their Instagram bio.
//
// Serves the normal profile page, with two things added on the way out:
//  - Open Graph / Twitter tags, so the link unfurls into a card with the
//    person's name, bio and a photo in Instagram DMs, iMessage, Telegram…
//    Those crawlers don't run JavaScript, so this has to happen server-side.
//  - A <meta name="glares:username"> with the exact stored spelling, so the
//    page doesn't have to guess the capitalisation someone typed.
//
// Anything that isn't a profile (a page, a file, a reserved word) is handed
// straight to the static site with next().
import { adminClient } from "../lib/supabase.js";

const RESERVED = new Set([
  "api", "css", "js", "images", "index", "profile", "profiles", "request", "requests",
  "reel", "messages", "store", "store-item", "search", "settings", "admin", "glares",
  "about", "help", "login", "signup", "explore", "dist", "functions", "www"
]);

// Root-level files. A username can contain dots, so only these endings are
// treated as files rather than profiles.
const FILE_ENDING = /\.(html?|js|mjs|css|map|ico|png|jpe?g|gif|svg|webp|avif|txt|xml|json|webmanifest)$/i;

const USERNAME = /^[A-Za-z0-9._]{1,30}$/;

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function likeEscape(value) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function findProfile(env, username) {
  const db = adminClient(env);
  const columns = "id, username, bio, avatar_url";
  const exact = await db.from("profiles").select(columns).eq("username", username).maybeSingle();
  if (exact.error) throw exact.error;
  if (exact.data) return exact.data;
  // Typed with different capitals than it was saved with.
  const loose = await db.from("profiles").select(columns).ilike("username", likeEscape(username)).limit(1);
  if (loose.error) throw loose.error;
  return loose.data?.[0] ?? null;
}

async function profileExtras(env, profileId) {
  const db = adminClient(env);
  const [latest, count] = await Promise.all([
    db.from("requests")
      .select("image_url")
      .eq("user_id", profileId)
      .not("image_url", "is", null)
      .neq("image_url", "")
      .order("created_at", { ascending: false })
      .limit(1),
    db.from("requests").select("id", { count: "exact", head: true }).eq("user_id", profileId)
  ]);
  return {
    coverImage: latest.data?.[0]?.image_url ?? null,
    postCount: count.count ?? 0
  };
}

async function profileShell(request, env) {
  // "/profile" rather than "/profile.html": Pages redirects .html to the
  // extensionless path, and we want the page itself, not the redirect.
  let res = await env.ASSETS.fetch(new URL("/profile", request.url));
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    res = await env.ASSETS.fetch(new URL(res.headers.get("location"), request.url));
  }
  return res;
}

export async function onRequest(context) {
  const { request, env, params, next } = context;
  if (request.method !== "GET" && request.method !== "HEAD") return next();

  let username;
  try {
    username = decodeURIComponent(String(params.username || ""));
  } catch (_) {
    return next();
  }
  if (!USERNAME.test(username) || FILE_ENDING.test(username) || RESERVED.has(username.toLowerCase())) {
    return next();
  }

  let profile = null;
  let extras = { coverImage: null, postCount: 0 };
  try {
    profile = await findProfile(env, username);
    if (profile) extras = await profileExtras(env, profile.id);
  } catch (_) {
    // Database trouble shouldn't take the page down — the profile page can
    // still load itself in the browser, just without a link preview.
  }

  const shell = await profileShell(request, env);
  if (!shell.ok) return next();

  const origin = new URL(request.url).origin;
  const name = profile?.username ?? username;
  const url = `${origin}/${encodeURIComponent(name)}`;
  const title = profile ? `${name} on Glares` : "Glares";
  const description = profile
    ? (profile.bio?.trim() || `${extras.postCount} ${extras.postCount === 1 ? "post" : "posts"} · Taste, on request.`)
    : "Taste, on request. Real people recommending real things.";
  const image = extras.coverImage || profile?.avatar_url || `${origin}/images/cover-unisex.jpg`;
  const bigImage = Boolean(extras.coverImage);

  const tags = [
    `<meta name="glares:username" content="${escapeAttr(name)}">`,
    `<link rel="canonical" href="${escapeAttr(url)}">`,
    `<meta name="description" content="${escapeAttr(description)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="Glares">`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
    `<meta property="og:url" content="${escapeAttr(url)}">`,
    `<meta property="og:image" content="${escapeAttr(image)}">`,
    `<meta property="profile:username" content="${escapeAttr(name)}">`,
    `<meta name="twitter:card" content="${bigImage ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${escapeAttr(title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(description)}">`,
    `<meta name="twitter:image" content="${escapeAttr(image)}">`
  ].join("\n");

  const rewritten = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(profile ? `${name} — Glares` : "Profile — Glares"); } })
    .on("head", { element(el) { el.append(tags, { html: true }); } })
    .transform(shell);

  const headers = new Headers(rewritten.headers);
  // Bios and photos change; a short cache keeps previews reasonably fresh.
  headers.set("Cache-Control", "public, max-age=60");
  return new Response(rewritten.body, { status: profile ? 200 : 404, headers });
}
