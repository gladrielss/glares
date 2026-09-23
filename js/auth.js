// Shared auth bar logic. Include after supabase-client.js on every page.


function isInstagramBrowser() {
  return /Instagram/i.test(navigator.userAgent);
}

async function completePasswordRecovery(password) {
  const { error } = await supabase.auth.updateUser({ password });
  return error;
}

function openPasswordRecoveryModal() {
  if (document.getElementById("password-recovery-modal")) return;
  const modal = document.createElement("div");
  modal.id = "password-recovery-modal";
  modal.className = "new-request-panel open";
  modal.innerHTML = `
    <section class="new-request">
      <button class="panel-close" type="button" data-close>&times;</button>
      <h2>Create your password</h2>
      <p class="field-hint">Choose a password with at least 6 characters. You will stay signed in after saving it.</p>
      <form id="password-recovery-form">
        <div class="field-row"><input id="new-password" type="password" minlength="6" autocomplete="new-password" placeholder="New password" required></div>
        <div class="field-row"><input id="confirm-password" type="password" minlength="6" autocomplete="new-password" placeholder="Confirm password" required></div>
        <button class="btn" type="submit">Save password</button>
        <span id="password-recovery-status" class="login-status"></span>
      </form>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-close]").onclick = () => modal.remove();
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  modal.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = modal.querySelector("#new-password").value;
    const confirmation = modal.querySelector("#confirm-password").value;
    const status = modal.querySelector("#password-recovery-status");
    if (password !== confirmation) { status.textContent = "Passwords do not match."; return; }
    status.textContent = "Saving...";
    const error = await completePasswordRecovery(password);
    if (error) { status.textContent = error.message; return; }
    status.textContent = "Password saved. You are signed in.";
    window.setTimeout(() => { modal.remove(); window.history.replaceState({}, document.title, window.location.pathname); window.location.reload(); }, 700);
  });
}

function renderInstagramBrowserPrompt() {
  if (!isInstagramBrowser() || document.getElementById("instagram-browser-prompt")) return;
  const prompt = document.createElement("aside");
  prompt.id = "instagram-browser-prompt";
  prompt.className = "instagram-browser-prompt";
  prompt.innerHTML = `<strong>For a longer sign-in</strong><span>Instagram may clear this browser's session. Tap ⋯ then <em>Open in browser</em>.</span><button type="button">Copy link</button>`;
  prompt.querySelector("button").onclick = async () => {
    try { await navigator.clipboard.writeText(window.location.href); prompt.querySelector("button").textContent = "Link copied"; }
    catch (_) { prompt.querySelector("button").textContent = "Copy this page's link"; }
  };
  document.body.appendChild(prompt);
}

async function getCurrentUser() {
  // getSession() reads the cached session from local storage (no network
  // round trip); getUser() re-validates the JWT against the server every
  // call, which was adding several redundant round trips to every page
  // load. RLS enforces real permissions server-side either way, so this
  // is safe for the UI-only checks (auth gating, "is this my post") that
  // read currentUserId throughout the app.
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

// The signed-in user's own profile row is needed by the auth bar, the feed
// (is_admin, for the staff-pick stars) and the profile page. Fetching it once
// per page load and sharing the promise turns three identical round trips into
// one, and means the feed no longer has to render twice — once without the
// admin controls and again after the admin check comes back.
let myProfilePromise = null;

function getMyProfile() {
  if (myProfilePromise) return myProfilePromise;
  myProfilePromise = (async () => {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, is_admin")
      .eq("id", user.id)
      .maybeSingle();
    return data ?? null;
  })();
  return myProfilePromise;
}

function invalidateMyProfile() {
  myProfilePromise = null;
}

async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + "/index.html" }
  });
  return error;
}

async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error;
}

async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + "/index.html" }
  });
  return { data, error };
}

async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/index.html"
  });
  return error;
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

async function uploadAvatar(user, file) {
  // Avatars render at 18-32px in the feed and 96px on a profile; 512 is ample.
  // The cropper already outputs 512, this just guarantees it for any path in.
  const { blob, name } = await prepareImageForUpload(file, { maxEdge: 512 });
  const path = `avatars/${user.id}/${Date.now()}-${name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
  const { error } = await supabase.storage.from("request-images").upload(path, blob);
  if (error) throw error;
  const { data } = supabase.storage.from("request-images").getPublicUrl(path);
  return data.publicUrl;
}

function openAvatarCropper(file, onCrop) {
  const source = URL.createObjectURL(file);
  const modal = document.createElement("div");
  modal.className = "image-crop-modal";
  modal.innerHTML = `<div class="image-crop-dialog avatar-crop-dialog"><button type="button" class="panel-close" data-cancel>&times;</button><h2>Position your photo</h2><p class="field-hint">Drag to move. Use the slider to zoom.</p><div class="avatar-crop-frame"><img alt="Avatar crop preview"></div><input class="avatar-crop-zoom" type="range" min="1" max="3" value="1" step="0.01" aria-label="Zoom photo"><div class="image-crop-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="button" class="btn" data-save>Use photo</button></div></div>`;
  document.body.appendChild(modal);
  const image = modal.querySelector("img"), frame = modal.querySelector(".avatar-crop-frame"), zoom = modal.querySelector("input");
  let scale = 1, x = 0, y = 0, startX = 0, startY = 0, dragging = false;
  const draw = () => { image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
  const bounds = () => { const size = frame.clientWidth; const naturalRatio = image.naturalWidth / image.naturalHeight; const base = naturalRatio >= 1 ? size / image.naturalHeight : size / image.naturalWidth; const width = image.naturalWidth * base * scale, height = image.naturalHeight * base * scale; x = Math.min(Math.max(x, (size - width) / 2), (width - size) / 2); y = Math.min(Math.max(y, (size - height) / 2), (height - size) / 2); };
  image.onload = () => { bounds(); draw(); };
  image.src = source;
  zoom.oninput = () => { scale = Number(zoom.value); bounds(); draw(); };
  frame.onpointerdown = (event) => { dragging = true; startX = event.clientX - x; startY = event.clientY - y; frame.setPointerCapture(event.pointerId); };
  frame.onpointermove = (event) => { if (!dragging) return; x = event.clientX - startX; y = event.clientY - startY; bounds(); draw(); };
  frame.onpointerup = () => { dragging = false; };
  modal.querySelectorAll("[data-cancel]").forEach(button => button.onclick = () => { URL.revokeObjectURL(source); modal.remove(); });
  modal.querySelector("[data-save]").onclick = () => { const size = 512, canvas = document.createElement("canvas"); canvas.width = canvas.height = size; const frameSize = frame.clientWidth, naturalRatio = image.naturalWidth / image.naturalHeight; const base = naturalRatio >= 1 ? frameSize / image.naturalHeight : frameSize / image.naturalWidth; const rendered = base * scale; canvas.getContext("2d").drawImage(image, ((frameSize - image.naturalWidth * rendered) / 2 + x) * size / frameSize, ((frameSize - image.naturalHeight * rendered) / 2 + y) * size / frameSize, image.naturalWidth * rendered * size / frameSize, image.naturalHeight * rendered * size / frameSize); canvas.toBlob(blob => { onCrop(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })); URL.revokeObjectURL(source); modal.remove(); }, "image/jpeg", .9); };
}

// Loads a script once and shares the promise, for features only some pages
// need until someone actually opens them (song search, the search overlay).
const scriptLoads = new Map();
function loadScriptOnce(src) {
  if (!scriptLoads.has(src)) {
    scriptLoads.set(src, new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => { scriptLoads.delete(src); reject(new Error(`Couldn't load ${src}`)); };
      document.head.appendChild(script);
    }));
  }
  return scriptLoads.get(src);
}

// Mirrors the database rules in guard_profile_privileges() so people see the
// problem as they type rather than after pressing Save.
const RESERVED_USERNAMES = new Set([
  "api", "css", "js", "images", "index", "profile", "profiles", "request", "requests",
  "reel", "messages", "store", "store-item", "search", "settings", "admin", "glares", "cut",
  "about", "help", "login", "signup", "explore", "dist", "functions", "www"
]);

function usernameProblem(name) {
  if (name.length < 3) return "At least 3 characters.";
  if (name.length > 30) return "30 characters max.";
  if (!/^[a-z0-9._]+$/.test(name)) return "Only lowercase letters, numbers, dots and underscores.";
  if (/^\.|\.$|\.\./.test(name)) return "Dots can't be at the start, the end, or doubled.";
  if (RESERVED_USERNAMES.has(name)) return "That one's reserved — try another.";
  return "";
}

// Accepts "@name", "name", or a pasted instagram.com link.
function parseInstagramHandle(raw) {
  let value = String(raw || "").trim();
  if (!value) return "";
  const fromUrl = value.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (fromUrl) value = fromUrl[1];
  return value.replace(/^@+/, "").replace(/\/+$/, "");
}

function friendlyProfileError(error) {
  const message = error?.message || String(error);
  if (/profiles_username_key|duplicate key/i.test(message)) return "That username is taken.";
  if (/profiles_instagram_handle_format/i.test(message)) return "That doesn't look like an Instagram username.";
  if (/profiles_bio_length/i.test(message)) return "Your bio is too long.";
  return message;
}

function profileLinkHost() {
  return window.location.host || "glaress.pages.dev";
}

async function openProfileModal(user) {
  document.getElementById("profile-modal")?.remove();

  const { data: me, error: loadError } = await supabase
    .from("profiles")
    .select("username, avatar_url, bio, instagram_handle, profile_spotify_url")
    .eq("id", user.id)
    .maybeSingle();
  if (loadError || !me) { alert("Couldn't load your profile: " + (loadError?.message || "not found")); return; }

  const modal = document.createElement("div");
  modal.id = "profile-modal";
  modal.className = "new-request-panel open";
  modal.innerHTML = `
    <section class="new-request profile-edit">
      <button class="panel-close" type="button" data-close aria-label="Close">&times;</button>
      <h2>Edit profile</h2>
      <div class="profile-edit-photo">
        <img id="avatar-preview" alt="" class="avatar-preview ${me.avatar_url ? "" : "avatar-preview-empty"}" ${me.avatar_url ? `src="${me.avatar_url}"` : ""}>
        <label class="upload-label" for="avatar-file"><span>Change photo</span></label>
        <input type="file" id="avatar-file" accept="image/*" hidden>
      </div>

      <label class="profile-edit-label" for="profile-username">Username</label>
      <input type="text" id="profile-username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30">
      <p class="profile-link-preview" id="profile-link-preview"></p>

      <label class="profile-edit-label" for="profile-bio">Bio <span class="profile-edit-count" id="profile-bio-count"></span></label>
      <textarea id="profile-bio" rows="3" maxlength="300" placeholder="What's your taste?"></textarea>

      <label class="profile-edit-label" for="profile-instagram">Instagram</label>
      <div class="profile-edit-prefixed"><span>@</span><input type="text" id="profile-instagram" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="your.instagram"></div>

      <label class="profile-edit-label" for="profile-song-search">Profile song</label>
      <p class="profile-song-current" id="profile-song-current" hidden><span>A song is set</span><button type="button" class="link-btn" id="profile-song-remove">Remove</button></p>
      <input type="text" id="profile-song-search" autocomplete="off" placeholder="Search for a song…">
      <input type="hidden" id="profile-song-url">

      <button type="button" id="profile-save-btn" class="btn profile-edit-save">Save</button>
      <p class="login-status" id="profile-save-status"></p>
    </section>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("[data-close]").onclick = close;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  const usernameInput = modal.querySelector("#profile-username");
  const linkPreview = modal.querySelector("#profile-link-preview");
  const bioInput = modal.querySelector("#profile-bio");
  const bioCount = modal.querySelector("#profile-bio-count");
  const igInput = modal.querySelector("#profile-instagram");
  const songUrl = modal.querySelector("#profile-song-url");
  const songCurrent = modal.querySelector("#profile-song-current");
  const status = modal.querySelector("#profile-save-status");

  usernameInput.value = me.username || "";
  bioInput.value = me.bio || "";
  igInput.value = me.instagram_handle || "";
  songUrl.value = me.profile_spotify_url || "";
  songCurrent.hidden = !me.profile_spotify_url;

  // Availability is checked against the database a moment after typing
  // stops; the unique constraint still has the final say on Save.
  let usernameTaken = false;
  let takenTimer = null;
  let takenRun = 0;
  const checkTaken = async (name) => {
    const run = ++takenRun;
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", name.replace(/[\\%_]/g, (c) => `\\${c}`))
      .neq("id", user.id)
      .limit(1);
    if (run !== takenRun || usernameInput.value.trim().toLowerCase() !== name) return;
    usernameTaken = Boolean(data?.length);
    if (usernameTaken) {
      linkPreview.classList.add("is-error");
      linkPreview.textContent = "That username is taken.";
    }
  };

  const paintUsername = () => {
    const typed = usernameInput.value.trim();
    // Existing names from before these rules (some have capitals) stay valid
    // until someone actually changes them.
    const changed = typed !== me.username;
    const problem = changed ? usernameProblem(typed.toLowerCase()) : "";
    usernameTaken = false;
    takenRun++;
    clearTimeout(takenTimer);
    if (changed && !problem) takenTimer = setTimeout(() => checkTaken(typed.toLowerCase()), 350);
    linkPreview.classList.toggle("is-error", Boolean(problem));
    linkPreview.innerHTML = problem
      ? problem
      : `Your link: <strong>${profileLinkHost()}/${escapeHtmlText(typed || "username")}</strong>`;
    return problem;
  };
  usernameInput.addEventListener("input", () => {
    const pos = usernameInput.selectionStart;
    const lowered = usernameInput.value.toLowerCase().replace(/\s+/g, "");
    if (lowered !== usernameInput.value && usernameInput.value.trim() !== me.username) {
      usernameInput.value = lowered;
      try { usernameInput.setSelectionRange(pos, pos); } catch (_) {}
    }
    paintUsername();
  });
  paintUsername();

  const paintBioCount = () => { bioCount.textContent = `${bioInput.value.length}/300`; };
  bioInput.addEventListener("input", paintBioCount);
  paintBioCount();

  modal.querySelector("#profile-song-remove").onclick = () => {
    songUrl.value = "";
    songCurrent.hidden = true;
  };

  let pendingFile = null;
  modal.querySelector("#avatar-file").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    openAvatarCropper(file, (cropped) => {
      pendingFile = cropped;
      const preview = modal.querySelector("#avatar-preview");
      preview.src = URL.createObjectURL(cropped);
      preview.classList.remove("avatar-preview-empty");
    });
  };

  loadScriptOnce("js/song-search.js")
    .then(() => {
      attachSongSearch("profile-song-search", "profile-song-url", "profile-song-results");
      modal.querySelector("#profile-song-search").addEventListener("input", () => { songCurrent.hidden = true; });
    })
    .catch(() => { modal.querySelector("#profile-song-search").placeholder = "Song search is unavailable right now"; });

  const saveBtn = modal.querySelector("#profile-save-btn");
  saveBtn.onclick = async () => {
    const typed = usernameInput.value.trim();
    const usernameChanged = typed !== me.username;
    if (usernameChanged && (usernameTaken || usernameProblem(typed.toLowerCase()))) { usernameInput.focus(); return; }

    const instagram = parseInstagramHandle(igInput.value);
    if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) {
      status.textContent = "That doesn't look like an Instagram username.";
      return;
    }

    const updates = {
      bio: bioInput.value.trim() || null,
      instagram_handle: instagram || null,
      profile_spotify_url: songUrl.value.trim() || null
    };
    if (usernameChanged) updates.username = typed.toLowerCase();

    saveBtn.disabled = true;
    status.textContent = "Saving…";
    try {
      if (pendingFile) updates.avatar_url = await uploadAvatar(user, pendingFile);
      const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
      if (error) throw error;
      invalidateMyProfile();
      close();
      renderAuthBar();
      window.dispatchEvent(new CustomEvent("glares:profile-updated", {
        detail: { oldUsername: me.username, username: updates.username ?? me.username }
      }));
    } catch (err) {
      status.textContent = friendlyProfileError(err);
      saveBtn.disabled = false;
    }
  };
}

function escapeHtmlText(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function openSearch() {
  try {
    await loadScriptOnce("js/search.js");
    openSearchOverlay();
  } catch (_) {
    alert("Search couldn't load. Check your connection and try again.");
  }
}

function searchButtonHtml() {
  return `<button type="button" class="btn btn-ghost icon-btn search-open-btn" data-open-search title="Search" aria-label="Search">${ICONS.search}</button>`;
}

function renderLoginShell(bar) {
  bar.innerHTML = `
    <div class="auth-entry-actions">
      ${searchButtonHtml()}
      <button type="button" class="btn btn-ghost" id="show-signin-btn">Sign in</button>
      <button type="button" class="btn" id="show-signup-btn">Sign up</button>
    </div>
  `;

  const openPanel = (mode) => {
    const isSignUp = mode === "signup";
    const panel = document.createElement("div");
    panel.className = "new-request-panel open";
    panel.id = "auth-panel";
    panel.innerHTML = `
      <section class="new-request auth-panel-card">
        <button class="panel-close" type="button" data-close>&times;</button>
        <p class="auth-panel-eyebrow">Glares</p>
        <h2>${isSignUp ? "Create your account" : "Welcome back"}</h2>
        <p class="field-hint">${isSignUp ? "Join to post requests and share recommendations." : "Sign in with your email and password."}</p>
        <form id="auth-panel-form">
          <div class="field-row"><input type="email" id="auth-email" placeholder="Email address" autocomplete="email" required></div>
          <div class="field-row"><input type="password" id="auth-password" placeholder="Password" minlength="6" autocomplete="${isSignUp ? "new-password" : "current-password"}" required></div>
          <button type="submit" class="btn auth-submit">${isSignUp ? "Create account" : "Sign in"}</button>
          <span id="auth-panel-status" class="login-status"></span>
        </form>
        ${isSignUp ? `<p class="auth-panel-switch">Already a member? <button type="button" class="link-btn" data-switch>Sign in</button></p>` : `<p class="auth-panel-switch"><button type="button" class="link-btn" data-forgot-password>Forgot password?</button><br>New to Glares? <button type="button" class="link-btn" data-switch>Create an account</button></p>`}
      </section>`;
    document.body.appendChild(panel);
    panel.querySelector("[data-close]").onclick = () => panel.remove();
    panel.addEventListener("click", (event) => { if (event.target === panel) panel.remove(); });
    panel.querySelector("[data-switch]").onclick = () => { panel.remove(); openPanel(isSignUp ? "signin" : "signup"); };
    const forgotPassword = panel.querySelector("[data-forgot-password]");
    if (forgotPassword) forgotPassword.onclick = async () => {
      const email = panel.querySelector("#auth-email").value.trim();
      const status = panel.querySelector("#auth-panel-status");
      if (!email) { status.textContent = "Enter your email first."; return; }
      status.textContent = "Sending password recovery email...";
      const error = await sendPasswordReset(email);
      status.textContent = error ? error.message : "Check your email to create a new password.";
    };
    panel.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = panel.querySelector("#auth-email").value.trim();
      const password = panel.querySelector("#auth-password").value;
      const status = panel.querySelector("#auth-panel-status");
      status.textContent = isSignUp ? "Creating account..." : "Signing in...";
      if (isSignUp) {
        const { data, error } = await signUpWithPassword(email, password);
        if (error) { status.textContent = error.message; return; }
        status.textContent = data.session ? "Account created. You are signed in." : "We sent a confirmation link. Check Inbox and Spam, then return here to sign in.";
        if (data.session) window.location.reload();
        return;
      }
      const error = await signInWithPassword(email, password);
      if (error) { status.textContent = "Invalid email or password."; return; }
      window.location.reload();
    });
  };

  document.getElementById("show-signin-btn").onclick = () => openPanel("signin");
  document.getElementById("show-signup-btn").onclick = () => openPanel("signup");
}
async function renderAuthBar() {
  const bar = document.getElementById("auth-bar");
  if (!bar) return;

  renderLoginShell(bar);
  const user = await getCurrentUser();

  if (user) {
    const profile = await getMyProfile();

    bar.innerHTML = `
      ${searchButtonHtml()}
      <button id="avatar-btn" class="avatar-btn" title="${profile?.username ?? "you"}" aria-label="Your profile">
        ${profile?.avatar_url ? `<img src="${profile.avatar_url}" class="avatar-thumb" />` : `<span class="avatar-thumb avatar-thumb-empty"></span>`}
        <span class="auth-user">${profile?.username ?? "you"}</span>
      </button>
      <button id="edit-profile-btn" class="btn btn-ghost icon-btn" title="Edit profile" aria-label="Edit profile">${ICONS.pencil}<span class="btn-label">Edit</span></button>
      <button id="signout-btn" class="btn btn-ghost icon-btn" title="Sign out" aria-label="Sign out">${ICONS.logout}<span class="btn-label">Sign out</span></button>
    `;
    document.getElementById("signout-btn").addEventListener("click", signOut);
    document.getElementById("avatar-btn").onclick = () => { window.location.href = `profile.html#${encodeURIComponent(profile?.username ?? "")}`; };
    document.getElementById("edit-profile-btn").onclick = () => openProfileModal(user);
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") openPasswordRecoveryModal();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-search]")) openSearch();
});

document.addEventListener("keydown", (event) => {
  const typing = event.target.closest?.("input, textarea, [contenteditable='true']");
  if (typing) return;
  if (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
    event.preventDefault();
    openSearch();
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  renderInstagramBrowserPrompt();
  await renderAuthBar();
  const { data: { session } } = await supabase.auth.getSession();
  if (session && window.location.hash.includes("type=recovery")) openPasswordRecoveryModal();
});
