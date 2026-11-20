import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Add it to .env.local before migrating.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  });

  try {
    const schema = await readFile(
      resolve(process.cwd(), "src", "lib", "server", "schema.sql"),
      "utf8",
    );
    await pool.query(schema);
    const accountMigration = await readFile(
      resolve(process.cwd(), "src", "lib", "server", "migrations", "002_accounts_auth.sql"),
      "utf8",
    );
    await pool.query(accountMigration);
    console.log("Database schema and account migration are up to date.");
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
