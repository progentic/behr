import { defineConfig } from "drizzle-kit";

import { loadDatabaseConfig } from "./src/env";

const databaseConfig = loadDatabaseConfig(process.env);

export default defineConfig({
  dialect: "postgresql",
  out: "./migrations",
  schema: "./src/schema/index.ts",
  dbCredentials: {
    url: databaseConfig.databaseUrl,
  },
  strict: true,
  verbose: true,
});
