import type { DatabaseClient } from "./client";
import { createDatabaseClient } from "./database";
import {
  DatabaseConfigurationError,
  type Environment,
  loadDatabaseConfig,
} from "./env";

const CHECK_SUCCESS_MESSAGE = "Database connection verified.";
const CHECK_FAILURE_MESSAGE = "Database connectivity check failed.";
const FAILURE_EXIT_CODE = 1;

type ConnectivityRow = {
  result: number;
};

export async function checkDatabaseConnection(
  environment: Environment,
): Promise<void> {
  const config = loadDatabaseConfig(environment);
  const client = createDatabaseClient(config);
  await verifyDatabaseClient(client);
}

async function verifyDatabaseClient(client: DatabaseClient): Promise<void> {
  try {
    await client.connect();
    await executeConnectivityQuery(client);
  } finally {
    await client.close();
  }
}

function formatCheckFailure(error: unknown): string {
  if (error instanceof DatabaseConfigurationError) {
    return error.message;
  }
  return CHECK_FAILURE_MESSAGE;
}

async function executeConnectivityQuery(client: DatabaseClient): Promise<void> {
  await client.native<ConnectivityRow[]>`SELECT 1 AS result`;
}

function writeCheckSuccess(): void {
  console.log(CHECK_SUCCESS_MESSAGE);
}

function writeCheckFailure(message: string): void {
  console.error(message);
}

if (import.meta.main) {
  try {
    await checkDatabaseConnection(process.env);
    writeCheckSuccess();
  } catch (error) {
    writeCheckFailure(formatCheckFailure(error));
    process.exitCode = FAILURE_EXIT_CODE;
  }
}
