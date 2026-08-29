import type { AuthenticatedUser } from "@bher/contracts";

export type ApiBindings = {
  Variables: {
    authenticatedUser: AuthenticatedUser;
  };
};
