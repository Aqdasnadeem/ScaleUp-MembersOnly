import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password";

test("hashes passwords with bcrypt and verifies the password", async () => {
  const password = "ScaleUp123";
  const hash = await hashPassword(password);
  assert.match(hash, /^\$2[aby]\$12\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("different-password", hash), false);
});
