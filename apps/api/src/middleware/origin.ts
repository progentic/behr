import type { AuthErrorResponse } from "@bher/contracts";
import type { MiddlewareHandler } from "hono";

import type { AuthService } from "../lib/auth";
import { createJsonResponse } from "../lib/http";
import type { ApiBindings } from "../types";

const FORBIDDEN_STATUS = 403;
const ORIGIN_HEADER = "origin";

export function createRequireTrustedOrigin(
  auth: AuthService,
): MiddlewareHandler<ApiBindings> {
  return async (context, next) => {
    const origin = context.req.header(ORIGIN_HEADER);
    if (!auth.isTrustedOrigin(origin)) {
      return createForbiddenOriginResponse();
    }
    await next();
  };
}

function createForbiddenOriginResponse(): Response {
  const body: AuthErrorResponse = { error: "Request origin is not trusted." };
  return createJsonResponse(body, FORBIDDEN_STATUS);
}
