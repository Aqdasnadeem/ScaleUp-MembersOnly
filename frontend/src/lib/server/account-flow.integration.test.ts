import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { loadEnvConfig } from "@next/env";
import { hashPassword, verifyPassword } from "./password";
import { validateProfileChanges } from "./validation";

loadEnvConfig(process.cwd());
const databaseUrl = process.env.TEST_DATABASE_URL;
const testSessionSecret = "test-only-session-secret-0123456789";

function hashTestSession(token: string): string {
  return createHmac("sha256", testSessionSecret).update(token).digest("hex");
}

function databaseTest(
  name: string,
  run: (client: import("pg").PoolClient) => Promise<void>,
) {
  test(name, { skip: !databaseUrl }, async () => {
    if (!databaseUrl) return;
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await run(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });
}

databaseTest("signup, sign-in verification, and logout persist and revoke a session", async (client) => {
  const email = `auth-${randomUUID()}@example.test`;
  const password = "ScaleUp123";
  const passwordHash = await hashPassword(password);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, business_name)
     VALUES ($1, $2, 'Test Business')
     RETURNING id`,
    [email, passwordHash],
  );
  const userId = inserted.rows[0]?.id;
  assert.ok(userId);
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  await client.query("INSERT INTO businesses (owner_id, name) VALUES ($1, $2)", [userId, "Test Business"]);

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashTestSession(token);
  await client.query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '30 days')`,
    [tokenHash, userId],
  );
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword("wrong-password", passwordHash), false);
  const session = await client.query(
    "SELECT token_hash FROM auth_sessions WHERE token_hash = $1 AND user_id = $2",
    [hashTestSession(token), userId],
  );
  assert.equal(session.rowCount, 1);
  const signedOut = await client.query(
    "DELETE FROM auth_sessions WHERE token_hash = $1 RETURNING token_hash",
    [hashTestSession(token)],
  );
  assert.equal(signedOut.rowCount, 1);
});

databaseTest("row-level policies prevent account A from reading account B's uploaded data", async (client) => {
  const accountA = (await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, business_name)
     VALUES ($1, 'disabled', 'Account A') RETURNING id`,
    [`a-${randomUUID()}@example.test`],
  )).rows[0];
  const accountB = (await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, business_name)
     VALUES ($1, 'disabled', 'Account B') RETURNING id`,
    [`b-${randomUUID()}@example.test`],
  )).rows[0];
  assert.ok(accountA && accountB);

  await client.query("SELECT set_config('app.user_id', $1, true)", [accountA.id]);
  await client.query("INSERT INTO businesses (owner_id, name) VALUES ($1, 'Account A')", [accountA.id]);
  await client.query("SELECT set_config('app.user_id', $1, true)", [accountB.id]);
  await client.query("INSERT INTO businesses (owner_id, name) VALUES ($1, 'Account B')", [accountB.id]);
  const dataset = await client.query<{ id: string }>(
    `INSERT INTO datasets (user_id, category, file_name, row_count)
     VALUES ($1, 'sales', 'private.csv', 1) RETURNING id`,
    [accountB.id],
  );
  const datasetId = dataset.rows[0]?.id;
  assert.ok(datasetId);
  await client.query(
    `INSERT INTO records (dataset_id, user_id, row_number, data)
     VALUES ($1, $2, 2, '{"order_id":"private"}'::jsonb)`,
    [datasetId, accountB.id],
  );

  await client.query("SELECT set_config('app.user_id', $1, true)", [accountA.id]);
  const hiddenRows = await client.query("SELECT id FROM datasets WHERE user_id = $1", [accountB.id]);
  assert.equal(hiddenRows.rowCount, 0);
  const ownBusiness = await client.query("SELECT id FROM businesses WHERE owner_id = $1", [accountA.id]);
  assert.equal(ownBusiness.rowCount, 1);
});

databaseTest("password reset tokens reject expiry and become unusable after one use", async (client) => {
  const userId = (await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, business_name)
     VALUES ($1, 'disabled', 'Reset Business') RETURNING id`,
    [`reset-${randomUUID()}@example.test`],
  )).rows[0]?.id;
  assert.ok(userId);

  const expiredHash = createHash("sha256").update(randomUUID()).digest("hex");
  const usableHash = createHash("sha256").update(randomUUID()).digest("hex");
  await client.query(
    `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $3, now() - interval '1 minute'), ($2, $3, now() + interval '30 minutes')`,
    [expiredHash, usableHash, userId],
  );
  const expired = await client.query(
    `SELECT token_hash FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [expiredHash],
  );
  assert.equal(expired.rowCount, 0);
  const usable = await client.query(
    `SELECT user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     FOR UPDATE`,
    [usableHash],
  );
  assert.equal(usable.rowCount, 1);
  await client.query(
    "UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1",
    [usableHash],
  );
  const reused = await client.query(
    `SELECT token_hash FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [usableHash],
  );
  assert.equal(reused.rowCount, 0);
});

databaseTest("profile updates persist validated name and date format", async (client) => {
  const userId = (await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, business_name)
     VALUES ($1, 'disabled', 'Original Name') RETURNING id`,
    [`profile-${randomUUID()}@example.test`],
  )).rows[0]?.id;
  assert.ok(userId);
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  await client.query("INSERT INTO businesses (owner_id, name) VALUES ($1, 'Original Name')", [userId]);

  const changes = validateProfileChanges({ businessName: " Updated Shop ", dateFormat: "MDY" });
  assert.ok("businessName" in changes);
  if ("error" in changes) throw new Error(String(changes.error));
  await client.query(
    "UPDATE businesses SET name = $1, date_format = $2 WHERE owner_id = $3",
    [changes.businessName, changes.dateFormat, userId],
  );
  const result = await client.query<{ name: string; date_format: string }>(
    "SELECT name, date_format FROM businesses WHERE owner_id = $1",
    [userId],
  );
  assert.deepEqual(result.rows[0], { name: "Updated Shop", date_format: "MDY" });
});
