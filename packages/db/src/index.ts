export {
  createDatabaseClient,
  type DatabaseClient,
  type DrizzleDatabase,
} from "./client";
export {
  type AuthPersistenceAdapter,
} from "./auth-adapter";
export { createAuthPersistence, identityExists } from "./auth-persistence";
export { checkDatabaseConnection } from "./check";
export { migrateDatabase } from "./migrate";
export {
  type TenantPersistence,
  createTenantPersistence,
} from "./tenant-persistence";
export {
  DatabaseConfigurationError,
  type DatabaseConfig,
  type Environment,
  loadDatabaseConfig,
} from "./env";
export {
  account,
  authSchema,
  databaseSchema,
  memberships,
  session,
  tenantRole,
  tenants,
  user,
  verification,
} from "./schema";
