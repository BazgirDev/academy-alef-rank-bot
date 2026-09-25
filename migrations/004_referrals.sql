CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_starts (
  anonymous_user_key CHAR(64) NOT NULL,
  referral_code TEXT NOT NULL REFERENCES referral_codes(code),
  first_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (anonymous_user_key, referral_code)
);

CREATE INDEX IF NOT EXISTS referral_starts_code_time_idx
  ON referral_starts (referral_code, first_started_at);
