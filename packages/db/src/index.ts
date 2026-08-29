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
  DatabaseConfigurationError,
  type DatabaseConfig,
  type Environment,
  loadDatabaseConfig,
} from "./env";
export {
  account,
  authSchema,
  databaseSchema,
  session,
  user,
  verification,
} from "./schema";
