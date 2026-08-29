import type { AuthenticatedSession } from "@bher/contracts";

export type ApiBindings = {
  Variables: {
    authenticatedSession: AuthenticatedSession;
  };
};
