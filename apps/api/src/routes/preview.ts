import {
  PREVIEW_TOKEN_HEADER,
  hostnameSchema,
  pageSlugSchema,
  previewTokenSchema,
  publicPageResponseSchema,
} from "@bher/contracts";
import type { PreviewPersistence } from "@bher/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { createJsonResponse } from "../lib/http";
import { hashPreviewToken } from "../lib/preview-token";
import type { ApiBindings } from "../types";

const OK_STATUS = 200;
const NOT_FOUND_STATUS = 404;
const SLUG_QUERY_PARAMETER = "slug";
const PORT_PATTERN = /^\d+$/;
const MAXIMUM_PORT = 65_535;

export function createPreviewRoutes(
  persistence: PreviewPersistence,
): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  routes.get("/page", (context) =>
    handleResolvePreviewPage(context, persistence),
  );
  return routes;
}

async function handleResolvePreviewPage(
  context: Context<ApiBindings>,
  persistence: PreviewPersistence,
): Promise<Response> {
  const hostname = parsePreviewHostname(context.req.header("host"));
  const slug = parsePreviewSlug(context);
  const token = parsePreviewToken(context.req.header(PREVIEW_TOKEN_HEADER));
  if (hostname === null || slug === null || token === null) {
    return createPreviewNotFoundResponse();
  }
  const record = await persistence.resolvePreviewPage(
    hostname,
    slug,
    await hashPreviewToken(token),
    new Date(),
  );
  return record
    ? createJsonResponse(publicPageResponseSchema.parse(record), OK_STATUS)
    : createPreviewNotFoundResponse();
}

function parsePreviewHostname(authority: string | undefined): string | null {
  if (authority === undefined) {
    return null;
  }
  const hostname = removePreviewPort(authority);
  if (hostname === null) {
    return null;
  }
  const parsed = hostnameSchema.safeParse(hostname);
  return parsed.success ? parsed.data : null;
}

function removePreviewPort(authority: string): string | null {
  const separator = authority.lastIndexOf(":");
  if (separator === -1) {
    return authority;
  }
  if (authority.indexOf(":") !== separator) {
    return null;
  }
  const port = authority.slice(separator + 1);
  if (!PORT_PATTERN.test(port) || Number(port) > MAXIMUM_PORT) {
    return null;
  }
  return authority.slice(0, separator);
}

function parsePreviewSlug(context: Context<ApiBindings>): string | null {
  const values = context.req.queries(SLUG_QUERY_PARAMETER);
  if (values?.length !== 1) {
    return null;
  }
  const parsed = pageSlugSchema.safeParse(values[0]);
  return parsed.success ? parsed.data : null;
}

function parsePreviewToken(token: string | undefined): string | null {
  const parsed = previewTokenSchema.safeParse(token);
  return parsed.success ? parsed.data : null;
}

function createPreviewNotFoundResponse(): Response {
  return createJsonResponse({ error: "Preview not found." }, NOT_FOUND_STATUS);
}
