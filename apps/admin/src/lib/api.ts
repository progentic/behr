const JSON_CONTENT_TYPE = "application/json";

export async function requestApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", JSON_CONTENT_TYPE);
  }
  return await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
}
