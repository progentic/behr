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
    const session = await auth.resolveSession(context.req.raw.headers);
    if (!session) {
      return createUnauthenticatedResponse();
    }
    context.set("authenticatedSession", session);
    await next();
  };
}

function createUnauthenticatedResponse(): Response {
  const body: SessionResponse = { status: "unauthenticated" };
  return createJsonResponse(body, UNAUTHORIZED_STATUS);
}
