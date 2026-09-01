import { pgTable, text, uuid } from "drizzle-orm/pg-core";

import { sites } from "./sites";

export const themes = pgTable("themes", {
  siteId: uuid("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  colorScheme: text("color_scheme").notNull(),
  fontFamily: text("font_family").notNull(),
});
