import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { pageVersions } from "./page-versions";
import { pages } from "./pages";

export const pagePublications = pgTable("page_publications", {
  id: uuid("id").defaultRandom().primaryKey(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => pages.id),
  versionId: uuid("version_id")
    .notNull()
    .references(() => pageVersions.id),
  publishedByUserId: text("published_by_user_id")
    .notNull()
    .references(() => user.id),
  publishedAt: timestamp("published_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
