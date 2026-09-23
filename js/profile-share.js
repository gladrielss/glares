// "Share profile": the link people put in their Instagram bio, plus a story
// poster of their profile — avatar, name, bio and a grid of their posts —
// built on the same canvas helpers as the post posters (share-card.js).

const PROFILE_POSTER_W = 1080;
const PROFILE_POSTER_H = 1920;
const PROFILE_POSTER_PAD = 80;

function drawCircleImage(ctx, img, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  const { sx, sy, sw, sh } = coverCrop(img, 1, 1);
  ctx.drawImage(img, sx, sy, sw, sh, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
}

function fitSingleLine(ctx, text, maxWidth, sizes, weight = 800) {
  for (const size of sizes) {
    ctx.font = `${weight} ${size}px Inter`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return sizes[sizes.length - 1];
}

async function tryLoadCardImage(src) {
  if (!src) return null;
  try { return await loadCardImage(src); } catch (_) { return null; }
}

async function buildProfilePoster({ profile, url, posts, stats }) {
  await ensureCardFonts();
  const W = PROFILE_POSTER_W, H = PROFILE_POSTER_H, PAD = PROFILE_POSTER_PAD;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const withImages = posts.filter(p => p.image_url);
  const pinned = withImages.find(p => p.id === profile.pinned_request_id);
  const ordered = pinned ? [pinned, ...withImages.filter(p => p !== pinned)] : withImages;
  const gridCount = ordered.length >= 6 ? 6 : ordered.length >= 3 ? 3 : ordered.length;
  const [avatar, ...gridImages] = await Promise.all([
    tryLoadCardImage(profile.avatar_url),
    ...ordered.slice(0, gridCount).map(p => tryLoadCardImage(p.image_url))
  ]);
  const tiles = gridImages.filter(Boolean);

  // Backdrop: the lead post washed into soft colour when there is one, so
  // each profile's poster picks up its own palette; plain black otherwise.
  if (tiles[0]) {
    drawLiquidBackdrop(ctx, tiles[0], W, H);
    ctx.fillStyle = "rgba(8,8,8,0.55)";
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = "#0B0B0A";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.font = "800 46px Inter";
  ctx.fillText(CARD_BRAND, PAD, 196);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = "600 24px 'IBM Plex Mono'";
  ctx.fillText(CARD_SLOGAN.toUpperCase(), W - PAD, 192);

  // Instagram draws its progress bar and account name over the top of a
  // story and the "Send message" bar over the bottom, so everything that has
  // to be read sits in the band between them, centred vertically.
  const SAFE_TOP = 270;
  const SAFE_BOTTOM = H - 280;
  const avatarR = 116;
  const ring = 14;
  const GAP = 16;
  const BIO_LINE = 50;

  ctx.textAlign = "center";
  const nameSize = fitSingleLine(ctx, profile.username, W - PAD * 2, [104, 96, 88, 80, 72, 64, 56, 48]);
  ctx.font = "400 38px Inter";
  let bioLines = profile.bio ? wrapLines(ctx, profile.bio, W - PAD * 2 - 60).filter(Boolean) : [];
  if (bioLines.length > 3) {
    bioLines = bioLines.slice(0, 3);
    bioLines[2] = `${bioLines[2].replace(/\s+\S*$/, "")}…`;
  }
  const cols = tiles.length >= 3 ? 3 : tiles.length;
  const rows = tiles.length >= 6 ? 2 : tiles.length ? 1 : 0;

  // Positions relative to the top of the block; the grid's cell size is
  // whatever is left once the fixed parts are measured.
  const measure = (cell) => {
    const m = {};
    m.avatarCY = avatarR + ring;
    m.name = m.avatarCY + avatarR + ring + 56 + nameSize * 0.76;
    m.bio = bioLines.map((_, i) => m.name + 70 + i * BIO_LINE);
    m.stats = (bioLines.length ? m.bio[m.bio.length - 1] : m.name) + 74;
    m.gridTop = m.stats + 58;
    m.gridH = rows ? rows * cell + (rows - 1) * GAP : 0;
    m.hint = m.gridTop + m.gridH + (rows ? 86 : 30);
    m.pillTop = m.hint + 30;
    m.footer = m.pillTop + 104 + 62;
    m.total = m.footer + 10;
    return m;
  };
  const maxCell = cols >= 3 ? (W - PAD * 2 - GAP * 2) / 3 : 380;
  const spare = (SAFE_BOTTOM - SAFE_TOP) - measure(0).total;
  const cell = rows ? Math.max(150, Math.min(maxCell, (spare - (rows - 1) * GAP) / rows)) : 0;
  const m = measure(cell);
  const top = SAFE_TOP + Math.max(0, (SAFE_BOTTOM - SAFE_TOP - m.total) / 2);

  const avatarCY = top + m.avatarCY;
  ctx.beginPath();
  ctx.arc(W / 2, avatarCY, avatarR + ring, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;
  ctx.stroke();
  if (avatar) {
    drawCircleImage(ctx, avatar, W / 2, avatarCY, avatarR);
  } else {
    ctx.beginPath();
    ctx.arc(W / 2, avatarCY, avatarR, 0, Math.PI * 2);
    ctx.fillStyle = "#2A2A28";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 110px Inter";
    ctx.fillText((profile.username[0] || "G").toUpperCase(), W / 2, avatarCY + 38);
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 ${nameSize}px Inter`;
  ctx.fillText(profile.username, W / 2, top + m.name);

  ctx.font = "400 38px Inter";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  bioLines.forEach((line, i) => ctx.fillText(line, W / 2, top + m.bio[i]));

  ctx.font = "600 28px 'IBM Plex Mono'";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText([
    `${stats.posts} ${stats.posts === 1 ? "POST" : "POSTS"}`,
    `${stats.followers} ${stats.followers === 1 ? "FOLLOWER" : "FOLLOWERS"}`,
    `${stats.following} FOLLOWING`
  ].join("   ·   "), W / 2, top + m.stats);

  if (rows) {
    const gridW = cols * cell + (cols - 1) * GAP;
    const left = (W - gridW) / 2;
    tiles.slice(0, rows * cols).forEach((img, i) => {
      const x = left + (i % cols) * (cell + GAP);
      const ty = top + m.gridTop + Math.floor(i / cols) * (cell + GAP);
      ctx.save();
      roundRectPath(ctx, x, ty, cell, cell, 26);
      ctx.clip();
      const { sx, sy, sw, sh } = coverCrop(img, 1, 1);
      ctx.drawImage(img, sx, sy, sw, sh, x, ty, cell, cell);
      ctx.restore();
    });
  }

  // The link, as a white pill — the one thing to read off the story.
  const linkText = url.replace(/^https?:\/\//, "");
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = "600 24px 'IBM Plex Mono'";
  ctx.fillText("SEE MY TASTE", W / 2, top + m.hint);
  const pillH = 104;
  const linkSize = fitSingleLine(ctx, linkText, W - PAD * 2 - 90, [44, 40, 36, 32, 28, 24], 700);
  ctx.font = `700 ${linkSize}px Inter`;
  const pillW = Math.min(W - PAD * 2, ctx.measureText(linkText).width + 90);
  const pillY = top + m.pillTop;
  roundRectPath(ctx, (W - pillW) / 2, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.fillText(linkText, W / 2, pillY + pillH / 2 + linkSize * 0.36);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "400 26px Inter";
  ctx.fillText("Real people recommending real things.", W / 2, top + m.footer);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create the poster"))), CARD_TYPE, CARD_QUALITY);
  });
}

function openProfileShare({ profile, url, posts, stats, isOwnProfile }) {
  document.getElementById("profile-share-modal")?.remove();

  const displayUrl = url.replace(/^https?:\/\//, "");
  const canShareLinks = typeof navigator.share === "function";
  const modal = document.createElement("div");
  modal.id = "profile-share-modal";
  modal.className = "new-request-panel open";
  modal.innerHTML = `
    <section class="new-request profile-share">
      <button class="panel-close" type="button" data-close aria-label="Close">&times;</button>
      <h2>${isOwnProfile ? "Share your profile" : `Share ${escapeHtml(profile.username)}`}</h2>
      ${isOwnProfile ? `<p class="field-hint">Put this link in your Instagram bio so people can see your taste.</p>` : ""}
      <div class="profile-share-link">
        <span>${escapeHtml(displayUrl)}</span>
        <button type="button" class="btn" data-copy>Copy link</button>
      </div>
      ${canShareLinks ? `<button type="button" class="btn btn-ghost profile-share-native" data-share-link>Share link…</button>` : ""}
      <div class="profile-share-poster">
        <p class="profile-share-poster-status">Making your story poster…</p>
        <img alt="Profile story poster" hidden>
      </div>
      <button type="button" class="btn profile-share-save" data-share-poster disabled>Share poster</button>
    </section>`;
  document.body.appendChild(modal);

  const close = () => { modal.remove(); if (posterUrl) URL.revokeObjectURL(posterUrl); };
  modal.querySelector("[data-close]").onclick = close;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  const copyButton = modal.querySelector("[data-copy]");
  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyButton.textContent = "Copied";
    } catch (_) {
      // Clipboard can be blocked (older in-app browsers): select the text instead.
      const range = document.createRange();
      range.selectNodeContents(modal.querySelector(".profile-share-link span"));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      copyButton.textContent = "Press copy";
    }
    setTimeout(() => { copyButton.textContent = "Copy link"; }, 1600);
  };

  modal.querySelector("[data-share-link]")?.addEventListener("click", async () => {
    try {
      await navigator.share({ title: `${profile.username} on Glares`, url });
    } catch (_) { /* dismissed */ }
  });

  let posterBlob = null;
  let posterUrl = null;
  const status = modal.querySelector(".profile-share-poster-status");
  const preview = modal.querySelector(".profile-share-poster img");
  const posterButton = modal.querySelector("[data-share-poster]");

  buildProfilePoster({ profile, url, posts, stats })
    .then((blob) => {
      if (!document.body.contains(modal)) return;
      posterBlob = blob;
      posterUrl = URL.createObjectURL(blob);
      preview.src = posterUrl;
      preview.hidden = false;
      status.hidden = true;
      posterButton.disabled = false;
    })
    .catch(() => {
      status.textContent = "Couldn't make the poster — the link still works.";
    });

  // A fresh click, so the share sheet opens even though rendering took a moment.
  posterButton.onclick = async () => {
    if (!posterBlob) return;
    const result = await shareOrDownloadCard({ title: `${profile.username}-profile` }, posterBlob, "story");
    if (result === "downloaded") posterButton.textContent = "Saved to downloads";
  };
}
