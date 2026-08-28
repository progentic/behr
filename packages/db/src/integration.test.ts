import { expect, test } from "bun:test";
import { resolve } from "node:path";

import type { DatabaseClient } from "./client";
import { createDatabaseClient } from "./database";
import {
  type DatabaseConfig,
  type Environment,
  loadDatabaseConfig,
} from "./env";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");
const DATABASE_CHECK_SCRIPT = "db:check";
const DATABASE_MIGRATION_SCRIPT = "db:migrate";
const DATABASE_CHECK_SUCCESS_MESSAGE = "Database connection verified.";
const OBSERVER_APPLICATION_NAME = "behr_integration_observer";
const SUBJECT_APPLICATION_NAME = "behr_integration_subject";
const CHECK_APPLICATION_NAME = "behr_integration_check";
const MIGRATION_APPLICATION_NAME = "behr_integration_migration";
const DRIZZLE_SCHEMA_NAME = "drizzle";
const DRIZZLE_OBJECT_PREFIX = "__drizzle_migrations";
const TABLE_OBJECT_KINDS = new Set(["r", "p"]);
const SUCCESS_EXIT_CODE = 0;
const NO_CONNECTIONS = 0;
const NO_CATALOG_OBJECTS = 0;

type IntegrationContext = Readonly<{
  environment: Environment;
  observer: DatabaseClient;
}>;

type CommandResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

type CountRow = {
  count: number;
};

type CatalogObject = {
  schemaName: string;
  objectName: string;
  objectKind: string;
};

test("verifies the PostgreSQL persistence bootstrap", verifyPersistenceBootstrap);

async function verifyPersistenceBootstrap(): Promise<void> {
  const context = await createIntegrationContext(process.env);
  try {
    await verifyNativeClientLifecycle(context);
    await verifyConnectivityCommand(context);
    await verifyMigrationIdempotency(context);
    await verifyDatabaseCatalog(context);
    await verifyConnectionCleanup(context);
  } finally {
    await closeIntegrationContext(context);
  }
}

async function createIntegrationContext(
  environment: Environment,
): Promise<IntegrationContext> {
  const config = loadDatabaseConfig(environment);
  const observer = createNamedDatabaseClient(config, OBSERVER_APPLICATION_NAME);
  await observer.connect();
  return { environment, observer };
}

async function closeIntegrationContext(context: IntegrationContext): Promise<void> {
  await context.observer.close();
}

async function verifyNativeClientLifecycle(
  context: IntegrationContext,
): Promise<void> {
  const config = loadDatabaseConfig(context.environment);
  const subject = createNamedDatabaseClient(config, SUBJECT_APPLICATION_NAME);
  try {
    await subject.connect();
    await executeClientProbe(subject);
  } finally {
    await subject.close();
  }
  expect(
    await countConnectionsByApplicationName(
      context.observer,
      SUBJECT_APPLICATION_NAME,
    ),
  ).toBe(NO_CONNECTIONS);
}

async function verifyConnectivityCommand(
  context: IntegrationContext,
): Promise<void> {
  const environment = createNamedEnvironment(
    context.environment,
    CHECK_APPLICATION_NAME,
  );
  const result = await runRootScript(DATABASE_CHECK_SCRIPT, environment);
  expectCommandToPass(result);
  expect(result.stdout.trim()).toBe(DATABASE_CHECK_SUCCESS_MESSAGE);
  expect(
    await countConnectionsByApplicationName(
      context.observer,
      CHECK_APPLICATION_NAME,
    ),
  ).toBe(NO_CONNECTIONS);
}

async function verifyMigrationIdempotency(
  context: IntegrationContext,
): Promise<void> {
  const environment = createNamedEnvironment(
    context.environment,
    MIGRATION_APPLICATION_NAME,
  );
  expectCommandToPass(await runRootScript(DATABASE_MIGRATION_SCRIPT, environment));
  expectCommandToPass(await runRootScript(DATABASE_MIGRATION_SCRIPT, environment));
  expect(
    await countConnectionsByApplicationName(
      context.observer,
      MIGRATION_APPLICATION_NAME,
    ),
  ).toBe(NO_CONNECTIONS);
}

async function verifyDatabaseCatalog(context: IntegrationContext): Promise<void> {
  const objects = await listCatalogObjects(context.observer);
  expect(objects.length).toBeGreaterThan(NO_CATALOG_OBJECTS);
  expect(allObjectsAreDrizzleMigrationMetadata(objects)).toBe(true);
  expect(findApplicationTables(objects)).toEqual([]);
}

async function verifyConnectionCleanup(
  context: IntegrationContext,
): Promise<void> {
  expect(await countOtherConnections(context.observer)).toBe(NO_CONNECTIONS);
}

function createNamedDatabaseClient(
  config: DatabaseConfig,
  applicationName: string,
): DatabaseClient {
  return createDatabaseClient(withApplicationName(config, applicationName));
}

function createNamedEnvironment(
  environment: Environment,
  applicationName: string,
): Environment {
  const config = loadDatabaseConfig(environment);
  const namedConfig = withApplicationName(config, applicationName);
  return { ...environment, DATABASE_URL: namedConfig.databaseUrl };
}

function withApplicationName(
  config: DatabaseConfig,
  applicationName: string,
): DatabaseConfig {
  const url = new URL(config.databaseUrl);
  url.searchParams.set("application_name", applicationName);
  return { databaseUrl: url.toString() };
}

async function runRootScript(
  script: string,
  environment: Environment,
): Promise<CommandResult> {
  const subprocess = Bun.spawn(["bun", "run", script], {
    cwd: REPOSITORY_ROOT,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    readOutput(subprocess.stdout),
    readOutput(subprocess.stderr),
  ]);
  return { exitCode, stdout, stderr };
}

async function readOutput(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text();
}

function expectCommandToPass(result: CommandResult): void {
  expect(result.exitCode).toBe(SUCCESS_EXIT_CODE);
}

async function executeClientProbe(client: DatabaseClient): Promise<void> {
  await client.native`SELECT 1`;
}

async function countConnectionsByApplicationName(
  client: DatabaseClient,
  applicationName: string,
): Promise<number> {
  const rows = await client.native<CountRow[]>`
    SELECT count(*)::int AS count
    FROM pg_stat_activity
    WHERE application_name = ${applicationName}
  `;
  return readCount(rows);
}

async function countOtherConnections(client: DatabaseClient): Promise<number> {
  const rows = await client.native<CountRow[]>`
    SELECT count(*)::int AS count
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND usename = current_user
      AND application_name <> ${OBSERVER_APPLICATION_NAME}
  `;
  return readCount(rows);
}

async function listCatalogObjects(
  client: DatabaseClient,
): Promise<CatalogObject[]> {
  return await client.native<CatalogObject[]>`
    SELECT
      namespace.nspname AS "schemaName",
      catalog.relname AS "objectName",
      catalog.relkind AS "objectKind"
    FROM pg_class AS catalog
    INNER JOIN pg_namespace AS namespace
      ON namespace.oid = catalog.relnamespace
    WHERE namespace.nspname NOT LIKE 'pg_%'
      AND namespace.nspname <> 'information_schema'
      AND catalog.relkind IN ('r', 'p', 'i', 'S', 'v', 'm', 'f')
    ORDER BY namespace.nspname, catalog.relname
  `;
}

function readCount(rows: CountRow[]): number {
  return rows[0]?.count ?? NO_CONNECTIONS;
}

function allObjectsAreDrizzleMigrationMetadata(
  objects: CatalogObject[],
): boolean {
  return objects.every(isDrizzleMigrationObject);
}

function findApplicationTables(objects: CatalogObject[]): CatalogObject[] {
  return objects.filter(isApplicationTable);
}

function isDrizzleMigrationObject(object: CatalogObject): boolean {
  return (
    object.schemaName === DRIZZLE_SCHEMA_NAME &&
    object.objectName.startsWith(DRIZZLE_OBJECT_PREFIX)
  );
}

function isApplicationTable(object: CatalogObject): boolean {
  return (
    TABLE_OBJECT_KINDS.has(object.objectKind) &&
    !isDrizzleMigrationObject(object)
  );
}
