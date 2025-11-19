UPDATE tournament_match
SET status = 'SCHEDULED'
WHERE status = 'RESCHEDULED';

ALTER TABLE tournament_match
ADD COLUMN match_type TEXT NOT NULL DEFAULT 'NORMAL';

ALTER TABLE tournament_match
ADD COLUMN format TEXT;
