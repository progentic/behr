export { account, session, user, verification } from "./auth";
export { domains } from "./domains";
export { membershipInvitations } from "./membership-invitations";
export { memberships, tenantRole } from "./memberships";
export { pageVersions } from "./page-versions";
export { pages } from "./pages";
export { previewTokens } from "./preview-tokens";
export { sites } from "./sites";
export { tenants } from "./tenants";

import { account, session, user, verification } from "./auth";
import { domains } from "./domains";
import { membershipInvitations } from "./membership-invitations";
import { memberships } from "./memberships";
import { pageVersions } from "./page-versions";
import { pages } from "./pages";
import { previewTokens } from "./preview-tokens";
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
  membershipInvitations,
  pages,
  pageVersions,
  previewTokens,
};
