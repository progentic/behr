import { resolve } from "node:path";

import { migrate as applyDrizzleMigrations } from "drizzle-orm/bun-sql/migrator";

import type { DatabaseClient } from "./client";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../migrations");

export async function applyMigrations(client: DatabaseClient): Promise<void> {
  await applyDrizzleMigrations(client.drizzle, {
    migrationsFolder: MIGRATIONS_FOLDER,
  });
}
