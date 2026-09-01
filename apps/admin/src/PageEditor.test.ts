import type { AssetListItem, PageDocument, PageDraft } from "@bher/contracts";
import { addImageBlock, moveBlock, updateBlockText } from "@bher/editor";

import {
  type EditorIdentity,
  type PageEditorState,
  type SiteAssetState,
  applySiteAssetLoad,
  applyDocumentEdit,
  applyDraftLoad,
  applySaveError,
  applySaveSuccess,
  applySaveValidationError,
  createEditorSaveOperation,
  prepareDraftSave,
  requestDraftSave,
  requestPageDraft,
  requestSiteAssets,
} from "./PageEditor";

declare function test(name: string, body: () => void | Promise<void>): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const TENANT = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const PAGE_A = "33333333-3333-4333-8333-333333333333";
const PAGE_B = "44444444-4444-4444-8444-444444444444";
const SECTION = "55555555-5555-4555-8555-555555555555";
const PARAGRAPH = "66666666-6666-4666-8666-666666666666";
const HEADING = "77777777-7777-4777-8777-777777777777";
const ASSET = "88888888-8888-4888-8888-888888888888";
const IMAGE = "99999999-9999-4999-8999-999999999999";

test("rejects late and same-page re-entry draft loads", () => {
  const a1 = identity(PAGE_A, 1);
  const a2 = identity(PAGE_A, 2);
  const b = identity(PAGE_B, 1);
  const currentB: PageEditorState = { status: "loading", identity: b };
  expect(applyDraftLoad(currentB, a1, draft(PAGE_A, document("A1")))).toBe(
    currentB,
  );
  const currentA2: PageEditorState = { status: "loading", identity: a2 };
  expect(applyDraftLoad(currentA2, a1, draft(PAGE_A, document("A1")))).toBe(
    currentA2,
  );
  expect(
    applyDraftLoad(currentA2, a2, draft(PAGE_A, document("A2"))),
  ).toEqual({
    status: "loaded",
    identity: a2,
    page: draft(PAGE_A, document("A2")).page,
    document: document("A2"),
    revision: 0,
    save: { status: "idle" },
    fieldErrors: {},
    formError: null,
  });
});

test("preserves newer edits when an older save completes", () => {
  const loaded = loadedState(PAGE_A, 1, document("Revision 1"));
  const started = createEditorSaveOperation(loaded, 10);
  if (!started) {
    throw new Error("Expected save operation.");
  }
  const edited = applyDocumentEdit(started.state, (current) =>
    updateBlockText(current, SECTION, PARAGRAPH, "Revision 2"),
  );
  const completed = applySaveSuccess(edited, started.operation);
  expect(completed.status).toBe("loaded");
  if (completed.status === "loaded") {
    const paragraph = completed.document.sections[0]?.blocks[0];
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      expect(paragraph.text).toBe("Revision 2");
    }
    expect(completed.save).toEqual({ status: "idle" });
  }
  expect(createEditorSaveOperation(started.state, 11)).toBe(null);
});

test("rejects late save completion for another page or epoch", () => {
  const started = createEditorSaveOperation(
    loadedState(PAGE_A, 1, document("A")),
    20,
  );
  if (!started) {
    throw new Error("Expected save operation.");
  }
  const currentB = loadedState(PAGE_B, 1, document("B"));
  expect(applySaveSuccess(currentB, started.operation)).toBe(currentB);
  const currentA2 = loadedState(PAGE_A, 2, document("A2"));
  expect(applySaveError(currentA2, started.operation)).toBe(currentA2);
});

test("blocks invalid documents while preserving local content", () => {
  const invalidDocument = document("");
  const preparation = prepareDraftSave(invalidDocument);
  expect(preparation).toEqual({
    request: null,
    fieldErrors: { [PARAGRAPH]: "Paragraph text is required." },
    formError: "Fix the highlighted page content before saving.",
  });
  const invalidState = loadedState(PAGE_A, 1, invalidDocument);
  const rejected = applySaveValidationError(invalidState, preparation);
  expect(rejected.status).toBe("loaded");
  if (rejected.status === "loaded") {
    expect(rejected.document).toBe(invalidDocument);
    expect(rejected.save).toEqual({ status: "idle" });
    expect(rejected.fieldErrors).toEqual({
      [PARAGRAPH]: "Paragraph text is required.",
    });
    expect(rejected.formError).toBe(
      "Fix the highlighted page content before saving.",
    );
  }
});

test("maps text validation and keeps empty image alt valid", () => {
  const invalidText = textAndImageDocument("", "", "");
  expect(prepareDraftSave(invalidText)).toEqual({
    request: null,
    fieldErrors: {
      [HEADING]: "Heading text is required.",
      [PARAGRAPH]: "Paragraph text is required.",
    },
    formError: "Fix the highlighted page content before saving.",
  });
  const validDecorativeImage = textAndImageDocument("Heading", "Paragraph", "");
  const validPreparation = prepareDraftSave(validDecorativeImage);
  expect(validPreparation.fieldErrors).toEqual({});
  expect(validPreparation.formError).toBe(null);
  expect(validPreparation.request?.document).toEqual(validDecorativeImage);

  const unmapped = {
    ...validDecorativeImage,
    schemaVersion: 2 as 1,
  };
  expect(prepareDraftSave(unmapped)).toEqual({
    request: null,
    fieldErrors: {},
    formError: "The page contains invalid content and cannot be saved.",
  });
});

test("clears an edited block error and keeps reordered save order", () => {
  const invalidDocument = textAndImageDocument("Heading", "", "");
  const invalid = loadedState(
    PAGE_A,
    1,
    invalidDocument,
  );
  const rejected = applySaveValidationError(
    invalid,
    prepareDraftSave(invalidDocument),
  );
  const corrected = applyDocumentEdit(
    rejected,
    (current) => updateBlockText(current, SECTION, PARAGRAPH, "Corrected"),
    PARAGRAPH,
  );
  expect(corrected.status).toBe("loaded");
  if (corrected.status === "loaded") {
    expect(corrected.fieldErrors).toEqual({});
    expect(corrected.formError).toBe(null);
  }

  const original = textAndImageDocument("Heading", "Paragraph", "");
  const reordered = moveBlock(original, SECTION, IMAGE, 0);
  const preparation = prepareDraftSave(reordered);
  expect(
    preparation.request?.document.sections[0]?.blocks.map(({ id }) => id),
  ).toEqual([IMAGE, HEADING, PARAGRAPH]);
});

test("uses existing draft load and immutable save request boundaries", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const responseDraft = draft(PAGE_A, document("Persisted"));
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return Response.json(responseDraft);
  };
  try {
    expect(await requestPageDraft(TENANT, SITE, PAGE_A)).toEqual(responseDraft);
    const preparation = prepareDraftSave(responseDraft.draft.document);
    if (!preparation.request) {
      throw new Error("Expected valid save request.");
    }
    expect(
      await requestDraftSave(
        TENANT,
        SITE,
        PAGE_A,
        preparation.request,
      ),
    ).toEqual(responseDraft);
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(requests.map(({ url }) => url)).toEqual([
    `/tenants/${TENANT}/sites/${SITE}/pages/${PAGE_A}`,
    `/tenants/${TENANT}/sites/${SITE}/pages/${PAGE_A}/versions`,
  ]);
  expect(requests[0]?.init?.credentials).toBe("include");
  expect(requests[1]?.init?.credentials).toBe("include");
  expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
    document: responseDraft.draft.document,
  });
});

test("keeps asset-list results scoped to the initiating tenant and site", () => {
  const asset = assetRecord();
  const current: SiteAssetState = {
    status: "loading",
    tenantId: TENANT,
    siteId: SITE,
  };
  expect(applySiteAssetLoad(current, TENANT, SITE, [asset])).toEqual({
    status: "loaded",
    tenantId: TENANT,
    siteId: SITE,
    assets: [asset],
  });
  expect(
    applySiteAssetLoad(
      { ...current, siteId: "99999999-9999-4999-8999-999999999999" },
      TENANT,
      SITE,
      [asset],
    ),
  ).toEqual({
    status: "loading",
    tenantId: TENANT,
    siteId: "99999999-9999-4999-8999-999999999999",
  });
});

test("requests strict site assets and inserts the selected asset identity", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const asset = assetRecord();
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return Response.json({ assets: [asset] });
  };
  try {
    expect(await requestSiteAssets(TENANT, SITE)).toEqual([asset]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(requests[0]?.url).toBe(`/tenants/${TENANT}/sites/${SITE}/assets`);
  expect(requests[0]?.init?.credentials).toBe("include");
  const withImage = addImageBlock(
    { schemaVersion: 1, sections: [{ id: SECTION, blocks: [] }] },
    SECTION,
    "99999999-9999-4999-8999-999999999999",
    asset.id,
  );
  expect(withImage.sections[0]?.blocks[0]).toEqual({
    id: "99999999-9999-4999-8999-999999999999",
    type: "image",
    assetId: ASSET,
    alt: "",
  });
});

function identity(pageId: string, requestEpoch: number): EditorIdentity {
  return { tenantId: TENANT, siteId: SITE, pageId, requestEpoch };
}

function loadedState(
  pageId: string,
  requestEpoch: number,
  currentDocument: PageDocument,
): PageEditorState {
  return {
    status: "loaded",
    identity: identity(pageId, requestEpoch),
    page: draft(pageId, currentDocument).page,
    document: currentDocument,
    revision: 0,
    save: { status: "idle" },
    fieldErrors: {},
    formError: null,
  };
}

function draft(pageId: string, currentDocument: PageDocument): PageDraft {
  return {
    page: { id: pageId, title: "Page", slug: "page" },
    draft: {
      id: "77777777-7777-4777-8777-777777777777",
      document: currentDocument,
      createdAt: "2026-08-31T00:00:00.000Z",
    },
  };
}

function document(text: string): PageDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: SECTION,
        blocks: [{ id: PARAGRAPH, type: "paragraph", text }],
      },
    ],
  };
}

function textAndImageDocument(
  heading: string,
  paragraph: string,
  alt: string,
): PageDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: SECTION,
        blocks: [
          { id: HEADING, type: "heading", level: 2, text: heading },
          { id: PARAGRAPH, type: "paragraph", text: paragraph },
          { id: IMAGE, type: "image", assetId: ASSET, alt },
        ],
      },
    ],
  };
}

function assetRecord(): AssetListItem {
  return {
    id: ASSET,
    originalFilename: "photo.jpg",
    contentType: "image/jpeg",
    byteSize: 12,
    createdAt: "2026-08-31T12:00:00.000Z",
  };
}
