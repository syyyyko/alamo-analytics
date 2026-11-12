-- Game versions (2026-11-11, the user: logs by version, how long each was live; 7 days after it's no longer the game's
-- version its logs go, unless locked; download them first, delete them by hand). The versions themselves come from
-- sessions.place_version; this only keeps what's set by hand and what's left of a deleted one.
CREATE TABLE version_flags (
	version INTEGER PRIMARY KEY,
	locked INTEGER NOT NULL DEFAULT 0, -- never deleted by itself
	deleting INTEGER NOT NULL DEFAULT 0, -- its logs going (the cron, a few sessions a minute: deletes count as writes)
	deleted_at REAL, -- all gone (the row stays: when it was live, how many there were)
	first_at REAL,
	last_at REAL,
	live_until REAL,
	sessions INTEGER,
	players INTEGER
);
CREATE INDEX sessions_version ON sessions (place_version, started_at);
