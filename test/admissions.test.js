import test from "node:test"
import assert from "node:assert/strict"
import { admissionSuggestions } from "../src/admissions.js"

test("admission suggestions use the conservative upper rank bound", () => {
  const text = admissionSuggestions("tajrobi", "۶۳۰-۹۸۰")
  assert.match(text, /پزشکی روزانه دانشگاه تهران/)
  assert.doesNotMatch(text, /پزشکی شهرستان درجه ۲/)
})

test("admission suggestions support all supplied fields and reject missing ranks", () => {
  assert.match(admissionSuggestions("riazi", "۱۷۵۰-۲۳۵۰"), /مهندسی کامپیوتر قم/)
  assert.match(admissionSuggestions("ensani", "۱۲۰۰-۱۸۰۰"), /اقتصاد دانشگاه تبریز/)
  assert.equal(admissionSuggestions("tajrobi", null), null)
})
