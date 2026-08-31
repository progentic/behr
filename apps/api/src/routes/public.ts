import {
  assetIdSchema,
  hostnameSchema,
  pageSlugSchema,
  publicPageResponseSchema,
  renderableAssetContentTypeSchema,
} from "@bher/contracts";
import type { PublicPagePersistence } from "@bher/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { createJsonResponse } from "../lib/http";
import type { AssetStorage } from "../lib/asset-storage";
import type { ApiBindings } from "../types";

const OK_STATUS = 200;
const NOT_FOUND_STATUS = 404;
const SLUG_QUERY_PARAMETER = "slug";
const PORT_PATTERN = /^\d+$/;
const MAXIMUM_PORT = 65_535;

export function createPublicRoutes(
  persistence: PublicPagePersistence,
  storage: AssetStorage,
): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  routes.get("/page", (context) =>
    handleResolvePublishedPage(context, persistence),
  );
  routes.get("/assets/:assetId", (context) =>
    handleResolvePublishedAsset(context, persistence, storage),
  );
  return routes;
}

async function handleResolvePublishedAsset(
  context: Context<ApiBindings>,
  persistence: PublicPagePersistence,
  storage: AssetStorage,
): Promise<Response> {
  const hostname = parsePublicHostname(context.req.header("host"));
  const assetId = assetIdSchema.safeParse(context.req.param("assetId"));
  if (hostname === null || !assetId.success) {
    return createPublicAssetNotFoundResponse();
  }
  const record = await persistence.resolvePublishedAsset(
    hostname,
    assetId.data,
  );
  if (!record) {
    return createPublicAssetNotFoundResponse();
  }
  const contentType = renderableAssetContentTypeSchema.safeParse(
    record.contentType,
  );
  if (!contentType.success) {
    return createPublicAssetNotFoundResponse();
  }
  const bytes = await storage.readOriginal(record.storageKey);
  return createAssetByteResponse(bytes, contentType.data);
}

async function handleResolvePublishedPage(
  context: Context<ApiBindings>,
  persistence: PublicPagePersistence,
): Promise<Response> {
  const hostname = parsePublicHostname(context.req.header("host"));
  const slug = parsePublicSlug(context);
  if (hostname === null || slug === null) {
    return createPublicPageNotFoundResponse();
  }
  const record = await persistence.resolvePublishedPage(hostname, slug);
  return record
    ? createJsonResponse(publicPageResponseSchema.parse(record), OK_STATUS)
    : createPublicPageNotFoundResponse();
}

function parsePublicHostname(authority: string | undefined): string | null {
  if (authority === undefined) {
    return null;
  }
  const hostname = removeOptionalPort(authority);
  if (hostname === null) {
    return null;
  }
  const parsed = hostnameSchema.safeParse(hostname);
  return parsed.success ? parsed.data : null;
}

function removeOptionalPort(authority: string): string | null {
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

function parsePublicSlug(context: Context<ApiBindings>): string | null {
  const values = context.req.queries(SLUG_QUERY_PARAMETER);
  if (values?.length !== 1) {
    return null;
  }
  const parsed = pageSlugSchema.safeParse(values[0]);
  return parsed.success ? parsed.data : null;
}

function createPublicPageNotFoundResponse(): Response {
  return createJsonResponse({ error: "Page not found." }, NOT_FOUND_STATUS);
}

function createPublicAssetNotFoundResponse(): Response {
  return createJsonResponse({ error: "Asset not found." }, NOT_FOUND_STATUS);
}

function createAssetByteResponse(
  bytes: Uint8Array,
  contentType: string,
): Response {
  return new Response(bytes, {
    status: OK_STATUS,
    headers: {
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
