import {
  type AssetListItem,
  type Block,
  type HeadingBlock,
  type PageDocument,
  type PageDraft,
  type SavePageDraftRequest,
  type Section,
  type TextAlignToken,
  assetListResponseSchema,
  pageDocumentSchema,
  pageDraftSchema,
  savePageDraftRequestSchema,
} from "@bher/contracts";
import {
  addHeadingBlock,
  addImageBlock,
  addParagraphBlock,
  addSection,
  removeBlock,
  removeSection,
  updateBlockText,
  updateHeadingLevel,
  updateImageAlt,
  updateTextAlignment,
} from "@bher/editor";
import { useEffect, useRef, useState } from "react";

import { requestApi } from "./lib/api";

const INVALID_DOCUMENT_MESSAGE =
  "The page contains invalid content and cannot be saved.";
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export type EditorIdentity = Readonly<{
  tenantId: string;
  siteId: string;
  pageId: string;
  requestEpoch: number;
}>;

type SaveState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "saving";
      operationId: number;
      submittedRevision: number;
    }>
  | Readonly<{ status: "saved" }>
  | Readonly<{ status: "error"; message: string }>;

export type SiteAssetState =
  | Readonly<{ status: "loading"; tenantId: string; siteId: string }>
  | Readonly<{ status: "error"; tenantId: string; siteId: string }>
  | Readonly<{
      status: "loaded";
      tenantId: string;
      siteId: string;
      assets: AssetListItem[];
    }>;

export type PageEditorState =
  | Readonly<{ status: "loading"; identity: EditorIdentity }>
  | Readonly<{ status: "error"; identity: EditorIdentity }>
  | Readonly<{
      status: "loaded";
      identity: EditorIdentity;
      page: PageDraft["page"];
      document: PageDocument;
      revision: number;
      save: SaveState;
    }>;

export type EditorSaveOperation = Readonly<{
  operationId: number;
  identity: EditorIdentity;
  submittedDocument: PageDocument;
  submittedRevision: number;
}>;

type PageEditorProperties = Readonly<{
  tenantId: string;
  siteId: string;
  pageId: string;
}>;

type DocumentTransform = (document: PageDocument) => PageDocument;

export function PageEditor({
  tenantId,
  siteId,
  pageId,
}: PageEditorProperties) {
  const loadEpoch = useRef(0);
  const saveOperation = useRef(0);
  const [state, setState] = useState<PageEditorState>({
    status: "loading",
    identity: { tenantId, siteId, pageId, requestEpoch: 0 },
  });
  const [assetState, setAssetState] = useState<SiteAssetState>({
    status: "loading",
    tenantId,
    siteId,
  });

  useEffect(() => {
    const identity: EditorIdentity = {
      tenantId,
      siteId,
      pageId,
      requestEpoch: ++loadEpoch.current,
    };
    let active = true;
    setState({ status: "loading", identity });
    void requestPageDraft(tenantId, siteId, pageId)
      .then((draft) => {
        if (active) {
          setState((current) => applyDraftLoad(current, identity, draft));
        }
      })
      .catch(() => {
        if (active) {
          setState((current) => applyDraftLoadError(current, identity));
        }
      });
    return () => {
      active = false;
    };
  }, [tenantId, siteId, pageId]);

  useEffect(() => {
    let active = true;
    setAssetState({ status: "loading", tenantId, siteId });
    void requestSiteAssets(tenantId, siteId)
      .then((assets) => {
        if (active) {
          setAssetState((current) =>
            applySiteAssetLoad(current, tenantId, siteId, assets),
          );
        }
      })
      .catch(() => {
        if (active) {
          setAssetState((current) =>
            applySiteAssetLoadError(current, tenantId, siteId),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [tenantId, siteId]);

  if (!matchesResourceIdentity(state.identity, { tenantId, siteId, pageId })) {
    return <p role="status">Loading page…</p>;
  }
  if (state.status === "loading") {
    return <p role="status">Loading page…</p>;
  }
  if (state.status === "error") {
    return <p role="alert">The page draft could not be loaded.</p>;
  }

  const loadedState = state;
  const visibleAssets = matchesSiteAssetState(assetState, tenantId, siteId)
    ? assetState
    : { status: "loading" as const, tenantId, siteId };
  const assets = visibleAssets.status === "loaded" ? visibleAssets.assets : [];

  function transformDocument(transform: DocumentTransform): void {
    setState((current) => applyDocumentEdit(current, transform));
  }

  async function saveDraft(): Promise<void> {
    const request = prepareDraftSave(loadedState.document);
    if (!request) {
      setState((current) => applySaveValidationError(current));
      return;
    }
    const operation = createEditorSaveOperation(
      loadedState,
      ++saveOperation.current,
    );
    if (!operation) {
      return;
    }
    setState(operation.state);
    try {
      await requestDraftSave(
        tenantId,
        siteId,
        pageId,
        request,
      );
      setState((current) => applySaveSuccess(current, operation.operation));
    } catch {
      setState((current) => applySaveError(current, operation.operation));
    }
  }

  return (
    <section aria-labelledby="page-editor-title">
      <h3 id="page-editor-title">Edit {loadedState.page.title}</h3>
      <p>
        Path: <code>/{loadedState.page.slug}</code>
      </p>
      {loadedState.document.sections.map((section) => (
        <SectionEditor
          key={section.id}
          section={section}
          assets={assets}
          transformDocument={transformDocument}
        />
      ))}
      {visibleAssets.status === "loading" ? (
        <p role="status">Loading site assets…</p>
      ) : null}
      {visibleAssets.status === "error" ? (
        <p role="alert">Site assets could not be loaded.</p>
      ) : null}
      <button
        type="button"
        onClick={() =>
          transformDocument((document) =>
            addSection(document, crypto.randomUUID()),
          )
        }
      >
        Add section
      </button>
      {loadedState.save.status === "error" ? (
        <p role="alert">{loadedState.save.message}</p>
      ) : null}
      {loadedState.save.status === "saved" ? (
        <p role="status">Draft saved.</p>
      ) : null}
      <button
        type="button"
        disabled={loadedState.save.status === "saving"}
        onClick={() => void saveDraft()}
      >
        {loadedState.save.status === "saving" ? "Saving…" : "Save draft"}
      </button>
    </section>
  );
}

function SectionEditor({
  section,
  assets,
  transformDocument,
}: Readonly<{
  section: Section;
  assets: AssetListItem[];
  transformDocument: (transform: DocumentTransform) => void;
}>) {
  return (
    <fieldset>
      <legend>Section</legend>
      <button
        type="button"
        onClick={() =>
          transformDocument((document) => removeSection(document, section.id))
        }
      >
        Remove section
      </button>
      {section.blocks.map((block) => (
        <BlockEditor
          key={block.id}
          block={block}
          assets={assets}
          sectionId={section.id}
          transformDocument={transformDocument}
        />
      ))}
      <button
        type="button"
        onClick={() =>
          transformDocument((document) =>
            addHeadingBlock(document, section.id, crypto.randomUUID()),
          )
        }
      >
        Add heading
      </button>
      <button
        type="button"
        onClick={() =>
          transformDocument((document) =>
            addParagraphBlock(document, section.id, crypto.randomUUID()),
          )
        }
      >
        Add paragraph
      </button>
      {assets.length > 0 ? (
        <>
          <label htmlFor={`section-${section.id}-asset`}>Add image</label>
          <select
            id={`section-${section.id}-asset`}
            value=""
            onChange={(event) => {
              const assetId = event.currentTarget.value;
              if (assetId.length > 0) {
                transformDocument((document) =>
                  addImageBlock(
                    document,
                    section.id,
                    crypto.randomUUID(),
                    assetId,
                  ),
                );
              }
            }}
          >
            <option value="">Select an asset…</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.originalFilename}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </fieldset>
  );
}

function BlockEditor({
  block,
  assets,
  sectionId,
  transformDocument,
}: Readonly<{
  block: Block;
  assets: AssetListItem[];
  sectionId: string;
  transformDocument: (transform: DocumentTransform) => void;
}>) {
  if (block.type === "image") {
    return (
      <ImageBlockEditor
        block={block}
        sectionId={sectionId}
        asset={assets.find(({ id }) => id === block.assetId)}
        transformDocument={transformDocument}
      />
    );
  }
  const inputId = `block-${block.id}`;
  return (
    <div>
      <label htmlFor={inputId}>
        {block.type === "heading" ? "Heading" : "Paragraph"}
      </label>
      {block.type === "heading" ? (
        <input
          id={inputId}
          value={block.text}
          onChange={(event) =>
            transformDocument((document) =>
              updateBlockText(
                document,
                sectionId,
                block.id,
                event.currentTarget.value,
              ),
            )
          }
        />
      ) : (
        <textarea
          id={inputId}
          value={block.text}
          onChange={(event) =>
            transformDocument((document) =>
              updateBlockText(
                document,
                sectionId,
                block.id,
                event.currentTarget.value,
              ),
            )
          }
        />
      )}
      {block.type === "heading" ? (
        <>
          <label htmlFor={`${inputId}-level`}>Level</label>
          <select
            id={`${inputId}-level`}
            value={block.level}
            onChange={(event) => {
              const level = readHeadingLevel(event.currentTarget.value);
              transformDocument((document) =>
                updateHeadingLevel(document, sectionId, block.id, level),
              );
            }}
          >
            {HEADING_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <label htmlFor={`${inputId}-alignment`}>Alignment</label>
      <select
        id={`${inputId}-alignment`}
        value={block.style?.align ?? ""}
        onChange={(event) => {
          const alignment = readTextAlignment(event.currentTarget.value);
          transformDocument((document) =>
            updateTextAlignment(document, sectionId, block.id, alignment),
          );
        }}
      >
        <option value="">Default</option>
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
      <button
        type="button"
        onClick={() =>
          transformDocument((document) =>
            removeBlock(document, sectionId, block.id),
          )
        }
      >
        Remove block
      </button>
    </div>
  );
}

function ImageBlockEditor({
  block,
  sectionId,
  asset,
  transformDocument,
}: Readonly<{
  block: Extract<Block, { type: "image" }>;
  sectionId: string;
  asset: AssetListItem | undefined;
  transformDocument: (transform: DocumentTransform) => void;
}>) {
  const inputId = `block-${block.id}-alt`;
  return (
    <div>
      <p>Image: {asset?.originalFilename ?? block.assetId}</p>
      <label htmlFor={inputId}>Alternative text</label>
      <input
        id={inputId}
        value={block.alt}
        onChange={(event) =>
          transformDocument((document) =>
            updateImageAlt(
              document,
              sectionId,
              block.id,
              event.currentTarget.value,
            ),
          )
        }
      />
      <button
        type="button"
        onClick={() =>
          transformDocument((document) =>
            removeBlock(document, sectionId, block.id),
          )
        }
      >
        Remove block
      </button>
    </div>
  );
}

export function applyDraftLoad(
  state: PageEditorState,
  identity: EditorIdentity,
  draft: PageDraft,
): PageEditorState {
  if (
    state.status !== "loading" ||
    !matchesEditorIdentity(state.identity, identity) ||
    draft.page.id !== identity.pageId
  ) {
    return state;
  }
  return {
    status: "loaded",
    identity,
    page: draft.page,
    document: draft.draft.document,
    revision: 0,
    save: { status: "idle" },
  };
}

export function applyDocumentEdit(
  state: PageEditorState,
  transform: DocumentTransform,
): PageEditorState {
  if (state.status !== "loaded") {
    return state;
  }
  const document = transform(state.document);
  if (document === state.document) {
    return state;
  }
  return {
    ...state,
    document,
    revision: state.revision + 1,
    save: state.save.status === "saving" ? state.save : { status: "idle" },
  };
}

export function createEditorSaveOperation(
  state: PageEditorState,
  operationId: number,
): Readonly<{
  state: PageEditorState;
  operation: EditorSaveOperation;
}> | null {
  if (state.status !== "loaded" || state.save.status === "saving") {
    return null;
  }
  const operation: EditorSaveOperation = {
    operationId,
    identity: state.identity,
    submittedDocument: state.document,
    submittedRevision: state.revision,
  };
  return {
    operation,
    state: {
      ...state,
      save: {
        status: "saving",
        operationId,
        submittedRevision: state.revision,
      },
    },
  };
}

export function applySaveSuccess(
  state: PageEditorState,
  operation: EditorSaveOperation,
): PageEditorState {
  if (!matchesSaveOperation(state, operation)) {
    return state;
  }
  return {
    ...state,
    save:
      state.revision === operation.submittedRevision
        ? { status: "saved" }
        : { status: "idle" },
  };
}

export function applySaveError(
  state: PageEditorState,
  operation: EditorSaveOperation,
): PageEditorState {
  if (!matchesSaveOperation(state, operation)) {
    return state;
  }
  return {
    ...state,
    save: { status: "error", message: "The draft could not be saved." },
  };
}

export function prepareDraftSave(
  document: PageDocument,
): SavePageDraftRequest | null {
  const canonical = pageDocumentSchema.safeParse(document);
  if (!canonical.success) {
    return null;
  }
  const request = savePageDraftRequestSchema.safeParse({
    document: canonical.data,
  });
  return request.success ? request.data : null;
}

export async function requestPageDraft(
  tenantId: string,
  siteId: string,
  pageId: string,
): Promise<PageDraft> {
  const response = await requestApi(
    `/tenants/${tenantId}/sites/${siteId}/pages/${pageId}`,
  );
  if (!response.ok) {
    throw new Error("Page draft loading failed.");
  }
  const draft = pageDraftSchema.parse(await response.json());
  if (draft.page.id !== pageId) {
    throw new Error("Page draft identity did not match the request.");
  }
  return draft;
}

export async function requestSiteAssets(
  tenantId: string,
  siteId: string,
): Promise<AssetListItem[]> {
  const response = await requestApi(
    `/tenants/${tenantId}/sites/${siteId}/assets`,
  );
  if (!response.ok) {
    throw new Error("Site asset loading failed.");
  }
  return assetListResponseSchema.parse(await response.json()).assets;
}

export async function requestDraftSave(
  tenantId: string,
  siteId: string,
  pageId: string,
  request: SavePageDraftRequest,
): Promise<PageDraft> {
  const response = await requestApi(
    `/tenants/${tenantId}/sites/${siteId}/pages/${pageId}/versions`,
    { method: "POST", body: JSON.stringify(request) },
  );
  if (!response.ok) {
    throw new Error("Page draft saving failed.");
  }
  const draft = pageDraftSchema.parse(await response.json());
  if (draft.page.id !== pageId) {
    throw new Error("Saved draft identity did not match the request.");
  }
  return draft;
}

function applyDraftLoadError(
  state: PageEditorState,
  identity: EditorIdentity,
): PageEditorState {
  return state.status === "loading" && matchesEditorIdentity(state.identity, identity)
    ? { status: "error", identity }
    : state;
}

export function applySiteAssetLoad(
  state: SiteAssetState,
  tenantId: string,
  siteId: string,
  assets: AssetListItem[],
): SiteAssetState {
  return state.status === "loading" &&
    state.tenantId === tenantId &&
    state.siteId === siteId
    ? { status: "loaded", tenantId, siteId, assets }
    : state;
}

function applySiteAssetLoadError(
  state: SiteAssetState,
  tenantId: string,
  siteId: string,
): SiteAssetState {
  return state.status === "loading" &&
    state.tenantId === tenantId &&
    state.siteId === siteId
    ? { status: "error", tenantId, siteId }
    : state;
}

function matchesSiteAssetState(
  state: SiteAssetState,
  tenantId: string,
  siteId: string,
): boolean {
  return state.tenantId === tenantId && state.siteId === siteId;
}

export function applySaveValidationError(
  state: PageEditorState,
): PageEditorState {
  return state.status === "loaded" && state.save.status !== "saving"
    ? {
        ...state,
        save: { status: "error", message: INVALID_DOCUMENT_MESSAGE },
      }
    : state;
}

function matchesSaveOperation(
  state: PageEditorState,
  operation: EditorSaveOperation,
): state is Extract<PageEditorState, { status: "loaded" }> {
  return (
    state.status === "loaded" &&
    matchesEditorIdentity(state.identity, operation.identity) &&
    state.save.status === "saving" &&
    state.save.operationId === operation.operationId
  );
}

function matchesEditorIdentity(
  left: EditorIdentity,
  right: EditorIdentity,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.siteId === right.siteId &&
    left.pageId === right.pageId &&
    left.requestEpoch === right.requestEpoch
  );
}

function matchesResourceIdentity(
  identity: EditorIdentity,
  resource: Pick<EditorIdentity, "tenantId" | "siteId" | "pageId">,
): boolean {
  return (
    identity.tenantId === resource.tenantId &&
    identity.siteId === resource.siteId &&
    identity.pageId === resource.pageId
  );
}

function readHeadingLevel(value: string): HeadingBlock["level"] {
  const level = Number(value);
  return HEADING_LEVELS.includes(level as HeadingBlock["level"])
    ? (level as HeadingBlock["level"])
    : 2;
}

function readTextAlignment(value: string): TextAlignToken | undefined {
  return value === "left" || value === "center" || value === "right"
    ? value
    : undefined;
}
