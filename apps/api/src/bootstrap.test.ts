import { expect, test } from "bun:test";

import {
  IdentityBootstrapConfigurationError,
  loadBootstrapIdentity,
} from "./bootstrap";

const VALID_PASSWORD = "bootstrap-test-password";

test("loads and normalizes explicit bootstrap identity values", () => {
  expect(
    loadBootstrapIdentity({
      BOOTSTRAP_EMAIL: "  ADMIN@EXAMPLE.COM ",
      BOOTSTRAP_NAME: "  Initial Admin  ",
      BOOTSTRAP_PASSWORD: VALID_PASSWORD,
    }),
  ).toEqual({
    email: "admin@example.com",
    name: "Initial Admin",
    password: VALID_PASSWORD,
  });
});

test("requires every bootstrap variable", () => {
  expect(() =>
    loadBootstrapIdentity({
      BOOTSTRAP_EMAIL: "admin@example.com",
      BOOTSTRAP_PASSWORD: VALID_PASSWORD,
    }),
  ).toThrow(new IdentityBootstrapConfigurationError("BOOTSTRAP_NAME is required."));
});

test("rejects bootstrap passwords shorter than twelve characters", () => {
  const password = "too-short";
  const operation = () =>
    loadBootstrapIdentity({
      BOOTSTRAP_EMAIL: "admin@example.com",
      BOOTSTRAP_NAME: "Initial Admin",
      BOOTSTRAP_PASSWORD: password,
    });

  expect(operation).toThrow(
    new IdentityBootstrapConfigurationError(
      "Bootstrap name, email, or password is invalid.",
    ),
  );
  expect(captureErrorMessage(operation)).not.toContain(password);
});

function captureErrorMessage(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    return String(error);
  }
  return "";
}
