import type { Environment } from "@bher/db";

const API_PORT_VARIABLE = "API_PORT";
const BETTER_AUTH_SECRET_VARIABLE = "BETTER_AUTH_SECRET";
const BETTER_AUTH_URL_VARIABLE = "BETTER_AUTH_URL";
const ADMIN_ORIGIN_VARIABLE = "ADMIN_ORIGIN";
const NODE_ENV_VARIABLE = "NODE_ENV";
const PRODUCTION_ENVIRONMENT = "production";
const DEFAULT_API_PORT = 3000;
const MINIMUM_PORT = 1;
const MAXIMUM_PORT = 65535;
const MINIMUM_AUTH_SECRET_LENGTH = 32;
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const HTTPS_PROTOCOL = "https:";
const ROOT_PATH = "/";

export type AuthConfig = Readonly<{
  adminOrigin: string;
  baseUrl: string;
  secret: string;
  secureCookies: boolean;
  trustedOrigins: readonly string[];
}>;

export type ApiConfig = Readonly<{
  port: number;
  auth: AuthConfig;
}>;

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

export function loadApiConfig(environment: Environment): ApiConfig {
  const port = readApiPort(environment);
  const secret = readAuthSecret(environment);
  const baseUrl = readAuthBaseUrl(environment);
  const adminOrigin = readAdminOrigin(environment);
  const production = isProductionEnvironment(environment);
  requireProductionHttps(baseUrl, production);
  requireProductionHttps(adminOrigin, production);
  return createApiConfig(port, secret, baseUrl, adminOrigin, production);
}

function readApiPort(environment: Environment): number {
  const value = environment[API_PORT_VARIABLE];
  return parsePort(value ?? String(DEFAULT_API_PORT));
}

function readAuthSecret(environment: Environment): string {
  const value = requireEnvironmentValue(
    environment,
    BETTER_AUTH_SECRET_VARIABLE,
    "BETTER_AUTH_SECRET is required.",
  );
  const normalizedValue = value.trim();
  if (
    normalizedValue.length < MINIMUM_AUTH_SECRET_LENGTH ||
    normalizedValue !== value
  ) {
    throw new ApiConfigurationError(
      "BETTER_AUTH_SECRET must contain at least 32 characters.",
    );
  }
  return value;
}

function readAuthBaseUrl(environment: Environment): URL {
  const value = requireEnvironmentValue(
    environment,
    BETTER_AUTH_URL_VARIABLE,
    "BETTER_AUTH_URL is required.",
  );
  const url = parseUrl(value, "BETTER_AUTH_URL must be a valid URL.");
  requireHttpProtocol(url, "BETTER_AUTH_URL must use HTTP or HTTPS.");
  requireOriginOnlyUrl(url, "BETTER_AUTH_URL must contain only an origin.");
  return url;
}

function readAdminOrigin(environment: Environment): URL {
  const value = requireEnvironmentValue(
    environment,
    ADMIN_ORIGIN_VARIABLE,
    "ADMIN_ORIGIN is required.",
  );
  const url = parseUrl(value, "ADMIN_ORIGIN must be a valid URL.");
  requireHttpProtocol(url, "ADMIN_ORIGIN must use HTTP or HTTPS.");
  requireOriginOnlyUrl(url, "ADMIN_ORIGIN must contain only an origin.");
  return url;
}

function isProductionEnvironment(environment: Environment): boolean {
  return environment[NODE_ENV_VARIABLE] === PRODUCTION_ENVIRONMENT;
}

function requireProductionHttps(url: URL, production: boolean): void {
  if (production && url.protocol !== HTTPS_PROTOCOL) {
    throw new ApiConfigurationError(
      "Authentication origins must use HTTPS in production.",
    );
  }
}

function createApiConfig(
  port: number,
  secret: string,
  baseUrl: URL,
  adminOrigin: URL,
  production: boolean,
): ApiConfig {
  const origin = baseUrl.origin;
  const trustedOrigins = Array.from(
    new Set([origin, adminOrigin.origin]),
  );
  return Object.freeze({
    port,
    auth: Object.freeze({
      adminOrigin: adminOrigin.origin,
      baseUrl: origin,
      secret,
      secureCookies: production || baseUrl.protocol === HTTPS_PROTOCOL,
      trustedOrigins: Object.freeze(trustedOrigins),
    }),
  });
}

function requireEnvironmentValue(
  environment: Environment,
  variable: string,
  message: string,
): string {
  const value = environment[variable];
  if (value === undefined || value.length === 0) {
    throw new ApiConfigurationError(message);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < MINIMUM_PORT || port > MAXIMUM_PORT) {
    throw new ApiConfigurationError("API_PORT must be a valid TCP port.");
  }
  return port;
}

function parseUrl(value: string, message: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new ApiConfigurationError(message);
  }
}

function requireHttpProtocol(url: URL, message: string): void {
  if (!HTTP_PROTOCOLS.has(url.protocol)) {
    throw new ApiConfigurationError(message);
  }
}

function requireOriginOnlyUrl(url: URL, message: string): void {
  const hasCredentials = url.username.length > 0 || url.password.length > 0;
  const hasExtraParts =
    url.pathname !== ROOT_PATH || url.search.length > 0 || url.hash.length > 0;
  if (hasCredentials || hasExtraParts) {
    throw new ApiConfigurationError(message);
  }
}
