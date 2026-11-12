// Reads the analytics, read only, for an AI or a person: prints Markdown (or JSON with --json).
//   node tools/ask.mjs digest [days]         everything in one page (default 7 days)
//   node tools/ask.mjs session <id>          one session: summary + timeline
//   node tools/ask.mjs player <userId>       one player's sessions and signals (JSON)
//   node tools/ask.mjs funnel [days]         the tutorial funnel's sessions (JSON)
//   node tools/ask.mjs review [days]         sessions worth watching (JSON)
//   add --local to read the local `wrangler dev` (127.0.0.1:8787, key from .dev.vars AGENT_KEY)
// The key comes from .agent-key next to this folder (never printed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prodBase } from "./base.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const local = flags.has("--local");
const base = local ? "http://127.0.0.1:8787" : prodBase();
const key = local
	? (fs.readFileSync(path.join(root, ".dev.vars"), "utf8").match(/^AGENT_KEY=(.*)$/m) || [])[1]?.trim()
	: fs.readFileSync(path.join(root, ".agent-key"), "utf8").trim();
const [what = "digest", arg] = args;
const route =
	what === "session" ? `session/${arg}` : what === "player" ? `player/${arg}` : `${what}?days=${arg || 7}`;
const sep = route.includes("?") ? "&" : "?";
const url = `${base}/api/agent/${route}${flags.has("--json") ? `${sep}format=json` : ""}`;
const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
const body = await res.text();
if (!res.ok) {
	console.error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
	process.exit(1);
}
console.log(body);
