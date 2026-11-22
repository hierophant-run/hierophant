CREATE TABLE "finding_feedback" (
	"report_id" text NOT NULL,
	"position" integer NOT NULL,
	"reason" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finding_feedback_report_id_position_reason_pk" PRIMARY KEY("report_id","position","reason")
);
--> statement-breakpoint
ALTER TABLE "finding_feedback" ADD CONSTRAINT "finding_feedback_report_id_position_report_findings_report_id_position_fk" FOREIGN KEY ("report_id","position") REFERENCES "public"."report_findings"("report_id","position") ON DELETE cascade ON UPDATE no action;