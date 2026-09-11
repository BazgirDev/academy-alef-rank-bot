import { neon } from "@neondatabase/serverless"

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
