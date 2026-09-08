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
  moveBlock,
  moveSection,
  removeBlock,
  removeSection,
  updateBlockText,
  updateHeadingLevel,
  updateImageAlt,
  updateTextAlignment,
} from "@bher/editor";
import type { DragEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { requestApi } from "./lib/api";

const INVALID_DOCUMENT_MESSAGE =
  "The page contains invalid content and cannot be saved.";
const FIX_DOCUMENT_MESSAGE =
  "Fix the highlighted page content before saving.";
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const DRAG_MARKER = "behr-editor-drag";

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
      fieldErrors: Readonly<Record<string, string>>;
      formError: string | null;
    }>;

export type EditorSaveOperation = Readonly<{
  operationId: number;
  identity: EditorIdentity;
  submittedDocument: PageDocument;
  submittedRevision: number;
}>;

export type DraftSavePreparation = Readonly<{
  request: SavePageDraftRequest | null;
  fieldErrors: Readonly<Record<string, string>>;
  formError: string | null;
}>;

type DraggedEditorItem =
  | Readonly<{ kind: "section"; sectionId: string }>
  | Readonly<{ kind: "block"; sectionId: string; blockId: string }>;

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
  const [draggedItem, setDraggedItem] = useState<DraggedEditorItem | null>(null);

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

  function transformDocument(
    transform: DocumentTransform,
    clearFieldError?: string,
  ): void {
    setState((current) =>
      applyDocumentEdit(current, transform, clearFieldError),
    );
  }

  async function saveDraft(): Promise<void> {
    const preparation = prepareDraftSave(loadedState.document);
    if (!preparation.request) {
      setState((current) =>
        applySaveValidationError(current, preparation),
      );
      const firstInvalidBlockId = Object.keys(preparation.fieldErrors)[0];
      if (firstInvalidBlockId) {
        document.getElementById(`block-${firstInvalidBlockId}`)?.focus();
      }
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
        preparation.request,
      );
      setState((current) => applySaveSuccess(current, operation.operation));
    } catch {
      setState((current) => applySaveError(current, operation.operation));
    }
  }

  return (
    <section className="editor-surface" aria-labelledby="page-editor-title">
      <h3 id="page-editor-title">Edit {loadedState.page.title}</h3>
      <p>
        Path: <code>/{loadedState.page.slug}</code>
      </p>
      {loadedState.document.sections.map((section, sectionIndex) => (
        <SectionEditor
          key={section.id}
          section={section}
          sectionIndex={sectionIndex}
          sectionCount={loadedState.document.sections.length}
          assets={assets}
          draggedItem={draggedItem}
          setDraggedItem={setDraggedItem}
          fieldErrors={loadedState.fieldErrors}
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
      {loadedState.formError ? (
        <p role="alert">{loadedState.formError}</p>
      ) : null}
      {loadedState.save.status === "saved" ? (
        <p className="status-success" role="status">
          Draft saved.
        </p>
      ) : null}
      <button
        className="button-primary"
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
  sectionIndex,
  sectionCount,
  assets,
  draggedItem,
  setDraggedItem,
  fieldErrors,
  transformDocument,
}: Readonly<{
  section: Section;
  sectionIndex: number;
  sectionCount: number;
  assets: AssetListItem[];
  draggedItem: DraggedEditorItem | null;
  setDraggedItem: (item: DraggedEditorItem | null) => void;
  fieldErrors: Readonly<Record<string, string>>;
  transformDocument: (
    transform: DocumentTransform,
    clearFieldError?: string,
  ) => void;
}>) {
  return (
    <fieldset
      className="editor-section"
      onDragOver={(event) => {
        if (draggedItem?.kind === "section") {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => {
        if (draggedItem?.kind !== "section") {
          return;
        }
        event.preventDefault();
        transformDocument((document) =>
          moveSection(document, draggedItem.sectionId, sectionIndex),
        );
        setDraggedItem(null);
      }}
    >
      <legend>Section</legend>
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          setDraggedItem({ kind: "section", sectionId: section.id });
          initializeDrag(event);
        }}
        onDragEnd={() => setDraggedItem(null)}
      >
        Drag section
      </button>
      <button
        type="button"
        disabled={sectionIndex === 0}
        onClick={() =>
          transformDocument((document) =>
            moveSection(document, section.id, sectionIndex - 1),
          )
        }
      >
        Move section up
      </button>
      <button
        type="button"
        disabled={sectionIndex === sectionCount - 1}
        onClick={() =>
          transformDocument((document) =>
            moveSection(document, section.id, sectionIndex + 1),
          )
        }
      >
        Move section down
      </button>
      <button
        className="button-danger"
        type="button"
        onClick={() =>
          transformDocument((document) => removeSection(document, section.id))
        }
      >
        Remove section
      </button>
      {section.blocks.map((block, blockIndex) => (
        <BlockEditor
          key={block.id}
          block={block}
          blockIndex={blockIndex}
          blockCount={section.blocks.length}
          assets={assets}
          sectionId={section.id}
          draggedItem={draggedItem}
          setDraggedItem={setDraggedItem}
          fieldError={fieldErrors[block.id]}
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
  blockIndex,
  blockCount,
  assets,
  sectionId,
  draggedItem,
  setDraggedItem,
  fieldError,
  transformDocument,
}: Readonly<{
  block: Block;
  blockIndex: number;
  blockCount: number;
  assets: AssetListItem[];
  sectionId: string;
  draggedItem: DraggedEditorItem | null;
  setDraggedItem: (item: DraggedEditorItem | null) => void;
  fieldError: string | undefined;
  transformDocument: (
    transform: DocumentTransform,
    clearFieldError?: string,
  ) => void;
}>) {
  const inputId = `block-${block.id}`;
  return (
    <div
      className="editor-block"
      onDragOver={(event) => {
        if (draggedItem?.kind === "block") {
          event.stopPropagation();
          if (draggedItem.sectionId === sectionId) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }
      }}
      onDrop={(event) => {
        if (draggedItem?.kind !== "block") {
          return;
        }
        event.stopPropagation();
        if (draggedItem.sectionId !== sectionId) {
          return;
        }
        event.preventDefault();
        transformDocument((document) =>
          moveBlock(document, sectionId, draggedItem.blockId, blockIndex),
        );
        setDraggedItem(null);
      }}
    >
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          setDraggedItem({ kind: "block", sectionId, blockId: block.id });
          initializeDrag(event);
        }}
        onDragEnd={(event) => {
          event.stopPropagation();
          setDraggedItem(null);
        }}
      >
        Drag block
      </button>
      <button
        type="button"
        disabled={blockIndex === 0}
        onClick={() =>
          transformDocument((document) =>
            moveBlock(document, sectionId, block.id, blockIndex - 1),
          )
        }
      >
        Move block up
      </button>
      <button
        type="button"
        disabled={blockIndex === blockCount - 1}
        onClick={() =>
          transformDocument((document) =>
            moveBlock(document, sectionId, block.id, blockIndex + 1),
          )
        }
      >
        Move block down
      </button>
      {block.type === "image" ? (
        <ImageBlockFields
          block={block}
          sectionId={sectionId}
          asset={assets.find(({ id }) => id === block.assetId)}
          transformDocument={transformDocument}
        />
      ) : (
        <>
          <label htmlFor={inputId}>
            {block.type === "heading" ? "Heading" : "Paragraph"}
          </label>
          {block.type === "heading" ? (
            <input
              id={inputId}
              value={block.text}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${inputId}-error` : undefined}
              onChange={(event) =>
                transformDocument(
                  (document) =>
                    updateBlockText(
                      document,
                      sectionId,
                      block.id,
                      event.currentTarget.value,
                    ),
                  block.id,
                )
              }
            />
          ) : (
            <textarea
              id={inputId}
              value={block.text}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${inputId}-error` : undefined}
              onChange={(event) =>
                transformDocument(
                  (document) =>
                    updateBlockText(
                      document,
                      sectionId,
                      block.id,
                      event.currentTarget.value,
                    ),
                  block.id,
                )
              }
            />
          )}
          {fieldError ? <p id={`${inputId}-error`}>{fieldError}</p> : null}
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
        </>
      )}
      <button
        className="button-danger"
        type="button"
        onClick={() =>
          transformDocument(
            (document) => removeBlock(document, sectionId, block.id),
            block.id,
          )
        }
      >
        Remove block
      </button>
    </div>
  );
}

function ImageBlockFields({
  block,
  sectionId,
  asset,
  transformDocument,
}: Readonly<{
  block: Extract<Block, { type: "image" }>;
  sectionId: string;
  asset: AssetListItem | undefined;
  transformDocument: (
    transform: DocumentTransform,
    clearFieldError?: string,
  ) => void;
}>) {
  const inputId = `block-${block.id}-alt`;
  const hintId = `${inputId}-hint`;
  return (
    <>
      <p>Image: {asset?.originalFilename ?? block.assetId}</p>
      <label htmlFor={inputId}>Alternative text</label>
      <input
        id={inputId}
        value={block.alt}
        aria-describedby={hintId}
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
      <p id={hintId}>
        Empty alternative text marks this image as decorative. Leave it empty
        only when the image is purely decorative.
      </p>
    </>
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
    fieldErrors: {},
    formError: null,
  };
}

export function applyDocumentEdit(
  state: PageEditorState,
  transform: DocumentTransform,
  clearFieldError?: string,
): PageEditorState {
  if (state.status !== "loaded") {
    return state;
  }
  const document = transform(state.document);
  if (document === state.document) {
    return state;
  }
  const fieldErrors = clearFieldError
    ? removeFieldError(state.fieldErrors, clearFieldError)
    : state.fieldErrors;
  const clearedError = fieldErrors !== state.fieldErrors;
  return {
    ...state,
    document,
    revision: state.revision + 1,
    save: state.save.status === "saving" ? state.save : { status: "idle" },
    fieldErrors,
    formError:
      clearedError && Object.keys(fieldErrors).length === 0
        ? null
        : state.formError,
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
      fieldErrors: {},
      formError: null,
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
): DraftSavePreparation {
  const canonical = pageDocumentSchema.safeParse(document);
  if (canonical.success) {
    const request = savePageDraftRequestSchema.safeParse({
      document: canonical.data,
    });
    return request.success
      ? { request: request.data, fieldErrors: {}, formError: null }
      : { request: null, fieldErrors: {}, formError: INVALID_DOCUMENT_MESSAGE };
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of canonical.error.issues) {
    const [sectionsKey, sectionIndex, blocksKey, blockIndex, fieldKey] =
      issue.path;
    if (
      sectionsKey !== "sections" ||
      typeof sectionIndex !== "number" ||
      blocksKey !== "blocks" ||
      typeof blockIndex !== "number" ||
      fieldKey !== "text"
    ) {
      continue;
    }
    const block = document.sections[sectionIndex]?.blocks[blockIndex];
    if (block?.type === "heading") {
      fieldErrors[block.id] = "Heading text is required.";
    }
    if (block?.type === "paragraph") {
      fieldErrors[block.id] = "Paragraph text is required.";
    }
  }
  return {
    request: null,
    fieldErrors,
    formError:
      Object.keys(fieldErrors).length > 0
        ? FIX_DOCUMENT_MESSAGE
        : INVALID_DOCUMENT_MESSAGE,
  };
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
  preparation: DraftSavePreparation,
): PageEditorState {
  return state.status === "loaded" && state.save.status !== "saving"
    ? {
        ...state,
        save: { status: "idle" },
        fieldErrors: preparation.fieldErrors,
        formError: preparation.formError,
      }
    : state;
}

function removeFieldError(
  fieldErrors: Readonly<Record<string, string>>,
  blockId: string,
): Readonly<Record<string, string>> {
  if (!(blockId in fieldErrors)) {
    return fieldErrors;
  }
  const { [blockId]: _removed, ...remaining } = fieldErrors;
  return remaining;
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

function initializeDrag(event: DragEvent<HTMLElement>): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", DRAG_MARKER);
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
