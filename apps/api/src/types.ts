import type { AuthenticatedSession, TenantAccess } from "@bher/contracts";

export type ApiBindings = {
  Variables: {
    authenticatedSession: AuthenticatedSession;
    tenantAccess: TenantAccess;
  };
};
