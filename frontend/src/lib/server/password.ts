import bcrypt from "bcryptjs";
import { Buffer } from "node:buffer";
import { scrypt, timingSafeEqual } from "node:crypto";

const BCRYPT_ROUNDS = 12;
const SCRYPT_BYTES = 64;

function deriveLegacyScryptKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_BYTES, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (/^\$2[aby]\$\d\d\$/.test(storedHash)) {
    return bcrypt.compare(password, storedHash);
  }

  const [scheme, salt, expectedHex, extra] = storedHash.split("$");
  if (
    scheme !== "scrypt"
    || !/^[a-f\d]{32}$/i.test(salt ?? "")
    || !/^[a-f\d]{128}$/i.test(expectedHex ?? "")
    || extra !== undefined
  ) {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await deriveLegacyScryptKey(password, salt);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function upgradePasswordHash(
  password: string,
  storedHash: string,
): Promise<string | null> {
  return storedHash.startsWith("scrypt$") && Buffer.byteLength(password, "utf8") <= 72
    ? hashPassword(password)
    : null;
}
