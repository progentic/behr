export { account, session, user, verification } from "./auth";
export { domains } from "./domains";
export { memberships, tenantRole } from "./memberships";
export { sites } from "./sites";
export { tenants } from "./tenants";

import { account, session, user, verification } from "./auth";
import { domains } from "./domains";
import { memberships } from "./memberships";
import { sites } from "./sites";
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
  sites,
  domains,
};
