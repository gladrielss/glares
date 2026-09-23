// The Cut — one post at a time, pass or keep.
//
// The grade carries the verdict: a card sits slightly desaturated until you
// commit to it, washes flat and grey as it heads left, and only warms into
// full colour on the way right. Passing is a hard cut with a mechanical
// click; keeping is held in silence. That's the whole idea — the look does
// the talking, so nothing here has to explain itself.

const CUT_VISIBLE = 3;          // cards rendered in the stack at once
const CUT_COMMIT_PX = 88;       // drag distance that counts as a decision
const CUT_COMMIT_VELOCITY = 0.5;
const CUT_HOLD_MS = 780;        // the beat a kept card is held, in silence

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let pool = [];            // every open post with a photo
let queue = [];           // what's left to deal, in play order
let cards = [];           // live DOM cards, cards[0] is on top
let history = [];         // { post, verdict, inserted } for undo
let keptPosts = [];
let passedCount = 0;
let dealtCount = 0;
let audienceFilter = decodeURIComponent(window.location.hash.slice(1)) || "";
let currentUser = null;
let busy = false;
let soundOn = true;

const stage = document.getElementById("cut-stage");
const live = document.getElementById("cut-live");
const undoBtn = document.getElementById("cut-undo");
const actions = document.getElementById("cut-actions");
const hint = document.getElementById("cut-hint");
const progressFill = document.getElementById("cut-progress-fill");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------------- sound ----------------
   Synthesised rather than loaded: a shutter/stamp is a noise burst with a
   fast decay and a little low body, which is a few lines here and no extra
   request. Nothing plays on keep — the silence is the point. */

let audioCtx = null;
let noiseBuffer = null;

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  const frames = Math.floor(audioCtx.sampleRate * 0.06);
  noiseBuffer = audioCtx.createBuffer(1, frames, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  return audioCtx;
}

function playShutter() {
  if (!soundOn) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2300;
  band.Q.value = 1.1;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.16, t + 0.002);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  noise.connect(band).connect(noiseGain).connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.07);

  const thud = ctx.createOscillator();
  thud.type = "sine";
  thud.frequency.setValueAtTime(150, t);
  thud.frequency.exponentialRampToValueAtTime(70, t + 0.05);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.0001, t);
  thudGain.gain.exponentialRampToValueAtTime(0.07, t + 0.004);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  thud.connect(thudGain).connect(ctx.destination);
  thud.start(t);
  thud.stop(t + 0.08);
}

function playTick() {
  if (!soundOn) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(420, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.03, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

function buzz(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} }
}

/* ---------------- cards ---------------- */

function buildCard(post) {
  const el = document.createElement("article");
  el.className = "cut-card";
  el.dataset.id = post.id;

  const asker = post.profiles?.username ?? "someone";
  el.innerHTML = `
    <div class="cut-photo">
      <img src="${escapeHtml(post.thumb_url || post.image_url)}" alt="" decoding="async">
      <span class="cut-veil-pass" aria-hidden="true"></span>
      <span class="cut-veil-keep" aria-hidden="true"></span>
      <div class="cut-card-top">
        ${post.category ? `<span class="cut-tag">${escapeHtml(post.category)}</span>` : "<span></span>"}
        ${post.found_recommendation_id ? `<span class="cut-tag cut-tag-found">${ICONS.check}<span>Found</span></span>` : ""}
      </div>
      <span class="cut-stamp cut-stamp-pass" aria-hidden="true">PASS</span>
      <span class="cut-stamp cut-stamp-keep" aria-hidden="true">KEEP</span>
      <div class="cut-card-bottom">
        ${post.title ? `<h2 class="cut-card-title">${escapeHtml(post.title.split("\n")[0])}</h2>` : ""}
        <div class="cut-card-meta">
          <span>asked by ${escapeHtml(asker)}</span>
          ${post.budget ? `<span class="cut-card-budget">${escapeHtml(post.budget)}</span>` : ""}
        </div>
      </div>
    </div>`;
  return el;
}

function setVerdict(card, dx) {
  const amount = Math.min(1, Math.abs(dx) / 120);
  const pass = dx < 0 ? amount : 0;
  const keep = dx > 0 ? amount : 0;
  card.style.setProperty("--pass-amt", pass.toFixed(3));
  card.style.setProperty("--keep-amt", keep.toFixed(3));

  // Flat and grey on the way out, warm on the way in. Written here rather
  // than in the sheet because a filter() built from calc(var(...)) resolves
  // once and then ignores later changes.
  const img = card.querySelector("img");
  if (!img) return;
  const sat = (0.88 - pass * 0.8 + keep * 0.34).toFixed(3);
  const con = (1.03 + pass * 0.13).toFixed(3);
  const bright = (1 - pass * 0.2 + keep * 0.07).toFixed(3);
  img.style.filter = `saturate(${sat}) contrast(${con}) brightness(${bright})`;
}

function layoutStack() {
  cards.forEach((card, i) => {
    card.style.zIndex = String(50 - i);
    card.classList.toggle("is-front", i === 0);
    card.style.pointerEvents = i === 0 ? "auto" : "none";
    if (i === 0) {
      card.classList.remove("is-behind");
      card.classList.add("is-settling");
      card.style.transform = "translate3d(0,0,0)";
      window.setTimeout(() => card.classList.remove("is-settling"), 380);
    } else {
      card.classList.add("is-behind");
      card.style.transform = `translate3d(0, ${i * 12}px, 0) scale(${1 - i * 0.052})`;
    }
  });
  paintProgress();
}

function paintProgress() {
  const total = pool.length ? filteredPool().length : 0;
  const done = total ? Math.min(dealtCount - cards.length, total) : 0;
  progressFill.style.width = total ? `${Math.max(0, (done / total) * 100)}%` : "0%";
}

function dealNext() {
  if (!queue.length) return;
  const post = queue.shift();
  const card = buildCard(post);
  card._post = post;
  stage.appendChild(card);
  cards.push(card);
  dealtCount++;
  // Warm the next photo so the stack never shows a blank card.
  if (queue[0]?.image_url) new Image().src = queue[0].thumb_url || queue[0].image_url;
}

function fill() {
  while (cards.length < CUT_VISIBLE && queue.length) dealNext();
  layoutStack();
  if (!cards.length) showSummary();
}

/* ---------------- verdicts ---------------- */

// The reject blows out to white inside the photo itself — the frame around
// it never changes, so the flash reads as the post being struck, not the UI.
function flashCard(card) {
  if (reduceMotion) return;
  const photo = card.querySelector(".cut-photo");
  if (!photo) return;
  const flash = document.createElement("span");
  flash.className = "cut-flash";
  photo.appendChild(flash);
  window.setTimeout(() => flash.remove(), 220);
}

async function commit(dir) {
  if (busy || !cards.length) return;
  busy = true;

  const card = cards.shift();
  const post = card._post;
  card.classList.remove("is-settling", "is-front");

  if (dir < 0) {
    passedCount++;
    setVerdict(card, -200);
    playShutter();
    flashCard(card);
    buzz(9);
    card.classList.add("is-out-pass");
    card.style.transform = `translate3d(${-(window.innerWidth + 240)}px, 26px, 0) rotate(-17deg)`;
    live.textContent = "Passed.";
    window.setTimeout(() => card.remove(), reduceMotion ? 10 : 320);
    fill();
    busy = false;
    return;
  }

  // Kept: full grade, everything else dims, held in silence.
  keptPosts.push(post);
  setVerdict(card, 200);
  buzz(16);
  card.classList.add("is-kept");
  stage.classList.add("is-holding");
  live.textContent = "Kept.";

  const inserted = await persistKeep(post);
  history.push({ post, verdict: "keep", inserted });
  undoBtn.disabled = false;

  window.setTimeout(() => {
    card.classList.add("is-kept-out");
    stage.classList.remove("is-holding");
    window.setTimeout(() => card.remove(), reduceMotion ? 10 : 420);
    fill();
    busy = false;
  }, reduceMotion ? 120 : CUT_HOLD_MS);
}

// A pass is recorded after the animation starts so undo stays in step with
// what's on screen.
function recordPass(post) {
  history.push({ post, verdict: "pass", inserted: false });
  undoBtn.disabled = false;
}

async function persistKeep(post) {
  if (!currentUser) return false;
  const { error } = await supabase
    .from("likes")
    .insert({ request_id: post.id, user_id: currentUser.id });
  return !error; // an error here is almost always "already liked", which is fine
}

async function undo() {
  if (busy || !history.length) return;
  const last = history.pop();
  undoBtn.disabled = !history.length;
  playTick();

  if (last.verdict === "keep") {
    keptPosts = keptPosts.filter(p => p.id !== last.post.id);
    // Only take the like back if this session is what put it there.
    if (last.inserted && currentUser) {
      await supabase.from("likes").delete()
        .eq("request_id", last.post.id).eq("user_id", currentUser.id);
    }
  } else {
    passedCount = Math.max(0, passedCount - 1);
  }

  hideSummary();

  // The card slides back in on top; the stack still only holds CUT_VISIBLE,
  // so the deepest one goes back to the front of the queue to be dealt again.
  const card = buildCard(last.post);
  card._post = last.post;
  card.classList.add("is-returning");
  stage.appendChild(card);
  cards.unshift(card);
  while (cards.length > CUT_VISIBLE) {
    const dropped = cards.pop();
    dropped.remove();
    queue.unshift(dropped._post);
    dealtCount--;
  }
  // Flush the entry state so the slide-in actually animates. A rAF would do
  // it too, but rAF is paused while the tab is in the background, which left
  // the returning card stuck invisible.
  void card.offsetWidth;
  card.classList.remove("is-returning");
  layoutStack();
  live.textContent = "Brought back.";
}

/* ---------------- drag ---------------- */

let dragging = false;
let startX = 0, startY = 0, dx = 0, dy = 0;
let lastX = 0, lastT = 0, vx = 0;
let grabLow = 0; // 0 at the top of the card, 1 at the bottom — tilts the rotation

function onDown(e) {
  if (busy || !cards.length) return;
  const card = cards[0];
  if (!card.contains(e.target)) return;
  dragging = true;
  card.classList.remove("is-settling");
  const rect = card.getBoundingClientRect();
  grabLow = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  startX = e.clientX; startY = e.clientY;
  lastX = e.clientX; lastT = e.timeStamp || Date.now();
  vx = 0;
  try { card.setPointerCapture(e.pointerId); } catch (_) {}
}

function onMove(e) {
  if (!dragging || !cards.length) return;
  const card = cards[0];
  dx = e.clientX - startX;
  dy = e.clientY - startY;

  const now = e.timeStamp || Date.now();
  const dt = now - lastT;
  if (dt > 0) {
    vx = (e.clientX - lastX) / dt;
    lastX = e.clientX; lastT = now;
  }

  // Grab near the bottom and the card swings further, like a real print.
  const rot = Math.max(-18, Math.min(18, dx * 0.055 * (0.55 + grabLow * 0.9)));
  card.style.transform = `translate3d(${dx}px, ${dy * 0.32}px, 0) rotate(${rot}deg)`;
  setVerdict(card, dx);
}

function onUp() {
  if (!dragging || !cards.length) return;
  dragging = false;
  const card = cards[0];
  const decided = Math.abs(dx) > CUT_COMMIT_PX || Math.abs(vx) > CUT_COMMIT_VELOCITY;

  if (decided && dx !== 0) {
    const dir = dx > 0 ? 1 : -1;
    if (dir < 0) recordPass(card._post);
    commit(dir);
  } else {
    card.classList.add("is-settling");
    card.style.transform = "translate3d(0,0,0)";
    setVerdict(card, 0);
  }
  dx = 0; dy = 0; vx = 0;
}

/* ---------------- screens ---------------- */

function hideSummary() {
  stage.querySelector(".cut-summary")?.remove();
  actions.style.display = "";
  hint.style.display = "";
}

function showSummary() {
  actions.style.display = "none";
  hint.style.display = "none";
  const seen = passedCount + keptPosts.length;
  const panel = document.createElement("div");
  panel.className = "cut-summary";
  panel.innerHTML = `
    <p class="cut-summary-count">${passedCount} passed · ${keptPosts.length} kept</p>
    <h2>${keptPosts.length ? "That's the cut." : "Nothing made the cut."}</h2>
    ${keptPosts.length ? `
      <div class="cut-summary-grid">
        ${keptPosts.slice(0, 9).map(p => `
          <a href="request.html#${p.id}" class="cut-summary-tile" style="background-image:url('${escapeHtml(p.thumb_url || p.image_url)}')" aria-label="${escapeHtml(p.title || "post")}"></a>
        `).join("")}
      </div>` : ""}
    ${keptPosts.length && !currentUser ? `<p class="cut-summary-note">Sign in and your keeps get saved to your likes.</p>` : ""}
    ${!seen ? `<p class="cut-summary-note">No posts here yet.</p>` : ""}
    <button type="button" class="cut-again" id="cut-again">Run it again</button>`;
  stage.appendChild(panel);
  panel.querySelector("#cut-again").addEventListener("click", () => deal());
}

function filteredPool() {
  return audienceFilter ? pool.filter(p => p.audience === audienceFilter) : pool;
}

function deal() {
  hideSummary();
  stage.querySelectorAll(".cut-card").forEach(c => c.remove());
  cards = [];
  history = [];
  keptPosts = [];
  passedCount = 0;
  dealtCount = 0;
  undoBtn.disabled = true;
  queue = shuffle(filteredPool());
  fill();
}

function renderChips() {
  const row = document.getElementById("cut-chips");
  const audiences = ["For Him", "For Her", "Unisex"].filter(a => pool.some(p => p.audience === a));
  row.innerHTML = [["", "Everything"], ...audiences.map(a => [a, a])]
    .map(([value, label]) => `
      <button type="button" class="cut-chip${audienceFilter === value ? " active" : ""}" data-audience="${escapeHtml(value)}">${escapeHtml(label)}</button>
    `).join("");
  row.addEventListener("click", (e) => {
    const chip = e.target.closest(".cut-chip");
    if (!chip || busy) return;
    audienceFilter = chip.dataset.audience;
    window.location.hash = audienceFilter ? encodeURIComponent(audienceFilter) : "";
    row.querySelectorAll(".cut-chip").forEach(c => c.classList.toggle("active", c.dataset.audience === audienceFilter));
    deal();
  });
}

function initSound() {
  const btn = document.getElementById("cut-sound");
  try { soundOn = localStorage.getItem("glares-cut-sound") !== "off"; } catch (_) {}
  const paint = () => {
    btn.innerHTML = soundOn
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9.5h3.2L13 5.5v13l-4.8-4H5z"/><path d="M16.5 9.4a3.6 3.6 0 0 1 0 5.2"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9.5h3.2L13 5.5v13l-4.8-4H5z"/><path d="M17 10l4 4M21 10l-4 4"/></svg>`;
    btn.setAttribute("aria-pressed", String(soundOn));
    btn.setAttribute("aria-label", soundOn ? "Mute sound" : "Unmute sound");
  };
  paint();
  btn.addEventListener("click", () => {
    soundOn = !soundOn;
    try { localStorage.setItem("glares-cut-sound", soundOn ? "on" : "off"); } catch (_) {}
    paint();
    if (soundOn) playTick();
  });
}

/* ---------------- film mode ----------------
   /cut?film=1 performs the sequence for a screen recording: rejects fire on
   a fixed beat so the rhythm is exact and repeatable, then everything stops
   on the keeper — full grade, silence — and pushes in until the photo fills
   the frame. That last frame is the cut point for the live-action shot.

   Params: beat (ms between rejects), rejects (how many), keep (a request id
   to stop on, otherwise the first Places post), bare=1 to hide the chrome. */

function filmOptions() {
  const q = new URLSearchParams(window.location.search);
  return {
    on: q.get("film") === "1",
    beat: Math.max(140, Number(q.get("beat")) || 360),
    rejects: Math.max(1, Number(q.get("rejects")) || 7),
    keepId: q.get("keep") || "",
    bare: q.get("bare") === "1",
    push: Math.max(600, Number(q.get("push")) || 2600)
  };
}

function pickKeeper(opts) {
  if (opts.keepId) {
    const chosen = pool.find(p => p.id === opts.keepId);
    if (chosen) return chosen;
  }
  // The script wants a place to travel into, so a Places post leads.
  return pool.find(p => p.category === "Places") || pool[0];
}

async function runFilm() {
  const opts = filmOptions();
  const keeper = pickKeeper(opts);
  if (!keeper) return;

  document.body.classList.add("is-filming");
  if (opts.bare) document.body.classList.add("is-bare");

  // A fresh deck: rejects first, the keeper last.
  stage.querySelectorAll(".cut-card").forEach(c => c.remove());
  cards = [];
  history = [];
  keptPosts = [];
  passedCount = 0;
  dealtCount = 0;
  const rejects = shuffle(pool.filter(p => p.id !== keeper.id)).slice(0, opts.rejects);
  queue = [...rejects, keeper];

  // Every photo has to be decoded before the first beat — a card arriving
  // empty at 340ms ruins the take, and there is no second chance in a
  // recording. Capped so a dead image can't stall the shoot.
  await Promise.race([
    Promise.all(queue.map(p => new Promise(resolve => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = p.thumb_url || p.image_url;
    }))),
    wait(8000)
  ]);

  fill();

  // Let the first frame settle before the filter starts running.
  await wait(900);

  for (let i = 0; i < rejects.length; i++) {
    if (!cards.length) break;
    commit(-1);
    await wait(opts.beat);
  }

  // The keeper: hold it, then travel into it.
  await wait(260);
  const card = cards[0];
  if (!card) return;
  setVerdict(card, 200);
  card.classList.add("is-kept");
  stage.classList.add("is-holding");
  await wait(900);

  // Scale the photo until it covers the frame — the hand-off to the next shot.
  const box = card.getBoundingClientRect();
  const cover = Math.max(window.innerWidth / box.width, window.innerHeight / box.height) * 1.06;
  card.style.setProperty("--push-scale", cover.toFixed(3));
  card.style.setProperty("--push-ms", `${opts.push}ms`);
  document.body.classList.add("is-pushing");
  card.classList.add("is-pushing");
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function loadCut() {
  document.getElementById("cut-keep").innerHTML = ICONS.heart;
  initSound();

  const [{ data, error }, user] = await Promise.all([
    supabase
      .from("requests")
      .select("id, title, budget, category, audience, image_url, thumb_url, found_recommendation_id, created_at, profiles!requests_user_id_fkey(username)")
      .eq("status", "open")
      .not("image_url", "is", null)
      .order("created_at", { ascending: false }),
    getCurrentUser()
  ]);

  currentUser = user;
  document.getElementById("cut-loading")?.remove();

  if (error) {
    stage.innerHTML = `<p class="cut-loading">Couldn't load the deck. Please refresh.</p>`;
    return;
  }

  pool = (data ?? []).filter(p => p.image_url);
  renderChips();
  if (filmOptions().on) { runFilm(); return; }
  deal();
}

stage.addEventListener("pointerdown", onDown);
window.addEventListener("pointermove", onMove);
window.addEventListener("pointerup", onUp);
window.addEventListener("pointercancel", onUp);

document.getElementById("cut-pass").addEventListener("click", () => {
  if (busy || !cards.length) return;
  recordPass(cards[0]._post);
  commit(-1);
});
document.getElementById("cut-keep").addEventListener("click", () => commit(1));
undoBtn.addEventListener("click", undo);

window.addEventListener("keydown", (e) => {
  if (e.target instanceof Element && e.target.closest("input, textarea")) return;
  if (e.key === "ArrowLeft") {
    if (busy || !cards.length) return;
    recordPass(cards[0]._post);
    commit(-1);
  } else if (e.key === "ArrowRight") {
    commit(1);
  } else if (e.key.toLowerCase() === "z") {
    undo();
  }
});

document.addEventListener("DOMContentLoaded", loadCut);
