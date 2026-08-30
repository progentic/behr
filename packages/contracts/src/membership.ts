import { z } from "zod";

import { tenantRoleSchema } from "./tenant";

const EMAIL_MAX_LENGTH = 320;

const normalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(EMAIL_MAX_LENGTH);

export const tenantMemberSchema = z
  .object({
    email: normalizedEmailSchema,
    displayName: z.string().min(1),
    role: tenantRoleSchema,
  })
  .strict();

export const tenantMemberListSchema = z
  .object({
    members: z.array(tenantMemberSchema),
  })
  .strict();

export const addTenantMemberRequestSchema = z
  .object({
    email: normalizedEmailSchema,
  })
  .strict();

const memberAddedResultSchema = z
  .object({
    status: z.literal("member_added"),
    member: tenantMemberSchema,
  })
  .strict();

const invitationCreatedResultSchema = z
  .object({
    status: z.literal("invitation_created"),
    invitation: z
      .object({
        email: normalizedEmailSchema,
        token: z.string().min(1),
        expiresAt: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export const memberProvisioningResultSchema = z.discriminatedUnion("status", [
  memberAddedResultSchema,
  invitationCreatedResultSchema,
]);

export type TenantMember = z.infer<typeof tenantMemberSchema>;
export type TenantMemberList = z.infer<typeof tenantMemberListSchema>;
export type AddTenantMemberRequest = z.infer<
  typeof addTenantMemberRequestSchema
>;
export type MemberProvisioningResult = z.infer<
  typeof memberProvisioningResultSchema
>;
