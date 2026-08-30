import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { sites } from "./sites";

export const domains = pgTable("domains", {
  hostname: text("hostname").primaryKey(),
  siteId: uuid("site_id")
    .notNull()
    .unique()
    .references(() => sites.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
