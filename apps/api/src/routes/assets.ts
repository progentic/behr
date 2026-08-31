import {
  ASSET_MAX_BYTE_SIZE,
  assetContentTypeSchema,
  assetIdSchema,
  assetOriginalFilenameSchema,
  assetUploadResponseSchema,
  siteIdSchema,
} from "@bher/contracts";
import type {
  AssetMetadataRecord,
  AssetPersistence,
  NewAssetMetadata,
  TenantPersistence,
} from "@bher/db";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { AuthService } from "../lib/auth";
import type { AssetStorage, StoredOriginal } from "../lib/asset-storage";
import { createJsonResponse } from "../lib/http";
import { createRequireAuthentication } from "../middleware/auth";
import { createRequireTrustedOrigin } from "../middleware/origin";
import { createRequireTenantMembership } from "../middleware/tenant";
import type { ApiBindings } from "../types";

const CREATED_STATUS = 201;
const BAD_REQUEST_STATUS = 400;
const NOT_FOUND_STATUS = 404;
const PAYLOAD_TOO_LARGE_STATUS = 413;
const ASSET_MAX_REQUEST_BODY_SIZE = 11 * 1024 * 1024;
const MULTIPART_CONTENT_TYPE = "multipart/form-data";
const ASSET_FILE_FIELD = "file";
const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const FORM_DATA_PARSE_ERROR_CODE = "ERR_FORMDATA_PARSE_ERROR";
const MISSING_FINAL_BOUNDARY_MESSAGE =
  "missing final boundary while parsing FormData";

type ValidAssetUpload = Readonly<{
  status: "valid";
  file: File;
  originalFilename: string;
  contentType: string;
}>;

type AssetUploadResult =
  | ValidAssetUpload
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "too-large" }>;

type RequestFormData = Awaited<ReturnType<Request["formData"]>>;

export function createAssetRoutes(
  auth: AuthService,
  tenantPersistence: TenantPersistence,
  assetPersistence: AssetPersistence,
  assetStorage: AssetStorage,
): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  routes.use("*", createRequireAuthentication(auth));
  routes.use("*", createRequireTenantMembership(tenantPersistence));
  routes.use("*", createRequireValidSiteId());
  routes.use("*", createRequireTrustedOrigin(auth));
  routes.use("*", createRequireAssetSite(assetPersistence));
  routes.post(
    "/",
    bodyLimit({
      maxSize: ASSET_MAX_REQUEST_BODY_SIZE,
      onError: () => createAssetTooLargeResponse(),
    }),
    (context) => handleAssetUpload(context, assetPersistence, assetStorage),
  );
  return routes;
}

function createRequireValidSiteId(): MiddlewareHandler<ApiBindings> {
  return async (context, next) => {
    if (!siteIdSchema.safeParse(context.req.param("siteId")).success) {
      return createAssetNotFoundResponse();
    }
    await next();
  };
}

function createRequireAssetSite(
  persistence: AssetPersistence,
): MiddlewareHandler<ApiBindings> {
  return async (context, next) => {
    const tenantId = context.get("tenantAccess").id;
    const siteId = context.req.param("siteId") ?? "";
    if (!(await persistence.resolveAssetSite(tenantId, siteId))) {
      return createAssetNotFoundResponse();
    }
    await next();
  };
}

async function handleAssetUpload(
  context: Context<ApiBindings>,
  persistence: AssetPersistence,
  storage: AssetStorage,
): Promise<Response> {
  const upload = await readAssetUpload(context.req.raw);
  if (upload.status === "invalid") {
    return createInvalidAssetUploadResponse();
  }
  if (upload.status === "too-large") {
    return createAssetTooLargeResponse();
  }
  const assetId = assetIdSchema.parse(crypto.randomUUID());
  const bytes = new Uint8Array(await upload.file.arrayBuffer());
  const stored = await storage.writeOriginal(
    context.req.param("siteId") ?? "",
    assetId,
    bytes,
  );
  const record = await persistAssetMetadata(
    context,
    upload,
    assetId,
    stored,
    persistence,
    storage,
  );
  if (!record) {
    return createAssetNotFoundResponse();
  }
  const response = assetUploadResponseSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
  });
  return createJsonResponse(response, CREATED_STATUS);
}

async function persistAssetMetadata(
  context: Context<ApiBindings>,
  upload: ValidAssetUpload,
  assetId: string,
  stored: StoredOriginal,
  persistence: AssetPersistence,
  storage: AssetStorage,
): Promise<AssetMetadataRecord | null> {
  const metadata: NewAssetMetadata = {
    id: assetId,
    storageKey: stored.storageKey,
    originalFilename: upload.originalFilename,
    contentType: upload.contentType,
    byteSize: stored.byteSize,
  };
  let record: AssetMetadataRecord | null;
  try {
    record = await persistence.createAssetMetadata(
      context.get("tenantAccess").id,
      context.req.param("siteId") ?? "",
      metadata,
    );
  } catch (error) {
    await storage.removeOriginal(stored.storageKey);
    throw error;
  }
  if (!record) {
    await storage.removeOriginal(stored.storageKey);
  }
  return record;
}

async function readAssetUpload(request: Request): Promise<AssetUploadResult> {
  const formData = await readAssetFormData(request);
  if (!formData) {
    return { status: "invalid" };
  }
  const file = readOnlyAssetFile(formData);
  if (!file || file.size === 0) {
    return { status: "invalid" };
  }
  if (file.size > ASSET_MAX_BYTE_SIZE) {
    return { status: "too-large" };
  }
  const filename = assetOriginalFilenameSchema.safeParse(file.name);
  if (!filename.success) {
    return { status: "invalid" };
  }
  return {
    status: "valid",
    file,
    originalFilename: filename.data,
    contentType: normalizeAssetContentType(file.type),
  };
}

async function readAssetFormData(
  request: Request,
): Promise<RequestFormData | null> {
  if (!isMultipartRequest(request)) {
    return null;
  }
  try {
    return await request.formData();
  } catch (error) {
    if (isMalformedMultipartError(error)) {
      return null;
    }
    throw error;
  }
}

function isMalformedMultipartError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const hasParseErrorCode =
    "code" in error && error.code === FORM_DATA_PARSE_ERROR_CODE;
  return hasParseErrorCode || error.message === MISSING_FINAL_BOUNDARY_MESSAGE;
}

function readOnlyAssetFile(formData: RequestFormData): File | null {
  const entries = Array.from(formData.entries());
  if (entries.length !== 1) {
    return null;
  }
  const [name, value] = entries[0] ?? [];
  return name === ASSET_FILE_FIELD && value instanceof File ? value : null;
}

function isMultipartRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() ===
    MULTIPART_CONTENT_TYPE
  );
}

export function normalizeAssetContentType(value: string): string {
  const contentType = assetContentTypeSchema.safeParse(value);
  return contentType.success ? contentType.data : DEFAULT_CONTENT_TYPE;
}

function createInvalidAssetUploadResponse(): Response {
  return createJsonResponse(
    { error: "Asset upload is invalid." },
    BAD_REQUEST_STATUS,
  );
}

function createAssetTooLargeResponse(): Response {
  return createJsonResponse(
    { error: "Asset upload is too large." },
    PAYLOAD_TOO_LARGE_STATUS,
  );
}

function createAssetNotFoundResponse(): Response {
  return createJsonResponse(
    { error: "Asset target not found." },
    NOT_FOUND_STATUS,
  );
}
