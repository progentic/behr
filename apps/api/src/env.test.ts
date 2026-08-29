import { describe, expect, test } from "bun:test";
import type { Environment } from "@bher/db";

import { ApiConfigurationError, loadApiConfig } from "./env";

const VALID_SECRET = "phase-c-test-secret-with-at-least-32-characters";
const SECRET_FRAGMENT = "must-not-appear";

describe("loadApiConfig", () => {
  test("loads separate API and admin origins", () => {
    expect(loadApiConfig(createEnvironment())).toEqual({
      port: 3000,
      auth: {
        adminOrigin: "http://localhost:3001",
        baseUrl: "http://localhost:3000",
        secret: VALID_SECRET,
        secureCookies: false,
        trustedOrigins: ["http://localhost:3000", "http://localhost:3001"],
      },
    });
  });

  test("accepts an explicit API port", () => {
    expect(loadApiConfig(createEnvironment({ API_PORT: "4100" })).port).toBe(
      4100,
    );
  });

  test("rejects an invalid API port", () => {
    expect(() => loadApiConfig(createEnvironment({ API_PORT: "invalid" }))).toThrow(
      new ApiConfigurationError("API_PORT must be a valid TCP port."),
    );
  });

  test("rejects a missing authentication secret", () => {
    expect(() =>
      loadApiConfig(createEnvironment({ BETTER_AUTH_SECRET: undefined })),
    ).toThrow(new ApiConfigurationError("BETTER_AUTH_SECRET is required."));
  });

  test("rejects a short authentication secret without exposing it", () => {
    const operation = () =>
      loadApiConfig(createEnvironment({ BETTER_AUTH_SECRET: SECRET_FRAGMENT }));

    expect(operation).toThrow(
      new ApiConfigurationError(
        "BETTER_AUTH_SECRET must contain at least 32 characters.",
      ),
    );
    expect(captureErrorMessage(operation)).not.toContain(SECRET_FRAGMENT);
  });

  test("rejects an authentication secret padded with whitespace", () => {
    expect(() =>
      loadApiConfig(
        createEnvironment({ BETTER_AUTH_SECRET: ` ${VALID_SECRET} ` }),
      ),
    ).toThrow(
      new ApiConfigurationError(
        "BETTER_AUTH_SECRET must contain at least 32 characters.",
      ),
    );
  });

  test("rejects a malformed authentication base URL", () => {
    expect(() =>
      loadApiConfig(createEnvironment({ BETTER_AUTH_URL: "not-a-url" })),
    ).toThrow(new ApiConfigurationError("BETTER_AUTH_URL must be a valid URL."));
  });

  test("rejects a malformed admin origin", () => {
    expect(() =>
      loadApiConfig(createEnvironment({ ADMIN_ORIGIN: "not-a-url" })),
    ).toThrow(new ApiConfigurationError("ADMIN_ORIGIN must be a valid URL."));
  });

  test("rejects authentication URLs containing credentials", () => {
    expect(() =>
      loadApiConfig(
        createEnvironment({
          BETTER_AUTH_URL: "https://user:password@behr.example",
        }),
      ),
    ).toThrow(
      new ApiConfigurationError("BETTER_AUTH_URL must contain only an origin."),
    );
  });

  test("requires HTTPS origins in production", () => {
    expect(() =>
      loadApiConfig(createEnvironment({ NODE_ENV: "production" })),
    ).toThrow(
      new ApiConfigurationError(
        "Authentication origins must use HTTPS in production.",
      ),
    );
  });

  test("enables secure cookies for HTTPS", () => {
    expect(
      loadApiConfig(
        createEnvironment({
          ADMIN_ORIGIN: "https://admin.behr.example",
          BETTER_AUTH_URL: "https://api.behr.example",
        }),
      ).auth.secureCookies,
    ).toBe(true);
  });
});

function createEnvironment(overrides: Environment = {}): Environment {
  return {
    ADMIN_ORIGIN: "http://localhost:3001",
    BETTER_AUTH_SECRET: VALID_SECRET,
    BETTER_AUTH_URL: "http://localhost:3000",
    ...overrides,
  };
}

function captureErrorMessage(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    return String(error);
  }
  return "";
}
