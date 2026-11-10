import type { AssetListItem, Block, Section } from "@bher/contracts";
import type EditorJS from "@editorjs/editorjs";
import { useEffect, useRef, useState } from "react";
import { AlertMessage, StatusMessage } from "@bher/ui";
import { createCanvasTool, type CanvasScope } from "./canvas-tools";

export function SectionCanvas({ section, tenantId, siteId, assets, errors, onChange, onFailure }: Readonly<{
  section: Section; tenantId: string; siteId: string; assets: readonly AssetListItem[];
  errors: Readonly<Record<string, string>>;
  onChange: (blocks: Block[], changedId?: string) => void;
  onFailure: () => void;
}>) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<EditorJS | null>(null);
  const latest = useRef({ assets, errors, onChange, onFailure });
  latest.current = { assets, errors, onChange, onFailure };
  const scopeRef = useRef<CanvasScope | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = document.createElement("div"); mount.inert = true; host.current?.append(mount);
    let active = true; let initialized = false; let editor: EditorJS | null = null;
    let last = section.blocks;
    const reportFailure = () => { if (active) { setFailed(true); latest.current.onFailure(); } };
    const publish = (changedId?: string) => {
      if (!active || !initialized || !editor) return;
      try {
        const blocks: Block[] = [];
        for (let index = 0; index < editor.blocks.getBlocksCount(); index++) {
          const block = editor.blocks.getBlockByIndex(index);
          const tool = block && scope.tools.get(block.id);
          if (!tool) throw new Error("Canvas block unavailable");
          blocks.push(tool.save());
        }
        if (blocks.length === 1 && blocks[0]?.type === "paragraph" && blocks[0].text === "" && !last.some((block) => block.id === blocks[0]!.id)) blocks.length = 0;
        if (JSON.stringify(last) === JSON.stringify(blocks)) return;
        last = blocks; latest.current.onChange(blocks, changedId);
      } catch { reportFailure(); }
    };
    const scope: CanvasScope = { tools: new Map(), assets: () => latest.current.assets, imagePath: (id) => `/tenants/${tenantId}/sites/${siteId}/assets/${id}/content`, changed: publish, dragged: null };
    scopeRef.current = scope;
    const observer = new MutationObserver(() => { enableCanvasControls(mount); publish(); });
    void import("@editorjs/editorjs").then(async ({ default: Editor }) => {
      if (!active) return;
      editor = new Editor({ holder: mount, minHeight: 0, inlineToolbar: false, defaultBlock: "paragraph",
        tools: { paragraph: createCanvasTool("paragraph", scope), heading: createCanvasTool("heading", scope), image: createCanvasTool("image", scope) },
        data: { blocks: section.blocks.map((block) => ({ id: block.id, type: block.type, data: block })) },
        onChange: () => publish(),
      });
      await editor.isReady;
      if (!active) return;
      initialized = true; mount.inert = false; instance.current = editor; setReady(true);
      enableCanvasControls(mount);
      observer.observe(mount, { childList: true, subtree: true, characterData: true });
      for (const tool of scope.tools.values()) tool.refresh(latest.current.errors);
    }).catch(reportFailure);
    return () => {
      active = false; observer.disconnect(); instance.current = null; mount.remove();
      if (editor) void editor.isReady.then(() => editor?.destroy()).catch(() => undefined);
    };
  }, [section.id, tenantId, siteId]);

  useEffect(() => {
    for (const tool of scopeRef.current?.tools.values() ?? []) tool.refresh(errors);
  }, [assets, errors]);

  function insertBlock(kind: Block["type"]): void {
    const blocks = instance.current?.blocks;
    if (!blocks) return;
    const selected = blocks.getCurrentBlockIndex();
    const current = selected < 0 && blocks.getBlocksCount() === 1 ? 0 : selected;
    const replace = current >= 0 && Boolean(blocks.getBlockByIndex(current)?.isEmpty);
    blocks.insert(kind, {}, undefined, current < 0 ? undefined : replace ? current : current + 1, true, replace);
  }

  return <div className="section-canvas">
    {!ready && !failed ? <StatusMessage>Preparing visual editor…</StatusMessage> : null}
    {failed ? <AlertMessage>The visual editor could not be read. Your last readable document is retained.</AlertMessage> : null}
    <div ref={host} aria-busy={!ready} />
    <div className="canvas-insert-actions">
      <button type="button" disabled={!ready || failed} onClick={() => insertBlock("heading")}>Add heading</button>
      <button type="button" disabled={!ready || failed} onClick={() => insertBlock("paragraph")}>Add paragraph</button>
      <button type="button" disabled={!ready || failed} onClick={() => insertBlock("image")}>Add image</button>
    </div>
  </div>;
}

/** Editor.js uses spans/divs for these controls; preserve keyboard/native-button semantics. */
function enableCanvasControls(root: HTMLElement): void {
  for (const control of root.querySelectorAll<HTMLElement>(".ce-toolbar__plus, .ce-toolbar__settings-btn, .ce-popover-item")) {
    control.setAttribute("role", "button");
    control.tabIndex = control.classList.contains("ce-popover-item--disabled") ? -1 : 0;
    control.setAttribute("aria-disabled", String(control.tabIndex < 0));
    if (control.classList.contains("ce-toolbar__plus")) control.setAttribute("aria-label", "Add block");
    if (control.classList.contains("ce-toolbar__settings-btn")) control.setAttribute("aria-label", "Block settings");
    if (control.dataset.behrKeyboard) continue;
    control.dataset.behrKeyboard = "true";
    control.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); event.stopPropagation();
      if (control.getAttribute("aria-disabled") === "true") return;
      // The pinned settings control selects its block on mousedown, not click.
      if (control.classList.contains("ce-toolbar__settings-btn")) control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      else control.click();
    });
  }
}
