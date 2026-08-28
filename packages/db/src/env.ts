export type Environment = Readonly<Record<string, string | undefined>>;

export type DatabaseConfig = Readonly<{
  databaseUrl: string;
}>;

const DATABASE_URL_VARIABLE = "DATABASE_URL";
const DATABASE_ERROR_NAME = "DatabaseConfigurationError";
const MISSING_DATABASE_URL_MESSAGE = "DATABASE_URL is required.";
const EMPTY_DATABASE_URL_MESSAGE = "DATABASE_URL must not be empty.";
const MALFORMED_DATABASE_URL_MESSAGE = "DATABASE_URL must be a valid URL.";
const UNSUPPORTED_DATABASE_URL_MESSAGE =
  "DATABASE_URL must use postgres:// or postgresql://.";
const POSTGRESQL_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = DATABASE_ERROR_NAME;
  }
}

export function loadDatabaseConfig(environment: Environment): DatabaseConfig {
  const value = readEnvironmentValue(environment, DATABASE_URL_VARIABLE);
  const presentValue = requirePresentValue(value);
  const nonEmptyValue = requireNonEmptyValue(presentValue);
  const url = parseUrl(nonEmptyValue);
  requireSupportedProtocol(url, POSTGRESQL_PROTOCOLS);
  return createDatabaseConfig(url);
}

function readEnvironmentValue(
  environment: Environment,
  variable: string,
): string | undefined {
  return environment[variable];
}

function requirePresentValue(value: string | undefined): string {
  if (value === undefined) {
    throw new DatabaseConfigurationError(MISSING_DATABASE_URL_MESSAGE);
  }
  return value;
}

function requireNonEmptyValue(value: string): string {
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    throw new DatabaseConfigurationError(EMPTY_DATABASE_URL_MESSAGE);
  }
  return normalizedValue;
}

function parseUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new DatabaseConfigurationError(MALFORMED_DATABASE_URL_MESSAGE);
  }
}

function requireSupportedProtocol(url: URL, protocols: ReadonlySet<string>): void {
  if (!protocols.has(url.protocol)) {
    throw new DatabaseConfigurationError(UNSUPPORTED_DATABASE_URL_MESSAGE);
  }
}

function createDatabaseConfig(url: URL): DatabaseConfig {
  return Object.freeze({ databaseUrl: url.toString() });
}
