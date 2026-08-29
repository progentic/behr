import adminDocument from "../../admin/index.html";
import type { Environment } from "@bher/db";

import { type ApiApplication, createApiApplication } from "./application";

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
  registerShutdownSignals(server);
}

export async function startDevelopmentServer(
  environment: Environment,
): Promise<DevelopmentServer> {
  const application = createApiApplication(environment);
  try {
    const listener = startDevelopmentListener(application);
    return Object.freeze({
      close: () => closeDevelopmentServer(listener, application),
      origin: listener.url.origin,
      port: application.server.port,
    });
  } catch (error) {
    await application.close();
    throw error;
  }
}

function registerShutdownSignals(server: DevelopmentServer): void {
  process.once("SIGINT", () => void shutDownProcess(server));
  process.once("SIGTERM", () => void shutDownProcess(server));
}

async function shutDownProcess(server: DevelopmentServer): Promise<void> {
  await server.close();
  process.exit(SUCCESS_EXIT_CODE);
}

function startDevelopmentListener(
  application: ApiApplication,
): Bun.Server<undefined> {
  return Bun.serve({
    development: true,
    hostname: DEVELOPMENT_HOSTNAME,
    port: application.server.port,
    routes: { [ADMIN_ROUTE]: adminDocument },
    fetch: (request) => application.app.fetch(request),
  });
}

async function closeDevelopmentServer(
  listener: Bun.Server<undefined>,
  application: ApiApplication,
): Promise<void> {
  try {
    await listener.stop(true);
  } finally {
    await application.close();
  }
}

if (import.meta.main) {
  await runDevelopmentServer();
}
