// Run: npx tsx tests/gallery-access.test.ts
import assert from "node:assert/strict";
import { createGalleryAccess, readGalleryAccess } from "../src/lib/gallery-access.js";
const user = { id: "device-test", role: "user" };
const token = createGalleryAccess("ticket-one", user);
assert.match(token, /^[0-9a-f]{64}$/);
assert.deepEqual(readGalleryAccess(token, "ticket-one"), user);
assert.equal(readGalleryAccess(token, "ticket-two"), null);
assert.equal(readGalleryAccess("invalid", "ticket-one"), null);
const now = Date.now;
try {
  Date.now = () => now() + 601_000;
  assert.equal(readGalleryAccess(token, "ticket-one"), null);
} finally { Date.now = now; }
console.log("PASS gallery grant: random, ticket-scoped, invalid/expired rejected");
