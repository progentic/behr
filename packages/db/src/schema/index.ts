export { account, session, user, verification } from "./auth";

import { account, session, user, verification } from "./auth";

export const authSchema = {
  user,
  session,
  account,
  verification,
};

export const databaseSchema = {
  ...authSchema,
};
