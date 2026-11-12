/*
	Night Wheels analytics: the game's servers POST what each player does (POST /ingest, header X-Key), this keeps it
	in D1, and the dashboard (./public) reads it through /api/* after a password login.

	What a game server sends (gzip JSON, one request for all its players with something new; v 2, 2026-11-12: a session
	goes once, when the player leaves, or every 20 minutes for a long one; v 1 sent every minute):
	{ v: 1 | 2, server, place, version, studio, private, sent,
	  sessions: [ { id, user, name, display, start, seq, meta?: { first, device, loaded },
	                lines: [ { q, t, k, s, c, p?: [x, y, z], m?, v?, f? } | { q, c } ],
	                track?, look?, near?: base64 of the replay's samples (the game's binary formats),
	                end?: { ...summary } } ] }
	A line: q its number in the session, t seconds into it, k kind, s text, c times in a row, p where, m cash, v mph,
	f FPS; a signal (k 'señal': something that looks like the player struggling) also g its tag, w its weight, o what
	it was about. { q, c } alone: line q happened c times by now (it had already been sent).
*/

export interface Env {
	DB: D1Database;
	ASSETS: Fetcher;
	INGEST_KEY: string;
	DASH_PASSWORD: string;
	ROBLOX_WEBHOOK_SECRET?: string;
	KEEP_LINES_DAYS?: string; // (optional) full lines kept this many days; summaries, signals and points stay forever
	AGENT_KEY?: string; // read-only key for /api/agent/* (an AI reading the analytics); kept in the project's .agent-key
	MAX_PLAYS?: string; // a player's plays kept (default 4); later ones are turned away and the game stops sending them
	STORAGE_LIMIT_MB?: string; // past this the oldest/reviewed profiles are deleted to make room (default 450 of the free 500)
	DAILY_WRITES?: string; // rows written a day at most (default 95,000 of the free plan's 100,000; paid: ~1,500,000)
	BUILD?: string; // what deploy this is (tools/deploy.mjs passes it: --var BUILD:<time>); /health says it
	UNIVERSE_ID?: string; // the game's universe: "playing now" comes from Roblox (sessions arrive when they end, 2026-11-12)
}

// Kinds of lines that go on the map (the rest only in the session's log)
const POINT_KINDS = new Set(["moto", "compra", "policía", "tutorial", "teleport", "servidor", "afk", "prompt", "menú", "datos", "señal"]);
const COOKIE = "nw_auth";
const AUTH_DAYS = 30;
const LIVE_SECONDS = 90; // no data for longer than this and not ended: shown as "sin cierre"

const enc = new TextEncoder();
const dec = new TextDecoder();

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
	});
}

async function gunzip(bytes: ArrayBuffer | Uint8Array): Promise<string> {
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
	return await new Response(stream).text();
}

async function gzip(text: string): Promise<ArrayBuffer> {
	return await gzipBytes(enc.encode(text));
}

async function gzipBytes(bytes: Uint8Array): Promise<ArrayBuffer> {
	const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
	return await new Response(stream).arrayBuffer();
}

async function gunzipBytes(data: unknown): Promise<Uint8Array> {
	const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data as number[]);
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

const toBase64 = (bytes: Uint8Array) => {
	let out = "";
	for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(out);
};

// A session's replay samples, each kind's chunks joined in order (the formats are self-delimiting), base64
async function sessionTrack(id: string, env: Env): Promise<Response> {
	const db = env.DB;
	// (sessions before 2026-11-12: a row a send in tracks; after: all of it in the session's row; one that went over both, both)
	const [old, own] = await db.batch([
		db.prepare(`SELECT kind, seq, data FROM tracks WHERE session_id = ? ORDER BY kind, seq`).bind(id),
		db.prepare(`SELECT track, look, near FROM sessions WHERE id = ?`).bind(id),
	]);
	const parts: Record<string, Uint8Array[]> = { t: [], l: [], n: [] };
	for (const row of old.results as any[]) parts[row.kind]?.push(await gunzipBytes(row.data));
	const row: any = own.results[0];
	if (row?.track) parts.t.push(await gunzipBytes(row.track));
	if (row?.look) parts.l.push(await gunzipBytes(row.look));
	if (row?.near) parts.n.push(await gunzipBytes(row.near));
	const join = (list: Uint8Array[]) => {
		const out = new Uint8Array(list.reduce((a, b) => a + b.length, 0));
		let at = 0;
		for (const part of list) out.set(part, at), (at += part.length);
		return toBase64(out);
	};
	return json({ track: join(parts.t), look: join(parts.l), near: join(parts.n), kept: TRACK_DAYS });
}

// The map in blocks: uploaded from Studio in parts (POST /ingest/world, X-Key), joined when the last one comes
async function worldUpload(req: Request, env: Env): Promise<Response> {
	const key = req.headers.get("x-key") || "";
	if (!env.INGEST_KEY || !same(key, env.INGEST_KEY)) return json({ error: "key" }, 401);
	const raw = new Uint8Array(await req.arrayBuffer());
	const body = JSON.parse(raw[0] === 0x1f && raw[1] === 0x8b ? await gunzip(raw) : dec.decode(raw));
	const part = num(body.part), parts = num(body.parts);
	if (part === null || parts === null || parts > 60 || typeof body.data !== "string") return json({ error: "body" }, 400);
	const db = env.DB;
	await db.prepare(`INSERT OR REPLACE INTO assets (name, data, updated) VALUES (?1, ?2, ?3)`).bind(`world.part.${part}`, enc.encode(body.data), Date.now() / 1000).run();
	const { results } = await db.prepare(`SELECT name, data FROM assets WHERE name LIKE 'world.part.%'`).all<any>();
	if (results.length < parts) return json({ ok: true, have: results.length, of: parts });
	const ordered = results.sort((a: any, b: any) => Number(a.name.split(".")[2]) - Number(b.name.split(".")[2]));
	const whole = ordered.map((r: any) => dec.decode(new Uint8Array(r.data))).join("");
	JSON.parse(whole); // (only a whole, valid world replaces the old one)
	await db.batch([
		db.prepare(`INSERT OR REPLACE INTO assets (name, data, updated) VALUES ('world', ?1, ?2)`).bind(await gzip(whole), Date.now() / 1000),
		db.prepare(`DELETE FROM assets WHERE name LIKE 'world.part.%'`),
	]);
	return json({ ok: true, done: true, bytes: whole.length });
}

async function world(env: Env): Promise<Response> {
	const row = await env.DB.prepare(`SELECT data, updated FROM assets WHERE name = 'world'`).first<any>();
	if (!row) return json({ error: "no world uploaded yet" }, 404);
	const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data as number[]);
	// (sent as it's stored: the browser unzips it)
	return new Response(bytes, {
		headers: { "content-type": "application/json", "content-encoding": "gzip", "cache-control": "private, max-age=3600", "x-updated": String(row.updated) },
		encodeBody: "manual",
	} as any);
}

async function hmac(key: string, message: string): Promise<Uint8Array> {
	const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

function hex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function same(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/* ---------- dashboard login: a signed cookie, no accounts ---------- */
async function token(env: Env, exp: number): Promise<string> {
	return `${exp}.${hex(await hmac("nw-dash:" + env.DASH_PASSWORD, String(exp)))}`;
}

async function authed(req: Request, env: Env): Promise<boolean> {
	if (!env.DASH_PASSWORD) return false;
	const cookie = req.headers.get("cookie") || "";
	const match = cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
	if (!match) return false;
	const [expText] = match[1].split(".");
	const exp = Number(expText);
	if (!exp || exp < Date.now() / 1000) return false;
	return same(match[1], await token(env, exp));
}

async function login(req: Request, env: Env): Promise<Response> {
	const body = (await req.json().catch(() => ({}))) as { password?: string };
	if (!env.DASH_PASSWORD || typeof body.password !== "string" || !same(body.password, env.DASH_PASSWORD)) {
		await new Promise((r) => setTimeout(r, 600));
		return json({ error: "bad_password" }, 401);
	}
	const exp = Math.floor(Date.now() / 1000) + AUTH_DAYS * 86400;
	const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
	return json({ ok: true }, 200, {
		"set-cookie": `${COOKIE}=${await token(env, exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${AUTH_DAYS * 86400}${secure}`,
	});
}

/* ---------- ingest ---------- */
type Line = {
	q: number;
	t?: number;
	k?: string;
	s?: string;
	c?: number;
	p?: number[];
	m?: number;
	v?: number;
	f?: number;
	g?: string;
	w?: number;
	o?: string;
};

const MAX_SESSIONS = 40; // sessions taken from one request (the game sends 8 at most)
const MAX_POINTS = 280; // map points taken from one request (with the above, under the free plan's 50 queries a request)
const TRACK_DAYS = 7; // the replay's samples are deleted after this many days (the user's choice, 2026-11-11)

/* ---------- the day's writes (2026-11-11, the user: ~100 CCU, more than planned; "si se llena pausas un rato ... y
   metiendo nueva"; "si se cae la pagina ... que se pierdan pues ya nimodo"). D1's free plan writes 100,000 rows a day
   (an index on a row counts again, a deleted row too); past that every write fails till midnight UTC. So the rows
   written each day are counted (counters writes_<day>) and kept under DAILY_WRITES: the game's sends get INGEST_SHARE of
   it, the cron (packing, the 7-day trim, making room) the rest. Over the game's share, a send is turned away (429,
   Retry-After: the game's servers all pause and let go of what they held). And so it lasts the whole day, each answer
   says what share of NEW sessions to record (sample): all of them while the day's writes keep under its pace, fewer
   when they run ahead of it. On the paid plan (50M rows a month) set DAILY_WRITES to ~1,500,000. */
const DAY = 86400;
const INGEST_SHARE = 0.85;
const MIN_SAMPLE = 0.05;
function today(): string {
	return `writes_${Math.floor(Date.now() / 1000 / DAY)}`;
}
function budgetOf(env: Env): { total: number; ingest: number } {
	const total = Math.max(1000, Number(env.DAILY_WRITES || 95000));
	return { total, ingest: Math.floor(total * INGEST_SHARE) };
}
async function writtenToday(db: D1Database): Promise<number> {
	return (await db.prepare(`SELECT n FROM counters WHERE name = ?1`).bind(today()).first<number>("n")) ?? 0;
}
function countWrites(db: D1Database, rows: number): D1PreparedStatement {
	return db
		.prepare(`INSERT INTO counters (name, n) VALUES (?1, ?2) ON CONFLICT(name) DO UPDATE SET n = n + excluded.n`)
		.bind(today(), rows + 1);
}
function rowsWritten(results: D1Result[]): number {
	return results.reduce((a, r) => a + Number((r.meta as any)?.rows_written ?? 0), 0);
}
// The share of new sessions to record: 1 while the day's writes are under their pace (the game's share spread over the
// day, at least half an hour's worth), less as they run ahead of it
function sampleFor(written: number, budget: { ingest: number }): number {
	const done = ((Date.now() / 1000) % DAY) / DAY;
	const pace = budget.ingest * Math.max(done, 1 / 48);
	const ahead = written / pace;
	if (ahead <= 0.8) return 1;
	return Math.round(Math.max(MIN_SAMPLE, Math.min(1, 0.8 / (ahead * ahead))) * 100) / 100;
}
function untilTomorrow(): number {
	return Math.ceil(DAY - ((Date.now() / 1000) % DAY));
}

/* ---------- maintenance (2026-11-12, the user: "capaz alguna vez quiera updatearla asi que quedaria fuera de servicio o
   no responderia bien a las peticiones y datos pq esta updateando ten en cuenta eso"). While it's on (counters row
   maintenance_until: unix seconds), the game's sends are turned away with 503 and Retry-After = what's left (its servers
   all pause that long and keep what they hold, capped: AnalyticsConfig.MaxPending / MaxEnded), the cron rests, and the
   dashboard says so. tools/deploy.mjs turns it on, applies the migrations, deploys, waits for /health to show the new
   build and turns it off; a deploy that fails leaves it on till it runs out by itself. */
const MAINTENANCE_KEY = "maintenance_until";
const MAINTENANCE_MAX_MIN = 120;
let maintenanceCache = { until: 0, at: 0 }; // (per isolate: read again every MAINTENANCE_CACHE_MS)
const MAINTENANCE_CACHE_MS = 10_000;
async function maintenanceUntil(env: Env, fresh = false): Promise<number> {
	const now = Date.now();
	if (!fresh && now - maintenanceCache.at < MAINTENANCE_CACHE_MS) return maintenanceCache.until;
	let until = 0;
	try {
		until = (await env.DB.prepare(`SELECT n FROM counters WHERE name = ?1`).bind(MAINTENANCE_KEY).first<number>("n")) ?? 0;
	} catch {
		until = maintenanceCache.until; // (the database itself mid-change: as it was)
	}
	maintenanceCache = { until, at: now };
	return until;
}
// Seconds of maintenance left (0: none)
async function maintenanceLeft(env: Env): Promise<number> {
	return Math.max(0, Math.ceil((await maintenanceUntil(env)) - Date.now() / 1000));
}
function maintenanceAnswer(left: number): Response {
	return json({ error: "maintenance", until: Math.ceil(Date.now() / 1000 + left) }, 503, { "retry-after": String(Math.min(Math.max(left, 30), 3600)) });
}
// POST /admin/maintenance { minutes } (X-Key, as the game's; or the dashboard's login): on for that many minutes, 0 off
async function setMaintenance(req: Request, env: Env): Promise<Response> {
	const key = req.headers.get("x-key") || "";
	if (!((env.INGEST_KEY && same(key, env.INGEST_KEY)) || (await authed(req, env)))) return json({ error: "key" }, 401);
	const body = (await req.json().catch(() => ({}))) as any;
	const minutes = Math.min(Math.max(Number(body.minutes) || 0, 0), MAINTENANCE_MAX_MIN);
	const until = minutes > 0 ? Math.ceil(Date.now() / 1000 + minutes * 60) : 0;
	await env.DB.prepare(`INSERT INTO counters (name, n) VALUES (?1, ?2) ON CONFLICT(name) DO UPDATE SET n = excluded.n`)
		.bind(MAINTENANCE_KEY, until)
		.run();
	maintenanceCache = { until, at: Date.now() };
	return json({ ok: true, until: until || null });
}
// GET /health: up, which build, and maintenance (no login: nothing in it is private)
async function health(env: Env): Promise<Response> {
	const until = await maintenanceUntil(env, true);
	const now = Date.now() / 1000;
	return json({ ok: true, build: env.BUILD ?? null, now, maintenance: until > now ? until : null });
}
const PACK_MAX_LINES = 6000; // a longer session keeps its chunks as they came (packing it could pass the CPU limit)

/* ---------- lines stored small: columns (2026-11-11, measured 3.8× smaller than gzip'd rows) ----------
   { v: 2, kinds: [...], texts: [...], q, t, k, s, c, x, y, z, m, v, f, g, w, o }: q/t/x/y/z/m as differences from the line
   before (t in tenths of a second), k/s as places in kinds/texts, null where a line has none. A count update
   ({ q, c } alone) has kind "". */
type Columns = { v: 2; kinds: string[]; texts: string[]; [col: string]: any };
function encodeLines(lines: Line[]): Columns {
	const kinds: string[] = [], texts: string[] = [];
	const kIndex = new Map<string, number>(), sIndex = new Map<string, number>();
	const col: Record<string, any[]> = { q: [], t: [], k: [], s: [], c: [], x: [], y: [], z: [], m: [], v: [], f: [], g: [], w: [], o: [] };
	let pq = 0, pt = 0, px = 0, py = 0, pz = 0, pm = 0;
	const indexOf = (map: Map<string, number>, list: string[], value: string) => {
		let i = map.get(value);
		if (i === undefined) map.set(value, (i = list.push(value) - 1));
		return i;
	};
	for (const l of lines) {
		col.q.push(l.q - pq), (pq = l.q);
		const t = Math.round((l.t ?? 0) * 10);
		col.t.push(t - pt), (pt = t);
		col.k.push(indexOf(kIndex, kinds, l.k ?? ""));
		col.s.push(l.s === undefined ? null : indexOf(sIndex, texts, l.s));
		col.c.push(l.c === 1 ? 0 : (l.c ?? null));
		if (Array.isArray(l.p)) col.x.push(l.p[0] - px), col.y.push(l.p[1] - py), col.z.push(l.p[2] - pz), (px = l.p[0]), (py = l.p[1]), (pz = l.p[2]);
		else col.x.push(null), col.y.push(null), col.z.push(null);
		if (typeof l.m === "number") col.m.push(l.m - pm), (pm = l.m);
		else col.m.push(null);
		col.v.push(l.v ?? null), col.f.push(l.f ?? null), col.g.push(l.g ?? null), col.w.push(l.w ?? null), col.o.push(l.o ?? null);
	}
	// (columns no line uses aren't kept)
	for (const name of ["v", "f", "g", "w", "o"]) if (col[name].every((value) => value === null)) delete col[name];
	return { v: 2, kinds, texts, ...col };
}

function decodeLines(data: any): Line[] {
	if (Array.isArray(data)) return data; // (stored before 2026-11-11: plain lines)
	const out: Line[] = [];
	let q = 0, t = 0, x = 0, y = 0, z = 0, m = 0;
	for (let i = 0; i < data.q.length; i++) {
		q += data.q[i];
		t += data.t[i];
		const kind = data.kinds[data.k[i]];
		const c = data.c[i] === 0 ? 1 : data.c[i];
		if (kind === "") {
			out.push({ q, c });
			continue;
		}
		const line: Line = { q, t: t / 10, k: kind, s: data.texts[data.s[i]], c };
		if (data.x[i] !== null) (x += data.x[i]), (y += data.y[i]), (z += data.z[i]), (line.p = [x, y, z]);
		if (data.m[i] !== null) (m += data.m[i]), (line.m = m);
		for (const name of ["v", "f", "g", "w", "o"] as const) if (data[name] && data[name][i] !== null) (line as any)[name] = data[name][i];
		out.push(line);
	}
	return out;
}

async function readChunk(data: unknown): Promise<Line[]> {
	// (D1 hands a BLOB back as an array of numbers)
	const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data as number[]);
	return decodeLines(JSON.parse(await gunzip(bytes)));
}

// A session's lines from its chunks: in order, each once, the counts sent later applied
function mergeLines(chunks: Line[][]): Line[] {
	const byQ = new Map<number, Line>();
	const lines: Line[] = [];
	for (const list of chunks) {
		for (const line of list) {
			if (line.k === undefined) {
				const target = byQ.get(line.q);
				if (target && typeof line.c === "number") target.c = line.c;
				continue;
			}
			if (byQ.has(line.q)) continue; // (a chunk sent twice)
			byQ.set(line.q, line);
			lines.push(line);
		}
	}
	return lines.sort((a, b) => (a.t ?? 0) - (b.t ?? 0) || a.q - b.q);
}

function num(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown, max: number): string | null {
	return typeof value === "string" ? value.slice(0, max) : null;
}

function bool(value: unknown): number | null {
	return typeof value === "boolean" ? (value ? 1 : 0) : null;
}

async function ingest(req: Request, env: Env): Promise<Response> {
	const key = req.headers.get("x-key") || "";
	if (!env.INGEST_KEY || !same(key, env.INGEST_KEY)) return json({ error: "key" }, 401);
	const raw = new Uint8Array(await req.arrayBuffer());
	let body: any;
	try {
		const text = raw[0] === 0x1f && raw[1] === 0x8b ? await gunzip(raw) : dec.decode(raw);
		body = JSON.parse(text);
	} catch {
		return json({ error: "body" }, 400);
	}
	if (!body || !Array.isArray(body.sessions)) return json({ error: "sessions" }, 400);

	// The day's writes over the game's share: turned away till the share's there again (tomorrow, UTC). The game's
	// servers all pause; it asks again within the hour (each ask: one row read)
	const budget = budgetOf(env);
	const written = await writtenToday(env.DB);
	if (written >= budget.ingest) {
		const wait = Math.min(untilTomorrow(), 3600);
		return json({ error: "budget", written, budget: budget.ingest, retry: wait }, 429, { "retry-after": String(wait) });
	}

	// Only a player's first MAX_PLAYS plays are kept (the user, 2026-11-11: "si ya fueron mas de 4 plays ya no
	// registrarlo"): a new session of a player who has that many is turned away, and the game stops sending it (skip)
	const db = env.DB;
	const maxPlays = Number(env.MAX_PLAYS || 4);
	const skip = new Set<string>();
	const incoming = body.sessions.slice(0, MAX_SESSIONS).filter((s: any) => typeof s?.id === "string" && typeof s?.user === "number");
	if (!body.studio && incoming.length > 0 && maxPlays > 0) {
		const ids = incoming.map((s: any) => s.id);
		const users = [...new Set(incoming.map((s: any) => s.user))];
		const [known, plays] = await db.batch([
			db.prepare(`SELECT id FROM sessions WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids),
			db.prepare(`SELECT user_id, COUNT(*) AS n FROM sessions WHERE studio = 0 AND user_id IN (${users.map(() => "?").join(",")}) GROUP BY user_id`).bind(...users),
		]);
		const knownIds = new Set(known.results.map((r: any) => r.id));
		const playsOf = new Map(plays.results.map((r: any) => [r.user_id, r.n]));
		for (const s of incoming) if (!knownIds.has(s.id) && (playsOf.get(s.user) ?? 0) >= maxPlays) skip.add(s.id);
	}

	// (the free plan allows 50 queries a request: rows go in many-row statements, and a request holds at most
	// MAX_SESSIONS sessions and MAX_POINTS points; the game sends 8 sessions at most)
	// What these sessions already have in their row (a send before this one): its points and replay samples, added to
	const ids = incoming.map((s: any) => String(s.id)).filter((id: string) => /^[a-z0-9]{6,40}$/.test(id));
	const before = new Map<string, any>();
	if (ids.length) {
		const { results } = await db
			.prepare(`SELECT id, rseq, pts, track, look, near FROM sessions WHERE id IN (${ids.map(() => "?").join(",")})`)
			.bind(...ids)
			.all<any>();
		for (const row of results) before.set(row.id, row);
	}

	const now = Date.now() / 1000;
	const statements: D1PreparedStatement[] = [];
	const chunkRows: unknown[][] = [];
	let lineCount = 0, sessions = 0;
	for (const s of body.sessions.slice(0, MAX_SESSIONS)) {
		const id = str(s?.id, 40);
		const user = num(s?.user);
		const start = num(s?.start);
		if (!id || !/^[a-z0-9]{6,40}$/.test(id) || user === null || start === null || skip.has(id)) continue;
		const meta = s.meta || {};
		const tut = meta.tut && typeof meta.tut === "object" ? meta.tut : null;
		const end = s.end && typeof s.end === "object" ? s.end : null;
		const endTut = end?.tutorial || {};
		const top = Array.isArray(end?.reasons) && end.reasons[0] ? end.reasons[0] : {};
		const seq = num(s.seq) ?? 1;
		const lines: Line[] = Array.isArray(s.lines) ? s.lines.slice(0, 8000) : [];

		// this send's part, added to what the row has unless it's a send it already has (the game sending it again)
		const old = before.get(id);
		const fresh = !old || old.rseq == null || old.rseq < seq;
		const pts: Pt[] = old?.pts ? JSON.parse(old.pts) : [];
		const blobs: Record<string, ArrayBuffer | null> = { track: null, look: null, near: null };
		if (fresh) {
			const seen = new Set(pts.map((p) => p[0]));
			for (const p of pointsOf(lines)) if (!seen.has(p[0]) && pts.length < MAX_PTS) pts.push(p);
		}
		for (const field of ["track", "look", "near"] as const) {
			const b64 = s[field];
			const add = fresh && typeof b64 === "string" && b64.length > 0 && b64.length < 2_000_000 ? Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)) : null;
			const had = old?.[field] ? await gunzipBytes(old[field]) : null;
			if (!add && !had) continue;
			const joined = new Uint8Array((had?.length ?? 0) + (add?.length ?? 0));
			if (had) joined.set(had, 0);
			if (add) joined.set(add, had?.length ?? 0);
			blobs[field] = await gzipBytes(joined);
		}
		const signals = pts.filter((p) => p[7]);
		const heaviest = signals.reduce<Pt | null>((a, p) => (!a || (p[8] ?? 0) > (a[8] ?? 0) ? p : a), null);

		statements.push(
			db
				.prepare(
					`INSERT INTO sessions (id, user_id, name, display, server_id, place_version, studio, private, started_at, last_at, first, device,
					   tut_version, tut_step, tut_done, ended, played, reason, reason_w, earned, spent, robux, level, summary,
					   rseq, score, tags, top_text, pts, track, look, near)
					 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24,
					   ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32)
					 ON CONFLICT(id) DO UPDATE SET
					   last_at = MAX(sessions.last_at, excluded.last_at),
					   first = COALESCE(excluded.first, sessions.first),
					   device = COALESCE(excluded.device, sessions.device),
					   tut_version = CASE WHEN excluded.ended = 1 OR sessions.ended = 0 THEN COALESCE(excluded.tut_version, sessions.tut_version) ELSE sessions.tut_version END,
					   tut_step = CASE WHEN excluded.ended = 1 OR sessions.ended = 0 THEN COALESCE(excluded.tut_step, sessions.tut_step) ELSE sessions.tut_step END,
					   tut_done = CASE WHEN excluded.ended = 1 THEN excluded.tut_done ELSE sessions.tut_done END,
					   ended = MAX(sessions.ended, excluded.ended),
					   played = COALESCE(excluded.played, sessions.played),
					   reason = COALESCE(excluded.reason, sessions.reason),
					   reason_w = COALESCE(excluded.reason_w, sessions.reason_w),
					   earned = COALESCE(excluded.earned, sessions.earned),
					   spent = COALESCE(excluded.spent, sessions.spent),
					   robux = COALESCE(excluded.robux, sessions.robux),
					   level = COALESCE(excluded.level, sessions.level),
					   summary = COALESCE(excluded.summary, sessions.summary),
					   rseq = MAX(COALESCE(sessions.rseq, 0), excluded.rseq),
					   score = excluded.score, tags = excluded.tags, top_text = excluded.top_text, pts = excluded.pts,
					   track = COALESCE(excluded.track, sessions.track), look = COALESCE(excluded.look, sessions.look),
					   near = COALESCE(excluded.near, sessions.near)`,
				)
				.bind(
					id, user, str(s.name, 40), str(s.display, 60), str(body.server, 60), num(body.version), body.studio ? 1 : 0, body.private ? 1 : 0,
					start, now, end ? bool(end.first) ?? bool(meta.first) : bool(meta.first), (end && str(end.device, 16)) || str(meta.device, 16),
					end ? str(endTut.version, 8) : str(tut?.v, 8), end ? num(endTut.step) : num(tut?.s), end ? bool(endTut.done) : null,
					end ? 1 : 0, end ? num(end.played) : null, end ? str(top.t, 240) : null, end ? num(top.w) : null,
					end ? num(end.earned) : null, end ? num(end.spent) : null, end ? num(end.robux) : null, end ? num(end.level) : null,
					end ? JSON.stringify(end).slice(0, 200000) : null,
					Math.max(seq, old?.rseq ?? 0), signals.reduce((a, p) => a + (p[8] ?? 0), 0) || null,
					signals.length ? [...new Set(signals.map((p) => p[7]))].join(",") : null, heaviest ? heaviest[3] : null,
					pts.length ? JSON.stringify(pts) : null, blobs.track, blobs.look, blobs.near,
				),
		);
		sessions += 1;
		if (lines.length > 0) {
			lineCount += lines.length;
			chunkRows.push([id, seq, lines.length, await gzip(JSON.stringify(encodeLines(lines)))]);
		}
	}
	// (a session's lines: one chunk a send, no index; a few sends in one statement)
	for (let i = 0; i < chunkRows.length; i += 25) {
		const part = chunkRows.slice(i, i + 25);
		statements.push(
			db
				.prepare(`INSERT OR REPLACE INTO chunks (session_id, seq, n, data) VALUES ${part.map((_, r) => `(?${r * 4 + 1}, ?${r * 4 + 2}, ?${r * 4 + 3}, ?${r * 4 + 4})`).join(", ")}`)
				.bind(...part.flat()),
		);
	}
	let rows = 0;
	if (statements.length > 0) {
		rows = rowsWritten(await db.batch(statements));
		await countWrites(db, rows).run();
	}
	const sample = sampleFor(written + rows, budget);
	return json({ ok: true, sessions, lines: lineCount, rows, skip: [...skip], sample });
}

/* ---------- a session's map points and signals, kept in its row as JSON (2026-11-12) ----------
   [q, at, kind, text, x, y, z, tag, w, target]: the lines worth seeing on the map (POINT_KINDS, with where it happened)
   and every signal (even with no place: they count for the review list). */
type Pt = [number, number, string, string, number, number, number, string | null, number | null, string | null];
const MAX_PTS = 900; // a session's points at most
function pointsOf(lines: Line[]): Pt[] {
	const out: Pt[] = [];
	for (const line of lines) {
		if (!line.k || !POINT_KINDS.has(line.k) || num(line.q) === null) continue;
		const signal = line.k === "señal";
		const p = Array.isArray(line.p) && line.p.length === 3 ? line.p : null;
		if (!p && !signal) continue;
		out.push([
			line.q, num(line.t) ?? 0, line.k, str(line.s, 240) ?? "", num(p?.[0]) ?? 0, num(p?.[1]) ?? 0, num(p?.[2]) ?? 0,
			signal ? str(line.g, 16) : null, signal ? (num(line.w) ?? 1) : null, signal ? str(line.o, 120) : null,
		]);
	}
	return out;
}

// Every point since ?1 as rows: the old ones (table points, sessions before 2026-11-12) and the new ones (sessions.pts).
// `who` narrows both to one player (bound as ?2).
function allPoints(who = false): string {
	const j = (i: number) => `json_extract(j.value, '$[${i}]')`;
	return `SELECT session_id, q, at, kind, text, x, y, z, started_at, tag, w, target FROM points
		  WHERE started_at >= ?1 ${who ? "AND session_id IN (SELECT id FROM sessions WHERE user_id = ?2)" : ""}
		UNION ALL
		SELECT s.id, ${j(0)}, ${j(1)}, ${j(2)}, ${j(3)}, ${j(4)}, ${j(5)}, ${j(6)}, s.started_at, ${j(7)}, ${j(8)}, ${j(9)}
		  FROM sessions s, json_each(s.pts) j WHERE s.started_at >= ?1 AND s.pts IS NOT NULL ${who ? "AND s.user_id = ?2" : ""}`;
}
// A session's signals' score: its row's (new) plus its old points' (sessions from before 2026-11-12)
const SCORE_OF = (s: string) =>
	`(COALESCE(${s}.score, 0) + COALESCE((SELECT SUM(op.w) FROM points op WHERE op.session_id = ${s}.id AND op.tag IS NOT NULL), 0))`;
const TAGS_OF = (s: string) =>
	`COALESCE(${s}.tags, (SELECT GROUP_CONCAT(DISTINCT op.tag) FROM points op WHERE op.session_id = ${s}.id AND op.tag IS NOT NULL))`;
// Every sessions column but the heavy ones (points JSON, replay samples)
const SESSION_COLS = `id, user_id, name, display, server_id, place_version, studio, private, started_at, last_at, ended, first, device,
	played, reason, reason_w, earned, spent, robux, level, tut_version, tut_step, tut_done, summary, reviewed, packed, score, tags, top_text`;

/* ---------- reading ---------- */
async function sessionList(url: URL, env: Env): Promise<Response> {
	const where: string[] = [];
	const args: unknown[] = [];
	const days = Number(url.searchParams.get("days") || "7");
	if (days > 0) {
		where.push("started_at >= ?");
		args.push(Date.now() / 1000 - days * 86400);
	}
	const before = Number(url.searchParams.get("before") || "0");
	if (before > 0) {
		where.push("started_at < ?");
		args.push(before);
	}
	const user = url.searchParams.get("user");
	if (user) {
		where.push("user_id = ?");
		args.push(Number(user));
	}
	const version = url.searchParams.get("version");
	if (version) {
		where.push("place_version = ?");
		args.push(Number(version));
	}
	const first = url.searchParams.get("first");
	if (first === "1" || first === "0") {
		where.push("first = ?");
		args.push(Number(first));
	}
	const reason = url.searchParams.get("reason_w");
	if (reason) {
		where.push("reason_w = ? AND ended = 1");
		args.push(Number(reason));
	}
	const device = url.searchParams.get("device");
	if (device) {
		where.push("device = ?");
		args.push(device);
	}
	const q = url.searchParams.get("q");
	if (q) {
		where.push("(name LIKE ? OR display LIKE ? OR reason LIKE ?)");
		args.push(`%${q}%`, `%${q}%`, `%${q}%`);
	}
	if (url.searchParams.get("studio") !== "1") where.push("studio = 0");
	const limit = Math.min(Number(url.searchParams.get("limit") || "60"), 300);
	const sql = `SELECT id, user_id, name, display, studio, private, started_at, last_at, ended, first, device, played, reason, reason_w,
		earned, spent, robux, level, tut_version, tut_step, tut_done
		FROM sessions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY started_at DESC LIMIT ${limit}`;
	const { results } = await env.DB.prepare(sql).bind(...args).all();
	return json({ now: Date.now() / 1000, live: LIVE_SECONDS, sessions: results });
}

async function sessionDetail(id: string, env: Env): Promise<Response> {
	const session = await env.DB.prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE id = ?`).bind(id).first<any>();
	if (!session) return json({ error: "no_session" }, 404);
	const { results } = await env.DB.prepare(`SELECT seq, data FROM chunks WHERE session_id = ? ORDER BY seq`).bind(id).all<any>();
	const chunks: Line[][] = [];
	for (const chunk of results) chunks.push(await readChunk(chunk.data));
	const lines = mergeLines(chunks);
	const summary = session.summary ? JSON.parse(session.summary) : null;
	delete session.summary;
	const others = await env.DB.prepare(`SELECT id, started_at, played, ended FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 20`)
		.bind(session.user_id)
		.all();
	return json({ now: Date.now() / 1000, live: LIVE_SECONDS, session, summary, lines, others: others.results });
}

/* ---------- game versions (2026-11-11, the user: "ver los logs separados por version de juego y ver cuanto duro
   publicada esa version, despues de 7 dias que no sea esa version todos los logs de esa version se borran, pero te avisa
   ... boton para descargar ... borrar los logs de una version ... Lock para que no se borre"). A version is live from its
   first session till the next version's first; KEEP_VERSION_DAYS after that its logs go by themselves (the cron, a few
   sessions a minute), unless it's locked. */
const KEEP_VERSION_DAYS = 7;
const EXPORT_PAGE = 6; // sessions a download page (each one's lines unpacked here: the free plan's CPU time is short)
const RETIRE_SESSIONS = 15; // sessions deleted a minute while a version's going

async function versionRows(env: Env): Promise<any[]> {
	const db = env.DB;
	const [live, flags] = await db.batch([
		db.prepare(
			`SELECT place_version AS version, MIN(started_at) AS first_at, MAX(last_at) AS last_at, COUNT(*) AS sessions,
			   COUNT(DISTINCT user_id) AS players, SUM(first = 1) AS firsts, SUM(first = 1 AND tut_done = 1) AS tut_done,
			   AVG(played) AS avg_played
			 FROM sessions WHERE studio = 0 AND place_version IS NOT NULL AND place_version > 0 GROUP BY place_version`,
		),
		db.prepare(`SELECT * FROM version_flags`),
	]);
	const byVersion = new Map<number, any>();
	for (const r of live.results as any[]) byVersion.set(r.version, { ...r, locked: 0, deleting: 0, deleted_at: null });
	for (const f of flags.results as any[]) {
		const row = byVersion.get(f.version);
		if (row) Object.assign(row, { locked: f.locked, deleting: f.deleting, deleted_at: f.deleted_at });
		else if (f.deleted_at) byVersion.set(f.version, { ...f, firsts: null, tut_done: null, avg_played: null });
	}
	const rows = [...byVersion.values()].sort((a, b) => (a.first_at ?? 0) - (b.first_at ?? 0));
	const now = Date.now() / 1000;
	rows.forEach((row, i) => {
		const next = rows[i + 1];
		row.live_until = row.deleted_at && row.live_until ? row.live_until : next ? next.first_at : null; // null: the game's version now
		row.current = !next;
		row.delete_at = row.live_until && !row.locked && !row.deleted_at ? row.live_until + KEEP_VERSION_DAYS * 86400 : null;
		row.due = row.delete_at != null && row.delete_at <= now;
	});
	return rows.reverse();
}

async function versions(env: Env): Promise<Response> {
	return json({ now: Date.now() / 1000, keepDays: KEEP_VERSION_DAYS, versions: await versionRows(env) });
}

async function versionFlag(version: number, req: Request, env: Env): Promise<Response> {
	const body: any = await req.json().catch(() => ({}));
	const db = env.DB;
	if (body.action === "lock" || body.action === "unlock") {
		await db
			.prepare(`INSERT INTO version_flags (version, locked) VALUES (?1, ?2) ON CONFLICT(version) DO UPDATE SET locked = excluded.locked`)
			.bind(version, body.action === "lock" ? 1 : 0)
			.run();
		await countWrites(db, 2).run();
		return json({ ok: true });
	}
	if (body.action === "delete") {
		const row = (await versionRows(env)).find((r) => r.version === version);
		if (!row || row.deleted_at) return json({ error: "No hay logs de esa versión" }, 404);
		if (row.current) return json({ error: "Es la versión del juego ahora: no se borra" }, 400);
		await db
			.prepare(
				`INSERT INTO version_flags (version, locked, deleting, first_at, last_at, live_until, sessions, players)
				 VALUES (?1, 0, 1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(version) DO UPDATE SET locked = 0, deleting = 1, first_at = ?2,
				 last_at = ?3, live_until = ?4, sessions = ?5, players = ?6`,
			)
			.bind(version, row.first_at, row.last_at, row.live_until, row.sessions, row.players)
			.run();
		await countWrites(db, 2).run();
		return json({ ok: true, deleting: true });
	}
	return json({ error: "action" }, 400);
}

// One page of a version's download: EXPORT_PAGE sessions, each as its page here (its summary, all its lines) with its map
// points, oldest first. `after`: where the last page ended ("<started_at>:<id>"); next: the same for the next one, "" at the end
async function versionExport(version: number, url: URL, env: Env): Promise<Response> {
	const db = env.DB;
	const [afterAt, afterId] = (url.searchParams.get("after") || "0:").split(":");
	const { results } = await db
		.prepare(
			`SELECT ${SESSION_COLS}, pts FROM sessions WHERE place_version = ?1 AND studio = 0 AND (started_at > ?2 OR (started_at = ?2 AND id > ?3))
			 ORDER BY started_at, id LIMIT ${EXPORT_PAGE}`,
		)
		.bind(version, Number(afterAt) || 0, afterId || "")
		.all<any>();
	const sessions = [];
	for (const session of results) {
		const [chunks, pts] = await db.batch([
			db.prepare(`SELECT seq, data FROM chunks WHERE session_id = ? ORDER BY seq`).bind(session.id),
			db.prepare(`SELECT q, at, kind, text, x, y, z, tag, w, target FROM points WHERE session_id = ? ORDER BY q`).bind(session.id),
		]);
		const parts: Line[][] = [];
		for (const chunk of chunks.results as any[]) parts.push(await readChunk(chunk.data));
		const summary = session.summary ? JSON.parse(session.summary) : null;
		const own: Pt[] = session.pts ? JSON.parse(session.pts) : [];
		delete session.summary;
		delete session.pts;
		const points = [
			...(pts.results as any[]),
			...own.map(([q, at, kind, text, x, y, z, tag, w, target]) => ({ q, at, kind, text, x, y, z, tag, w, target })),
		];
		sessions.push({ session, summary, lines: mergeLines(parts), points });
	}
	const last = results[results.length - 1];
	const next = results.length === EXPORT_PAGE && last ? `${last.started_at}:${last.id}` : "";
	return json({ version, sessions, next });
}

// (the cron) Versions due go by themselves (not locked); one going loses RETIRE_SESSIONS sessions a minute, the version's
// row kept at the end (when it was live, how many there were)
async function retire(env: Env, tally: { rows: number }): Promise<string> {
	const db = env.DB;
	let going = await db.prepare(`SELECT version FROM version_flags WHERE deleting = 1 LIMIT 1`).first<any>();
	if (!going) {
		// (which versions are due reads every session: every half hour, not every minute; D1 free reads 5M rows a day)
		if (new Date().getUTCMinutes() % 30 !== 0) return "versions: checked on the half hour";
		const due = (await versionRows(env)).find((r) => r.due && !r.deleting);
		if (!due) return "versions: nothing to delete";
		tally.rows += rowsWritten([
			await db
				.prepare(
					`INSERT INTO version_flags (version, locked, deleting, first_at, last_at, live_until, sessions, players)
					 VALUES (?1, 0, 1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(version) DO UPDATE SET deleting = 1, first_at = ?2,
					 last_at = ?3, live_until = ?4, sessions = ?5, players = ?6`,
				)
				.bind(due.version, due.first_at, due.last_at, due.live_until, due.sessions, due.players)
				.run(),
		]);
		going = { version: due.version };
	}
	const { results } = await db
		.prepare(`SELECT id FROM sessions WHERE place_version = ?1 LIMIT ${RETIRE_SESSIONS}`)
		.bind(going.version)
		.all<any>();
	if (!results.length) {
		tally.rows += rowsWritten([
			await db.prepare(`UPDATE version_flags SET deleting = 0, deleted_at = ?2 WHERE version = ?1`).bind(going.version, Date.now() / 1000).run(),
		]);
		return `versions: ${going.version} all deleted`;
	}
	const ids = results.map((r: any) => r.id);
	const marks = ids.map(() => "?").join(",");
	tally.rows += rowsWritten(
		await db.batch([
			db.prepare(`DELETE FROM chunks WHERE session_id IN (${marks})`).bind(...ids),
			db.prepare(`DELETE FROM points WHERE session_id IN (${marks})`).bind(...ids),
			db.prepare(`DELETE FROM tracks WHERE session_id IN (${marks})`).bind(...ids),
			db.prepare(`DELETE FROM sessions WHERE id IN (${marks})`).bind(...ids),
		]),
	);
	return `versions: ${going.version} -${ids.length} sessions`;
}

// The tutorial funnel: every first-time session in the period (still playing ones too, on the step they're on now), with
// why it ended and its signals; the dashboard works out the steps
async function funnel(url: URL, env: Env): Promise<Response> {
	const days = Math.min(Math.max(Number(url.searchParams.get("days") || "7"), 0.04), 90);
	const studio = url.searchParams.get("studio") === "1" ? "" : "AND s.studio = 0";
	const { results } = await env.DB.prepare(
		`SELECT s.id, s.user_id, s.name, s.display, s.started_at, s.last_at, s.ended, s.device, s.played, s.reason, s.reason_w,
		   s.tut_version, s.tut_step, s.tut_done, s.reviewed,
		   json_extract(s.summary, '$.tutorial.name') AS step_name, json_extract(s.summary, '$.tutorial.total') AS total,
		   json_extract(s.summary, '$.tutorial.inStep') AS in_step, ${SCORE_OF("s")} AS score, ${TAGS_OF("s")} AS tags
		 FROM sessions s WHERE s.first = 1 AND s.started_at >= ?1 ${studio} ORDER BY s.started_at DESC LIMIT 5000`,
	)
		.bind(Date.now() / 1000 - days * 86400)
		.all();
	return json({ now: Date.now() / 1000, live: LIVE_SECONDS, sessions: results });
}

// Where each session ended (its "Se salió del juego" line) with why they left: the exits' heat map
async function exits(url: URL, env: Env): Promise<Response> {
	const days = Math.min(Math.max(Number(url.searchParams.get("days") || "7"), 0.04), 90);
	const studio = url.searchParams.get("studio") === "1" ? "" : "AND s.studio = 0";
	const { results } = await env.DB.prepare(
		`WITH p AS (${allPoints()})
		 SELECT p.session_id, p.q, p.at, p.x, p.y, p.z, p.started_at, s.reason, s.reason_w, s.name, s.display, s.first, s.user_id
		 FROM p JOIN sessions s ON s.id = p.session_id
		 WHERE p.kind = 'servidor' AND p.text LIKE 'Se salió%' AND NOT (p.x = 0 AND p.y = 0 AND p.z = 0) ${studio}
		 ORDER BY p.started_at DESC LIMIT 10000`,
	)
		.bind(Date.now() / 1000 - days * 86400)
		.all();
	return json({ exits: results });
}

async function points(url: URL, env: Env): Promise<Response> {
	const days = Number(url.searchParams.get("days") || "7");
	const kinds = (url.searchParams.get("kinds") || "").split(",").filter((k) => POINT_KINDS.has(k));
	const user = url.searchParams.get("user");
	const args: unknown[] = [Date.now() / 1000 - Math.max(days, 0.01) * 86400];
	if (user) args.push(Number(user));
	const where: string[] = [];
	if (kinds.length) {
		where.push(`p.kind IN (${kinds.map((_, i) => `?${args.length + i + 1}`).join(",")})`);
		args.push(...kinds);
	}
	const q = url.searchParams.get("q");
	if (q) {
		args.push(`%${q}%`);
		where.push(`p.text LIKE ?${args.length}`);
	}
	where.push("NOT (p.x = 0 AND p.y = 0 AND p.z = 0)");
	if (url.searchParams.get("studio") !== "1") where.push("s.studio = 0");
	const limit = Math.min(Number(url.searchParams.get("limit") || "5000"), 20000);
	const { results } = await env.DB.prepare(
		`WITH p AS (${allPoints(!!user)})
		 SELECT p.session_id, p.q, p.at, p.kind, p.text, p.x, p.y, p.z, p.started_at, p.tag, s.name, s.display, s.first, s.user_id
		 FROM p JOIN sessions s ON s.id = p.session_id WHERE ${where.join(" AND ")} ORDER BY p.started_at DESC LIMIT ${limit}`,
	)
		.bind(...args)
		.all();
	return json({ points: results });
}

async function stats(url: URL, env: Env): Promise<Response> {
	const days = Math.min(Math.max(Number(url.searchParams.get("days") || "7"), 1), 90);
	const studio = url.searchParams.get("studio") === "1" ? "" : "AND studio = 0";
	const since = Date.now() / 1000 - days * 86400;
	const offset = Number(url.searchParams.get("tz") || "0"); // minutes east of UTC, for days in the viewer's time
	const db = env.DB;
	const [daily, reasons, funnel, devices, live, totals, counters] = await db.batch([
		db
			.prepare(
				`SELECT date(started_at + ?2 * 60, 'unixepoch') AS day, COUNT(*) AS sessions, COUNT(DISTINCT user_id) AS players,
				   SUM(first = 1) AS firsts, AVG(played) AS avg_played, SUM(robux) AS robux
				 FROM sessions WHERE started_at >= ?1 ${studio} GROUP BY day ORDER BY day`,
			)
			.bind(since, offset),
		db
			.prepare(
				`SELECT reason_w AS w, COUNT(*) AS n, MAX(reason) AS sample, SUM(first = 1) AS firsts FROM sessions
				 WHERE started_at >= ?1 AND ended = 1 ${studio} GROUP BY reason_w ORDER BY n DESC LIMIT 12`,
			)
			.bind(since),
		db
			.prepare(
				`SELECT tut_version AS version, tut_step AS step, tut_done AS done, COUNT(*) AS n,
				   MAX(json_extract(summary, '$.tutorial.name')) AS name, MAX(json_extract(summary, '$.tutorial.total')) AS total FROM sessions
				 WHERE started_at >= ?1 AND ended = 1 AND first = 1 ${studio} GROUP BY tut_version, tut_step, tut_done ORDER BY tut_version, tut_step`,
			)
			.bind(since),
		db.prepare(`SELECT device, COUNT(*) AS n FROM sessions WHERE started_at >= ?1 ${studio} GROUP BY device ORDER BY n DESC`).bind(since),
		db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE ended = 0 AND last_at >= ?1 ${studio}`).bind(Date.now() / 1000 - LIVE_SECONDS),
		db
			.prepare(
				`SELECT COUNT(*) AS sessions, COUNT(DISTINCT user_id) AS players, SUM(first = 1) AS firsts, AVG(played) AS avg_played,
				   SUM(tut_done = 1 AND first = 1) AS tut_done, SUM(robux) AS robux, SUM(earned) AS earned
				 FROM sessions WHERE started_at >= ?1 ${studio}`,
			)
			.bind(since),
		db.prepare(`SELECT name, n FROM counters WHERE name IN ('deleted_profiles', 'deleted_sessions')`),
	]);
	const roblox = await playingNow(env);
	return json({
		days,
		daily: daily.results,
		reasons: reasons.results,
		funnel: funnel.results,
		devices: devices.results,
		// (the game sends a session when it ends now, 2026-11-12: who's playing comes from Roblox, the sessions open as before)
		live: roblox ?? (live.results[0] as any)?.n ?? 0,
		totals: totals.results[0] ?? {},
		dbBytes: (totals.meta as any)?.size_after ?? null, // (the free plan holds 500 MB a database)
		deleted: Object.fromEntries(counters.results.map((r: any) => [r.name, r.n])),
		writes: await (async () => {
			const budget = budgetOf(env);
			const written = await writtenToday(env.DB);
			return { written, total: budget.total, ingest: budget.ingest, sample: sampleFor(written, budget), resets: untilTomorrow() };
		})(),
	});
}

// Sessions worth watching: the most signals (weighted) first, the ones already marked reviewed left out
async function review(url: URL, env: Env): Promise<Response> {
	const days = Math.min(Math.max(Number(url.searchParams.get("days") || "7"), 0.04), 90);
	const args: unknown[] = [Date.now() / 1000 - days * 86400];
	let extra = "";
	const tag = url.searchParams.get("tag");
	if (tag) {
		extra += " AND p.tag = ?2";
		args.push(tag);
	}
	if (url.searchParams.get("all") !== "1") extra += " AND COALESCE(s.reviewed, 0) = 0";
	if (url.searchParams.get("studio") !== "1") extra += " AND s.studio = 0";
	const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "200"), 1), 500);
	const { results } = await env.DB.prepare(
		`WITH p AS (${allPoints()})
		 SELECT s.id, s.user_id, s.name, s.display, s.started_at, s.last_at, s.ended, s.first, s.device, s.played, s.reason,
		   s.tut_version, s.tut_step, s.tut_done, s.reviewed,
		   SUM(p.w) AS score, COUNT(*) AS signals, GROUP_CONCAT(DISTINCT p.tag) AS tags, MAX(p.w) AS top_w, p.text AS top_text
		 FROM p JOIN sessions s ON s.id = p.session_id
		 WHERE p.tag IS NOT NULL ${extra}
		 GROUP BY p.session_id ORDER BY score DESC, s.started_at DESC LIMIT ${limit}`,
	)
		.bind(...args)
		.all();
	return json({ now: Date.now() / 1000, live: LIVE_SECONDS, sessions: results });
}

// What makes people struggle most: each signal by what it was about (a button, a window, a tutorial step)
async function problems(url: URL, env: Env): Promise<Response> {
	const days = Math.min(Math.max(Number(url.searchParams.get("days") || "7"), 0.04), 90);
	const studio = url.searchParams.get("studio") === "1" ? "" : "AND s.studio = 0";
	const { results } = await env.DB.prepare(
		`WITH p AS (${allPoints()})
		 SELECT p.tag, p.target, COUNT(*) AS n, COUNT(DISTINCT p.session_id) AS sessions, SUM(p.w) AS score, MAX(p.session_id) AS example
		 FROM p JOIN sessions s ON s.id = p.session_id
		 WHERE p.tag IS NOT NULL ${studio}
		 GROUP BY p.tag, p.target ORDER BY score DESC LIMIT 200`,
	)
		.bind(Date.now() / 1000 - days * 86400)
		.all();
	return json({ problems: results });
}

// Players: one row each, newest first, searchable by name or UserId
async function players(url: URL, env: Env): Promise<Response> {
	const days = Number(url.searchParams.get("days") || "30");
	const where = ["s.started_at >= ?1"];
	const args: unknown[] = [Date.now() / 1000 - Math.max(days, 0.04) * 86400];
	const q = (url.searchParams.get("q") || "").trim();
	if (q) {
		if (/^\d+$/.test(q)) {
			where.push("(s.user_id = ?2 OR s.name LIKE ?3)");
			args.push(Number(q), `%${q}%`);
		} else {
			where.push("(s.name LIKE ?2 OR s.display LIKE ?2)");
			args.push(`%${q}%`);
		}
	}
	if (url.searchParams.get("studio") !== "1") where.push("s.studio = 0");
	const { results } = await env.DB.prepare(
		`SELECT s.user_id, MAX(s.name) AS name, MAX(s.display) AS display, COUNT(*) AS sessions,
		   SUM(COALESCE(s.played, s.last_at - s.started_at)) AS seconds, MIN(s.started_at) AS first_seen, MAX(s.started_at) AS last_seen,
		   MAX(s.level) AS level, SUM(COALESCE(s.robux, 0)) AS robux, MAX(s.first) AS was_new,
		   (SELECT SUM(${SCORE_OF("x")}) FROM sessions x WHERE x.user_id = s.user_id) AS score
		 FROM sessions s WHERE ${where.join(" AND ")} GROUP BY s.user_id ORDER BY last_seen DESC LIMIT 150`,
	)
		.bind(...args)
		.all();
	return json({ now: Date.now() / 1000, players: results });
}

// One player: every session (with its signals' score), totals, and their signals
async function player(userId: number, env: Env): Promise<Response> {
	const db = env.DB;
	const [sessions, signals] = await db.batch([
		db
			.prepare(
				`SELECT s.id, s.name, s.display, s.studio, s.started_at, s.last_at, s.ended, s.first, s.device, s.played, s.reason, s.reason_w,
				   s.earned, s.spent, s.robux, s.level, s.tut_version, s.tut_step, s.tut_done, s.reviewed, ${SCORE_OF("s")} AS score
				 FROM sessions s WHERE s.user_id = ?1 ORDER BY s.started_at DESC LIMIT 200`,
			)
			.bind(userId),
		db
			.prepare(
				`WITH p AS (${allPoints(true)})
				 SELECT p.session_id, p.q, p.at, p.tag, p.w, p.text, p.target, p.started_at FROM p
				 WHERE p.tag IS NOT NULL ORDER BY p.started_at DESC, p.at DESC LIMIT 200`,
			)
			.bind(0, userId),
	]);
	if (sessions.results.length === 0) return json({ error: "no_player" }, 404);
	return json({ now: Date.now() / 1000, live: LIVE_SECONDS, userId, sessions: sessions.results, signals: signals.results });
}

// Players in the game right now, from Roblox (its public games API; cached a minute): null when it can't say
async function playingNow(env: Env): Promise<number | null> {
	const universe = env.UNIVERSE_ID;
	if (!universe || !/^\d+$/.test(universe)) return null;
	const cache = caches.default;
	const key = new Request(`https://cache.local/playing/${universe}`);
	const hit = await cache.match(key);
	if (hit) return Number(await hit.text());
	try {
		const answer = await fetch(`https://games.roblox.com/v1/games?universeIds=${universe}`);
		const playing = ((await answer.json()) as any)?.data?.[0]?.playing;
		if (typeof playing !== "number") return null;
		await cache.put(key, new Response(String(playing), { headers: { "cache-control": "public, max-age=60" } }));
		return playing;
	} catch {
		return null;
	}
}

/* Faces (2026-11-12, the user: "muchos perfiles no cargan el headshot icon"): a page asked Roblox for each one apart, 30+ at
   once, and some came back refused or not drawn yet. Now the page asks for all its faces in one go (GET /api/faces?ids=...,
   100 at most): one call to Roblox for the ones not cached, each finished one cached a day; the ones Roblox is still
   drawing come back null and the page asks again a moment later. */
async function faces(url: URL, ctx: ExecutionContext): Promise<Response> {
	const ids = [...new Set((url.searchParams.get("ids") || "").split(",").filter((id) => /^\d{1,15}$/.test(id)))].slice(0, 100);
	const cache = caches.default;
	const out: Record<string, string | null> = {};
	const missing: string[] = [];
	await Promise.all(
		ids.map(async (id) => {
			const hit = await cache.match(new Request(`https://cache.local/face/${id}`));
			if (hit) out[id] = await hit.text();
			else missing.push(id);
		}),
	);
	if (missing.length) {
		const answer = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${missing.join(",")}&size=150x150&format=Png&isCircular=false`).catch(() => null);
		const data = (await answer?.json().catch(() => null)) as any;
		for (const id of missing) out[id] = null;
		for (const item of data?.data || []) {
			const id = String(item.targetId);
			if (item.state === "Completed" && item.imageUrl) {
				out[id] = item.imageUrl;
				ctx.waitUntil(cache.put(new Request(`https://cache.local/face/${id}`), new Response(item.imageUrl, { headers: { "cache-control": "public, max-age=86400" } })));
			} else if (item.state === "Blocked") out[id] = ""; // (a face Roblox won't show: the page leaves the blank one)
		}
	}
	return json({ faces: out });
}

async function avatar(userId: string, ctx: ExecutionContext): Promise<Response> {
	if (!/^\d{1,15}$/.test(userId)) return new Response("bad id", { status: 400 });
	const cache = caches.default;
	const key = new Request(`https://cache.local/avatar/${userId}`);
	const hit = await cache.match(key);
	if (hit) return hit;
	const answer = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`);
	const data = (await answer.json().catch(() => null)) as any;
	const image = data?.data?.[0]?.imageUrl;
	if (!image) return new Response("no image", { status: 404 });
	const response = Response.redirect(image, 302);
	const cached = new Response(null, { status: 302, headers: { location: image, "cache-control": "public, max-age=86400" } });
	ctx.waitUntil(cache.put(key, cached));
	return response;
}

// A game image (a TELEPORTS place's photo, for the map's zones): Roblox's thumbnail of that asset, cached a day
async function assetImage(assetId: string, ctx: ExecutionContext): Promise<Response> {
	if (!/^\d{1,20}$/.test(assetId)) return new Response("bad id", { status: 400 });
	const cache = caches.default;
	const key = new Request(`https://cache.local/asset/${assetId}`);
	const hit = await cache.match(key);
	if (hit) return hit;
	const answer = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&returnPolicy=PlaceHolder&size=768x432&format=Png&isCircular=false`);
	const data = (await answer.json().catch(() => null)) as any;
	const found = data?.data?.[0];
	if (!found?.imageUrl) return new Response("no image", { status: 404 });
	// (only a finished one is kept: Roblox answers "Pending" with a placeholder the first time it's asked for a size)
	if (found.state === "Completed") {
		const cached = new Response(null, { status: 302, headers: { location: found.imageUrl, "cache-control": "public, max-age=86400" } });
		ctx.waitUntil(cache.put(key, cached.clone()));
	}
	return Response.redirect(found.imageUrl, 302);
}

/* ---------- erasing a player (dashboard, or Roblox's right-to-erasure webhook) ---------- */
async function erase(userId: number, env: Env): Promise<number> {
	const { results } = await env.DB.prepare(`SELECT id FROM sessions WHERE user_id = ?`).bind(userId).all<any>();
	const db = env.DB;
	const statements: D1PreparedStatement[] = [];
	for (const row of results) {
		statements.push(db.prepare(`DELETE FROM chunks WHERE session_id = ?`).bind(row.id));
		statements.push(db.prepare(`DELETE FROM points WHERE session_id = ?`).bind(row.id));
		statements.push(db.prepare(`DELETE FROM tracks WHERE session_id = ?`).bind(row.id));
	}
	statements.push(db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId));
	await db.batch(statements);
	return results.length;
}

async function robloxWebhook(req: Request, env: Env): Promise<Response> {
	if (!env.ROBLOX_WEBHOOK_SECRET) return new Response("not set up", { status: 404 });
	const raw = await req.text();
	// roblox-signature: t=<unix>,v1=<base64 HMAC-SHA256 of "<t>.<body>">
	const header = req.headers.get("roblox-signature") || "";
	const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
	const t = Number(parts.t);
	if (!t || Math.abs(Date.now() / 1000 - t) > 600 || !parts.v1) return new Response("bad signature", { status: 401 });
	const expected = btoa(String.fromCharCode(...(await hmac(env.ROBLOX_WEBHOOK_SECRET, `${parts.t}.${raw}`))));
	if (!same(expected, parts.v1)) return new Response("bad signature", { status: 401 });
	const body = JSON.parse(raw || "{}");
	if (body.EventType === "RightToErasureRequest" && body.EventPayload?.UserId) {
		await erase(Number(body.EventPayload.UserId), env);
	}
	return new Response("ok");
}

/* ---------- for an AI (or anyone) to read fast: everything that matters in one digest, JSON or Markdown ----------
   GET /api/agent/digest?days=7&format=md|json  (header Authorization: Bearer AGENT_KEY; read only). The dashboard's
   "Copiar resumen para IA" gets the same from /api/digest with its login. */
async function digestData(days: number, env: Env) {
	const since = Date.now() / 1000 - days * 86400;
	const db = env.DB;
	const q = (sql: string) => db.prepare(sql).bind(since);
	const [totals, daily, reasons, funnelRows, funnelWhy, signals, devices, bought, tried, windows, review, exits, live] = await db.batch([
		q(`SELECT COUNT(*) AS sessions, COUNT(DISTINCT user_id) AS players, SUM(first = 1) AS firsts, ROUND(AVG(played)) AS avg_played,
		     SUM(first = 1 AND tut_done = 1) AS tut_done, SUM(robux) AS robux, SUM(earned) AS earned, SUM(spent) AS spent
		   FROM sessions WHERE started_at >= ?1 AND studio = 0`),
		q(`SELECT date(started_at, 'unixepoch') AS day, COUNT(*) AS sessions, COUNT(DISTINCT user_id) AS players, SUM(first = 1) AS firsts,
		     ROUND(AVG(played)) AS avg_played FROM sessions WHERE started_at >= ?1 AND studio = 0 GROUP BY day ORDER BY day`),
		q(`SELECT reason_w AS w, COUNT(*) AS n, SUM(first = 1) AS firsts, MAX(reason) AS example FROM sessions
		   WHERE started_at >= ?1 AND studio = 0 AND ended = 1 GROUP BY reason_w ORDER BY n DESC LIMIT 15`),
		q(`SELECT tut_version AS version, tut_step AS step, tut_done AS done, COUNT(*) AS n, MAX(json_extract(summary, '$.tutorial.name')) AS name,
		     MAX(json_extract(summary, '$.tutorial.total')) AS total, ROUND(AVG(json_extract(summary, '$.tutorial.inStep'))) AS avg_in_step
		   FROM sessions WHERE started_at >= ?1 AND studio = 0 AND ended = 1 AND first = 1 GROUP BY 1, 2, 3 ORDER BY 1, 2`),
		q(`SELECT tut_version AS version, tut_step AS step, MAX(reason) AS example, reason_w AS w, COUNT(*) AS n FROM sessions
		   WHERE started_at >= ?1 AND studio = 0 AND ended = 1 AND first = 1 AND COALESCE(tut_done, 0) = 0 GROUP BY 1, 2, 4 ORDER BY 1, 2, n DESC`),
		q(`WITH p AS (${allPoints()}) SELECT p.tag, p.target, COUNT(*) AS n, COUNT(DISTINCT p.session_id) AS sessions FROM p JOIN sessions s ON s.id = p.session_id
		   WHERE p.tag IS NOT NULL AND s.studio = 0 GROUP BY p.tag, p.target ORDER BY sessions DESC, n DESC LIMIT 25`),
		q(`SELECT device, COUNT(*) AS n, ROUND(AVG(played)) AS avg_played, ROUND(AVG(json_extract(summary, '$.fps'))) AS fps,
		     ROUND(AVG(json_extract(summary, '$.ping'))) AS ping FROM sessions WHERE started_at >= ?1 AND studio = 0 GROUP BY device ORDER BY n DESC`),
		q(`SELECT json_extract(b.value, '$.n') AS item, json_extract(b.value, '$.g') AS grp, COUNT(*) AS n, SUM(json_extract(b.value, '$.p')) AS cash
		   FROM sessions s, json_each(s.summary, '$.bought') b WHERE s.started_at >= ?1 AND s.studio = 0 GROUP BY item ORDER BY n DESC LIMIT 15`),
		q(`SELECT json_extract(t.value, '$.n') AS item, json_extract(t.value, '$.why') AS why, COUNT(*) AS sessions, SUM(json_extract(t.value, '$.c')) AS tries
		   FROM sessions s, json_each(s.summary, '$.tried') t WHERE s.started_at >= ?1 AND s.studio = 0 GROUP BY item, why ORDER BY sessions DESC LIMIT 15`),
		q(`SELECT json_extract(w.value, '$.name') AS window, COUNT(*) AS sessions, SUM(json_extract(w.value, '$.opens')) AS opens,
		     ROUND(AVG(json_extract(w.value, '$.seconds'))) AS avg_seconds
		   FROM sessions s, json_each(s.summary, '$.windows') w WHERE s.started_at >= ?1 AND s.studio = 0 GROUP BY window ORDER BY sessions DESC LIMIT 15`),
		q(`WITH p AS (${allPoints()}) SELECT s.id, s.name, s.first, s.played, s.reason, SUM(p.w) AS score, GROUP_CONCAT(DISTINCT p.tag) AS tags
		   FROM p JOIN sessions s ON s.id = p.session_id WHERE p.tag IS NOT NULL AND s.studio = 0
		   GROUP BY p.session_id ORDER BY score DESC LIMIT 10`),
		q(`WITH p AS (${allPoints()}) SELECT CAST(ROUND(x / 250) * 250 AS INT) AS x, CAST(ROUND(z / 250) * 250 AS INT) AS z, COUNT(*) AS n FROM p
		   WHERE kind = 'servidor' AND text LIKE 'Se salió%' AND NOT (x = 0 AND z = 0) GROUP BY 1, 2 ORDER BY n DESC LIMIT 8`),
		db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE ended = 0 AND studio = 0 AND last_at >= ?1`).bind(Date.now() / 1000 - LIVE_SECONDS),
	]);
	return {
		days,
		generated: new Date().toISOString(),
		playingNow: (live.results[0] as any)?.n ?? 0,
		dbBytes: (totals.meta as any)?.size_after ?? null,
		totals: totals.results[0],
		daily: daily.results,
		exitReasons: reasons.results,
		tutorialFunnel: funnelRows.results,
		tutorialDropReasons: funnelWhy.results,
		signals: signals.results,
		devices: devices.results,
		bought: bought.results,
		triedAndFailed: tried.results,
		windows: windows.results,
		review: review.results,
		exitHotspots: exits.results,
	};
}

const TAG_NAMES: Record<string, string> = {
	rage: "clics de rabia", dead: "clics sin efecto", cerrar: "no podía salir de una ventana", uturn: "abrió y cerró al instante",
	alejo: "se alejó en el tutorial", lento: "mucho tiempo en un paso", atasco: "atascado", error: "error de script", salida: "se fue tras un problema",
};

function digestMarkdown(d: Awaited<ReturnType<typeof digestData>>, base: string): string {
	const t: any = d.totals || {};
	const pct = (a: number, b: number) => (b ? `${Math.round((100 * (a || 0)) / b)}%` : "—");
	const mins = (s: number | null) => (s == null ? "—" : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`);
	const table = (head: string[], rows: unknown[][]) =>
		rows.length ? [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map((c) => String(c ?? "—").replace(/\|/g, "/")).join(" | ")} |`)].join("\n") : "_(nada)_";
	const out: string[] = [];
	out.push(`# Night Wheels: analíticas de los últimos ${d.days} días`, `Generado ${d.generated} · jugando ahora: ${d.playingNow} · base de datos: ${d.dbBytes != null ? (d.dbBytes / 1048576).toFixed(1) + " MB de 500 MB" : "?"}`);
	out.push(
		`\n## Totales`,
		`- ${t.sessions ?? 0} sesiones de ${t.players ?? 0} jugadores; ${t.firsts ?? 0} nuevos (${pct(t.firsts, t.sessions)}).`,
		`- Duración media ${mins(t.avg_played)}. Terminaron el tutorial ${t.tut_done ?? 0} de ${t.firsts ?? 0} nuevos (${pct(t.tut_done, t.firsts)}).`,
		`- Robux ${t.robux ?? 0}; dinero del juego ganado $${t.earned ?? 0}, gastado $${t.spent ?? 0}.`,
	);
	out.push(`\n## Por día`, table(["día", "sesiones", "jugadores", "nuevos", "duración media"], d.daily.map((r: any) => [r.day, r.sessions, r.players, r.firsts, mins(r.avg_played)])));
	out.push(`\n## Por qué se van (motivo más probable de cada sesión; w = regla)`, table(["w", "sesiones", "de ellos nuevos", "ejemplo"], d.exitReasons.map((r: any) => [r.w, r.n, r.firsts, r.example])));
	out.push(`\n## Tutorial de los nuevos (sesiones terminadas, por paso en que quedaron)`);
	out.push(table(["versión", "paso", "terminó", "sesiones", "nombre del paso", "media en el paso"], d.tutorialFunnel.map((r: any) => [r.version, r.step, r.done ? "sí" : "no", r.n, r.name, mins(r.avg_in_step)])));
	out.push(`\n### Motivos de los que se fueron en cada paso`, table(["versión", "paso", "w", "sesiones", "ejemplo"], d.tutorialDropReasons.map((r: any) => [r.version, r.step, r.w, r.n, r.example])));
	out.push(`\n## Señales de frustración (por qué y sobre qué)`, table(["señal", "sobre", "veces", "sesiones"], d.signals.map((r: any) => [TAG_NAMES[r.tag] || r.tag, r.target, r.n, r.sessions])));
	out.push(`\n## Compras con dinero del juego`, table(["item", "grupo", "veces", "dinero"], d.bought.map((r: any) => [r.item, r.grp, r.n, r.cash])));
	out.push(`\n## Quisieron comprar y no pudieron`, table(["item", "por qué", "sesiones", "intentos"], d.triedAndFailed.map((r: any) => [r.item, r.why, r.sessions, r.tries])));
	out.push(`\n## Ventanas`, table(["ventana", "sesiones que la abrieron", "aperturas", "segundos de media"], d.windows.map((r: any) => [r.window, r.sessions, r.opens, r.avg_seconds])));
	out.push(`\n## Dispositivos`, table(["equipo", "sesiones", "duración media", "FPS medio", "ping medio"], d.devices.map((r: any) => [r.device, r.n, mins(r.avg_played), r.fps, r.ping])));
	out.push(`\n## Dónde se salen más (cuadros de 250 studs)`, table(["x", "z", "salidas"], d.exitHotspots.map((r: any) => [r.x, r.z, r.n])));
	out.push(
		`\n## Sesiones para revisar (más señales)`,
		table(["sesión", "jugador", "nuevo", "duró", "puntos", "señales", "motivo"], d.review.map((r: any) => [`${base}/#/s/${r.id}`, r.name, r.first ? "sí" : "no", mins(r.played), r.score, (r.tags || "").split(",").map((x: string) => TAG_NAMES[x] || x).join(", "), r.reason])),
	);
	out.push(`\nMás detalle: GET /api/agent/session/<id>?format=md · /api/agent/player/<userId> · /api/agent/funnel`);
	return out.join("\n");
}

function sessionMarkdown(r: any): string {
	const s = r.session, sum = r.summary;
	const quiet = new Set(["tecla", "mando", "clic", "toque", "estado"]);
	const out = [
		`# Sesión ${s.id} · ${s.display} (@${s.name}, UserId ${s.user_id})`,
		`Empezó ${new Date(s.started_at * 1000).toISOString()} · ${s.first ? "primera vez" : s.first === 0 ? "volvió" : "datos no cargaron"} · ${s.device ?? "?"} · ${s.ended ? `duró ${s.played}s` : "sin cerrar"}`,
	];
	if (sum) {
		out.push(`\n## Resumen (datos del juego)`, "```json", JSON.stringify(sum), "```");
	}
	const lines = r.lines as any[];
	out.push(`\n## Línea de tiempo (sin teclas/clics/estado; ${lines.length} líneas en total)`);
	for (const l of lines) {
		if (quiet.has(l.k)) continue;
		const at = `${Math.floor(l.t / 60)}:${String(Math.floor(l.t % 60)).padStart(2, "0")}`;
		out.push(`- ${at} [${l.k}${l.g ? ":" + l.g : ""}] ${l.s}${l.c > 1 ? ` ×${l.c}` : ""}${l.p ? ` @(${l.p.join(",")})` : ""}`);
	}
	const clicks = lines.filter((l) => l.k === "clic" || l.k === "toque");
	if (clicks.length) {
		const counts: Record<string, number> = {};
		for (const l of clicks) counts[l.s] = (counts[l.s] || 0) + (l.c || 1);
		out.push(`\n## Clics más repetidos`, ...Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `- ${n}× ${k}`));
	}
	return out.join("\n");
}

function agentAuthed(req: Request, env: Env): boolean {
	const header = req.headers.get("authorization") || "";
	return !!env.AGENT_KEY && header.startsWith("Bearer ") && same(header.slice(7), env.AGENT_KEY);
}

const markdown = (body: string) => new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });

// The read-only routes an AI uses (and the dashboard's own digest): md by default, ?format=json for the raw data
async function agentRoute(path: string, url: URL, env: Env): Promise<Response> {
	const asJson = url.searchParams.get("format") === "json";
	const base = `${url.protocol}//${url.host}`;
	if (path.endsWith("/digest")) {
		const days = Math.min(Math.max(Number(url.searchParams.get("days") || "7"), 0.04), 90);
		const data = await digestData(days, env);
		return asJson ? json(data) : markdown(digestMarkdown(data, base));
	}
	const one = path.match(/\/session\/([a-z0-9]{6,40})$/);
	if (one) {
		const res = await sessionDetail(one[1], env);
		if (asJson || !res.ok) return res;
		return markdown(sessionMarkdown(await res.json()));
	}
	const who = path.match(/\/player\/(\d{1,15})$/);
	if (who) return await player(Number(who[1]), env);
	if (path.endsWith("/funnel")) return await funnel(url, env);
	if (path.endsWith("/sessions")) return await sessionList(url, env);
	if (path.endsWith("/review")) return await review(url, env);
	if (path.endsWith("/problems")) return await problems(url, env);
	return json({ error: "not found", routes: ["digest", "session/<id>", "player/<userId>", "funnel", "sessions", "review", "problems"] }, 404);
}

/* ---------- packing: a session over becomes ONE compressed chunk (a cron, one session at a time) ---------- */
async function pack(env: Env, tally: { rows: number }): Promise<string> {
	const db = env.DB;
	// (ended a few minutes ago: a send the game retries can't come after)
	// (the last 3 days by the start index, not the whole table each minute: D1 free reads 5M rows a day; and only sessions
	// from before the one-row storage, 2026-11-12: packing a newer one's few chunks would cost more writes than it saves)
	const due = await db
		.prepare(
			`SELECT id FROM sessions WHERE started_at > ?2 AND ended = 1 AND packed = 0 AND rseq IS NULL AND last_at < ?1 ORDER BY started_at LIMIT 1`,
		)
		.bind(Date.now() / 1000 - 300, Date.now() / 1000 - 3 * 86400)
		.first<any>();
	if (!due) return "nothing to pack";
	const { results } = await db.prepare(`SELECT seq, n, data FROM chunks WHERE session_id = ? ORDER BY seq`).bind(due.id).all<any>();
	const total = results.reduce((a: number, r: any) => a + r.n, 0);
	if (results.length <= 1 || total > PACK_MAX_LINES) {
		const marked = await db.prepare(`UPDATE sessions SET packed = ?2 WHERE id = ?1`).bind(due.id, results.length <= 1 ? 1 : 2).run();
		tally.rows += rowsWritten([marked]);
		return `${due.id}: left as it is (${results.length} chunks, ${total} lines)`;
	}
	const chunks: Line[][] = [];
	for (const chunk of results) chunks.push(await readChunk(chunk.data));
	const lines = mergeLines(chunks);
	const data = await gzip(JSON.stringify(encodeLines(lines)));
	tally.rows += rowsWritten(
		await db.batch([
			db.prepare(`DELETE FROM chunks WHERE session_id = ?1`).bind(due.id),
			db.prepare(`INSERT INTO chunks (session_id, seq, n, data) VALUES (?1, 0, ?2, ?3)`).bind(due.id, lines.length, data),
			db.prepare(`UPDATE sessions SET packed = 1 WHERE id = ?1`).bind(due.id),
		]),
	);
	return `${due.id}: ${results.length} chunks → 1 (${lines.length} lines, ${data.byteLength} bytes)`;
}

/* ---------- room for the new: when the database passes STORAGE_LIMIT_MB, whole profiles go (the user, 2026-11-11:
   "borrar datos viejos lo mas viejos o los que ya cheque y solo sumar un 1 en perfiles borrados ... y registrar los
   nuevos"): reviewed ones first, then the longest since they played, never one playing now; EVICT_FREE_MB at a time.
   (SQLite keeps a file's size after deleting, reusing the room: so it only deletes again once the file has grown past
   where it was the last time.) */
const EVICT_FREE_MB = 10;
async function makeRoom(env: Env, tally: { rows: number }): Promise<string> {
	const db = env.DB;
	const limit = Number(env.STORAGE_LIMIT_MB || 450) * 1048576;
	const probe = await db.prepare(`SELECT name, n FROM counters WHERE name IN ('evict_size', 'evict_freed')`).all<any>();
	const size = (probe.meta as any)?.size_after ?? 0;
	const state = Object.fromEntries(probe.results.map((r: any) => [r.name, r.n]));
	if (size < limit || size <= (state.evict_size ?? 0)) return `room: ${(size / 1048576).toFixed(1)} MB, fine`;
	const { results: victims } = await db
		.prepare(
			`SELECT user_id, MAX(reviewed) AS reviewed, MAX(last_at) AS seen, COUNT(*) AS sessions,
			   SUM(COALESCE(length(summary), 0) + COALESCE(length(pts), 0) + COALESCE(length(track), 0) + COALESCE(length(look), 0) + COALESCE(length(near), 0)) + (SELECT COALESCE(SUM(length(c.data)), 0) FROM chunks c JOIN sessions x ON x.id = c.session_id WHERE x.user_id = s.user_id) AS bytes
			 FROM sessions s GROUP BY user_id
			 HAVING MAX(CASE WHEN ended = 0 AND last_at > ?1 THEN 1 ELSE 0 END) = 0
			 ORDER BY reviewed DESC, seen ASC LIMIT 8`,
		)
		.bind(Date.now() / 1000 - 600)
		.all<any>();
	if (!victims.length) return "room: nobody to delete";
	const statements: D1PreparedStatement[] = [];
	let freed = 0, sessions = 0;
	for (const v of victims) {
		const ids = `SELECT id FROM sessions WHERE user_id = ${Number(v.user_id)}`;
		statements.push(db.prepare(`DELETE FROM chunks WHERE session_id IN (${ids})`));
		statements.push(db.prepare(`DELETE FROM points WHERE session_id IN (${ids})`));
		statements.push(db.prepare(`DELETE FROM tracks WHERE session_id IN (${ids})`));
		statements.push(db.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(v.user_id));
		freed += v.bytes || 0;
		sessions += v.sessions;
	}
	const total = (state.evict_freed ?? 0) + freed;
	const done = total >= EVICT_FREE_MB * 1048576;
	const add = (name: string, n: number) => db.prepare(`INSERT INTO counters (name, n) VALUES (?1, ?2) ON CONFLICT(name) DO UPDATE SET n = n + excluded.n`).bind(name, n);
	statements.push(add("deleted_profiles", victims.length), add("deleted_sessions", sessions));
	statements.push(db.prepare(`INSERT OR REPLACE INTO counters (name, n) VALUES ('evict_freed', ?1)`).bind(done ? 0 : total));
	if (done) statements.push(db.prepare(`INSERT OR REPLACE INTO counters (name, n) VALUES ('evict_size', ?1)`).bind(size));
	tally.rows += rowsWritten(await db.batch(statements));
	return `room: deleted ${victims.length} profiles (${sessions} sessions, ~${(freed / 1048576).toFixed(1)} MB)${done ? ", enough for now" : ""}`;
}

// Optional: the full lines of sessions older than KEEP_LINES_DAYS go (their summary, signals and map points stay)
// (TRIM_ROWS at a time: a minute's deletes kept small, they count as writes)
const TRIM_ROWS = 300;
async function trim(env: Env, tally: { rows: number }): Promise<void> {
	const gone = await env.DB.prepare(
		`DELETE FROM tracks WHERE (session_id, kind, seq) IN (SELECT session_id, kind, seq FROM tracks WHERE created < ?1 LIMIT ${TRIM_ROWS})`,
	)
		.bind(Date.now() / 1000 - TRACK_DAYS * 86400)
		.run();
	tally.rows += rowsWritten([gone]);
	// (2026-11-12 on: the samples live in the session's row: cleared there after TRACK_DAYS, every 10 minutes, the
	// sessions taken in order of start from where the last pass stopped, so nothing is read twice)
	if (new Date().getUTCMinutes() % 10 === 0) {
		const db = env.DB;
		const from = (await db.prepare(`SELECT n FROM counters WHERE name = 'trim_at'`).first<number>("n")) ?? 0;
		const { results } = await db
			.prepare(`SELECT id, started_at FROM sessions WHERE started_at > ?1 AND started_at < ?2 ORDER BY started_at LIMIT 500`)
			.bind(from, Date.now() / 1000 - TRACK_DAYS * 86400)
			.all<any>();
		if (results.length) {
			const ids = results.map((r: any) => r.id);
			tally.rows += rowsWritten(
				await db.batch([
					db
						.prepare(
							`UPDATE sessions SET track = NULL, look = NULL, near = NULL WHERE id IN (${ids.map(() => "?").join(",")})
							 AND (track IS NOT NULL OR look IS NOT NULL OR near IS NOT NULL)`,
						)
						.bind(...ids),
					db.prepare(`INSERT OR REPLACE INTO counters (name, n) VALUES ('trim_at', ?1)`).bind(results[results.length - 1].started_at),
				]),
			);
		}
	}
	const days = Number(env.KEEP_LINES_DAYS || 0);
	if (!(days > 0)) return;
	const old = await env.DB.prepare(`DELETE FROM chunks WHERE session_id IN (SELECT id FROM sessions WHERE started_at < ?1 LIMIT 50)`)
		.bind(Date.now() / 1000 - days * 86400)
		.run();
	tally.rows += rowsWritten([old]);
}

export default {
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(
			(async () => {
				// (maintenance: nothing, the tables may be changing)
				if ((await maintenanceLeft(env)) > 0) {
					console.log("maintenance: the cron rests");
					return;
				}
				// (the day's writes at DAILY_WRITES: nothing more till tomorrow, UTC; else what each step wrote is counted)
				const budget = budgetOf(env);
				if ((await writtenToday(env.DB)) >= budget.total) {
					console.log("writes: the day's budget is spent, the cron rests till tomorrow (UTC)");
					return;
				}
				const tally = { rows: 0 };
				try {
					console.log(await pack(env, tally));
					await trim(env, tally);
					console.log(await retire(env, tally));
					console.log(await makeRoom(env, tally));
				} finally {
					if (tally.rows > 0) await countWrites(env.DB, tally.rows).run();
				}
			})(),
		);
	},

	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(req.url);
		const path = url.pathname;
		try {
			if (path === "/health") return await health(env);
			if (path === "/admin/maintenance" && req.method === "POST") return await setMaintenance(req, env);
			if (path === "/ingest" || path === "/ingest/world") {
				// (maintenance: turned away with how long to wait; the game's servers pause and keep what they hold)
				const left = await maintenanceLeft(env);
				if (left > 0) return maintenanceAnswer(left);
			}
			if (path === "/ingest" && req.method === "POST") {
				try {
					return await ingest(req, env);
				} catch (err: any) {
					// (a failure here, e.g. mid-deploy: a few minutes' pause for the game, not a retry at once)
					console.error(path, err?.stack || err);
					return json({ error: String(err?.message || err) }, 503, { "retry-after": "120" });
				}
			}
			if (path === "/ingest/world" && req.method === "POST") return await worldUpload(req, env);
			if (path === "/roblox/webhook" && req.method === "POST") return await robloxWebhook(req, env);
			if (path === "/api/login" && req.method === "POST") return await login(req, env);
			if (path === "/api/logout" && req.method === "POST")
				return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
			if (path.startsWith("/api/agent/") && req.method === "GET") {
				// (read only, its own key: it can't ingest, erase or mark anything)
				if (!agentAuthed(req, env)) return json({ error: "agent key" }, 401);
				return await agentRoute(path, url, env);
			}
			if (path.startsWith("/api/")) {
				if (!(await authed(req, env))) return json({ error: "login" }, 401);
				if (path === "/api/me") return json({ ok: true });
				if (path === "/api/digest") return await agentRoute("/api/agent/digest", url, env);
				if (path === "/api/world") return await world(env);
				const track = path.match(/^\/api\/sessions\/([a-z0-9]{6,40})\/track$/);
				if (track) return await sessionTrack(track[1], env);
				if (path === "/api/sessions") return await sessionList(url, env);
				const one = path.match(/^\/api\/sessions\/([a-z0-9]{6,40})$/);
				if (one) return await sessionDetail(one[1], env);
				const mark = path.match(/^\/api\/sessions\/([a-z0-9]{6,40})\/reviewed$/);
				if (mark && req.method === "POST") {
					const body = (await req.json().catch(() => ({}))) as any;
					await env.DB.prepare(`UPDATE sessions SET reviewed = ?2 WHERE id = ?1`).bind(mark[1], body.reviewed === false ? 0 : 1).run();
					return json({ ok: true });
				}
				if (path === "/api/versions") return await versions(env);
				const vflag = path.match(/^\/api\/versions\/(\d{1,9})$/);
				if (vflag && req.method === "POST") return await versionFlag(Number(vflag[1]), req, env);
				const vexport = path.match(/^\/api\/versions\/(\d{1,9})\/export$/);
				if (vexport) return await versionExport(Number(vexport[1]), url, env);
				if (path === "/api/points") return await points(url, env);
				if (path === "/api/exits") return await exits(url, env);
				if (path === "/api/funnel") return await funnel(url, env);
				if (path === "/api/stats") return await stats(url, env);
				if (path === "/api/review") return await review(url, env);
				if (path === "/api/problems") return await problems(url, env);
				if (path === "/api/players") return await players(url, env);
				const who = path.match(/^\/api\/players\/(\d{1,15})$/);
				if (who) return await player(Number(who[1]), env);
				if (path === "/api/faces") return await faces(url, ctx);
				const face = path.match(/^\/api\/avatar\/(\d+)$/);
				if (face) return await avatar(face[1], ctx);
				const asset = path.match(/^\/api\/asset\/(\d+)$/);
				if (asset) return await assetImage(asset[1], ctx);
				if (path === "/api/erase" && req.method === "POST") {
					const body = (await req.json().catch(() => ({}))) as any;
					const userId = Number(body.userId);
					if (!userId) return json({ error: "userId" }, 400);
					return json({ ok: true, sessions: await erase(userId, env) });
				}
				return json({ error: "not found" }, 404);
			}
			return await env.ASSETS.fetch(req);
		} catch (err: any) {
			console.error(path, err?.stack || err);
			return json({ error: String(err?.message || err) }, 500);
		}
	},
};
