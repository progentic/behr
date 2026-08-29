import { z } from "zod";

const TENANT_NAME_MAX_LENGTH = 200;

export const tenantRoleSchema = z.enum(["owner", "member"]);
export const tenantIdSchema = z.string().uuid();

export const createTenantRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(TENANT_NAME_MAX_LENGTH),
  })
  .strict();

export const tenantAccessSchema = z
  .object({
    id: tenantIdSchema,
    name: z.string().min(1).max(TENANT_NAME_MAX_LENGTH),
    role: tenantRoleSchema,
  })
  .strict();

export const tenantListResponseSchema = z
  .object({
    tenants: z.array(tenantAccessSchema),
  })
  .strict();

export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;
export type TenantRole = z.infer<typeof tenantRoleSchema>;
export type TenantAccess = z.infer<typeof tenantAccessSchema>;
export type TenantListResponse = z.infer<typeof tenantListResponseSchema>;
