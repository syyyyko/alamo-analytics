// Alamo Analytics (for Night Wheels): players → a player → a session → a moment (timeline, map, replay). Plain JS, no
// build.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");
const tip = $("#tip");

const prefs = (() => {
	try {
		return JSON.parse(localStorage.getItem("nw-prefs") || "{}");
	} catch {
		return {};
	}
})();
const state = { days: prefs.days || 7, studio: prefs.studio || false };
function savePrefs(extra = {}) {
	try {
		localStorage.setItem("nw-prefs", JSON.stringify({ ...prefs, days: state.days, studio: state.studio, ...extra }));
	} catch {}
}

/* ---------------- language (2026-11-12, the user: "el lenguaje de la pagina ... ingles y español, por default ingles") ---------------- */
const LANG = (() => {
	try {
		return localStorage.getItem("nw-lang") === "es" ? "es" : "en";
	} catch {
		return "en";
	}
})();
const T = (en, es) => (LANG === "es" ? es : en);
document.documentElement.lang = LANG;
const LOCALE = LANG === "es" ? "es-MX" : "en-US";

/* ---------------- icons (stroke, 24 grid; no emojis) ---------------- */
const ICONS = {
	bars: '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>',
	calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
	pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
	funnel: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
	split: '<path d="M12 21v-9M12 12L5 5M12 12l7-7M5 10V5h5M19 10V5h-5"/>',
	clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
	list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
	wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2M3 10h18"/>',
	bike: '<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16l4-6h5l4 6M9.5 10L8 7H6M14.5 10l1.5-3h3"/>',
	info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
	video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>',
	alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
	check: '<path d="M4 12l5 5L20 6"/>',
	x: '<path d="M6 6l12 12M18 6L6 18"/>',
	copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
	tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
	play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
	pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
	send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
	external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
	search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
	monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
	book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
	layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
	users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
	zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
	pointer: '<path d="M5 3l14 7-6 2-2 6z"/>',
	lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
	undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
	compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
	hourglass: '<path d="M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10"/>',
	wall: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 14.5h18M9 5v5M15 10v4.5M9 14.5V19"/>',
	bug: '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M12 7V4M8 11H4M16 11h4M8 15H4M16 15h4M9 4l1 3M15 4l-1 3"/>',
	door: '<path d="M5 21V4a1 1 0 0 1 1-1h9v18M3 21h18M15 3l4 2v16"/><path d="M11 12h.01"/>',
	siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6M5 21h14v-3H5zM12 3v2M4.5 6l1.4 1.4M19.5 6l-1.4 1.4"/>',
	cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11l2-8H6"/>',
	cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
	window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
	swap: '<path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
	save: '<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v5h7M8 21v-7h8v7"/>',
	moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
	hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 16l-1-3a1.5 1.5 0 0 1 2.6-1.4L8 14"/>',
	keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
	gamepad: '<path d="M6 8h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L15 13H9l-1.6 1.8A3 3 0 0 1 2 13v-1a4 4 0 0 1 4-4z"/><path d="M7 11v3M5.5 12.5h3M16 11h.01M18 13h.01"/>',
	touch: '<path d="M9 11V5a2 2 0 0 1 4 0v6l4.5 1a2 2 0 0 1 1.5 2.3L18 20H10l-4-5a1.6 1.6 0 0 1 2.4-2.1L9 14"/>',
	flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
	burst: '<path d="M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z"/>',
	dot: '<circle cx="12" cy="12" r="4" fill="currentColor"/>',
	globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
	chevronL: '<path d="M15 18l-6-6 6-6"/>',
	chevronR: '<path d="M9 18l6-6-6-6"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

/* ---------------- words ---------------- */
const KINDS = {
	señal: { icon: "alert", en: "Signals", es: "Señales" },
	moto: { icon: "bike", en: "Bike", es: "Moto" },
	policía: { icon: "siren", en: "Police", es: "Policía" },
	compra: { icon: "cart", en: "Purchases", es: "Compras" },
	tutorial: { icon: "cap", en: "Tutorial", es: "Tutorial" },
	ventana: { icon: "window", en: "Windows", es: "Ventanas" },
	menú: { icon: "play", en: "Menu", es: "Menú" },
	teleport: { icon: "swap", en: "Teleport", es: "Teleport" },
	servidor: { icon: "door", en: "Join / leave", es: "Entrar / salir" },
	datos: { icon: "save", en: "Data", es: "Datos" },
	afk: { icon: "moon", en: "AFK", es: "AFK" },
	amigos: { icon: "users", en: "Friends", es: "Amigos" },
	prompt: { icon: "hand", en: "Prompts", es: "Prompts" },
	clic: { icon: "pointer", en: "Clicks", es: "Clics" },
	toque: { icon: "touch", en: "Taps", es: "Toques" },
	tecla: { icon: "keyboard", en: "Keys", es: "Teclas" },
	mando: { icon: "gamepad", en: "Gamepad", es: "Mando" },
	error: { icon: "bug", en: "Errors", es: "Errores" },
	estado: { icon: "pin", en: "Status", es: "Estado" },
	juego: { icon: "dot", en: "Game", es: "Juego" },
	inicio: { icon: "play", en: "Start", es: "Inicio" },
	fin: { icon: "flag", en: "End", es: "Fin" },
};
const kindName = (k) => (KINDS[k] ? KINDS[k][LANG] : k);
const kindIcon = (k) => KINDS[k]?.icon || "dot";
// map points: three colour groups only (more hues can't be told apart on a scatter)
const MAP_GROUP = { moto: "s1", policía: "s1", compra: "s2", prompt: "s2", señal: "bad", inicio: "good", fin: "s1" };
const MAP_KINDS = ["señal", "moto", "policía", "compra", "tutorial", "servidor", "teleport", "prompt", "afk", "menú"];
const TAGS = {
	rage: { icon: "zap", en: "Rage clicks", es: "Clics de rabia" },
	dead: { icon: "pointer", en: "Dead clicks", es: "Clics sin efecto" },
	cerrar: { icon: "lock", en: "Stuck in a window", es: "No podía salir de una ventana" },
	uturn: { icon: "undo", en: "Opened and closed at once", es: "Abrió y cerró al instante" },
	alejo: { icon: "compass", en: "Wandered off in the tutorial", es: "Se alejó en el tutorial" },
	lento: { icon: "hourglass", en: "Long on one step", es: "Mucho tiempo en un paso" },
	atasco: { icon: "wall", en: "Looked stuck", es: "Parecía atascado" },
	error: { icon: "bug", en: "Script error", es: "Error de script" },
	salida: { icon: "door", en: "Left after a problem", es: "Se fue tras un problema" },
};
const tagName = (t) => (TAGS[t] ? TAGS[t][LANG] : t);
const tagIcon = (t) => TAGS[t]?.icon || "alert";
const DEVICES = { PC: ["PC", "PC"], Phone: ["Phone", "Celular"], Tablet: ["Tablet", "Tablet"], Console: ["Console", "Consola"] };
const deviceName = (d) => (DEVICES[d] ? T(...DEVICES[d]) : d || "—");
// Why they left: each rule of the game's SessionReportService.Reasons (its weight is its id), a short name and its kind
const REASONS = {
	100: ["Server shut down", "El servidor se cerró", "tec"],
	99: ["Changed server", "Cambió de servidor", "otro"],
	98: ["Left while loading", "Se fue cargando", "tut"],
	90: ["Kicked for AFK", "Roblox lo sacó por AFK", "otro"],
	88: ["AFK", "AFK", "otro"],
	82: ["Cancelled a purchase", "Canceló una compra y se fue", "ui"],
	80: ["Left the menu without PLAY", "Se fue en el menú sin PLAY", "tut"],
	78: ["Left in a cutscene", "Se fue en una cinemática", "tut"],
	76: ["Left after a crash", "Se fue tras chocar", "road"],
	75: ["Left after BUSTED", "Se fue tras un BUSTED", "road"],
	72: ["Left getting on the bike", "Se fue subiéndose a la moto", "road"],
	70: ["Stuck in the tutorial", "Atorado en el tutorial", "tut"],
	69: ["Stuck in a window", "Pillado en una ventana", "ui"],
	66: ["On foot, no new bike", "A pie sin sacar otra moto", "road"],
	64: ["Never got a bike", "Nunca consiguió moto", "tut"],
	63: ["Had a bike, never rode", "Tenía moto y no la usó", "tut"],
	62: ["Their friend left", "Se fue su amigo", "otro"],
	61: ["Not enough cash", "No le alcanzó el dinero", "ui"],
	60: ["Watching a replay or race end", "Viendo repetición o final de carrera", "otro"],
	59: ["Many crashes in a row", "Muchos choques seguidos", "road"],
	58: ["Died many times", "Murió muchas veces", "road"],
	56: ["Mid race or chase", "En plena carrera o persecución", "road"],
	55: ["Long on one window", "Mirando una ventana mucho rato", "ui"],
	53: ["A window was open", "Con una ventana abierta", "ui"],
	50: ["Low FPS", "FPS bajos", "tec"],
	49: ["High lag", "Mucho lag", "tec"],
	46: ["Game minimized", "Juego minimizado", "otro"],
	45: ["Barely played", "Casi ni lo probó", "tut"],
	30: ["Alone on the server", "Solo en el servidor", "otro"],
	20: ["Long session, done", "Sesión larga, ya había terminado", "otro"],
	10: ["No clear reason", "Sin señales claras", "otro"],
};
// (three hues at most can be told apart side by side: the two calm kinds are greys)
const GROUPS = {
	tut: { en: "First steps and tutorial", es: "Primeros pasos y tutorial", fill: "var(--s1)", ink: "#fff" },
	ui: { en: "Windows and purchases", es: "Ventanas y compras", fill: "var(--s2)", ink: "#fff" },
	road: { en: "On the road", es: "En la carretera", fill: "var(--s3)", ink: "#fff" },
	tec: { en: "Technical", es: "Técnico", fill: "var(--muted)", ink: "#fff" },
	otro: { en: "Normal", es: "Normal", fill: "var(--surface-2)", ink: "var(--ink-2)" },
};
const groupName = (g) => GROUPS[g][LANG];
const reasonOf = (w, sample) => {
	const known = REASONS[w];
	return { name: known ? T(known[0], known[1]) : sample || "?", group: known ? known[2] : "otro" };
};
const ERRORS = {
	no_session: ["That session doesn't exist", "No existe esa sesión"],
	no_player: ["No sessions for that player", "No hay sesiones de ese jugador"],
	bad_password: ["Wrong password", "Contraseña incorrecta"],
};

/* ---------------- formats ---------------- */
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nf = new Intl.NumberFormat(LOCALE);
const money = (n) => (n == null ? "—" : "$" + nf.format(Math.round(n)));
const int = (n) => (n == null ? "—" : nf.format(Math.round(n)));
function dur(sec) {
	if (sec == null || !isFinite(sec)) return "—";
	sec = Math.max(0, Math.round(sec));
	if (sec < 60) return `${sec}s`;
	const m = Math.floor(sec / 60);
	if (m < 60) return `${m}m ${sec % 60}s`;
	return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function stamp(sec) {
	sec = Math.max(0, Math.floor(sec || 0));
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = String(sec % 60).padStart(2, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
const clockFmt = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const clock = (unix) => clockFmt.format(new Date(unix * 1000));
const when = (unix) => dayFmt.format(new Date(unix * 1000));
function ago(unix, now = Date.now() / 1000) {
	const d = Math.max(0, now - unix);
	if (d < 60) return T("just now", "hace un momento");
	if (d < 3600) return T(`${Math.floor(d / 60)} min ago`, `hace ${Math.floor(d / 60)} min`);
	if (d < 86400) return T(`${Math.floor(d / 3600)} h ago`, `hace ${Math.floor(d / 3600)} h`);
	return T(`${Math.floor(d / 86400)} d ago`, `hace ${Math.floor(d / 86400)} d`);
}
const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "—");

/* ---------------- faces (2026-11-12, the user: "muchos perfiles no cargan el headshot icon") ----------------
   Each <img data-face="userId"> on the page gets its picture from ONE request for all of them (/api/faces, which asks
   Roblox for up to 100 at once); one Roblox is still drawing is asked for again a moment later (a few times). */
const faceCache = new Map(); // userId → url | "" (none to show)
const faceTries = new Map();
const face = (userId, extra = "") => {
	const url = faceCache.get(String(userId));
	return `<img data-face="${userId}" ${url ? `src="${esc(url)}"` : ""} alt="" ${extra} onerror="this.dataset.bad=1;this.removeAttribute('src')"/>`;
};
let faceTimer = 0;
function loadFaces(delay = 40) {
	clearTimeout(faceTimer);
	faceTimer = setTimeout(fetchFaces, delay);
}
async function fetchFaces() {
	const imgs = $$("img[data-face]");
	const want = [...new Set(imgs.filter((img) => !img.getAttribute("src")).map((img) => img.dataset.face))].filter(
		(id) => !faceCache.has(id) && (faceTries.get(id) || 0) < 4,
	);
	for (let i = 0; i < want.length; i += 100) {
		const ids = want.slice(i, i + 100);
		ids.forEach((id) => faceTries.set(id, (faceTries.get(id) || 0) + 1));
		try {
			const r = await api("/api/faces?ids=" + ids.join(","));
			for (const [id, url] of Object.entries(r.faces || {})) if (url !== null) faceCache.set(id, url);
		} catch {}
	}
	let waiting = false;
	for (const img of $$("img[data-face]")) {
		const url = faceCache.get(img.dataset.face);
		if (url && !img.getAttribute("src") && !img.dataset.bad) img.src = url;
		else if (url === undefined && (faceTries.get(img.dataset.face) || 0) < 4) waiting = true;
	}
	if (waiting) loadFaces(2500);
}
// (the replay redraws its HUD every frame: that's not new faces)
new MutationObserver((changes) => changes.some((c) => !c.target.closest?.(".replay")) && loadFaces()).observe(app, { childList: true, subtree: true });

function toast(text) {
	const el = $("#toast");
	el.textContent = text;
	el.hidden = false;
	clearTimeout(toast.t);
	toast.t = setTimeout(() => (el.hidden = true), 2200);
}
function tpCommand(x, y, z) {
	return `/tp ${Math.round(x)} ${Math.round(y)} ${Math.round(z)}`;
}
async function copy(text, what = T("Copied", "Copiado")) {
	try {
		await navigator.clipboard.writeText(text);
		toast(`${what}: ${text}`);
	} catch {
		prompt(T("Copy this:", "Copia esto:"), text);
	}
}

/* ---------------- api ---------------- */
// A version's logs loaded from a downloaded file (Versions > Load a file): its sessions' pages are read from here, not
// the server, till the page is left or closed (nothing of it goes to the server)
let archive = null; // { version, list: [page], byId: Map }
function archiveApi(path) {
	const [p] = path.split("?");
	let m = p.match(/^\/api\/sessions\/([a-z0-9]+)$/);
	if (m && archive.byId.has(m[1])) {
		const x = archive.byId.get(m[1]);
		const others = archive.list
			.filter((o) => o.session.user_id === x.session.user_id)
			.map((o) => ({ id: o.session.id, started_at: o.session.started_at, played: o.session.played, ended: o.session.ended }));
		return { now: Date.now() / 1000, live: 90, session: x.session, summary: x.summary, lines: x.lines, others };
	}
	m = p.match(/^\/api\/sessions\/([a-z0-9]+)\/track$/);
	if (m && archive.byId.has(m[1])) throw new Error(T("The file has no recording", "El archivo no trae la grabación"));
	return null;
}
async function api(path, options = {}) {
	if (archive && !options.method) {
		const local = archiveApi(path);
		if (local) return local;
	}
	const res = await fetch(path, { credentials: "same-origin", ...options });
	if (res.status === 401) {
		showLogin();
		throw new Error("login");
	}
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const known = ERRORS[data.error];
		const err = new Error(known ? T(...known) : data.error || `HTTP ${res.status}`);
		err.status = res.status;
		throw err;
	}
	return data;
}

/* The backend being updated (tools/deploy.mjs): /health says whether it's up and whether it's in maintenance. Down: a card
   that says so and tries again by itself; in maintenance the pages still show what there is, with a note on top. */
const DOWN_RETRY = 15;
let downTimer = null;
async function health() {
	try {
		const ctrl = new AbortController();
		const stop = setTimeout(() => ctrl.abort(), 8000);
		const res = await fetch("/health", { cache: "no-store", signal: ctrl.signal });
		clearTimeout(stop);
		const data = await res.json();
		return res.ok && data.ok ? data : { down: true, why: `HTTP ${res.status}` };
	} catch (err) {
		return { down: true, why: err.name === "AbortError" ? T("no answer", "no contesta") : T("offline", "sin conexión") };
	}
}
// (a failure that's the server's, not the page's: no network, 5xx, maintenance)
const serverTrouble = (err) => err instanceof TypeError || (err.status >= 500 && err.status < 600) || err.message === "maintenance";
function showDown(why) {
	clearTimeout(downTimer);
	$("#conn").innerHTML = `<span class="dot bad"></span> ${T("Offline", "Sin conexión")}`;
	let left = DOWN_RETRY;
	app.innerHTML = `
	<div class="card down">
		<h1>${icon("alert")} ${T("The server isn't answering", "El servidor no responde")}</h1>
		<p class="muted">${T("It may be updating. The game keeps what it can meanwhile. This page retries by itself.", "Puede que se esté actualizando. Mientras, el juego guarda lo que puede. La página reintenta sola.")}</p>
		<p><span class="muted">${esc(why)} · ${T("retry in", "reintento en")} <b id="downLeft">${left}</b> s</span></p>
		<button id="downRetry">${T("Retry now", "Reintentar")}</button>
	</div>`;
	$("#downRetry").onclick = () => route();
	const tick = () => {
		left -= 1;
		const el = $("#downLeft");
		if (!el) return;
		if (left <= 0) return route();
		el.textContent = left;
		downTimer = setTimeout(tick, 1000);
	};
	downTimer = setTimeout(tick, 1000);
}
function maintenanceNote(until) {
	if (!until) return;
	const left = Math.max(0, Math.round((until - Date.now() / 1000) / 60));
	$("#conn").innerHTML = `<span class="dot warn"></span> ${T("Maintenance", "Mantenimiento")}`;
	app.insertAdjacentHTML(
		"afterbegin",
		`<div class="banner warn maint">${icon("alert")}<div><b>${T("Updating the backend", "Actualizando el backend")}</b>
		<span>${T(`Until ${clock(until)} (~${left} min). Data from this time may be missing.`, `Hasta las ${clock(until)} (~${left} min). Puede faltar lo de este rato.`)}</span></div></div>`,
	);
}
const post = (path, body) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
const qs = (obj) =>
	new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)).toString();

function showLogin() {
	$("#logout").hidden = true;
	app.innerHTML = `
	<div class="card login">
		<h1>Alamo Analytics</h1>
		<p class="muted">Night Wheels</p>
		<form id="login">
			<input type="password" name="password" placeholder="${T("Password", "Contraseña")}" autocomplete="current-password" autofocus />
			<button>${T("Sign in", "Entrar")}</button>
			<div class="err" id="err"></div>
		</form>
	</div>`;
	$("#login").onsubmit = async (e) => {
		e.preventDefault();
		const password = e.target.password.value;
		const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
		if (res.ok) route();
		else {
			const code = (await res.json().catch(() => ({}))).error;
			$("#err").textContent = ERRORS[code] ? T(...ERRORS[code]) : T("Couldn't sign in", "No se pudo entrar");
		}
	};
}

/* ---------------- pieces ---------------- */
function who(row, sub = "") {
	return `<div class="who">${face(row.user_id, 'loading="lazy"')}
		<div><b>${esc(row.display || row.name)}</b><small>@${esc(row.name)}${sub ? " · " + sub : ""}</small></div></div>`;
}
function kindBadge(row) {
	if (row.first === 1) return `<span class="badge"><span class="dot s3"></span>${T("New", "Nuevo")}</span>`;
	if (row.first === 0) return `<span class="badge"><span class="dot s1"></span>${T("Returning", "Volvió")}</span>`;
	return `<span class="badge"><span class="dot warn"></span>${T("No data", "Sin datos")}</span>`;
}
function liveBadge(row, now, live) {
	if (row.ended) return "";
	return now - row.last_at < live
		? `<span class="badge"><span class="dot good"></span>${T("Playing", "Jugando")}</span>`
		: `<span class="badge"><span class="dot warn"></span>${T("No end", "Sin cierre")}</span>`;
}
function tutorialText(row) {
	if (!row.tut_version && row.tut_step == null) return "—";
	if (row.tut_done) return `<span class="ok">${icon("check")} ${esc(row.tut_version || "")}</span>`;
	if (!row.tut_step) return T("Not started", "Sin empezar");
	return `<span class="no">${icon("x")} ${esc(row.tut_version || "")} · ${T("step", "paso")} ${row.tut_step}</span>`;
}
function tagChips(tags) {
	if (!tags) return "";
	return [...new Set(String(tags).split(","))]
		.filter(Boolean)
		.map((t) => `<span class="badge" title="${esc(tagName(t))}">${icon(tagIcon(t))} ${esc(tagName(t))}</span>`)
		.join(" ");
}
function tiles(list) {
	return `<div class="tiles">${list
		.map((t) => `<div class="tile"><div class="label">${t.label}</div><div class="value">${t.value}</div>${t.sub ? `<div class="sub">${t.sub}</div>` : ""}</div>`)
		.join("")}</div>`;
}
function bars(rows, { label, value, fmt = int, title, color = "var(--s1)", onclick }) {
	if (!rows.length) return `<div class="empty">${T("Nothing yet.", "Nada todavía.")}</div>`;
	const max = Math.max(...rows.map(value), 1);
	return `<div class="bars">${rows
		.map(
			(r, i) => `<div class="row" ${onclick ? `data-i="${i}" style="cursor:pointer"` : ""} title="${esc(title ? title(r) : label(r))}">
			<div class="name">${label(r)}</div>
			<div class="track"><div class="fill" style="width:${(100 * value(r)) / max}%;background:${color}"></div></div>
			<div class="n">${fmt(value(r))}</div></div>`,
		)
		.join("")}</div>`;
}
// A list shown a page at a time (2026-11-12, the user: "para revisar metele maximo de size en Y con paginado e igual lo de
// lo que mas frusta pq se hacen muy largos para abajo"): render(items of this page, first index) → html
function paged(el, items, render, per = 8, after) {
	let page = 0;
	const pages = Math.max(1, Math.ceil(items.length / per));
	const draw = () => {
		const from = page * per;
		el.innerHTML =
			render(items.slice(from, from + per), from) +
			(pages > 1
				? `<div class="pager"><button class="ghost small" data-p="-1" ${page === 0 ? "disabled" : ""} aria-label="${T("Previous", "Anterior")}">${icon("chevronL")}</button>
				<span>${page + 1} / ${pages}</span>
				<button class="ghost small" data-p="1" ${page >= pages - 1 ? "disabled" : ""} aria-label="${T("Next", "Siguiente")}">${icon("chevronR")}</button>
				<span class="muted">${int(items.length)}</span></div>`
				: "");
		$$(".pager [data-p]", el).forEach((b) => (b.onclick = () => ((page = Math.min(pages - 1, Math.max(0, page + Number(b.dataset.p)))), draw())));
		after?.(from);
	};
	draw();
}
function periodPicker() {
	return `<label>${T("Period", "Periodo")}</label>
	<select id="days">
		${[
			[1, T("Last 24 h", "Últimas 24 h")],
			[7, T("Last 7 days", "Últimos 7 días")],
			[30, T("Last 30 days", "Últimos 30 días")],
			[90, T("Last 90 days", "Últimos 90 días")],
		]
			.map(([d, t]) => `<option value="${d}" ${state.days == d ? "selected" : ""}>${t}</option>`)
			.join("")}
	</select>
	<label><input type="checkbox" id="studio" ${state.studio ? "checked" : ""}/> Studio</label>`;
}
function wirePeriod(reload) {
	$("#days").onchange = (e) => {
		state.days = Number(e.target.value);
		savePrefs();
		reload();
	};
	$("#studio").onchange = (e) => {
		state.studio = e.target.checked;
		savePrefs();
		reload();
	};
}

/* ---------------- charts (SVG, one measure each, crosshair + tooltip) ---------------- */
function showTip(html, x, y) {
	tip.innerHTML = html;
	tip.hidden = false;
	const r = tip.getBoundingClientRect();
	tip.style.left = Math.min(x + 14, innerWidth - r.width - 8) + "px";
	tip.style.top = Math.max(8, y - r.height - 10) + "px";
}
const hideTip = () => (tip.hidden = true);

function niceMax(v) {
	if (v <= 0) return 1;
	const p = Math.pow(10, Math.floor(Math.log10(v)));
	for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
	return 10 * p;
}

// points: [{ x: seconds, y: value, text? }] → a stepped line (values hold until the next reading)
function lineChart(el, points, { fmt = int, color = "var(--s1)", step = true, xMax }) {
	if (points.length < 2) {
		el.innerHTML = `<div class="empty">${T("Not enough data for a chart.", "Pocos datos para una gráfica.")}</div>`;
		return;
	}
	const W = 640, H = 170, L = 52, R = 10, Tp = 10, B = 24;
	const x1 = xMax ?? points[points.length - 1].x;
	const yMax = niceMax(Math.max(...points.map((p) => p.y)));
	const sx = (x) => L + ((W - L - R) * x) / Math.max(x1, 1);
	const sy = (y) => Tp + (H - Tp - B) * (1 - y / yMax);
	let d = "";
	points.forEach((p, i) => {
		if (i === 0) d += `M${sx(p.x)},${sy(p.y)}`;
		else d += step ? `H${sx(p.x)}V${sy(p.y)}` : `L${sx(p.x)},${sy(p.y)}`;
	});
	if (xMax) d += `H${sx(xMax)}`;
	const ticksY = [0, 0.5, 1].map((f) => f * yMax);
	const ticksX = [0, 0.25, 0.5, 0.75, 1].map((f) => f * x1);
	el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">
		<g class="grid">${ticksY.map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/>`).join("")}</g>
		${ticksY.map((v) => `<text class="axis" x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join("")}
		${ticksX.map((v) => `<text class="axis" x="${sx(v)}" y="${H - 6}" text-anchor="middle">${stamp(v)}</text>`).join("")}
		<line class="base" x1="${L}" x2="${W - R}" y1="${sy(0)}" y2="${sy(0)}"/>
		<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
		<line class="cross" y1="${Tp}" y2="${H - B}" visibility="hidden"/>
		<circle r="4" fill="${color}" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>
		<rect x="${L}" y="${Tp}" width="${W - L - R}" height="${H - Tp - B}" fill="transparent"/>
	</svg>`;
	const svg = $("svg", el);
	const cross = $(".cross", svg);
	const dot = $("circle", svg);
	const hit = $("rect", svg);
	hit.addEventListener("mousemove", (e) => {
		const box = svg.getBoundingClientRect();
		const x = ((e.clientX - box.left) / box.width) * W;
		const t = ((x - L) / (W - L - R)) * x1;
		let p = points[0];
		for (const q of points) if (q.x <= t) p = q;
		cross.setAttribute("x1", sx(t));
		cross.setAttribute("x2", sx(t));
		cross.setAttribute("visibility", "visible");
		dot.setAttribute("cx", sx(Math.max(p.x, 0)));
		dot.setAttribute("cy", sy(p.y));
		dot.setAttribute("visibility", "visible");
		showTip(`<b>${fmt(p.y)}</b> · ${stamp(p.x)}${p.text ? `<br><span class="muted">${esc(p.text)}</span>` : ""}`, e.clientX, e.clientY);
	});
	hit.addEventListener("mouseleave", () => {
		cross.setAttribute("visibility", "hidden");
		dot.setAttribute("visibility", "hidden");
		hideTip();
	});
}

// vertical bars by day
function dayChart(el, rows, key, { fmt = int, color = "var(--s1)", label }) {
	if (!rows.length) {
		el.innerHTML = `<div class="empty">${T("No data in this period.", "Sin datos en este periodo.")}</div>`;
		return;
	}
	const W = 640, H = 170, L = 40, R = 6, Tp = 10, B = 24;
	const max = niceMax(Math.max(...rows.map((r) => r[key] || 0)));
	const bw = (W - L - R) / rows.length;
	const sy = (y) => Tp + (H - Tp - B) * (1 - y / max);
	const gap = Math.min(2, bw * 0.2);
	el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
		<g class="grid">${[0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${sy(f * max)}" y2="${sy(f * max)}"/>`).join("")}</g>
		${[0, 0.5, 1].map((f) => `<text class="axis" x="${L - 6}" y="${sy(f * max) + 4}" text-anchor="end">${fmt(f * max)}</text>`).join("")}
		${rows
			.map((r, i) => {
				const v = r[key] || 0;
				const x = L + i * bw + gap / 2;
				const h = Math.max(sy(0) - sy(v), v > 0 ? 2 : 0);
				const r4 = Math.min(4, (bw - gap) / 2, h);
				const w = bw - gap;
				const y = sy(0) - h;
				const path = h > 0 ? `M${x},${sy(0)}V${y + r4}Q${x},${y} ${x + r4},${y}H${x + w - r4}Q${x + w},${y} ${x + w},${y + r4}V${sy(0)}Z` : "";
				return `<g data-i="${i}"><rect x="${L + i * bw}" y="${Tp}" width="${bw}" height="${H - Tp - B}" fill="transparent"/><path d="${path}" fill="${color}"/></g>`;
			})
			.join("")}
		${rows
			.map((r, i) => (rows.length <= 10 || i % Math.ceil(rows.length / 8) === 0 ? `<text class="axis" x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(r.day.slice(5))}</text>` : ""))
			.join("")}
		<line class="base" x1="${L}" x2="${W - R}" y1="${sy(0)}" y2="${sy(0)}"/>
	</svg>`;
	$$("g[data-i]", el).forEach((g) => {
		const r = rows[Number(g.dataset.i)];
		g.addEventListener("mousemove", (e) => showTip(`<b>${fmt(r[key] || 0)}</b> ${label}<br><span class="muted">${esc(r.day)}</span>`, e.clientX, e.clientY));
		g.addEventListener("mouseleave", hideTip);
	});
}

/* ---------------- map ---------------- */
let outline = null;
async function getOutline() {
	if (outline !== null) return outline;
	try {
		const res = await fetch("/map.json");
		outline = res.ok ? await res.json() : {};
	} catch {
		outline = {};
	}
	return outline;
}

// The map's zones with a photo: TELEPORTS' places with their in-game photo (/api/asset), and two taken from above in
// Studio (public/zones). r: studs round its middle that count as it (the smallest one round a spot wins)
const ZONES = [
	{ en: "Dealership", es: "Concesionario", x: 13610, z: 4288, r: 70, photo: "/api/asset/98702945458138" },
	{ en: "Plaza and tuning bays", es: "Plaza y tuning bays", x: 13650, z: 4310, r: 200, photo: "/zones/plaza.jpg" },
	{ en: "Road entrance", es: "Entrada al ROAD", x: 13166, z: 4158, r: 110, photo: "/api/asset/102194540660128" },
	{ en: "NY bridge (interchange)", es: "Puente NY (intercambio)", x: 13230, z: 4120, r: 260, photo: "/zones/puente.jpg" },
	{ en: "New York", es: "New York", x: 13607, z: 861, r: 2500, photo: "/api/asset/73919469461266" },
	{ en: "Chicago", es: "Chicago", x: 3302, z: -13217, r: 2000, photo: "/api/asset/130891256845406" },
	{ en: "Rocky Mountains", es: "Rocky Mountains", x: -10471, z: -11025, r: 1000, photo: "/api/asset/105922898057977" },
	{ en: "Las Vegas", es: "Las Vegas", x: -15475, z: -4568, r: 2500, photo: "/api/asset/111555132612080" },
	{ en: "Gas station", es: "Gasolinera", x: -15288, z: 522, r: 400, photo: "/api/asset/82044054105772" },
	{ en: "Los Angeles", es: "Los Angeles", x: -12885, z: 7054, r: 2000, photo: "/api/asset/91418300691465" },
];
ZONES.forEach((zone) => (zone.name = zone[LANG]));
function zoneOf(x, z) {
	let best = null;
	for (const zone of ZONES) {
		const d = Math.hypot(x - zone.x, z - zone.z);
		if (d <= zone.r && (!best || zone.r < best.r)) best = zone;
	}
	return best;
}

// The map's ground from above: the world's blocks (Tools.WorldExport, the 3D replay's), each its footprint in its colour,
// the highest drawn last
let worldShapes = null;
async function getWorldShapes() {
	if (worldShapes) return worldShapes;
	const world = await fetch("/api/world", { credentials: "same-origin" })
		.then((r) => (r.ok ? r.json() : null))
		.catch(() => null);
	const shapes = [];
	const b = world?.boxes;
	if (b) {
		const deg = Math.PI / 180;
		for (let i = 0; i < b.length; i += 11) {
			const [x, y, z, sx, sy, sz] = [b[i], b[i + 1], b[i + 2], b[i + 3] / 2, b[i + 4] / 2, b[i + 5] / 2];
			const cx = Math.cos(b[i + 6] * deg), snx = Math.sin(b[i + 6] * deg);
			const cy = Math.cos(b[i + 7] * deg), sny = Math.sin(b[i + 7] * deg);
			const cz = Math.cos(b[i + 8] * deg), snz = Math.sin(b[i + 8] * deg);
			// (YXZ, as the replay's: R = Ry·Rx·Rz) its rows for X, Y, Z
			const r0 = [cy * cz + sny * snx * snz, -cy * snz + sny * snx * cz, sny * cx];
			const r1 = [cx * snz, cx * cz, -snx];
			const r2 = [-sny * cz + cy * snx * snz, sny * snz + cy * snx * cz, cy * cx];
			const pts = [];
			let top = -Infinity;
			for (const lx of [-sx, sx]) for (const ly of [-sy, sy]) for (const lz of [-sz, sz]) {
				pts.push([x + r0[0] * lx + r0[1] * ly + r0[2] * lz, z + r2[0] * lx + r2[1] * ly + r2[2] * lz]);
				top = Math.max(top, y + r1[0] * lx + r1[1] * ly + r1[2] * lz);
			}
			// its outline from above: the hull of its 8 corners
			pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
			const cross = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
			const lower = [], upper = [];
			for (const p of pts) {
				while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
				lower.push(p);
			}
			for (const p of [...pts].reverse()) {
				while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
				upper.push(p);
			}
			const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
			let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
			for (const [px, pz] of hull) (minX = Math.min(minX, px)), (maxX = Math.max(maxX, px)), (minZ = Math.min(minZ, pz)), (maxZ = Math.max(maxZ, pz));
			shapes.push({ hull, top, minX, maxX, minZ, maxZ, color: "#" + (b[i + 10] >>> 0).toString(16).padStart(6, "0") });
		}
		shapes.sort((p, q) => p.top - q.top);
	}
	return (worldShapes = shapes);
}

// A heat image of `list` ([{ x, z }]) for a view: each one a soft blob, the sum coloured by one hue light→dark
const HEAT_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
function heatImage(canvas, list, toScreen, w, h) {
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	const R = 24;
	for (const p of list) {
		const [x, y] = toScreen(p);
		if (x < -R || y < -R || x > w + R || y > h + R) continue;
		const g = ctx.createRadialGradient(x, y, 0, x, y, R);
		g.addColorStop(0, "rgba(0,0,0,0.32)");
		g.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = g;
		ctx.fillRect(x - R, y - R, R * 2, R * 2);
	}
	const dark = document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
	const ramp = (dark ? [...HEAT_RAMP].reverse() : HEAT_RAMP).map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
	const img = ctx.getImageData(0, 0, w, h);
	const d = img.data;
	for (let i = 0; i < d.length; i += 4) {
		const a = d[i + 3];
		if (!a) continue;
		const c = ramp[Math.min(ramp.length - 1, Math.floor((a / 256) * ramp.length * 1.4))];
		d[i] = c[0];
		d[i + 1] = c[1];
		d[i + 2] = c[2];
		d[i + 3] = Math.min(235, 60 + a * 2);
	}
	ctx.putImageData(img, 0, 0);
	return canvas.toDataURL();
}

// A glyph for a map point: one of the icons, white, inside its circle
const glyph = (name) =>
	`<g transform="translate(-6 -6) scale(0.5)" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">${ICONS[name] || ICONS.dot}</g>`;
const pointGlyph = (p) => glyph(p.kind === "señal" ? tagIcon(p.tag) : kindIcon(p.kind));

/* The map. points: [{ x, z, kind, tag?, html (popup), tipHtml?, link?, n? }]; path: [[x, z], ...]; heat: [{ x, z }].
   Points near each other on screen are drawn as one (2026-11-12, the user: "de lejos se ve 1 choque que dice 5 ... optimiza
   eso porque si da lag"): a circle with how many, the commonest kind's colour; a click zooms in on them, or lists them
   when they're all on one spot. numbered: each point shows its place in time (n) instead of its icon (2026-11-12, the user:
   "le falta como orden de los puntos ... ya tienen la linea que conecta, pero no el numero de orden"). */
const CLUSTER_CELL = 46;
async function mapView(el, { points = [], path = [], heat = null, onPick, numbered = false }) {
	const shape = await getOutline();
	el.classList.add("map");
	el.innerHTML = `<canvas class="ground" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
		<svg style="position:relative"><g class="world"></g><image class="heat" x="0" y="0" style="pointer-events:none"/><g class="pts"></g></svg>
		<div class="tools"><button class="small" data-z="in" aria-label="${T("Zoom in", "Acercar")}">+</button><button class="small" data-z="out" aria-label="${T("Zoom out", "Alejar")}">−</button><button class="small" data-z="fit">${T("Fit", "Ajustar")}</button></div>`;
	const svg = $("svg", el);
	const ground = $("canvas.ground", el);
	let shapes = worldShapes || [];
	// (the world's blocks drawn on the canvas under the points, only the ones in view; once a frame at most)
	let groundFrame = 0, groundTimer = 0;
	function drawGround() {
		cancelAnimationFrame(groundFrame);
		clearTimeout(groundTimer);
		// (a hidden tab gets no animation frames: a timeout then)
		if (document.hidden) groundTimer = setTimeout(paintGround, 30);
		else groundFrame = requestAnimationFrame(paintGround);
	}
	function paintGround() {
		const box = svg.getBoundingClientRect();
		const s = el._screen;
		if (!box.width || !s) return;
		const ratio = window.devicePixelRatio || 1;
		ground.width = Math.round(box.width * ratio);
		ground.height = Math.round(box.height * ratio);
		const ctx = ground.getContext("2d");
		ctx.setTransform(ratio * s.scale, 0, 0, ratio * s.scale, ratio * s.ox, ratio * s.oz);
		const minX = -s.ox / s.scale, minZ = -s.oz / s.scale, maxX = minX + box.width / s.scale, maxZ = minZ + box.height / s.scale;
		const tiny = 1.2 / s.scale; // (smaller than a pixel or so: skipped)
		for (const shape of shapes) {
			if (shape.maxX < minX || shape.minX > maxX || shape.maxZ < minZ || shape.minZ > maxZ) continue;
			if (shape.maxX - shape.minX < tiny && shape.maxZ - shape.minZ < tiny) continue;
			ctx.fillStyle = shape.color;
			ctx.beginPath();
			shape.hull.forEach(([px, pz], k) => (k ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz)));
			ctx.fill();
		}
	}
	if (!worldShapes)
		getWorldShapes().then((list) => {
			shapes = list;
			if (list.length) world.querySelectorAll("image").forEach((img) => img.remove()); // (the old outline: the blocks say more)
			drawGround();
		});
	const world = $(".world", svg);
	const layer = $(".pts", svg);
	let pop = null;

	// bounds: the points (and path); the outline when there are none
	const xs = [], zs = [];
	for (const p of points) xs.push(p.x), zs.push(p.z);
	for (const [x, z] of path) xs.push(x), zs.push(z);
	for (const p of heat || []) xs.push(p.x), zs.push(p.z);
	if (!xs.length && shape.bounds) xs.push(shape.bounds[0], shape.bounds[2]), zs.push(shape.bounds[1], shape.bounds[3]);
	if (!xs.length) xs.push(-500, 500), zs.push(-500, 500);
	const fitTo = (lx, lz) => {
		let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
		for (const x of lx) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x));
		for (const z of lz) (minZ = Math.min(minZ, z)), (maxZ = Math.max(maxZ, z));
		const pad = Math.max(maxX - minX, maxZ - minZ) * 0.08 + 60;
		return { x: minX - pad, z: minZ - pad, w: maxX - minX + pad * 2, h: maxZ - minZ + pad * 2 };
	};
	const fit = () => fitTo(xs, zs);
	let view = fit();

	let wsvg = "";
	// the old map from above (Studio export), only when the world's blocks aren't there
	const ink = getComputedStyle(el).getPropertyValue("--axis").trim() || "#888";
	for (const layer of worldShapes?.length ? [] : shape.layers || []) {
		layer.url ||= (() => {
			const canvas = document.createElement("canvas");
			canvas.width = layer.w;
			canvas.height = layer.h;
			const ctx = canvas.getContext("2d");
			ctx.fillStyle = ink;
			layer.rows.forEach((row, z) => {
				for (const run of row ? row.split(" ") : []) {
					const [start, len] = run.split(".").map((n) => parseInt(n, 36));
					ctx.fillRect(start, z, len, 1);
				}
			});
			return canvas.toDataURL();
		})();
		wsvg += `<image href="${layer.url}" x="${layer.x}" y="${layer.z}" width="${layer.w * layer.cell}" height="${layer.h * layer.cell}" style="image-rendering:pixelated" preserveAspectRatio="none"/>`;
	}
	for (const road of shape.roads || []) {
		let d = "";
		for (let i = 0; i < road.p.length; i += 2) d += `${i ? "L" : "M"}${road.p[i]},${road.p[i + 1]}`;
		wsvg += `<path class="road" d="${d}" stroke-width="${road.w || 40}"/>`;
	}
	for (const b of shape.blocks || []) {
		wsvg += `<rect class="block" x="${-b[2] / 2}" y="${-b[3] / 2}" width="${b[2]}" height="${b[3]}" transform="translate(${b[0]} ${b[1]}) rotate(${b[4] || 0})"/>`;
	}
	for (const zone of shape.zones || []) wsvg += `<text class="zone" x="${zone.x}" y="${zone.z}" text-anchor="middle">${esc(zone.n)}</text>`;
	if (path.length > 1) wsvg += `<path class="path" d="${path.map(([x, z], i) => `${i ? "L" : "M"}${x},${z}`).join("")}"/>`;
	world.innerHTML = wsvg;

	let clusters = [];
	const pointHtml = (p, i, x, y) => {
		const color = `var(--${MAP_GROUP[p.kind] || "s3"})`;
		const mark =
			numbered && p.n != null
				? `<text y="3.8" text-anchor="middle" font-size="${p.n >= 100 ? 8.5 : 10.5}" font-weight="700" fill="#fff" style="pointer-events:none">${p.n}</text>`
				: pointGlyph(p);
		return `<g class="pt" data-i="${i}" transform="translate(${x} ${y})"><circle r="11" fill="${color}"/>${mark}</g>`;
	};
	function draw() {
		const box = svg.getBoundingClientRect();
		if (!box.width) return;
		const scale = Math.min(box.width / view.w, box.height / view.h);
		const ox = (box.width - view.w * scale) / 2 - view.x * scale;
		const oz = (box.height - view.h * scale) / 2 - view.z * scale;
		world.setAttribute("transform", `translate(${ox} ${oz}) scale(${scale})`);
		$$(".zone", world).forEach((t) => t.setAttribute("font-size", 12 / scale));
		if (heat) {
			const image = $("image.heat", svg);
			const w = Math.round(box.width), h = Math.round(box.height);
			image.setAttribute("width", w);
			image.setAttribute("height", h);
			image.setAttribute("href", heatImage((el._heat ||= document.createElement("canvas")), heat, (p) => [ox + p.x * scale, oz + p.z * scale], w, h));
		}
		// points into screen cells: one alone is drawn as itself, more as a cluster
		const cells = new Map();
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			const x = ox + p.x * scale, y = oz + p.z * scale;
			if (x < -20 || y < -20 || x > box.width + 20 || y > box.height + 20) continue;
			const key = Math.floor(x / CLUSTER_CELL) * 100003 + Math.floor(y / CLUSTER_CELL);
			let cell = cells.get(key);
			if (!cell) cells.set(key, (cell = { list: [], x: 0, y: 0 }));
			cell.list.push(i);
			cell.x += x;
			cell.y += y;
		}
		clusters = [];
		let html = "";
		for (const cell of cells.values()) {
			const x = cell.x / cell.list.length, y = cell.y / cell.list.length;
			if (cell.list.length === 1) {
				const i = cell.list[0];
				html += pointHtml(points[i], i, ox + points[i].x * scale, oz + points[i].z * scale);
				continue;
			}
			const count = {};
			for (const i of cell.list) count[points[i].kind] = (count[points[i].kind] || 0) + 1;
			const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
			const n = cell.list.length;
			const r = 13 + Math.min(10, Math.log2(n) * 2.4);
			let label = int(n);
			if (numbered) {
				const ns = cell.list.map((i) => points[i].n).filter((v) => v != null);
				if (ns.length) label = `${Math.min(...ns)}–${Math.max(...ns)}`;
			}
			clusters.push(cell.list);
			html += `<g class="pt cluster" data-c="${clusters.length - 1}" transform="translate(${x} ${y})"><circle r="${r + 4}" fill="var(--${MAP_GROUP[top] || "s3"})" opacity="0.25"/><circle r="${r}" fill="var(--${MAP_GROUP[top] || "s3"})"/><text y="4" text-anchor="middle" font-size="${label.length > 4 ? 9.5 : 11.5}" font-weight="700" fill="#fff" style="pointer-events:none">${label}</text></g>`;
		}
		layer.innerHTML = html;
		if (mark) {
			// the replay's cars round the player (police in blue) and the player: a dot with a ring, always on top
			let cars = "";
			for (const c of mark.cars || []) {
				const w = Math.max(4, 6 * scale), h = Math.max(7, 13 * scale);
				cars += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${w / 4}" fill="${c.kind === 1 ? "#2a6bff" : "#c9ced6"}" stroke="#111" stroke-width="1" transform="translate(${ox + c.x * scale} ${oz + c.z * scale}) rotate(${(-c.heading * 180) / Math.PI})"/>`;
			}
			layer.insertAdjacentHTML(
				"beforeend",
				`<g style="pointer-events:none">${cars}</g><g transform="translate(${ox + mark.x * scale} ${oz + mark.z * scale})" style="pointer-events:none"><circle r="13" fill="rgba(57,135,229,0.25)"/><circle r="7" fill="#fff" stroke="var(--s1)" stroke-width="3"/></g>`,
			);
		}
		el._screen = { scale, ox, oz };
		drawGround();
	}
	let mark = null;
	draw();
	new ResizeObserver(draw).observe(el);

	function closePop() {
		pop?.remove();
		pop = null;
	}
	function openPop(p, g) {
		closePop();
		pop = document.createElement("div");
		pop.className = "pop";
		const zone = zoneOf(p.x, p.z);
		pop.innerHTML = `${zone ? `<img src="${zone.photo}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;margin-bottom:6px"/><div class="muted" style="font-size:12px;margin-bottom:4px">${esc(zone.name)}</div>` : ""}${p.html}<div class="row"><button class="small" data-tp>${T("Copy TP", "Copiar TP")}</button>${p.link ? `<a class="small" href="${p.link}">${T("Open session", "Abrir sesión")}</a>` : ""}</div>`;
		el.appendChild(pop);
		place(g);
		$("[data-tp]", pop).onclick = () => copy(tpCommand(p.x, p.y ?? 10, p.z), T("TP copied", "TP copiado"));
		onPick?.(p);
	}
	function place(g) {
		const box = el.getBoundingClientRect();
		const gb = g.getBoundingClientRect();
		pop.style.left = Math.max(4, Math.min(gb.left - box.left + 14, box.width - 310)) + "px";
		pop.style.top = Math.max(4, Math.min(gb.top - box.top + 14, box.height - pop.offsetHeight - 8)) + "px";
	}
	// a cluster: zoom in on its points; all on one spot (or zoomed right in already): a list of them
	function openCluster(list, g) {
		const lx = list.map((i) => points[i].x), lz = list.map((i) => points[i].z);
		const spread = Math.max(Math.max(...lx) - Math.min(...lx), Math.max(...lz) - Math.min(...lz));
		if (spread > 3 && view.w > 80) {
			const next = fitTo(lx, lz);
			const side = Math.max(next.w, next.h, 80);
			view = { x: next.x + next.w / 2 - side / 2, z: next.z + next.h / 2 - side / 2, w: side, h: side };
			closePop();
			draw();
			return;
		}
		closePop();
		pop = document.createElement("div");
		pop.className = "pop list";
		const shown = [...list].sort((a, b) => (points[a].n ?? 0) - (points[b].n ?? 0)).slice(0, 40);
		pop.innerHTML = `<b>${T(`${list.length} here`, `${list.length} aquí`)}</b><div class="poplist">${shown
			.map((i) => `<button class="ghost small" data-pi="${i}">${numbered && points[i].n != null ? `<b>${points[i].n}</b> ` : ""}${icon(points[i].kind === "señal" ? tagIcon(points[i].tag) : kindIcon(points[i].kind))} ${esc(points[i].title || points[i].kind)}</button>`)
			.join("")}</div>`;
		el.appendChild(pop);
		place(g);
		$$("[data-pi]", pop).forEach((b) => (b.onclick = (e) => (e.stopPropagation(), openPop(points[Number(b.dataset.pi)], g))));
	}
	layer.addEventListener("click", (e) => {
		const g = e.target.closest(".pt");
		if (!g) return;
		if (g.dataset.c != null) openCluster(clusters[Number(g.dataset.c)], g);
		else openPop(points[Number(g.dataset.i)], g);
		e.stopPropagation();
	});
	layer.addEventListener("mousemove", (e) => {
		const g = e.target.closest(".pt");
		if (!g) return hideTip();
		if (g.dataset.c != null) {
			const list = clusters[Number(g.dataset.c)] || [];
			const count = {};
			for (const i of list) {
				const k = points[i].kind === "señal" ? tagName(points[i].tag) : kindName(points[i].kind);
				count[k] = (count[k] || 0) + 1;
			}
			const lines = Object.entries(count)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5)
				.map(([k, n]) => `${int(n)} · ${esc(k)}`)
				.join("<br>");
			return showTip(`<b>${int(list.length)} ${T("points", "puntos")}</b><br>${lines}<br><span class="muted">${T("Click to zoom in", "Clic para acercar")}</span>`, e.clientX, e.clientY);
		}
		const p = points[Number(g.dataset.i)];
		showTip(p.tipHtml || p.html, e.clientX, e.clientY);
	});
	layer.addEventListener("mouseleave", hideTip);

	// pan and zoom
	let drag = null;
	svg.addEventListener("pointerdown", (e) => {
		if (e.target.closest(".pt")) return;
		closePop();
		drag = { x: e.clientX, y: e.clientY, view: { ...view } };
		svg.setPointerCapture(e.pointerId);
		svg.classList.add("drag");
	});
	svg.addEventListener("pointermove", (e) => {
		if (!drag) return;
		const s = el._screen.scale;
		view.x = drag.view.x - (e.clientX - drag.x) / s;
		view.z = drag.view.z - (e.clientY - drag.y) / s;
		draw();
	});
	svg.addEventListener("pointerup", () => {
		drag = null;
		svg.classList.remove("drag");
	});
	function zoom(f, cx, cy) {
		const box = svg.getBoundingClientRect();
		const { scale, ox, oz } = el._screen;
		const wx = ((cx ?? box.width / 2) - ox) / scale;
		const wz = ((cy ?? box.height / 2) - oz) / scale;
		view = { x: wx - (wx - view.x) * f, z: wz - (wz - view.z) * f, w: view.w * f, h: view.h * f };
		draw();
	}
	svg.addEventListener(
		"wheel",
		(e) => {
			e.preventDefault();
			const box = svg.getBoundingClientRect();
			zoom(e.deltaY > 0 ? 1.25 : 0.8, e.clientX - box.left, e.clientY - box.top);
		},
		{ passive: false },
	);
	$$(".tools button", el).forEach(
		(b) =>
			(b.onclick = () => {
				if (b.dataset.z === "in") zoom(0.7);
				else if (b.dataset.z === "out") zoom(1.4);
				else (view = fit()), draw();
			}),
	);
	return {
		focus(x, z, r = 250) {
			view = { x: x - r, z: z - r, w: r * 2, h: r * 2 };
			draw();
		},
		// the replay's player here (and the cars round them), the view following them
		marker(x, z, cars = []) {
			mark = { x, z, cars };
			view = { x: x - 300, z: z - 170, w: 600, h: 340 };
			draw();
		},
	};
}

/* ---------------- home: search, review list, players, the period's numbers ---------------- */
async function home() {
	app.innerHTML = `
	<div class="stack">
		<div class="card">
			<form id="find" class="filters" style="margin:0">
				<input id="q" placeholder="${T("Find a player by name or UserId", "Busca un jugador por nombre o UserId")}" style="flex:1;min-width:220px;font-size:15px;padding:9px 12px" />
				<button>${T("Search", "Buscar")}</button>
				${periodPicker()}
				<button type="button" class="ghost" id="aicopy" title="${T("The whole period as text, to paste into an AI", "Todo el periodo en texto, para pegarlo en una IA")}">${icon("copy")} ${T("Copy summary for AI", "Copiar resumen para IA")}</button>
			</form>
		</div>
		<div id="vwarn" class="stack" style="gap:8px"></div>
		<div id="kpis"></div>
		<div class="grid cols-2" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)">
			<div class="card"><h2>${icon("alert")} ${T("To review", "Para revisar")}</h2><p class="muted hint">${T("Sessions with the most trouble signals. Mark one reviewed to remove it.", "Sesiones con más señales de problemas. Márcala revisada para quitarla.")}</p><div id="review"></div></div>
			<div class="card"><h2>${icon("zap")} ${T("What frustrates most", "Lo que más frustra")}</h2><p class="muted hint">${T("Signals grouped by button, window or step.", "Señales por botón, ventana o paso.")}</p><div id="problems"></div></div>
		</div>
		<div class="card">
			<div class="filters" style="margin:0 0 6px;justify-content:space-between">
				<h2 style="margin:0">${T("Why they leave", "Por qué se van")}</h2>
				<div class="chips" style="margin:0"><button class="chip on" data-rv="bubbles">${T("Bubbles", "Burbujas")}</button><button class="chip" data-rv="list">${T("List", "Lista")}</button></div>
			</div>
			<p class="muted hint">${T("Bigger bubble, more players. Click one to see those sessions.", "Burbuja más grande, más jugadores. Clic para ver esas sesiones.")}</p>
			<div id="reasons" class="chart"></div><div class="legend" id="rlegend"></div><div id="reason-sessions" style="margin-top:12px"></div>
		</div>
		<div class="grid cols-2">
			<div class="card"><h2>${T("Sessions per day", "Sesiones por día")}</h2><div id="daily" class="chart"></div></div>
			<div class="card"><h2>${T("New players' tutorial", "Tutorial de los nuevos")}</h2><div id="funnel"></div></div>
		</div>
	</div>`;
	wirePeriod(home);
	$("#find").onsubmit = (e) => {
		e.preventDefault();
		const q = $("#q").value.trim();
		if (/^\d{3,}$/.test(q)) location.hash = `#/p/${q}`;
		else location.hash = `#/sesiones?q=${encodeURIComponent(q)}`;
	};
	$("#aicopy").onclick = async () => {
		const res = await fetch(`/api/digest?days=${state.days}&lang=${LANG}`, { credentials: "same-origin" });
		const body = await res.text();
		try {
			await navigator.clipboard.writeText(body);
			toast(T(`Summary copied (${Math.round(body.length / 1000)}k characters)`, `Resumen copiado (${Math.round(body.length / 1000)} mil caracteres)`));
		} catch {
			const w = window.open("", "_blank");
			if (w) w.document.body.innerText = body;
		}
	};
	$("#q").focus();
	const common = { days: state.days, studio: state.studio ? 1 : "" };

	versionWarning($("#vwarn"));
	api("/api/stats?" + qs({ ...common, tz: -new Date().getTimezoneOffset() })).then((s) => {
		const t = s.totals || {};
		$("#kpis").innerHTML = tiles([
			{ label: T("Playing now", "Jugando ahora"), value: int(s.live) },
			{ label: T("Players", "Jugadores"), value: int(t.players), sub: T(`${int(t.sessions)} sessions`, `${int(t.sessions)} sesiones`) },
			{ label: T("New", "Nuevos"), value: int(t.firsts), sub: T(`${pct(t.firsts, t.sessions)} of sessions`, `${pct(t.firsts, t.sessions)} de las sesiones`) },
			{ label: T("Avg. session", "Duración media"), value: dur(t.avg_played) },
			{ label: T("Finished tutorial", "Terminaron el tutorial"), value: pct(t.tut_done, t.firsts), sub: T(`${int(t.tut_done)} of ${int(t.firsts)} new`, `${int(t.tut_done)} de ${int(t.firsts)} nuevos`) },
			{ label: "Robux", value: "R$ " + int(t.robux || 0) },
			{
				label: T("Database", "Base de datos"),
				value: s.dbBytes != null ? `${(s.dbBytes / 1048576).toFixed(1)} MB` : "—",
				sub:
					(s.dbBytes != null ? T(`of 500 MB (${((100 * s.dbBytes) / 524288000).toFixed(1)}%)`, `de 500 MB (${((100 * s.dbBytes) / 524288000).toFixed(1)}%)`) : "") +
					(s.deleted?.deleted_profiles ? T(` · ${int(s.deleted.deleted_profiles)} profiles freed`, ` · ${int(s.deleted.deleted_profiles)} perfiles borrados`) : ""),
			},
			{
				// (D1's free plan: 100,000 rows written a day; the backend keeps under DAILY_WRITES)
				label: T("Writes today", "Escrituras hoy"),
				value: s.writes ? int(s.writes.written) : "—",
				sub: s.writes
					? T(`of ${int(s.writes.ingest)} · `, `de ${int(s.writes.ingest)} · `) +
						(s.writes.written >= s.writes.ingest
							? T(`paused ${Math.ceil(s.writes.resets / 3600)} h`, `en pausa ${Math.ceil(s.writes.resets / 3600)} h`)
							: s.writes.sample < 1
								? T(`recording ${Math.round(s.writes.sample * 100)}% of new sessions`, `grabando ${Math.round(s.writes.sample * 100)}% de las nuevas`)
								: T("recording all", "grabando todas"))
					: "",
			},
		]);
		dayChart($("#daily"), s.daily, "sessions", { label: T("sessions", "sesiones") });
		const pick = (r) => loadReason(r, common);
		const showReasons = (how) => {
			$$("[data-rv]").forEach((b) => b.classList.toggle("on", b.dataset.rv === how));
			if (how === "list") {
				$("#reasons").innerHTML = bars(s.reasons, {
					label: (r) => `<span class="dot" style="background:${GROUPS[reasonOf(r.w, r.sample).group].fill}"></span> ${esc(reasonOf(r.w, r.sample).name)}`,
					title: (r) => r.sample || "",
					value: (r) => r.n,
					onclick: true,
				});
				$$("#reasons .row").forEach((row) => (row.onclick = () => pick(s.reasons[row.dataset.i])));
			} else bubbleChart($("#reasons"), s.reasons, pick);
		};
		$$("[data-rv]").forEach((b) => (b.onclick = () => showReasons(b.dataset.rv)));
		showReasons("bubbles");
		const groups = [...new Set(s.reasons.map((r) => reasonOf(r.w, r.sample).group))];
		$("#rlegend").innerHTML = groups.map((g) => `<span><span class="dot" style="background:${GROUPS[g].fill}"></span>${groupName(g)}</span>`).join("");
		$("#funnel").innerHTML = funnelHtml(s.funnel);
	});
	api("/api/review?" + qs(common)).then((r) => renderReview(r));
	api("/api/problems?" + qs(common)).then((r) => renderProblems(r.problems));
}

// What frustrates most: each one's full name on its own line, its bar under it (2026-11-12, the user: the bar's name was
// cut short in a narrow column), a page at a time
function renderProblems(list) {
	const el = $("#problems");
	if (!list.length) {
		el.innerHTML = `<div class="empty">${T("Nothing in this period.", "Nada en este periodo.")}</div>`;
		return;
	}
	const max = Math.max(...list.map((p) => p.sessions), 1);
	paged(
		el,
		list,
		(rows, from) =>
			`<div class="plist">${rows
				.map(
					(p, k) => `<div class="item" data-i="${from + k}" title="${esc(T(`${p.n} times in ${p.sessions} sessions`, `${p.n} veces en ${p.sessions} sesiones`))}">
					<div class="label">${icon(tagIcon(p.tag))}<span><b>${esc(tagName(p.tag))}</b>${p.target ? ` · ${esc(p.target)}` : ""}</span></div>
					<div class="barrow"><div class="track"><div class="fill" style="width:${(100 * p.sessions) / max}%"></div></div>
					<span class="n">${int(p.sessions)} ${T("sess.", "ses.")}</span></div></div>`,
				)
				.join("")}</div>`,
		8,
		() => $$(".plist .item", el).forEach((row) => (row.onclick = () => (location.hash = `#/s/${list[row.dataset.i].example}`))),
	);
}

// Packed bubbles: one per reason, its area the sessions that left for it (d3-hierarchy's pack; a row if it can't load)
async function bubbleChart(el, rows, onPick) {
	if (!rows.length) {
		el.innerHTML = `<div class="empty">${T("Nobody left in this period.", "Nadie se fue en este periodo.")}</div>`;
		return;
	}
	const W = 760, H = 360;
	const total = rows.reduce((a, r) => a + r.n, 0);
	let nodes;
	try {
		const d3 = await import("https://cdn.jsdelivr.net/npm/d3-hierarchy@3.1.2/+esm");
		const root = d3.hierarchy({ children: rows }).sum((r) => r.n || 0);
		d3.pack().size([W, H]).padding(5)(root);
		nodes = root.leaves().map((leaf) => ({ x: leaf.x, y: leaf.y, r: leaf.r, row: leaf.data }));
	} catch {
		const max = Math.max(...rows.map((r) => r.n));
		let x = 0;
		nodes = rows.map((row) => {
			const r = 12 + 60 * Math.sqrt(row.n / max);
			x += r + 4;
			const node = { x, y: H / 2, r, row };
			x += r;
			return node;
		});
	}
	const wrap = (text, width) => {
		const words = text.split(" ");
		const lines = [""];
		for (const word of words) {
			const line = lines[lines.length - 1];
			if ((line + " " + word).trim().length > width && line) lines.push(word);
			else lines[lines.length - 1] = (line + " " + word).trim();
		}
		return lines.length > 2 ? [lines[0], lines[1] + "…"] : lines;
	};
	el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${T("Exit reasons", "Motivos de salida")}">${nodes
		.map((n, i) => {
			const { name, group } = reasonOf(n.row.w, n.row.sample);
			const g = GROUPS[group];
			let label = "";
			if (n.r >= 34) {
				const lines = wrap(name, Math.max(8, Math.floor((n.r * 1.7) / 6.5)));
				const size = Math.min(26, n.r / 2.6);
				label = `<text text-anchor="middle" fill="${g.ink}" style="pointer-events:none">
					<tspan x="${n.x}" y="${n.y - lines.length * 6 + size * 0.2}" font-size="${size}" font-weight="650">${int(n.row.n)}</tspan>
					${lines.map((l, k) => `<tspan x="${n.x}" dy="${k === 0 ? size * 0.75 : 13}" font-size="11.5">${esc(l)}</tspan>`).join("")}</text>`;
			} else if (n.r >= 14) {
				label = `<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" font-size="${Math.min(13, n.r / 1.4)}" font-weight="650" fill="${g.ink}" style="pointer-events:none">${int(n.row.n)}</text>`;
			}
			return `<g data-i="${i}" style="cursor:pointer"><circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${g.fill}" stroke="var(--surface)" stroke-width="2"/>${label}</g>`;
		})
		.join("")}</svg>`;
	$$("g[data-i]", el).forEach((node) => {
		const n = nodes[Number(node.dataset.i)];
		const { name, group } = reasonOf(n.row.w, n.row.sample);
		node.addEventListener("mousemove", (e) =>
			showTip(
				`<b>${esc(name)}</b><br>${T(`${int(n.row.n)} sessions · ${pct(n.row.n, total)} of exits`, `${int(n.row.n)} sesiones · ${pct(n.row.n, total)} de las salidas`)}${n.row.firsts ? `<br>${T(`${int(n.row.firsts)} were new`, `${int(n.row.firsts)} eran nuevos`)}` : ""}<br><span class="muted">${esc(groupName(group))}${n.row.sample && n.row.sample !== name ? ` · ${esc(n.row.sample)}` : ""}</span>`,
				e.clientX,
				e.clientY,
			),
		);
		node.addEventListener("mouseleave", hideTip);
		node.addEventListener("click", () => onPick(n.row));
	});
}

// The sessions that left for one reason
async function loadReason(row, common) {
	const el = $("#reason-sessions");
	const { name } = reasonOf(row.w, row.sample);
	el.innerHTML = `<p class="muted">${T("Loading…", "Cargando…")}</p>`;
	const r = await api("/api/sessions?" + qs({ ...common, reason_w: row.w, limit: 100 }));
	el.innerHTML = `<h2>${esc(name)} · ${T(`${int(r.sessions.length)} sessions`, `${int(r.sessions.length)} sesiones`)} <button class="small ghost" id="close-reason">${T("Close", "Cerrar")}</button></h2>
		<div class="scroll"><table><tr><th>${T("Player", "Jugador")}</th><th>${T("When", "Cuándo")}</th><th class="num">${T("Length", "Duró")}</th><th>${T("Type", "Tipo")}</th><th>Tutorial</th><th>${T("Exact reason", "Motivo exacto")}</th></tr>
		${r.sessions
			.map(
				(s) => `<tr class="link" data-id="${s.id}"><td>${who(s)}</td><td>${when(s.started_at)}</td><td class="num">${dur(s.played)}</td>
				<td>${kindBadge(s)}</td><td>${tutorialText(s)}</td><td>${esc(s.reason || "")}</td></tr>`,
			)
			.join("")}</table></div>`;
	$$("tr[data-id]", el).forEach((tr) => (tr.onclick = () => (location.hash = `#/s/${tr.dataset.id}`)));
	$("#close-reason").onclick = () => (el.innerHTML = "");
	el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function funnelHtml(rows) {
	if (!rows.length) return `<div class="empty">${T("No new players in this period.", "Sin jugadores nuevos en este periodo.")}</div>`;
	const versions = {};
	for (const r of rows) (versions[r.version || "?"] ||= []).push(r);
	return Object.entries(versions)
		.map(([version, list]) => {
			const total = list.reduce((a, r) => a + r.n, 0);
			const steps = Math.max(...list.map((r) => r.total || r.step || 0), 1);
			const done = list.filter((r) => r.done).reduce((a, r) => a + r.n, 0);
			const names = {};
			for (const r of list) if (r.step && r.name) names[r.step] = r.name;
			const reached = [];
			for (let k = 1; k <= steps; k++) {
				const n = list.filter((r) => r.done || (r.step || 0) >= k).reduce((a, r) => a + r.n, 0);
				reached.push({ k, n, name: stepLabel(version, k, names[k]) });
			}
			reached.push({ k: "done", n: done, name: "" });
			return `<h2 style="font-size:13px;margin-top:6px">Tutorial ${esc(version)} · ${T(`${int(total)} new`, `${int(total)} nuevos`)}</h2>${bars(reached, {
				label: (r) => (r.k === "done" ? T("Finished", "Terminado") : `${T("Step", "Paso")} ${r.k}${r.name ? " · " + esc(r.name) : ""}`),
				value: (r) => r.n,
				fmt: (n) => `${pct(n, total)}`,
				title: (r) => T(`${r.n} of ${total} got here`, `${r.n} de ${total} llegaron`),
			})}`;
		})
		.join("");
}

function renderReview(r) {
	const el = $("#review");
	if (!r.sessions.length) {
		el.innerHTML = `<div class="empty">${T("Nothing to review in this period.", "Nada pendiente en este periodo.")}</div>`;
		return;
	}
	const list = r.sessions;
	paged(
		el,
		list,
		(rows) => `<div class="scroll"><table><tr><th>${T("Player", "Jugador")}</th><th>${T("Signals", "Señales")}</th><th class="num">${T("Score", "Puntos")}</th><th></th></tr>
		${rows
			.map(
				(s) => `<tr class="link" data-id="${s.id}">
				<td>${who(s, ago(s.started_at, r.now))}</td>
				<td>${tagChips(s.tags)}<div class="muted" style="font-size:12px;margin-top:3px">${esc(s.top_text || "")}</div></td>
				<td class="num"><b>${int(s.score)}</b></td>
				<td><button class="small ghost" data-done="${s.id}" title="${T("Mark reviewed", "Marcar revisada")}" aria-label="${T("Mark reviewed", "Marcar revisada")}">${icon("check")}</button></td></tr>`,
			)
			.join("")}</table></div>`,
		8,
		() => {
			$$("tr[data-id]", el).forEach((tr) => (tr.onclick = (e) => !e.target.closest("[data-done]") && (location.hash = `#/s/${tr.dataset.id}`)));
			$$("[data-done]", el).forEach(
				(b) =>
					(b.onclick = async () => {
						await post(`/api/sessions/${b.dataset.done}/reviewed`, { reviewed: true });
						const at = list.findIndex((x) => x.id === b.dataset.done);
						if (at >= 0) list.splice(at, 1);
						toast(T("Marked reviewed", "Marcada como revisada"));
						renderReview(r);
					}),
			);
		},
	);
}

async function loadPlayers(q) {
	const el = $("#players");
	if (!el) return;
	el.innerHTML = `<p class="muted">${T("Loading…", "Cargando…")}</p>`;
	const r = await api("/api/players?" + qs({ q, days: q ? 90 : Math.max(state.days, 30), studio: state.studio ? 1 : "" }));
	$("#players-title").textContent = q ? T(`Players matching “${q}”`, `Jugadores que coinciden con “${q}”`) : T("Players (latest first)", "Jugadores (recientes primero)");
	if (!r.players.length) {
		el.innerHTML = `<div class="empty">${T("No players found.", "No hay jugadores.")}</div>`;
		return;
	}
	el.innerHTML = `<table><tr><th>${T("Player", "Jugador")}</th><th class="num">${T("Sessions", "Sesiones")}</th><th class="num">${T("Total time", "Tiempo total")}</th><th>${T("Last seen", "Última vez")}</th><th class="num">${T("Level", "Nivel")}</th><th class="num">Robux</th><th class="num">${T("Signals", "Señales")}</th></tr>
		${r.players
			.map(
				(p) => `<tr class="link" data-u="${p.user_id}"><td>${who(p, p.was_new ? T("new in this period", "nuevo en este periodo") : "")}</td>
				<td class="num">${int(p.sessions)}</td><td class="num">${dur(p.seconds)}</td><td>${ago(p.last_seen, r.now)}</td>
				<td class="num">${p.level ?? "—"}</td><td class="num">${p.robux ? "R$ " + int(p.robux) : "—"}</td>
				<td class="num">${p.score ? `<b>${int(p.score)}</b>` : "—"}</td></tr>`,
			)
			.join("")}</table>`;
	$$("tr[data-u]", el).forEach((tr) => (tr.onclick = () => (location.hash = `#/p/${tr.dataset.u}`)));
}

/* ---------------- a player ---------------- */
async function playerPage(userId) {
	app.innerHTML = `<p class="muted">${T("Loading…", "Cargando…")}</p>`;
	const r = await api(`/api/players/${userId}`);
	const last = r.sessions[0];
	const seconds = r.sessions.reduce((a, s) => a + (s.played ?? s.last_at - s.started_at), 0);
	const robux = r.sessions.reduce((a, s) => a + (s.robux || 0), 0);
	const score = r.sessions.reduce((a, s) => a + (s.score || 0), 0);
	const firstSeen = r.sessions[r.sessions.length - 1].started_at;
	app.innerHTML = `<div class="stack">
		<div class="crumbs"><a href="#/sesiones">${T("Sessions", "Sesiones")}</a> / <b>${esc(last.display || last.name)}</b></div>
		<div class="card head">
			${face(userId)}
			<div style="flex:1">
				<h1>${esc(last.display || last.name)}</h1>
				<div class="meta">@${esc(last.name)} · UserId ${userId}
					<a href="https://www.roblox.com/users/${userId}/profile" target="_blank" rel="noopener">${T("Roblox profile", "Perfil de Roblox")} ${icon("external")}</a>
					<button class="small ghost" id="copyid">${T("Copy UserId", "Copiar UserId")}</button></div>
			</div>
		</div>
		${tiles([
			{ label: T("Sessions", "Sesiones"), value: int(r.sessions.length), sub: T(`first ${when(firstSeen)}`, `primera ${when(firstSeen)}`) },
			{ label: T("Time played", "Tiempo jugado"), value: dur(seconds) },
			{ label: T("Last seen", "Última vez"), value: ago(last.started_at, r.now), sub: when(last.started_at) },
			{ label: T("Level", "Nivel"), value: last.level ?? "—" },
			{ label: "Robux", value: "R$ " + int(robux) },
			{ label: T("Signals", "Señales"), value: int(score), sub: T(`${r.signals.length} in all`, `${r.signals.length} en total`) },
		])}
		<div class="card"><h2>${T("Sessions", "Sesiones")}</h2><div class="scroll"><table>
			<tr><th>${T("When", "Cuándo")}</th><th>${T("Type", "Tipo")}</th><th class="num">${T("Length", "Duró")}</th><th>${T("Device", "Equipo")}</th><th>${T("Why they left", "Por qué se fue")}</th><th>Tutorial</th><th class="num">${T("Earned", "Ganó")}</th><th class="num">${T("Spent", "Gastó")}</th><th class="num">${T("Signals", "Señales")}</th></tr>
			${r.sessions
				.map(
					(s) => `<tr class="link" data-id="${s.id}"><td>${when(s.started_at)} ${liveBadge(s, r.now, r.live)} ${s.studio ? '<span class="badge">Studio</span>' : ""}</td>
					<td>${kindBadge(s)}</td><td class="num">${dur(s.played ?? s.last_at - s.started_at)}</td><td>${esc(deviceName(s.device))}</td>
					<td>${esc(s.reason || "—")}</td><td>${tutorialText(s)}</td><td class="num">${money(s.earned)}</td><td class="num">${money(s.spent)}</td>
					<td class="num">${s.score ? `<b>${int(s.score)}</b>` : "—"}</td></tr>`,
				)
				.join("")}</table></div></div>
		<div class="grid cols-2">
			<div class="card"><h2>${T("Their signals", "Sus señales")}</h2><div id="signals" class="timeline"></div></div>
			<div class="card"><h2>${T("Where things happened", "Dónde pasaron las cosas")}</h2><div id="pmap"></div><div class="legend" id="plegend"></div></div>
		</div>
	</div>`;
	$("#copyid").onclick = () => copy(String(userId), T("UserId copied", "UserId copiado"));
	$$("tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = `#/s/${tr.dataset.id}`)));
	$("#signals").innerHTML = r.signals.length
		? `<table>${r.signals
				.map(
					(g) => `<tr class="link" data-go="${g.session_id}" data-q="${g.q}"><td class="t">${when(g.started_at + g.at)}</td>
					<td>${icon(tagIcon(g.tag))} ${esc(g.text)}</td></tr>`,
				)
				.join("")}</table>`
		: `<div class="empty">${T("No signals.", "Ninguna señal.")}</div>`;
	$$("#signals tr").forEach((tr) => (tr.onclick = () => (location.hash = `#/s/${tr.dataset.go}?q=${tr.dataset.q}`)));
	const pts = await api("/api/points?" + qs({ user: userId, days: 365, studio: 1, limit: 3000 }));
	mapView($("#pmap"), { points: pts.points.map(pointOf) });
	legend($("#plegend"), pts.points);
}

function pointOf(p) {
	const name = p.display || p.name || "";
	const head = `<b>${icon(p.kind === "señal" ? tagIcon(p.tag) : kindIcon(p.kind))} ${esc(p.text)}</b><div class="muted">${esc(name)} · ${when(p.started_at + p.at)} · min ${stamp(p.at)}</div>`;
	return { x: p.x, y: p.y, z: p.z, kind: p.kind, tag: p.tag, html: head, title: p.text, link: `#/s/${p.session_id}?q=${p.q}` };
}
function legend(el, list) {
	const kinds = [...new Set(list.map((p) => p.kind))];
	el.innerHTML = kinds.map((k) => `<span><span class="dot ${MAP_GROUP[k] || "s3"}"></span>${icon(kindIcon(k))} ${esc(kindName(k))}</span>`).join("");
}

/* ---------------- a session ---------------- */
function story(s, sum, lines) {
	if (!sum) {
		const lastLine = lines[lines.length - 1];
		return `<p>${T("The session has no ending (still open, or cut off)", "La sesión no tiene cierre (abierta o cortada)")}${lastLine ? T(`; last thing: <b>${esc(lastLine.s)}</b> (${stamp(lastLine.t)})`, `; lo último: <b>${esc(lastLine.s)}</b> (${stamp(lastLine.t)})`) : ""}.</p>`;
	}
	const out = [];
	const device = deviceName(sum.device);
	out.push(
		T(
			`Played <b>${dur(sum.played)}</b> on ${esc(device)}${sum.first ? ", <b>first time</b>" : sum.loaded ? ", had played before" : ""}.`,
			`Jugó <b>${dur(sum.played)}</b> desde ${esc(device)}${sum.first ? ", <b>primera vez</b>" : sum.loaded ? ", ya había jugado" : ""}.`,
		) + (sum.afk >= 30 ? T(` AFK ${dur(sum.afk)}.`, ` AFK ${dur(sum.afk)}.`) : ""),
	);
	const t = sum.tutorial;
	if (t && t.step > 0) {
		if (t.done) out.push(T(`Finished tutorial ${esc(t.version)}${t.doneAt ? ` in ${dur(t.doneAt)}` : ""}.`, `Terminó el tutorial ${esc(t.version)}${t.doneAt ? ` en ${dur(t.doneAt)}` : ""}.`));
		else
			out.push(
				T(
					`Stopped at tutorial ${esc(t.version)}, <b>step ${t.step} of ${t.total}</b>${t.name ? ` (${esc(t.name)})` : ""}${t.inStep ? `, ${dur(t.inStep)} there` : ""}.`,
					`Se quedó en el tutorial ${esc(t.version)}, <b>paso ${t.step} de ${t.total}</b>${t.name ? ` (${esc(t.name)})` : ""}${t.inStep ? `, ${dur(t.inStep)} ahí` : ""}.`,
				),
			);
	}
	if (sum.loaded) {
		const income = Object.entries(sum.income || {})
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([k, v]) => `${esc(k)} ${money(v)}`)
			.join(", ");
		out.push(
			T(
				`Cash ${money(sum.cashStart)} → ${money(sum.cashEnd)}: earned <b>${money(sum.earned)}</b>${income ? ` (${income})` : ""}, spent <b>${money(sum.spent)}</b>.`,
				`Dinero ${money(sum.cashStart)} → ${money(sum.cashEnd)}: ganó <b>${money(sum.earned)}</b>${income ? ` (${income})` : ""}, gastó <b>${money(sum.spent)}</b>.`,
			),
		);
	}
	if (sum.bought?.length) out.push(T("Bought ", "Compró ") + sum.bought.map((b) => `<b>${esc(b.n)}</b>`).join(", ") + ".");
	if (sum.tried?.length) out.push(T("Couldn't buy: ", "No pudo comprar: ") + sum.tried.map((b) => `${esc(b.n)} (${esc(b.why)}${b.c > 1 ? `, ×${b.c}` : ""})`).join(", ") + ".");
	if (sum.robux > 0) out.push(T(`Spent <b>R$ ${int(sum.robux)}</b>.`, `Gastó <b>R$ ${int(sum.robux)}</b>.`));
	else if (sum.robuxTries > 0) out.push(T(`Opened a Robux purchase ${sum.robuxTries}× without buying.`, `Abrió una compra con Robux ${sum.robuxTries}× sin comprar.`));
	if (sum.mounts > 0)
		out.push(
			T(`Rode ${sum.mounts}× (${dur(sum.rideSeconds)})`, `Se subió a la moto ${sum.mounts}× (${dur(sum.rideSeconds)})`) +
				(sum.crashes ? T(`, ${sum.crashes} crashes`, `, ${sum.crashes} choques`) : "") +
				(sum.busted ? T(`, busted ${sum.busted}`, `, arrestado ${sum.busted}`) : "") +
				(sum.escaped ? T(`, escaped ${sum.escaped}`, `, escapó ${sum.escaped}`) : "") +
				(sum.points ? T(`, ${int(sum.points)} points (best combo ${sum.bestCombo})`, `, ${int(sum.points)} puntos (mejor combo ${sum.bestCombo})`) : "") +
				".",
		);
	else if (sum.loaded) out.push(T("Never rode a bike.", "No se subió a ninguna moto."));
	const windows = Object.values(sum.windows || {})
		.sort((a, b) => b.seconds - a.seconds)
		.slice(0, 3);
	if (windows.length) out.push(T("Most time in: ", "Más tiempo en: ") + windows.map((w) => `${esc(w.name)} (${dur(w.seconds)})`).join(", ") + ".");
	if (sum.reasons?.length) out.push(T(`Left: <b>${esc(sum.reasons[0].t)}</b>.`, `Se fue: <b>${esc(sum.reasons[0].t)}</b>.`));
	return out.map((p) => `<p>${p}</p>`).join("");
}

let refreshTimer = null; // (a page that refreshes itself: cleared on leaving it)
let replayStop = null; // (the replay's animation: stopped on leaving the page)

const INTERACT = new Set(["clic", "toque", "tecla", "mando", "prompt", "ventana"]);
function zoneName(p) {
	if (!p) return "—";
	const zone = zoneOf(p[0], p[2]);
	if (zone) return zone.name;
	if (!outline?.zones) return "—";
	let best = null, dist = Infinity;
	for (const z of outline.zones) {
		const d = Math.hypot(z.x - p[0], z.z - p[2]);
		if (d < dist) (best = z), (dist = d);
	}
	return best && dist < 2500 ? best.n : T("Road", "Carretera");
}
function eventOf(l) {
	if (l.k === "señal") return { title: tagName(l.g) || T("Signal", "Señal"), icon: tagIcon(l.g) };
	if (l.k === "servidor" && /^Entró/.test(l.s)) return { title: T("Joined", "Entró"), icon: "play" };
	if (l.k === "servidor" && /^Se salió/.test(l.s)) return { title: T("Left", "Salió"), icon: "flag" };
	if (l.k === "moto" && /^Chocó/.test(l.s)) return { title: T("Crash", "Choque"), icon: "burst" };
	return { title: kindName(l.k), icon: kindIcon(l.k) };
}

// Big moments shown over the replay (2026-11-12, the user: "que cuando haga replay ... salga la pantalla de replay ...
// cuando ... este en la animacion de busted pues que salga tmb para ver si le continue o no"): read from the log's lines
const PRESSED = (l) => l.k === "clic" || l.k === "toque" || l.k === "mando";
const MOMENTS = [
	{ test: (l) => l.k === "moto" && /^Chocó/.test(l.s), label: () => "CRASH", cls: "bad", hold: 1.8 },
	{ test: (l) => l.k === "policía" && /^BUSTED/.test(l.s), label: () => "BUSTED", cls: "bad", hold: 4 },
	{ test: (l) => l.k === "policía" && /^Escapó/.test(l.s), label: () => T("ESCAPED", "ESCAPÓ"), cls: "good", hold: 2.5 },
	{ test: (l) => l.k === "policía" && /radar/i.test(l.s), label: () => "WANTED", cls: "warn", hold: 2.5 },
	{ test: (l) => PRESSED(l) && /Summary > Window > Replay/.test(l.s), label: () => "REPLAY", cls: "blue", hold: 2.2, sub: () => T("pressed REPLAY", "le dio a REPLAY") },
	{ test: (l) => PRESSED(l) && /Summary > Window > Recover/.test(l.s), label: () => "RECOVER", cls: "blue", hold: 2.2, sub: () => T("pressed RECOVER", "le dio a RECOVER") },
	{ test: (l) => PRESSED(l) && /Summary > Window > Lobby/.test(l.s), label: () => "LOBBY", cls: "blue", hold: 2.2, sub: () => T("pressed LOBBY", "le dio a LOBBY") },
	{ test: (l) => PRESSED(l) && /RunResult > Window > Continue/.test(l.s), label: () => "CONTINUE", cls: "blue", hold: 2.2, sub: () => T("pressed CONTINUE", "le dio a CONTINUE") },
	{ test: (l) => PRESSED(l) && /Crash > Skip/.test(l.s), label: () => "SKIP", cls: "blue", hold: 1.4 },
	{ test: (l) => l.k === "compra", label: () => T("PURCHASE", "COMPRA"), cls: "good", hold: 2 },
];
// The windows we have a picture of (public/frames, captured in Studio from the game itself, 2026-11-12): key → file;
// full: a whole-screen one (transparent but for its pieces), laid over the whole replay
const FRAMES = window.NW_FRAMES || {};

// The tutorial's steps by name, both versions (from the game's TutorialConfig + SessionReportConfig.Steps, 2026-11-12;
// the user: "algunos steps no tienen el name, salen nomas el numero"): a step nobody stopped on had no name to show
const STEP_NAMES = {
	A: [
		["go to the dealership", "ir al concesionario"], ["pick the free bike", "elegir la moto gratis"], ["press BUY", "presionar BUY"],
		["close with BACK / CONTINUE", "cerrar con BACK / CONTINUE"], ["open the GARAGE", "abrir el GARAGE"], ["pick their bike", "elegir su moto"],
		["press SPAWN", "presionar SPAWN"], ["enter the TUNING BAY", "entrar al TUNING BAY"], ["upgrade the EXHAUST for free", "mejorar el EXHAUST gratis"],
		["go to the road", "ir a la carretera"], ["farm $800", "farmear $800"], ["open TELEPORTS", "abrir TELEPORTS"],
		["pick DEALERSHIP and GO", "elegir DEALERSHIP y GO"], ["step into the green circle", "entrar al círculo verde"], ["pick the Ninza 300", "elegir la Ninza 300"],
		["buy the Ninza 300", "comprar la Ninza 300"], ["close with CONTINUE", "cerrar con CONTINUE"], ["open the GARAGE again", "abrir el GARAGE otra vez"],
		["pick the new bike", "elegir la moto nueva"], ["press SPAWN with the new one", "presionar SPAWN con la nueva"],
	],
	B: [
		["pick their first bike", "elegir su primera moto"], ["farm $800", "farmear $800"], ["open TELEPORTS", "abrir TELEPORTS"],
		["pick DEALERSHIP and GO", "elegir DEALERSHIP y GO"], ["step into the green circle", "entrar al círculo verde"], ["pick the Ninza 300", "elegir la Ninza 300"],
		["buy the Ninza 300", "comprar la Ninza 300"], ["close with BACK / CONTINUE", "cerrar con BACK / CONTINUE"], ["open the GARAGE", "abrir el GARAGE"],
		["pick their bike", "elegir su moto"], ["press SPAWN", "presionar SPAWN"], ["enter the TUNING BAY", "entrar al TUNING BAY"],
		["upgrade the EXHAUST for free", "mejorar el EXHAUST gratis"], ["go to the road", "ir a la carretera"],
	],
};
// A step's name: the list's in this page's language, else what the game said (without its "12/14: ")
const stepLabel = (version, k, said) => {
	const known = STEP_NAMES[version]?.[k - 1];
	if (known) return T(known[0], known[1]);
	return said ? String(said).replace(/^\d+\/\d+:\s*/, "") : "";
};

/* ---------------- a session (the design of 2026-11-11) ---------------- */
async function sessionPage(id, focusQ) {
	app.innerHTML = `<p class="muted">${T("Loading…", "Cargando…")}</p>`;
	const r = await api(`/api/sessions/${id}`);
	await getOutline();
	const s = r.session;
	const sum = r.summary;
	const lines = r.lines;
	const played = Math.max(sum?.played ?? s.last_at - s.started_at, lines.length ? lines[lines.length - 1].t : 0, 1);
	const live = !s.ended && r.now - s.last_at < r.live;
	const signals = lines.filter((l) => l.k === "señal");
	const errors = signals.filter((l) => l.g === "error");
	const tut = sum?.tutorial;
	const shortId = id.slice(0, 8).toUpperCase();
	const top = sum?.reasons?.[0];
	const topGroup = top ? reasonOf(top.w, top.t).group : null;

	let banner;
	if (live) banner = `<div class="banner ok">${icon("info")}<div><b>${T("Playing now", "Jugando ahora")}</b><span>${T("Reload to see more.", "Recarga para ver más.")}</span></div></div>`;
	else if (top) banner = `<div class="banner">${icon("alert")}<div><b>${esc(top.t)}</b><span>${T("Likeliest reason they left", "Motivo más probable de la salida")} · ${esc(groupName(topGroup))}${sum.reasons[1] ? ` · ${T("also", "también")}: ${esc(sum.reasons[1].t)}` : ""}</span></div></div>`;
	else banner = `<div class="banner">${icon("alert")}<div><b>${T("No ending", "Sin cierre")}</b><span>${T("The final summary never arrived (server down or closed).", "No llegó el resumen final (servidor caído o cerrado).")}</span></div></div>`;

	const tutValue = !tut || !tut.step ? T("Not started", "No empezó") : tut.done ? T("Done", "Completado") : T(`Step ${tut.step} of ${tut.total}`, `Paso ${tut.step} de ${tut.total}`);
	const tutSub = tut && !tut.done && tut.step ? esc(tut.name || "") : tut?.doneAt ? T(`in ${dur(tut.doneAt)}`, `en ${dur(tut.doneAt)}`) : "";

	app.innerHTML = `<div class="stack">
		<div class="crumbs"><a href="#/sesiones">${T("Sessions", "Sesiones")}</a> / <a href="#/p/${s.user_id}">${esc(s.display || s.name)}</a> / <b>${T("Session", "Sesión")}</b></div>
		<div class="card shead">
			${face(s.user_id)}
			<div class="who-main">
				<h1>${esc(s.display || s.name)} <small>@${esc(s.name)}</small></h1>
				<div class="chips">${kindBadge(s)}
					<span class="chip static">${icon("monitor")} ${esc(deviceName(s.device))}</span>
					${tut ? `<span class="chip static">${icon("book")} Tutorial ${esc(tut.version || "")}</span>` : ""}
					<span class="chip static">${icon("layers")} ${T("Version", "Versión")} ${s.place_version ?? "?"}</span>
					${abChip(s.ab)}
					${s.studio ? `<span class="chip static">Studio</span>` : ""}</div>
			</div>
			<div class="sep"></div>
			<div class="when"><span>${icon("calendar")} ${when(s.started_at)}</span><span>${icon("tag")} ID: NW-${shortId}</span></div>
			<div class="actions">
				<button class="primary" id="reviewed">${icon("check")} ${s.reviewed ? T("Reviewed", "Revisada") : T("Mark reviewed", "Marcar revisada")}</button>
				<button class="ghost" id="copyid">${icon("copy")} ${T("Copy ID", "Copiar ID")}</button>
			</div>
		</div>
		${banner}
		<div class="kpis">
			<div class="kpi">${icon("clock")}<div><div class="label">${T("Length", "Duración")}</div><div class="value">${dur(played)}</div>${sum?.afk >= 30 ? `<div class="sub">${dur(sum.afk)} AFK</div>` : ""}</div></div>
			<div class="kpi">${icon("list")}<div><div class="label">Tutorial</div><div class="value">${tutValue}</div><div class="sub">${tutSub}</div></div></div>
			<div class="kpi">${icon("wallet")}<div><div class="label">${T("Cash", "Dinero")}</div><div class="value">${sum?.loaded ? `${money(sum.cashStart)} → ${money(sum.cashEnd)}` : "—"}</div>${sum?.loaded ? `<div class="sub">${T(`earned ${money(sum.earned)} · spent ${money(sum.spent)}`, `ganó ${money(sum.earned)} · gastó ${money(sum.spent)}`)}</div>` : ""}</div></div>
			<div class="kpi">${icon("bike")}<div><div class="label">${T("Riding", "En moto")}</div><div class="value">${dur(sum?.rideSeconds ?? 0)}</div><div class="sub">${sum ? T(`${sum.mounts || 0} rides · ${sum.crashes || 0} crashes`, `${sum.mounts || 0} subidas · ${sum.crashes || 0} choques`) : ""}</div></div></div>
		</div>
		<div class="card sumrow"><div>${icon("info")} ${T("Summary", "Resumen")}</div><div class="story">${story(s, sum, lines)}
			${signals.length ? `<p class="muted">${T(`${signals.length} signals${errors.length ? `, ${errors.length} script errors` : ""}.`, `${signals.length} señales${errors.length ? `, ${errors.length} errores de script` : ""}.`)}</p>` : ""}</div></div>
		<div class="grid cols-2">
			<div class="card">
				<div class="cardhead"><h2>${icon("pin")} ${T("Route and points", "Recorrido y puntos")}</h2><div class="seg right" id="mapseg">
					<button class="on" data-f="all">${T("All", "Todos")}</button><button data-f="crash">${T("Crashes", "Choques")}</button><button data-f="buy">${T("Purchases", "Compras")}</button><button data-f="sig">${T("Signals", "Señales")}</button></div></div>
				<div id="smap"></div>
				<div class="legend" id="slegend"></div>
				<div class="picked" id="picked"></div>
			</div>
			<div class="card replay">
				<div class="cardhead"><h2>${icon("video")} Replay</h2><div class="seg right" id="rview"><button class="on" data-v="3d">3D</button><button data-v="map">${T("Map", "Mapa")}</button></div><div class="seg" id="rcam"><button class="on" data-c="follow">${T("Follow", "Seguir")}</button><button data-c="player">${T("Their camera", "Su cámara")}</button></div></div>
				<div class="screen"><div class="mini" id="rmap"></div><div class="mini" id="r3d" hidden></div>
					<div class="hud"><div class="frame" id="rframe" hidden></div><div class="win" id="rwin" hidden></div><div class="cash" id="rcash"></div><div class="note" id="rnote"></div><div class="cursor" id="rcursor" hidden></div>
					<div class="big" id="rbig" hidden></div><div class="event" id="revent" hidden></div><div class="speed" id="rspeed"></div></div></div>
				<div class="bar"><button class="ghost small" id="rplay" aria-label="${T("Play", "Reproducir")}">${icon("play")}</button>
					<span class="time" id="rtime"></span>
					<div class="track" id="rtrack"><div class="rail"></div><div class="fill"></div>
						${lines
							.filter((l) => l.k === "señal" || (l.k === "moto" && /^Chocó/.test(l.s)) || l.k === "compra" || (l.k === "policía" && /^BUSTED/.test(l.s)))
							.map((l) => `<div class="mark ${l.k === "señal" || l.k === "policía" ? "bad" : ""}" style="left:${(100 * l.t) / played}%" title="${esc(stamp(l.t) + " · " + l.s)}"></div>`)
							.join("")}
						<div class="knob"></div></div>
					<div class="seg" id="rspeedseg"><button data-x="1">1×</button><button class="on" data-x="4">4×</button><button data-x="16">16×</button></div></div>
				<div class="foot"><span>${icon("info")} ${T("Recordings are kept 7 days", "Las grabaciones duran 7 días")}</span></div>
			</div>
		</div>
		<div class="card">
			<div class="cardhead"><h2>${icon("bars")} ${T("Metrics", "Métricas")}</h2><div class="seg" id="metseg">
				<button class="on" data-m="m">${T("Cash", "Dinero")}</button><button data-m="v">${T("Speed", "Velocidad")}</button><button data-m="f">FPS</button><button data-m="police">${T("Police", "Policía")}</button></div></div>
			<div id="metric" class="chart"></div>
		</div>
		<div class="card events">
			<div class="cardhead"><h2>${icon("list")} ${T("Events", "Eventos")}</h2><div class="seg" id="evseg"></div>
				<input id="search" class="right" placeholder="${T("Filter events…", "Filtrar eventos…")}" style="min-width:180px"/></div>
			<div class="timeline scroll" id="tl"></div>
		</div>
		${sum ? detailHtml(sum) : ""}
	</div>`;

	$("#reviewed").onclick = async () => {
		s.reviewed = s.reviewed ? 0 : 1;
		await post(`/api/sessions/${id}/reviewed`, { reviewed: !!s.reviewed });
		$("#reviewed").innerHTML = `${icon("check")} ${s.reviewed ? T("Reviewed", "Revisada") : T("Mark reviewed", "Marcar revisada")}`;
	};
	$("#copyid").onclick = () => copy(id, T("ID copied", "ID copiado"));

	/* metrics: one chart, its measure picked by the tabs */
	const series = (key) => lines.filter((l) => typeof l[key] === "number").map((l) => ({ x: l.t, y: l[key], text: l.s }));
	const police = () => {
		let n = 0;
		return [{ x: 0, y: 0 }, ...lines.filter((l) => l.k === "policía").map((l) => ({ x: l.t, y: ++n, text: l.s }))];
	};
	const metric = (m) => {
		$$("#metseg button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
		if (m === "m") lineChart($("#metric"), series("m"), { fmt: money, xMax: played });
		else if (m === "v") lineChart($("#metric"), series("v"), { fmt: int, step: false, xMax: played, color: "var(--s2)" });
		else if (m === "f") lineChart($("#metric"), series("f"), { fmt: int, xMax: played, color: "var(--s3)" });
		else lineChart($("#metric"), police(), { fmt: int, xMax: played });
	};
	$$("#metseg button").forEach((b) => (b.onclick = () => metric(b.dataset.m)));
	metric("m");

	/* map: the way they went, start and end, the points that matter, numbered in the order they happened */
	const placed = lines.filter((l) => Array.isArray(l.p));
	const path = placed.map((l) => [l.p[0], l.p[2]]);
	const filters = {
		all: (l) => MAP_KINDS.includes(l.k),
		crash: (l) => l.k === "moto" && /^Chocó/.test(l.s),
		buy: (l) => l.k === "compra",
		sig: (l) => l.k === "señal",
	};
	let map;
	const pointFrom = (l, kind, n) => ({
		x: l.p[0], y: l.p[1], z: l.p[2], kind: kind || l.k, tag: l.g, q: l.q, n, title: l.s,
		html: `<b>${n != null ? `#${n} · ` : ""}${icon(eventOf(l).icon)} ${esc(l.s)}</b><div class="muted">${stamp(l.t)} · ${clock(s.started_at + l.t)}</div>`,
	});
	async function drawMap(f) {
		$$("#mapseg button").forEach((b) => b.classList.toggle("on", b.dataset.f === f));
		const pts = placed.filter(filters[f]).map((l, i) => pointFrom(l, null, i + 1));
		if (placed.length) {
			pts.unshift(pointFrom(placed[0], "inicio"));
			pts.push(pointFrom(placed[placed.length - 1], "fin"));
		}
		map = await mapView($("#smap"), { points: pts, path, numbered: true, onPick: (p) => pick(lines.find((l) => l.q === p.q)) });
		legend($("#slegend"), pts);
	}
	$$("#mapseg button").forEach((b) => (b.onclick = () => drawMap(b.dataset.f)));
	await drawMap("all");

	function pick(l) {
		if (!l) return;
		const ev = eventOf(l);
		$("#picked").innerHTML = `${icon(ev.icon)}<div class="what"><b>${stamp(l.t)} · ${esc(ev.title)}</b><span>${esc(l.s)}</span></div>
			<button class="primary small" id="goev">${T("Go to it", "Ir al evento")}</button>
			${Array.isArray(l.p) ? `<button class="ghost small" id="tpev">${icon("send")} ${T("TP in game", "TP en el juego")}</button>` : ""}`;
		$("#goev").onclick = () => {
			highlight(l.q);
			replay.seek(l.t);
		};
		if (Array.isArray(l.p)) $("#tpev").onclick = () => copy(tpCommand(...l.p), T("TP copied (paste it in the game chat)", "TP copiado (pégalo en el chat del juego)"));
	}

	/* events: tabs by what they are, a search, each with where and what to do */
	const quiet = new Set(["tecla", "mando", "clic", "toque", "estado"]);
	const tabs = [
		["main", T("All", "Todos"), (l) => !quiet.has(l.k)],
		["sig", T("Signals", "Señales"), (l) => l.k === "señal"],
		["err", T("Errors", "Errores"), (l) => l.k === "señal" && l.g === "error"],
		["int", T("Input", "Interacciones"), (l) => INTERACT.has(l.k)],
		["all", T("Full log", "Registro completo"), () => true],
	];
	let tab = "main";
	const renderTabs = () => {
		$("#evseg").innerHTML = tabs
			.map(([k, label, fn]) => `<button class="${k === tab ? "on" : ""}" data-t="${k}">${label}<span class="n">${lines.filter(fn).length}</span></button>`)
			.join("");
		$$("#evseg button").forEach((b) => (b.onclick = () => ((tab = b.dataset.t), renderTabs(), renderLines())));
	};
	function renderLines() {
		const q = $("#search").value.trim().toLowerCase();
		const fn = tabs.find((t) => t[0] === tab)[2];
		const shown = lines.filter((l) => fn(l) && (!q || String(l.s).toLowerCase().includes(q)));
		$("#tl").innerHTML = `<table><tr><th>${T("Time", "Tiempo")}</th><th>${T("Event", "Evento")}</th><th>${T("Detail", "Detalle")}</th><th>${T("Where", "Dónde")}</th><th></th></tr>${shown
			.map((l) => {
				const ev = eventOf(l);
				return `<tr data-q="${l.q}" class="${quiet.has(l.k) ? "dim" : ""}"><td class="t" title="${clock(s.started_at + l.t)}">${stamp(l.t)}</td>
				<td class="ev"><span>${icon(ev.icon)} ${esc(ev.title)}</span></td><td>${esc(l.s)}${l.c > 1 ? ` <span class="muted">×${l.c}</span>` : ""}</td>
				<td>${esc(zoneName(l.p))}</td>
				<td class="act"><button class="outline" data-a="${l.q}">${Array.isArray(l.p) ? T("Show", "Ver punto") : T("View", "Ver")}</button></td></tr>`;
			})
			.join("")}</table>${shown.length ? "" : `<div class="empty">${T("Nothing matches.", "Nada con esos filtros.")}</div>`}`;
		$$("#tl [data-a]").forEach(
			(b) =>
				(b.onclick = (e) => {
					e.stopPropagation();
					const l = lines.find((x) => x.q == b.dataset.a);
					pick(l);
					replay.seek(l.t);
					if (Array.isArray(l.p)) map.focus(l.p[0], l.p[2]);
					$("#smap").scrollIntoView({ block: "center", behavior: "smooth" });
				}),
		);
		$$("#tl tr[data-q]").forEach((tr) => (tr.onclick = () => replay.seek(lines.find((x) => x.q == tr.dataset.q).t)));
	}
	function highlight(q) {
		const line = lines.find((l) => l.q == q);
		if (line && !tabs.find((t) => t[0] === tab)[2](line)) {
			tab = "all";
			renderTabs();
			renderLines();
		}
		$$("#tl tr.hl").forEach((tr) => tr.classList.remove("hl"));
		const tr = $(`#tl tr[data-q="${q}"]`);
		if (tr) {
			tr.classList.add("hl");
			tr.scrollIntoView({ block: "center", behavior: "smooth" });
		}
	}
	$("#search").oninput = renderLines;
	renderTabs();
	renderLines();

	/* the replay: where they were, the cars round them, the window open, what just happened, speed and cash */
	const replay = await replayView({ lines, played, startedAt: s.started_at, id, sum });
	pick(focusQ ? lines.find((l) => l.q == focusQ) : signals[0] || lines[lines.length - 1]);
	if (focusQ) {
		highlight(focusQ);
		const l = lines.find((x) => x.q == focusQ);
		if (l) replay.seek(l.t);
	}
}

// The replay from the log and the samples: positions joined in time, the window open, the big moments
async function replayView({ lines, played, id, sum }) {
	const placed = lines.filter((l) => Array.isArray(l.p));
	const path = placed.map((l) => [l.p[0], l.p[2]]);
	const mini = await mapView($("#rmap"), { path, points: [] });
	let t = 0, playing = false, rate = 4, last = 0, frame = 0, snap = true;
	const at = (list, time) => {
		let lo = 0, hi = list.length - 1, found = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (list[mid].t <= time) (found = mid), (lo = mid + 1);
			else hi = mid - 1;
		}
		return found;
	};
	const windows = lines.filter((l) => l.k === "ventana");
	const speeds = lines.filter((l) => typeof l.v === "number");
	const cash = lines.filter((l) => typeof l.m === "number");
	// a window's name (as the log says it) → its key in the game (Summary, RunResult...): its picture's file
	const windowKey = {};
	for (const [key, w] of Object.entries(sum?.windows || {})) if (w?.name) windowKey[w.name] = key;
	const moments = [];
	for (const l of lines) {
		const m = MOMENTS.find((x) => x.test(l));
		if (m) moments.push({ t: l.t, m, l });
	}

	// the server's samples (4 a second), the client's camera and cursor (2 a second) and the cars round them while riding
	// (2 a second), when kept (7 days)
	let track = [], looks = [], cars = [], lib = null, view3d = null, view = "map";
	try {
		const [data, mod] = await Promise.all([api(`/api/sessions/${id}/track`), import("/replay3d.js?v=12")]);
		lib = mod;
		track = mod.decodeTrack(data.track);
		looks = mod.decodeLook(data.look);
		cars = mod.decodeNear(data.near || "").map((n) => {
			const p = mod.sampleAt(track, n.t);
			if (!p) return null;
			const ground = p.y - (p.riding ? 2.5 : 3);
			return { t: n.t, cars: n.cars.map((c) => ({ ...c, x: p.x + c.dx, y: ground, z: p.z + c.dz })) };
		}).filter(Boolean);
	} catch (err) {
		console.warn("replay samples:", err);
	}
	$("#rnote").textContent = track.length
		? T(`${int(track.length)} position samples${cars.length ? ` · ${int(cars.length)} traffic samples` : ""}`, `${int(track.length)} muestras de posición${cars.length ? ` · ${int(cars.length)} de tráfico` : ""}`)
		: T("No fine recording (older than 7 days): positions from the log", "Sin grabación fina (más de 7 días): posiciones del registro");
	if (track.length) played = Math.max(played, track[track.length - 1].t);

	function where(time) {
		if (track.length) return lib.sampleAt(track, time);
		const i = at(placed, time);
		if (i < 0) return placed[0] ? { x: placed[0].p[0], y: placed[0].p[1], z: placed[0].p[2], heading: 0, riding: false } : null;
		const a = placed[i], b = placed[i + 1];
		if (!b) return { x: a.p[0], y: a.p[1], z: a.p[2], heading: 0, riding: false };
		const f = Math.min(1, Math.max(0, (time - a.t) / Math.max(b.t - a.t, 0.001)));
		const heading = Math.atan2(-(b.p[0] - a.p[0]), -(b.p[2] - a.p[2]));
		return { x: a.p[0] + (b.p[0] - a.p[0]) * f, y: a.p[1] + (b.p[1] - a.p[1]) * f, z: a.p[2] + (b.p[2] - a.p[2]) * f, heading, riding: false };
	}
	let shownFrame = null;
	function render() {
		$("#rtime").textContent = `${stamp(t)} / ${stamp(played)}`;
		const share = (100 * t) / played;
		$("#rtrack .fill").style.width = share + "%";
		$("#rtrack .knob").style.left = share + "%";
		const pose = where(t);
		const look = looks.length ? looks[Math.max(0, at(looks, t))] : null;
		const near = lib && cars.length ? lib.carsAt(cars, t) : [];
		if (pose) {
			if (view === "3d" && view3d) view3d.show(pose, look, snap, near, t);
			else mini.marker(pose.x, pose.z, near);
		}
		snap = false;
		const cursor = $("#rcursor");
		const showCursor = look && look.cursor && look.mx != null && t - look.t < 2;
		cursor.hidden = !showCursor;
		if (showCursor) (cursor.style.left = look.mx * 100 + "%"), (cursor.style.top = look.my * 100 + "%");
		// the window open: its picture when we have one, else a plain card with its name
		const wi = at(windows, t);
		const open = wi >= 0 && /^Abrió /.test(windows[wi].s) ? windows[wi].s.slice(6) : null;
		const key = open ? windowKey[open] : null;
		const picture = key && FRAMES[key] ? FRAMES[key] : null;
		$("#rframe").hidden = !picture;
		if (picture && shownFrame !== key) {
			$("#rframe").className = `frame${picture.full ? " full" : ""}`;
			$("#rframe").innerHTML = `<img src="/frames/${picture.file}" alt="${esc(open)}"/>`;
		}
		shownFrame = picture ? key : null;
		$("#rwin").hidden = !open || !!picture;
		if (open && !picture) $("#rwin").innerHTML = `<b>${esc(open)} <span>${icon("x")}</span></b><i></i><i style="width:70%"></i><i style="width:45%"></i>`;
		// a big moment: REPLAY, BUSTED, CONTINUE...
		let big = null;
		for (let k = moments.length - 1; k >= 0; k--) {
			const mo = moments[k];
			if (mo.t > t) continue;
			if (t - mo.t <= mo.m.hold) big = mo;
			break;
		}
		$("#rbig").hidden = !big;
		if (big) {
			$("#rbig").className = `big ${big.m.cls}`;
			$("#rbig").innerHTML = `<b>${esc(big.m.label())}</b>${big.m.sub ? `<span>${esc(big.m.sub())}</span>` : ""}`;
		}
		const li = at(lines, t);
		const ev = li >= 0 && t - lines[li].t <= 4 ? lines[li] : null;
		$("#revent").hidden = !ev;
		if (ev) {
			$("#revent").innerHTML = `${icon(eventOf(ev).icon)} ${esc(ev.s)}`;
			$("#revent").classList.toggle("sig", ev.k === "señal");
		}
		let mph = pose?.mph;
		if (mph == null) {
			const si = at(speeds, t);
			mph = si >= 0 && t - speeds[si].t < 40 ? speeds[si].v : 0;
		}
		$("#rspeed").innerHTML = `${int(mph)}<small>mph</small>`;
		const ci = at(cash, t);
		$("#rcash").textContent = ci >= 0 ? money(cash[ci].m) : "";
	}
	async function setView(next) {
		if (next === "3d" && !view3d && lib) {
			$("#r3d").hidden = false;
			view3d = await lib.createReplay3D($("#r3d"));
			if (!view3d) {
				$("#r3d").hidden = true;
				toast(T("The 3D map isn't uploaded yet (Tools.WorldExport in Studio)", "El mapa 3D no se ha subido (Tools.WorldExport en Studio)"));
				next = "map";
			}
		}
		view = next;
		$("#r3d").hidden = view !== "3d";
		$("#rmap").style.visibility = view === "3d" ? "hidden" : "visible";
		$$("#rview button").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
		snap = true;
		render();
	}
	$$("#rview button").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
	$$("#rcam button").forEach(
		(b) =>
			(b.onclick = () => {
				view3d?.setMode(b.dataset.c);
				$$("#rcam button").forEach((x) => x.classList.toggle("on", x === b));
				snap = true;
				render();
			}),
	);
	function step(now) {
		if (!playing) return;
		t = Math.min(played, t + ((now - last) / 1000) * rate);
		last = now;
		render();
		if (t >= played) return setPlaying(false);
		frame = requestAnimationFrame(step);
	}
	function setPlaying(on) {
		playing = on;
		$("#rplay").innerHTML = icon(on ? "pause" : "play");
		cancelAnimationFrame(frame);
		if (on) {
			if (t >= played) t = 0;
			last = performance.now();
			frame = requestAnimationFrame(step);
		}
	}
	$("#rplay").onclick = () => setPlaying(!playing);
	$$("#rspeedseg button").forEach(
		(b) =>
			(b.onclick = () => {
				rate = Number(b.dataset.x);
				$$("#rspeedseg button").forEach((x) => x.classList.toggle("on", x === b));
			}),
	);
	const bar = $("#rtrack");
	const seekFrom = (e) => {
		const box = bar.getBoundingClientRect();
		t = Math.min(played, Math.max(0, ((e.clientX - box.left) / box.width) * played));
		snap = true;
		render();
	};
	bar.addEventListener("pointerdown", (e) => {
		seekFrom(e);
		const move = (ev) => seekFrom(ev);
		const up = () => (removeEventListener("pointermove", move), removeEventListener("pointerup", up));
		addEventListener("pointermove", move);
		addEventListener("pointerup", up);
	});
	await setView(track.length && lib ? "3d" : "map");
	replayStop = () => {
		setPlaying(false);
		view3d?.dispose();
	};
	return {
		seek(time) {
			t = Math.min(played, Math.max(0, time));
			snap = true;
			render();
		},
	};
}

/* ---------------- sessions: players and the latest sessions ---------------- */
async function sessionsPage(q, version) {
	app.innerHTML = `<div class="stack">
		<div class="crumbs"><b>${T("Sessions", "Sesiones")}</b>${version ? ` · ${T("version", "versión")} ${esc(version)} <a href="#/sesiones">${T("clear", "quitar")}</a>` : ""}</div>
		<div class="card"><form id="find" class="filters" style="margin:0">
			<input id="q" placeholder="${T("Find a player by name or UserId", "Busca un jugador por nombre o UserId")}" value="${esc(q || "")}" style="flex:1;min-width:220px;font-size:15px;padding:9px 12px" />
			<button class="primary">${icon("search")} ${T("Search", "Buscar")}</button>${periodPicker()}</form></div>
		<div class="card"><h2 id="players-title">${T("Players", "Jugadores")}</h2><div id="players" class="scroll"></div></div>
		<div class="card"><h2>${T("Latest sessions", "Últimas sesiones")}</h2><div id="recent" class="scroll"></div></div>
	</div>`;
	wirePeriod(() => sessionsPage($("#q").value.trim()));
	$("#find").onsubmit = (e) => {
		e.preventDefault();
		const value = $("#q").value.trim();
		if (/^\d{3,}$/.test(value)) location.hash = `#/p/${value}`;
		else loadPlayers(value);
	};
	loadPlayers(q || "");
	const r = await api(
		"/api/sessions?" + qs(version ? { version, days: 0, studio: state.studio ? 1 : "", limit: 300 } : { days: state.days, studio: state.studio ? 1 : "", limit: 80 }),
	);
	$("#recent").innerHTML = r.sessions.length
		? `<table><tr><th>${T("Player", "Jugador")}</th><th>${T("When", "Cuándo")}</th><th>${T("Type", "Tipo")}</th><th class="num">${T("Length", "Duró")}</th><th>${T("Device", "Equipo")}</th><th>${T("Why they left", "Por qué se fue")}</th><th>Tutorial</th></tr>${r.sessions
				.map(
					(x) => `<tr class="link" data-id="${x.id}"><td>${who(x)}</td><td>${when(x.started_at)} ${liveBadge(x, r.now, r.live)}</td><td>${kindBadge(x)}</td>
					<td class="num">${dur(x.played ?? x.last_at - x.started_at)}</td><td>${esc(deviceName(x.device))}</td><td>${esc(x.reason || "—")}</td><td>${tutorialText(x)}</td></tr>`,
				)
				.join("")}</table>`
		: `<div class="empty">${T("No sessions in this period.", "Sin sesiones en este periodo.")}</div>`;
	$$("#recent tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = `#/s/${tr.dataset.id}`)));
}

/* ---------------- funnels: the tutorial, step by step ---------------- */
async function funnelsPage() {
	const chosen = { version: state.funnelVersion || null, step: null };
	app.innerHTML = `<div class="stack">
		<div class="crumbs"><b>Funnels</b></div>
		<div class="card"><div class="filters" style="margin:0">
			<div class="seg" id="vseg"></div>${periodPicker()}
			<span class="livepill right"><span class="dot good"></span> ${T("Updates every 15 s", "Se actualiza cada 15 s")}</span></div></div>
		<div id="fkpis"></div>
		<div class="grid cols-2" style="grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)">
			<div class="card"><div class="cardhead"><h2>${icon("funnel")} ${T("New players' tutorial", "Tutorial de los nuevos")}</h2></div>
				<p class="muted hint">${T("Blue: reached the step. Green: on it now. Click a step to see who left there and why.", "Azul: llegaron al paso. Verde: están ahí ahora. Clic en un paso para ver quién se fue y por qué.")}</p>
				<div class="fsteps" id="fsteps"></div></div>
			<div class="card"><div id="fside"><div class="empty">${T("Pick a step.", "Elige un paso.")}</div></div></div>
		</div>
	</div>`;
	wirePeriod(funnelsPage);
	async function load() {
		const r = await api("/api/funnel?" + qs({ days: state.days, studio: state.studio ? 1 : "" }));
		const isLive = (x) => !x.ended && r.now - x.last_at < r.live;
		const versions = {};
		for (const x of r.sessions) (versions[x.tut_version || "?"] ||= []).push(x);
		const names = Object.keys(versions).sort((a, b) => versions[b].length - versions[a].length);
		if (!chosen.version || !versions[chosen.version]) chosen.version = names[0] || null;
		$("#vseg").innerHTML = names.map((v) => `<button class="${v === chosen.version ? "on" : ""}" data-v="${esc(v)}">Tutorial ${esc(v)}<span class="n">${versions[v].length}</span></button>`).join("");
		$$("#vseg button").forEach((b) => (b.onclick = () => ((chosen.version = state.funnelVersion = b.dataset.v), (chosen.step = null), load())));
		const rows = versions[chosen.version] || [];
		if (!rows.length) {
			$("#fsteps").innerHTML = `<div class="empty">${T("No new players in this period.", "Sin jugadores nuevos en este periodo.")}</div>`;
			$("#fkpis").innerHTML = "";
			return;
		}
		const total = rows.length;
		const steps = Math.max(...rows.map((x) => x.total || 0), ...rows.map((x) => x.tut_step || 0), 1);
		const stepName = {};
		for (const x of rows) if (x.tut_step && x.step_name && !stepName[x.tut_step]) stepName[x.tut_step] = x.step_name;
		for (let k = 1; k <= Math.max(...rows.map((x) => x.total || 0), ...rows.map((x) => x.tut_step || 0), 1); k++) stepName[k] = stepLabel(chosen.version, k, stepName[k]);
		const done = rows.filter((x) => x.tut_done).length;
		const playing = rows.filter(isLive).length;
		const left = (k) => rows.filter((x) => x.ended && !x.tut_done && (x.tut_step || 0) === k);
		$("#fkpis").innerHTML = `<div class="kpis">
			<div class="kpi">${icon("users")}<div><div class="label">${T("Started", "Empezaron")}</div><div class="value">${int(total)}</div><div class="sub">${T("new players", "jugadores nuevos")}</div></div></div>
			<div class="kpi">${icon("check")}<div><div class="label">${T("Finished", "Terminaron")}</div><div class="value">${pct(done, total)}</div><div class="sub">${T(`${int(done)} of ${int(total)}`, `${int(done)} de ${int(total)}`)}</div></div></div>
			<div class="kpi">${icon("clock")}<div><div class="label">${T("In it now", "En el tutorial ahora")}</div><div class="value">${int(playing)}</div><div class="sub">${T("playing", "jugando")}</div></div></div>
			<div class="kpi">${icon("alert")}<div><div class="label">${T("Left before step 1", "Se fueron antes del paso 1")}</div><div class="value">${int(left(0).length)}</div><div class="sub">${T("loading or in the menu", "cargando o en el menú")}</div></div></div></div>`;
		let prev = total;
		const list = [];
		for (let k = 1; k <= steps; k++) {
			const reached = rows.filter((x) => x.tut_done || (x.tut_step || 0) >= k).length;
			const now = rows.filter((x) => isLive(x) && !x.tut_done && x.tut_step === k).length;
			list.push({ k, reached, now, gone: left(k).length, fromPrev: prev - reached });
			prev = reached;
		}
		$("#fsteps").innerHTML =
			list
				.map(
					(st) => `<div class="step ${chosen.step === st.k ? "on" : ""}" data-k="${st.k}">
				<div class="num">${st.k}</div><div class="name" title="${esc(stepName[st.k] || "")}">${esc(stepName[st.k] || `${T("Step", "Paso")} ${st.k}`)}</div>
				<div class="track"><div class="reach" style="width:${(100 * st.reached) / total}%"></div>${st.now ? `<div class="live" style="left:${(100 * (st.reached - st.now)) / total}%;width:${(100 * st.now) / total}%"></div>` : ""}</div>
				<div class="stat"><b>${int(st.reached)}</b> · ${pct(st.reached, total)}${st.gone ? ` <span class="drop">−${st.gone}</span>` : ""}</div></div>`,
				)
				.join("") +
			`<div class="step" data-k="done"><div class="num">${icon("check")}</div><div class="name">${T("Finished", "Terminado")}</div><div class="track"><div class="reach" style="width:${(100 * done) / total}%;background:var(--good)"></div></div><div class="stat"><b>${int(done)}</b> · ${pct(done, total)}</div></div>`;
		$$("#fsteps .step[data-k]").forEach((el) => (el.onclick = () => ((chosen.step = el.dataset.k === "done" ? "done" : Number(el.dataset.k)), side())));
		function side() {
			$$("#fsteps .step").forEach((el) => el.classList.toggle("on", String(chosen.step) === el.dataset.k));
			if (chosen.step == null) return;
			const k = chosen.step;
			const gone = k === "done" ? [] : left(k);
			const here = k === "done" ? rows.filter((x) => x.tut_done) : rows.filter((x) => isLive(x) && !x.tut_done && x.tut_step === k);
			const reasons = {};
			for (const x of gone) {
				const name = reasonOf(x.reason_w, x.reason).name;
				reasons[name] = (reasons[name] || 0) + 1;
			}
			const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
			const row = (x) => `<tr class="link" data-id="${x.id}"><td>${who(x, ago(x.started_at, r.now))}</td>
				<td>${x.in_step != null ? dur(x.in_step) : "—"}</td><td>${esc(x.reason || (isLive(x) ? T("Playing", "Jugando") : "—"))}<div>${tagChips(x.tags)}</div></td></tr>`;
			$("#fside").innerHTML = `<h2>${k === "done" ? T("Finished the tutorial", "Terminaron el tutorial") : `${T("Step", "Paso")} ${k}${stepName[k] ? ` · ${esc(stepName[k])}` : ""}`}</h2>
				${top.length ? `<h2 style="font-size:13px;margin-top:10px">${T("Why they left here", "Por qué se fueron aquí")}</h2>${bars(top.map(([name, n]) => ({ name, n })), { label: (x) => esc(x.name), value: (x) => x.n, color: "var(--s2)" })}` : ""}
				${gone.length ? `<h2 style="font-size:13px;margin-top:12px">${T(`Left on this step (${gone.length})`, `Se fueron en este paso (${gone.length})`)}</h2><div class="scroll"><table><tr><th>${T("Player", "Jugador")}</th><th>${T("On the step", "En el paso")}</th><th>${T("Reason · signals", "Motivo · señales")}</th></tr>${gone.map(row).join("")}</table></div>` : ""}
				${here.length ? `<h2 style="font-size:13px;margin-top:12px">${k === "done" ? T("Players", "Jugadores") : T("On this step now", "En este paso ahora")} (${here.length})</h2><div class="scroll"><table><tr><th>${T("Player", "Jugador")}</th><th>${T("On the step", "En el paso")}</th><th>${T("Status", "Estado")}</th></tr>${here.map(row).join("")}</table></div>` : ""}
				${!gone.length && !here.length ? `<div class="empty">${T("Nobody left on this step.", "Nadie se fue en este paso.")}</div>` : ""}`;
			$$("#fside tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = `#/s/${tr.dataset.id}`)));
		}
		side();
	}
	await load();
	refreshTimer = setInterval(() => load().catch(() => {}), 15000);
}

/* ---------------- A/B tests (2026-11-12): Roblox's experiments, live from our sessions ----------------
   Roblox (Creator Hub) gives each player a variant through Config keys and reports days later; the game sends what each
   player got with every send, so this shows the same split as sessions come. A card per experiment: rows are metrics,
   columns variants (the first is the control); the better one in a row is only marked once every variant has the
   players the server asks for (min), and each other variant shows how far it is from the control. */
const AB_DAYS = [1, 3, 7, 14, 30];
const AB_REFRESH = 30; // seconds between asks while the page is in view (each ask reads every session in the period)
const AB_IDLE = 30; // minutes with no mouse or keys before the page stops asking (one left open all day would read all day)
let lastActive = Date.now();
for (const name of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) addEventListener(name, () => (lastActive = Date.now()), { passive: true });
// What each experiment the game reports is: its variants and the metric that decides it (its row in bold)
const AB_TESTS = {
	CrashPanel: {
		goal: "avg_played",
		goalText: T("Goal: playtime (average session)", "Meta: tiempo de juego (duración media)"),
		variants: {
			On: T("the crash summary and the eyelids, as before", "el resumen de choque y los párpados, como antes"),
			Off: T(
				"no summary nor eyelids: you keep riding, the streak ends and the offer shows below",
				"sin resumen ni párpados: sigue manejando, pierde la racha y abajo sale la oferta",
			),
		},
	},
	StreakOffer: {
		goal: "robux_per_player",
		goalText: T("Goal: Robux (per player, and the streak's Robux, purchases and offers taken)", "Meta: Robux (por jugador, y los Robux, compras y ofertas aceptadas de la racha)"),
		variants: { Recover: T("keep the streak going (revive)", "seguir con la racha (revivir)"), Double: T("double the lost streak's points", "duplicar los puntos de la racha perdida") },
	},
	TutorialVersion: {
		goal: "tut_done_share",
		goalText: T("Goal: tutorial completion (new players)", "Meta: completar el tutorial (jugadores nuevos)"),
		variants: { A: T("dealership first", "primero el concesionario"), B: T("road first", "primero la carretera") },
	},
	TutorialShade: {
		goal: "tut_done_share",
		goalText: T("Goal: tutorial completion (new players)", "Meta: completar el tutorial (jugadores nuevos)"),
		variants: { On: T("dark frames round what to press", "marcos oscuros alrededor de lo que hay que tocar"), Off: T("no dark frames", "sin marcos oscuros") },
	},
};
const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const dec = (n) => (n == null ? "—" : nf1.format(n));
const abShare = (x) => (x == null ? "—" : Math.round(100 * x) + "%");
// The table's rows. rate: the number compared between variants (none: a count, which only says how big each side is);
// better: 1 the higher wins, 0 compared but neither way is better (crashes: riding more is crashing more). only: rows for
// the tutorial experiments or the others (the streak's)
const AB_ROWS = [
	{ id: "players", name: T("Players", "Jugadores"), show: (v) => int(v.players), sub: (v) => T(`${int(v.sessions)} sessions`, `${int(v.sessions)} sesiones`) },
	{ id: "new_players", name: T("New players", "Jugadores nuevos"), show: (v) => int(v.new_players) },
	{ id: "avg_played", name: T("Average session", "Duración media"), show: (v) => dur(v.avg_played), rate: (v) => v.avg_played, better: 1 },
	{ id: "median_played", name: T("Median session", "Duración mediana"), show: (v) => dur(v.median_played), rate: (v) => v.median_played, better: 1 },
	{
		id: "long_share",
		name: T("Sessions of 5 min or more", "Sesiones de 5 min o más"),
		show: (v) => abShare(v.long_share),
		sub: (v) => T(`${int(v.long_sessions)} of ${int(v.ended)}`, `${int(v.long_sessions)} de ${int(v.ended)}`),
		rate: (v) => v.long_share,
		better: 1,
	},
	{
		id: "returning_share",
		name: T("Came back another day", "Volvieron otro día"),
		show: (v) => abShare(v.returning_share),
		sub: (v) => T(`${int(v.returning)} players`, `${int(v.returning)} jugadores`),
		rate: (v) => v.returning_share,
		better: 1,
	},
	{
		id: "robux_per_player",
		name: T("Robux per player", "Robux por jugador"),
		show: (v) => (v.robux_per_player == null ? "—" : "R$ " + dec(v.robux_per_player)),
		sub: (v) => `R$ ${int(v.robux)} total`,
		rate: (v) => v.robux_per_player,
		better: 1,
	},
	{
		id: "payer_share",
		name: T("Players who paid", "Jugadores que pagaron"),
		show: (v) => abShare(v.payer_share),
		sub: (v) => T(`${int(v.payers)} players`, `${int(v.payers)} jugadores`),
		rate: (v) => v.payer_share,
		better: 1,
	},
	{
		id: "tut_done_share",
		only: "tutorial",
		name: T("Finished the tutorial (new players)", "Terminaron el tutorial (nuevos)"),
		show: (v) => abShare(v.tut_done_share),
		sub: (v) => T(`${int(v.new_done)} of ${int(v.new_players)}`, `${int(v.new_done)} de ${int(v.new_players)}`),
		rate: (v) => v.tut_done_share,
		better: 1,
	},
	{ id: "crashes_per_session", name: T("Crashes per session", "Choques por sesión"), show: (v) => dec(v.crashes_per_session), rate: (v) => v.crashes_per_session, better: 0 },
	{ id: "streak_offers", only: "streak", name: T("Streak offers shown", "Ofertas de racha mostradas"), show: (v) => int(v.streak.offers) },
	{
		id: "streak_taken",
		only: "streak",
		name: T("Offers taken", "Ofertas aceptadas"),
		show: (v) => int(v.streak.taken),
		sub: (v) => T(`${pct(v.streak.taken, v.streak.offers)} of offers`, `${pct(v.streak.taken, v.streak.offers)} de las ofertas`),
		rate: (v) => (v.streak.offers ? v.streak.taken / v.streak.offers : null),
		better: 1,
	},
	{
		id: "streak_bought",
		only: "streak",
		name: T("Bought with Robux", "Compradas con Robux"),
		show: (v) => int(v.streak.bought),
		sub: (v) => T(`${pct(v.streak.bought, v.streak.offers)} of offers`, `${pct(v.streak.bought, v.streak.offers)} de las ofertas`),
		rate: (v) => (v.streak.offers ? v.streak.bought / v.streak.offers : null),
		better: 1,
	},
	{
		id: "streak_robux",
		only: "streak",
		name: T("Streak Robux", "Robux de la racha"),
		show: (v) => "R$ " + int(v.streak.robux),
		sub: (v) => (v.players ? T(`R$ ${dec(v.streak.robux / v.players)} per player`, `R$ ${dec(v.streak.robux / v.players)} por jugador`) : ""),
		rate: (v) => (v.players ? v.streak.robux / v.players : null),
		better: 1,
	},
];
function abCard(x, min) {
	const known = AB_TESTS[x.key];
	const vs = x.variants;
	const enough = vs.length > 1 && vs.every((v) => v.players >= min);
	const tutorial = x.key.startsWith("Tutorial");
	const head = `<div class="cardhead"><h2>${icon("split")} ${esc(x.key)}</h2>${enough ? "" : `<span class="tag right">${T("not enough players yet", "aún pocos jugadores")}</span>`}</div>
		<ul class="abvars">${vs
			.map(
				(v, i) =>
					`<li><b>${esc(v.variant)}</b>${i === 0 ? ` <span class="muted">(${T("control", "control")})</span>` : ""} · ${esc(known?.variants[v.variant] || T("no description yet", "sin descripción aún"))}</li>`,
			)
			.join("")}</ul>
		${known ? `<p class="abgoal"><b>${known.goalText}</b></p>` : ""}`;
	if (!vs.some((v) => v.sessions > 0))
		return `<div class="card abtest">${head}<div class="empty">${T("No sessions with this experiment in this period yet.", "Aún no hay sesiones con este experimento en este periodo.")}</div></div>`;
	const rows = AB_ROWS.filter((r) => !r.only || (r.only === "tutorial") === tutorial);
	const body = rows
		.map((r) => {
			const rates = vs.map((v) => (r.rate ? r.rate(v) : null));
			// (the best only when it's alone at the top, by at least half a percent: no "+0%" marked better)
			let best = -1;
			if (enough && r.better) {
				const have = rates.filter((n) => n != null).sort((a, b) => b - a);
				if (have.length > 1 && have[0] > 0 && (have[0] - have[1]) / Math.abs(have[1] || have[0]) >= 0.005) best = rates.indexOf(have[0]);
			}
			const goal = known?.goal === r.id;
			const cells = vs.map((v, i) => {
				let diff = "";
				if (i > 0 && rates[0] && rates[i] != null) {
					const d = Math.round((100 * (rates[i] - rates[0])) / rates[0]);
					const tone = !enough || !r.better || d === 0 ? "flat" : d > 0 ? "good" : "bad";
					diff = `<span class="diff ${tone}">${d < 0 ? "−" : "+"}${Math.abs(d)}%</span>`;
				}
				const value = r.show(v);
				const sub = r.sub ? r.sub(v) : "";
				return `<td class="num${i === best ? " win" : ""}">${goal || i === best ? `<b>${value}</b>` : value}${diff}${sub ? `<span class="sub">${sub}</span>` : ""}</td>`;
			});
			return `<tr${goal ? ` class="goal"` : ""}><td>${goal ? `<b>${r.name}</b>` : r.name}</td>${cells.join("")}</tr>`;
		})
		.join("");
	const note = enough
		? ""
		: `<p class="muted abnote">${T(
				`The better side is marked once every variant has ${min} players (now ${vs.map((v) => `${esc(v.variant)} ${int(v.players)}`).join(", ")}).`,
				`El mejor se marca cuando cada variante tenga ${min} jugadores (ahora ${vs.map((v) => `${esc(v.variant)} ${int(v.players)}`).join(", ")}).`,
			)}</p>`;
	return `<div class="card abtest">${head}
		<div class="scroll"><table class="abt"><tr><th>${T("Metric", "Métrica")}</th>${vs.map((v, i) => `<th class="num">${esc(v.variant)}${i === 0 ? ` <small>${T("control", "control")}</small>` : ""}</th>`).join("")}</tr>${body}</table></div>
		${note}</div>`;
}
// The A/B variants a session had, one chip (sessions.ab; none before 2026-11-12)
function abChip(ab) {
	let list = {};
	try {
		list = JSON.parse(ab || "{}") || {};
	} catch {}
	const text = Object.entries(list)
		.map(([key, variant]) => `${key} ${variant}`)
		.join(" · ");
	return text ? `<span class="chip static" title="${T("A/B test variants", "Variantes de las pruebas A/B")}">${icon("split")} ${esc(text)}</span>` : "";
}
async function abPage() {
	let days = AB_DAYS.includes(prefs.abDays) ? prefs.abDays : 7;
	app.innerHTML = `<div class="stack">
		<div class="crumbs"><b>${T("A/B tests", "Pruebas A/B")}</b></div>
		<div class="card"><div class="filters" style="margin:0">
			<label>${T("Period", "Periodo")}</label>
			<select id="abdays">${AB_DAYS.map((d) => `<option value="${d}" ${d === days ? "selected" : ""}>${d === 1 ? T("Last 24 h", "Últimas 24 h") : T(`Last ${d} days`, `Últimos ${d} días`)}</option>`).join("")}</select>
			<label><input type="checkbox" id="studio" ${state.studio ? "checked" : ""}/> Studio</label>
			<span class="livepill" style="margin-left:auto" title="${T(
				"Every update reads each session in the period: the more sessions, the less often it updates (D1's free plan reads 5M rows a day).",
				"Cada actualización lee todas las sesiones del periodo: cuantas más hay, menos seguido se actualiza (el plan gratis de D1 lee 5M filas al día).",
			)}"><span class="dot good" id="abdot"></span> ${T("Live", "En vivo")} · <span id="abago"></span></span></div></div>
		<div class="banner ok">${icon("info")}<div><b>${T("Roblox's experiment, live", "El experimento de Roblox, en vivo")}</b>
			<span>${T(
				"Roblox's own experiment (Creator Hub) assigns the variants through Config keys and reports days later; this page shows the same split live from our sessions.",
				"El experimento de Roblox (Creator Hub) reparte las variantes con las Config keys y da sus resultados días después; esta página muestra el mismo reparto en vivo con nuestras sesiones.",
			)}</span></div></div>
		<div class="grid cols-2" id="abcards"><p class="muted">${T("Loading…", "Cargando…")}</p></div>
	</div>`;
	let updated = 0, next = 0, every = AB_REFRESH, busy = false, failed = false, seq = 0;
	const idle = () => Date.now() - lastActive > AB_IDLE * 60000;
	const tick = () => {
		const el = $("#abago");
		if (!el) return clearInterval(refreshTimer); // (the page was left, or the login showed)
		const s = Math.max(0, Math.round((Date.now() - updated) / 1000));
		const ago = s < 120 ? T(`updated ${s} s ago`, `actualizado hace ${s} s`) : T(`updated ${Math.floor(s / 60)} min ago`, `actualizado hace ${Math.floor(s / 60)} min`);
		el.textContent = !updated
			? T("loading…", "cargando…")
			: failed
				? T("couldn't update, retrying", "no se pudo actualizar, reintentando")
				: idle()
					? `${ago} · ${T("paused: nobody at the page", "en pausa: nadie en la página")}`
					: every > AB_REFRESH
						? `${ago} · ${T(`every ${dur(every)}`, `cada ${dur(every)}`)}`
						: ago;
		$("#abdot")?.setAttribute("class", `dot ${failed || idle() ? "warn" : "good"}`);
	};
	async function load(first = false) {
		const mine = ++seq;
		busy = true;
		next = Date.now() + AB_REFRESH * 1000;
		try {
			const r = await api("/api/ab?" + qs({ days, studio: state.studio ? 1 : "" }));
			if (mine !== seq || !$("#abcards")) return; // (a newer ask, or the page left)
			// (age: how old the server's answer is; every: how long it keeps one for this period, longer the more sessions
			// it has, so asking before that only gets the same numbers)
			updated = Date.now() - (r.age || 0) * 1000;
			every = r.every || AB_REFRESH;
			next = Date.now() + Math.max(AB_REFRESH, every - (r.age || 0) + 1) * 1000;
			failed = false;
			$("#abcards").innerHTML = r.experiments.map((x) => abCard(x, r.min)).join("");
		} catch (err) {
			if (first) throw err;
			failed = true;
		} finally {
			if (mine === seq) busy = false;
			tick();
		}
	}
	$("#abdays").onchange = (e) => {
		days = prefs.abDays = Number(e.target.value);
		savePrefs({ abDays: days });
		load();
	};
	$("#studio").onchange = (e) => {
		state.studio = e.target.checked;
		savePrefs();
		load();
	};
	await load(true);
	// (every second the "updated" clock; the numbers when they're due, only while the tab is in view and someone's at it)
	refreshTimer = setInterval(() => {
		tick();
		if (!busy && !document.hidden && !idle() && Date.now() >= next) load();
	}, 1000);
}

function detailHtml(sum) {
	const list = (rows) => (rows.length ? `<ul class="plain">${rows.map((r) => `<li>${r}</li>`).join("")}</ul>` : `<div class="empty">${T("Nothing.", "Nada.")}</div>`);
	const windows = Object.values(sum.windows || {}).sort((a, b) => b.seconds - a.seconds);
	return `<div class="grid cols-3">
		<div class="card"><h2>${T("Purchases", "Compras")}</h2>
			${list((sum.bought || []).map((b) => `${esc(b.n)} <span class="muted">${esc(b.g)} · ${money(b.p)}</span>`))}
			<h2 style="margin-top:12px">${T("Couldn't buy", "No pudo comprar")}</h2>
			${list((sum.tried || []).map((b) => `${esc(b.n)} <span class="muted">${esc(b.why)}${b.p ? " · " + money(b.p) : ""}${b.c > 1 ? ` · ×${b.c}` : ""}</span>`))}
			${sum.robuxBought?.length ? `<h2 style="margin-top:12px">Robux</h2>${list(sum.robuxBought.map(esc))}` : ""}
		</div>
		<div class="card"><h2>${T("Windows", "Ventanas")}</h2>${list(windows.map((w) => `${esc(w.name)} <span class="muted">×${w.opens} · ${dur(w.seconds)}</span>`))}</div>
		<div class="card"><h2>${T("Where the cash came from", "De dónde salió el dinero")}</h2>${list(
			Object.entries(sum.income || {})
				.sort((a, b) => b[1] - a[1])
				.map(([k, v]) => `${esc(k)} <span class="muted">${money(v)}</span>`),
		)}
			${sum.friends?.length ? `<h2 style="margin-top:12px">${T("Friends on the server", "Amigos en el server")}</h2>${list(sum.friends.map(esc))}` : ""}</div>
	</div>`;
}

/* ---------------- the points map (all players) ---------------- */
async function mapPage() {
	const chosen = new Set(prefs.mapKinds || ["señal", "moto", "servidor"]);
	const mode = state.mapMode || "points";
	app.innerHTML = `<div class="stack">
		<div class="card"><div class="filters" style="margin:0">
			<div class="chips" style="margin:0"><button class="chip ${mode === "points" ? "on" : ""}" data-mode="points">${icon("pin")} ${T("Points", "Puntos")}</button><button class="chip ${mode === "heat" ? "on" : ""}" data-mode="heat">${icon("layers")} ${T("Exit heat", "Calor de salidas")}</button></div>
			${periodPicker()}
			${mode === "points" ? `<input id="mq" placeholder="${T("Filter by text (e.g. Chocó, BUSTED, Garage)", "Filtrar por texto (ej. Chocó, BUSTED, Garage)")}" style="flex:1;min-width:200px"/>` : ""}</div>
			<div class="chips" id="mchips" style="margin:10px 0 0"></div></div>
		${mode === "heat" ? `<div class="grid cols-2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">` : ""}
		<div class="card"><h2 id="mtitle">${T("Points map", "Mapa de puntos")}</h2>
			${mode === "points" ? `<div class="chips" id="zchips" style="margin:0 0 8px"><span class="muted" style="font-size:12px;align-self:center">${T("Go to:", "Ir a:")}</span>${ZONES.map((zone, i) => `<button class="chip" data-zone="${i}">${esc(zone.name)}</button>`).join("")}</div>
			<div id="zphoto" hidden style="margin:0 0 10px"></div>` : ""}
			<div id="gmap" style="height:640px"></div><div class="legend" id="glegend"></div>
		<p class="muted hint">${T("Drag to move, scroll to zoom.", "Arrastra para moverte, rueda para acercar.")}${mode === "points" ? T(" Numbers are groups of nearby points: click to zoom in.", " Los números son grupos de puntos cercanos: clic para acercar.") : T(" Darker = more players left there.", " Más oscuro = más jugadores se salieron ahí.")}</p></div>
		${mode === "heat" ? `<div class="card"><h2>${T("Hottest spots", "Zonas más calientes")}</h2><div id="hot"></div></div></div>` : ""}
	</div>`;
	wirePeriod(mapPage);
	$$("[data-mode]").forEach(
		(b) =>
			(b.onclick = () => {
				state.mapMode = b.dataset.mode;
				mapPage();
			}),
	);
	if (mode === "heat") return heatPage();
	const renderChips = () => {
		$("#mchips").innerHTML = MAP_KINDS.map((k) => `<button class="chip ${chosen.has(k) ? "on" : ""}" data-k="${k}">${icon(kindIcon(k))} ${esc(kindName(k))}</button>`).join("");
		$$("#mchips [data-k]").forEach(
			(b) =>
				(b.onclick = () => {
					chosen.has(b.dataset.k) ? chosen.delete(b.dataset.k) : chosen.add(b.dataset.k);
					prefs.mapKinds = [...chosen];
					savePrefs({ mapKinds: [...chosen] });
					renderChips();
					load();
				}),
		);
	};
	let timer;
	$("#mq").oninput = () => (clearTimeout(timer), (timer = setTimeout(load, 300)));
	let view = null;
	// a zone: the map goes there and its photo shows above it (what part of the map that is)
	$$("#zchips [data-zone]").forEach(
		(b) =>
			(b.onclick = () => {
				const zone = ZONES[Number(b.dataset.zone)];
				$$("#zchips [data-zone]").forEach((x) => x.classList.toggle("on", x === b));
				$("#zphoto").hidden = false;
				$("#zphoto").innerHTML = `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><img src="${zone.photo}" alt="${esc(zone.name)}" style="width:min(420px,100%);aspect-ratio:16/9;object-fit:cover;border-radius:8px"/>
					<div><b>${esc(zone.name)}</b><div class="muted" style="font-size:12px">${int(zone.x)}, ${int(zone.z)} · ${int(zone.r)} studs</div>
					<button class="small" data-tpz style="margin-top:6px">${T("Copy TP", "Copiar TP")}</button> <button class="small" data-zclose>${T("Close", "Cerrar")}</button></div></div>`;
				$("[data-tpz]", $("#zphoto")).onclick = () => copy(tpCommand(zone.x, 30, zone.z), T("TP copied", "TP copiado"));
				$("[data-zclose]", $("#zphoto")).onclick = () => (($("#zphoto").hidden = true), $$("#zchips [data-zone]").forEach((x) => x.classList.remove("on")));
				view?.focus(zone.x, zone.z, Math.max(zone.r * 1.3, 120));
			}),
	);
	async function load() {
		const r = await api("/api/points?" + qs({ days: state.days, kinds: [...chosen].join(","), q: $("#mq").value.trim(), studio: state.studio ? 1 : "", limit: 20000 }));
		$("#mtitle").textContent = `${T("Points map", "Mapa de puntos")} · ${int(r.points.length)} ${T("points", "puntos")}`;
		view = await mapView($("#gmap"), { points: r.points.map(pointOf) });
		legend($("#glegend"), r.points);
	}
	renderChips();
	load();
}

// Where people left, as heat, by kind of reason; and the hottest spots with their most common reason and a TP
async function heatPage() {
	const groups = new Set(state.heatGroups || Object.keys(GROUPS).filter((g) => g !== "otro"));
	const r = await api("/api/exits?" + qs({ days: state.days, studio: state.studio ? 1 : "" }));
	const shape = await getOutline();
	const renderChips = () => {
		$("#mchips").innerHTML = Object.entries(GROUPS)
			.map(([g, info]) => `<button class="chip ${groups.has(g) ? "on" : ""}" data-g="${g}"><span class="dot" style="background:${info.fill}"></span> ${groupName(g)}</button>`)
			.join("");
		$$("#mchips [data-g]").forEach(
			(b) =>
				(b.onclick = () => {
					groups.has(b.dataset.g) ? groups.delete(b.dataset.g) : groups.add(b.dataset.g);
					state.heatGroups = [...groups];
					renderChips();
					draw();
				}),
		);
	};
	const nearest = (x, z) => {
		const zone = zoneOf(x, z);
		if (zone) return zone.name;
		let best = null, dist = Infinity;
		for (const z2 of shape.zones || []) {
			const d = Math.hypot(z2.x - x, z2.z - z);
			if (d < dist) (best = z2), (dist = d);
		}
		return best && dist < 2500 ? best.n : "";
	};
	async function draw() {
		const list = r.exits.filter((e) => groups.has(reasonOf(e.reason_w, e.reason).group));
		$("#mtitle").textContent = `${T("Where they left", "Dónde se salieron")} · ${int(list.length)}`;
		const map = await mapView($("#gmap"), { heat: list });
		$("#glegend").innerHTML = `<span>${T("few", "pocas")}</span><span style="display:inline-block;width:160px;height:10px;border-radius:5px;background:linear-gradient(90deg,${HEAT_RAMP.join(",")})"></span><span>${T("many exits", "muchas salidas")}</span>`;
		// hot spots: 250-stud squares, the most exits first
		const cells = new Map();
		for (const e of list) {
			const key = `${Math.floor(e.x / 250)},${Math.floor(e.z / 250)}`;
			const cell = cells.get(key) || { n: 0, x: 0, y: 0, z: 0, reasons: {}, firsts: 0, ids: [] };
			cell.n += 1;
			cell.x += e.x;
			cell.y += e.y;
			cell.z += e.z;
			cell.firsts += e.first === 1 ? 1 : 0;
			const name = reasonOf(e.reason_w, e.reason).name;
			cell.reasons[name] = (cell.reasons[name] || 0) + 1;
			cell.ids.push(e.session_id);
			cells.set(key, cell);
		}
		const hot = [...cells.values()].sort((a, b) => b.n - a.n).slice(0, 10);
		$("#hot").innerHTML = hot.length
			? `<table>${hot
					.map((c, i) => {
						const x = c.x / c.n, y = c.y / c.n, z = c.z / c.n;
						const top = Object.entries(c.reasons).sort((a, b) => b[1] - a[1]);
						return `<tr><td class="num"><b>#${i + 1}</b></td><td><b>${T(`${int(c.n)} exits`, `${int(c.n)} salidas`)}</b> <span class="muted">${esc(nearest(x, z))}</span>
							<div class="muted" style="font-size:12px">${top.slice(0, 2).map(([n, k]) => `${esc(n)} (${k})`).join(" · ")}${c.firsts ? T(` · ${c.firsts} new`, ` · ${c.firsts} nuevos`) : ""}</div></td>
							<td style="white-space:nowrap"><button class="small ghost" data-focus="${x},${z}">${T("Show", "Ver")}</button> <button class="small ghost" data-tp="${x},${y},${z}">TP</button></td></tr>`;
					})
					.join("")}</table>`
			: `<div class="empty">${T("No exits with these filters.", "Sin salidas con esos filtros.")}</div>`;
		$$("#hot [data-focus]").forEach((b) => (b.onclick = () => map.focus(...b.dataset.focus.split(",").map(Number))));
		$$("#hot [data-tp]").forEach((b) => (b.onclick = () => copy(tpCommand(...b.dataset.tp.split(",").map(Number)), T("TP copied", "TP copiado"))));
	}
	renderChips();
	draw();
}

/* ---------------- versions: logs by game version, how long each was live, download / load / delete / lock ---------------- */
const span = (seconds) => {
	if (!(seconds > 0)) return "—";
	const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
	return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
};
function versionState(v, now) {
	if (v.deleted_at) return `<span class="badge">${T("deleted", "borrada")} ${when(v.deleted_at)}</span>`;
	if (v.deleting) return `<span class="badge warn">${T("deleting…", "borrándose…")}</span>`;
	if (v.current) return `<span class="badge good">${T("current", "la de ahora")}</span>`;
	if (v.locked) return `<span class="badge">${icon("lock")} ${T("locked", "bloqueada")}</span>`;
	const left = (v.delete_at ?? now) - now;
	return `<span class="badge ${left < 2 * 86400 ? "bad" : "warn"}">${T("deleted in", "se borra en")} ${span(Math.max(left, 0))}</span>`;
}
async function exportVersion(version) {
	const out = { format: "nightwheels-version", v: 1, version, exported: Date.now() / 1000, sessions: [] };
	let after = "";
	toast(T(`Downloading version ${version}…`, `Descargando la versión ${version}…`));
	do {
		const r = await api(`/api/versions/${version}/export?` + qs({ after }));
		out.sessions.push(...r.sessions);
		after = r.next;
		toast(T(`Version ${version}: ${int(out.sessions.length)} sessions…`, `Versión ${version}: ${int(out.sessions.length)} sesiones…`));
	} while (after);
	const stream = new Blob([JSON.stringify(out)]).stream().pipeThrough(new CompressionStream("gzip"));
	const file = await new Response(stream).blob();
	const link = document.createElement("a");
	link.href = URL.createObjectURL(file);
	link.download = `nightwheels-v${version}.json.gz`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(link.href), 10000);
	toast(T(`Done: ${int(out.sessions.length)} sessions, ${(file.size / 1048576).toFixed(1)} MB`, `Listo: ${int(out.sessions.length)} sesiones, ${(file.size / 1048576).toFixed(1)} MB`));
}
async function loadArchive(file) {
	const text = await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text();
	const data = JSON.parse(text);
	if (data.format !== "nightwheels-version" || !Array.isArray(data.sessions)) throw new Error(T("That file isn't a version download", "Ese archivo no es una descarga de versión"));
	archive = { version: data.version, exported: data.exported, list: data.sessions, byId: new Map(data.sessions.map((x) => [x.session.id, x])) };
	location.hash = "#/archivo";
}
function versionButtons(v) {
	const out = [];
	if (!v.deleted_at) out.push(`<a class="button small" href="#/sesiones?v=${v.version}">${T("Sessions", "Sesiones")}</a>`);
	if (!v.deleted_at && !v.deleting) out.push(`<button class="small" data-act="download" data-v="${v.version}">${T("Download", "Descargar")}</button>`);
	if (!v.deleted_at && !v.deleting && !v.current)
		out.push(`<button class="small" data-act="${v.locked ? "unlock" : "lock"}" data-v="${v.version}">${v.locked ? T("Unlock", "Quitar lock") : `${icon("lock")} Lock`}</button>`);
	if (!v.deleted_at && !v.deleting && !v.current) out.push(`<button class="small danger" data-act="delete" data-v="${v.version}">${T("Delete", "Borrar")}</button>`);
	return out.join(" ");
}
function wireVersionButtons(root, after) {
	$$("[data-act]", root).forEach(
		(b) =>
			(b.onclick = async () => {
				const v = Number(b.dataset.v);
				try {
					if (b.dataset.act === "download") return await exportVersion(v);
					if (b.dataset.act === "delete" && !confirm(T(`Delete every log of version ${v}? This can't be undone.`, `¿Borrar todos los logs de la versión ${v}? No se puede deshacer.`))) return;
					await post(`/api/versions/${v}`, { action: b.dataset.act });
					toast(
						b.dataset.act === "delete"
							? T(`Version ${v} is being deleted`, `La versión ${v} se está borrando`)
							: b.dataset.act === "lock"
								? T(`Version ${v} locked`, `Versión ${v} bloqueada`)
								: T(`Version ${v} unlocked`, `Versión ${v} desbloqueada`),
					);
					after();
				} catch (err) {
					toast(err.message);
				}
			}),
	);
}
// On the overview: the versions whose logs go soon (not locked), with their buttons
async function versionWarning(el) {
	try {
		const r = await api("/api/versions");
		const soon = r.versions.filter((v) => !v.current && !v.locked && !v.deleted_at && !v.deleting && v.delete_at);
		el.innerHTML = soon
			.map(
				(v) => `<div class="banner warn"><div><b>${T(`Version ${v.version} logs are deleted in ${span(Math.max(v.delete_at - r.now, 0))}`, `Los logs de la versión ${v.version} se borran en ${span(Math.max(v.delete_at - r.now, 0))}`)}</b>
				<span class="muted"> · ${T(`live ${span(v.live_until - v.first_at)}`, `publicada ${span(v.live_until - v.first_at)}`)} · ${T(`${int(v.sessions)} sessions`, `${int(v.sessions)} sesiones`)}</span></div>
				<div>${versionButtons(v)}</div></div>`,
			)
			.join("");
		wireVersionButtons(el, () => versionWarning(el));
	} catch {}
}
async function versionsPage() {
	app.innerHTML = `<div class="stack">
		<div class="crumbs"><b>${T("Versions", "Versiones")}</b></div>
		<div class="card"><h2>${T("Game versions", "Versiones del juego")}</h2>
			<p class="muted hint">${T("A version's logs are deleted 7 days after the next one comes out, unless locked. Download them first to keep them.", "Los logs de una versión se borran 7 días después de que sale la siguiente, salvo con Lock. Descárgalos para guardarlos.")}</p>
			<div id="vlist" class="scroll"><p class="muted">${T("Loading…", "Cargando…")}</p></div></div>
		<div class="card"><h2>${T("Load a file", "Cargar un archivo")}</h2>
			<p class="muted hint">${T("Open a downloaded .json.gz to browse it. It stays in this tab only.", "Abre un .json.gz descargado para verlo. Solo vive en esta pestaña.")}</p>
			<input type="file" id="vfile" accept=".gz,application/gzip" /></div>
	</div>`;
	$("#vfile").onchange = async (e) => {
		const file = e.target.files[0];
		if (!file) return;
		try {
			toast(T("Loading the file…", "Cargando el archivo…"));
			await loadArchive(file);
		} catch (err) {
			toast(err.message);
		}
	};
	const r = await api("/api/versions");
	$("#vlist").innerHTML = r.versions.length
		? `<table><tr><th>${T("Version", "Versión")}</th><th>${T("Published", "Publicada")}</th><th class="num">${T("Live for", "Duró")}</th><th class="num">${T("Sessions", "Sesiones")}</th><th class="num">${T("Players", "Jugadores")}</th><th class="num">${T("Finished tutorial", "Terminaron tutorial")}</th><th class="num">${T("Avg. session", "Duración media")}</th><th>${T("Status", "Estado")}</th><th></th></tr>${r.versions
				.map(
					(v) => `<tr><td><b>${v.version}</b></td><td>${when(v.first_at)}</td><td class="num">${span((v.live_until ?? r.now) - v.first_at)}${v.current ? T(" (live)", " (sigue)") : ""}</td>
					<td class="num">${int(v.sessions)}</td><td class="num">${int(v.players)}</td><td class="num">${v.firsts ? pct(v.tut_done, v.firsts) : "—"}</td>
					<td class="num">${dur(v.avg_played)}</td><td>${versionState(v, r.now)}</td><td style="white-space:nowrap">${versionButtons(v)}</td></tr>`,
				)
				.join("")}</table>`
		: `<div class="empty">${T("No sessions from the published game yet.", "Aún no hay sesiones del juego publicado.")}</div>`;
	wireVersionButtons($("#vlist"), versionsPage);
}
// A loaded file's sessions (Versions > Load a file)
async function archivePage() {
	if (!archive) {
		location.hash = "#/versiones";
		return;
	}
	const rows = [...archive.list].sort((a, b) => b.session.started_at - a.session.started_at);
	app.innerHTML = `<div class="stack">
		<div class="crumbs"><a href="#/versiones">${T("Versions", "Versiones")}</a> › <b>${T(`Version ${esc(archive.version)} file`, `Archivo de la versión ${esc(archive.version)}`)}</b></div>
		<div class="banner"><div><b>${T("Viewing a file from your PC", "Viendo un archivo de tu PC")}</b><span class="muted"> · ${T("downloaded", "descargado")} ${when(archive.exported)} · ${T(`${int(rows.length)} sessions`, `${int(rows.length)} sesiones`)}</span></div>
			<div><button class="small" id="aclose">${T("Close file", "Cerrar archivo")}</button></div></div>
		<div class="card"><h2>${T("Sessions", "Sesiones")}</h2><div class="scroll">${
			rows.length
				? `<table><tr><th>${T("Player", "Jugador")}</th><th>${T("When", "Cuándo")}</th><th>${T("Type", "Tipo")}</th><th class="num">${T("Length", "Duró")}</th><th>${T("Device", "Equipo")}</th><th>${T("Why they left", "Por qué se fue")}</th><th>Tutorial</th></tr>${rows
						.map(
							({ session: x }) => `<tr class="link" data-id="${x.id}"><td>${who(x)}</td><td>${when(x.started_at)}</td><td>${kindBadge(x)}</td>
							<td class="num">${dur(x.played ?? x.last_at - x.started_at)}</td><td>${esc(deviceName(x.device))}</td><td>${esc(x.reason || "—")}</td><td>${tutorialText(x)}</td></tr>`,
						)
						.join("")}</table>`
				: `<div class="empty">${T("The file has no sessions.", "El archivo no trae sesiones.")}</div>`
		}</div></div></div>`;
	$("#aclose").onclick = () => {
		archive = null;
		location.hash = "#/versiones";
	};
	$$("tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = `#/s/${tr.dataset.id}`)));
}

/* ---------------- the frame: sidebar words, language, sign out ---------------- */
$$("[data-icon]").forEach((el) => (el.outerHTML = icon(el.dataset.icon)));
const NAV = { home: ["Overview", "Resumen"], sesiones: ["Sessions", "Sesiones"], mapa: ["Points map", "Mapa de puntos"], funnels: ["Funnels", "Funnels"], ab: ["A/B tests", "Pruebas A/B"], versiones: ["Versions", "Versiones"] };
$$("[data-nav]").forEach((a) => {
	const words = NAV[a.dataset.nav];
	if (words) a.querySelector("span").textContent = T(...words);
});
$("#logout").textContent = T("Sign out", "Salir");
$("#conn").innerHTML = `<span class="dot warn"></span> ${T("Connecting…", "Conectando…")}`;
$$("#lang [data-lang]").forEach((b) => {
	b.classList.toggle("on", b.dataset.lang === LANG);
	b.onclick = () => {
		try {
			localStorage.setItem("nw-lang", b.dataset.lang);
		} catch {}
		location.reload();
	};
});
$("#logout").onclick = async () => {
	await fetch("/api/logout", { method: "POST" });
	showLogin();
};

async function route() {
	const hash = location.hash.replace(/^#/, "") || "/";
	const [path, query] = hash.split("?");
	const params = new URLSearchParams(query || "");
	const section = path.startsWith("/mapa")
		? "mapa"
		: path.startsWith("/funnels")
			? "funnels"
			: path === "/ab"
				? "ab"
				: /^\/(versiones|archivo)/.test(path)
					? "versiones"
					: /^\/(sesiones|s\/|p\/)/.test(path)
						? "sesiones"
						: "home";
	$$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === section));
	hideTip();
	clearInterval(refreshTimer);
	replayStop?.();
	replayStop = null;
	clearTimeout(downTimer);
	const up = archive ? { ok: true } : await health();
	if (up.down) return showDown(up.why);
	try {
		await api("/api/me");
		$("#logout").hidden = false;
		$("#conn").innerHTML = `<span class="dot good"></span> ${T("Connected", "Conectado")}`;
		window.scrollTo(0, 0);
		let m;
		if ((m = path.match(/^\/s\/([a-z0-9]+)$/))) await sessionPage(m[1], params.get("q"));
		else if ((m = path.match(/^\/p\/(\d+)$/))) await playerPage(m[1]);
		else if (path === "/mapa") await mapPage();
		else if (path === "/sesiones") await sessionsPage(params.get("q"), params.get("v"));
		else if (path === "/funnels") await funnelsPage();
		else if (path === "/ab") await abPage();
		else if (path === "/versiones") await versionsPage();
		else if (path === "/archivo") await archivePage();
		else await home();
		maintenanceNote(up.maintenance);
	} catch (err) {
		if (err.message === "login") return;
		if (serverTrouble(err)) return showDown(err.message === "maintenance" ? T("maintenance", "mantenimiento") : err.message);
		app.innerHTML = `<div class="card"><p class="err">${esc(err.message)}</p><a href="#/">${T("Back", "Volver")}</a></div>`;
	}
}
window.addEventListener("hashchange", route);
route();
