import { expect, test } from "bun:test";
import {
  ASSET_MAX_BYTE_SIZE,
  assetUploadResponseSchema,
  assetListResponseSchema,
  siteSummarySchema,
  tenantAccessSchema,
} from "@bher/contracts";
import {
  type DatabaseClient,
  assets,
  createDatabaseClient,
  loadDatabaseConfig,
  memberships,
} from "@bher/db";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";

const OWNER_PASSWORD = "asset-owner-password";
const MEMBER_PASSWORD = "asset-member-password";
const OUTSIDER_PASSWORD = "asset-outsider-password";
const JSON_CONTENT_TYPE = "application/json";
const ASSET_MAX_REQUEST_BODY_SIZE = 11 * 1024 * 1024;

type TestIdentity = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

type AssetRow = Readonly<{
  id: string;
  siteId: string;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  createdAt: Date;
}>;

test("enforces the site-scoped asset upload lifecycle", verifyAssetLifecycle);

async function verifyAssetLifecycle(): Promise<void> {
  const storageRoot = await mkdtemp(join(tmpdir(), "behr-asset-integration-"));
  const environment = { ...process.env, ASSET_STORAGE_ROOT: storageRoot };
  const application = createApiApplication(environment);
  const observer = createDatabaseClient(loadDatabaseConfig(environment));
  const origin = loadApiConfig(environment).auth.baseUrl;
  const ownerIdentity = createIdentity("Owner", OWNER_PASSWORD);
  const memberIdentity = createIdentity("Member", MEMBER_PASSWORD);
  const outsiderIdentity = createIdentity("Outsider", OUTSIDER_PASSWORD);
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  try {
    await observer.connect();
    const owner = await registerIdentity(application, origin, ownerIdentity);
    const member = await registerIdentity(application, origin, memberIdentity);
    const outsider = await registerIdentity(
      application,
      origin,
      outsiderIdentity,
    );
    createdUserIds.push(owner.id, member.id, outsider.id);
    const ownerCookie = await authenticateIdentity(
      application,
      origin,
      ownerIdentity,
    );
    const memberCookie = await authenticateIdentity(
      application,
      origin,
      memberIdentity,
    );
    const outsiderCookie = await authenticateIdentity(
      application,
      origin,
      outsiderIdentity,
    );
    const tenant = await createTenant(application, origin, ownerCookie, "Assets");
    const outsiderTenant = await createTenant(
      application,
      origin,
      outsiderCookie,
      "Outsider Assets",
    );
    createdTenantIds.push(tenant.id, outsiderTenant.id);
    await observer.drizzle.insert(memberships).values({
      tenantId: tenant.id,
      userId: member.id,
      role: "member",
    });
    const site = await createSite(
      application,
      origin,
      ownerCookie,
      tenant.id,
      "Asset Site",
      `assets-${crypto.randomUUID()}.example.com`,
    );
    const otherSite = await createSite(
      application,
      origin,
      ownerCookie,
      tenant.id,
      "Other Asset Site",
      `other-assets-${crypto.randomUUID()}.example.com`,
    );
    const outsiderSite = await createSite(
      application,
      origin,
      outsiderCookie,
      outsiderTenant.id,
      "Outsider Site",
      `outsider-assets-${crypto.randomUUID()}.example.com`,
    );

    await verifyOwnerUpload(
      application,
      observer,
      storageRoot,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
    );
    await verifyMemberUpload(
      application,
      observer,
      storageRoot,
      origin,
      memberCookie,
      tenant.id,
      site.id,
    );
    await verifyAssetListing(
      application,
      origin,
      ownerCookie,
      memberCookie,
      tenant.id,
      site.id,
    );
    await verifyAuthorizationControls(
      application,
      observer,
      storageRoot,
      origin,
      ownerCookie,
      outsiderCookie,
      tenant.id,
      site.id,
      outsiderTenant.id,
      outsiderSite.id,
    );
    await verifyMultipartControls(
      application,
      observer,
      storageRoot,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
    );
    await verifySizeControls(
      application,
      observer,
      storageRoot,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
    );
    await verifyFilenameAndAuthorityControls(
      application,
      observer,
      storageRoot,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      otherSite.id,
    );
  } finally {
    await removeTestRecords(observer, createdTenantIds, createdUserIds);
    await application.close();
    await observer.close();
    await rm(storageRoot, { recursive: true, force: true });
  }
}

async function verifyOwnerUpload(
  application: ApiApplication,
  observer: DatabaseClient,
  storageRoot: string,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
): Promise<void> {
  const bytes = new TextEncoder().encode("owner asset bytes");
  const response = await uploadFile(
    application,
    origin,
    cookie,
    tenantId,
    siteId,
    new File([bytes], "owner-original.bin", {
      type: "application/octet-stream",
    }),
  );
  expect(response.status).toBe(201);
  const body = assetUploadResponseSchema.parse(await response.json());
  expect(Object.keys(body)).toEqual([
    "id",
    "originalFilename",
    "contentType",
    "byteSize",
    "createdAt",
  ]);
  const row = requireAssetRow(await readAssetRow(observer, body.id));
  expect(row).toEqual({
    id: body.id,
    siteId,
    storageKey: `${siteId}/${body.id}`,
    originalFilename: "owner-original.bin",
    contentType: "application/octet-stream",
    byteSize: bytes.length,
    createdAt: row.createdAt,
  });
  expect(row.createdAt).toBeInstanceOf(Date);
  expect(body.createdAt).toBe(row.createdAt.toISOString());
  expect(Array.from(await readFile(join(storageRoot, siteId, body.id)))).toEqual(
    Array.from(bytes),
  );
  expect(row.storageKey).not.toContain("owner-original.bin");
  expect(JSON.stringify(body)).not.toContain(storageRoot);

  const duplicateStorageKey = observer.drizzle.insert(assets).values({
    id: crypto.randomUUID(),
    siteId,
    storageKey: `${siteId}/${body.id}`,
    originalFilename: "duplicate.txt",
    contentType: "text/plain",
    byteSize: 1,
  });
  expect(duplicateStorageKey.execute()).rejects.toThrow();
}

async function verifyMemberUpload(
  application: ApiApplication,
  observer: DatabaseClient,
  storageRoot: string,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
): Promise<void> {
  const response = await uploadFile(
    application,
    origin,
    cookie,
    tenantId,
    siteId,
    new File(["member bytes"], "member.bin", {
      type: "application/octet-stream",
    }),
  );
  expect(response.status).toBe(201);
  const body = assetUploadResponseSchema.parse(await response.json());
  expect((await readAssetRow(observer, body.id))?.siteId).toBe(siteId);
  expect(await Bun.file(join(storageRoot, siteId, body.id)).exists()).toBe(true);
}

async function verifyAuthorizationControls(
  application: ApiApplication,
  observer: DatabaseClient,
  storageRoot: string,
  origin: string,
  ownerCookie: string,
  outsiderCookie: string,
  tenantId: string,
  siteId: string,
  outsiderTenantId: string,
  outsiderSiteId: string,
): Promise<void> {
  expect(
    (await application.app.request(assetRoute(tenantId, siteId))).status,
  ).toBe(401);
  expect(
    (
      await application.app.request(assetRoute(tenantId, siteId), {
        headers: { cookie: outsiderCookie },
      })
    ).status,
  ).toBe(404);
  await expectRejectedWithoutMutation(observer, storageRoot, 401, () =>
    uploadFile(
      application,
      origin,
      undefined,
      tenantId,
      siteId,
      createSmallFile(),
    ),
  );
  await expectRejectedWithoutMutation(observer, storageRoot, 404, () =>
    uploadFile(
      application,
      origin,
      outsiderCookie,
      tenantId,
      siteId,
      createSmallFile(),
    ),
  );
  await expectRejectedWithoutMutation(observer, storageRoot, 404, () =>
    uploadFile(
      application,
      origin,
      ownerCookie,
      tenantId,
      "invalid-site-id",
      createSmallFile(),
    ),
  );
  await expectRejectedWithoutMutation(observer, storageRoot, 404, () =>
    uploadFile(
      application,
      origin,
      ownerCookie,
      outsiderTenantId,
      outsiderSiteId,
      createSmallFile(),
    ),
  );
  await expectRejectedWithoutMutation(observer, storageRoot, 403, () =>
    uploadFile(
      application,
      undefined,
      ownerCookie,
      tenantId,
      siteId,
      createSmallFile(),
    ),
  );
}

async function verifyAssetListing(
  application: ApiApplication,
  origin: string,
  ownerCookie: string,
  memberCookie: string,
  tenantId: string,
  siteId: string,
): Promise<void> {
  const imageResponse = await uploadFile(
    application,
    origin,
    ownerCookie,
    tenantId,
    siteId,
    new File([new Uint8Array([1, 2, 3])], "listed.png", {
      type: "image/png",
    }),
  );
  expect(imageResponse.status).toBe(201);
  const image = assetUploadResponseSchema.parse(await imageResponse.json());
  const unsupportedResponse = await uploadFile(
    application,
    origin,
    ownerCookie,
    tenantId,
    siteId,
    new File(["pdf"], "hidden.pdf", { type: "application/pdf" }),
  );
  expect(unsupportedResponse.status).toBe(201);

  for (const cookie of [ownerCookie, memberCookie]) {
    const response = await application.app.request(assetRoute(tenantId, siteId), {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const body = assetListResponseSchema.parse(await response.json());
    expect(body.assets).toEqual([
      {
        ...image,
        contentType: "image/png",
      },
    ]);
    expect(Object.keys(body.assets[0] ?? {}).sort()).toEqual([
      "byteSize",
      "contentType",
      "createdAt",
      "id",
      "originalFilename",
    ]);
  }
}

async function verifyMultipartControls(
  application: ApiApplication,
  observer: DatabaseClient,
  storageRoot: string,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
): Promise<void> {
  const missing = new FormData();
  await expectRejectedForm(
    application,
    observer,
    storageRoot,
    origin,
    cookie,
    tenantId,
    siteId,
    missing,
  );
  const duplicate = new FormData();
  duplicate.append("file", createSmallFile("first.txt"));
  duplicate.append("file", createSmallFile("second.txt"));
  await expectRejectedForm(
    application,
    observer,
    storageRoot,
    origin,
    cookie,
    tenantId,
    siteId,
    duplicate,
  );
  const extra = new FormData();
  extra.append("file", createSmallFile());
  extra.append("storageKey", "attacker/path");
  await expectRejectedForm(
    application,
    observer,
    storageRoot,
    origin,
    cookie,
    tenantId,
    siteId,
    extra,
  );
  const stringFile = new FormData();
  stringFile.append("file", "not a file");
  await expectRejectedForm(
    application,
    observer,
    storageRoot,
    origin,
    cookie,
    tenantId,
    siteId,
    stringFile,
  );
  await expectRejectedWithoutMutation(observer, storageRoot, 400, () =>
    application.app.request(assetRoute(tenantId, siteId), {
      method: "POST",
      headers: createHeaders(origin, cookie, JSON_CONTENT_TYPE),
      body: JSON.stringify({ file: "not multipart" }),
    }),
  );
  await expectRejectedWithoutMutation(observer, storageRoot, 400, () =>
    application.app.request(assetRoute(tenantId, siteId), {
      method: "POST",
      headers: createHeaders(
        origin,
        cookie,
        "multipart/form-data; boundary=missing-boundary",
      ),
      body: "malformed multipart body",
    }),
  );
}

async function verifySizeControls(
  application: ApiApplication,
  observer: DatabaseClient,
  storageRoot: string,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
): Promise<void> {
  await expectRejectedWithoutMutation(observer, storageRoot, 400, () =>
    uploadFile(
      application,
      origin,
      cookie,
      tenantId,
      siteId,
      new File([], "empty.bin"),
    ),
  );

  const maximum = new Uint8Array(ASSET_MAX_BYTE_SIZE);
  maximum[0] = 1;
  maximum[maximum.length - 1] = 2;
  const maximumResponse = await uploadFile(
    application,
    origin,
    cookie,
    tenantId,
    siteId,
    new File([maximum], "maximum.bin", { type: "application/octet-stream" }),
  );
  expect(maximumResponse.status).toBe(201);
  const maximumBody = assetUploadResponseSchema.parse(
    await maximumResponse.json(),
  );
  expect(maximumBody.byteSize).toBe(ASSET_MAX_BYTE_SIZE);
  expect(Bun.file(join(storageRoot, siteId, maximumBody.id)).size).toBe(
    ASSET_MAX_BYTE_SIZE,
  );

  await expectRejectedWithoutMutation(observer, storageRoot, 413, () =>
    uploadFile(
      application,
      origin,
      cookie,
      tenantId,
      siteId,
      new File([new Uint8Array(ASSET_MAX_BYTE_SIZE + 1)], "too-large.bin"),
    ),
  );
  await expectRejectedWithoutMutation(observer, storageRoot, 413, () =>
    uploadFile(
      application,
      origin,
      cookie,
      tenantId,
      siteId,
      new File(
        [new Uint8Array(ASSET_MAX_REQUEST_BODY_SIZE)],
        "request-too-large.bin",
      ),
    ),
  );
}

async function verifyFilenameAndAuthorityControls(
  application: ApiApplication,
  observer: DatabaseClient,
  storageRoot: string,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
  otherSiteId: string,
): Promise<void> {
  await expectRejectedWithoutMutation(observer, storageRoot, 400, () =>
    uploadFile(
      application,
      origin,
      cookie,
      tenantId,
      siteId,
      new File(["traversal"], "../../outside.txt", { type: "text/plain" }),
    ),
  );
  expect(await Bun.file(join(storageRoot, "..", "outside.txt")).exists()).toBe(
    false,
  );

  const attackerId = "33333333-3333-4333-8333-333333333333";
  const form = new FormData();
  form.append("file", new File(["fallback bytes"], "fallback.bin"));
  const response = await application.app.request(
    `${assetRoute(tenantId, siteId)}?assetId=${attackerId}&siteId=${otherSiteId}&storageKey=attacker/path`,
    {
      method: "POST",
      headers: createHeaders(origin, cookie, undefined, {
        "x-asset-id": attackerId,
        "x-storage-key": "attacker/path",
      }),
      body: form,
    },
  );
  expect(response.status).toBe(201);
  const body = assetUploadResponseSchema.parse(await response.json());
  expect(body.id).not.toBe(attackerId);
  expect(body.contentType).toBe("application/octet-stream");
  const row = await readAssetRow(observer, body.id);
  expect(row?.siteId).toBe(siteId);
  expect(row?.storageKey).toBe(`${siteId}/${body.id}`);
  expect(row?.storageKey).not.toContain("attacker");
  expect(await Bun.file(join(storageRoot, siteId, body.id)).exists()).toBe(true);
  expect(await Bun.file(join(storageRoot, otherSiteId, body.id)).exists()).toBe(
    false,
  );
}

async function expectRejectedForm(
  application: ApiApplication,
  observer: DatabaseClient,
  storageRoot: string,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
  form: FormData,
): Promise<void> {
  await expectRejectedWithoutMutation(observer, storageRoot, 400, () =>
    application.app.request(assetRoute(tenantId, siteId), {
      method: "POST",
      headers: createHeaders(origin, cookie),
      body: form,
    }),
  );
}

async function expectRejectedWithoutMutation(
  observer: DatabaseClient,
  storageRoot: string,
  expectedStatus: number,
  operation: () => Response | Promise<Response>,
): Promise<void> {
  const rowCount = await countAssets(observer);
  const fileCount = await countStoredFiles(storageRoot);
  const response = await operation();
  expect(response.status).toBe(expectedStatus);
  expect(await countAssets(observer)).toBe(rowCount);
  expect(await countStoredFiles(storageRoot)).toBe(fileCount);
}

async function uploadFile(
  application: ApiApplication,
  origin: string | undefined,
  cookie: string | undefined,
  tenantId: string,
  siteId: string,
  file: File,
): Promise<Response> {
  const form = new FormData();
  form.append("file", file);
  return await application.app.request(assetRoute(tenantId, siteId), {
    method: "POST",
    headers: createHeaders(origin, cookie),
    body: form,
  });
}

function createSmallFile(filename = "small.txt"): File {
  return new File(["small bytes"], filename, { type: "text/plain" });
}

function assetRoute(tenantId: string, siteId: string): string {
  return `/tenants/${tenantId}/sites/${siteId}/assets`;
}

function createIdentity(label: string, password: string): TestIdentity {
  return {
    name: `Phase L ${label}`,
    email: `phase-l-${label.toLowerCase()}-${crypto.randomUUID()}@example.com`,
    password,
  };
}

async function registerIdentity(
  application: ApiApplication,
  origin: string,
  identity: TestIdentity,
): Promise<{ id: string }> {
  return await application.auth.registerIdentity(identity, new Headers({ origin }));
}

async function authenticateIdentity(
  application: ApiApplication,
  origin: string,
  identity: TestIdentity,
): Promise<string> {
  const response = await application.app.request("/auth/login", {
    method: "POST",
    headers: createHeaders(origin, undefined, JSON_CONTENT_TYPE),
    body: JSON.stringify({
      email: identity.email,
      password: identity.password,
    }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("behr.session_token="));
  if (!setCookie) {
    throw new Error("Expected an authenticated session cookie.");
  }
  return setCookie.split(";", 1)[0] ?? "";
}

async function createTenant(
  application: ApiApplication,
  origin: string,
  cookie: string,
  name: string,
): Promise<{ id: string }> {
  const response = await application.app.request("/tenants", {
    method: "POST",
    headers: createHeaders(origin, cookie, JSON_CONTENT_TYPE),
    body: JSON.stringify({ name: `Phase L ${name}` }),
  });
  expect(response.status).toBe(201);
  return tenantAccessSchema.parse(await response.json());
}

async function createSite(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
  name: string,
  hostname: string,
): Promise<{ id: string }> {
  const response = await application.app.request(`/tenants/${tenantId}/sites`, {
    method: "POST",
    headers: createHeaders(origin, cookie, JSON_CONTENT_TYPE),
    body: JSON.stringify({ name, hostname }),
  });
  expect(response.status).toBe(201);
  return siteSummarySchema.parse(await response.json());
}

function createHeaders(
  origin?: string,
  cookie?: string,
  contentType?: string,
  extra: Record<string, string> = {},
): Headers {
  const headers = new Headers(extra);
  if (origin) {
    headers.set("origin", origin);
  }
  if (cookie) {
    headers.set("cookie", cookie);
  }
  if (contentType) {
    headers.set("content-type", contentType);
  }
  return headers;
}

async function readAssetRow(
  observer: DatabaseClient,
  assetId: string,
): Promise<AssetRow | null> {
  const rows = await observer.native<AssetRow[]>`
    SELECT
      id,
      site_id AS "siteId",
      storage_key AS "storageKey",
      original_filename AS "originalFilename",
      content_type AS "contentType",
      byte_size AS "byteSize",
      created_at AS "createdAt"
    FROM assets
    WHERE id = ${assetId}
  `;
  return rows[0] ?? null;
}

function requireAssetRow(row: AssetRow | null): AssetRow {
  if (!row) {
    throw new Error("Expected persisted asset metadata.");
  }
  return row;
}

async function countAssets(observer: DatabaseClient): Promise<number> {
  const rows = await observer.native<Array<{ count: number }>>`
    SELECT count(*)::int AS count FROM assets
  `;
  return rows[0]?.count ?? 0;
}

async function countStoredFiles(storageRoot: string): Promise<number> {
  if (!(await Bun.file(storageRoot).exists())) {
    return 0;
  }
  const entries = await readdir(storageRoot, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += (await readdir(join(storageRoot, entry.name))).length;
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

async function removeTestRecords(
  observer: DatabaseClient,
  tenantIds: string[],
  userIds: string[],
): Promise<void> {
  for (const tenantId of tenantIds) {
    await observer.native`
      DELETE FROM assets
      WHERE site_id IN (SELECT id FROM sites WHERE tenant_id = ${tenantId})
    `;
    await observer.native`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  for (const userId of userIds) {
    await observer.native`DELETE FROM "user" WHERE id = ${userId}`;
  }
}
