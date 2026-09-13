CREATE TABLE IF NOT EXISTS consultation_requests (
  user_id BIGINT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT,
  phone_number TEXT NOT NULL,
  interests TEXT NOT NULL,
  estimate JSONB,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
