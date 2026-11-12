-- 1: its chunks packed into one (columns + gzip) after it ended; 2: left as it came (too long to pack)
ALTER TABLE sessions ADD COLUMN packed INTEGER NOT NULL DEFAULT 0;
