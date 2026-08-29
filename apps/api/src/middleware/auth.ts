import type { SessionResponse } from "@bher/contracts";
import type { MiddlewareHandler } from "hono";

import type { AuthService } from "../lib/auth";
import { createJsonResponse } from "../lib/http";
import type { ApiBindings } from "../types";

const UNAUTHORIZED_STATUS = 401;

export function createRequireAuthentication(
  auth: AuthService,
): MiddlewareHandler<ApiBindings> {
  return async (context, next) => {
    const user = await auth.resolveSession(context.req.raw.headers);
    if (!user) {
      return createUnauthenticatedResponse();
    }
    context.set("authenticatedUser", user);
    await next();
  };
}

function createUnauthenticatedResponse(): Response {
  const body: SessionResponse = { status: "unauthenticated" };
  return createJsonResponse(body, UNAUTHORIZED_STATUS);
}
