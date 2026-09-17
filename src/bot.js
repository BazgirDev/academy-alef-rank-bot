import path from "node:path"
import { fileURLToPath } from "node:url"
import { Input, Telegraf } from "telegraf"
import { claimUpdate, listConsultations, listContacts, loadUser, releaseUpdate, saveConsultation, saveContact, saveUser } from "./database.js"
import { admissionSuggestions } from "./admissions.js"
import {
  GPA_COEF,
  PCT_SUBJECTS,
  calcWeightedGpa,
  calcWeightedPercent,
  findRank,
  formatRankResult,
  gpaToTarazRange,
  percentToTaraz
} from "./calculations.js"
import {
  CONTACT_TEXT,
  PANSION_TEXT,
  TEACHERS_TEXT_1,
  TEACHERS_TEXT_2
} from "./content.js"

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const assets = {
  ranks: path.join(rootDirectory, "assets", "ranks.jpg"),
  pansion: path.join(rootDirectory, "assets", "pansion.png"),
}

const mainKeyboard = keyboard([["🎯 تخمین رتبه کنکور سراسری"], ["📞 درخواست مشاوره رایگان"], ["🏛 درباره آکادمی الف"], ["📞 ارتباط با ما"]])
const consultationButtonText = "مشاوره و بررسی تخصصی شانس قبولی"
const resultKeyboard = { reply_markup: { inline_keyboard: [[{ text: consultationButtonText, callback_data: "consultation_data" }]] } }
const rankToolsKeyboard = keyboard([["📊 تخمین رتبه کنکور با تراز کل"], ["🎓 تخمین قبولی با رتبه"], ["📈 تخمین تراز معدل امتحان نهایی"], ["🧪 تخمین رتبه با درصد + معدل نهایی"], ["🔙 بازگشت به منوی اصلی"]])
const rankFieldKeyboard = keyboard([["🧬 تجربی", "📐 ریاضی", "📚 انسانی"]], true)
const gpaFieldKeyboard = keyboard([["🧬 تجربی", "📐 ریاضی", "📚 انسانی"]], true)
const regionKeyboard = keyboard([["🥇 منطقه ۱", "🥈 منطقه ۲", "🥉 منطقه ۳"]], true)
const gpaModeKeyboard = keyboard([["📘 معدل کل"], ["📚 نمرات تک‌درس"], ["🔙 بازگشت"]])
const academyKeyboard = keyboard([["🏆 رتبه‌های برتر"], ["🏠 پانسیون مطالعاتی"], ["👨‍🏫 اساتید"], ["🔙 بازگشت به منوی اصلی"]])
const contactKeyboard = {
  reply_markup: {
    keyboard: [[{ text: "📱 ارسال شماره من", request_contact: true }], [{ text: "🔙 بازگشت به منوی اصلی" }]],
    resize_keyboard: true,
    one_time_keyboard: true
  }
}
const removeKeyboard = { reply_markup: { remove_keyboard: true } }
const consultationValueText = `✅🎉 *نتیجه تخمینی شما آماده است!*

🎯 برای بررسی دقیق‌تر نتیجه و دریافت مشاوره تلفنی و بررسی نتیجه به صورت تخصصی‌تر، دکمه زیر را فشار دهید 👇🏻`
const rankFromTarazText = `🎯 *حالا برو ببین با این تراز، رتبه‌ات چند می‌شود.*

تخمین رتبه بر اساس داده‌های ربات با دقت بیش از ۹۰٪ انجام می‌شود.

از بخش «تخمین رتبه کنکور با تراز کل» استفاده کن.`
const regionMap = { "🥇 منطقه ۱": "1", "🥈 منطقه ۲": "2", "🥉 منطقه ۳": "3", "منطقه ۱": "1", "منطقه ۲": "2", "منطقه ۳": "3" }
let bot

function keyboard(rows, oneTime = false) {
  return { reply_markup: { keyboard: rows.map(row => row.map(text => ({ text }))), resize_keyboard: true, one_time_keyboard: oneTime } }
}

function telegram() {
  if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is required")
  if (!bot) bot = new Telegraf(process.env.BOT_TOKEN)
  return bot.telegram
}

function adminIds() {
  return (process.env.CONTACT_ADMIN_CHAT_IDS || "2011517182,168675688").split(",").map(value => Number(value.trim())).filter(Number.isSafeInteger)
}

function mainKeyboardFor(userId) {
  if (!adminIds().includes(Number(userId))) return mainKeyboard
  return keyboard([["🎯 تخمین رتبه کنکور سراسری"], ["📞 درخواست مشاوره رایگان"], ["📋 فرم‌های مشاوره", "👥 مخاطبین"], ["🏛 درباره آکادمی الف"], ["📞 ارتباط با ما"]])
}

function numberFrom(text) {
  const normalized = String(text || "").trim().replace(/[،,\s]/g, "").replace(/[۰-۹]/g, digit => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function clearCalculation(data) {
  return Object.fromEntries(["contact_verified", "phone_number", "contact_name", "last_estimate"].filter(key => key in data).map(key => [key, data[key]]))
}

function rememberEstimate(session, details, result) {
  session.data.last_estimate = { ...details, result, created_at: new Date().toISOString() }
}

async function typing(chatId) {
  await telegram().sendChatAction(chatId, "typing")
}

async function reply(chatId, text, extra = {}) {
  return telegram().sendMessage(chatId, text, extra)
}

async function markdown(chatId, text, extra = {}) {
  return reply(chatId, text, { parse_mode: "Markdown", ...extra })
}

async function retry(operation, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === attempts) throw error
      await new Promise(resolve => setTimeout(resolve, attempt * 250))
    }
  }
}

async function notifyAdmins(text, contact) {
  await Promise.allSettled(adminIds().map(async chatId => {
    if (contact) {
      await retry(() => telegram().sendContact(chatId, contact.phone_number, contact.first_name || "کاربر ربات", { last_name: contact.last_name || undefined }))
    }
    await retry(() => reply(chatId, text))
  }))
}

async function persistSharedContact(message, value, session) {
  const fullName = [value.first_name, value.last_name].filter(Boolean).join(" ") || [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "—"
  session.data.phone_number = value.phone_number
  session.data.contact_name = fullName
  session.data.contact_verified = true
  await saveContact({
    userId: message.from.id,
    chatId: message.chat.id,
    fullName,
    username: message.from.username || null,
    phoneNumber: value.phone_number
  })
  return fullName
}

async function sendPhoto(chatId, file, caption) {
  const extra = caption ? { caption, parse_mode: "Markdown" } : {}
  await telegram().sendPhoto(chatId, Input.fromLocalFile(file), extra)
}

async function welcome(message, session) {
  await typing(message.chat.id)
  const user = message.from
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ")
  await notifyAdmins(`🚀 کاربر ربات را شروع کرد\n\nنام: ${fullName || "—"}\nنام کاربری: ${user.username ? `@${user.username}` : "—"}\nشناسه تلگرام: ${user.id}`)
  await markdown(message.chat.id, "🎓 *آکادمی الف | Academy Alef*\n«یادگیری هوشمند، موفقیت پایدار»\n\n━━━━━━━━━━━━━━━━━━━━\n\nبه دستیار هوشمند آکادمی الف خوش آمدید.\n\nاز منوی زیر بخش موردنظر را انتخاب کنید 👇", mainKeyboardFor(user.id))
  if (adminIds().includes(user.id)) await reply(message.chat.id, "✅ دسترسی دریافت مخاطبان برای این حساب مدیر فعال است.")
  session.state = "MAIN_MENU"
}

async function showResult(chatId, userId, session, result, suggestRank = false) {
  const completeResult = `${consultationValueText}\n\n${result}`
  if (session.data.contact_verified) {
    await typing(chatId)
    await markdown(chatId, completeResult, resultKeyboard)
    if (suggestRank) await markdown(chatId, rankFromTarazText, rankToolsKeyboard)
    session.data = clearCalculation(session.data)
    session.state = "MAIN_MENU"
    return
  }
  session.data.pending_result = completeResult
  session.data.pending_rank_suggestion = suggestRank
  await reply(chatId, "✅ محاسبه انجام شد.\n\nبرای مشاهده نتیجه نهایی، رتبه یا تراز، فقط یک‌بار شماره خودت را با دکمه زیر Share کن. شماره پس از تأیید برای مدیران آکادمی ارسال می‌شود.", contactKeyboard)
  session.state = "RANK_CONTACT"
}

async function start(message, session) {
  session.data = clearCalculation(session.data)
  if (session.data.contact_verified && session.data.phone_number) return welcome(message, session)
  await markdown(message.chat.id, "👋 *خوش آمدید به آکادمی الف*\n\nبرای استفاده از تخمین رتبه، بررسی شانس قبولی و خدمات ربات، ابتدا باید شمارهٔ متعلق به خودت را با دکمهٔ زیر Share کنی.\n\n🔒 شماره فقط برای ثبت درخواست و تماس مشاوره آکادمی استفاده می‌شود.", contactKeyboard)
  session.state = "START_CONTACT"
}

async function startContact(message, session, text) {
  if (text === "🔙 بازگشت به منوی اصلی") return reply(message.chat.id, "برای استفاده از ربات، ابتدا شمارهٔ خودت را با دکمهٔ «📱 ارسال شماره من» تأیید کن.", contactKeyboard)
  const value = message.contact
  if (!value) return reply(message.chat.id, "لطفاً شمارهٔ خودت را فقط با دکمهٔ «📱 ارسال شماره من» تأیید کن.", contactKeyboard)
  if (value.user_id !== message.from.id) return reply(message.chat.id, "⚠️ این شماره متعلق به حساب تلگرام شما نیست. لطفاً شمارهٔ خودت را ارسال کن.", contactKeyboard)
  const fullName = await persistSharedContact(message, value, session)
  await notifyAdmins(`📥 مخاطب جدید ربات\n\nنام: ${fullName}\nشماره: ${value.phone_number}\nنام کاربری: ${message.from.username ? `@${message.from.username}` : "—"}\nشناسه تلگرام: ${message.from.id}`, value)
  await welcome(message, session)
}

async function adminCheck(message) {
  if (!adminIds().includes(message.from.id)) return reply(message.chat.id, "⛔️ این دستور فقط برای مدیران ربات فعال است.")
  try {
    await retry(() => telegram().sendContact(message.chat.id, "+989000000000", "TEST - Academy Alef", { last_name: "Contact delivery check" }))
    await reply(message.chat.id, "✅ تست موفق بود؛ این حساب می‌تواند Contactهای کاربران را دریافت کند.")
  } catch {
    await reply(message.chat.id, "❌ تست Contact ناموفق بود. لاگ سرویس را برای خطای Telegram بررسی کنید.")
  }
}

async function mainMenu(message, session, text) {
  if (text === "🎯 تخمین رتبه کنکور سراسری") {
    await typing(message.chat.id)
    await markdown(message.chat.id, "🎯 *تخمین رتبه کنکور سراسری*\n\nروش موردنظر را انتخاب کن:", rankToolsKeyboard)
    session.state = "RANK_MENU"
  } else if (text === "🏛 درباره آکادمی الف") {
    await typing(message.chat.id)
    await markdown(message.chat.id, "🏛 *درباره آکادمی الف*\n\nآکادمی الف مجموعه‌ای آموزشی با تمرکز بر آموزش هدفمند، مشاوره، پانسیون مطالعاتی و همراهی مستمر دانش‌آموزان است.\n\nموضوع موردنظر را انتخاب کنید:", academyKeyboard)
    session.state = "ACADEMY_MENU"
  } else if (text === "📞 ارتباط با ما") {
    await typing(message.chat.id)
    await markdown(message.chat.id, CONTACT_TEXT, mainKeyboardFor(message.from.id))
  } else if (text === "📞 درخواست مشاوره رایگان") {
    await startConsultation(message, session)
  } else {
    await reply(message.chat.id, "لطفاً یکی از گزینه‌های منو را انتخاب کن.", mainKeyboard)
  }
}

async function rankMenu(message, session, text) {
  const choices = {
    "📊 تخمین رتبه کنکور با تراز کل": ["RANK_FIELD", "📊 *تخمین رتبه کنکور با تراز کل*\n\nابتدا رشته خودت را انتخاب کن:", rankFieldKeyboard],
    "🎓 تخمین قبولی با رتبه": ["ADMISSION_FIELD", "🎓 *تخمین قبولی با رتبه*\n\nگروه آزمایشی خودت را انتخاب کن:", gpaFieldKeyboard],
    "📈 تخمین تراز معدل امتحان نهایی": ["GPA_FIELD", "📈 *تخمین تراز معدل امتحان نهایی*\n\nرشته خودت را انتخاب کن:", gpaFieldKeyboard],
    "🧪 تخمین رتبه با درصد + معدل نهایی": ["PCT_FIELD", "🧪 *تخمین رتبه با درصد دروس + معدل نهایی*\n\nرشته خودت را انتخاب کن:", rankFieldKeyboard]
  }
  if (text === "🔙 بازگشت به منوی اصلی") {
    await reply(message.chat.id, "به منوی اصلی بازگشتید.", mainKeyboard)
    session.state = "MAIN_MENU"
  } else if (choices[text]) {
    const [state, prompt, keys] = choices[text]
    await typing(message.chat.id)
    await markdown(message.chat.id, prompt, keys)
    session.state = state
  } else {
    await reply(message.chat.id, "لطفاً یکی از روش‌های تخمین را انتخاب کنید.", rankToolsKeyboard)
  }
}

function selectedField(text, allowHumanities = false) {
  if (text.includes("تجربی")) return "tajrobi"
  if (text.includes("ریاضی")) return "riazi"
  if (allowHumanities && text.includes("انسانی")) return "ensani"
  return null
}

async function rankField(message, session, text) {
  const field = selectedField(text, true)
  if (!field) return reply(message.chat.id, "لطفاً یکی از دکمه‌ها را انتخاب کن.", rankFieldKeyboard)
  session.data.field = field
  await typing(message.chat.id)
  await reply(message.chat.id, "✅ رشته ثبت شد.\n\n📍 حالا منطقه را انتخاب کن:", regionKeyboard)
  session.state = "RANK_REGION"
}

async function chooseRegion(message, session, text, nextState) {
  if (!regionMap[text]) return reply(message.chat.id, "لطفاً یکی از مناطق را انتخاب کن.", regionKeyboard)
  session.data.region = regionMap[text]
  await typing(message.chat.id)
  if (nextState === "RANK_SCORE") await markdown(message.chat.id, "📈 حالا *تراز کل* خودت را وارد کن (از زیر ۵۰۰۰ تا ۱۱۰۰۰):\n\nمثال: `4750` یا `8750`", removeKeyboard)
  else await markdown(message.chat.id, "معدل نهایی (دیپلم) خودت را وارد کن (۱۰ تا ۲۰):\n\nمثال: `18.20`", removeKeyboard)
  session.state = nextState
}

async function rankScore(message, session, text) {
  const score = numberFrom(text)
  if (score === null || score < 0 || score > 11000) return reply(message.chat.id, "⚠️ تراز معتبر وارد کن (از زیر ۵۰۰۰ تا حداکثر ۱۱۰۰۰).")
  await typing(message.chat.id)
  const loading = await reply(message.chat.id, "⏳ در حال محاسبه...")
  const rank = findRank(session.data.field, session.data.region, score)
  const admission = admissionSuggestions(session.data.field, session.data.region, rank)
  const result = [formatRankResult(session.data.field, session.data.region, score, rank), admission].filter(Boolean).join("\n\n")
  rememberEstimate(session, { type: "تخمین رتبه با تراز کل", field: session.data.field, region: session.data.region, taraz: score, rank }, result)
  await telegram().editMessageText(message.chat.id, loading.message_id, undefined, "✅ محاسبه با موفقیت انجام شد.")
  await showResult(message.chat.id, message.from.id, session, result)
}

async function admissionField(message, session, text) {
  const field = selectedField(text, true)
  if (!field) return reply(message.chat.id, "لطفاً یکی از دکمه‌ها را انتخاب کن.", gpaFieldKeyboard)
  session.data.field = field
  await reply(message.chat.id, "📍 منطقه خودت را انتخاب کن:", regionKeyboard)
  session.state = "ADMISSION_REGION"
}

async function admissionRegion(message, session, text) {
  if (!regionMap[text]) return reply(message.chat.id, "لطفاً یکی از مناطق را انتخاب کن.", regionKeyboard)
  session.data.region = regionMap[text]
  await markdown(message.chat.id, "🏆 رتبه‌ات را وارد کن:\n\nمثال: `1850`", removeKeyboard)
  session.state = "ADMISSION_RANK"
}

async function admissionRank(message, session, text) {
  const rank = numberFrom(text)
  if (rank === null || rank < 1) return reply(message.chat.id, "⚠️ یک رتبه معتبر وارد کن.")
  const suggestions = admissionSuggestions(session.data.field, session.data.region, String(Math.round(rank)))
  if (!suggestions) return reply(message.chat.id, "⚠️ برای این انتخاب داده‌ای پیدا نشد.", mainKeyboardFor(message.from.id))
  const fieldName = { tajrobi: "تجربی", riazi: "ریاضی", ensani: "انسانی" }[session.data.field]
  const result = `🎯 *نتیجه تخمین قبولی*\n\n🎓 گروه: *${fieldName}*\n📍 منطقه: *${session.data.region}*\n🏆 رتبه: *${Math.round(rank)}*\n\n${suggestions}`
  rememberEstimate(session, { type: "تخمین قبولی با رتبه", field: session.data.field, region: session.data.region, rank: String(Math.round(rank)) }, result)
  await showResult(message.chat.id, message.from.id, session, result)
}

async function gpaField(message, session, text) {
  const field = selectedField(text, true)
  if (!field) return reply(message.chat.id, "لطفاً یکی از دکمه‌ها را انتخاب کن.", gpaFieldKeyboard)
  session.data.field = field
  await typing(message.chat.id)
  await reply(message.chat.id, "کدام روش را می‌خواهی؟", gpaModeKeyboard)
  session.state = "GPA_MODE"
}

async function gpaMode(message, session, text) {
  if (text === "📘 معدل کل") {
    await typing(message.chat.id)
    await markdown(message.chat.id, "معدل نهایی (دیپلم) خودت را وارد کن:\n\nمثال: `18.50`", removeKeyboard)
    session.state = "GPA_TOTAL"
  } else if (text === "📚 نمرات تک‌درس") {
    if (session.data.field === "ensani") return reply(message.chat.id, "فعلاً محاسبه نمرات تک‌درس رشته انسانی فعال نیست؛ «معدل کل» را انتخاب کن.", gpaModeKeyboard)
    session.data.gpa_scores = {}
    session.data.gpa_index = 0
    const first = GPA_COEF[session.data.field][0]
    await typing(message.chat.id)
    await markdown(message.chat.id, `نمره درس *${first.name}* را وارد کن (۱۰ تا ۲۰):`, removeKeyboard)
    session.state = "GPA_SINGLE"
  } else if (text === "🔙 بازگشت") {
    await reply(message.chat.id, "به منوی اصلی بازگشتید.", mainKeyboard)
    session.state = "MAIN_MENU"
  } else {
    await reply(message.chat.id, "لطفاً یکی از گزینه‌ها را انتخاب کن.", gpaModeKeyboard)
  }
}

function gpaResult(field, gpa, range, weighted = false) {
  const name = { tajrobi: "تجربی", riazi: "ریاضی", ensani: "انسانی" }[field]
  const rangeText = range[0] === range[1] ? String(range[0]) : `${range[0]} تا ${range[1]}`
  return `📈 *نتیجه تخمین تراز از معدل${weighted ? " وزنی" : ""}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🎓 رشته: *${name}*\n📊 معدل${weighted ? " وزنی" : ""}: *${weighted ? gpa.toFixed(2) : gpa}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n🏆 بازه تراز تخمینی:\n*${rangeText}*\n\n━━━━━━━━━━━━━━━━━━━━\n\n💡 این تب فقط تراز می‌دهد و رتبه محاسبه نمی‌شود.`
}

async function gpaTotal(message, session, text) {
  const gpa = numberFrom(text)
  if (gpa === null || gpa < 10 || gpa > 20) return reply(message.chat.id, "⚠️ معدل معتبر وارد کن (۱۰ تا ۲۰).")
  const range = gpaToTarazRange(gpa, session.data.field)
  if (!range) return reply(message.chat.id, "⚠️ داده تخمین برای معدل‌های ۱۰ تا ۲۰ تعریف شده است.")
  const result = gpaResult(session.data.field, gpa, range)
  rememberEstimate(session, { type: "تخمین تراز معدل کل", field: session.data.field, gpa, taraz: Math.round((range[0] + range[1]) / 2), taraz_range: range }, result)
  await showResult(message.chat.id, message.from.id, session, result, true)
}

async function gpaSingle(message, session, text) {
  const score = numberFrom(text)
  if (score === null || score < 10 || score > 20) return reply(message.chat.id, "⚠️ نمره معتبر وارد کن (۱۰ تا ۲۰).")
  const subjects = GPA_COEF[session.data.field]
  const index = session.data.gpa_index
  session.data.gpa_scores[subjects[index].id] = score
  session.data.gpa_index += 1
  if (session.data.gpa_index < subjects.length) {
    const next = subjects[session.data.gpa_index]
    return markdown(message.chat.id, `نمره درس *${next.name}* را وارد کن (۱۰ تا ۲۰):`)
  }
  const weighted = calcWeightedGpa(session.data.gpa_scores, session.data.field)
  const range = gpaToTarazRange(weighted, session.data.field)
  if (!weighted || !range) {
    await reply(message.chat.id, "خطا در محاسبه معدل وزنی.", mainKeyboard)
    session.state = "MAIN_MENU"
    return
  }
  const result = gpaResult(session.data.field, weighted, range, true)
  rememberEstimate(session, { type: "تخمین تراز معدل وزنی", field: session.data.field, gpa: weighted, taraz: Math.round((range[0] + range[1]) / 2), taraz_range: range }, result)
  await showResult(message.chat.id, message.from.id, session, result, true)
}

async function pctField(message, session, text) {
  const field = selectedField(text)
  if (!field) return reply(message.chat.id, "لطفاً یکی از دکمه‌ها را انتخاب کن.", rankFieldKeyboard)
  session.data.field = field
  await typing(message.chat.id)
  await reply(message.chat.id, "✅ رشته ثبت شد.\n\n📍 حالا منطقه را انتخاب کن:", regionKeyboard)
  session.state = "PCT_REGION"
}

async function pctGpa(message, session, text) {
  const gpa = numberFrom(text)
  if (gpa === null || gpa < 10 || gpa > 20) return reply(message.chat.id, "⚠️ معدل معتبر وارد کن (۱۰ تا ۲۰).")
  session.data.gpa = gpa
  session.data.pct_scores = {}
  session.data.pct_index = 0
  const first = PCT_SUBJECTS[session.data.field][0]
  await typing(message.chat.id)
  await markdown(message.chat.id, `درصد درس *${first.name}* را وارد کن (۳۳- تا ۱۰۰):\n\nمثال: \`55\``)
  session.state = "PCT_SUBJECTS_INPUT"
}

async function pctInput(message, session, text) {
  const percentage = numberFrom(text)
  if (percentage === null || percentage < -33 || percentage > 100) return reply(message.chat.id, "⚠️ درصد معتبر وارد کن (۳۳- تا ۱۰۰).")
  const subjects = PCT_SUBJECTS[session.data.field]
  const index = session.data.pct_index
  session.data.pct_scores[subjects[index].id] = percentage
  session.data.pct_index += 1
  if (session.data.pct_index < subjects.length) {
    const next = subjects[session.data.pct_index]
    return markdown(message.chat.id, `درصد درس *${next.name}* را وارد کن (۳۳- تا ۱۰۰):`)
  }
  const average = calcWeightedPercent(session.data.pct_scores, session.data.field)
  const gpaRange = gpaToTarazRange(session.data.gpa, session.data.field)
  const percentageTaraz = percentToTaraz(average, session.data.field)
  if (average === null || !gpaRange || percentageTaraz === null) {
    await reply(message.chat.id, "⚠️ ورودی خارج از دامنه داده‌های مرجع است.", mainKeyboard)
    session.state = "MAIN_MENU"
    return
  }
  const gpaTaraz = Math.round((gpaRange[0] + gpaRange[1]) / 2)
  const finalTaraz = Math.round(gpaTaraz * 0.6 + percentageTaraz * 0.4)
  const rank = findRank(session.data.field, session.data.region, finalTaraz)
  const rankResult = `🎉 *نتیجه تخمین رتبه*\n\n📊 تراز معدل: *${gpaTaraz}*\n📈 تراز درصد: *${percentageTaraz}*\n⭐ تراز کل: *${finalTaraz}*\n\n🏆 رتبه تقریبی: *${rank || "خارج از بازه"}*`
  const result = [rankResult, admissionSuggestions(session.data.field, session.data.region, rank)].filter(Boolean).join("\n\n")
  rememberEstimate(session, { type: "تخمین رتبه با درصد و معدل", field: session.data.field, region: session.data.region, gpa: session.data.gpa, weighted_percent: average, taraz: finalTaraz, rank }, result)
  await showResult(message.chat.id, message.from.id, session, result)
}

async function contact(message, session, text) {
  if (text === "🔙 بازگشت به منوی اصلی") {
    delete session.data.pending_result
    await reply(message.chat.id, "به منوی اصلی بازگشتید.", mainKeyboard)
    session.state = "MAIN_MENU"
    return
  }
  const value = message.contact
  if (!value) return reply(message.chat.id, "لطفاً شماره خودت را فقط با دکمه «📱 ارسال شماره من» تأیید کن.", contactKeyboard)
  if (value.user_id !== message.from.id) return reply(message.chat.id, "⚠️ این شماره متعلق به حساب تلگرام شما نیست. لطفاً شماره خودت را با دکمه زیر ارسال کن.", contactKeyboard)
  const fullName = await persistSharedContact(message, value, session)
  await notifyAdmins(`📥 مخاطب جدید بخش تخمین رتبه\n\nنام: ${fullName || "—"}\nشماره: ${value.phone_number}\nنام کاربری: ${message.from.username ? `@${message.from.username}` : "—"}\nشناسه تلگرام: ${message.from.id}`, value)
  const pending = session.data.pending_result
  const suggestRank = session.data.pending_rank_suggestion === true
  delete session.data.pending_result
  delete session.data.pending_rank_suggestion
  if (pending) {
    await reply(message.chat.id, "✅ شماره شما تأیید شد. نتیجه محاسبه:", removeKeyboard)
    await markdown(message.chat.id, pending, resultKeyboard)
    if (suggestRank) await markdown(message.chat.id, rankFromTarazText, rankToolsKeyboard)
  } else {
    await reply(message.chat.id, "✅ شماره شما تأیید شد. از این به بعد دوباره درخواست نمی‌شود.", mainKeyboard)
  }
  session.data = clearCalculation(session.data)
  session.state = "MAIN_MENU"
}

async function startConsultation(message, session) {
  session.data = clearCalculation(session.data)
  if (!session.data.contact_verified || !session.data.phone_number) {
    await reply(message.chat.id, "برای ثبت درخواست مشاوره رایگان، ابتدا شماره خودت را با دکمه «📱 ارسال شماره من» تأیید کن.", contactKeyboard)
    session.state = "CONSULT_CONTACT"
    return
  }
  await registerConsultation(message, session)
}

async function consultationContact(message, session, text) {
  if (text === "🔙 بازگشت به منوی اصلی") {
    await reply(message.chat.id, "به منوی اصلی بازگشتید.", mainKeyboard)
    session.state = "MAIN_MENU"
    return
  }
  const value = message.contact
  if (!value) return reply(message.chat.id, "لطفاً شماره خودت را فقط با دکمه «📱 ارسال شماره من» تأیید کن.", contactKeyboard)
  if (value.user_id !== message.from.id) return reply(message.chat.id, "⚠️ این شماره متعلق به حساب تلگرام شما نیست. لطفاً شماره خودت را ارسال کن.", contactKeyboard)
  await persistSharedContact(message, value, session)
  await registerConsultation(message, session, value)
}

export function estimateAdminText(estimate) {
  if (!estimate) return "📊 تخمین: ندارد"
  const field = { tajrobi: "تجربی", riazi: "ریاضی", ensani: "انسانی" }[estimate.field] || estimate.field || "—"
  return `🎓 ${field}\n📍 منطقه ${estimate.region || "—"}\n📊 تراز: ${estimate.taraz ?? "—"}\n🏆 رتبه: ${estimate.rank || "—"}`
}

async function registerConsultation(message, session, contactValue) {
  const fullName = session.data.contact_name || [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "—"
  const request = {
    userId: message.from.id,
    fullName,
    username: message.from.username || null,
    phoneNumber: session.data.phone_number,
    interests: "ثبت مستقیم بدون فرم",
    estimate: session.data.last_estimate || null
  }
  const created = await saveConsultation(request)
  if (!created) {
    await reply(message.chat.id, "✅ درخواست مشاوره شما قبلاً ثبت شده است. با شما تماس می‌گیریم 📞", mainKeyboardFor(message.from.id))
    session.data = clearCalculation(session.data)
    session.state = "MAIN_MENU"
    return
  }
  const adminText = `📞 درخواست مشاوره\n👤 ${fullName}\n\n${estimateAdminText(request.estimate)}`
  await notifyAdmins(adminText, contactValue || { phone_number: request.phoneNumber, first_name: fullName })
  await reply(message.chat.id, "✅📞 درخواست مشاوره رایگان شما ثبت شد.\n\nکارشناسان آکادمی الف برای هماهنگی با شما تماس می‌گیرند.", mainKeyboardFor(message.from.id))
  session.data = clearCalculation(session.data)
  session.state = "MAIN_MENU"
}

export function consultationListMessages(rows) {
  if (!rows.length) return ["📋 هنوز هیچ درخواست مشاوره‌ای ثبت نشده است.\n\nتعداد کل: ۰"]
  const entries = rows.map((row, index) => {
    const estimate = row.estimate || null
    const requestedAt = new Date(row.requested_at).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })
    return `${index + 1}) ${row.full_name}\nشماره: ${row.phone_number}\nنام کاربری: ${row.username ? `@${row.username}` : "—"}\nشناسه: ${row.user_id}\nزمان درخواست: ${requestedAt}\n${estimateAdminText(estimate)}`
  })
  const messages = []
  let current = `📋 درخواست‌های مشاوره\n\nتعداد کل: ${rows.length}`
  for (const entry of entries) {
    if (`${current}\n\n${entry}`.length > 3800) {
      messages.push(current)
      current = entry
    } else current += `\n\n${entry}`
  }
  messages.push(current)
  return messages
}

async function listConsultationRequests(message) {
  if (!adminIds().includes(message.from.id)) return reply(message.chat.id, "⛔️ این دستور فقط برای مدیران ربات فعال است.")
  const rows = await listConsultations()
  for (const text of consultationListMessages(rows)) await reply(message.chat.id, text)
}

export function contactListSummary(rows) {
  if (!rows.length) return "👥 هنوز هیچ مخاطبی ثبت نشده است.\n\nتعداد کل: ۰"
  return `👥 فهرست مخاطبین ثبت‌شده\n\nتعداد کل: ${rows.length}`
}

async function listSavedContacts(message) {
  if (!adminIds().includes(message.from.id)) return reply(message.chat.id, "⛔️ این دستور فقط برای مدیران ربات فعال است.")
  const rows = await listContacts()
  await reply(message.chat.id, contactListSummary(rows), mainKeyboardFor(message.from.id))
  for (const row of rows) {
    await retry(() => telegram().sendContact(message.chat.id, row.phone_number, row.full_name || "کاربر ربات"))
    const sharedAt = new Date(row.shared_at).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })
    await reply(message.chat.id, `نام: ${row.full_name}\nنام کاربری: ${row.username ? `@${row.username}` : "—"}\nشناسه تلگرام: ${row.user_id}\nزمان ثبت: ${sharedAt}`)
  }
}

async function academyMenu(message, session, text) {
  if (text === "🔙 بازگشت به منوی اصلی") {
    await reply(message.chat.id, "به منوی اصلی بازگشتید.", mainKeyboard)
    session.state = "MAIN_MENU"
    return
  }
  await typing(message.chat.id)
  if (text === "🏆 رتبه‌های برتر") await sendPhoto(message.chat.id, assets.ranks)
  else if (text === "🏠 پانسیون مطالعاتی") await sendPhoto(message.chat.id, assets.pansion, PANSION_TEXT)
  else if (text === "👨‍🏫 اساتید") {
    await markdown(message.chat.id, TEACHERS_TEXT_1)
    await markdown(message.chat.id, TEACHERS_TEXT_2)
  } else return reply(message.chat.id, "لطفاً یکی از گزینه‌ها را انتخاب کنید.", academyKeyboard)
  await reply(message.chat.id, "موضوع دیگری را انتخاب کنید:", academyKeyboard)
}

const handlers = {
  MAIN_MENU: mainMenu,
  RANK_MENU: rankMenu,
  RANK_FIELD: rankField,
  RANK_REGION: (message, session, text) => chooseRegion(message, session, text, "RANK_SCORE"),
  RANK_SCORE: rankScore,
  ADMISSION_FIELD: admissionField,
  ADMISSION_REGION: admissionRegion,
  ADMISSION_RANK: admissionRank,
  GPA_FIELD: gpaField,
  GPA_MODE: gpaMode,
  GPA_TOTAL: gpaTotal,
  GPA_SINGLE: gpaSingle,
  PCT_FIELD: pctField,
  PCT_REGION: (message, session, text) => chooseRegion(message, session, text, "PCT_GPA"),
  PCT_GPA: pctGpa,
  PCT_SUBJECTS_INPUT: pctInput,
  RANK_CONTACT: contact,
  START_CONTACT: startContact,
  ACADEMY_MENU: academyMenu,
  CONSULT_CONTACT: consultationContact,
  CONSULT_INTERESTS: startConsultation
}

export async function processUpdate(update) {
  if (!update || !Number.isSafeInteger(update.update_id)) return
  const callback = update.callback_query
  const message = callback?.message ? { ...callback.message, from: callback.from } : update.message
  if (!message?.from?.id || !message.chat?.id) return
  if (!(await claimUpdate(update.update_id))) return
  try {
    const session = await loadUser(message.from.id)
    const text = callback ? String(callback.data || "") : String(message.text || "").trim()
    if (callback) await telegram().answerCbQuery(callback.id)
    if (text === "/start" || text.startsWith("/start@")) await start(message, session)
    else if (text === "/admincheck" || text.startsWith("/admincheck@")) await adminCheck(message)
    else if (text === "/moshavereha" || text.startsWith("/moshavereha@") || text === "📋 فرم‌های مشاوره") await listConsultationRequests(message)
    else if (text === "/contact" || text.startsWith("/contact@") || text === "👥 مخاطبین") await listSavedContacts(message)
    else if (text === "consultation_data" || text === "/data" || text.startsWith("/data@") || text === "/moshavere" || text.startsWith("/moshavere@")) await startConsultation(message, session)
    else if (text === "/cancel" || text.startsWith("/cancel@")) {
      session.data = clearCalculation(session.data)
      session.state = "IDLE"
      await reply(message.chat.id, "🛑 عملیات لغو شد.\n\nبرای شروع دوباره /start را بزن.", removeKeyboard)
    } else if (handlers[session.state]) await handlers[session.state](message, session, text)
    else await reply(message.chat.id, "برای شروع دوباره /start را بزن.", removeKeyboard)
    await saveUser(message.from.id, session.state, session.data)
  } catch (error) {
    await releaseUpdate(update.update_id)
    throw error
  }
}
