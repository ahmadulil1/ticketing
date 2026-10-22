// Run: npx tsx tests/attachment-format.test.ts
import assert from "node:assert/strict";
import { detectImageFormat } from "../src/lib/attachments.js";
import { db } from "../src/database.js";

assert.equal(detectImageFormat(Buffer.from("not an image")), null);
assert.equal(detectImageFormat(Buffer.from([0xff, 0xd8, 0xff])), "JPEG");
assert.equal(detectImageFormat(Buffer.from("RIFF0000WEBP")), "WEBP");
assert.equal(detectImageFormat(Buffer.from("RIFF0000WAVE")), null);
assert.equal(detectImageFormat(Buffer.from("RIFF")), null);
await db.end();
console.log("attachment-format: 5 checks passed");
