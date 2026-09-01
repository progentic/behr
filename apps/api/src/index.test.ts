import { afterAll, describe, expect, test } from "bun:test";

import { createApiApplication } from "./application";

const application = createApiApplication({
  ADMIN_ORIGIN: "http://localhost:3000",
  BETTER_AUTH_SECRET: "health-test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
});
const SENSITIVE_ERROR_MESSAGE = "SENSITIVE_ERROR_MESSAGE";
const SENSITIVE_NON_ERROR_VALUE = "SENSITIVE_NON_ERROR_VALUE";
const SENSITIVE_QUERY_VALUE = "DO_NOT_LOG";
const OUTER_QUERY_VALUE = "DO_NOT_EXPOSE";

application.app.get("/__test/unhandled-error", () => {
  throw new Error(SENSITIVE_ERROR_MESSAGE);
});

application.app.get("/__test/non-error", () => {
  throw SENSITIVE_NON_ERROR_VALUE;
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

test("binds the production server to IPv4 loopback", () => {
  expect(application.server.hostname).toBe("127.0.0.1");
});

test("enforces the handled, Hono Error, and Bun outer failure matrix", async () => {
  const handled = await captureConsoleErrors(() =>
    application.app.request("/preview/page?slug=about"),
  );
  expect(handled.value.status).toBe(404);
  expect(handled.logs).toEqual([]);

  const propagated = await captureConsoleErrors(() =>
    application.app.request(
      `/__test/unhandled-error?secret=${SENSITIVE_QUERY_VALUE}`,
    ),
  );
  expect(propagated.value.status).toBe(500);
  expect(await propagated.value.json()).toEqual({
    error: "Internal server error.",
  });
  expect(propagated.logs).toHaveLength(1);
  const requestRecord = parseLogRecord(propagated.logs[0]);
  expect(Object.keys(requestRecord).sort()).toEqual([
    "errorType",
    "event",
    "level",
    "method",
    "pathname",
    "timestamp",
  ]);
  expect(requestRecord).toMatchObject({
    level: "error",
    event: "unhandled_request_error",
    method: "GET",
    pathname: "/__test/unhandled-error",
    errorType: "Error",
  });
  expect(new Date(String(requestRecord.timestamp)).toString()).not.toBe(
    "Invalid Date",
  );
  expect(propagated.logs[0]).not.toContain(SENSITIVE_ERROR_MESSAGE);
  expect(propagated.logs[0]).not.toContain(SENSITIVE_QUERY_VALUE);
  expect(propagated.logs[0]).not.toContain("unhandled_server_error");

  const bypass = await captureConsoleErrors(async () => {
    try {
      await application.app.request("/__test/non-error");
      return { escaped: false, value: undefined };
    } catch (value) {
      return { escaped: true, value };
    }
  });
  expect(bypass.value).toEqual({
    escaped: true,
    value: SENSITIVE_NON_ERROR_VALUE,
  });
  expect(bypass.logs).toEqual([]);

  await verifyOuterServerFailure(false);
  await verifyOuterServerFailure(true);
});

test("keeps the generic response safe when stderr reporting throws", async () => {
  const originalConsoleError = console.error;
  console.error = () => {
    throw new Error("simulated stderr failure");
  };
  try {
    const response = await application.app.request("/__test/unhandled-error");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Internal server error.",
    });
  } finally {
    console.error = originalConsoleError;
  }
});

async function verifyOuterServerFailure(development: boolean): Promise<void> {
  const result = await captureConsoleErrors(async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      development,
      fetch: application.server.fetch,
      error: application.server.error,
    });
    try {
      const response = await fetch(
        new URL(
          `/__test/non-error?secret=${OUTER_QUERY_VALUE}`,
          server.url,
        ),
      );
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: await response.text(),
      };
    } finally {
      await server.stop(true);
    }
  });
  expect(result.value.status).toBe(500);
  expect(result.value.contentType).toContain("application/json");
  expect(JSON.parse(result.value.body)).toEqual({
    error: "Internal server error.",
  });
  expect(result.value.body).not.toContain(SENSITIVE_NON_ERROR_VALUE);
  expect(result.value.body).not.toContain(OUTER_QUERY_VALUE);
  expect(result.value.body.toLowerCase()).not.toContain("stack");
  expect(result.logs).toHaveLength(1);
  const serverRecord = parseLogRecord(result.logs[0]);
  expect(Object.keys(serverRecord).sort()).toEqual([
    "errorType",
    "event",
    "level",
    "timestamp",
  ]);
  expect(serverRecord).toMatchObject({
    level: "error",
    event: "unhandled_server_error",
    errorType: "Error",
  });
  expect(result.logs[0]).not.toContain(SENSITIVE_NON_ERROR_VALUE);
  expect(result.logs[0]).not.toContain(OUTER_QUERY_VALUE);
  expect(result.logs[0]).not.toContain("unhandled_request_error");
}

async function captureConsoleErrors<T>(
  operation: () => T | Promise<T>,
): Promise<{ value: T; logs: string[] }> {
  const originalConsoleError = console.error;
  const logs: string[] = [];
  console.error = (...values: unknown[]) => {
    logs.push(values.map(String).join(" "));
  };
  try {
    return { value: await operation(), logs };
  } finally {
    console.error = originalConsoleError;
  }
}

function parseLogRecord(value: string | undefined): Record<string, unknown> {
  if (value === undefined) {
    throw new Error("Expected a structured error record.");
  }
  return JSON.parse(value) as Record<string, unknown>;
}
