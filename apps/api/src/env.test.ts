import { describe, expect, test } from "bun:test";

import { ApiConfigurationError, loadApiConfig } from "./env";

const VALID_SECRET = "phase-c-test-secret-with-at-least-32-characters";
const SECRET_FRAGMENT = "must-not-appear";

describe("loadApiConfig", () => {
  test("loads development authentication configuration", () => {
    expect(
      loadApiConfig({
        AUTH_BASE_URL: "http://localhost:3000",
        AUTH_SECRET: VALID_SECRET,
      }),
    ).toEqual({
      port: 3000,
      auth: {
        baseUrl: "http://localhost:3000",
        secret: VALID_SECRET,
        secureCookies: false,
        trustedOrigins: ["http://localhost:3000"],
      },
    });
  });

  test("accepts an explicit API port", () => {
    expect(
      loadApiConfig({
        API_PORT: "4100",
        AUTH_BASE_URL: "https://behr.example",
        AUTH_SECRET: VALID_SECRET,
      }).port,
    ).toBe(4100);
  });

  test("rejects an invalid API port", () => {
    expect(() =>
      loadApiConfig({
        API_PORT: "invalid",
        AUTH_BASE_URL: "http://localhost:3000",
        AUTH_SECRET: VALID_SECRET,
      }),
    ).toThrow(new ApiConfigurationError("API_PORT must be a valid TCP port."));
  });

  test("rejects a missing authentication secret", () => {
    expect(() =>
      loadApiConfig({ AUTH_BASE_URL: "http://localhost:3000" }),
    ).toThrow(new ApiConfigurationError("AUTH_SECRET is required."));
  });

  test("rejects a short authentication secret without exposing it", () => {
    const operation = () =>
      loadApiConfig({
        AUTH_BASE_URL: "http://localhost:3000",
        AUTH_SECRET: SECRET_FRAGMENT,
      });

    expect(operation).toThrow(
      new ApiConfigurationError(
        "AUTH_SECRET must contain at least 32 characters.",
      ),
    );
    expect(captureErrorMessage(operation)).not.toContain(SECRET_FRAGMENT);
  });

  test("rejects an authentication secret padded with whitespace", () => {
    expect(() =>
      loadApiConfig({
        AUTH_BASE_URL: "http://localhost:3000",
        AUTH_SECRET: ` ${VALID_SECRET} `,
      }),
    ).toThrow(
      new ApiConfigurationError(
        "AUTH_SECRET must contain at least 32 characters.",
      ),
    );
  });

  test("rejects a malformed authentication base URL", () => {
    expect(() =>
      loadApiConfig({ AUTH_BASE_URL: "not-a-url", AUTH_SECRET: VALID_SECRET }),
    ).toThrow(new ApiConfigurationError("AUTH_BASE_URL must be a valid URL."));
  });

  test("rejects authentication base URLs containing credentials", () => {
    expect(() =>
      loadApiConfig({
        AUTH_BASE_URL: "https://user:password@behr.example",
        AUTH_SECRET: VALID_SECRET,
      }),
    ).toThrow(
      new ApiConfigurationError("AUTH_BASE_URL must contain only an origin."),
    );
  });

  test("requires HTTPS in production", () => {
    expect(() =>
      loadApiConfig({
        AUTH_BASE_URL: "http://behr.example",
        AUTH_SECRET: VALID_SECRET,
        NODE_ENV: "production",
      }),
    ).toThrow(
      new ApiConfigurationError("AUTH_BASE_URL must use HTTPS in production."),
    );
  });

  test("enables secure cookies for HTTPS", () => {
    expect(
      loadApiConfig({
        AUTH_BASE_URL: "https://behr.example",
        AUTH_SECRET: VALID_SECRET,
      }).auth.secureCookies,
    ).toBe(true);
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
