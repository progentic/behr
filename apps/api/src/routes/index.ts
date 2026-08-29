import { Hono } from "hono";

import type { AuthService } from "../lib/auth";
import type { ApiBindings } from "../types";
import { createAuthRoutes } from "./auth";

export function createApiRoutes(auth: AuthService): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  routes.route("/auth", createAuthRoutes(auth));
  return routes;
}
