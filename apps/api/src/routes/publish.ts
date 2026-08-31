import { pageDocumentSchema, publishResponseSchema } from "@bher/contracts";
import type { PublishPersistence } from "@bher/db";
import type { Context } from "hono";

import { createJsonResponse } from "../lib/http";
import type { ApiBindings } from "../types";

const OK_STATUS = 200;
const FORBIDDEN_STATUS = 403;
const NOT_FOUND_STATUS = 404;
const CONFLICT_STATUS = 409;

export async function handlePublishPage(
  context: Context<ApiBindings>,
  persistence: PublishPersistence,
): Promise<Response> {
  if (context.get("tenantAccess").role !== "owner") {
    return createPublishingForbiddenResponse();
  }
  const tenantId = context.get("tenantAccess").id;
  const siteId = context.req.param("siteId") ?? "";
  const pageId = context.req.param("pageId") ?? "";
  const candidate = await persistence.resolvePublishCandidate(
    tenantId,
    siteId,
    pageId,
  );
  if (!candidate) {
    return createPublishPageNotFoundResponse();
  }
  pageDocumentSchema.parse(candidate.document);
  const result = await persistence.commitPublication(
    tenantId,
    siteId,
    pageId,
    candidate.versionId,
    context.get("authenticatedSession").user.id,
  );
  switch (result) {
    case "published":
    case "unchanged":
      return createJsonResponse(
        publishResponseSchema.parse({ status: result }),
        OK_STATUS,
      );
    case "stale":
      return createStalePublicationResponse();
    case "not-found":
      return createPublishPageNotFoundResponse();
  }
}

function createPublishingForbiddenResponse(): Response {
  return createJsonResponse(
    { error: "Publishing is not allowed." },
    FORBIDDEN_STATUS,
  );
}

function createStalePublicationResponse(): Response {
  return createJsonResponse(
    { error: "Page changed before publication completed." },
    CONFLICT_STATUS,
  );
}

function createPublishPageNotFoundResponse(): Response {
  return createJsonResponse({ error: "Page not found." }, NOT_FOUND_STATUS);
}
