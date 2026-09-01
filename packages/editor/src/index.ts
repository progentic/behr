import {
  PAGE_DOCUMENT_SCHEMA_VERSION,
  type Block,
  type HeadingBlock,
  type PageDocument,
  type TextAlignToken,
} from "@bher/contracts";

const DEFAULT_HEADING_TEXT = "New heading";
const DEFAULT_PARAGRAPH_TEXT = "New paragraph";
const DEFAULT_HEADING_LEVEL = 2;

export function createEmptyPageDocument(): PageDocument {
  return { schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION, sections: [] };
}

export function addSection(
  document: PageDocument,
  sectionId: string,
): PageDocument {
  return {
    ...document,
    sections: [...document.sections, { id: sectionId, blocks: [] }],
  };
}

export function removeSection(
  document: PageDocument,
  sectionId: string,
): PageDocument {
  const index = document.sections.findIndex(({ id }) => id === sectionId);
  if (index === -1) {
    return document;
  }
  return {
    ...document,
    sections: document.sections.filter((_, position) => position !== index),
  };
}

export function moveSection(
  document: PageDocument,
  sectionId: string,
  targetIndex: number,
): PageDocument {
  const sourceIndex = document.sections.findIndex(({ id }) => id === sectionId);
  if (
    sourceIndex === -1 ||
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= document.sections.length ||
    sourceIndex === targetIndex
  ) {
    return document;
  }
  const sections = [...document.sections];
  const [section] = sections.splice(sourceIndex, 1);
  if (!section) {
    return document;
  }
  sections.splice(targetIndex, 0, section);
  return { ...document, sections };
}

export function addHeadingBlock(
  document: PageDocument,
  sectionId: string,
  blockId: string,
): PageDocument {
  return appendBlock(document, sectionId, {
    id: blockId,
    type: "heading",
    level: DEFAULT_HEADING_LEVEL,
    text: DEFAULT_HEADING_TEXT,
  });
}

export function addParagraphBlock(
  document: PageDocument,
  sectionId: string,
  blockId: string,
): PageDocument {
  return appendBlock(document, sectionId, {
    id: blockId,
    type: "paragraph",
    text: DEFAULT_PARAGRAPH_TEXT,
  });
}

export function addImageBlock(
  document: PageDocument,
  sectionId: string,
  blockId: string,
  assetId: string,
): PageDocument {
  return appendBlock(document, sectionId, {
    id: blockId,
    type: "image",
    assetId,
    alt: "",
  });
}

export function removeBlock(
  document: PageDocument,
  sectionId: string,
  blockId: string,
): PageDocument {
  const section = document.sections.find(({ id }) => id === sectionId);
  const blockIndex = section?.blocks.findIndex(({ id }) => id === blockId) ?? -1;
  if (!section || blockIndex === -1) {
    return document;
  }
  return replaceSection(document, sectionId, {
    ...section,
    blocks: section.blocks.filter((_, index) => index !== blockIndex),
  });
}

export function moveBlock(
  document: PageDocument,
  sectionId: string,
  blockId: string,
  targetIndex: number,
): PageDocument {
  const section = document.sections.find(({ id }) => id === sectionId);
  const sourceIndex = section?.blocks.findIndex(({ id }) => id === blockId) ?? -1;
  if (
    !section ||
    sourceIndex === -1 ||
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= section.blocks.length ||
    sourceIndex === targetIndex
  ) {
    return document;
  }
  const blocks = [...section.blocks];
  const [block] = blocks.splice(sourceIndex, 1);
  if (!block) {
    return document;
  }
  blocks.splice(targetIndex, 0, block);
  return replaceSection(document, sectionId, { ...section, blocks });
}

export function updateBlockText(
  document: PageDocument,
  sectionId: string,
  blockId: string,
  text: string,
): PageDocument {
  return updateBlock(document, sectionId, blockId, (block) => {
    if (block.type === "image" || block.text === text) {
      return block;
    }
    return { ...block, text };
  });
}

export function updateImageAlt(
  document: PageDocument,
  sectionId: string,
  blockId: string,
  alt: string,
): PageDocument {
  return updateBlock(document, sectionId, blockId, (block) => {
    if (block.type !== "image" || block.alt === alt) {
      return block;
    }
    return { ...block, alt };
  });
}

export function updateHeadingLevel(
  document: PageDocument,
  sectionId: string,
  blockId: string,
  level: HeadingBlock["level"],
): PageDocument {
  return updateBlock(document, sectionId, blockId, (block) => {
    if (block.type !== "heading" || block.level === level) {
      return block;
    }
    return { ...block, level };
  });
}

export function updateTextAlignment(
  document: PageDocument,
  sectionId: string,
  blockId: string,
  alignment: TextAlignToken | undefined,
): PageDocument {
  return updateBlock(document, sectionId, blockId, (block) => {
    if (block.type === "image") {
      return block;
    }
    if (alignment === undefined) {
      if (block.style === undefined) {
        return block;
      }
      const { style: _style, ...unstyledBlock } = block;
      return unstyledBlock;
    }
    if (block.style?.align === alignment) {
      return block;
    }
    return { ...block, style: { ...block.style, align: alignment } };
  });
}

function appendBlock(
  document: PageDocument,
  sectionId: string,
  block: Block,
): PageDocument {
  const section = document.sections.find(({ id }) => id === sectionId);
  if (!section) {
    return document;
  }
  return replaceSection(document, sectionId, {
    ...section,
    blocks: [...section.blocks, block],
  });
}

function updateBlock(
  document: PageDocument,
  sectionId: string,
  blockId: string,
  transform: (block: Block) => Block,
): PageDocument {
  const section = document.sections.find(({ id }) => id === sectionId);
  const blockIndex = section?.blocks.findIndex(({ id }) => id === blockId) ?? -1;
  if (!section || blockIndex === -1) {
    return document;
  }
  const block = section.blocks[blockIndex];
  if (!block) {
    return document;
  }
  const nextBlock = transform(block);
  if (nextBlock === block) {
    return document;
  }
  const blocks = [...section.blocks];
  blocks[blockIndex] = nextBlock;
  return replaceSection(document, sectionId, { ...section, blocks });
}

function replaceSection(
  document: PageDocument,
  sectionId: string,
  replacement: PageDocument["sections"][number],
): PageDocument {
  return {
    ...document,
    sections: document.sections.map((section) =>
      section.id === sectionId ? replacement : section,
    ),
  };
}
