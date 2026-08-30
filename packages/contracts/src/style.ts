import { z } from "zod";

export const spacingTokenSchema = z.enum(["none", "sm", "md", "lg"]);
export const textAlignTokenSchema = z.enum(["left", "center", "right"]);
export const contentWidthTokenSchema = z.enum(["narrow", "standard", "wide"]);

export const sectionStyleSchema = z
  .object({
    spacing: spacingTokenSchema.optional(),
    width: contentWidthTokenSchema.optional(),
  })
  .strict();

export const textStyleSchema = z
  .object({
    align: textAlignTokenSchema.optional(),
  })
  .strict();

export type SpacingToken = z.infer<typeof spacingTokenSchema>;
export type TextAlignToken = z.infer<typeof textAlignTokenSchema>;
export type ContentWidthToken = z.infer<typeof contentWidthTokenSchema>;
export type SectionStyle = z.infer<typeof sectionStyleSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
