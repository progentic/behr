import { z } from "zod";

export const publishStatusSchema = z.enum(["published", "unchanged"]);

export const publishResponseSchema = z
  .object({
    status: publishStatusSchema,
  })
  .strict();

export type PublishResponse = z.infer<typeof publishResponseSchema>;
