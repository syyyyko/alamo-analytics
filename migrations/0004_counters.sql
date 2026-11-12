-- Running totals that outlive the rows they count: deleted_profiles / deleted_sessions (made room for new ones when the
-- database got full), evict_size / evict_freed (the room-making's own state)
CREATE TABLE counters (
	name TEXT PRIMARY KEY,
	n REAL NOT NULL DEFAULT 0
);
