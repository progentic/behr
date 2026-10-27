import { expect, test } from "bun:test";
import { getTableColumns, getTableName } from "drizzle-orm";

import { account, session, user, verification } from "./index";

test("defines only the Better Auth identity tables", () => {
  expect([account, session, user, verification].map(getTableName).sort()).toEqual([
    "account",
    "session",
    "user",
    "verification",
  ]);
});

test("defines the stable BeHR identity fields", () => {
  expect(Object.keys(getTableColumns(user))).toEqual([
    "id",
    "name",
    "email",
    "emailVerified",
    "image",
    "createdAt",
    "updatedAt",
  ]);
});

test("keeps credentials in the provider account model", () => {
  expect(Object.keys(getTableColumns(account))).toContain("password");
  expect(Object.keys(getTableColumns(user))).not.toContain("password");
  expect(getTableColumns(account).issuer.notNull).toBe(false);
  expect(getTableColumns(account).providerId.notNull).toBe(true);
  expect(getTableColumns(account).accountId.notNull).toBe(true);
});
