const AUTH_API_BASE_PATH = "/api/auth";
const JSON_CONTENT_TYPE = "application/json";

export type AuthEndpoint = "/login" | "/logout" | "/session";

export async function requestAuthApi(
  endpoint: AuthEndpoint,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body) {
    headers.set("content-type", JSON_CONTENT_TYPE);
  }
  return await fetch(`${AUTH_API_BASE_PATH}${endpoint}`, {
    ...init,
    headers,
    credentials: "include",
  });
}
