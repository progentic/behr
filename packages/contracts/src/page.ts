import { z } from "zod";

import { sectionSchema } from "./section";
import { themeTokensSchema } from "./theme";

export const PAGE_DOCUMENT_SCHEMA_VERSION = 1 as const;
const PAGE_TITLE_MAX_LENGTH = 200;
const PAGE_SLUG_MAX_LENGTH = 200;
const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const pageIdSchema = z.string().uuid();
export const pageTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAGE_TITLE_MAX_LENGTH);
export const pageSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(PAGE_SLUG_MAX_LENGTH)
  .refine((slug) => slug === "" || PAGE_SLUG_PATTERN.test(slug));

export const pageDocumentSchema = z
  .object({
    schemaVersion: z.literal(PAGE_DOCUMENT_SCHEMA_VERSION),
    sections: z.array(sectionSchema),
  })
  .strict();

export const publicPageResponseSchema = z
  .object({
    title: pageTitleSchema,
    slug: pageSlugSchema,
    document: pageDocumentSchema,
    theme: themeTokensSchema,
  })
  .strict();

export const pageSummarySchema = z
  .object({
    id: pageIdSchema,
    title: pageTitleSchema,
    slug: pageSlugSchema,
  })
  .strict();

export const pageListResponseSchema = z
  .object({
    pages: z.array(pageSummarySchema),
  })
  .strict();

export const createPageRequestSchema = z
  .object({
    title: pageTitleSchema,
    slug: pageSlugSchema,
    document: pageDocumentSchema,
  })
  .strict();

export const savePageDraftRequestSchema = z
  .object({
    document: pageDocumentSchema,
  })
  .strict();

export const draftVersionSchema = z
  .object({
    id: z.string().uuid(),
    document: pageDocumentSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const pageDraftSchema = z
  .object({
    page: pageSummarySchema,
    draft: draftVersionSchema,
  })
  .strict();

export type PageDocument = z.infer<typeof pageDocumentSchema>;
export type PublicPageResponse = z.infer<typeof publicPageResponseSchema>;
export type PageSummary = z.infer<typeof pageSummarySchema>;
export type PageListResponse = z.infer<typeof pageListResponseSchema>;
export type CreatePageRequest = z.infer<typeof createPageRequestSchema>;
export type SavePageDraftRequest = z.infer<
  typeof savePageDraftRequestSchema
>;
export type DraftVersion = z.infer<typeof draftVersionSchema>;
export type PageDraft = z.infer<typeof pageDraftSchema>;
