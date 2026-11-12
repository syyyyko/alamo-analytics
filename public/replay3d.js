// The 3D replay: the map in blocks (uploaded from Studio by Tools.WorldExport) with textures drawn here, the player as a
// blocky rider, and a camera that follows them or looks where they looked. Loaded only when a replay opens.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

let worldPromise = null;
export function loadWorld() {
	worldPromise ||= fetch("/api/world", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
	return worldPromise;
}

/* ---------- the replay's samples (the game's binary formats, little-endian) ---------- */
const bytesOf = (b64) => Uint8Array.from(atob(b64 || ""), (c) => c.charCodeAt(0));
export function decodeTrack(b64) {
	const bytes = bytesOf(b64);
	const dv = new DataView(bytes.buffer);
	const out = [];
	let o = 0, t = 0, x = NaN, y = 0, z = 0;
	while (o + 11 <= bytes.length) {
		const flags = dv.getUint8(o);
		if (flags & 2) {
			if (o + 19 > bytes.length) break;
			t = dv.getUint32(o + 1, true);
			x = dv.getFloat32(o + 5, true), y = dv.getFloat32(o + 9, true), z = dv.getFloat32(o + 13, true);
			o += 17;
		} else {
			t += dv.getUint16(o + 1, true);
			x += dv.getInt16(o + 3, true) / 10, y += dv.getInt16(o + 5, true) / 10, z += dv.getInt16(o + 7, true) / 10;
			o += 9;
		}
		const heading = (dv.getUint8(o) / 256) * Math.PI * 2;
		const mph = dv.getUint8(o + 1);
		o += 2;
		if (!Number.isNaN(x)) out.push({ t: t / 1000, x, y, z, heading, mph, riding: !!(flags & 1), ragdoll: !!(flags & 4) });
	}
	return out;
}
export function decodeLook(b64) {
	const bytes = bytesOf(b64);
	const dv = new DataView(bytes.buffer);
	const out = [];
	let o = 0;
	while (o + 5 <= bytes.length) {
		let t = dv.getUint32(o, true) / 1000;
		const count = dv.getUint8(o + 4);
		o += 5;
		for (let i = 0; i < count && o + 6 <= bytes.length; i++, o += 6) {
			t += dv.getUint8(o) / 20;
			const mx = dv.getUint8(o + 3), my = dv.getUint8(o + 4), flags = dv.getUint8(o + 5);
			out.push({ t, heading: (dv.getUint8(o + 1) / 256) * Math.PI * 2, pitch: (dv.getInt8(o + 2) * Math.PI) / 180, mx: mx === 255 ? null : mx / 254, my: my === 255 ? null : my / 254, cursor: !!(flags & 1), touch: !!(flags & 2) });
		}
	}
	return out;
}
// The traffic and police round the player while riding (2026-11-12, from their client): per stored piece u32 ms, u8
// samples, each u16 ms after the piece, u8 cars, each u8 kind (0 traffic, 1 police), u8 id, i16 dx, i16 dz (half studs
// from the player), u8 heading
export function decodeNear(b64) {
	const bytes = bytesOf(b64);
	const dv = new DataView(bytes.buffer);
	const out = [];
	let o = 0;
	while (o + 5 <= bytes.length) {
		const base = dv.getUint32(o, true);
		const samples = dv.getUint8(o + 4);
		o += 5;
		for (let i = 0; i < samples && o + 3 <= bytes.length; i++) {
			const t = (base + dv.getUint16(o, true)) / 1000;
			const count = dv.getUint8(o + 2);
			o += 3;
			const cars = [];
			for (let k = 0; k < count && o + 7 <= bytes.length; k++, o += 7) {
				cars.push({ kind: dv.getUint8(o), id: dv.getUint8(o + 1), dx: dv.getInt16(o + 2, true) / 2, dz: dv.getInt16(o + 4, true) / 2, heading: (dv.getUint8(o + 6) / 256) * Math.PI * 2 });
			}
			out.push({ t, cars });
		}
	}
	return out.sort((a, b) => a.t - b.t);
}
// The cars at time t: each one between its two samples (by its id), placed from the player's own sample then
export function carsAt(list, t) {
	if (!list.length) return [];
	let lo = 0, hi = list.length - 1;
	if (t < list[0].t - 0.6 || t > list[hi].t + 0.6) return [];
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (list[mid].t <= t) lo = mid;
		else hi = mid;
	}
	const a = list[lo].t <= t ? list[lo] : list[hi];
	const b = list[hi] !== a && list[hi].t - a.t < 1.5 ? list[hi] : null;
	const f = b ? Math.min(1, Math.max(0, (t - a.t) / Math.max(b.t - a.t, 1e-3))) : 0;
	const next = new Map((b?.cars || []).map((c) => [c.kind * 256 + c.id, c]));
	return a.cars.map((c) => {
		const n = next.get(c.kind * 256 + c.id);
		if (!n) return c;
		let dh = n.heading - c.heading;
		dh = ((dh + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
		return { ...c, x: c.x + (n.x - c.x) * f, y: c.y + (n.y - c.y) * f, z: c.z + (n.z - c.z) * f, heading: c.heading + dh * f };
	});
}

// the sample at time t, between the two around it
export function sampleAt(list, t) {
	if (!list.length) return null;
	let lo = 0, hi = list.length - 1;
	if (t <= list[0].t) return list[0];
	if (t >= list[hi].t) return list[hi];
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (list[mid].t <= t) lo = mid;
		else hi = mid;
	}
	const a = list[lo], b = list[hi];
	const f = (t - a.t) / Math.max(b.t - a.t, 1e-3);
	if (b.t - a.t > 3 || Math.hypot(b.x - a.x, b.z - a.z) > 400) return a; // (a teleport or a gap: no gliding across)
	let dh = b.heading - a.heading;
	dh = ((dh + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
	return { ...a, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, heading: a.heading + dh * f, mph: a.mph + (b.mph - a.mph) * f };
}

/* ---------- textures: small greyscale patterns, tinted by each block's own colour, tiled by world position ---------- */
function canvasTexture(draw, size = 64) {
	const c = document.createElement("canvas");
	c.width = c.height = size;
	const g = c.getContext("2d");
	draw(g, size);
	const tex = new THREE.CanvasTexture(c);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}
function noise(g, s, base, spread, dots = 900) {
	g.fillStyle = `rgb(${base},${base},${base})`;
	g.fillRect(0, 0, s, s);
	for (let i = 0; i < dots; i++) {
		const v = base + (Math.random() - 0.5) * spread;
		g.fillStyle = `rgb(${v},${v},${v})`;
		g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
	}
}
const TEXTURES = {
	asphalt: { scale: 24, draw: (g, s) => noise(g, s, 205, 60, 1400) },
	concrete: { scale: 16, draw: (g, s) => (noise(g, s, 225, 30), (g.strokeStyle = "rgba(0,0,0,0.12)"), g.strokeRect(0, 0, s, s)) },
	grass: { scale: 20, draw: (g, s) => noise(g, s, 210, 70, 1600) },
	sand: { scale: 20, draw: (g, s) => noise(g, s, 230, 35, 1200) },
	rock: { scale: 30, draw: (g, s) => noise(g, s, 200, 90, 700) },
	brick: {
		scale: 8,
		draw: (g, s) => {
			noise(g, s, 225, 25, 300);
			g.fillStyle = "rgba(0,0,0,0.28)";
			for (let row = 0; row < 4; row++) {
				g.fillRect(0, row * 16 + 14, s, 2);
				const off = row % 2 ? 16 : 0;
				for (let x = off; x < s; x += 32) g.fillRect(x, row * 16, 2, 16);
			}
		},
	},
	metal: { scale: 12, draw: (g, s) => { const grad = g.createLinearGradient(0, 0, s, s); grad.addColorStop(0, "#eee"); grad.addColorStop(1, "#c8c8c8"); g.fillStyle = grad; g.fillRect(0, 0, s, s); g.fillStyle = "rgba(0,0,0,0.1)"; for (let y = 0; y < s; y += 8) g.fillRect(0, y, s, 1); } },
	glass: { scale: 12, draw: (g, s) => { g.fillStyle = "#9aa"; g.fillRect(0, 0, s, s); g.fillStyle = "rgba(255,255,255,0.55)"; for (let y = 4; y < s; y += 16) for (let x = 4; x < s; x += 16) g.fillRect(x, y, 10, 10); } },
	plain: { scale: 16, draw: (g, s) => noise(g, s, 240, 12, 200) },
};
const MATERIAL_KIND = {
	Asphalt: "asphalt", Concrete: "concrete", Pavement: "concrete", Cobblestone: "rock", Grass: "grass", LeafyGrass: "grass", Ground: "sand", Mud: "rock",
	Sand: "sand", Sandstone: "sand", Rock: "rock", Slate: "rock", Pebble: "rock", Basalt: "rock", Brick: "brick", Metal: "metal", DiamondPlate: "metal",
	CorrodedMetal: "metal", Glass: "glass", Ice: "glass", Neon: "plain", Plastic: "plain", SmoothPlastic: "plain", Wood: "plain", WoodPlanks: "brick",
};

function blockMaterial(kind) {
	const spec = TEXTURES[kind] || TEXTURES.plain;
	const material = new THREE.MeshLambertMaterial({ map: canvasTexture(spec.draw) });
	// (uv from where each face is in the world: textures keep their size on any block)
	material.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader.replace(
			"#include <uv_vertex>",
			`#include <uv_vertex>
			vec4 worldSpot = modelMatrix * instanceMatrix * vec4(position, 1.0);
			vec3 facing = abs(normalize(mat3(instanceMatrix) * normal));
			vMapUv = (facing.y > 0.6 ? worldSpot.xz : (facing.x > 0.6 ? worldSpot.zy : worldSpot.xy)) / ${spec.scale.toFixed(1)};`,
		);
	};
	return material;
}

/* ---------- the scene ---------- */
export async function createReplay3D(container) {
	const world = await loadWorld();
	if (!world) return null;
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	container.appendChild(renderer.domElement);
	renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x0e1620);
	scene.fog = new THREE.Fog(0x0e1620, 600, 2600);
	const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.5, 4000);
	scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3a30, 1.15));
	const sun = new THREE.DirectionalLight(0xffffff, 1.2);
	sun.position.set(0.4, 1, 0.3);
	scene.add(sun);

	// blocks, one instanced mesh per texture kind
	const boxes = world.boxes;
	const groups = {};
	for (let i = 0; i < boxes.length; i += 11) {
		const kind = MATERIAL_KIND[world.materials[boxes[i + 9]]] || "plain";
		(groups[kind] ||= []).push(i);
	}
	const unit = new THREE.BoxGeometry(1, 1, 1);
	const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), p = new THREE.Vector3(), s = new THREE.Vector3(), color = new THREE.Color();
	const deg = Math.PI / 180;
	let lowest = Infinity;
	for (const [kind, list] of Object.entries(groups)) {
		const mesh = new THREE.InstancedMesh(unit, blockMaterial(kind), list.length);
		list.forEach((i, n) => {
			p.set(boxes[i], boxes[i + 1], boxes[i + 2]);
			s.set(boxes[i + 3], boxes[i + 4], boxes[i + 5]);
			e.set(boxes[i + 6] * deg, boxes[i + 7] * deg, boxes[i + 8] * deg);
			q.setFromEuler(e);
			m.compose(p, q, s);
			mesh.setMatrixAt(n, m);
			color.setHex(boxes[i + 10]);
			mesh.setColorAt(n, color);
			lowest = Math.min(lowest, boxes[i + 1] - boxes[i + 4] / 2);
		});
		scene.add(mesh);
	}
	const ground = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), new THREE.MeshLambertMaterial({ color: 0x2a3320 }));
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = (Number.isFinite(lowest) ? lowest : 0) - 2;
	scene.add(ground);

	// the player: a blocky Roblox-style character (bacon hair), on a low-poly bike while riding (2026-11-12, the user:
	// "un personaje de roblox ... tipo un bacon ... y el personaje con una moto lowpoly cuando este en la moto")
	const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
	const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
		mesh.position.set(x, y, z);
		return mesh;
	};
	const SKIN = lambert(0xeac086), SHIRT = lambert(0x3d8bd8), PANTS = lambert(0x2d3b55), HAIR = lambert(0x8a4b25), HAIR2 = lambert(0xb9692f), SHOE = lambert(0x1d1d1f);
	const rider = new THREE.Group();
	const person = new THREE.Group(); // (origin at the feet)
	const torso = box(2, 2, 1, SHIRT, 0, 3, 0);
	const head = new THREE.Group();
	head.position.set(0, 4.55, 0);
	head.add(box(1.2, 1.1, 1.1, SKIN));
	// bacon hair: wavy strips over the top and down the back
	for (let i = 0; i < 4; i++) head.add(box(1.3, 0.28, 0.3, i % 2 ? HAIR2 : HAIR, 0, 0.62 - (i === 3 ? 0.1 : 0), -0.42 + i * 0.28));
	head.add(box(1.3, 0.9, 0.25, HAIR, 0, 0.1, 0.62));
	const eyes = lambert(0x1a1a1a);
	head.add(box(0.14, 0.2, 0.05, eyes, -0.25, 0.08, -0.56), box(0.14, 0.2, 0.05, eyes, 0.25, 0.08, -0.56));
	const limb = (material, x, shoe) => {
		const pivot = new THREE.Group(); // (the joint: hip or shoulder)
		pivot.position.set(x, 4, 0);
		pivot.add(box(0.95, 2, 0.95, material, 0, -1, 0));
		if (shoe) pivot.add(box(0.98, 0.3, 1.05, SHOE, 0, -1.85, -0.05));
		return pivot;
	};
	const armL = limb(SKIN, -1.5), armR = limb(SKIN, 1.5);
	const legL = limb(PANTS, -0.5, true), legR = limb(PANTS, 0.5, true);
	legL.position.y = legR.position.y = 2;
	person.add(torso, head, armL, armR, legL, legR);
	rider.add(person);

	// the bike (forward is -Z, as Roblox's): two wheels, frame, tank, seat, fairing, bars
	const bike = new THREE.Group();
	const TYRE = lambert(0x161616), RIM = lambert(0x9aa3ad), FRAME = lambert(0x24272d), PAINT = lambert(0xd8452f), GLASS = lambert(0x9fc6e8);
	const wheel = (z) => {
		const g = new THREE.Group();
		const tyre = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.7, 14), TYRE);
		tyre.rotation.z = Math.PI / 2;
		const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.74, 10), RIM);
		rim.rotation.z = Math.PI / 2;
		g.add(tyre, rim);
		g.position.set(0, 1.25, z);
		return g;
	};
	const front = wheel(-2.45), back = wheel(2.25);
	bike.add(front, back);
	bike.add(box(0.7, 0.9, 3.8, FRAME, 0, 1.9, -0.1)); // frame
	bike.add(box(1.25, 0.9, 1.5, PAINT, 0, 2.75, -0.75)); // tank
	bike.add(box(1.0, 0.35, 1.7, FRAME, 0, 2.75, 0.8)); // seat
	bike.add(box(0.9, 0.7, 1.4, PAINT, 0, 2.55, 2.0)); // tail
	const fairing = box(1.4, 1.5, 1.0, PAINT, 0, 2.6, -2.05);
	fairing.rotation.x = 0.35;
	bike.add(fairing);
	const shield = box(1.1, 0.7, 0.12, GLASS, 0, 3.45, -2.25);
	shield.rotation.x = 0.6;
	bike.add(shield);
	bike.add(box(2.0, 0.18, 0.2, FRAME, 0, 3.35, -1.65)); // bars
	const fork = box(0.25, 2.2, 0.25, RIM, 0, 2.2, -2.25);
	fork.rotation.x = -0.35;
	bike.add(fork);
	rider.add(bike);

	const ring = new THREE.Mesh(new THREE.RingGeometry(3, 3.8, 32), new THREE.MeshBasicMaterial({ color: 0x3987e5, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = 0.2;
	rider.add(ring);
	scene.add(rider);

	// the traffic and the police round them (from their client while riding): a pool of low-poly cars
	const CAR_COLORS = [0xe8e8e8, 0x2b2b2b, 0xb3261e, 0x1f4fa8, 0x8a8f96, 0xe0b420, 0x2e7d4f, 0x5b3a8e, 0xd9772b, 0x6fa8dc];
	const carPool = [];
	function makeCar() {
		const g = new THREE.Group();
		const paint = lambert(0xffffff);
		const white = lambert(0xf2f2f2);
		const body = box(6, 2, 13, paint, 0, 1.8, 0);
		const band = box(6.06, 0.9, 5, white, 0, 2.1, 0.3); // (police: the white over the doors)
		const cabin = box(5.2, 1.7, 6.2, lambert(0x1c2733), 0, 3.6, 0.6);
		const roof = box(5.0, 0.25, 5.4, paint, 0, 4.5, 0.6);
		const lights = new THREE.Group();
		const red = new THREE.MeshBasicMaterial({ color: 0xff2a2a }), blue = new THREE.MeshBasicMaterial({ color: 0x2a6bff });
		lights.add(box(1.5, 0.45, 0.8, red, -0.9, 4.85, 0.6), box(1.5, 0.45, 0.8, blue, 0.9, 4.85, 0.6));
		g.add(body, band, cabin, roof, lights);
		for (const [x, z] of [[-2.6, -4.2], [2.6, -4.2], [-2.6, 4.2], [2.6, 4.2]]) {
			const w = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.9, 12), TYRE);
			w.rotation.z = Math.PI / 2;
			w.position.set(x, 1.15, z);
			g.add(w);
		}
		g.userData = { paint, band, lights, red, blue };
		scene.add(g);
		return g;
	}
	function showCars(cars, y, clock) {
		while (carPool.length < cars.length) carPool.push(makeCar());
		carPool.forEach((car, i) => {
			const c = cars[i];
			car.visible = !!c;
			if (!c) return;
			const police = c.kind === 1;
			car.position.set(c.x, (c.y ?? y) - 0.2, c.z);
			car.rotation.y = c.heading;
			car.userData.paint.color.setHex(police ? 0x1e3e8a : CAR_COLORS[c.id % CAR_COLORS.length]);
			car.userData.band.visible = police;
			car.userData.lights.visible = police;
			if (police) {
				const on = Math.floor(clock * 4) % 2 === 0;
				car.userData.red.color.setHex(on ? 0xff2a2a : 0x551010);
				car.userData.blue.color.setHex(on ? 0x10204f : 0x3b7bff);
			}
		});
	}

	const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false };
	let mode = "follow";
	let stride = 0, lastPos = null;
	function resize() {
		const w = container.clientWidth || 640, h = container.clientHeight || 360;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}
	new ResizeObserver(resize).observe(container);
	resize();

	return {
		setMode(next) {
			mode = next;
		},
		// pose: { x, y, z, heading, riding, ragdoll, mph }; look: the client's camera then (or null); cars: [{ kind, id, x, y, z, heading }]
		show(pose, look, snap, cars = [], clock = 0) {
			if (!pose) return;
			rider.position.set(pose.x, pose.y - (pose.riding ? 2.5 : 3), pose.z);
			rider.rotation.y = pose.heading;
			bike.visible = pose.riding;
			// walking: arms and legs swing with the distance covered; riding: sat on it, hands on the bars
			const moved = lastPos && !snap ? Math.hypot(pose.x - lastPos.x, pose.z - lastPos.z) : 0;
			lastPos = { x: pose.x, z: pose.z };
			if (moved < 30) stride += moved;
			if (pose.riding) {
				person.position.set(0, 0.95, 0.55);
				person.rotation.set(-0.25, 0, 0);
				legL.rotation.set(-1.25, 0, -0.18);
				legR.rotation.set(-1.25, 0, 0.18);
				armL.rotation.set(-1.25, 0, -0.12);
				armR.rotation.set(-1.25, 0, 0.12);
				const spin = (stride / 1.25) % (Math.PI * 2);
				front.rotation.x = back.rotation.x = -spin;
			} else {
				const swing = (pose.mph ?? 0) > 1 || moved > 0.05 ? Math.sin(stride * 0.9) * 0.7 : 0;
				person.position.set(0, 0, 0);
				person.rotation.set(0, 0, 0);
				legL.rotation.set(swing, 0, 0);
				legR.rotation.set(-swing, 0, 0);
				armL.rotation.set(-swing, 0, 0);
				armR.rotation.set(swing, 0, 0);
			}
			if (pose.ragdoll) person.rotation.set(-Math.PI / 2, 0, 0), person.position.set(0, 0.6, 1.5);
			showCars(cars, pose.y - (pose.riding ? 2.5 : 3), clock);
			let want, target;
			if (mode === "player" && look) {
				// their own camera: from just behind their head, the way they looked
				const dir = new THREE.Vector3(-Math.sin(look.heading) * Math.cos(look.pitch), Math.sin(look.pitch), -Math.cos(look.heading) * Math.cos(look.pitch));
				target = new THREE.Vector3(pose.x, pose.y + 3, pose.z);
				want = target.clone().addScaledVector(dir, -14);
				target.addScaledVector(dir, 10);
			} else {
				const behind = new THREE.Vector3(Math.sin(pose.heading), 0, Math.cos(pose.heading));
				target = new THREE.Vector3(pose.x, pose.y + 3, pose.z);
				want = target.clone().addScaledVector(behind, pose.riding ? 22 : 16).add(new THREE.Vector3(0, pose.riding ? 8 : 7, 0));
			}
			if (snap || !cam.ready) cam.pos.copy(want), cam.look.copy(target), (cam.ready = true);
			else cam.pos.lerp(want, 0.18), cam.look.lerp(target, 0.25);
			camera.position.copy(cam.pos);
			camera.lookAt(cam.look);
			renderer.render(scene, camera);
		},
		dispose() {
			renderer.dispose();
			renderer.domElement.remove();
		},
	};
}
