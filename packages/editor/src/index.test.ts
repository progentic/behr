import { type PageDocument, pageDocumentSchema } from "@bher/contracts";

import {
  addHeadingBlock,
  addParagraphBlock,
  addSection,
  createEmptyPageDocument,
  removeBlock,
  removeSection,
  updateBlockText,
  updateHeadingLevel,
  updateTextAlignment,
} from "./index";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  not: { toBe(expected: unknown): void };
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const SECTION_A = "11111111-1111-4111-8111-111111111111";
const SECTION_B = "22222222-2222-4222-8222-222222222222";
const HEADING = "33333333-3333-4333-8333-333333333333";
const PARAGRAPH = "44444444-4444-4444-8444-444444444444";

test("creates a canonical empty document", () => {
  expect(pageDocumentSchema.parse(createEmptyPageDocument())).toEqual({
    schemaVersion: 1,
    sections: [],
  });
});

test("adds and removes sections without mutating input", () => {
  const original = createEmptyPageDocument();
  const withA = addSection(original, SECTION_A);
  const withB = addSection(withA, SECTION_B);
  expect(original.sections).toEqual([]);
  expect(withB.sections.map(({ id }) => id)).toEqual([SECTION_A, SECTION_B]);
  expect(withA).not.toBe(original);
  expect(removeSection(withB, SECTION_A).sections.map(({ id }) => id)).toEqual([
    SECTION_B,
  ]);
  expect(removeSection(original, SECTION_A)).toBe(original);
});

test("adds and removes canonical blocks in stored order", () => {
  const sectioned = addSection(createEmptyPageDocument(), SECTION_A);
  const withHeading = addHeadingBlock(sectioned, SECTION_A, HEADING);
  const withParagraph = addParagraphBlock(
    withHeading,
    SECTION_A,
    PARAGRAPH,
  );
  expect(withParagraph.sections[0]?.blocks).toEqual([
    { id: HEADING, type: "heading", level: 2, text: "New heading" },
    { id: PARAGRAPH, type: "paragraph", text: "New paragraph" },
  ]);
  expect(pageDocumentSchema.safeParse(withParagraph).success).toBe(true);
  expect(removeBlock(withParagraph, SECTION_A, HEADING).sections[0]?.blocks).toEqual([
    { id: PARAGRAPH, type: "paragraph", text: "New paragraph" },
  ]);
  expect(removeBlock(sectioned, SECTION_A, HEADING)).toBe(sectioned);
  expect(addHeadingBlock(sectioned, SECTION_B, HEADING)).toBe(sectioned);
});

test("edits properties and preserves styles immutably", () => {
  const initial = styledDocument();
  const headingText = updateBlockText(initial, SECTION_A, HEADING, "Updated heading");
  const paragraphText = updateBlockText(
    headingText,
    SECTION_A,
    PARAGRAPH,
    "Updated paragraph",
  );
  const headingLevel = updateHeadingLevel(
    paragraphText,
    SECTION_A,
    HEADING,
    4,
  );
  const aligned = updateTextAlignment(
    headingLevel,
    SECTION_A,
    PARAGRAPH,
    "right",
  );
  const cleared = updateTextAlignment(
    aligned,
    SECTION_A,
    PARAGRAPH,
    undefined,
  );

  expect(initial.sections[0]?.blocks[0]).toEqual({
    id: HEADING,
    type: "heading",
    level: 2,
    text: "Heading",
    style: { align: "center" },
  });
  expect(headingLevel.sections[0]?.blocks[0]).toEqual({
    id: HEADING,
    type: "heading",
    level: 4,
    text: "Updated heading",
    style: { align: "center" },
  });
  expect(aligned.sections[0]?.blocks[1]?.style).toEqual({ align: "right" });
  expect(cleared.sections[0]?.blocks[1]?.style).toBe(undefined);
  expect(cleared.sections[0]?.style).toEqual({ spacing: "lg", width: "wide" });
  expect(pageDocumentSchema.safeParse(cleared).success).toBe(true);
  expect(updateHeadingLevel(initial, SECTION_A, PARAGRAPH, 3)).toBe(initial);
  expect(updateBlockText(initial, SECTION_B, HEADING, "Missing")).toBe(initial);
});

test("allows temporarily invalid local text without weakening contracts", () => {
  const invalid = updateBlockText(styledDocument(), SECTION_A, HEADING, "");
  expect(invalid.sections[0]?.blocks[0]?.text).toBe("");
  expect(pageDocumentSchema.safeParse(invalid).success).toBe(false);
});

function styledDocument(): PageDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: SECTION_A,
        style: { spacing: "lg", width: "wide" },
        blocks: [
          {
            id: HEADING,
            type: "heading",
            level: 2,
            text: "Heading",
            style: { align: "center" },
          },
          { id: PARAGRAPH, type: "paragraph", text: "Paragraph" },
        ],
      },
    ],
  };
}
