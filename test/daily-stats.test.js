import assert from "node:assert/strict"
import { test } from "node:test"
import handler from "../api/daily-stats.js"
import { formatDailyStats, reportDate } from "../src/daily-stats.js"

test("daily statistics message contains both counts", () => {
  assert.equal(formatDailyStats({ contacts: 12, consultations: 4 }),
    "📊 آمار ۲۴ ساعت گذشته\n\n📱 اشتراک شماره تماس: 12 نفر\n🧭 درخواست مشاوره تخصصی: 4 نفر")
})

test("report date follows Tehran calendar day", () => {
  assert.equal(reportDate(new Date("2026-09-27T21:00:00Z")), "2026-09-28")
})

test("daily statistics endpoint rejects unauthenticated requests", async () => {
  const previous = process.env.CRON_SECRET
  process.env.CRON_SECRET = "test-only-secret"
  const response = {
    setHeader() {},
    status(code) { this.code = code; return this },
    json(body) { this.body = body; return this }
  }
  try {
    await handler({ method: "GET", headers: {} }, response)
    assert.equal(response.code, 401)
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  }
})
