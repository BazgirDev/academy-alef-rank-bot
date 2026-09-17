import test from "node:test"
import assert from "node:assert/strict"
import {
  calcWeightedGpa,
  calcWeightedPercent,
  findRank,
  getStatus,
  gpaToTarazRange,
  percentToTaraz
} from "../src/calculations.js"

test("findRank preserves rank table boundaries", () => {
  assert.equal(findRank("tajrobi", "1", 5000), "۴۲۰۰۰-۴۴۰۰۰")
  assert.equal(findRank("riazi", "3", 10200), "زیر ۵۰")
  assert.equal(findRank("riazi", "1", 100000), null)
  assert.equal(findRank("ensani", "2", 9000), "۱۱۷۷-۱۷۰۸")
})

test("gpaToTarazRange returns exact and interpolated values", () => {
  assert.deepEqual(gpaToTarazRange(18, "tajrobi"), [8017, 8290])
  assert.deepEqual(gpaToTarazRange(15.1, "riazi"), [6171, 6390])
  assert.deepEqual(gpaToTarazRange(9.99, "ensani"), null)
})

test("percentToTaraz preserves reference values and interpolation", () => {
  assert.equal(percentToTaraz(50, "tajrobi"), 10500)
  assert.equal(percentToTaraz(2.5, "riazi"), 4983)
  assert.equal(percentToTaraz(-10, "riazi"), 3500)
})

test("weighted calculations use configured coefficients", () => {
  assert.equal(calcWeightedGpa({ dini: 20, arabi: 10 }, "tajrobi").toFixed(2), "16.46")
  assert.equal(calcWeightedPercent({ riaziat: 50, shimi: 50, physic: 50 }, "riazi"), 50)
  assert.equal(calcWeightedPercent({ riaziat: 50 }, "riazi"), null)
})

test("status evaluation preserves user-facing logic", () => {
  assert.equal(getStatus("زیر ۲۰۰"), "عالی 🔥")
  assert.equal(getStatus("۳۳۰۰-۴۸۰۰"), "خوب")
})
