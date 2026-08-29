import { drizzleAdapter } from "@better-auth/drizzle-adapter";

import type { DrizzleDatabase } from "./client";
import { authSchema } from "./schema";

export type AuthPersistenceAdapter = ReturnType<typeof drizzleAdapter>;

export function constructAuthAdapter(
  database: DrizzleDatabase,
): AuthPersistenceAdapter {
  return drizzleAdapter(database, {
    provider: "pg",
    schema: authSchema,
    transaction: true,
  });
}
