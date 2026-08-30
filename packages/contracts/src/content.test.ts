import { pageDocumentSchema } from "./page";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const SECTION_ID = "11111111-1111-4111-8111-111111111111";
const HEADING_ID = "22222222-2222-4222-8222-222222222222";
const PARAGRAPH_ID = "33333333-3333-4333-8333-333333333333";

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

test("rejects unsupported blocks and invalid structure", () => {
  expect(
    pageDocumentSchema.safeParse({
      schemaVersion: 1,
      sections: [
        {
          id: SECTION_ID,
          blocks: [{ id: HEADING_ID, type: "image", text: "unsupported" }],
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
