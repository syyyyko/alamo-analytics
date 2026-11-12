-- 2026-11-12, the user: "no puedes mandarlo cuando el jugador se sale y ya? asi seria menos escrituras, 1 por jugador".
-- From now on a session's map points, signals and replay samples live in its own sessions row (one write each send), not
-- in a row each (points: 2-3 writes a point with its indexes; tracks: 2 a send). Its lines still go in chunks (one row a
-- send, no index). Sessions from before keep what they have in points / tracks; the reads join both.
ALTER TABLE sessions ADD COLUMN rseq INTEGER; -- the last send merged into this row (one seen again isn't added twice)
ALTER TABLE sessions ADD COLUMN score INTEGER; -- its signals' weights added up (the review list's order)
ALTER TABLE sessions ADD COLUMN tags TEXT; -- its signals' tags, comma separated
ALTER TABLE sessions ADD COLUMN top_text TEXT; -- its heaviest signal's text
ALTER TABLE sessions ADD COLUMN pts TEXT; -- JSON [[q, at, kind, text, x, y, z, tag, w, target], ...]: its map points and signals
ALTER TABLE sessions ADD COLUMN track BLOB; -- gzip: the server's samples of where they were (cleared after 7 days)
ALTER TABLE sessions ADD COLUMN look BLOB; -- gzip: the client's camera and cursor (cleared after 7 days)
ALTER TABLE sessions ADD COLUMN near BLOB; -- gzip: the traffic and police near them, from their client (cleared after 7 days)
