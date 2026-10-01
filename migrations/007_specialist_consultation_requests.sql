ALTER TABLE consultation_requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'general';
UPDATE consultation_requests SET request_type = 'specialist'
WHERE request_type = 'general' AND field IS NOT NULL AND grade IS NOT NULL;
CREATE INDEX IF NOT EXISTS consultation_requests_specialist_time_idx
ON consultation_requests (requested_at DESC) WHERE request_type = 'specialist';
