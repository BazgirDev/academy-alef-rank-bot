import { existsSync } from "node:fs"
import { neon } from "@neondatabase/serverless"
import { Input, Telegraf } from "telegraf"

const campaign = "free-major-consultation-2026-10-03"
const caption = `برای دریافت مشاوره انتخاب رشته اولیه رایگان ، کارنامه کنکور خود را داخل واتساپ به شماره های زیر ارسال کنید

📞09938724923
📞09369052507
📞09923565687`
const consultationKeyboard = { inline_keyboard: [[{ text: "درخواست مشاوره تخصصی", callback_data: "consultation_data" }]] }
const videoPath = process.argv[2]
const sending = process.argv.includes("--send")

if (!videoPath || !existsSync(videoPath)) throw new Error("An existing video path is required")
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
const sql = neon(process.env.DATABASE_URL)
const users = await sql`SELECT user_id::text AS user_id FROM bot_users ORDER BY updated_at DESC, user_id`

if (!sending) {
  console.log(JSON.stringify({ campaign, recipients: users.length, mode: "dry-run" }))
  process.exit(0)
}
if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is required")
const telegram = new Telegraf(process.env.BOT_TOKEN).telegram
const me = await telegram.getMe()
if (me.username.toLowerCase() !== "takhminkonkur_bot") throw new Error("Unexpected Telegram bot")

await sql`CREATE TABLE IF NOT EXISTS broadcast_deliveries (
  campaign TEXT NOT NULL,
  user_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  error_code TEXT,
  PRIMARY KEY (campaign, user_id)
)`
await sql`ALTER TABLE broadcast_deliveries ADD COLUMN IF NOT EXISTS button_status TEXT`
await sql`ALTER TABLE broadcast_deliveries ADD COLUMN IF NOT EXISTS message_id BIGINT`
await sql`UPDATE broadcast_deliveries SET status = 'uncertain', error_code = 'interrupted'
  WHERE campaign = ${campaign} AND status = 'sending'`
const prior = await sql`SELECT user_id::text AS user_id, status FROM broadcast_deliveries WHERE campaign = ${campaign}`
const processed = new Set(prior.map(row => row.user_id))
const pending = users.filter(row => !processed.has(row.user_id))
const counts = { total: users.length, already_processed: processed.size, sent: 0, unavailable: 0, failed: 0, uncertain: 0 }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let fileId

async function mark(userId, status, code = null) {
  await sql`UPDATE broadcast_deliveries SET status = ${status}, sent_at = CASE WHEN ${status} = 'sent' THEN NOW() ELSE NULL END,
    error_code = ${code} WHERE campaign = ${campaign} AND user_id = ${userId}`
}

async function send(userId, upload = false) {
  const claim = await sql`INSERT INTO broadcast_deliveries (campaign, user_id, status)
    VALUES (${campaign}, ${userId}, 'sending') ON CONFLICT DO NOTHING RETURNING user_id`
  if (!claim.length) return false
  for (let attempt = 0; attempt < 3; attempt++) {
    let result
    try {
      const video = upload ? Input.fromLocalFile(videoPath) : fileId
      result = await telegram.sendVideo(userId, video, { caption, reply_markup: consultationKeyboard })
    } catch (error) {
      const code = Number(error.response?.error_code || error.code)
      const retryAfter = Number(error.response?.parameters?.retry_after)
      if (code === 429 && attempt < 2) {
        await sleep((retryAfter > 0 ? retryAfter : 3) * 1000)
        continue
      }
      const description = String(error.response?.description || "")
      const unavailable = code === 403 || (code === 400 && /chat not found|user not found/i.test(description))
      if (code === 401) throw new Error("Telegram authentication failed")
      if (code === 400 && !unavailable) throw new Error("Telegram rejected the video or caption")
      const status = unavailable ? "unavailable" : code ? "failed" : "uncertain"
      await mark(userId, status, String(code || error.code || "network"))
      counts[status]++
      return false
    }
    if (upload) {
      fileId = result.video?.file_id
      if (!fileId) throw new Error("Telegram did not return a reusable video file ID")
    }
    await sql`UPDATE broadcast_deliveries SET status = 'sent', sent_at = NOW(),
      button_status = 'attached', message_id = ${result.message_id}
      WHERE campaign = ${campaign} AND user_id = ${userId}`
    counts.sent++
    return true
  }
  return false
}

while (!fileId && pending.length) {
  const user = pending.shift()
  await send(user.user_id, true)
}
if (!fileId) throw new Error("No reachable recipient was available to upload the video")

const active = new Set()
let lastProgress = 0
for (const user of pending) {
  const task = send(user.user_id).finally(() => active.delete(task))
  active.add(task)
  if (active.size >= 8) await Promise.race(active)
  await sleep(80)
  const progress = counts.sent + counts.unavailable + counts.failed + counts.uncertain
  if (progress >= lastProgress + 250) {
    lastProgress = progress
    console.log(JSON.stringify({ progress: counts }))
  }
}
await Promise.all(active)
console.log(JSON.stringify({ completed: counts }))

// Earlier interrupted sends had no inline keyboard. Send only the missing button,
// never another copy of the video. A claimed row is not retried automatically.
const missingButtons = await sql`SELECT user_id::text AS user_id FROM broadcast_deliveries
  WHERE campaign = ${campaign} AND status = 'sent' AND button_status IS NULL ORDER BY user_id`
const buttonCounts = { pending: missingButtons.length, sent: 0, unavailable: 0, uncertain: 0 }
for (const row of missingButtons) {
  const claimed = await sql`UPDATE broadcast_deliveries SET button_status = 'sending'
    WHERE campaign = ${campaign} AND user_id = ${row.user_id} AND button_status IS NULL RETURNING user_id`
  if (!claimed.length) continue
  try {
    await telegram.sendMessage(row.user_id, "برای ثبت درخواست مشاوره تخصصی، دکمهٔ زیر را بزنید:",
      { reply_markup: consultationKeyboard })
    await sql`UPDATE broadcast_deliveries SET button_status = 'sent'
      WHERE campaign = ${campaign} AND user_id = ${row.user_id}`
    buttonCounts.sent++
  } catch (error) {
    const code = Number(error.response?.error_code || error.code)
    const status = code === 403 ? 'unavailable' : 'uncertain'
    await sql`UPDATE broadcast_deliveries SET button_status = ${status}
      WHERE campaign = ${campaign} AND user_id = ${row.user_id}`
    buttonCounts[status]++
  }
  await sleep(80)
}
console.log(JSON.stringify({ buttonsForEarlierVideos: buttonCounts }))
