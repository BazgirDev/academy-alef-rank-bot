import "dotenv/config"

const token = process.env.BOT_TOKEN
const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "")
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET

if (!token || !baseUrl || !secretToken) {
  throw new Error("BOT_TOKEN, PUBLIC_BASE_URL and TELEGRAM_WEBHOOK_SECRET are required")
}

const api = `https://api.telegram.org/bot${token}`
const webhook = await fetch(`${api}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${baseUrl}/api/webhook`,
    secret_token: secretToken,
    allowed_updates: ["message"],
    drop_pending_updates: true
  })
})

const webhookResult = await webhook.json()
if (!webhookResult.ok) {
  throw new Error(webhookResult.description || "Webhook registration failed")
}

const commands = await fetch(`${api}/setMyCommands`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    commands: [
      { command: "start", description: "شروع ربات و منوی اصلی" },
      { command: "moshavere", description: "درخواست مشاوره رایگان" },
      { command: "cancel", description: "لغو عملیات" }
    ]
  })
})

const commandsResult = await commands.json()
if (!commandsResult.ok) {
  throw new Error(commandsResult.description || "Command registration failed")
}

const adminChatIds = (process.env.CONTACT_ADMIN_CHAT_IDS || "2011517182,168675688").split(",").map(value => Number(value.trim())).filter(Number.isSafeInteger)
for (const chatId of adminChatIds) {
  const adminCommands = await fetch(`${api}/setMyCommands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scope: { type: "chat", chat_id: chatId },
      commands: [
        { command: "start", description: "شروع ربات و منوی اصلی" },
        { command: "moshavere", description: "درخواست مشاوره رایگان" },
        { command: "moshavereha", description: "فهرست فرم‌های مشاوره" },
        { command: "contact", description: "فهرست همه مخاطبین" },
        { command: "cancel", description: "لغو عملیات" }
      ]
    })
  })
  const adminCommandsResult = await adminCommands.json()
  if (!adminCommandsResult.ok) throw new Error(adminCommandsResult.description || `Admin command registration failed for ${chatId}`)
}

console.log("Webhook and bot commands registered")
