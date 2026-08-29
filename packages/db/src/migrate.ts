import { createDatabaseClient, type DatabaseClient } from "./client";
import {
  DatabaseConfigurationError,
  type Environment,
  loadDatabaseConfig,
} from "./env";
import { applyMigrations } from "./migration-runner";

const MIGRATION_SUCCESS_MESSAGE = "Database migrations applied.";
const MIGRATION_FAILURE_MESSAGE = "Database migration failed.";
const FAILURE_EXIT_CODE = 1;

export async function migrateDatabase(environment: Environment): Promise<void> {
  const config = loadDatabaseConfig(environment);
  const client = createDatabaseClient(config);
  await executeMigrations(client);
}

async function executeMigrations(client: DatabaseClient): Promise<void> {
  try {
    await client.connect();
    await applyMigrations(client);
  } finally {
    await client.close();
  }
}

function formatMigrationFailure(error: unknown): string {
  if (error instanceof DatabaseConfigurationError) {
    return error.message;
  }
  return MIGRATION_FAILURE_MESSAGE;
}

function writeMigrationSuccess(): void {
  console.log(MIGRATION_SUCCESS_MESSAGE);
}

function writeMigrationFailure(message: string): void {
  console.error(message);
}

if (import.meta.main) {
  try {
    await migrateDatabase(process.env);
    writeMigrationSuccess();
  } catch (error) {
    writeMigrationFailure(formatMigrationFailure(error));
    process.exitCode = FAILURE_EXIT_CODE;
  }
}
