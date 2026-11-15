import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPasswordRules,
  formatDatePreview,
  isValidEmail,
  normalizeEmail,
  parseBusinessDate,
  passwordValidationMessage,
  validateBusinessName,
  validateProfileChanges,
} from "./validation";

test("normalizes and validates account emails", () => {
  assert.equal(normalizeEmail(" Owner@Example.COM "), "owner@example.com");
  assert.equal(isValidEmail("owner@example.com"), true);
  assert.equal(isValidEmail("not-an-email"), false);
});

test("validates business names after trimming", () => {
  assert.equal(validateBusinessName(" Karachi Electronics "), null);
  assert.notEqual(validateBusinessName(" "), null);
  assert.notEqual(validateBusinessName("A"), null);
});

test("enforces the password length, letter, number, and UTF-8 byte rules", () => {
  assert.equal(checkPasswordRules("secure123").valid, true);
  assert.equal(checkPasswordRules("onlyletters").number, false);
  assert.equal(checkPasswordRules("12345678").letter, false);
  assert.equal(passwordValidationMessage("1234567"), "Password must be at least 8 characters.");
  assert.equal(checkPasswordRules(`${"a".repeat(70)}é`).byteLength, 72);
  assert.equal(checkPasswordRules(`${"a".repeat(71)}é`).byteLength, 73);
  assert.equal(
    passwordValidationMessage(`${"a".repeat(70)}é1`),
    "Password must be no more than 72 bytes.",
  );
});

test("parses DMY and MDY dates with supported separators and two-digit years", () => {
  assert.equal(parseBusinessDate("3/10/26", "DMY"), "2026-10-03");
  assert.equal(parseBusinessDate("3/10/26", "MDY"), "2026-03-10");
  assert.equal(parseBusinessDate("31.12.2026", "DMY"), "2026-12-31");
  assert.equal(parseBusinessDate("12-31-26", "MDY"), "2026-12-31");
  assert.equal(parseBusinessDate("2026-10-03", "MDY"), "2026-10-03");
  assert.equal(parseBusinessDate("31/02/26", "DMY"), null);
  assert.equal(parseBusinessDate("13/31/26", "MDY"), null);
});

test("generates date previews from the selected parser format", () => {
  assert.equal(formatDatePreview("3/10/26", "DMY"), "3 October 2026");
  assert.equal(formatDatePreview("3/10/26", "MDY"), "10 March 2026");
});

test("validates account profile changes", () => {
  assert.deepEqual(validateProfileChanges({ businessName: " Karachi Electronics ", dateFormat: "DMY" }), {
    businessName: "Karachi Electronics",
    dateFormat: "DMY",
  });
  assert.deepEqual(validateProfileChanges({ businessName: "K", dateFormat: "DMY" }), {
    error: "Business name must be between 2 and 80 characters.",
    field: "businessName",
  });
});
