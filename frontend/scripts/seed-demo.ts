import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { DEMO_DATASETS } from "../src/lib/server/demo-seed";
import { insertDataset } from "../src/lib/server/data";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Add it to .env.local before seeding.");
  }

  const email = (process.env.DEMO_EMAIL ?? "demo@scaleup.local").trim().toLowerCase();
  const businessName = "Karachi Electronics";
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, business_name, is_demo)
         VALUES ($1, 'disabled', $2, true)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [email, businessName],
      );
      const account = inserted.rows[0] ?? (await client.query<{ id: string; is_demo: boolean }>(
        "SELECT id, is_demo FROM users WHERE email = $1 FOR UPDATE",
        [email],
      )).rows[0];
      if (!account || ("is_demo" in account && !account.is_demo)) {
        throw new Error("The configured demo email is already used by a non-demo account.");
      }

      await client.query("SELECT set_config('app.user_id', $1, true)", [account.id]);
      await client.query(
        `INSERT INTO businesses (owner_id, name, is_demo)
         VALUES ($1, $2, true)
         ON CONFLICT (owner_id)
         DO UPDATE SET name = EXCLUDED.name, is_demo = true, updated_at = now()`,
        [account.id, businessName],
      );
      const countResult = await client.query<{ count: string }>(
        "SELECT count(*) FROM datasets WHERE user_id = $1",
        [account.id],
      );
      if (Number(countResult.rows[0]?.count ?? 0) === 0) {
        for (const dataset of DEMO_DATASETS) {
          await insertDataset(
            client,
            account.id,
            dataset.category,
            dataset.fileName,
            dataset.rows,
          );
        }
      }
      await client.query("COMMIT");
      console.info(`Seeded read-only demo account ${email} (${businessName}).`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
