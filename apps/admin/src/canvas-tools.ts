import { type AssetListItem, type Block, type HeadingBlock, assetIdSchema } from "@bher/contracts";
import type { BlockToolConstructorOptions } from "@editorjs/editorjs";

export type CanvasTool = { save: () => Block; refresh: (errors: Readonly<Record<string, string>>) => void };
export type CanvasScope = {
  tools: Map<string, CanvasTool>;
  assets: () => readonly AssetListItem[];
  imagePath: (id: string) => string;
  changed: (id?: string) => void;
  dragged: string | null;
};

/** Editor.js owns DOM interaction; only plain canonical data leaves this tool. */
export function createCanvasTool(kind: Block["type"], scope: CanvasScope) {
  return class {
    static get toolbox() { return { title: kind === "heading" ? "Heading" : kind === "image" ? "Image" : "Paragraph", icon: "" }; }
    static get pasteConfig() { return false as const; }
    static get enableLineBreaks() { return kind !== "image"; }
    private data: Block;
    private root = document.createElement("div");
    private text: HTMLElement | null = null;
    private image: HTMLImageElement | null = null;
    private filename: HTMLElement | null = null;
    private error = document.createElement("p");

    constructor(private options: BlockToolConstructorOptions) {
      this.data = createCanvasBlock(kind, options.data);
      if ([...scope.tools.values()].some((tool) => tool.save().id === this.data.id)) this.data = { ...this.data, id: crypto.randomUUID() };
      scope.tools.set(options.block.id, this);
    }

    render(): HTMLElement {
      this.root.className = "canvas-block";
      if (this.data.type === "image") {
        this.root.id = `block-${this.data.id}`;
        this.root.tabIndex = -1;
        this.root.setAttribute("role", "group");
        this.root.setAttribute("aria-label", "Image block");
        this.root.setAttribute("aria-describedby", `block-${this.data.id}-error`);
        this.image = document.createElement("img");
        this.filename = document.createElement("p");
        this.filename.className = "field-help";
        this.root.append(this.image, this.filename);
      } else {
        this.text = document.createElement("div");
        this.text.contentEditable = "plaintext-only";
        this.text.id = `block-${this.data.id}`;
        this.text.className = "canvas-text";
        this.text.setAttribute("role", "textbox");
        this.text.setAttribute("aria-label", this.data.type === "heading" ? "Heading" : "Paragraph");
        this.text.setAttribute("aria-multiline", "true");
        this.text.dataset.placeholder = this.data.type === "heading" ? "Heading" : "Write something…";
        this.text.textContent = this.data.text;
        this.text.addEventListener("input", () => scope.changed(this.data.id));
        this.text.addEventListener("paste", (event) => event.stopPropagation());
        this.root.append(this.text);
      }
      this.error.id = `block-${this.data.id}-error`;
      this.error.className = "field-error";
      this.error.hidden = true;
      this.root.append(this.error);
      this.root.addEventListener("dragover", (event) => { if (scope.dragged) event.preventDefault(); });
      this.root.addEventListener("drop", (event) => {
        if (!scope.dragged) return;
        event.preventDefault(); event.stopPropagation();
        this.options.api.blocks.move(this.options.api.blocks.getBlockIndex(this.options.block.id), this.options.api.blocks.getBlockIndex(scope.dragged));
        scope.dragged = null; scope.changed();
      });
      this.refresh({});
      return this.root;
    }

    save(): Block {
      return this.data.type !== "image" && this.text ? { ...this.data, text: this.text.innerText } : this.data;
    }

    refresh(errors: Readonly<Record<string, string>>): void {
      if (this.text && this.data.type !== "image") {
        this.text.dataset.level = this.data.type === "heading" ? String(this.data.level) : "paragraph";
        this.text.dataset.align = this.data.style?.align ?? "left";
        this.text.setAttribute("aria-invalid", errors[this.data.id] ? "true" : "false");
        this.text.setAttribute("aria-describedby", this.error.id);
      }
      if (this.image && this.filename && this.data.type === "image") {
        const assetId = this.data.assetId;
        const asset = scope.assets().find((item) => item.id === assetId);
        if (assetIdSchema.safeParse(this.data.assetId).success) this.image.src = scope.imagePath(this.data.assetId);
        else this.image.removeAttribute("src");
        this.image.alt = this.data.alt;
        this.filename.textContent = asset?.originalFilename ?? "Choose an image using this block’s settings.";
      }
      this.error.textContent = errors[this.data.id] ?? "";
      this.error.hidden = !errors[this.data.id];
    }

    renderSettings(): HTMLElement {
      const panel = document.createElement("div"); panel.className = "canvas-block-settings";
      if (this.data.type === "image") {
        appendSelect(panel, "Image", [["", "Choose an image"], ...scope.assets().map((asset) => [asset.id, asset.originalFilename])], this.data.assetId, (assetId) => {
          if (this.data.type === "image") this.data = { ...this.data, assetId };
          this.refresh({}); scope.changed(this.data.id);
        });
        const label = document.createElement("label"); label.textContent = "Alternative text";
        const input = document.createElement("input"); input.value = this.data.alt;
        input.addEventListener("input", () => { if (this.data.type === "image") this.data = { ...this.data, alt: input.value }; this.refresh({}); scope.changed(this.data.id); });
        label.append(input); panel.append(label);
      } else {
        if (this.data.type === "heading") appendSelect(panel, "Heading level", [1, 2, 3, 4, 5, 6].map((level) => [String(level), `Heading ${level}`]), String(this.data.level), (level) => {
          if (this.data.type === "heading") this.data = { ...this.data, level: Number(level) as HeadingBlock["level"] };
          this.refresh({}); scope.changed(this.data.id);
        });
        appendSelect(panel, "Alignment", [["", "Default"], ["left", "Left"], ["center", "Center"], ["right", "Right"]], this.data.style?.align ?? "", (align) => {
          if (this.data.type === "image") return;
          this.data = { ...this.data, style: align ? { align: align as "left" | "center" | "right" } : {} };
          this.refresh({}); scope.changed(this.data.id);
        });
      }
      const drag = document.createElement("button"); drag.type = "button"; drag.textContent = "Drag block"; drag.draggable = true;
      drag.addEventListener("dragstart", (event) => { scope.dragged = this.options.block.id; event.dataTransfer?.setData("text/plain", "behr-editor-drag"); });
      drag.addEventListener("dragend", () => { scope.dragged = null; });
      panel.append(drag);
      return panel;
    }

    destroy(): void { if (scope.tools.get(this.options.block.id) === this) scope.tools.delete(this.options.block.id); }
  };
}

function createCanvasBlock(kind: Block["type"], input: Record<string, unknown>): Block {
  const id = typeof input.id === "string" && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : crypto.randomUUID();
  if (kind === "image") return { id, type: kind, assetId: typeof input.assetId === "string" ? input.assetId : "", alt: typeof input.alt === "string" ? input.alt : "" };
  const text = typeof input.text === "string" ? input.text : "";
  const style = input.style as { align?: "left" | "center" | "right" } | undefined;
  return kind === "heading" ? { id, type: kind, level: ([1, 2, 3, 4, 5, 6].includes(Number(input.level)) ? Number(input.level) : 2) as HeadingBlock["level"], text, ...(style ? { style } : {}) }
    : { id, type: kind, text, ...(style ? { style } : {}) };
}

function appendSelect(parent: HTMLElement, name: string, options: string[][], value: string, change: (value: string) => void): void {
  const label = document.createElement("label"); label.textContent = name;
  const select = document.createElement("select");
  for (const [key, text] of options) select.add(new Option(text, key));
  select.value = value; select.addEventListener("change", () => change(select.value));
  label.append(select); parent.append(label);
}
