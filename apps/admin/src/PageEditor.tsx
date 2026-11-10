import {
  type AssetListItem,
  type PageDocument,
  type PageDraft,
  type SavePageDraftRequest,
  type Section,
  type TenantRole,
  assetListResponseSchema,
  pageDocumentSchema,
  pageDraftSchema,
  savePageDraftRequestSchema,
} from "@bher/contracts";
import {
  addSection,
  moveSection,
  removeSection,
} from "@bher/editor";
import type { DragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { ActionButton, AlertMessage, StatusMessage } from "@bher/ui";

import { requestApi } from "./lib/api";
import { AssetUploadForm } from "./AssetUploadForm";
import { PagePublicationControls } from "./PagePublicationControls";
import { SectionCanvas } from "./SectionCanvas";
import { parseEditorJson, replaceSectionBlocks } from "./editor-document";

const INVALID_DOCUMENT_MESSAGE =
  "The page contains invalid content and cannot be saved.";
const FIX_DOCUMENT_MESSAGE =
  "Fix the highlighted page content before saving.";
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
  hostname: string;
  role: TenantRole;
  onDirtyChange: (dirty: boolean) => void;
}>;

type DocumentTransform = (document: PageDocument) => PageDocument;

export function PageEditor({
  tenantId,
  siteId,
  pageId,
  hostname,
  role,
  onDirtyChange,
}: PageEditorProperties) {
  const loadEpoch = useRef(0);
  const saveOperation = useRef(0);
  const commandBar = useRef<HTMLDivElement>(null);
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
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const dirty = isEditorDirty(state) || jsonError !== null || canvasFailed;

  useEffect(() => {
    const bar = commandBar.current;
    const workspace = bar?.closest("main");
    if (!bar || !workspace) return;
    const observer = new ResizeObserver(() => {
      workspace.style.scrollPaddingBlockStart = `${bar.getBoundingClientRect().height + 8}px`;
    });
    observer.observe(bar);
    return () => { observer.disconnect(); workspace.style.removeProperty("scroll-padding-block-start"); };
  }, [state.status]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);

  useEffect(() => {
    const identity: EditorIdentity = {
      tenantId,
      siteId,
      pageId,
      requestEpoch: ++loadEpoch.current,
    };
    let active = true;
    setState({ status: "loading", identity });
    setMode("visual"); setJsonText(""); setJsonError(null); setCanvasFailed(false);
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
    return <StatusMessage>Loading page…</StatusMessage>;
  }
  if (state.status === "loading") {
    return <StatusMessage>Loading page…</StatusMessage>;
  }
  if (state.status === "error") {
    return <AlertMessage>The page draft could not be loaded.</AlertMessage>;
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
      matchesEditorIdentity(current.identity, loadedState.identity) ? applyDocumentEdit(current, transform, clearFieldError) : current,
    );
  }

  async function saveDraft(): Promise<void> {
    if (jsonError || canvasFailed) return;
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
    } catch (failure) {
      setState((current) => applySaveError(current, operation.operation, failure));
    }
  }

  return (
    <section className="editor-surface detail-surface" aria-labelledby="page-editor-title">
      <div ref={commandBar} className="editor-command-bar">
      <div className="editor-page-context">
        <h2 id="page-editor-title">{loadedState.page.title}</h2>
        <p className="field-help">{hostname}<span>/{loadedState.page.slug}</span></p>
      </div>
      <div id="page-save-status" className="editor-save-feedback">
        {jsonError ? <div id="page-json-error"><AlertMessage>{jsonError}</AlertMessage></div>
          : canvasFailed ? <AlertMessage>The canvas could not be read. Your last readable document is retained; use Code to recover it.</AlertMessage>
          : loadedState.save.status === "error" ? <AlertMessage>{loadedState.save.message}</AlertMessage>
          : loadedState.formError ? <AlertMessage>{loadedState.formError}</AlertMessage>
          : <p className={`editor-save-state${loadedState.save.status === "saved" ? " saved" : ""}`} role="status">{readEditorSaveLabel(loadedState)}</p>}
      </div>
      <div className="editor-page-actions">
        <ActionButton type="button" variant="primary" disabled={loadedState.save.status === "saving" || jsonError !== null || canvasFailed} onClick={() => void saveDraft()}>
          {loadedState.save.status === "saving" ? "Saving…" : "Save draft"}
        </ActionButton>
        <PagePublicationControls
          key={`${loadedState.identity.requestEpoch}:${loadedState.revision}:${loadedState.save.status}`}
          tenantId={tenantId} siteId={siteId} pageId={pageId}
          hostname={hostname} slug={loadedState.page.slug} role={role} dirty={dirty}
        />
      </div>
      </div>
      <div className="editor-mode-actions" role="group" aria-label="Editing mode">
        <button type="button" aria-pressed={mode === "visual"} disabled={jsonError !== null} onClick={() => setMode("visual")}>Visual</button>
        <button type="button" aria-pressed={mode === "code"} onClick={() => {
          if (mode === "code") return;
          if (canvasFailed && !window.confirm("The last canvas action could not be read. Open the last readable document in Code?")) return;
          setJsonText(JSON.stringify(loadedState.document, null, 2));
          setJsonError(parseEditorJson(JSON.stringify(loadedState.document)).error);
          setCanvasFailed(false); setMode("code");
        }}>Code · JSON</button>
      </div>
      <details className="editor-images">
        <summary>Site images</summary>
        {visibleAssets.status === "loading" ? <StatusMessage>Loading site assets…</StatusMessage> : null}
        {visibleAssets.status === "error" ? <AlertMessage>Site assets could not be loaded.</AlertMessage> : null}
        {visibleAssets.status === "loaded" ? (
          <AssetUploadForm tenantId={tenantId} siteId={siteId} onUploaded={(asset) =>
            setAssetState((current) => applyUploadedAsset(current, tenantId, siteId, asset))
          } />
        ) : null}
      </details>
      {mode === "code" ? <div className="json-editor">
        <label htmlFor="page-json">Page document JSON</label>
        <p id="page-json-help" className="field-help">Edits update this draft only. Valid JSON is required to return to Visual or save.</p>
        <textarea id="page-json" spellCheck={false} value={jsonText} aria-invalid={jsonError !== null} aria-describedby={jsonError ? "page-json-help page-json-error" : "page-json-help"}
          onChange={(event) => {
            const text = event.currentTarget.value; setJsonText(text);
            const parsed = parseEditorJson(text); setJsonError(parsed.error);
            if (parsed.document) transformDocument((current) => JSON.stringify(current) === JSON.stringify(parsed.document) ? current : parsed.document!);
          }} />
        {jsonError ? <button type="button" onClick={() => {
          if (!window.confirm("Discard invalid JSON text and return to the last readable document?")) return;
          setJsonError(null); setMode("visual");
        }}>Discard invalid JSON</button> : null}
      </div> : <div className="visual-page-canvas">{loadedState.document.sections.map((section, sectionIndex) => (
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
          tenantId={tenantId} siteId={siteId} onFailure={() => setCanvasFailed(true)}
        />
      ))}
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
      </div>}
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
  tenantId, siteId, onFailure,
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
  tenantId: string; siteId: string; onFailure: () => void;
}>) {
  return (
    <section role="group" aria-label={`Section ${sectionIndex + 1}`}
      className="editor-section visual-section"
      data-width={section.style?.width ?? "standard"}
      data-spacing={section.style?.spacing}
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
      <div className="section-heading">
        <h3>Section {sectionIndex + 1}</h3>
        <EditorItemActions kind="section" first={sectionIndex === 0} last={sectionIndex === sectionCount - 1}
          onDragStart={(event) => { setDraggedItem({ kind: "section", sectionId: section.id }); initializeDrag(event); }}
          onDragEnd={() => setDraggedItem(null)}
          onUp={() => transformDocument((document) => moveSection(document, section.id, sectionIndex - 1))}
          onDown={() => transformDocument((document) => moveSection(document, section.id, sectionIndex + 1))}
          onRemove={() => transformDocument((document) => removeSection(document, section.id))}
        />
      </div>
      <details className="section-layout">
        <summary>Section layout</summary>
        <label>Width<select value={section.style?.width ?? "standard"} onChange={(event) => {
          const width = event.currentTarget.value as "narrow" | "standard" | "wide";
          transformDocument((document) => ({ ...document, sections: document.sections.map((item) => item.id === section.id ? { ...item, style: { ...item.style, width } } : item) }));
        }}><option value="narrow">Narrow</option><option value="standard">Standard</option><option value="wide">Wide</option></select></label>
        <label>Spacing<select value={section.style?.spacing ?? "md"} onChange={(event) => {
          const spacing = event.currentTarget.value as "none" | "sm" | "md" | "lg";
          transformDocument((document) => ({ ...document, sections: document.sections.map((item) => item.id === section.id ? { ...item, style: { ...item.style, spacing } } : item) }));
        }}><option value="none">None</option><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
      </details>
      <SectionCanvas section={section} tenantId={tenantId} siteId={siteId} assets={assets} errors={fieldErrors}
        onChange={(blocks, changedId) => transformDocument((document) => replaceSectionBlocks(document, section.id, blocks), changedId)}
        onFailure={onFailure} />
    </section>
  );
}


export function EditorItemActions({ kind, first, last, onDragStart, onDragEnd, onUp, onDown, onRemove }: Readonly<{
  kind: "section" | "block"; first: boolean; last: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: (event: DragEvent<HTMLButtonElement>) => void;
  onUp: () => void; onDown: () => void; onRemove: () => void;
}>) {
  return (
    <div className="editor-item-tools">
      <button type="button" draggable aria-label={`Drag ${kind}`}
        onDragStart={onDragStart} onDragEnd={onDragEnd}>Drag</button>
      <details className="editor-action-disclosure">
        <summary aria-label={`${kind === "section" ? "Section" : "Block"} actions`}>Actions</summary>
        <div className="editor-actions">
          <button type="button" aria-label={`Move ${kind} up`} disabled={first} onClick={onUp}>Up</button>
          <button type="button" aria-label={`Move ${kind} down`} disabled={last} onClick={onDown}>Down</button>
          <button type="button" className="button-danger" aria-label={`Remove ${kind}`} onClick={onRemove}>Remove</button>
        </div>
      </details>
    </div>
  );
}


export function isEditorDirty(state: PageEditorState): boolean {
  return state.status === "loaded" && (
    state.save.status === "saving" || state.save.status === "error" ||
    (state.revision > 0 && state.save.status !== "saved")
  );
}

export function applyUploadedAsset(state: SiteAssetState, tenantId: string, siteId: string, asset: AssetListItem): SiteAssetState {
  if (state.status !== "loaded" || !matchesSiteAssetState(state, tenantId, siteId) || state.assets.some(({ id }) => id === asset.id)) return state;
  return { ...state, assets: [...state.assets, asset] };
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
  failure?: unknown,
): PageEditorState {
  if (!matchesSaveOperation(state, operation)) {
    return state;
  }
  return {
    ...state,
    save: { status: "error", message: failure instanceof DraftSessionExpiredError
      ? "Your session has expired. Unsaved content remains in this editor. Sign in again in another tab, then return here and retry Save draft."
      : "The draft could not be saved. Please try again." },
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
      (fieldKey !== "text" && fieldKey !== "assetId")
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
    if (block?.type === "image" && fieldKey === "assetId") {
      fieldErrors[block.id] = "Choose an image in this block’s settings.";
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
  if (response.status === 401) throw new DraftSessionExpiredError();
  if (!response.ok) {
    throw new Error("Page draft saving failed.");
  }
  const draft = pageDraftSchema.parse(await response.json());
  if (draft.page.id !== pageId) {
    throw new Error("Saved draft identity did not match the request.");
  }
  return draft;
}

export class DraftSessionExpiredError extends Error {}

export function readEditorSaveLabel(state: Extract<PageEditorState, { status: "loaded" }>): string {
  if (state.save.status === "saving") return "Saving draft…";
  if (isEditorDirty(state)) return "Unsaved changes — save to continue.";
  return state.save.status === "saved" ? "Draft saved." : "No unsaved changes.";
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
