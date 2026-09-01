import adminDocument from "../../admin/index.html";
import type { Environment } from "@bher/db";

import { createApiApplication } from "./application";

const DEVELOPMENT_HOSTNAME = "localhost";
const ADMIN_ROUTE = "/";
const SUCCESS_EXIT_CODE = 0;

export type DevelopmentServer = Readonly<{
  close: () => Promise<void>;
  origin: string;
  port: number;
}>;

async function runDevelopmentServer(): Promise<void> {
  const server = await startDevelopmentServer(process.env);
  console.log(`BeHR development server ready at ${server.origin}/`);
  process.once("SIGINT", async () => {
    await server.close();
    process.exit(SUCCESS_EXIT_CODE);
  });
  process.once("SIGTERM", async () => {
    await server.close();
    process.exit(SUCCESS_EXIT_CODE);
  });
}

export async function startDevelopmentServer(
  environment: Environment,
): Promise<DevelopmentServer> {
  const application = createApiApplication(environment);
  try {
    const listener = Bun.serve({
      development: true,
      hostname: DEVELOPMENT_HOSTNAME,
      port: application.server.port,
      routes: { [ADMIN_ROUTE]: adminDocument },
      fetch: (request) => application.app.fetch(request),
      error: application.server.error,
    });
    return Object.freeze({
      close: async () => {
        try {
          await listener.stop(true);
        } finally {
          await application.close();
        }
      },
      origin: listener.url.origin,
      port: application.server.port,
    });
  } catch (error) {
    await application.close();
    throw error;
  }
}

if (import.meta.main) {
  await runDevelopmentServer();
}
