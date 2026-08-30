import type {
  Block,
  HeadingBlock,
  PageDocument,
  Section,
} from "@bher/contracts";
import type { ReactElement } from "react";

type PageRendererProperties = Readonly<{
  document: PageDocument;
}>;

export function PageRenderer({
  document,
}: PageRendererProperties): ReactElement {
  return <>{document.sections.map(renderSection)}</>;
}

function renderSection(section: Section): ReactElement {
  return (
    <section key={section.id} className={readSectionClassName(section)}>
      {section.blocks.map(renderBlock)}
    </section>
  );
}

function renderBlock(block: Block): ReactElement {
  if (block.type === "heading") {
    return renderHeading(block);
  }
  return (
    <p key={block.id} className={readTextClassName(block.style?.align)}>
      {block.text}
    </p>
  );
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
