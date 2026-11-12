// Maintenance by hand:  node tools/maintenance.mjs <minutes>   (0: off; at most 120)
// While it's on the game's sends get 503 + Retry-After and its servers pause; the cron rests; the dashboard says so.
// The key is read from .ingest-key here; it's never printed. BASE=http://127.0.0.1:8787 for a local `wrangler dev`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prodBase } from "./base.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || prodBase();
const minutes = Number(process.argv[2]);
if (!Number.isFinite(minutes)) {
	console.error("usage: node tools/maintenance.mjs <minutes>   (0: off)");
	process.exit(1);
}
const keyFile = process.env.BASE ? ".dev.vars" : ".ingest-key";
let key = readFileSync(join(root, keyFile), "utf8").trim();
if (keyFile === ".dev.vars") key = (key.match(/^INGEST_KEY\s*=\s*"?([^"\n]+)"?/m) || [])[1] || "";
const res = await fetch(`${BASE}/admin/maintenance`, {
	method: "POST",
	headers: { "content-type": "application/json", "x-key": key },
	body: JSON.stringify({ minutes }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok) {
	console.error(`HTTP ${res.status} ${data.error || ""}`);
	process.exit(1);
}
console.log(data.until ? `maintenance on till ${new Date(data.until * 1000).toLocaleTimeString()}` : "maintenance off");
