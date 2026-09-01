import { z } from "zod";

export const themeColorSchemeSchema = z.enum(["light", "dark"]);
export const themeFontFamilySchema = z.enum(["sans", "serif"]);

export const themeTokensSchema = z
  .object({
    colorScheme: themeColorSchemeSchema,
    fontFamily: themeFontFamilySchema,
  })
  .strict();

export const DEFAULT_THEME_TOKENS = {
  colorScheme: "light",
  fontFamily: "sans",
} as const;

export type ThemeColorScheme = z.infer<typeof themeColorSchemeSchema>;
export type ThemeFontFamily = z.infer<typeof themeFontFamilySchema>;
export type ThemeTokens = z.infer<typeof themeTokensSchema>;
