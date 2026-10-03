import assert from "node:assert/strict"
import test from "node:test"
import { isChannelMember } from "../src/bot.js"

test("channel membership accepts active members and administrators", () => {
  for (const status of ["creator", "administrator", "member"]) {
    assert.equal(isChannelMember({ status }), true)
  }
  assert.equal(isChannelMember({ status: "restricted", is_member: true }), true)
})

test("channel membership rejects non-members and unknown states", () => {
  for (const status of ["left", "kicked", "restricted"]) {
    assert.equal(isChannelMember({ status }), false)
  }
  assert.equal(isChannelMember(null), false)
})
