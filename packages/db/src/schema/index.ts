export { account, session, user, verification } from "./auth";
export { assets } from "./assets";
export { domains } from "./domains";
export { membershipInvitations } from "./membership-invitations";
export { memberships, tenantRole } from "./memberships";
export { pagePublications } from "./page-publications";
export { pageVersionAssets } from "./page-version-assets";
export { pageVersions } from "./page-versions";
export { pages } from "./pages";
export { previewTokens } from "./preview-tokens";
export { sites } from "./sites";
export { tenants } from "./tenants";

import { account, session, user, verification } from "./auth";
import { assets } from "./assets";
import { domains } from "./domains";
import { membershipInvitations } from "./membership-invitations";
import { memberships } from "./memberships";
import { pagePublications } from "./page-publications";
import { pageVersionAssets } from "./page-version-assets";
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
  assets,
  tenants,
  memberships,
  sites,
  domains,
  membershipInvitations,
  pagePublications,
  pageVersionAssets,
  pages,
  pageVersions,
  previewTokens,
};
