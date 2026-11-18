ALTER TABLE active_session ADD COLUMN segment_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE active_session ADD COLUMN phase TEXT NOT NULL DEFAULT 'focus';
ALTER TABLE active_session ADD COLUMN break_kind TEXT;
