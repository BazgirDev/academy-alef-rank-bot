CREATE TABLE IF NOT EXISTS contacts (
  user_id BIGINT PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  full_name TEXT NOT NULL,
  username TEXT,
  phone_number TEXT NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO contacts (user_id, chat_id, full_name, username, phone_number, shared_at)
SELECT user_id, user_id, COALESCE(NULLIF(data->>'contact_name', ''), '—'), NULL,
  data->>'phone_number', updated_at
FROM bot_users
WHERE NULLIF(data->>'phone_number', '') IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
