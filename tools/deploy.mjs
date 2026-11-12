// Deploy the analytics backend without the game noticing much (2026-11-12, the user: "capaz alguna vez quiera
// updatearla asi que quedaria fuera de servicio o no responderia bien a las peticiones ... ten en cuenta eso").
//
//   node tools/deploy.mjs [minutes]      (default 10: how long the game is told to wait at most)
//
// 1. maintenance on: the game's sends get 503 + Retry-After (its servers pause and keep what they hold, capped), the cron rests
// 2. the D1 migrations still to apply, applied (remote)
// 3. wrangler deploy, with BUILD = this deploy's stamp
// 4. /health asked till it answers with that stamp
// 5. maintenance off
// Anything failing stops there and leaves maintenance on: it runs out by itself after [minutes], or turn it off with
//   node tools/maintenance.mjs 0
// The key is read from .ingest-key here; it's never printed.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prodBase } from "./base.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = prodBase();
const DB = "nightwheels";
const minutes = Math.max(1, Math.min(Number(process.argv[2]) || 10, 120));
const key = readFileSync(join(root, ".ingest-key"), "utf8").trim();

async function maintenance(mins) {
	const res = await fetch(`${BASE}/admin/maintenance`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-key": key },
		body: JSON.stringify({ minutes: mins }),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`maintenance ${mins}: HTTP ${res.status} ${data.error || ""}`);
	return data;
}

function run(cmd) {
	console.log(`\n$ ${cmd}`);
	execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, CI: "true" } });
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, ""); // e.g. 20261112T081500
try {
	// (the first deploy with /admin/maintenance: an older Worker answers 404 here; then it goes ahead without it)
	try {
		const on = await maintenance(minutes);
		console.log(`maintenance on till ${new Date(on.until * 1000).toLocaleTimeString()} (${minutes} min)`);
	} catch (err) {
		console.warn(`(couldn't turn maintenance on: ${err.message}; going ahead)`);
	}
	run(`npx -y wrangler@4 d1 migrations apply ${DB} --remote`);
	run(`npx -y wrangler@4 deploy --var BUILD:${stamp}`);
	let seen = null;
	for (let i = 0; i < 30; i++) {
		try {
			const res = await fetch(`${BASE}/health`, { cache: "no-store" });
			const data = await res.json();
			seen = data.build;
			if (data.ok && data.build === stamp) break;
		} catch {}
		await new Promise((r) => setTimeout(r, 2000));
	}
	if (seen !== stamp) throw new Error(`/health never showed the new build (last: ${seen})`);
	console.log(`\n/health: build ${stamp} up`);
	await maintenance(0);
	console.log("maintenance off: the game sends again (each server tries once its pause runs out)");
} catch (err) {
	console.error(`\nDEPLOY STOPPED: ${err.message}`);
	console.error(`Maintenance stays on till it runs out (${minutes} min). To end it now: node tools/maintenance.mjs 0`);
	process.exit(1);
}
