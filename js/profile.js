// Read fresh each time rather than once at load: navigating from one profile
// to another (tapping your own avatar while viewing someone else's page) only
// changes the hash, so the page never reloads and this used to keep showing
// whichever profile was opened first.
//
// Three ways in: the old profile.html#name links, the clean /name link (where
// the server adds a meta tag with the exact stored spelling), and the path
// itself as a fallback.
function currentProfileUsername() {
  const fromHash = decodeURIComponent(window.location.hash.slice(1));
  if (fromHash) return fromHash;
  const fromServer = document.querySelector('meta[name="glares:username"]')?.content;
  if (fromServer) return fromServer;
  let segment = "";
  try { segment = decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[0] || ""); } catch (_) {}
  return /^profile(\.html)?$/i.test(segment) ? "" : segment;
}

// Same test the server uses (functions/[username].js): names that look like a
// file or collide with a page can't live at the site root, so they keep the
// profile.html#name form.
const PROFILE_FILE_ENDING = /\.(html?|js|mjs|css|map|ico|png|jpe?g|gif|svg|webp|avif|txt|xml|json|webmanifest)$/i;
const PROFILE_RESERVED = new Set([
  "api", "css", "js", "images", "index", "profile", "profiles", "request", "requests",
  "reel", "messages", "store", "store-item", "search", "settings", "admin", "glares",
  "about", "help", "login", "signup", "explore", "dist", "functions", "www"
]);

function hasCleanProfileLink(username) {
  return /^[A-Za-z0-9._]{1,30}$/.test(username)
    && !PROFILE_FILE_ENDING.test(username)
    && !PROFILE_RESERVED.has(username.toLowerCase());
}

function profilePath(username) {
  return hasCleanProfileLink(username) ? `/${encodeURIComponent(username)}` : `/profile.html#${encodeURIComponent(username)}`;
}

function profileShareUrl(username) {
  return `${window.location.origin}${profilePath(username)}`;
}

async function fetchProfileByUsername(name) {
  const columns = "id, username, avatar_url, created_at, bio, profile_spotify_url, likes_are_public, instagram_handle, pinned_request_id";
  const exact = await supabase.from("profiles").select(columns).eq("username", name).maybeSingle();
  if (exact.error || exact.data) return exact;
  // Someone typed the link with different capitals than the name was saved with.
  const loose = await supabase
    .from("profiles")
    .select(columns)
    .ilike("username", name.replace(/[\\%_]/g, (c) => `\\${c}`))
    .limit(1);
  return { data: loose.data?.[0] ?? null, error: loose.error };
}

// Overlap of likes, as a share of whoever has liked fewer posts — so someone
// with 5 likes isn't marked a stranger to someone with 500 just for the size gap.
function tasteMatch(viewerIds, profileIds) {
  const mine = new Set(viewerIds);
  const theirs = new Set(profileIds);
  if (mine.size < 3 || theirs.size < 3) return null;
  let shared = 0;
  for (const id of mine) if (theirs.has(id)) shared++;
  return { shared, percent: Math.round((100 * shared) / Math.min(mine.size, theirs.size)) };
}

let currentProfile = null;
let viewingOwnProfile = false;
let profileRequests = [];
let profileFeedMode = "staffpick"; // "shuffle" | "staffpick" | "recent"

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function profileSpotifyEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  return `https://open.spotify.com/embed/track/${match[1]}?utm_source=generator&theme=0`;
}

async function loadProfile() {
  const heroContainer = document.getElementById("profile-hero-container");
  const reqContainer = document.getElementById("profile-requests");
  const recContainer = document.getElementById("profile-recs");

  const profileUsername = currentProfileUsername();

  if (!profileUsername) {
    heroContainer.innerHTML = `<p class="empty-state">No profile specified.</p>`;
    reqContainer.innerHTML = "";
    recContainer.innerHTML = "";
    return;
  }

  // Everything else on this page is keyed on profile.id, so this one lookup
  // has to land first. The viewer's session comes from local storage, so it
  // costs nothing to resolve alongside it.
  const [{ data: profile, error: profileError }, viewer] = await Promise.all([
    fetchProfileByUsername(profileUsername),
    getCurrentUser()
  ]);

  if (profileError || !profile) {
    heroContainer.innerHTML = `<p class="empty-state">Couldn't find ${escapeHtml(profileUsername)}${profileError ? `: ${escapeHtml(profileError.message)}` : ""}</p>`;
    reqContainer.innerHTML = "";
    recContainer.innerHTML = "";
    return;
  }

  const isOwnProfile = Boolean(viewer && viewer.id === profile.id);
  currentProfile = profile;
  viewingOwnProfile = isOwnProfile;
  document.title = `${profile.username} — Glares`;

  // Old profile.html#name links settle on the clean, shareable address. Only
  // over http(s): the clean path needs the Pages Function to answer it.
  if (/^https?:$/.test(window.location.protocol) && hasCleanProfileLink(profile.username)
      && window.location.pathname + window.location.hash !== profilePath(profile.username)) {
    history.replaceState(null, "", profilePath(profile.username));
  }

  // The remaining six reads don't depend on each other, so they go out in one
  // batch. They used to run one after another, which meant the profile header
  // sat on "Loading..." for the sum of every round trip instead of the slowest.
  const compareTaste = Boolean(viewer && !isOwnProfile && profile.likes_are_public);
  const [reqResult, recResult, followerResult, followingResult, followRow, viewerProfile, viewerLikes, profileLikes] = await Promise.all([
    supabase
      .from("requests")
      .select("id, title, description, budget, category, image_url, thumb_url, image_width, image_height, spotify_url, created_at, is_staff_pick, staff_pick_rank, found_recommendation_id")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("recommendations")
      .select("id, note, created_at, request_id, requests!recommendations_request_id_fkey(id, title)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
    viewer && !isOwnProfile
      ? supabase.from("follows").select("follower_id").eq("follower_id", viewer.id).eq("following_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
    getMyProfile(),
    compareTaste ? supabase.from("likes").select("request_id").eq("user_id", viewer.id) : Promise.resolve({ data: null }),
    compareTaste ? supabase.from("likes").select("request_id").eq("user_id", profile.id) : Promise.resolve({ data: null })
  ]);

  const requests = reqResult.data;
  const recs = recResult.data;
  const followerCount = followerResult.count;
  const followingCount = followingResult.count;
  let viewerFollowsProfile = Boolean(followRow.data);
  const viewerIsAdmin = viewerProfile?.is_admin === true;

  // Fire this now rather than after the header renders — the Liked tab starts
  // hidden, so it can fill in while the viewer is looking at Requests.
  const likedPostsLoaded = loadLikedPosts(profile, isOwnProfile);

  const songEmbed = profileSpotifyEmbedUrl(profile.profile_spotify_url);
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const postCount = (requests?.length ?? 0) + (recs?.length ?? 0);
  const foundCount = (requests ?? []).filter(r => r.found_recommendation_id).length;
  const match = compareTaste
    ? tasteMatch((viewerLikes.data ?? []).map(l => l.request_id), (profileLikes.data ?? []).map(l => l.request_id))
    : null;
  const shareLabel = hasCleanProfileLink(profile.username)
    ? `${window.location.host}/${profile.username}`
    : `${window.location.host}/profile.html#${profile.username}`;

  heroContainer.innerHTML = `
    <div class="ig-header">
      ${profile.avatar_url
        ? `<img src="${profile.avatar_url}" class="profile-avatar-big">`
        : `<span class="profile-avatar-big profile-avatar-big-empty"></span>`}
      <div class="ig-info-col">
        <div class="ig-username-row">
          <h1 class="profile-name">${escapeHtml(profile.username)}</h1>
          <div class="ig-actions">
            ${viewer && !isOwnProfile ? `<button class="btn profile-follow-btn" id="follow-profile-btn">${viewerFollowsProfile ? "Following" : "Follow"}</button>` : ""}
            ${viewer && !isOwnProfile ? `<button class="btn btn-ghost" id="message-profile-btn">Message</button>` : ""}
            ${isOwnProfile ? `<button class="btn btn-ghost" id="edit-own-profile-btn">Edit profile</button>` : ""}
            <button class="btn ${isOwnProfile ? "" : "btn-ghost "}icon-btn" id="share-profile-btn">${ICONS.share}<span>${isOwnProfile ? "Share profile" : "Share"}</span></button>
            ${viewerIsAdmin && !isOwnProfile ? `<button class="btn btn-danger" id="admin-remove-user">Remove account</button>` : ""}
          </div>
        </div>
        <div class="ig-stats-row">
          <div class="ig-stat"><strong>${postCount}</strong><span>Posts</span></div>
          <div class="ig-stat"><strong id="stat-followers">${followerCount ?? 0}</strong><span>Followers</span></div>
          <div class="ig-stat"><strong>${followingCount ?? 0}</strong><span>Following</span></div>
          ${foundCount ? `<div class="ig-stat"><strong>${foundCount}</strong><span>Found</span></div>` : ""}
        </div>
        ${profile.bio ? `<p class="profile-bio profile-bio-text">${escapeHtml(profile.bio)}</p>` : ""}
        <div class="profile-links-row">
          <button type="button" class="profile-link-chip" id="copy-profile-link" title="Copy profile link">${ICONS.link}<span>${escapeHtml(shareLabel)}</span></button>
          ${profile.instagram_handle ? `<a class="profile-link-chip" href="https://instagram.com/${encodeURIComponent(profile.instagram_handle)}" target="_blank" rel="noopener me">${ICONS.instagram}<span>@${escapeHtml(profile.instagram_handle)}</span></a>` : ""}
        </div>
        ${match ? `<p class="taste-match">${match.shared
          ? `<strong>${match.percent}%</strong> taste match · ${match.shared} ${match.shared === 1 ? "post" : "posts"} you both liked`
          : `No likes in common yet`}</p>` : ""}
        <p class="profile-bio">Joined ${joined}</p>
        ${songEmbed ? `<iframe class="spotify-embed" src="${songEmbed}" width="100%" height="80" frameborder="0" allow="encrypted-media"></iframe>` : ""}
      </div>
    </div>
  `;

  const copyLinkButton = document.getElementById("copy-profile-link");
  if (copyLinkButton) copyLinkButton.addEventListener("click", async () => {
    const label = copyLinkButton.querySelector("span");
    const original = label.textContent;
    try {
      await navigator.clipboard.writeText(profileShareUrl(profile.username));
      label.textContent = "Link copied";
    } catch (_) {
      label.textContent = "Couldn't copy — use Share";
    }
    setTimeout(() => { label.textContent = original; }, 1600);
  });

  document.getElementById("share-profile-btn")?.addEventListener("click", () => {
    openProfileShare({
      profile,
      url: profileShareUrl(profile.username),
      posts: profileRequests,
      stats: { posts: postCount, followers: Number(document.getElementById("stat-followers")?.textContent) || 0, following: followingCount ?? 0 },
      isOwnProfile
    });
  });

  document.getElementById("edit-own-profile-btn")?.addEventListener("click", () => openProfileModal(viewer));

  const followButton = document.getElementById("follow-profile-btn");
  if (followButton) followButton.addEventListener("click", async () => {
    followButton.disabled = true;
    const query = viewerFollowsProfile
      ? supabase.from("follows").delete().eq("follower_id", viewer.id).eq("following_id", profile.id)
      : supabase.from("follows").insert({ follower_id: viewer.id, following_id: profile.id });
    const { error } = await query;
    if (error) { alert("Couldn't update follow: " + error.message); followButton.disabled = false; return; }
    viewerFollowsProfile = !viewerFollowsProfile;
    followButton.textContent = viewerFollowsProfile ? "Following" : "Follow";
    followButton.classList.toggle("is-following", viewerFollowsProfile);
    followButton.disabled = false;
    const followerStat = document.getElementById("stat-followers");
    if (followerStat) followerStat.textContent = String(Number(followerStat.textContent) + (viewerFollowsProfile ? 1 : -1));
  });

  const messageButton = document.getElementById("message-profile-btn");
  if (messageButton) messageButton.addEventListener("click", async () => {
    messageButton.disabled = true;
    const { data: conversationId, error } = await supabase.rpc("get_or_create_conversation", { other_user_id: profile.id });
    if (error) { alert("Couldn't start conversation: " + error.message); messageButton.disabled = false; return; }
    window.location.href = `messages.html#${conversationId}`;
  });

  const removeButton = document.getElementById("admin-remove-user");
  if (removeButton) removeButton.addEventListener("click", async () => {
    if (!confirm(`Remove ${profile.username} and their content? This cannot be undone.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { alert("Your session expired. Sign in again."); return; }
    const response = await fetch("/api/admin-delete-user", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId: profile.id })
    });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Couldn't remove this account."); return; }
    window.location.href = "index.html";
  });

  if (reqResult.error) {
    reqContainer.innerHTML = `<p class="empty-state">Couldn't load requests: ${escapeHtml(reqResult.error.message)}</p>`;
  } else {
    profileRequests = requests ?? [];
    renderProfileGrid();
  }

  if (recResult.error) {
    recContainer.innerHTML = `<p class="empty-state">Couldn't load recommendations: ${escapeHtml(recResult.error.message)}</p>`;
  } else if (!recs || !recs.length) {
    recContainer.innerHTML = `<p class="empty-state">No recommendations yet.</p>`;
  } else {
    recContainer.innerHTML = recs.map(rec => `
      <a href="request.html#${rec.request_id}" class="profile-rec-item">
        <p class="profile-rec-note">${escapeHtml(rec.note)}</p>
        <span class="profile-rec-for">on: ${escapeHtml(rec.requests?.title || "a request")}</span>
      </a>
    `).join("");
  }

  await likedPostsLoaded;
}

async function loadLikedPosts(profile, isOwnProfile) {
  const likedContainer = document.getElementById("profile-liked");
  const visibilityRow = document.getElementById("liked-visibility-row");

  if (isOwnProfile) {
    visibilityRow.hidden = false;
    document.getElementById("liked-visibility-label").textContent =
      profile.likes_are_public ? "Your liked posts are public" : "Your liked posts are private";
    const toggleBtn = document.getElementById("liked-visibility-toggle");
    toggleBtn.textContent = profile.likes_are_public ? "Make private" : "Make public";
    toggleBtn.onclick = async () => {
      const next = !profile.likes_are_public;
      toggleBtn.disabled = true;
      const { error } = await supabase.from("profiles").update({ likes_are_public: next }).eq("id", profile.id);
      toggleBtn.disabled = false;
      if (error) { alert("Couldn't update: " + error.message); return; }
      profile.likes_are_public = next;
      document.getElementById("liked-visibility-label").textContent = next ? "Your liked posts are public" : "Your liked posts are private";
      toggleBtn.textContent = next ? "Make private" : "Make public";
    };
  } else {
    visibilityRow.hidden = true;
  }

  if (!isOwnProfile && !profile.likes_are_public) {
    likedContainer.innerHTML = `<p class="empty-state">This person keeps their liked posts private.</p>`;
    return;
  }

  const { data: liked, error } = await supabase
    .from("likes")
    .select("request_id, created_at, requests(id, title, category, image_url, thumb_url)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  if (error) {
    likedContainer.innerHTML = `<p class="empty-state">Couldn't load liked posts: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const posts = (liked ?? []).map(l => l.requests).filter(Boolean);

  if (!posts.length) {
    likedContainer.innerHTML = `<p class="empty-state">No liked posts yet.</p>`;
    return;
  }

  likedContainer.innerHTML = posts.map(r => `
    <a href="request.html#${r.id}" class="ig-grid-item${r.image_url ? " has-image" : ""}">
      ${r.image_url ? `<img src="${r.thumb_url || r.image_url}" alt="${escapeHtml(r.title)}" loading="lazy" decoding="async" onerror="this.remove(); this.parentElement.classList.remove('has-image')">` : ""}
      <span class="ig-grid-item-fallback">${escapeHtml(r.title)}</span>
      <span class="ig-grid-item-overlay">
        ${r.category ? `<span class="ig-grid-item-tag">${escapeHtml(r.category)}</span>` : ""}
        ${r.title ? `<span class="ig-grid-item-name">${escapeHtml(r.title)}</span>` : ""}
      </span>
    </a>`).join("");
}

function shuffleArray(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function withPinnedFirst(list) {
  const pinnedId = currentProfile?.pinned_request_id;
  if (!pinnedId) return list;
  const pinned = list.find(r => r.id === pinnedId);
  return pinned ? [pinned, ...list.filter(r => r.id !== pinnedId)] : list;
}

function profileFeedSourceList() {
  if (profileFeedMode === "shuffle") return withPinnedFirst(shuffleArray(profileRequests));
  if (profileFeedMode === "staffpick") {
    const picked = profileRequests.filter(r => r.is_staff_pick).sort((a, b) => (a.staff_pick_rank ?? 0) - (b.staff_pick_rank ?? 0));
    const rest = profileRequests.filter(r => !r.is_staff_pick);
    return withPinnedFirst([...picked, ...rest]);
  }
  if (profileFeedMode === "recent") {
    const viewedIds = getRecentlyViewedIds();
    const byId = new Map(profileRequests.map(r => [r.id, r]));
    return viewedIds.map(id => byId.get(id)).filter(Boolean);
  }
  return profileRequests;
}

function renderProfileGrid() {
  const reqContainer = document.getElementById("profile-requests");
  const list = profileFeedSourceList();

  if (!list.length) {
    const emptyMessages = {
      recent: "You haven't viewed any of these posts yet.",
    };
    reqContainer.innerHTML = `<p class="empty-state">${emptyMessages[profileFeedMode] ?? "No requests yet."}</p>`;
    return;
  }

  const pinnedId = currentProfile?.pinned_request_id;
  reqContainer.innerHTML = list.map(r => {
    const isPinned = r.id === pinnedId;
    return `
    <a href="request.html#${r.id}" class="ig-grid-item${r.image_url ? " has-image" : ""}${isPinned ? " is-pinned" : ""}">
      ${r.image_url ? `<img src="${r.thumb_url || r.image_url}" alt="${escapeHtml(r.title || "")}" loading="lazy" decoding="async" onerror="this.parentElement.classList.remove('has-image'); this.remove()">` : ""}
      <span class="ig-grid-item-fallback">${escapeHtml(r.title || r.description || "")}</span>
      ${isPinned ? `<span class="ig-grid-item-pinned">${ICONS.pin}<span>Pinned</span></span>` : ""}
      ${viewingOwnProfile ? `<button type="button" class="ig-pin-btn${isPinned ? " is-pinned" : ""}" data-pin="${r.id}" title="${isPinned ? "Unpin from profile" : "Pin to top of profile"}" aria-label="${isPinned ? "Unpin from profile" : "Pin to top of profile"}">${ICONS.pin}</button>` : ""}
      <span class="ig-grid-item-overlay">
        <span class="ig-grid-item-tags">
          ${r.found_recommendation_id ? `<span class="found-badge">Found</span>` : ""}
          ${r.category ? `<span class="ig-grid-item-tag">${escapeHtml(r.category)}</span>` : ""}
        </span>
        ${r.title ? `<span class="ig-grid-item-name">${escapeHtml(r.title)}</span>` : ""}
      </span>
    </a>`;
  }).join("");
}

async function togglePinnedPost(requestId) {
  if (!currentProfile || !viewingOwnProfile) return;
  const previous = currentProfile.pinned_request_id;
  const next = previous === requestId ? null : requestId;
  currentProfile.pinned_request_id = next;
  renderProfileGrid();
  const { error } = await supabase.from("profiles").update({ pinned_request_id: next }).eq("id", currentProfile.id);
  if (error) {
    currentProfile.pinned_request_id = previous;
    renderProfileGrid();
    alert("Couldn't update your pinned post: " + error.message);
  }
}

function wirePinButtons() {
  document.getElementById("profile-requests").addEventListener("click", (e) => {
    const button = e.target.closest("[data-pin]");
    if (!button) return;
    e.preventDefault();
    e.stopPropagation();
    togglePinnedPost(button.dataset.pin);
  });
}

function wireFeedTabs() {
  const row = document.getElementById("feed-tabs");
  if (!row) return;
  row.addEventListener("click", (e) => {
    const btn = e.target.closest(".feed-tab");
    if (!btn) return;
    profileFeedMode = btn.dataset.mode;
    row.querySelectorAll(".feed-tab").forEach(b => b.classList.toggle("active", b.dataset.mode === profileFeedMode));
    renderProfileGrid();
  });
}

function wireProfileTabs() {
  document.querySelectorAll("#profile-tabs .ig-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#profile-tabs .ig-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
    });
  });
}

function resetProfilePanels() {
  currentProfile = null;
  viewingOwnProfile = false;
  document.getElementById("profile-hero-container").innerHTML = `<p class="empty-state">Loading...</p>`;
  document.getElementById("profile-requests").innerHTML = `<p class="empty-state">Loading...</p>`;
  document.getElementById("profile-recs").innerHTML = `<p class="empty-state">Loading...</p>`;
  document.getElementById("profile-liked").innerHTML = `<p class="empty-state">Loading...</p>`;
  profileRequests = [];
}

document.addEventListener("DOMContentLoaded", () => {
  wireProfileTabs();
  wireFeedTabs();
  wirePinButtons();
  loadProfile();

  window.addEventListener("hashchange", () => {
    resetProfilePanels();
    loadProfile();
  });

  // Saved from Edit profile. If the name changed, the address has to follow
  // it — the old /name link would no longer resolve.
  window.addEventListener("glares:profile-updated", (e) => {
    const { oldUsername, username } = e.detail || {};
    if (!viewingOwnProfile) return;
    if (username && username !== oldUsername) {
      document.querySelector('meta[name="glares:username"]')?.remove();
      history.replaceState(null, "", /^https?:$/.test(window.location.protocol) && hasCleanProfileLink(username)
        ? profilePath(username)
        : `profile.html#${encodeURIComponent(username)}`);
    }
    resetProfilePanels();
    loadProfile();
  });
});
