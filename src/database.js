import { neon } from "@neondatabase/serverless"
import { createHmac } from "node:crypto"

let initialized = false

function client() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
  return neon(process.env.DATABASE_URL)
}

async function initialize() {
  if (initialized) return
  const sql = client()
  await sql`CREATE TABLE IF NOT EXISTS bot_users (
    user_id BIGINT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'MAIN_MENU',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS telegram_updates (
    update_id BIGINT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS consultation_requests (
    user_id BIGINT PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT,
    phone_number TEXT NOT NULL,
    interests TEXT NOT NULL,
    estimate JSONB,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS contacts (
    user_id BIGINT PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    full_name TEXT NOT NULL,
    username TEXT,
    phone_number TEXT NOT NULL,
    shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS referral_codes (
    code TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS referral_starts (
    anonymous_user_key CHAR(64) NOT NULL,
    referral_code TEXT NOT NULL REFERENCES referral_codes(code),
    first_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (anonymous_user_key, referral_code)
  )`
  await sql`CREATE INDEX IF NOT EXISTS referral_starts_code_time_idx
    ON referral_starts (referral_code, first_started_at)`
  await sql`INSERT INTO contacts (user_id, chat_id, full_name, username, phone_number, shared_at)
    SELECT user_id, user_id, COALESCE(NULLIF(data->>'contact_name', ''), '—'), NULL,
      data->>'phone_number', updated_at
    FROM bot_users
    WHERE NULLIF(data->>'phone_number', '') IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING`
  initialized = true
}

export async function claimUpdate(updateId) {
  await initialize()
  const sql = client()
  const rows = await sql`INSERT INTO telegram_updates (update_id)
    VALUES (${updateId})
    ON CONFLICT DO NOTHING
    RETURNING update_id`
  return rows.length === 1
}

export async function releaseUpdate(updateId) {
  await initialize()
  const sql = client()
  await sql`DELETE FROM telegram_updates WHERE update_id = ${updateId}`
}

export async function loadUser(userId) {
  await initialize()
  const sql = client()
  const rows = await sql`SELECT state, data FROM bot_users WHERE user_id = ${userId}`
  if (!rows.length) return { state: "MAIN_MENU", data: {} }
  return { state: rows[0].state, data: rows[0].data || {} }
}

export async function saveUser(userId, state, data) {
  await initialize()
  const sql = client()
  await sql`INSERT INTO bot_users (user_id, state, data, updated_at)
    VALUES (${userId}, ${state}, ${JSON.stringify(data)}, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET state = EXCLUDED.state, data = EXCLUDED.data, updated_at = NOW()`
}

export async function saveConsultation(request) {
  await initialize()
  const sql = client()
  const rows = await sql`INSERT INTO consultation_requests (
      user_id, full_name, username, phone_number, interests, estimate, requested_at
    ) VALUES (
      ${request.userId}, ${request.fullName}, ${request.username || null},
      ${request.phoneNumber}, ${request.interests}, ${JSON.stringify(request.estimate || null)}, NOW()
    )
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id`
  return rows.length === 1
}

export async function listConsultations() {
  await initialize()
  const sql = client()
  return sql`SELECT user_id, full_name, username, phone_number, interests, estimate, requested_at
    FROM consultation_requests
    ORDER BY requested_at DESC`
}

export async function saveContact(contact) {
  await initialize()
  const sql = client()
  await sql`INSERT INTO contacts (user_id, chat_id, full_name, username, phone_number, shared_at)
    VALUES (${contact.userId}, ${contact.chatId}, ${contact.fullName}, ${contact.username || null}, ${contact.phoneNumber}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      chat_id = EXCLUDED.chat_id,
      full_name = EXCLUDED.full_name,
      username = EXCLUDED.username,
      phone_number = EXCLUDED.phone_number,
      shared_at = NOW()`
}

export async function listContacts() {
  await initialize()
  const sql = client()
  return sql`SELECT user_id, chat_id, full_name, username, phone_number, shared_at
    FROM contacts
    ORDER BY shared_at DESC`
}

export async function createReferralCode(code) {
  await initialize()
  const sql = client()
  const rows = await sql`INSERT INTO referral_codes (code) VALUES (${code})
    ON CONFLICT (code) DO NOTHING RETURNING code, created_at`
  return rows[0] || null
}

export async function listReferralCodes() {
  await initialize()
  const sql = client()
  return sql`SELECT c.code, c.created_at, COUNT(s.anonymous_user_key)::int AS starts,
      MIN(s.first_started_at) AS first_start, MAX(s.first_started_at) AS last_start
    FROM referral_codes c LEFT JOIN referral_starts s ON s.referral_code = c.code
    GROUP BY c.code, c.created_at ORDER BY c.created_at DESC, c.code`
}

export async function listReferralDailyStats() {
  await initialize()
  const sql = client()
  return sql`SELECT referral_code AS code,
      (first_started_at AT TIME ZONE 'Asia/Tehran')::date::text AS start_date,
      COUNT(*)::int AS starts
    FROM referral_starts
    GROUP BY referral_code, (first_started_at AT TIME ZONE 'Asia/Tehran')::date
    ORDER BY start_date DESC, referral_code`
}

export async function recordReferralStart(userId, code) {
  await initialize()
  if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is required")
  const anonymousKey = createHmac("sha256", process.env.BOT_TOKEN).update(String(userId)).digest("hex")
  const sql = client()
  const rows = await sql`INSERT INTO referral_starts (anonymous_user_key, referral_code)
    SELECT ${anonymousKey}, code FROM referral_codes WHERE code = ${code}
    ON CONFLICT (anonymous_user_key, referral_code) DO NOTHING RETURNING referral_code`
  return rows.length === 1
}
