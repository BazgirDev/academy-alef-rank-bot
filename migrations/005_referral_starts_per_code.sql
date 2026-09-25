ALTER TABLE referral_starts
  DROP CONSTRAINT IF EXISTS referral_starts_pkey;

ALTER TABLE referral_starts
  ADD CONSTRAINT referral_starts_pkey PRIMARY KEY (anonymous_user_key, referral_code);
