import { ADMISSION_DATA } from "./admission-data.js"
import { ADMISSION_EXTENSIONS } from "./admission-extensions.js"

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
  if (upperBound <= 8000) return "6000_8000"
  if (upperBound <= 10000) return "8000_10000"
  if (upperBound <= 14000) return "10000_14000"
  if (upperBound <= 18000) return "14000_18000"
  if (upperBound <= 24000) return "18000_24000"
  if (upperBound <= 30000) return "24000_30000"
  return "o6000"
}

export function admissionSuggestions(field, region, rank) {
  const bucket = rankBucket(rank)
  const suggestions = ADMISSION_EXTENSIONS[field]?.[String(region)]?.[bucket]
    || ADMISSION_DATA[field]?.[String(region)]?.[bucket]
  if (!suggestions?.length) return null
  return `🎯 *شانس قبولی تقریبی:*

${suggestions.map(([subject, university]) => `🔹 ${subject} — ${university}`).join("\n")}`
}
