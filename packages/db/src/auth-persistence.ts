import {
  type AuthPersistenceAdapter,
  constructAuthAdapter,
} from "./auth-adapter";
import type { DatabaseClient } from "./client";

export function createAuthPersistence(
  client: DatabaseClient,
): AuthPersistenceAdapter {
  return constructAuthAdapter(client.drizzle);
}
