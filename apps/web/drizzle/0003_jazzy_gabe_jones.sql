CREATE TABLE "monitor_events" (
	"id" text PRIMARY KEY NOT NULL,
	"monitor_id" text NOT NULL,
	"commit_sha" text NOT NULL,
	"added" jsonb NOT NULL,
	"changed" jsonb NOT NULL,
	"removed" jsonb NOT NULL,
	"report_id" text,
	"status" text,
	"scan_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"repo_key" text NOT NULL,
	"branch" text NOT NULL,
	"commit_sha" text NOT NULL,
	"agent_files" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "monitor_events" ADD CONSTRAINT "monitor_events_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_events" ADD CONSTRAINT "monitor_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitor_events_monitor_idx" ON "monitor_events" USING btree ("monitor_id","created_at");--> statement-breakpoint
CREATE INDEX "monitor_events_pending_idx" ON "monitor_events" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "monitors_repo_key_idx" ON "monitors" USING btree ("repo_key");--> statement-breakpoint
CREATE INDEX "monitors_checked_idx" ON "monitors" USING btree ("status","checked_at");