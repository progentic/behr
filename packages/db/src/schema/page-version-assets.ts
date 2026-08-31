import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { assets } from "./assets";
import { pageVersions } from "./page-versions";

export const pageVersionAssets = pgTable(
  "page_version_assets",
  {
    pageVersionId: uuid("page_version_id")
      .notNull()
      .references(() => pageVersions.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
  },
  (table) => [
    primaryKey({
      name: "page_version_assets_page_version_id_asset_id_pk",
      columns: [table.pageVersionId, table.assetId],
    }),
    index("page_version_assets_asset_id_idx").on(table.assetId),
  ],
);
