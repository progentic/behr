import {
  type AuthenticatedUser,
  type InitialIdentity,
  initialIdentitySchema,
} from "@bher/contracts";
import {
  type DatabaseClient,
  type Environment,
  createAuthPersistence,
  createDatabaseClient,
  identityExists,
  loadDatabaseConfig,
} from "@bher/db";

import { loadApiConfig } from "./env";
import { createAuthService } from "./lib/auth";

const BOOTSTRAP_NAME_VARIABLE = "BOOTSTRAP_NAME";
const BOOTSTRAP_EMAIL_VARIABLE = "BOOTSTRAP_EMAIL";
const BOOTSTRAP_PASSWORD_VARIABLE = "BOOTSTRAP_PASSWORD";
const SUCCESS_MESSAGE = "Initial BeHR identity created.";
const FAILURE_MESSAGE = "Initial identity bootstrap failed.";
const FAILURE_EXIT_CODE = 1;

export class IdentityBootstrapRefusedError extends Error {
  constructor() {
    super("An identity already exists; bootstrap refused.");
    this.name = "IdentityBootstrapRefusedError";
  }
}

export class IdentityBootstrapConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityBootstrapConfigurationError";
  }
}

export async function bootstrapIdentity(
  environment: Environment,
): Promise<AuthenticatedUser> {
  const identity = loadBootstrapIdentity(environment);
  const apiConfig = loadApiConfig(environment);
  const database = createDatabaseClient(loadDatabaseConfig(environment));
  try {
    await database.connect();
    await refuseExistingIdentity(database);
    const persistence = createAuthPersistence(database);
    const auth = createAuthService(apiConfig.auth, persistence);
    return await auth.registerIdentity(
      identity,
      new Headers({ origin: apiConfig.auth.adminOrigin }),
    );
  } finally {
    await database.close();
  }
}

export function loadBootstrapIdentity(environment: Environment): InitialIdentity {
  const input = {
    name: readBootstrapValue(environment, BOOTSTRAP_NAME_VARIABLE),
    email: readBootstrapValue(environment, BOOTSTRAP_EMAIL_VARIABLE),
    password: readBootstrapValue(environment, BOOTSTRAP_PASSWORD_VARIABLE),
  };
  const result = initialIdentitySchema.safeParse(input);
  if (!result.success) {
    throw new IdentityBootstrapConfigurationError(
      "Bootstrap name, email, or password is invalid.",
    );
  }
  return result.data;
}

async function refuseExistingIdentity(database: DatabaseClient): Promise<void> {
  if (await identityExists(database)) {
    throw new IdentityBootstrapRefusedError();
  }
}

function readBootstrapValue(
  environment: Environment,
  variable: string,
): string {
  const value = environment[variable];
  if (value === undefined || value.length === 0) {
    throw new IdentityBootstrapConfigurationError(`${variable} is required.`);
  }
  return value;
}

function formatBootstrapFailure(error: unknown): string {
  if (
    error instanceof IdentityBootstrapConfigurationError ||
    error instanceof IdentityBootstrapRefusedError
  ) {
    return error.message;
  }
  return FAILURE_MESSAGE;
}

if (import.meta.main) {
  try {
    await bootstrapIdentity(process.env);
    console.log(SUCCESS_MESSAGE);
  } catch (error) {
    console.error(formatBootstrapFailure(error));
    process.exitCode = FAILURE_EXIT_CODE;
  }
}
