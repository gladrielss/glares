// Search overlay — people and posts. Loaded on demand by auth.js the first
// time someone taps the search button (or presses "/" or ⌘K), so pages that
// never search don't pay for it.

const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 220;

function searchEscape(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// PostgREST filter strings use commas and parentheses as syntax, and % / _
// are LIKE wildcards — none of them mean anything useful in a search box.
function searchTerm(raw) {
  return raw.replace(/[,()%_\\*]/g, " ").replace(/\s+/g, " ").trim();
}

function openSearchOverlay() {
  const existing = document.getElementById("search-overlay");
  if (existing) { existing.querySelector("input").focus(); return; }

  const overlay = document.createElement("div");
  overlay.id = "search-overlay";
  overlay.className = "search-overlay";
  overlay.innerHTML = `
    <div class="search-sheet" role="dialog" aria-label="Search Glares">
      <div class="search-bar">
        <span class="search-bar-icon" aria-hidden="true">${ICONS.search}</span>
        <input type="search" id="search-input" placeholder="Search people and posts" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
        <button type="button" class="search-close" data-close-search>Cancel</button>
      </div>
      <div class="search-results" id="search-results">
        <p class="search-hint">Find friends by username, or posts by what they're looking for.</p>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add("search-open");

  const input = overlay.querySelector("#search-input");
  const results = overlay.querySelector("#search-results");

  const close = () => {
    overlay.remove();
    document.body.classList.remove("search-open");
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close-search]")) close();
  });

  let timer = null;
  let latest = 0;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const term = searchTerm(input.value);
    if (term.length < SEARCH_MIN_CHARS) {
      results.innerHTML = `<p class="search-hint">Find friends by username, or posts by what they're looking for.</p>`;
      return;
    }
    results.innerHTML = `<p class="search-hint">Searching…</p>`;
    timer = setTimeout(() => runSearch(term), SEARCH_DEBOUNCE_MS);
  });

  async function runSearch(term) {
    // Typing fast fires several searches; only the newest one gets to paint.
    const run = ++latest;
    const pattern = `%${term}%`;
    const [people, posts] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, avatar_url, bio")
        .ilike("username", pattern)
        .order("username")
        .limit(6),
      supabase
        .from("requests")
        .select("id, title, description, category, image_url, thumb_url, found_recommendation_id, profiles!requests_user_id_fkey(username)")
        .or(`title.ilike.${pattern},description.ilike.${pattern},category.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(12)
    ]);
    if (run !== latest || !document.body.contains(overlay)) return;

    if (people.error && posts.error) {
      results.innerHTML = `<p class="search-hint">Search isn't working right now. Try again in a moment.</p>`;
      return;
    }

    const peopleRows = people.data ?? [];
    const postRows = posts.data ?? [];
    if (!peopleRows.length && !postRows.length) {
      results.innerHTML = `<p class="search-hint">Nothing for “${searchEscape(term)}” yet. Maybe post it as a request?</p>`;
      return;
    }

    results.innerHTML = `
      ${peopleRows.length ? `
        <p class="search-section">People</p>
        <div class="search-people">
          ${peopleRows.map(p => `
            <a class="search-person" href="profile.html#${encodeURIComponent(p.username)}">
              ${p.avatar_url
                ? `<img src="${p.avatar_url}" alt="" class="search-avatar" loading="lazy" decoding="async">`
                : `<span class="search-avatar search-avatar-empty"></span>`}
              <span class="search-person-text">
                <strong>${searchEscape(p.username)}</strong>
                ${p.bio ? `<span>${searchEscape(p.bio.split("\n")[0])}</span>` : ""}
              </span>
            </a>`).join("")}
        </div>` : ""}
      ${postRows.length ? `
        <p class="search-section">Posts</p>
        <div class="search-posts">
          ${postRows.map(r => `
            <a class="search-post" href="request.html#${r.id}">
              ${r.image_url
                ? `<img src="${r.thumb_url || r.image_url}" alt="" loading="lazy" decoding="async">`
                : `<span class="search-post-text">${searchEscape((r.title || r.description || "").slice(0, 80))}</span>`}
              <span class="search-post-meta">
                ${r.found_recommendation_id ? `<span class="found-badge">Found</span>` : ""}
                ${r.title ? `<strong>${searchEscape(r.title.split("\n")[0])}</strong>` : ""}
                <span>${searchEscape(r.profiles?.username ?? "")}</span>
              </span>
            </a>`).join("")}
        </div>` : ""}`;
  }

  input.focus();
}
