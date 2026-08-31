import {
  ASSET_MAX_BYTE_SIZE,
  RENDERABLE_ASSET_CONTENT_TYPES,
  assetByteSizeSchema,
  assetContentTypeSchema,
  assetListResponseSchema,
  assetOriginalFilenameSchema,
  assetUploadResponseSchema,
  renderableAssetContentTypeSchema,
} from "./asset";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toHaveLength(expected: number): void;
};

const VALID_ASSET_ID = "11111111-1111-4111-8111-111111111111";

test("accepts the strict asset upload response", () => {
  const response = {
    id: VALID_ASSET_ID,
    originalFilename: "brand-mark.svg",
    contentType: "image/svg+xml",
    byteSize: 42,
    createdAt: "2026-08-30T12:00:00.000Z",
  };

  expect(assetUploadResponseSchema.parse(response)).toEqual(response);
  expect(
    assetUploadResponseSchema.safeParse({ ...response, published: true })
      .success,
  ).toBe(false);
});

test("bounds asset display filenames without accepting path authority", () => {
  expect(assetOriginalFilenameSchema.parse("a".repeat(255))).toHaveLength(255);
  expect(assetOriginalFilenameSchema.safeParse("a".repeat(256)).success).toBe(
    false,
  );
  for (const filename of [
    "",
    "path/file.txt",
    "path\\file.txt",
    "nul\0.txt",
    "control\u001f.txt",
  ]) {
    expect(assetOriginalFilenameSchema.safeParse(filename).success).toBe(false);
  }
});

test("bounds asset byte size and content-type metadata", () => {
  expect(assetByteSizeSchema.parse(1)).toBe(1);
  expect(assetByteSizeSchema.parse(ASSET_MAX_BYTE_SIZE)).toBe(
    ASSET_MAX_BYTE_SIZE,
  );
  expect(assetByteSizeSchema.safeParse(0).success).toBe(false);
  expect(assetByteSizeSchema.safeParse(ASSET_MAX_BYTE_SIZE + 1).success).toBe(
    false,
  );
  expect(assetContentTypeSchema.parse(" text/plain ")).toBe("text/plain");
});

test("defines strict renderable asset metadata", () => {
  for (const contentType of RENDERABLE_ASSET_CONTENT_TYPES) {
    expect(renderableAssetContentTypeSchema.parse(contentType)).toBe(
      contentType,
    );
  }
  for (const contentType of [
    "image/svg+xml",
    "application/pdf",
    "text/html",
    "application/octet-stream",
  ]) {
    expect(renderableAssetContentTypeSchema.safeParse(contentType).success).toBe(
      false,
    );
  }
  const asset = {
    id: VALID_ASSET_ID,
    originalFilename: "photo.jpg",
    contentType: "image/jpeg",
    byteSize: 42,
    createdAt: "2026-08-31T12:00:00.000Z",
  };
  expect(assetListResponseSchema.parse({ assets: [asset] })).toEqual({
    assets: [asset],
  });
  expect(
    assetListResponseSchema.safeParse({ assets: [asset], storageKey: "hidden" })
      .success,
  ).toBe(false);
});
