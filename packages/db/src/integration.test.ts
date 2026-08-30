import { expect, test } from "bun:test";
import { resolve } from "node:path";

import { createDatabaseClient, type DatabaseClient } from "./client";
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
const PHASE_E_TABLE_NAMES = [
  "account",
  "domains",
  "membership_invitations",
  "memberships",
  "session",
  "sites",
  "tenants",
  "user",
  "verification",
];
const PHASE_E_CATALOG_OBJECTS = new Set([
  "account",
  "account_issuer_account_id_uidx",
  "account_pkey",
  "account_user_id_idx",
  "domains",
  "domains_pkey",
  "domains_site_id_unique",
  "membership_invitations",
  "membership_invitations_pkey",
  "membership_invitations_tenant_id_email_uidx",
  "membership_invitations_token_hash_unique",
  "memberships",
  "memberships_tenant_id_user_id_pk",
  "memberships_user_id_idx",
  "session",
  "session_pkey",
  "session_token_unique",
  "session_user_id_idx",
  "sites",
  "sites_pkey",
  "sites_tenant_id_idx",
  "tenants",
  "tenants_pkey",
  "user",
  "user_email_unique",
  "user_pkey",
  "verification",
  "verification_identifier_idx",
  "verification_pkey",
]);
const PUBLIC_SCHEMA_NAME = "public";
const SUCCESS_EXIT_CODE = 0;
const NO_CONNECTIONS = 0;
const NO_CATALOG_OBJECTS = 0;
const CONNECTION_RELEASE_TIMEOUT_MS = 1_000;
const CONNECTION_RELEASE_POLL_MS = 20;

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

test("verifies the PostgreSQL identity persistence boundary", verifyPersistenceBootstrap);

async function verifyPersistenceBootstrap(): Promise<void> {
  const context = await createIntegrationContext(process.env);
  try {
    await verifyNativeClientLifecycle(context);
    await verifyConnectivityCommand(context);
    await verifyMigrationIdempotency(context);
    await verifyDatabaseCatalog(context);
    await verifyDatabaseConstraints(context);
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
  await expectApplicationConnectionsClosed(
    context.observer,
    SUBJECT_APPLICATION_NAME,
  );
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
  await expectApplicationConnectionsClosed(
    context.observer,
    CHECK_APPLICATION_NAME,
  );
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
  await expectApplicationConnectionsClosed(
    context.observer,
    MIGRATION_APPLICATION_NAME,
  );
}

async function verifyDatabaseCatalog(context: IntegrationContext): Promise<void> {
  const objects = await listCatalogObjects(context.observer);
  expect(objects.length).toBeGreaterThan(NO_CATALOG_OBJECTS);
  expect(objects.every(isAllowedPhaseECatalogObject)).toBe(true);
  expect(findApplicationTableNames(objects)).toEqual(PHASE_E_TABLE_NAMES);
}

async function verifyDatabaseConstraints(
  context: IntegrationContext,
): Promise<void> {
  const constraints = await listDatabaseConstraints(context.observer);
  expect(constraints).toEqual([
    { name: "account_user_id_user_id_fk", type: "FOREIGN KEY" },
    { name: "domains_site_id_sites_id_fk", type: "FOREIGN KEY" },
    { name: "domains_site_id_unique", type: "UNIQUE" },
    {
      name: "membership_invitations_tenant_id_tenants_id_fk",
      type: "FOREIGN KEY",
    },
    { name: "membership_invitations_token_hash_unique", type: "UNIQUE" },
    { name: "memberships_tenant_id_tenants_id_fk", type: "FOREIGN KEY" },
    { name: "memberships_tenant_id_user_id_pk", type: "PRIMARY KEY" },
    { name: "memberships_user_id_user_id_fk", type: "FOREIGN KEY" },
    { name: "session_token_unique", type: "UNIQUE" },
    { name: "session_user_id_user_id_fk", type: "FOREIGN KEY" },
    { name: "sites_tenant_id_tenants_id_fk", type: "FOREIGN KEY" },
    { name: "user_email_unique", type: "UNIQUE" },
  ]);
  expect(await listCascadeForeignKeys(context.observer)).toEqual([
    "account_user_id_user_id_fk",
    "domains_site_id_sites_id_fk",
    "membership_invitations_tenant_id_tenants_id_fk",
    "memberships_tenant_id_tenants_id_fk",
    "memberships_user_id_user_id_fk",
    "session_user_id_user_id_fk",
    "sites_tenant_id_tenants_id_fk",
  ]);
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

async function expectApplicationConnectionsClosed(
  client: DatabaseClient,
  applicationName: string,
): Promise<void> {
  const deadline = Date.now() + CONNECTION_RELEASE_TIMEOUT_MS;
  let count = await countConnectionsByApplicationName(client, applicationName);
  while (count !== NO_CONNECTIONS && Date.now() < deadline) {
    await Bun.sleep(CONNECTION_RELEASE_POLL_MS);
    count = await countConnectionsByApplicationName(client, applicationName);
  }
  expect(count).toBe(NO_CONNECTIONS);
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

async function listDatabaseConstraints(
  client: DatabaseClient,
): Promise<Array<{ name: string; type: string }>> {
  return await client.native<Array<{ name: string; type: string }>>`
    SELECT constraint_name AS name, constraint_type AS type
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_name IN (
        'account_user_id_user_id_fk',
        'domains_site_id_sites_id_fk',
        'domains_site_id_unique',
        'membership_invitations_tenant_id_tenants_id_fk',
        'membership_invitations_token_hash_unique',
        'memberships_tenant_id_tenants_id_fk',
        'memberships_tenant_id_user_id_pk',
        'memberships_user_id_user_id_fk',
        'session_token_unique',
        'session_user_id_user_id_fk',
        'sites_tenant_id_tenants_id_fk',
        'user_email_unique'
      )
    ORDER BY constraint_name
  `;
}

async function listCascadeForeignKeys(client: DatabaseClient): Promise<string[]> {
  const rows = await client.native<Array<{ name: string }>>`
    SELECT constraint_name AS name
    FROM information_schema.referential_constraints
    WHERE constraint_schema = 'public'
      AND delete_rule = 'CASCADE'
      AND constraint_name IN (
        'account_user_id_user_id_fk',
        'domains_site_id_sites_id_fk',
        'membership_invitations_tenant_id_tenants_id_fk',
        'memberships_tenant_id_tenants_id_fk',
        'memberships_user_id_user_id_fk',
        'session_user_id_user_id_fk',
        'sites_tenant_id_tenants_id_fk'
      )
    ORDER BY constraint_name
  `;
  return rows.map(({ name }) => name);
}

function readCount(rows: CountRow[]): number {
  return rows[0]?.count ?? NO_CONNECTIONS;
}

function findApplicationTableNames(objects: CatalogObject[]): string[] {
  return objects.filter(isApplicationTable).map(readObjectName).sort();
}

function isDrizzleMigrationObject(object: CatalogObject): boolean {
  return (
    object.schemaName === DRIZZLE_SCHEMA_NAME &&
    object.objectName.startsWith(DRIZZLE_OBJECT_PREFIX)
  );
}

function isApplicationTable(object: CatalogObject): boolean {
  return (
    object.schemaName === PUBLIC_SCHEMA_NAME &&
    TABLE_OBJECT_KINDS.has(object.objectKind) &&
    !isDrizzleMigrationObject(object)
  );
}

function isAllowedPhaseECatalogObject(object: CatalogObject): boolean {
  return (
    isDrizzleMigrationObject(object) ||
    (object.schemaName === PUBLIC_SCHEMA_NAME &&
      PHASE_E_CATALOG_OBJECTS.has(object.objectName))
  );
}

function readObjectName(object: CatalogObject): string {
  return object.objectName;
}
