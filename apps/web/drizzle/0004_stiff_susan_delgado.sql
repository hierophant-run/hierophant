ALTER TABLE "monitors" ADD COLUMN "kind" text DEFAULT 'repo' NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "target" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "last_status" text;