CREATE TABLE "themes" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"color_scheme" text NOT NULL,
	"font_family" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;