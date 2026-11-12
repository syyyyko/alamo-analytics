-- Phase 2 (2026-11-11): the replay's samples, kept 7 days. kind 't': the server's samples of where the player is
-- (4 a second); kind 'l': the client's camera and cursor (2 a second). data: gzip of the game's binary format.
CREATE TABLE tracks (
	session_id TEXT NOT NULL,
	kind TEXT NOT NULL,
	seq INTEGER NOT NULL,
	data BLOB NOT NULL,
	created REAL NOT NULL,
	PRIMARY KEY (session_id, kind, seq)
) WITHOUT ROWID;
CREATE INDEX tracks_created ON tracks (created);

-- Things uploaded once in a while: 'world' = the map in blocks for the 3D replay (gzip JSON), sent from Studio in parts
CREATE TABLE assets (
	name TEXT PRIMARY KEY,
	data BLOB NOT NULL,
	updated REAL NOT NULL
);
