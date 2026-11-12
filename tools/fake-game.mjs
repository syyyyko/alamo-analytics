// Pretends to be a game server: sends a few made-up sessions (in chunks, gzip, like the real one) to the ingest.
// node tools/fake-game.mjs [url] [key]   (default: the local dev server and .dev.vars' key)
import { gzipSync } from "node:zlib";

const url = process.argv[2] || "http://localhost:8787/ingest";
const key = process.argv[3] || "dev-ingest-key";
const now = Date.now() / 1000;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function makeSession(i) {
	const id = Math.random().toString(36).slice(2, 14);
	const first = i % 2 === 0;
	const start = now - rand(600, 6 * 86400);
	const lines = [];
	let q = 0;
	let t = 0;
	let cash = first ? 0 : Math.round(rand(2000, 90000));
	// the lobby (13597, 4290), then out along the highway's east side (x ≈ 13300, z from 4000 down to -9000)
	let pos = [13597 + rand(-60, 60), 26, 4290 + rand(-60, 60)];
	const add = (k, s, extra = {}) => {
		q += 1;
		lines.push({ q, t: Math.round(t * 10) / 10, k, s, c: 1, p: pos.map(Math.round), m: cash, ...extra });
	};
	add("servidor", "Entró al servidor (5 jugadores)");
	t += 4;
	add("datos", `Cargaron sus datos: $${cash}, nivel ${first ? 1 : 12}, ${first ? 0 : 3} motos, tutorial ${first ? "sin empezar" : "terminado"}`);
	t += 8;
	add("menú", "Le dio a PLAY");
	const steps = first ? Math.floor(rand(2, 9)) : 0;
	for (let step = 1; step <= steps; step++) {
		t += rand(10, 70);
		pos = [pos[0] + rand(-80, 80), 12, pos[2] + rand(-80, 80)];
		add("tutorial", `Tutorial ${step}/8: paso ${step}`);
		if (step === 3 && Math.random() < 0.6) {
			t += 50;
			pos = [pos[0] + 320, 12, pos[2] + 40];
			add("señal", `Se alejó en el paso 3: 340 studs de donde empezó, 1m 10s`, { g: "alejo", w: 25, o: "Tutorial A · paso 3" });
		}
	}
	for (let n = 0; n < rand(4, 14); n++) {
		t += rand(15, 90);
		pos = Math.random() < 0.5 ? [13597 + rand(-120, 120), 26, 4290 + rand(-120, 120)] : [13300 + rand(-60, 60), 12, rand(-9000, 4000)];
		const speed = Math.round(rand(20, 160));
		const what = pick(["moto", "moto", "compra", "ventana", "clic", "estado", "policía"]);
		if (what === "moto") add("moto", pick([`Chocó a ${speed} mph`, "Se subió a la moto Ninja", "Se bajó de la moto (se bajó él, iba a 3 mph)"]), { v: speed });
		else if (what === "compra") {
			cash = Math.max(0, cash - 5000);
			add("compra", pick(["Compró Casco Rojo", "Casco Neón: sin dinero", "Compró Llantas Pro"]));
		} else if (what === "ventana") add("ventana", pick(["Abrió Garage", "Abrió la tienda", "Cerró Garage (4s abierta)"]));
		else if (what === "clic") add("clic", pick(['Garage > Window > Close "X"', "sin botón, sobre Shop > Window", "en el mundo"]));
		else if (what === "policía") add("policía", pick(["BUSTED", "Escapó de la policía (+$1,200)"]));
		else add("estado", `en moto a ${speed} mph · ${Math.round(rand(25, 60))} FPS`, { v: speed, f: Math.round(rand(25, 60)) });
		cash += Math.round(rand(0, 3000));
		if (Math.random() < 0.15) add("señal", 'Clics de rabia en Shop > Window > Buy "BUY" (4 en 2s)', { g: "rage", w: 15, o: "Shop > Window > Buy" });
		if (Math.random() < 0.1) add("señal", "No podía salir de Garage: 5 clics fuera y ESC 2 veces", { g: "cerrar", w: 20, o: "Garage" });
	}
	t += 5;
	add("servidor", "Se salió del juego");
	const played = t;
	const end = {
		played,
		afk: 0,
		first,
		loaded: true,
		device: pick(["PC", "Phone", "PC", "Tablet"]),
		fps: 50,
		ping: 90,
		reasons: [
			first && steps < 8
				? pick([{ w: 70, t: `Atorado en el tutorial: 2m en el paso ${steps}` }, { w: 80, t: "Se salió en el menú principal sin darle a PLAY (40s)" }, { w: 45, t: "Se fue a los 50s, casi ni lo probó" }])
				: pick([
						{ w: 76, t: "Se salió justo después de chocar" },
						{ w: 69, t: "Se quedó pillado en la UI: Garage abierta 2m y 14 clics sin salir de ahí" },
						{ w: 82, t: "Canceló la compra de Starter Pack y se fue" },
						{ w: 61, t: "Quiso comprar Casco Neón y no le alcanzó" },
						{ w: 49, t: "Mucho lag: 420 ms" },
						{ w: 20, t: "Sesión larga (45m): parece que ya había terminado de jugar" },
						{ w: 10, t: "Se salió sin señales claras" },
						{ w: 75, t: "Se salió justo después de que lo arrestaran (BUSTED)" },
					]),
			{ w: 10, t: "Se salió sin señales claras" },
		],
		cashStart: first ? 0 : 5000,
		cashEnd: cash,
		earned: 12000,
		spent: 5000,
		income: { Carretera: 9000, "Día 1": 3000 },
		robux: Math.random() < 0.2 ? 99 : 0,
		bought: [{ g: "Casco y lentes", n: "Casco Rojo", p: 5000 }],
		tried: [{ g: "Casco y lentes", n: "Casco Neón", why: "sin dinero", p: 20000, c: 2 }],
		windows: { Garage: { name: "Garage", opens: 3, seconds: 40 }, Shop: { name: "Tienda", opens: 1, seconds: 12 } },
		mounts: 3,
		rideSeconds: played * 0.6,
		crashes: 2,
		busted: 1,
		escaped: 1,
		points: 4200,
		bestCombo: 7,
		level: first ? 2 : 12,
		xpGain: 800,
		tutorial: first ? { version: "A", step: steps, total: 8, done: steps >= 8, name: `paso ${steps}` } : { version: "A", step: 9, total: 8, done: true },
	};
	return { id, user: 1000 + i, name: `Jugador${i}`, display: `Jugador ${i}`, start, lines, end, meta: { first, device: end.device } };
}

const sessions = Array.from({ length: Number(process.env.N || 8) }, (_, i) => makeSession(i));
// two sends per session: the first half of its lines, then the rest with the summary
for (const part of [0, 1]) {
	const body = {
		v: 1,
		server: "fake-server",
		place: 1,
		version: Number(process.env.FAKE_VERSION || 999),
		studio: false,
		sent: now,
		sessions: sessions.map((s) => {
			const half = Math.ceil(s.lines.length / 2);
			return {
				id: s.id,
				user: s.user,
				name: s.name,
				display: s.display,
				start: s.start,
				seq: part + 1,
				meta: s.meta,
				lines: part === 0 ? s.lines.slice(0, half) : s.lines.slice(half),
				end: part === 1 ? s.end : undefined,
			};
		}),
	};
	const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "content-encoding": "gzip", "x-key": key }, body: gzipSync(JSON.stringify(body)) });
	console.log(part + 1, res.status, await res.text());
}
