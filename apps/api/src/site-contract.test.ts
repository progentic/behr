import { expect, test } from "bun:test";
import {
  createSiteRequestSchema,
  hostnameSchema,
  siteListResponseSchema,
  siteSettingsResponseSchema,
  updateSiteSettingsRequestSchema,
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

test("accepts strict bounded site settings contracts", () => {
  expect(
    updateSiteSettingsRequestSchema.parse({
      name: "  Marketing  ",
      theme: { colorScheme: "light", fontFamily: "sans" },
    }),
  ).toEqual({
    name: "Marketing",
    theme: { colorScheme: "light", fontFamily: "sans" },
  });
  expect(
    updateSiteSettingsRequestSchema.parse({
      name: "Editorial",
      theme: { colorScheme: "dark", fontFamily: "serif" },
    }),
  ).toEqual({
    name: "Editorial",
    theme: { colorScheme: "dark", fontFamily: "serif" },
  });
  expect(
    siteSettingsResponseSchema.parse({
      site: {
        id: SITE_ID,
        name: "Marketing",
        hostname: "www.example.com",
      },
      theme: { colorScheme: "dark", fontFamily: "serif" },
    }),
  ).toEqual({
    site: {
      id: SITE_ID,
      name: "Marketing",
      hostname: "www.example.com",
    },
    theme: { colorScheme: "dark", fontFamily: "serif" },
  });
});

test("rejects invalid or over-broad site settings contracts", () => {
  for (const request of [
    {
      name: " ",
      theme: { colorScheme: "light", fontFamily: "sans" },
    },
    {
      name: "a".repeat(201),
      theme: { colorScheme: "light", fontFamily: "sans" },
    },
    {
      name: "Site",
      theme: { colorScheme: "neon", fontFamily: "sans" },
    },
    {
      name: "Site",
      theme: { colorScheme: "dark", fontFamily: "comic" },
    },
    {
      name: "Site",
      hostname: "attacker.example.com",
      theme: { colorScheme: "dark", fontFamily: "serif" },
    },
    {
      name: "Site",
      theme: { colorScheme: "dark", fontFamily: "serif" },
      tenantId: SITE_ID,
    },
  ]) {
    expect(updateSiteSettingsRequestSchema.safeParse(request).success).toBe(
      false,
    );
  }

  const validResponse = {
    site: {
      id: SITE_ID,
      name: "Marketing",
      hostname: "www.example.com",
    },
    theme: { colorScheme: "dark", fontFamily: "serif" },
  };
  expect(
    siteSettingsResponseSchema.safeParse({ site: validResponse.site }).success,
  ).toBe(false);
  expect(
    siteSettingsResponseSchema.safeParse({
      ...validResponse,
      theme: { colorScheme: "neon", fontFamily: "serif" },
    }).success,
  ).toBe(false);
  expect(
    siteSettingsResponseSchema.safeParse({
      ...validResponse,
      tenantId: SITE_ID,
    }).success,
  ).toBe(false);
});
