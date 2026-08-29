import { expect, test } from "bun:test";

import { type DevelopmentServer, startDevelopmentServer } from "./development";

const HTML_CONTENT_TYPE = "text/html";
const JAVASCRIPT_CONTENT_TYPE = "javascript";

test("serves the admin and API through one development listener", async () => {
  const port = await selectTestPort();
  const origin = `http://localhost:${port}`;
  const server = await startDevelopmentServer(
    createTestEnvironment(origin, port),
  );
  try {
    const document = await verifyAdminDocument(server);
    await verifyAdminAssets(server, document);
    await verifyHealthRoute(server);
    await verifyAuthRoutes(server, origin);
    await verifyUnknownRoute(server);
  } finally {
    await server.close();
  }
  await verifyPortWasReleased(server.port);
});

function createTestEnvironment(origin: string, port: number): NodeJS.ProcessEnv {
  return {
    ADMIN_ORIGIN: origin,
    API_PORT: String(port),
    BETTER_AUTH_SECRET: "development-test-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: origin,
    DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
    NODE_ENV: "development",
  };
}

async function verifyAdminDocument(server: DevelopmentServer): Promise<string> {
  const response = await fetch(`${server.origin}/`);
  const document = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain(HTML_CONTENT_TYPE);
  expect(document).toContain('<div id="root"></div>');
  return document;
}

async function verifyAdminAssets(
  server: DevelopmentServer,
  document: string,
): Promise<void> {
  const sources = readScriptSources(document);
  expect(sources.length).toBeGreaterThan(0);
  const responses = await Promise.all(
    sources.map((source) => fetch(new URL(source, server.origin))),
  );
  expect(responses.every(isJavaScriptResponse)).toBe(true);
}

async function verifyHealthRoute(server: DevelopmentServer): Promise<void> {
  const response = await fetch(`${server.origin}/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
}

async function verifyAuthRoutes(
  server: DevelopmentServer,
  origin: string,
): Promise<void> {
  const login = await fetch(`${server.origin}/auth/login`, {
    body: JSON.stringify({}),
    headers: { "content-type": "application/json", origin },
    method: "POST",
  });
  const session = await fetch(`${server.origin}/auth/session`);
  const logout = await fetch(`${server.origin}/auth/logout`, {
    headers: { origin },
    method: "POST",
  });
  expect(login.status).toBe(400);
  expect(session.status).toBe(401);
  expect(logout.status).toBe(401);
}

async function verifyUnknownRoute(server: DevelopmentServer): Promise<void> {
  const response = await fetch(`${server.origin}/api/unknown`);
  const body = await response.text();
  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).not.toContain(HTML_CONTENT_TYPE);
  expect(body).not.toContain("BeHR CMS — Admin");
}

async function verifyPortWasReleased(port: number): Promise<void> {
  const probe = Bun.serve({
    hostname: "localhost",
    port,
    fetch: () => new Response(null, { status: 204 }),
  });
  await probe.stop(true);
}

async function selectTestPort(): Promise<number> {
  const probe = Bun.serve({
    hostname: "localhost",
    port: 0,
    fetch: () => new Response(null, { status: 204 }),
  });
  try {
    return requireListenerPort(probe);
  } finally {
    await probe.stop(true);
  }
}

function requireListenerPort(listener: Bun.Server<undefined>): number {
  const { port } = listener;
  if (port === undefined) {
    throw new Error("Test listener did not bind a TCP port.");
  }
  return port;
}

function readScriptSources(document: string): string[] {
  return Array.from(
    document.matchAll(/<script[^>]+src="([^"]+)"/g),
    (match) => match[1] ?? "",
  ).filter(Boolean);
}

function isJavaScriptResponse(response: Response): boolean {
  return (
    response.status === 200 &&
    response.headers.get("content-type")?.includes(JAVASCRIPT_CONTENT_TYPE) ===
      true
  );
}
