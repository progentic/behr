import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { pageVersions } from "./page-versions";
import { pages } from "./pages";

export const previewTokens = pgTable("preview_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  pageId: uuid("page_id")
    .notNull()
    .unique()
    .references(() => pages.id, { onDelete: "cascade" }),
  versionId: uuid("version_id")
    .notNull()
    .references(() => pageVersions.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
