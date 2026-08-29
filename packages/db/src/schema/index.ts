export { account, session, user, verification } from "./auth";
export { memberships, tenantRole } from "./memberships";
export { tenants } from "./tenants";

import { account, session, user, verification } from "./auth";
import { memberships } from "./memberships";
import { tenants } from "./tenants";

export const authSchema = {
  user,
  session,
  account,
  verification,
};

export const databaseSchema = {
  ...authSchema,
  tenants,
  memberships,
};
