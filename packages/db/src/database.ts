import {
  type DatabaseClient,
  constructDatabaseClient,
} from "./client";
import type { DatabaseConfig } from "./env";

export function createDatabaseClient(config: DatabaseConfig): DatabaseClient {
  return constructDatabaseClient(config);
}
