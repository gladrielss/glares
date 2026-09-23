// Drives the cinema layer (css/cinema.css): photographs resolve into focus
// as they arrive, blocks rise into place, and the hero drifts as you scroll
// past it.
//
// The rule this file lives by: content is never left hidden. Every shot gets
// a failsafe, so a photo that 404s, an observer that never fires, or a
// container that starts display:none still ends up visible.

const CINEMA_SHOTS = [
  "#board .ticket-image img",
  ".trending-image img",
  ".solved-card img",
  ".ig-grid-item img",
  ".product-card-image img",
  ".product-hero img",
  ".search-post img",
  ".rec-image img"
].join(",");

const CINEMA_RISERS = [
  ".section-card",
  ".store-banner",
  ".solved-eyebrow",
  ".page-title"
].join(",");

const CINEMA_FAILSAFE_MS = 2200;
const CINEMA_STAGGER_MS = 70;
const CINEMA_MAX_STAGGER = 4;      // beyond this a row would feel slow, not composed

const cinemaReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Puts the element back exactly as the page styled it. Called on
// animationend, and by every failsafe — nothing is ever left armed.
function cinemaRelease(el) {
  el.classList.remove("cinema-armed", "cinema-shot", "cinema-riser");
  el.style.animationDelay = "";
}

function cinemaRun(el, delay, animationClass) {
  if (el.dataset.cinemaRan) return;
  el.dataset.cinemaRan = "1";
  if (delay) el.style.animationDelay = `${delay}ms`;
  el.classList.remove("cinema-armed");
  el.classList.add(animationClass);
  el.addEventListener("animationend", () => cinemaRelease(el), { once: true });
  // A tab that never renders the animation (backgrounded on load) would
  // otherwise sit on the opening keyframe, so release it regardless.
  window.setTimeout(() => cinemaRelease(el), (delay || 0) + CINEMA_FAILSAFE_MS);
}

// An image runs when its pixels are actually there, so the focus pull lands
// on the photo rather than on an empty box.
function cinemaRunImage(img, delay) {
  const go = () => cinemaRun(img, delay, "cinema-shot");
  if (img.complete && img.naturalWidth) { go(); return; }
  img.addEventListener("load", go, { once: true });
  img.addEventListener("error", () => cinemaRelease(img), { once: true });
  window.setTimeout(go, CINEMA_FAILSAFE_MS);
}

let cinemaObserver = null;

function cinemaWatcher() {
  if (cinemaObserver) return cinemaObserver;
  cinemaObserver = new IntersectionObserver((entries) => {
    entries.filter(e => e.isIntersecting).forEach((entry, i) => {
      const el = entry.target;
      cinemaObserver.unobserve(el);
      const delay = Math.min(i, CINEMA_MAX_STAGGER) * CINEMA_STAGGER_MS;
      if (el.tagName === "IMG") cinemaRunImage(el, delay);
      else cinemaRun(el, delay, "cinema-riser");
    });
  }, { rootMargin: "80px 0px", threshold: 0.01 });
  return cinemaObserver;
}

function cinemaPrepare(el) {
  if (el.dataset.cinema) return;
  el.dataset.cinema = "1";
  el.classList.add("cinema-armed");
  cinemaWatcher().observe(el);
  // If the observer never reports this element — a hidden ancestor, a panel
  // that is never scrolled — show it anyway rather than losing it.
  window.setTimeout(() => cinemaRelease(el), CINEMA_FAILSAFE_MS * 2);
}

function cinemaScan() {
  if (cinemaReduced) return;
  document.querySelectorAll(CINEMA_SHOTS).forEach(cinemaPrepare);
  document.querySelectorAll(CINEMA_RISERS).forEach(cinemaPrepare);
}

// The feed, profile grid and search all repaint their containers wholesale,
// so new nodes are picked up here instead of every renderer calling in.
function cinemaWatchForNewContent() {
  let pending = null;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = window.setTimeout(() => { pending = null; cinemaScan(); }, 120);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// The hero lets go as you scroll past it — a slow drift and fade, not a
// parallax gimmick. Only the landing page has one.
function cinemaHeroDrift() {
  if (cinemaReduced) return;
  const hero = document.querySelector(".hero-content");
  if (!hero) return;
  hero.classList.add("cinema-drift");

  let ticking = false;
  const paint = () => {
    ticking = false;
    const y = window.scrollY;
    if (y > window.innerHeight) return;
    const shift = Math.min(y * 0.16, 90);
    hero.style.transform = `translate3d(0, ${shift}px, 0)`;
    hero.style.opacity = String(Math.max(0, 1 - y / (window.innerHeight * 0.75)));
  };
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(paint);
  }, { passive: true });
  paint();
}

// Blur is the costly half of the focus pull. Anything small or memory-shy
// runs the version without it rather than dropping the effect entirely.
function cinemaPickQuality() {
  const lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
  const fewCores = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
  const smallScreen = window.matchMedia("(max-width: 700px)").matches;
  if (lowMemory || fewCores || smallScreen) document.documentElement.classList.add("cinema-lite");
}

document.addEventListener("DOMContentLoaded", () => {
  cinemaPickQuality();
  cinemaScan();
  cinemaWatchForNewContent();
  cinemaHeroDrift();
});
