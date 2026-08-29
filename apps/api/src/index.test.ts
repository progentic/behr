import { afterAll, describe, expect, test } from "bun:test";

import { createApiApplication } from "./application";

const application = createApiApplication({
  ADMIN_ORIGIN: "http://localhost:3000",
  BETTER_AUTH_SECRET: "health-test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
});

afterAll(async () => {
  await application.close();
});

describe("GET /health", () => {
  test("reports that the API process is available", async () => {
    const response = await application.app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
