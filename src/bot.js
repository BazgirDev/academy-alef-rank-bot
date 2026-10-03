import path from "node:path"
import { fileURLToPath } from "node:url"
import { Input, Telegraf } from "telegraf"
import { claimDailyAdminReport, claimUpdate, countRecentActivity, createReferralCode, listConsultations, listContacts, listReferralCodes, loadUser, recordReferralStart, releaseDailyAdminReport, releaseUpdate, saveConsultation, saveContact, saveUser } from "./database.js"
import { formatDailyStats, reportDate } from "./daily-stats.js"
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
  rankEstimateFollowup: path.join(rootDirectory, "assets", "rank-estimate-followup.mp4"),
  puzzleAdmission: path.join(rootDirectory, "assets", "puzzle-admission-1405.png"),
  specialistPoster: path.join(rootDirectory, "assets", "poster-specialist-major-estimation-v2.png"),
}

const consultationMenuText = "🧭 ارتباط با مشاور تخصصی"
const academyIntroText = "🎬 آشنایی با آکادمی الف"
const introKeyboard = { reply_markup: { inline_keyboard: [[{ text: academyIntroText, callback_data: "academy_intro" }]] } }
const mainKeyboard = keyboard([[consultationMenuText], ["🎯 تخمین رتبه کنکور سراسری"], ["🏛 درباره آکادمی الف"], ["📞 ارتباط با ما"]])
const consultationButtonText = "🧭 درخواست مشاوره تخصصی انتخاب رشته"
const resultKeyboard = { reply_markup: { inline_keyboard: [[{ text: consultationButtonText, callback_data: "consultation_data" }]] } }
const rankToolsKeyboard = keyboard([["🎓 تخمین قبولی با رتبه"], ["🧪 تخمین رتبه با درصد + معدل نهایی"], ["📊 تخمین رتبه کنکور با تراز کل"], ["📈 تخمین تراز معدل امتحان نهایی"], ["🔙 بازگشت به منوی اصلی"]])
const requiredChannel = "@academyfirooznia"
const channelMembershipCallback = "check_channel_membership"
const channelMembershipKeyboard = { reply_markup: { inline_keyboard: [
  [{ text: "📢 عضویت در کانال مهندس ارسلان فیروزنیا", url: "https://t.me/academyfirooznia" }],
  [{ text: "✅ عضو شدم؛ بررسی عضویت", callback_data: channelMembershipCallback }]
] } }
const rankFieldKeyboard = keyboard([["🧬 تجربی", "📐 ریاضی", "📚 انسانی"]], true)
const gradeKeyboard = keyboard([["پایه دهم", "پایه یازدهم"], ["پایه دوازدهم", "فارغ‌التحصیل"]], true)
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

🎯 برای پیش‌ثبت‌نام رایگان بررسی تخصصی انتخاب رشته بر اساس رتبه و علاقه‌هایت، دکمه زیر را بزن 👇🏻`
const puzzleCaption = `🧩 *انتخاب رشته پازلی آکادمی الف*

ما علاقه‌ها، توانایی‌ها و رتبه‌ات را کنار هم می‌گذاریم و رشته‌محل‌ها را در بازه‌های مختلف شانس قبولی بررسی می‌کنیم.
با کدرشته‌های طلایی، فهرستی متناسب با اولویت‌های خودت می‌چینیم تا برای انتخاب دانشگاه و رشته دید روشن‌تری داشته باشی.`
const consultationPitch = `🎓 *پیش‌ثبت‌نام رایگان مشاوره تخصصی انتخاب رشته*

در آکادمی الف، برای هر دانش‌آموز یک مسیر اختصاصی می‌چینیم:

• 🧭 بررسی علاقه‌ها، کارنامه و رتبه
• 📊 استفاده از اطلاعات رسمی سازمان سنجش و داده‌های آخرین قبولی‌های در دسترس
• 🧩 چیدن کدرشته‌ها در بازه‌های مختلف شانس قبولی
• 👨‍🏫 بررسی پرونده توسط مشاور متخصص گروه آزمایشی تو

⏳ *ظرفیت بررسی فردی محدود است* تا هر پرونده با دقت پیگیری شود. همین حالا می‌توانی رایگان پیش‌ثبت‌نام کنی؛ تیم ما برای هماهنگی تماس می‌گیرد.

ℹ️ پیش‌ثبت‌نام به معنی رزرو قطعی زمان یا تضمین قبولی نیست.`
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

export async function sendDailyAdminStats(now = new Date()) {
  const ids = adminIds()
  if (ids.length === 0) throw new Error("CONTACT_ADMIN_CHAT_IDS is required")
  const counts = await countRecentActivity()
  const date = reportDate(now)
  const message = formatDailyStats(counts)
  const results = await Promise.allSettled(ids.map(async id => {
    if (!await claimDailyAdminReport(date, id)) return false
    try {
      await telegram().sendMessage(id, message)
      return true
    } catch (error) {
      await releaseDailyAdminReport(date, id)
      throw error
    }
  }))
  const failed = results.filter(result => result.status === "rejected")
  if (failed.length) throw new AggregateError(failed.map(result => result.reason), "Daily admin statistics delivery failed")
  return results.filter(result => result.value).length
}

function mainKeyboardFor(userId) {
  if (!adminIds().includes(Number(userId))) return mainKeyboard
  return keyboard([[consultationMenuText], ["🎯 تخمین رتبه کنکور سراسری"], ["📋 فرم‌های مشاوره", "👥 مخاطبین"], ["📊 آمار لینک‌های ارجاع"], ["🏛 درباره آکادمی الف"], ["📞 ارتباط با ما"]])
}

function numberFrom(text) {
  const normalized = String(text || "").trim().replace(/[،,\s]/g, "").replace(/[۰-۹]/g, digit => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function clearCalculation(data) {
  return Object.fromEntries(["contact_verified", "phone_number", "contact_name", "last_estimate"].filter(key => key in data).map(key => [key, data[key]]))
}

export function isChannelMember(member) {
  return ["creator", "administrator", "member"].includes(member?.status) ||
    (member?.status === "restricted" && member.is_member === true)
}

async function requestChannelMembership(chatId, unavailable = false) {
  const text = unavailable
    ? "⚠️ فعلاً امکان بررسی عضویت در کانال وجود ندارد. کمی بعد دوباره دکمهٔ بررسی عضویت را بزنید."
    : "برای استفاده از ربات، ابتدا در کانال مهندس ارسلان فیروزنیا عضو شوید؛ سپس دکمهٔ «عضو شدم؛ بررسی عضویت» را بزنید."
  await reply(chatId, text, channelMembershipKeyboard)
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

async function sendRankEstimateFollowup(chatId) {
  try {
    await telegram().sendVideo(chatId, Input.fromLocalFile(assets.rankEstimateFollowup))
  } catch (error) {
    console.error("Could not send rank estimate follow-up video", error)
  }
}

async function showAcademyIntro(message, session) {
  await telegram().sendVideo(message.chat.id, Input.fromLocalFile(assets.rankEstimateFollowup))
  await telegram().sendPhoto(message.chat.id, Input.fromLocalFile(assets.puzzleAdmission), { caption: puzzleCaption, parse_mode: "Markdown" })
  await reply(message.chat.id, "از منوی زیر مسیر بعدی‌ات را انتخاب کن 👇", mainKeyboardFor(message.from.id))
  session.state = "MAIN_MENU"
}

async function welcome(message, session, showIntro = false) {
  await typing(message.chat.id)
  const user = message.from
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ")
  if (!showIntro) await notifyAdmins(`🚀 کاربر ربات را شروع کرد\n\nنام: ${fullName || "—"}\nنام کاربری: ${user.username ? `@${user.username}` : "—"}\nشناسه تلگرام: ${user.id}`)
  const welcomeText = "🎓 به آکادمی الف خوش اومدی🌱\n\nاینجا رتبه و کارنامه‌ات را کنار علاقه‌ها و توانایی‌هایت بررسی می‌کنیم\n\n🧭 با همراهی مشاوران تخصصی هر گروه، رشته‌محل‌ها و مسیرهای پیش‌رو را آگاهانه‌تر می‌شناسی\n\n👨‍🏫 آکادمی الف با مدیریت مهندس ارسلان فیروزنیا و پشتوانهٔ ۱۴ سال تجربهٔ مشاوره و تدریس همراه توست\n\n✨ هدفمان کمک به انتخابی واقع‌بینانه و متناسب با آینده‌ای است که می‌خواهی"
  if (showIntro) await markdown(message.chat.id, welcomeText, introKeyboard)
  else await telegram().sendPhoto(message.chat.id, Input.fromLocalFile(assets.specialistPoster), { caption: welcomeText, parse_mode: "Markdown", ...mainKeyboardFor(user.id) })
  if (adminIds().includes(user.id)) await reply(message.chat.id, "✅ دسترسی دریافت مخاطبان برای این حساب مدیر فعال است.")
  session.state = showIntro ? "INTRO_READY" : "MAIN_MENU"
}

async function showResult(chatId, userId, session, result, suggestRank = false, sendFollowupVideo = false) {
  const completeResult = `${result}\n\n${consultationValueText}`
  if (session.data.contact_verified) {
    await typing(chatId)
    await markdown(chatId, completeResult, resultKeyboard)
    if (sendFollowupVideo) await sendRankEstimateFollowup(chatId)
    if (suggestRank) await markdown(chatId, rankFromTarazText, rankToolsKeyboard)
    session.data = clearCalculation(session.data)
    session.state = "MAIN_MENU"
    return
  }
  session.data.pending_result = completeResult
  session.data.pending_rank_suggestion = suggestRank
  session.data.pending_rank_video = sendFollowupVideo
  await reply(chatId, "✅ محاسبه انجام شد.\n\nبرای مشاهده نتیجه نهایی، رتبه یا تراز، فقط یک‌بار شماره خودت را با دکمه زیر Share کن. شماره پس از تأیید برای مدیران آکادمی ارسال می‌شود.", contactKeyboard)
  session.state = "RANK_CONTACT"
}

async function start(message, session) {
  session.data = clearCalculation(session.data)
  if (session.data.contact_verified && session.data.phone_number) return welcome(message, session)
  await telegram().sendPhoto(message.chat.id, Input.fromLocalFile(assets.specialistPoster), {
    caption: "👋 *خوش آمدید به آکادمی الف*\n\nبرای استفاده از تخمین رتبه، بررسی شانس قبولی و خدمات ربات، ابتدا باید شمارهٔ متعلق به خودت را با دکمهٔ زیر Share کنی.\n\n🔒 شماره فقط برای ثبت درخواست و تماس مشاوره آکادمی استفاده می‌شود.",
    parse_mode: "Markdown",
    ...contactKeyboard
  })
  session.state = "START_CONTACT"
}

async function startContact(message, session, text) {
  if (text === "🔙 بازگشت به منوی اصلی") return reply(message.chat.id, "برای استفاده از ربات، ابتدا شمارهٔ خودت را با دکمهٔ «📱 ارسال شماره من» تأیید کن.", contactKeyboard)
  const value = message.contact
  if (!value) return reply(message.chat.id, "لطفاً شمارهٔ خودت را فقط با دکمهٔ «📱 ارسال شماره من» تأیید کن.", contactKeyboard)
  if (value.user_id !== message.from.id) return reply(message.chat.id, "⚠️ این شماره متعلق به حساب تلگرام شما نیست. لطفاً شمارهٔ خودت را ارسال کن.", contactKeyboard)
  const fullName = await persistSharedContact(message, value, session)
  await notifyAdmins(`📥 مخاطب جدید ربات\n\nنام: ${fullName}\nشماره: ${value.phone_number}\nنام کاربری: ${message.from.username ? `@${message.from.username}` : "—"}\nشناسه تلگرام: ${message.from.id}`, value)
  await welcome(message, session, true)
}

async function introReady(message, session, text) {
  if (text === "academy_intro") return showAcademyIntro(message, session)
  await reply(message.chat.id, "برای ادامه، دکمه آشنایی با آکادمی الف را زیر پیام خوش‌آمد بزن.", introKeyboard)
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
  if (text === "📊 آمار لینک‌های ارجاع") {
    await showReferralCounts(message)
  } else if (text === "🎯 تخمین رتبه کنکور سراسری") {
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
  } else if (text === consultationMenuText || text === "📞 درخواست مشاوره رایگان") {
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
  await showResult(message.chat.id, message.from.id, session, result, false, true)
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
  const field = selectedField(text, true)
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
  if (average === null || !gpaRange) {
    await reply(message.chat.id, "⚠️ ورودی خارج از دامنه داده‌های مرجع است.", mainKeyboard)
    session.state = "MAIN_MENU"
    return
  }
  const gpaTaraz = Math.round((gpaRange[0] + gpaRange[1]) / 2)
  if (percentageTaraz === null) {
    const result = `🎉 *نتیجه میانگین وزنی درصدها*\n\n📊 میانگین وزنی درصدهای انسانی: *${average.toFixed(2)}٪*\n📊 تراز معدل: *${gpaTaraz}*\n📈 تراز درصد: *—*\n⭐ تراز کل: *—*\n🏆 رتبه تقریبی: *—*\n\nبرای این بازهٔ درصد انسانی دادهٔ تراز ۱۴۰۴ نداریم.`
    rememberEstimate(session, { type: "میانگین وزنی درصدهای انسانی", field: session.data.field, region: session.data.region, gpa: session.data.gpa, weighted_percent: average, taraz: null, rank: null }, result)
    await showResult(message.chat.id, message.from.id, session, result)
    return
  }
  const finalTaraz = Math.round(gpaTaraz * 0.6 + percentageTaraz * 0.4)
  const rank = findRank(session.data.field, session.data.region, finalTaraz)
  const rankResult = `🎉 *نتیجه تخمین رتبه*\n\n📊 تراز معدل: *${gpaTaraz}*\n📈 تراز درصد: *${percentageTaraz}*\n⭐ تراز کل: *${finalTaraz}*\n\n🏆 رتبه تقریبی: *${rank || "خارج از بازه"}*`
  const result = [rankResult, admissionSuggestions(session.data.field, session.data.region, rank)].filter(Boolean).join("\n\n")
  rememberEstimate(session, { type: "تخمین رتبه با درصد و معدل", field: session.data.field, region: session.data.region, gpa: session.data.gpa, weighted_percent: average, taraz: finalTaraz, rank }, result)
  await showResult(message.chat.id, message.from.id, session, result, false, true)
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
  const sendFollowupVideo = session.data.pending_rank_video === true
  delete session.data.pending_result
  delete session.data.pending_rank_suggestion
  delete session.data.pending_rank_video
  if (pending) {
    await reply(message.chat.id, "✅ شماره شما تأیید شد. نتیجه محاسبه:", removeKeyboard)
    await markdown(message.chat.id, pending, resultKeyboard)
    if (sendFollowupVideo) await sendRankEstimateFollowup(message.chat.id)
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
    await reply(message.chat.id, "برای شروع پیش‌ثبت‌نام مشاوره تخصصی، ابتدا شماره تلگرام خودت را با دکمه زیر Share کن.", contactKeyboard)
    session.state = "CONSULT_CONTACT"
    return
  }
  await showConsultationPitch(message, session)
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
  await showConsultationPitch(message, session)
}

async function showConsultationPitch(message, session) {
  await markdown(message.chat.id, consultationPitch, removeKeyboard)
  await telegram().sendPhoto(message.chat.id, Input.fromLocalFile(assets.puzzleAdmission))
  await reply(message.chat.id, "🎓 گروه آزمایشی‌ات را انتخاب کن:", rankFieldKeyboard)
  session.state = "CONSULT_FIELD"
}

async function consultationField(message, session, text) {
  const field = selectedField(text, true)
  if (!field) return reply(message.chat.id, "لطفاً گروه آزمایشی‌ات را با یکی از دکمه‌ها انتخاب کن.", rankFieldKeyboard)
  session.data.consultation_field = field
  await reply(message.chat.id, "📚 در کدام پایه هستی؟", gradeKeyboard)
  session.state = "CONSULT_GRADE"
}

async function consultationGrade(message, session, text) {
  const grades = ["پایه دهم", "پایه یازدهم", "پایه دوازدهم", "فارغ‌التحصیل"]
  if (!grades.includes(text)) return reply(message.chat.id, "لطفاً پایه‌ات را با یکی از دکمه‌ها انتخاب کن.", gradeKeyboard)
  session.data.consultation_grade = text
  await reply(message.chat.id, "📱 شماره تلفنی را که می‌خواهی مشاور با آن تماس بگیرد وارد کن:", removeKeyboard)
  session.state = "CONSULT_PHONE"
}

export function normalizeConsultationPhone(value) {
  const number = String(value || "").trim().replace(/[۰-۹]/g, digit => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)).replace(/[٠-٩]/g, digit => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
  return /^09\d{9}$/.test(number) && !/(\d)\1\1/.test(number) ? number : null
}

async function consultationPhone(message, session, text) {
  const phone = normalizeConsultationPhone(text)
  if (!phone) return reply(message.chat.id, "⚠️ شماره نامعتبر است. لطفاً شماره درست وارد کن 📱")
  session.data.consultation_phone = phone
  await registerConsultation(message, session)
}

export function estimateAdminText(estimate) {
  if (!estimate) return "📊 تخمین: ندارد"
  const field = { tajrobi: "تجربی", riazi: "ریاضی", ensani: "انسانی" }[estimate.field] || estimate.field || "—"
  return `🎓 ${field}\n📍 منطقه ${estimate.region || "—"}\n📊 تراز: ${estimate.taraz ?? "—"}\n🏆 رتبه: ${estimate.rank || "—"}`
}

async function registerConsultation(message, session) {
  const fullName = session.data.contact_name || [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "—"
  const fieldName = { tajrobi: "تجربی", riazi: "ریاضی", ensani: "انسانی" }[session.data.consultation_field]
  const request = {
    userId: message.from.id,
    fullName,
    username: message.from.username || null,
    phoneNumber: session.data.consultation_phone,
    field: fieldName,
    grade: session.data.consultation_grade,
    interests: `رشته: ${fieldName} | پایه: ${session.data.consultation_grade}`,
    estimate: session.data.last_estimate || null
  }
  await saveConsultation(request)
  const adminText = `🧭 پیش‌ثبت‌نام مشاوره تخصصی\n👤 ${fullName}\n🎓 رشته: ${fieldName}\n📚 پایه: ${request.grade}\n📱 شماره واردشده توسط کاربر: ${request.phoneNumber}\nنام کاربری: ${request.username ? `@${request.username}` : "—"}\nشناسه تلگرام: ${request.userId}\n\n${estimateAdminText(request.estimate)}`
  await notifyAdmins(adminText, { phone_number: request.phoneNumber, first_name: fullName })
  await reply(message.chat.id, "✅ درخواست پیش‌ثبت‌نام رایگان مشاوره تخصصی ثبت شد. تیم آکادمی الف برای هماهنگی با شماره‌ای که وارد کردی تماس می‌گیرد.", mainKeyboardFor(message.from.id))
  session.data = clearCalculation(session.data)
  session.state = "MAIN_MENU"
}

export function consultationListMessages(rows) {
  if (!rows.length) return ["📋 هنوز هیچ درخواست مشاوره‌ای ثبت نشده است.\n\nتعداد کل: ۰"]
  const entries = rows.map((row, index) => {
    const estimate = row.estimate || null
    const requestedAt = new Date(row.requested_at).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })
    return `${index + 1}) ${row.full_name}\nرشته: ${row.field || "—"}\nپایه: ${row.grade || "—"}\nشماره واردشده: ${row.phone_number}\nنام کاربری: ${row.username ? `@${row.username}` : "—"}\nشناسه: ${row.user_id}\nزمان درخواست: ${requestedAt}\n${estimateAdminText(estimate)}`
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

async function createReferralLink(message, text) {
  if (!adminIds().includes(message.from.id)) return reply(message.chat.id, "⛔️ این دستور فقط برای مدیران ربات فعال است.")
  const requestedCode = text.split(/\s+/)[1]
  let code = requestedCode
  if (!code) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "")
    const existing = await listReferralCodes()
    const used = new Set(existing.map(row => row.code))
    let index = 1
    while (used.has(`ad-${date}-${index}`)) index += 1
    code = `ad-${date}-${index}`
  }
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(code)) return reply(message.chat.id, "کد باید ۱ تا ۴۸ حرف انگلیسی، عدد، خط تیره یا زیرخط باشد. نمونه: `/referral instagram`", { parse_mode: "Markdown" })
  const created = await createReferralCode(code)
  if (!created) return reply(message.chat.id, `این کد قبلاً ساخته شده است: ${code}\nبرای کانال دیگر، یک کد متفاوت انتخاب کن.`)
  const me = await telegram().getMe()
  const link = `https://t.me/${me.username}?start=${encodeURIComponent(code)}`
  await reply(message.chat.id, `✅ لینک ارجاع ساخته شد\n\nکد: ${code}\n${link}\n\nشروع‌های یکتای این لینک در گزارش تجمیعی ثبت می‌شوند؛ نام و شماره ذخیره نمی‌شود.`)
}

async function showReferralCounts(message) {
  if (!adminIds().includes(message.from.id)) return reply(message.chat.id, "⛔️ این دستور فقط برای مدیران ربات فعال است.")
  const codes = await listReferralCodes()
  if (!codes.length) return reply(message.chat.id, "هنوز لینک ارجاعی ساخته نشده است. برای ساخت لینک: /referral")
  const lines = codes.map(row => `${row.code}: ${row.starts} شروع یکتا`)
  await reply(message.chat.id, `📊 شمارش لینک‌های ارجاع\n\n${lines.join("\n")}\n\nاین گزارش فقط آمار تجمیعی دارد.`)
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
  INTRO_READY: introReady,
  ACADEMY_MENU: academyMenu,
  CONSULT_CONTACT: consultationContact,
  CONSULT_FIELD: consultationField,
  CONSULT_GRADE: consultationGrade,
  CONSULT_PHONE: consultationPhone,
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
    const startMatch = text.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/)
    if (startMatch?.[1]) await recordReferralStart(message.from.id, startMatch[1])
    let joined = false
    try {
      joined = isChannelMember(await telegram().getChatMember(requiredChannel, message.from.id))
    } catch (error) {
      console.error("Could not check required channel membership", error.response?.error_code || error.code || "unknown")
      if (callback) await telegram().answerCbQuery(callback.id, "بررسی عضویت فعلاً ممکن نیست")
      await requestChannelMembership(message.chat.id, true)
      session.state = "CHANNEL_JOIN"
      await saveUser(message.from.id, session.state, session.data)
      return
    }
    if (!joined) {
      if (callback) await telegram().answerCbQuery(callback.id, "هنوز عضو کانال نیستید")
      await requestChannelMembership(message.chat.id)
      session.state = "CHANNEL_JOIN"
      await saveUser(message.from.id, session.state, session.data)
      return
    }
    if (callback) await telegram().answerCbQuery(callback.id, text === channelMembershipCallback ? "عضویت تأیید شد" : undefined)
    if (text === channelMembershipCallback || session.state === "CHANNEL_JOIN" || startMatch) await start(message, session)
    else if (text === "/admincheck" || text.startsWith("/admincheck@")) await adminCheck(message)
    else if (text === "/referral" || text.startsWith("/referral ")) await createReferralLink(message, text)
    else if (text === "/referrals" || text.startsWith("/referrals@")) await showReferralCounts(message)
    else if (text === "/moshavereha" || text.startsWith("/moshavereha@") || text === "📋 فرم‌های مشاوره") await listConsultationRequests(message)
    else if (text === "/contact" || text.startsWith("/contact@") || text === "👥 مخاطبین") await listSavedContacts(message)
    else if (text === "academy_intro") await showAcademyIntro(message, session)
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
