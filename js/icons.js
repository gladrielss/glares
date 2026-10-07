// Shared inline-SVG icon set for compact/icon-only UI (mobile header, like
// button, song badge). Thin, rounded line-art — consistent weight across
// the set for a more refined feel.
const ICON_STROKE = 1.6;
const ICONS = {
  inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5h3.6l1.7 2.6h4.4l1.7-2.6h3.6"/><path d="M6.2 6.2h11.6a1 1 0 0 1 .96.73l1.68 6a1 1 0 0 1 .04.27V17a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-3.8a1 1 0 0 1 .04-.27l1.68-6a1 1 0 0 1 .96-.73Z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7.2-4.4-9.6-9C.8 7.6 2.5 4.4 6 3.9c2-.3 3.9.7 6 3.1 2.1-2.4 4-3.4 6-3.1 3.5.5 5.2 3.7 3.6 7.1-2.4 4.6-9.6 9-9.6 9Z"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18.2V5.6L21 3.5v12.7"/><circle cx="6.2" cy="18.2" r="2.8"/><circle cx="18.2" cy="16.2" r="2.8"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 20.5H4.5v-7l10.7-10.7a1.4 1.4 0 0 1 2 0l2.3 2.3a1.4 1.4 0 0 1 0 2Z"/><path d="M13.5 5.5l3.5 3.5"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5"/><path d="M15.5 16.5l4.5-4.5-4.5-4.5"/><path d="M20 12H9.5"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.7 5.9 6.3.7-4.7 4.4 1.3 6.3L12 17.2l-5.6 3.1 1.3-6.3-4.7-4.4 6.3-.7Z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3.5l17 17"/><path d="M10.6 5.7c.45-.1.9-.15 1.4-.15 6 0 9.5 6.5 9.5 6.5a15.4 15.4 0 0 1-3.3 4.1M6.5 6.9A15.6 15.6 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.3 0 2.5-.3 3.6-.85"/><path d="M9.9 10.1a2.8 2.8 0 0 0 3.9 3.9"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="M8.4 7.1 12 3.5l3.6 3.6"/><path d="M6 12.4H5a1.5 1.5 0 0 0-1.5 1.5v5.1A1.5 1.5 0 0 0 5 20.5h14a1.5 1.5 0 0 0 1.5-1.5v-5.1a1.5 1.5 0 0 0-1.5-1.5h-1"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8.5h10l1 12a1.5 1.5 0 0 1-1.5 1.6H7.5A1.5 1.5 0 0 1 6 20.5Z"/><path d="M9 8.5V6.8a3 3 0 0 1 6 0v1.7"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4l5.1 5.1"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3.5h5l-.8 5.2 3.3 3.3v1.5H7v-1.5l3.3-3.3Z"/><path d="M12 13.5v7"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M10.2 13.8a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M13.8 10.2a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7l1.4-1.4"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l4.8 4.8L19.5 7"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>`,
  verified: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.8 12.0L23.1 13.0L21.9 13.7L21.1 14.4L21.4 15.4L22.1 16.7L22.2 17.9L21.2 18.4L19.7 18.4L18.7 18.7L18.4 19.7L18.4 21.2L17.9 22.2L16.7 22.1L15.4 21.4L14.4 21.1L13.7 21.9L13.0 23.1L12.0 23.8L11.0 23.1L10.3 21.9L9.6 21.1L8.6 21.4L7.3 22.1L6.1 22.2L5.6 21.2L5.6 19.7L5.3 18.7L4.3 18.4L2.8 18.4L1.8 17.9L1.9 16.7L2.6 15.4L2.9 14.4L2.1 13.7L0.9 13.0L0.2 12.0L0.9 11.0L2.1 10.3L2.9 9.6L2.6 8.6L1.9 7.3L1.8 6.1L2.8 5.6L4.3 5.6L5.3 5.3L5.6 4.3L5.6 2.8L6.1 1.8L7.3 1.9L8.6 2.6L9.6 2.9L10.3 2.1L11.0 0.9L12.0 0.2L13.0 0.9L13.7 2.1L14.4 2.9L15.4 2.6L16.7 1.9L17.9 1.8L18.4 2.8L18.4 4.3L18.7 5.3L19.7 5.6L21.2 5.6L22.2 6.1L22.1 7.3L21.4 8.6L21.1 9.6L21.9 10.3L23.1 11.0Z"/><path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M7.6 12.3l3 3 5.8-6.1"/></svg>`,
};

// A username as HTML. Admins' names show in Instagram blue with a check.
function displayName(profile, fallback = "someone") {
  const div = document.createElement("div");
  div.textContent = profile?.username ?? fallback;
  const name = div.innerHTML;
  return profile?.is_admin
    ? `<span class="verified-name" title="Glares team">${name}${ICONS.verified}</span>`
    : name;
}

// Keeps a `--header-h` custom property on <html> in sync with the real,
// rendered height of the page's fixed/sticky header so content never
// starts underneath it (heights change a lot between logged-in/out and
// mobile/desktop layouts).
function syncHeaderHeightVar() {
  const header = document.querySelector("header.site-header, .landing-header");
  if (!header) return;
  const setVar = () => {
    document.documentElement.style.setProperty("--header-h", `${Math.ceil(header.getBoundingClientRect().height) + 18}px`);
  };
  setVar();
  if (window.ResizeObserver) {
    new ResizeObserver(setVar).observe(header);
  } else {
    window.addEventListener("resize", setVar);
  }
}

document.addEventListener("DOMContentLoaded", syncHeaderHeightVar);

// Opening a post: remember the photo already shown for it, so the post page
// can display it instantly while the full-size photo loads. Feed cards carry
// the full photo's size as width/height; elsewhere it is estimated from the
// thumbnail, scaled to the 1400px long edge uploads are stored at.
document.addEventListener("click", (e) => {
  const link = e.target.closest && e.target.closest('a[href*="request.html#"]');
  if (!link) return;
  try {
    const id = decodeURIComponent(link.getAttribute("href").split("#")[1] || "");
    const img = link.querySelector("img");
    if (!id || !img || !img.complete || !img.naturalWidth || !/^https:/.test(img.currentSrc)) {
      sessionStorage.removeItem("glares:open-post");
      return;
    }
    let w = Number(img.getAttribute("width")), h = Number(img.getAttribute("height"));
    if (!(w > 0 && h > 0)) {
      const scale = 1400 / Math.max(img.naturalWidth, img.naturalHeight);
      w = Math.round(img.naturalWidth * scale);
      h = Math.round(img.naturalHeight * scale);
    }
    sessionStorage.setItem("glares:open-post", JSON.stringify({ id, thumb: img.currentSrc, w, h }));
  } catch (_) {}
}, true);
