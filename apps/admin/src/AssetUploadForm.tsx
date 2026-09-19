import {
  type AssetListItem,
  ASSET_MAX_BYTE_SIZE,
  RENDERABLE_ASSET_CONTENT_TYPES,
  assetOriginalFilenameSchema,
  renderableAssetContentTypeSchema,
  assetUploadResponseSchema,
  assetListItemSchema,
} from "@bher/contracts";
import { ActionButton, AlertMessage, StatusMessage } from "@bher/ui";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { requestApi } from "./lib/api";

export function AssetUploadForm({ tenantId, siteId, onUploaded }: Readonly<{
  tenantId: string;
  siteId: string;
  onUploaded: (asset: AssetListItem) => void;
}>) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setUploaded(false);
    const validation = validateImageUpload(file);
    setError(validation);
    if (validation || !file) return;
    setPending(true);
    try {
      const asset = await requestAssetUpload(tenantId, siteId, file);
      onUploaded(asset);
      setUploaded(true);
      setFile(null);
      if (input.current) input.current.value = "";
    } catch {
      setError("The image could not be uploaded.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void upload(event)}>
      <label htmlFor="editor-image-file">Image file</label>
      <input
        ref={input}
        id="editor-image-file"
        type="file"
        accept={RENDERABLE_ASSET_CONTENT_TYPES.join(",")}
        disabled={pending}
        aria-describedby="editor-image-help"
        onChange={(event) => {
          const selected = event.currentTarget.files?.[0] ?? null;
          setFile(selected);
          setError(null);
          setUploaded(false);
        }}
      />
      <p className="field-help" id="editor-image-help">JPEG, PNG, GIF, WebP or AVIF. Up to 10 MiB.</p>
      {error ? <AlertMessage>{error}</AlertMessage> : null}
      {uploaded ? <StatusMessage tone="success">Image uploaded.</StatusMessage> : null}
      <ActionButton type="submit" variant="secondary" disabled={pending}>
        {pending ? "Uploading…" : "Upload image"}
      </ActionButton>
    </form>
  );
}

export function validateImageUpload(file: File | null): string | null {
  if (!file) return "Choose an image file.";
  if (file.size === 0 || file.size > ASSET_MAX_BYTE_SIZE) return "Choose a non-empty image no larger than 10 MiB.";
  if (!assetOriginalFilenameSchema.safeParse(file.name).success) return "Choose an image with a valid filename.";
  if (!renderableAssetContentTypeSchema.safeParse(file.type).success) return "Choose a JPEG, PNG, GIF, WebP or AVIF image.";
  return null;
}

export function createAssetUploadBody(file: File): FormData {
  const body = new FormData();
  body.append("file", file);
  return body;
}

export async function requestAssetUpload(tenantId: string, siteId: string, file: File): Promise<AssetListItem> {
  const response = await requestApi(`/tenants/${tenantId}/sites/${siteId}/assets`, {
    method: "POST", body: createAssetUploadBody(file),
  });
  if (!response.ok) throw new Error("Image upload failed.");
  return assetListItemSchema.parse(assetUploadResponseSchema.parse(await response.json()));
}
