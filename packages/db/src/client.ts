import { SQL } from "bun";
import {
  type BunSQLDatabase,
  drizzle as createDrizzleDatabase,
} from "drizzle-orm/bun-sql";

import type { DatabaseConfig } from "./env";
import { databaseSchema } from "./schema";

export type DrizzleDatabase = BunSQLDatabase<typeof databaseSchema> & {
  $client: SQL;
};

export type DatabaseClient = Readonly<{
  native: SQL;
  drizzle: DrizzleDatabase;
  connect: () => Promise<void>;
  close: () => Promise<void>;
}>;

export function constructDatabaseClient(config: DatabaseConfig): DatabaseClient {
  const nativeClient = createNativeClient(config.databaseUrl);
  const drizzleDatabase = createDrizzleClient(nativeClient);
  return createClientFacade(nativeClient, drizzleDatabase);
}

function createNativeClient(databaseUrl: string): SQL {
  return new SQL(databaseUrl);
}

function createDrizzleClient(nativeClient: SQL): DrizzleDatabase {
  return createDrizzleDatabase({ client: nativeClient, schema: databaseSchema });
}

function createClientFacade(
  nativeClient: SQL,
  drizzleDatabase: DrizzleDatabase,
): DatabaseClient {
  return Object.freeze({
    native: nativeClient,
    drizzle: drizzleDatabase,
    connect: () => connectNativeClient(nativeClient),
    close: () => closeNativeClient(nativeClient),
  });
}

async function connectNativeClient(nativeClient: SQL): Promise<void> {
  await nativeClient.connect();
}

async function closeNativeClient(nativeClient: SQL): Promise<void> {
  await nativeClient.close();
}
