import { z } from "zod";

import { textStyleSchema } from "./style";

const blockIdSchema = z.string().uuid();
const headingLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const headingBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("heading"),
    level: headingLevelSchema,
    text: z.string().min(1),
    style: textStyleSchema.optional(),
  })
  .strict();

export const paragraphBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("paragraph"),
    text: z.string().min(1),
    style: textStyleSchema.optional(),
  })
  .strict();

export const blockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
]);

export type HeadingBlock = z.infer<typeof headingBlockSchema>;
export type ParagraphBlock = z.infer<typeof paragraphBlockSchema>;
export type Block = z.infer<typeof blockSchema>;
