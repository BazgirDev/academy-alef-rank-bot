import { timingSafeEqual } from "node:crypto"
import { sendDailyAdminStats } from "../src/bot.js"

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  const secret = process.env.CRON_SECRET
  const expected = secret ? Buffer.from(`Bearer ${secret}`) : null
  const actual = Buffer.from(req.headers.authorization || "")
  if (!expected || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return res.status(401).json({ error: "Unauthorized" })
  }
  try {
    const sent = await sendDailyAdminStats()
    return res.status(200).json({ ok: true, sent })
  } catch (error) {
    console.error("Daily admin statistics failed", error)
    return res.status(500).json({ error: "Daily statistics failed" })
  }
}
