import { expect, test } from "bun:test";
import type { PublishPersistence } from "@bher/db";
import { Hono } from "hono";

import type { ApiBindings } from "../types";
import { handlePublishPage } from "./publish";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const SITE_ID = "22222222-2222-4222-8222-222222222222";
const PAGE_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";

test("translates a stale publication candidate to HTTP 409", async () => {
  const app = createPublishTestApplication({
    resolvePublishCandidate: async () => ({
      versionId: VERSION_ID,
      document: { schemaVersion: 1, sections: [] },
    }),
    commitPublication: async () => "stale",
  });
  const response = await app.request(`/?siteId=${SITE_ID}&pageId=${PAGE_ID}`, {
    method: "POST",
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "Page changed before publication completed.",
  });
});

function createPublishTestApplication(
  persistence: PublishPersistence,
): Hono<ApiBindings> {
  const app = new Hono<ApiBindings>();
  app.use("*", async (context, next) => {
    context.set("authenticatedSession", {
      status: "authenticated",
      user: {
        id: "publisher-user-id",
        email: "publisher@example.com",
        displayName: "Publisher",
      },
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
    context.set("tenantAccess", {
      id: TENANT_ID,
      name: "Publisher Tenant",
      role: "owner",
    });
    await next();
  });
  app.post("/", (context) => handlePublishPage(context, persistence));
  return app;
}
