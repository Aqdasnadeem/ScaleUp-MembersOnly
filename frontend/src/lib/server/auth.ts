import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import { getPool, withUserTransaction } from "./db";

const SESSION_COOKIE = "scaleup_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

export { hashPassword, verifyPassword } from "./password";

export interface AuthUser {
  id: string;
  email: string;
  businessName: string;
  dateFormat: "DMY" | "MDY";
  currency: "PKR";
  demo: boolean;
}

export function hashSessionToken(token: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return createHmac("sha256", secret).update(token).digest("hex");
}

export async function createSessionToken(
  userId: string,
  client: PoolClient,
  lifetimeSeconds = SESSION_LIFETIME_SECONDS,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await client.query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 * interval '1 second'))`,
    [hashSessionToken(token), userId, lifetimeSeconds],
  );
  return token;
}

export async function setSessionCookie(
  token: string,
  lifetimeSeconds = SESSION_LIFETIME_SECONDS,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: lifetimeSeconds,
  });
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function deleteSession(token: string): Promise<void> {
  await getPool().query("DELETE FROM auth_sessions WHERE token_hash = $1", [
    hashSessionToken(token),
  ]);
}

export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const result = await getPool().query<{
    id: string;
    email: string;
    is_demo: boolean;
  }>(
    `SELECT u.id, u.email, u.is_demo
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashSessionToken(token)],
  );
  const user = result.rows[0];
  if (!user) return null;
  const business = await withUserTransaction(user.id, async (client) => {
    const businessResult = await client.query<{
      name: string;
      date_format: "DMY" | "MDY";
      currency: string;
    }>(
      `SELECT name, date_format, currency
       FROM businesses
       WHERE owner_id = $1`,
      [user.id],
    );
    return businessResult.rows[0];
  });
  if (!business || business.currency !== "PKR") return null;
  return {
    id: user.id,
    email: user.email,
    businessName: business.name,
    dateFormat: business.date_format,
    currency: "PKR",
    demo: user.is_demo,
  };
}
