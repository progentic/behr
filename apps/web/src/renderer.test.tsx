import type { PageDocument } from "@bher/contracts";
import { renderToStaticMarkup } from "react-dom/server";

import { PageRenderer } from "./renderer";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  not: { toContain(expected: string): void };
  toBe(expected: unknown): void;
  toBeLessThan(expected: number): void;
  toContain(expected: string): void;
};

const SECTION_A = "11111111-1111-4111-8111-111111111111";
const SECTION_B = "22222222-2222-4222-8222-222222222222";

test("renders empty canonical content deterministically", () => {
  const document: PageDocument = { schemaVersion: 1, sections: [] };
  expect(renderDocument(document)).toBe("");
  expect(renderDocument(document)).toBe(renderDocument(document));
});

test("preserves section, block, and heading-level order", () => {
  const document: PageDocument = {
    schemaVersion: 1,
    sections: [
      {
        id: SECTION_A,
        style: { spacing: "sm", width: "narrow" },
        blocks: [1, 2, 3, 4, 5, 6].map((level, index) => ({
          id: `0000000${index + 1}-0000-4000-8000-00000000000${index + 1}`,
          type: "heading" as const,
          level: level as 1 | 2 | 3 | 4 | 5 | 6,
          text: `Heading ${level}`,
          style: { align: "center" as const },
        })),
      },
      {
        id: SECTION_B,
        blocks: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            type: "paragraph",
            text: "Final paragraph",
            style: { align: "right" },
          },
        ],
      },
    ],
  };
  const markup = renderDocument(document);
  expect(markup).toContain(
    '<section class="section-spacing-sm section-width-narrow">',
  );
  expect(markup).toContain('<h1 class="text-align-center">Heading 1</h1>');
  expect(markup).toContain('<h6 class="text-align-center">Heading 6</h6>');
  expect(markup).toContain(
    '<p class="text-align-right">Final paragraph</p>',
  );
  expect(markup.indexOf("Heading 1")).toBeLessThan(
    markup.indexOf("Heading 6"),
  );
  expect(markup.indexOf("Heading 6")).toBeLessThan(
    markup.indexOf("Final paragraph"),
  );
  expect(renderDocument(document)).toBe(markup);
});

test("escapes HTML-like content as text", () => {
  const document: PageDocument = {
    schemaVersion: 1,
    sections: [
      {
        id: SECTION_A,
        blocks: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            type: "paragraph",
            text: '<script>alert("unsafe")</script>',
          },
        ],
      },
    ],
  };
  const markup = renderDocument(document);
  expect(markup).not.toContain("<script>");
  expect(markup).toContain("&lt;script&gt;");
});

function renderDocument(document: PageDocument): string {
  return renderToStaticMarkup(<PageRenderer document={document} />);
}
