import { type Block, type PageDocument, pageDocumentSchema } from "@bher/contracts";

export function parseEditorJson(text: string): { document: PageDocument | null; error: string | null } {
  let input: unknown;
  try { input = JSON.parse(text); }
  catch { return { document: null, error: "Enter valid JSON before returning to Visual or saving." }; }
  const result = pageDocumentSchema.safeParse(input);
  if (!result.success) return { document: null, error: "JSON must match BeHR’s page document: sections with heading, paragraph or image blocks." };
  const ids = result.data.sections.flatMap((section) => [section.id, ...section.blocks.map((block) => block.id)]);
  if (new Set(ids).size !== ids.length) return { document: null, error: "Section and block IDs must be unique." };
  return { document: result.data, error: null };
}

export function replaceSectionBlocks(document: PageDocument, sectionId: string, blocks: Block[]): PageDocument {
  const section = document.sections.find((item) => item.id === sectionId);
  if (!section || JSON.stringify(section.blocks) === JSON.stringify(blocks)) return document;
  return { ...document, sections: document.sections.map((item) => item.id === sectionId ? { ...item, blocks } : item) };
}
