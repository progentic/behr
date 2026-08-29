const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const SET_COOKIE_HEADER = "set-cookie";

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function createJsonResponse(
  body: unknown,
  status: number,
  sourceHeaders?: Headers,
): Response {
  const headers = cloneHeaders(sourceHeaders);
  headers.set("content-type", JSON_CONTENT_TYPE);
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function cloneHeaders(sourceHeaders?: Headers): Headers {
  const headers = new Headers();
  if (!sourceHeaders) {
    return headers;
  }
  for (const [name, value] of sourceHeaders) {
    if (name !== SET_COOKIE_HEADER) {
      headers.append(name, value);
    }
  }
  for (const cookie of sourceHeaders.getSetCookie()) {
    headers.append(SET_COOKIE_HEADER, cookie);
  }
  return headers;
}
