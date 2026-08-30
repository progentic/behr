import { expect, test } from "bun:test";
import {
  createSiteRequestSchema,
  hostnameSchema,
  siteListResponseSchema,
} from "@bher/contracts";

const SITE_ID = "f9da3799-a9e0-44f2-b3c4-1f417a3b6fb1";

test("normalizes valid site input", () => {
  expect(
    createSiteRequestSchema.parse({
      name: "  Marketing  ",
      hostname: "  WWW.Example.COM  ",
    }),
  ).toEqual({ name: "Marketing", hostname: "www.example.com" });
  expect(
    siteListResponseSchema.parse({
      sites: [{ id: SITE_ID, name: "Marketing", hostname: "www.example.com" }],
    }),
  ).toEqual({
    sites: [{ id: SITE_ID, name: "Marketing", hostname: "www.example.com" }],
  });
});

test("rejects invalid site names and representative invalid hostnames", () => {
  expect(
    createSiteRequestSchema.safeParse({ name: " ", hostname: "a.com" }).success,
  ).toBe(false);
  expect(
    createSiteRequestSchema.safeParse({
      name: "a".repeat(201),
      hostname: "a.com",
    }).success,
  ).toBe(false);
  expect(
    createSiteRequestSchema.safeParse({
      name: "Site",
      hostname: "a.com",
      tenantId: SITE_ID,
    }).success,
  ).toBe(false);

  for (const hostname of [
    "https://example.com",
    "example.com/path",
    "example.com:443",
    "*.example.com",
    "-bad.example",
    "bad-.example",
    "bad..example",
    `${"a".repeat(64)}.example`,
  ]) {
    expect(hostnameSchema.safeParse(hostname).success).toBe(false);
  }
});
