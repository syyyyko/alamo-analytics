# Alamo Analytics

Analytics for the Roblox game **Night Wheels**.

It has three parts:

- **The game code** (`game/`) records each play session.
- **The backend** (`src/`, `migrations/`) stores sessions. It is a Cloudflare Worker with a D1 database.
- **The dashboard** (`public/`) shows them, in English or Spanish.

You can see:

- each player, each session and its timeline;
- a 3D replay of the session, with the traffic and police around the player;
- why players leave;
- the tutorial funnel;
- the A/B tests (Roblox's experiments), live;
- a points map;
- a heat map of where players leave;
- sessions worth reviewing.

## How the game sends data

- Each session is held on the game server and sent **once, when the player leaves**. A session longer than 20 minutes also sends a part every 20 minutes.
- The backend keeps a session in **one row**: its points, signals and replay samples live in that row, and its log lines go in one more row per send.
- This keeps D1's free plan (100,000 rows written a day) far away: about 5 writes per player.
- Memory on the game server is capped per session (`AnalyticsConfig.MaxPending`, `Track.MaxBytes`, `LookMax`, `NearMax`).
- Base64 runs in C++ (`EncodingService`), so sending a whole session doesn't cause a hitch.

| Who | What | How often |
|---|---|---|
| Server | Where the player is, heading, speed | 4 a second |
| Client | Camera and cursor | 2 a second |
| Client, while riding | Police and the nearest traffic | 2 a second |

## Game setup (`game/`)

Put each file where its folder says, as a ModuleScript. `init.luau` is the parent module and `Analytics.luau` is its child. The game uses the Nexus framework; adapt the service and controller wrappers if yours differs.

- `ServerScriptService/AnalyticsConfig.luau`: set `Url` and `Dashboard` to your Worker URL and `Key` to its `INGEST_KEY`. They ship empty: nothing is sent until you fill them.
- `ServerScriptService/SessionReportConfig.luau`: its Discord `Webhook` ships empty too.
- `ServerStorage/Tools/WorldExport.luau`: uploads the map for the 3D replay. Run `require(game.ServerStorage.Tools.WorldExport).Upload()` from a server script while in Play.
- Studio sends nothing unless the Workspace attribute `AnalyticsTest` is true.

Keep the URL and the key on the server only. Never put them in anything that replicates to clients.

## Backend setup (once)

```bash
npx -y wrangler@4 login
```

```bash
npx -y wrangler@4 d1 create nightwheels
```

Copy the printed `database_id` into `wrangler.jsonc`, then:

```bash
npx -y wrangler@4 d1 migrations apply nightwheels --remote
```

```bash
npx -y wrangler@4 secret put DASH_PASSWORD
```

```bash
npx -y wrangler@4 secret put INGEST_KEY
```

```bash
npx -y wrangler@4 deploy
```

Write the Worker's URL in `.base-url` (or set `NW_BASE`); the tools read it. `.base-url`, `.ingest-key`, `.agent-key` and `.dev.vars` stay out of git.

## Updating without breaking the game

Always deploy with:

```bash
node tools/deploy.mjs 10
```

It runs these steps in order:

1. Turns maintenance on. `/ingest` answers 503 with `Retry-After`, and the game's servers pause and keep their data.
2. Applies the D1 migrations.
3. Deploys.
4. Waits for `/health` to show the new build.
5. Turns maintenance off.

If a step fails, maintenance stays on until it expires. `node tools/maintenance.mjs 0` ends it by hand.

## Local test

```bash
npx -y wrangler@4 d1 migrations apply nightwheels --local
```

```bash
npx -y wrangler@4 dev --port 8787 --ip 127.0.0.1
```

```bash
node tools/fake-game.mjs http://127.0.0.1:8787/ingest
```

## Reading the data quickly (for you or an AI)

```bash
node tools/ask.mjs digest 7
```

`session <id>`, `player <userId>`, `funnel`, `review` and `ab` also work. They use the read-only key in `.agent-key`.

---

## En español

**Alamo Analytics** son las analíticas de Night Wheels. El juego manda cada sesión **una sola vez, al salir el jugador**; si la sesión dura más de 20 minutos, también manda una parte cada 20. El backend la guarda en una fila, así que son unas 5 escrituras por jugador. El panel está en inglés por defecto; el idioma se cambia abajo a la izquierda (EN / ES). Para actualizar el backend usa siempre `node tools/deploy.mjs 10`.

