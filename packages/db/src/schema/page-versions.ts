import {
  customType,
  index,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { pages } from "./pages";

const bunJsonb = customType<{ data: unknown; driverData: unknown }>({
  dataType: () => "jsonb",
});

export const pageVersions = pgTable(
  "page_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    document: bunJsonb("document").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("page_versions_page_id_idx").on(table.pageId)],
);
