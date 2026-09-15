import { ADMISSION_DATA } from "./admission-data.js"

function rankUpperBound(rank) {
  const normalized = String(rank || "").replace(/[۰-۹]/g, digit => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
  const numbers = normalized.match(/\d+/g)?.map(Number) || []
  if (!numbers.length) return null
  if (normalized.includes("بالاتر")) return numbers[0] + 1
  return Math.max(...numbers)
}

function rankBucket(rank) {
  const upperBound = rankUpperBound(rank)
  if (upperBound === null) return null
  if (upperBound < 500) return "u500"
  if (upperBound <= 1000) return "500_1000"
  if (upperBound <= 2000) return "1000_2000"
  if (upperBound <= 4000) return "2000_4000"
  if (upperBound <= 6000) return "4000_6000"
  return "o6000"
}

export function admissionSuggestions(field, region, rank) {
  const bucket = rankBucket(rank)
  const suggestions = ADMISSION_DATA[field]?.[String(region)]?.[bucket]
  if (!suggestions?.length) return null
  return `🎓 *با این رتبه، به‌صورت حدودی شانس قبولی در این گزینه‌ها را داری:*

${suggestions.map(([subject, university]) => `🔹 ${subject} — ${university}`).join("\n")}

⚠️ این فهرست تقریبی است و به منطقه، سهمیه، ظرفیت و انتخاب رشته بستگی دارد.

📚 برای بررسی دقیق‌تر و اطلاع از آخرین رتبه‌های قبولی، دستور /moshavere را بفرست.`
}
