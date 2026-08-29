export { account, session, verification } from "./auth";
export { user } from "./users";

import { account, session, verification } from "./auth";
import { user } from "./users";

export const authSchema = {
  user,
  session,
  account,
  verification,
};

export const databaseSchema = {
  ...authSchema,
};
