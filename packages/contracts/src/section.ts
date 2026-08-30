import { z } from "zod";

import { blockSchema } from "./block";
import { sectionStyleSchema } from "./style";

export const sectionSchema = z
  .object({
    id: z.string().uuid(),
    style: sectionStyleSchema.optional(),
    blocks: z.array(blockSchema),
  })
  .strict();

export type Section = z.infer<typeof sectionSchema>;
