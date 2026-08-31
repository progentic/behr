import type { PageDocument } from "@bher/contracts";
import { renderToStaticMarkup } from "react-dom/server";

import { PageRenderer, requestPreviewAsset } from "./renderer";

declare function test(name: string, body: () => void | Promise<void>): void;
declare function expect<T>(actual: T): {
  not: { toContain(expected: string): void };
  toBe(expected: unknown): void;
  toBeLessThan(expected: number): void;
  toContain(expected: string): void;
};

const SECTION_A = "11111111-1111-4111-8111-111111111111";
const SECTION_B = "22222222-2222-4222-8222-222222222222";
const IMAGE_ID = "55555555-5555-4555-8555-555555555555";
const ASSET_ID = "66666666-6666-4666-8666-666666666666";
const PREVIEW_TOKEN = "A".repeat(43);

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

test("renders image blocks through the explicit published or preview context", () => {
  const document: PageDocument = {
    schemaVersion: 1,
    sections: [
      {
        id: SECTION_A,
        blocks: [
          {
            id: IMAGE_ID,
            type: "image",
            assetId: ASSET_ID,
            alt: "Product photo",
          },
        ],
      },
    ],
  };
  const published = renderDocument(document);
  expect(published).toContain(`src="/public/assets/${ASSET_ID}"`);
  expect(published).toContain('alt="Product photo"');
  const preview = renderDocument(document, PREVIEW_TOKEN);
  expect(preview).not.toContain(`/public/assets/${ASSET_ID}`);
  expect(preview).not.toContain(PREVIEW_TOKEN);
  expect(preview).toContain('alt="Product photo"');
});

test("requests preview bytes with header-only credential transport", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/png" },
    });
  };
  try {
    expect((await requestPreviewAsset(ASSET_ID, PREVIEW_TOKEN)).size).toBe(3);
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(requests[0]?.url).toBe(`/preview/assets/${ASSET_ID}`);
  expect(requests[0]?.init?.credentials).toBe("omit");
  expect(new Headers(requests[0]?.init?.headers).get("x-behr-preview-token")).toBe(
    PREVIEW_TOKEN,
  );
  expect(requests[0]?.url).not.toContain(PREVIEW_TOKEN);
});

function renderDocument(
  document: PageDocument,
  previewToken: string | null = null,
): string {
  return renderToStaticMarkup(
    <PageRenderer document={document} previewToken={previewToken} />,
  );
}
