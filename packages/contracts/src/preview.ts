import { z } from "zod";

export const PREVIEW_TOKEN_HEADER = "X-BeHR-Preview-Token";
const PREVIEW_TOKEN_LENGTH = 43;
const PREVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export const previewTokenSchema = z
  .string()
  .length(PREVIEW_TOKEN_LENGTH)
  .regex(PREVIEW_TOKEN_PATTERN);

export const previewTokenResponseSchema = z
  .object({
    token: previewTokenSchema,
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type PreviewTokenResponse = z.infer<typeof previewTokenResponseSchema>;
