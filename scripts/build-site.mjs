// Copies the public site into dist/ for Cloudflare Pages.
//
// Pages publishes its whole output directory, so pointing it at the repo root
// would also serve api/, lib/, functions/, supabase/ migrations and
// node_modules as static files. Only what the browser needs goes in here.
// Server functions are picked up separately from functions/.
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";

const PUBLIC = [
  "index.html", "messages.html", "profile.html", "reel.html", "request.html",
  "store.html", "store-item.html", "cut.html",
  "sw.js", "css", "js", "images"
];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const entry of PUBLIC) {
  if (!existsSync(entry)) throw new Error(`build-site: missing ${entry}`);
  cpSync(entry, `dist/${entry}`, { recursive: true });
}

// functions/[username].js answers every one-segment path, so without this
// every page view and script load would run a Function first. Static files
// skip Functions entirely; only /api/* and profile links reach them.
const exclude = ["/"];
for (const entry of PUBLIC) {
  if (entry.endsWith(".html")) {
    exclude.push(`/${entry}`, `/${entry.slice(0, -".html".length)}`);
  } else if (entry.includes(".")) {
    exclude.push(`/${entry}`);
  } else {
    exclude.push(`/${entry}/*`);
  }
}
writeFileSync("dist/_routes.json", JSON.stringify({ version: 1, include: ["/*"], exclude }, null, 2));

console.log(`build-site: copied ${PUBLIC.length} entries to dist/ (+ _routes.json, ${exclude.length} static excludes)`);
