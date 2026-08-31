CREATE TABLE "page_version_assets" (
	"page_version_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "page_version_assets_page_version_id_asset_id_pk" PRIMARY KEY("page_version_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "page_version_assets" ADD CONSTRAINT "page_version_assets_page_version_id_page_versions_id_fk" FOREIGN KEY ("page_version_id") REFERENCES "public"."page_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_version_assets" ADD CONSTRAINT "page_version_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_version_assets_asset_id_idx" ON "page_version_assets" USING btree ("asset_id");