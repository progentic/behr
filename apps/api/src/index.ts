import { createApiApplication } from "./application";

const application = createApiApplication(process.env);
const SUCCESS_EXIT_CODE = 0;

if (import.meta.main) {
  console.log(`API listening on port ${application.server.port}`);
  process.once("SIGINT", () => void shutDownApplication());
  process.once("SIGTERM", () => void shutDownApplication());
}

export default application.server;

export const app = application.app;
export const closeApplication = application.close;

async function shutDownApplication(): Promise<void> {
  await application.close();
  process.exit(SUCCESS_EXIT_CODE);
}
