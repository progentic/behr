import { z } from "zod";

import { themeTokensSchema } from "./theme";

const SITE_NAME_MAX_LENGTH = 200;
const HOSTNAME_MAX_LENGTH = 253;
const HOSTNAME_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;

export const siteIdSchema = z.string().uuid();
export const siteNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(SITE_NAME_MAX_LENGTH);
export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(HOSTNAME_MAX_LENGTH)
  .regex(HOSTNAME_PATTERN);

export const createSiteRequestSchema = z
  .object({
    name: siteNameSchema,
    hostname: hostnameSchema,
  })
  .strict();

export const siteSummarySchema = z
  .object({
    id: siteIdSchema,
    name: z.string().min(1).max(SITE_NAME_MAX_LENGTH),
    hostname: hostnameSchema,
  })
  .strict();

export const siteListResponseSchema = z
  .object({
    sites: z.array(siteSummarySchema),
  })
  .strict();

export const updateSiteSettingsRequestSchema = z
  .object({
    name: siteNameSchema,
    theme: themeTokensSchema,
  })
  .strict();

export const siteSettingsResponseSchema = z
  .object({
    site: siteSummarySchema,
    theme: themeTokensSchema,
  })
  .strict();

export type CreateSiteRequest = z.infer<typeof createSiteRequestSchema>;
export type SiteSummary = z.infer<typeof siteSummarySchema>;
export type SiteListResponse = z.infer<typeof siteListResponseSchema>;
export type UpdateSiteSettingsRequest = z.infer<
  typeof updateSiteSettingsRequestSchema
>;
export type SiteSettingsResponse = z.infer<typeof siteSettingsResponseSchema>;
