import test from "node:test"
import assert from "node:assert/strict"
import { consultationListMessages, contactListSummary, estimateAdminText } from "../src/bot.js"

test("estimateAdminText includes only compact consultation fields", () => {
  const text = estimateAdminText({
    type: "تخمین رتبه با تراز کل",
    field: "tajrobi",
    region: "2",
    taraz: 9000,
    rank: "۳۳۰۰-۴۸۰۰",
    result: "نتیجه کامل"
  })
  assert.match(text, /تراز: 9000/)
  assert.match(text, /رتبه: ۳۳۰۰-۴۸۰۰/)
  assert.match(text, /تجربی/)
  assert.match(text, /منطقه 2/)
  assert.doesNotMatch(text, /نتیجه کامل/)
})

test("contactListSummary reports saved contact count", () => {
  assert.match(contactListSummary([]), /تعداد کل: ۰/)
  assert.match(contactListSummary([{ user_id: "1" }, { user_id: "2" }]), /تعداد کل: 2/)
})

test("consultationListMessages reports total and all requests", () => {
  const rows = [
    {
      user_id: "1",
      full_name: "کاربر اول",
      username: "first",
      phone_number: "+989000000001",
      interests: "پزشکی، داروسازی، دندانپزشکی",
      estimate: null,
      requested_at: "2026-09-13T10:00:00.000Z"
    },
    {
      user_id: "2",
      full_name: "کاربر دوم",
      username: null,
      phone_number: "+989000000002",
      interests: "مهندسی برق، کامپیوتر، مکانیک",
      estimate: { taraz: 8500, rank: "۵۰۰۰-۶۰۰۰", result: "نتیجه" },
      requested_at: "2026-09-13T11:00:00.000Z"
    }
  ]
  const messages = consultationListMessages(rows)
  const joined = messages.join("\n")
  assert.match(joined, /تعداد کل: 2/)
  assert.match(joined, /کاربر اول/)
  assert.match(joined, /کاربر دوم/)
  assert.ok(messages.every(message => message.length <= 4096))
})
