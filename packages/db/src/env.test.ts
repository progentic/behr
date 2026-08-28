import { describe, expect, test } from "bun:test";

import { DatabaseConfigurationError, loadDatabaseConfig } from "./env";

const SECRET_PASSWORD = "never-print-this-password";

describe("loadDatabaseConfig", () => {
  test("rejects a missing DATABASE_URL", () => {
    expect(() => loadDatabaseConfig({})).toThrow(
      new DatabaseConfigurationError("DATABASE_URL is required."),
    );
  });

  test("rejects an empty DATABASE_URL", () => {
    expect(() => loadDatabaseConfig({ DATABASE_URL: "   " })).toThrow(
      new DatabaseConfigurationError("DATABASE_URL must not be empty."),
    );
  });

  test("rejects a malformed DATABASE_URL", () => {
    expect(() => loadDatabaseConfig({ DATABASE_URL: "not-a-url" })).toThrow(
      new DatabaseConfigurationError("DATABASE_URL must be a valid URL."),
    );
  });

  test("rejects a non-PostgreSQL protocol", () => {
    expect(() =>
      loadDatabaseConfig({ DATABASE_URL: "mysql://localhost/behr" }),
    ).toThrow(
      new DatabaseConfigurationError(
        "DATABASE_URL must use postgres:// or postgresql://.",
      ),
    );
  });

  test("accepts a postgres URL", () => {
    expect(
      loadDatabaseConfig({
        DATABASE_URL: "postgres://user:password@localhost:5432/behr",
      }),
    ).toEqual({
      databaseUrl: "postgres://user:password@localhost:5432/behr",
    });
  });

  test("accepts a postgresql URL", () => {
    expect(
      loadDatabaseConfig({
        DATABASE_URL: "postgresql://user:password@localhost:5432/behr",
      }),
    ).toEqual({
      databaseUrl: "postgresql://user:password@localhost:5432/behr",
    });
  });

  test("redacts credentials from validation errors", () => {
    const loadInvalidConfig = () =>
      loadDatabaseConfig({
        DATABASE_URL: `mysql://user:${SECRET_PASSWORD}@localhost/behr`,
      });

    expect(loadInvalidConfig).toThrow();
    expect(captureErrorMessage(loadInvalidConfig)).not.toContain(SECRET_PASSWORD);
  });
});

function captureErrorMessage(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    return String(error);
  }
  return "";
}
