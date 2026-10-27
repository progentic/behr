-- Validate and enforce the new identity key before relaxing the old constraints.
-- Duplicate provider/account pairs fail here; no rows are merged or rewritten.
CREATE UNIQUE INDEX "account_provider_account_id_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "account_issuer_account_id_uidx";
