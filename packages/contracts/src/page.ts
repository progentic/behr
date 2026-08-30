import { z } from "zod";

import { sectionSchema } from "./section";

export const PAGE_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const pageDocumentSchema = z
  .object({
    schemaVersion: z.literal(PAGE_DOCUMENT_SCHEMA_VERSION),
    sections: z.array(sectionSchema),
  })
  .strict();

export type PageDocument = z.infer<typeof pageDocumentSchema>;
