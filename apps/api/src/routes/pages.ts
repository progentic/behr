import {
  type PageDraft,
  type PageListResponse,
  createPageRequestSchema,
  pageDocumentSchema,
  pageIdSchema,
  previewTokenResponseSchema,
  savePageDraftRequestSchema,
  siteIdSchema,
} from "@bher/contracts";
import {
  type PagePersistence,
  type PreviewPersistence,
  type PublishPersistence,
  PageScopeNotFoundError,
  PageSlugConflictError,
  type TenantPersistence,
} from "@bher/db";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";

import type { AuthService } from "../lib/auth";
import { createJsonResponse, readJsonBody } from "../lib/http";
import { generatePreviewCredential } from "../lib/preview-token";
import { createRequireAuthentication } from "../middleware/auth";
import { createRequireTrustedOrigin } from "../middleware/origin";
import { createRequireTenantMembership } from "../middleware/tenant";
import type { ApiBindings } from "../types";
import { handlePublishPage } from "./publish";

const OK_STATUS = 200;
const CREATED_STATUS = 201;
const BAD_REQUEST_STATUS = 400;
const NOT_FOUND_STATUS = 404;
const CONFLICT_STATUS = 409;

type PersistedPageDraft = NonNullable<
  Awaited<ReturnType<PagePersistence["resolvePageDraft"]>>
>;

export function createPageRoutes(
  auth: AuthService,
  tenantPersistence: TenantPersistence,
  pagePersistence: PagePersistence,
  previewPersistence: PreviewPersistence,
  publishPersistence: PublishPersistence,
): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  routes.use("*", createRequireAuthentication(auth));
  routes.use("*", createRequireTenantMembership(tenantPersistence));
  routes.use("*", createRequireValidSiteId());
  routes.get("/", (context) => handleListPages(context, pagePersistence));
  routes.post("/", createRequireTrustedOrigin(auth), (context) =>
    handleCreatePage(context, pagePersistence),
  );
  routes.get(
    "/:pageId",
    createRequireValidPageId(),
    (context) => handleResolvePageDraft(context, pagePersistence),
  );
  routes.post(
    "/:pageId/versions",
    createRequireValidPageId(),
    createRequireTrustedOrigin(auth),
    (context) => handleSaveDraft(context, pagePersistence),
  );
  routes.post(
    "/:pageId/preview-tokens",
    createRequireValidPageId(),
    createRequireTrustedOrigin(auth),
    (context) => handleIssuePreviewToken(context, previewPersistence),
  );
  routes.post(
    "/:pageId/publish",
    createRequireValidPageId(),
    createRequireTrustedOrigin(auth),
    (context) => handlePublishPage(context, publishPersistence),
  );
  return routes;
}

function createRequireValidSiteId(): MiddlewareHandler<ApiBindings> {
  return async (context, next) => {
    if (!siteIdSchema.safeParse(context.req.param("siteId")).success) {
      return createPageNotFoundResponse();
    }
    await next();
  };
}

function createRequireValidPageId(): MiddlewareHandler<ApiBindings> {
  return async (context, next) => {
    if (!pageIdSchema.safeParse(context.req.param("pageId")).success) {
      return createPageNotFoundResponse();
    }
    await next();
  };
}

async function handleListPages(
  context: Context<ApiBindings>,
  persistence: PagePersistence,
): Promise<Response> {
  try {
    const body: PageListResponse = {
      pages: await persistence.listPages(
        context.get("tenantAccess").id,
        context.req.param("siteId") ?? "",
      ),
    };
    return createJsonResponse(body, OK_STATUS);
  } catch (error) {
    if (error instanceof PageScopeNotFoundError) {
      return createPageNotFoundResponse();
    }
    throw error;
  }
}

async function handleCreatePage(
  context: Context<ApiBindings>,
  persistence: PagePersistence,
): Promise<Response> {
  const request = createPageRequestSchema.safeParse(
    await readJsonBody(context.req.raw),
  );
  if (!request.success) {
    return createInvalidPageRequestResponse();
  }
  try {
    const record = await persistence.createPage(
      context.get("tenantAccess").id,
      context.req.param("siteId") ?? "",
      request.data.title,
      request.data.slug,
      request.data.document,
    );
    return createJsonResponse(toPageDraft(record), CREATED_STATUS);
  } catch (error) {
    if (error instanceof PageScopeNotFoundError) {
      return createPageNotFoundResponse();
    }
    if (error instanceof PageSlugConflictError) {
      return createJsonResponse(
        { error: "Page slug already exists in this site." },
        CONFLICT_STATUS,
      );
    }
    throw error;
  }
}

async function handleResolvePageDraft(
  context: Context<ApiBindings>,
  persistence: PagePersistence,
): Promise<Response> {
  const record = await persistence.resolvePageDraft(
    context.get("tenantAccess").id,
    context.req.param("siteId") ?? "",
    context.req.param("pageId") ?? "",
  );
  return record
    ? createJsonResponse(toPageDraft(record), OK_STATUS)
    : createPageNotFoundResponse();
}

async function handleSaveDraft(
  context: Context<ApiBindings>,
  persistence: PagePersistence,
): Promise<Response> {
  const request = savePageDraftRequestSchema.safeParse(
    await readJsonBody(context.req.raw),
  );
  if (!request.success) {
    return createInvalidPageRequestResponse();
  }
  const record = await persistence.saveDraftVersion(
    context.get("tenantAccess").id,
    context.req.param("siteId") ?? "",
    context.req.param("pageId") ?? "",
    request.data.document,
  );
  return record
    ? createJsonResponse(toPageDraft(record), CREATED_STATUS)
    : createPageNotFoundResponse();
}

async function handleIssuePreviewToken(
  context: Context<ApiBindings>,
  persistence: PreviewPersistence,
): Promise<Response> {
  const credential = await generatePreviewCredential();
  const record = await persistence.createOrRotatePreviewToken(
    context.get("tenantAccess").id,
    context.req.param("siteId") ?? "",
    context.req.param("pageId") ?? "",
    credential.tokenHash,
    credential.expiresAt,
  );
  if (!record) {
    return createPageNotFoundResponse();
  }
  const body = previewTokenResponseSchema.parse({
    token: credential.token,
    expiresAt: record.expiresAt.toISOString(),
  });
  return createJsonResponse(body, CREATED_STATUS);
}

function toPageDraft(record: PersistedPageDraft): PageDraft {
  return {
    page: record.page,
    draft: {
      id: record.draft.id,
      document: pageDocumentSchema.parse(record.draft.document),
      createdAt: record.draft.createdAt.toISOString(),
    },
  };
}

function createPageNotFoundResponse(): Response {
  return createJsonResponse({ error: "Page not found." }, NOT_FOUND_STATUS);
}

function createInvalidPageRequestResponse(): Response {
  return createJsonResponse(
    { error: "Page request is invalid." },
    BAD_REQUEST_STATUS,
  );
}
