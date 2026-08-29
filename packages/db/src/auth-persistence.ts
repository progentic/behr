import {
  type AuthPersistenceAdapter,
  constructAuthAdapter,
} from "./auth-adapter";
import type { DatabaseClient } from "./client";
import { user } from "./schema";

export function createAuthPersistence(
  client: DatabaseClient,
): AuthPersistenceAdapter {
  return constructAuthAdapter(client.drizzle);
}

export async function identityExists(client: DatabaseClient): Promise<boolean> {
  const identities = await client.drizzle
    .select({ id: user.id })
    .from(user)
    .limit(1);
  return identities.length > 0;
}
