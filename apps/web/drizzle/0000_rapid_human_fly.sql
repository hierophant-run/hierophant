CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "report_findings" (
	"report_id" text NOT NULL,
	"position" integer NOT NULL,
	"rule_id" text NOT NULL,
	"severity" text NOT NULL,
	"path" text NOT NULL,
	"line" integer NOT NULL,
	"column" integer,
	CONSTRAINT "report_findings_report_id_position_pk" PRIMARY KEY("report_id","position")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"repo_key" text NOT NULL,
	"commit_sha" text NOT NULL,
	"ruleset_version" text NOT NULL,
	"status" text NOT NULL,
	"files_scanned" integer NOT NULL,
	"impact" jsonb NOT NULL,
	"skipped" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_findings" ADD CONSTRAINT "report_findings_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "report_findings_rule_idx" ON "report_findings" USING btree ("rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_repo_commit_ruleset_idx" ON "reports" USING btree ("repo_key","commit_sha","ruleset_version");