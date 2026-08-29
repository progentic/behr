import { expect, test } from "bun:test";

import { startDevelopmentServer } from "./development";

const HTML_CONTENT_TYPE = "text/html";
const JAVASCRIPT_CONTENT_TYPE = "javascript";

test("serves the admin and API through one development listener", async () => {
  const port = await selectTestPort();
  const origin = `http://localhost:${port}`;
  const server = await startDevelopmentServer({
    ADMIN_ORIGIN: origin,
    API_PORT: String(port),
    BETTER_AUTH_SECRET: "development-test-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: origin,
    DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
    NODE_ENV: "development",
  });
  try {
    const documentResponse = await fetch(`${server.origin}/`);
    const document = await documentResponse.text();
    expect(documentResponse.status).toBe(200);
    expect(documentResponse.headers.get("content-type")).toContain(
      HTML_CONTENT_TYPE,
    );
    expect(document).toContain('<div id="root"></div>');

    const sources = readScriptSources(document);
    expect(sources.length).toBeGreaterThan(0);
    const assetResponses = await Promise.all(
      sources.map((source) => fetch(new URL(source, server.origin))),
    );
    expect(
      assetResponses.every(
        (response) =>
          response.status === 200 &&
          response.headers
            .get("content-type")
            ?.includes(JAVASCRIPT_CONTENT_TYPE) === true,
      ),
    ).toBe(true);

    const healthResponse = await fetch(`${server.origin}/health`);
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ status: "ok" });

    const loginResponse = await fetch(`${server.origin}/auth/login`, {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json", origin },
      method: "POST",
    });
    const sessionResponse = await fetch(`${server.origin}/auth/session`);
    const logoutResponse = await fetch(`${server.origin}/auth/logout`, {
      headers: { origin },
      method: "POST",
    });
    expect(loginResponse.status).toBe(400);
    expect(sessionResponse.status).toBe(401);
    expect(logoutResponse.status).toBe(401);

    const unknownResponse = await fetch(`${server.origin}/api/unknown`);
    const unknownBody = await unknownResponse.text();
    expect(unknownResponse.status).toBe(404);
    expect(unknownResponse.headers.get("content-type")).not.toContain(
      HTML_CONTENT_TYPE,
    );
    expect(unknownBody).not.toContain("BeHR CMS — Admin");
  } finally {
    await server.close();
  }
  const probe = Bun.serve({
    hostname: "localhost",
    port: server.port,
    fetch: () => new Response(null, { status: 204 }),
  });
  await probe.stop(true);
});

async function selectTestPort(): Promise<number> {
  const probe = Bun.serve({
    hostname: "localhost",
    port: 0,
    fetch: () => new Response(null, { status: 204 }),
  });
  try {
    const { port } = probe;
    if (port === undefined) {
      throw new Error("Test listener did not bind a TCP port.");
    }
    return port;
  } finally {
    await probe.stop(true);
  }
}

function readScriptSources(document: string): string[] {
  return Array.from(
    document.matchAll(/<script[^>]+src="([^"]+)"/g),
    (match) => match[1] ?? "",
  ).filter(Boolean);
}
