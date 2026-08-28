import { describe, expect, test } from "bun:test";

import { app } from "./index";

describe("GET /health", () => {
  test("reports that the API process is available", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
