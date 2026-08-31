import { z } from "zod";

export const ASSET_MAX_BYTE_SIZE = 10 * 1024 * 1024;
const ASSET_FILENAME_MAX_LENGTH = 255;
const ASSET_CONTENT_TYPE_MAX_LENGTH = 255;
const INVALID_ASSET_FILENAME_PATTERN = /[\u0000-\u001f\u007f/\\]/;
const INVALID_ASSET_CONTENT_TYPE_PATTERN = /[\u0000-\u001f\u007f]/;

export const assetIdSchema = z.string().uuid();
export const assetOriginalFilenameSchema = z
  .string()
  .min(1)
  .max(ASSET_FILENAME_MAX_LENGTH)
  .refine((filename) => !INVALID_ASSET_FILENAME_PATTERN.test(filename));
export const assetContentTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSET_CONTENT_TYPE_MAX_LENGTH)
  .refine((contentType) => !INVALID_ASSET_CONTENT_TYPE_PATTERN.test(contentType));
export const assetByteSizeSchema = z
  .number()
  .int()
  .min(1)
  .max(ASSET_MAX_BYTE_SIZE);

export const assetUploadResponseSchema = z
  .object({
    id: assetIdSchema,
    originalFilename: assetOriginalFilenameSchema,
    contentType: assetContentTypeSchema,
    byteSize: assetByteSizeSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type AssetUploadResponse = z.infer<typeof assetUploadResponseSchema>;
