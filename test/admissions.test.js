import test from "node:test"
import assert from "node:assert/strict"
import { admissionSuggestions } from "../src/admissions.js"
import { ADMISSION_DATA } from "../src/admission-data.js"
import { ADMISSION_EXTENSIONS } from "../src/admission-extensions.js"

test("admission suggestions use the conservative upper rank bound", () => {
  const text = admissionSuggestions("tajrobi", "1", "۶۳۰-۹۸۰")
  assert.match(text, /دانشگاه علوم پزشکی مشهد/)
  assert.match(text, /دانشگاه علوم پزشکی شهید بهشتی/)
})

test("stored Excel-derived matrix has three suggestions for every field, region and rank band", () => {
  const groups = [ADMISSION_DATA, ADMISSION_EXTENSIONS].flatMap(data => Object.values(data).flatMap(regions => Object.values(regions)).flatMap(buckets => Object.values(buckets)))
  assert.equal(groups.length, 108)
  assert.ok(groups.every(items => items.length === 3))
})

test("admission suggestions support all supplied fields and reject missing ranks", () => {
  assert.match(admissionSuggestions("riazi", "2", "۱۷۵۰-۲۳۵۰"), /دانشگاه زنجان/)
  assert.match(admissionSuggestions("ensani", "3", "۱۲۰۰-۱۸۰۰"), /دانشگاه اصفهان/)
  assert.equal(admissionSuggestions("tajrobi", "1", null), null)
})
