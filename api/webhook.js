import { processUpdate } from "../src/bot.js"

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).json({ ok: false })
  }

  const secret = request.headers["x-telegram-bot-api-secret-token"]
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return response.status(401).json({ ok: false })
  }

  try {
    await processUpdate(request.body)
    return response.status(200).json({ ok: true })
  } catch (error) {
    console.error(error)
    return response.status(500).json({ ok: false })
  }
}
