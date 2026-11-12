-- One row per play session (a player joining a server until they leave)
CREATE TABLE sessions (
	id TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL,
	name TEXT,
	display TEXT,
	server_id TEXT,
	place_version INTEGER,
	studio INTEGER NOT NULL DEFAULT 0,
	private INTEGER NOT NULL DEFAULT 0,
	started_at REAL NOT NULL, -- unix seconds (the game server's clock)
	last_at REAL NOT NULL, -- unix seconds of the last data received
	ended INTEGER NOT NULL DEFAULT 0,
	first INTEGER, -- 1 first time ever, 0 returning, NULL data never loaded
	device TEXT,
	played REAL, -- seconds, set when it ends
	reason TEXT, -- likeliest reason they left (text)
	reason_w INTEGER, -- that reason's rule (its weight: same rule, same number)
	earned INTEGER,
	spent INTEGER,
	robux INTEGER,
	level INTEGER,
	tut_version TEXT,
	tut_step INTEGER,
	tut_done INTEGER,
	summary TEXT, -- JSON: everything the game summed up at the end
	reviewed INTEGER NOT NULL DEFAULT 0 -- marked as already looked at in the dashboard (leaves the review list)
);
CREATE INDEX sessions_started ON sessions (started_at DESC);
CREATE INDEX sessions_user ON sessions (user_id, started_at DESC);

-- The session's full log, sent as it happens: one gzip JSON array of lines per send
CREATE TABLE chunks (
	session_id TEXT NOT NULL,
	seq INTEGER NOT NULL,
	n INTEGER NOT NULL,
	data BLOB NOT NULL,
	PRIMARY KEY (session_id, seq)
) WITHOUT ROWID;

-- Lines that happened somewhere worth seeing on the map (crashes, purchases, police, where they left...)
CREATE TABLE points (
	session_id TEXT NOT NULL,
	q INTEGER NOT NULL, -- the line's number in its session
	at REAL NOT NULL, -- seconds into the session
	kind TEXT NOT NULL,
	text TEXT NOT NULL,
	x REAL NOT NULL,
	y REAL NOT NULL,
	z REAL NOT NULL,
	started_at REAL NOT NULL,
	tag TEXT, -- signals only (kind 'señal'): which one (rage, dead, cerrar, uturn, alejo, lento, atasco, error, salida)
	w INTEGER, -- signals only: how much it says something went wrong (they add up to the session's review score)
	target TEXT, -- signals only: what it was about (the button, the window, the tutorial step)
	PRIMARY KEY (session_id, q)
) WITHOUT ROWID;
CREATE INDEX points_started ON points (started_at DESC);
CREATE INDEX points_signals ON points (tag, started_at DESC) WHERE tag IS NOT NULL;
