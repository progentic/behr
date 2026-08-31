import type {
  Block,
  HeadingBlock,
  PageDocument,
  Section,
} from "@bher/contracts";
import { PREVIEW_TOKEN_HEADER } from "@bher/contracts";
import { type ReactElement, useEffect, useState } from "react";

type PageRendererProperties = Readonly<{
  document: PageDocument;
  previewToken: string | null;
}>;

export function PageRenderer({
  document,
  previewToken,
}: PageRendererProperties): ReactElement {
  return (
    <>
      {document.sections.map((section) =>
        renderSection(section, previewToken),
      )}
    </>
  );
}

function renderSection(
  section: Section,
  previewToken: string | null,
): ReactElement {
  return (
    <section key={section.id} className={readSectionClassName(section)}>
      {section.blocks.map((block) => renderBlock(block, previewToken))}
    </section>
  );
}

function renderBlock(
  block: Block,
  previewToken: string | null,
): ReactElement {
  if (block.type === "heading") {
    return renderHeading(block);
  }
  if (block.type === "image") {
    return previewToken === null ? (
      <img
        key={block.id}
        src={`/public/assets/${block.assetId}`}
        alt={block.alt}
      />
    ) : (
      <PreviewAssetImage
        key={`${block.id}:${block.assetId}:${previewToken}`}
        assetId={block.assetId}
        alt={block.alt}
        previewToken={previewToken}
      />
    );
  }
  return (
    <p key={block.id} className={readTextClassName(block.style?.align)}>
      {block.text}
    </p>
  );
}

function PreviewAssetImage({
  assetId,
  alt,
  previewToken,
}: Readonly<{
  assetId: string;
  alt: string;
  previewToken: string;
}>): ReactElement {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let ownedObjectUrl: string | null = null;
    setObjectUrl(null);
    void requestPreviewAsset(assetId, previewToken)
      .then((blob) => {
        if (active) {
          ownedObjectUrl = URL.createObjectURL(blob);
          setObjectUrl(ownedObjectUrl);
        }
      })
      .catch(() => {
        if (active) {
          setObjectUrl(null);
        }
      });
    return () => {
      active = false;
      if (ownedObjectUrl !== null) {
        URL.revokeObjectURL(ownedObjectUrl);
      }
    };
  }, [assetId, previewToken]);
  return <img src={objectUrl ?? undefined} alt={alt} />;
}

export async function requestPreviewAsset(
  assetId: string,
  previewToken: string,
): Promise<Blob> {
  const response = await fetch(`/preview/assets/${assetId}`, {
    credentials: "omit",
    headers: { [PREVIEW_TOKEN_HEADER]: previewToken },
  });
  if (!response.ok) {
    throw new Error("Preview asset request failed.");
  }
  return await response.blob();
}

function renderHeading(block: HeadingBlock): ReactElement {
  const properties = {
    className: readTextClassName(block.style?.align),
    children: block.text,
  };
  switch (block.level) {
    case 1:
      return <h1 key={block.id} {...properties} />;
    case 2:
      return <h2 key={block.id} {...properties} />;
    case 3:
      return <h3 key={block.id} {...properties} />;
    case 4:
      return <h4 key={block.id} {...properties} />;
    case 5:
      return <h5 key={block.id} {...properties} />;
    case 6:
      return <h6 key={block.id} {...properties} />;
  }
}

function readSectionClassName(section: Section): string | undefined {
  const classes = [
    section.style?.spacing
      ? `section-spacing-${section.style.spacing}`
      : undefined,
    section.style?.width ? `section-width-${section.style.width}` : undefined,
  ].filter((value): value is string => value !== undefined);
  return classes.length > 0 ? classes.join(" ") : undefined;
}

function readTextClassName(
  alignment: "left" | "center" | "right" | undefined,
): string | undefined {
  return alignment ? `text-align-${alignment}` : undefined;
}
