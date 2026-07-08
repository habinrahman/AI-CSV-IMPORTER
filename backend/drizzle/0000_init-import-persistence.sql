CREATE TYPE "public"."crm_lead_status" AS ENUM('GOOD_LEAD_FOLLOW_UP', 'DID_NOT_CONNECT', 'BAD_LEAD', 'SALE_DONE');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('queued', 'parsing', 'mapping', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "crm_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"lead_created_at" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"country_code" text NOT NULL,
	"mobile_without_country_code" text NOT NULL,
	"company" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"country" text NOT NULL,
	"lead_owner" text NOT NULL,
	"crm_status" "crm_lead_status",
	"crm_note" text NOT NULL,
	"data_source" text NOT NULL,
	"possession_time" text NOT NULL,
	"description" text NOT NULL,
	"confidence" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failed_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"message" text NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" "import_job_status" NOT NULL,
	"progress" jsonb NOT NULL,
	"error" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failed_records" ADD CONSTRAINT "failed_records_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_records_job_id_idx" ON "crm_records" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "crm_records_email_idx" ON "crm_records" USING btree ("email");--> statement-breakpoint
CREATE INDEX "failed_records_job_id_idx" ON "failed_records" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "import_jobs_created_at_idx" ON "import_jobs" USING btree ("created_at" DESC NULLS LAST);