import {
  createPageRequestSchema,
  pageDocumentSchema,
  pageSlugSchema,
  pageTitleSchema,
  publicPageResponseSchema,
  savePageDraftRequestSchema,
} from "./page";
import { DEFAULT_THEME_TOKENS } from "./theme";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const SECTION_ID = "11111111-1111-4111-8111-111111111111";
const HEADING_ID = "22222222-2222-4222-8222-222222222222";
const PARAGRAPH_ID = "33333333-3333-4333-8333-333333333333";
const IMAGE_ID = "44444444-4444-4444-8444-444444444444";
const ASSET_ID = "55555555-5555-4555-8555-555555555555";

const canonicalDocument = {
  schemaVersion: 1,
  sections: [
    {
      id: SECTION_ID,
      style: { spacing: "lg", width: "wide" },
      blocks: [
        {
          id: HEADING_ID,
          type: "heading",
          level: 2,
          text: "Canonical heading",
          style: { align: "center" },
        },
        {
          id: PARAGRAPH_ID,
          type: "paragraph",
          text: "Canonical paragraph",
          style: { align: "left" },
        },
      ],
    },
  ],
} as const;

test("parses a representative canonical document", () => {
  expect(pageDocumentSchema.parse(canonicalDocument)).toEqual(
    canonicalDocument,
  );
});

test("accepts one strict canonical image block", () => {
  const imageDocument = {
    schemaVersion: 1,
    sections: [
      {
        id: SECTION_ID,
        blocks: [
          { id: IMAGE_ID, type: "image", assetId: ASSET_ID, alt: "" },
        ],
      },
    ],
  } as const;
  expect(pageDocumentSchema.parse(imageDocument)).toEqual(imageDocument);
  expect(
    pageDocumentSchema.safeParse({
      ...imageDocument,
      sections: [
        {
          id: SECTION_ID,
          blocks: [
            {
              id: IMAGE_ID,
              type: "image",
              assetId: ASSET_ID,
              alt: "Image",
              url: "/public/assets/unsafe",
            },
          ],
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    pageDocumentSchema.safeParse({
      schemaVersion: 1,
      sections: [
        { id: SECTION_ID, blocks: [{ id: IMAGE_ID, type: "image", assetId: ASSET_ID }] },
      ],
    }).success,
  ).toBe(false);
  expect(
    pageDocumentSchema.safeParse({
      schemaVersion: 1,
      sections: [
        { id: SECTION_ID, blocks: [{ id: IMAGE_ID, type: "image", assetId: "invalid", alt: "" }] },
      ],
    }).success,
  ).toBe(false);
});

test("rejects unsupported blocks and invalid structure", () => {
  expect(
    pageDocumentSchema.safeParse({
      schemaVersion: 1,
      sections: [
        {
          id: SECTION_ID,
          blocks: [{ id: HEADING_ID, type: "video", text: "unsupported" }],
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    pageDocumentSchema.safeParse({
      ...canonicalDocument,
      sections: [
        {
          ...canonicalDocument.sections[0],
          style: { spacing: "xl", width: "wide" },
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    pageDocumentSchema.safeParse({
      ...canonicalDocument,
      publicationState: "draft",
    }).success,
  ).toBe(false);
});

test("preserves the canonical document through a JSON round trip", () => {
  const parsed = pageDocumentSchema.parse(canonicalDocument);
  const roundTripped: unknown = JSON.parse(JSON.stringify(parsed));
  expect(pageDocumentSchema.parse(roundTripped)).toEqual(parsed);
});

test("normalizes strict page metadata and persistence requests", () => {
  expect(pageTitleSchema.parse("  About Us  ")).toBe("About Us");
  expect(pageTitleSchema.safeParse(" ").success).toBe(false);
  expect(pageTitleSchema.safeParse("a".repeat(200)).success).toBe(true);
  expect(pageTitleSchema.safeParse("a".repeat(201)).success).toBe(false);
  expect(pageSlugSchema.parse("")).toBe("");
  expect(pageSlugSchema.parse("  About-US  ")).toBe("about-us");
  expect(pageSlugSchema.safeParse("a".repeat(200)).success).toBe(true);
  expect(pageSlugSchema.safeParse("a".repeat(201)).success).toBe(false);
  expect(pageSlugSchema.safeParse("/about").success).toBe(false);
  expect(pageSlugSchema.safeParse("about/team").success).toBe(false);
  expect(pageSlugSchema.safeParse("about us").success).toBe(false);

  expect(
    createPageRequestSchema.parse({
      title: "  About  ",
      slug: "ABOUT-US",
      document: canonicalDocument,
    }),
  ).toEqual({
    title: "About",
    slug: "about-us",
    document: canonicalDocument,
  });
  expect(
    createPageRequestSchema.safeParse({
      title: "About",
      slug: "about",
      document: canonicalDocument,
      published: true,
    }).success,
  ).toBe(false);
  expect(
    savePageDraftRequestSchema.safeParse({
      document: canonicalDocument,
      pageId: SECTION_ID,
    }).success,
  ).toBe(false);
  expect(
    createPageRequestSchema.safeParse({
      title: "Invalid",
      slug: "invalid",
      document: {
        schemaVersion: 1,
        sections: [{ id: SECTION_ID, blocks: [{ type: "image" }] }],
      },
    }).success,
  ).toBe(false);
});

test("exposes only canonical public page fields", () => {
  expect(
    publicPageResponseSchema.parse({
      title: "About",
      slug: "about",
      document: canonicalDocument,
      theme: DEFAULT_THEME_TOKENS,
    }),
  ).toEqual({
    title: "About",
    slug: "about",
    document: canonicalDocument,
    theme: DEFAULT_THEME_TOKENS,
  });
  expect(
    publicPageResponseSchema.safeParse({
      title: "About",
      slug: "about",
      document: canonicalDocument,
      theme: DEFAULT_THEME_TOKENS,
      publishedVersionId: SECTION_ID,
    }).success,
  ).toBe(false);
});
