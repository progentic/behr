import {
  type MemberProvisioningResult,
  type TenantMemberList,
  addTenantMemberRequestSchema,
} from "@bher/contracts";
import {
  type MembershipPersistence,
  MembershipAlreadyExistsError,
  type TenantPersistence,
} from "@bher/db";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";

import type { AuthService } from "../lib/auth";
import { createJsonResponse, readJsonBody } from "../lib/http";
import { generateMembershipInvitationCredential } from "../lib/invitation-token";
import { createRequireAuthentication } from "../middleware/auth";
import { createRequireTrustedOrigin } from "../middleware/origin";
import { createRequireTenantMembership } from "../middleware/tenant";
import type { ApiBindings } from "../types";

const OK_STATUS = 200;
const CREATED_STATUS = 201;
const BAD_REQUEST_STATUS = 400;
const FORBIDDEN_STATUS = 403;
const CONFLICT_STATUS = 409;

export function createMembershipRoutes(
  auth: AuthService,
  tenantPersistence: TenantPersistence,
  membershipPersistence: MembershipPersistence,
): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  routes.use("*", createRequireAuthentication(auth));
  routes.use("*", createRequireTenantMembership(tenantPersistence));
  routes.use("*", createRequireTenantOwner());
  routes.get("/", (context) =>
    handleListMembers(context, membershipPersistence),
  );
  routes.post("/", createRequireTrustedOrigin(auth), (context) =>
    handleProvisionMember(context, membershipPersistence),
  );
  return routes;
}

function createRequireTenantOwner(): MiddlewareHandler<ApiBindings> {
  return async (context, next) => {
    if (context.get("tenantAccess").role !== "owner") {
      return createJsonResponse(
        { error: "Membership administration is not allowed." },
        FORBIDDEN_STATUS,
      );
    }
    await next();
  };
}

async function handleListMembers(
  context: Context<ApiBindings>,
  persistence: MembershipPersistence,
): Promise<Response> {
  const body: TenantMemberList = {
    members: await persistence.listMembers(context.get("tenantAccess").id),
  };
  return createJsonResponse(body, OK_STATUS);
}

async function handleProvisionMember(
  context: Context<ApiBindings>,
  persistence: MembershipPersistence,
): Promise<Response> {
  const request = addTenantMemberRequestSchema.safeParse(
    await readJsonBody(context.req.raw),
  );
  if (!request.success) {
    return createJsonResponse(
      { error: "Membership request is invalid." },
      BAD_REQUEST_STATUS,
    );
  }
  const tenantId = context.get("tenantAccess").id;
  const identity = await persistence.resolveIdentityByEmail(request.data.email);
  if (identity) {
    try {
      const result: MemberProvisioningResult = {
        status: "member_added",
        member: await persistence.addExistingMember(tenantId, identity),
      };
      return createJsonResponse(result, CREATED_STATUS);
    } catch (error) {
      if (error instanceof MembershipAlreadyExistsError) {
        return createJsonResponse(
          { error: "Membership already exists." },
          CONFLICT_STATUS,
        );
      }
      throw error;
    }
  }

  const credential = await generateMembershipInvitationCredential();
  const invitation = await persistence.createOrRotateInvitation(
    tenantId,
    request.data.email,
    credential.tokenHash,
    credential.expiresAt,
  );
  const result: MemberProvisioningResult = {
    status: "invitation_created",
    invitation: {
      email: invitation.email,
      token: credential.token,
      expiresAt: invitation.expiresAt.toISOString(),
    },
  };
  return createJsonResponse(result, CREATED_STATUS);
}
