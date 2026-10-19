CREATE TABLE IF NOT EXISTS "auto_resume_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"trigger" text DEFAULT 'reconnect',
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"messages_sent" integer DEFAULT 0,
	"queued_remaining" integer DEFAULT 0,
	"stop_reason" text,
	"detail" text,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "broadcast_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"total_targets" integer NOT NULL,
	"total_sent" integer DEFAULT 0,
	"batch_sent" integer DEFAULT 0,
	"current_batch" integer DEFAULT 1,
	"total_batches" integer DEFAULT 1,
	"is_on_break" boolean DEFAULT false,
	"break_end_time" timestamp with time zone,
	"is_outside_time_window" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "send_counters" (
	"number_id" text NOT NULL,
	"day" text NOT NULL,
	"sent" integer DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Tabel ini mungkin sudah dibuat lewat `db:push` tanpa primary key, dan
-- claimQuota lama bisa menyisipkan baris ganda per (number_id, day). Gabungkan
-- dulu (ambil jumlah terbesar per hari), lalu pasang primary key.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'send_counters'::regclass AND contype = 'p'
	) THEN
		CREATE TEMP TABLE _send_counters_merged ON COMMIT DROP AS
			SELECT number_id, day, MAX(COALESCE(sent, 0)) AS sent, MAX(updated_at) AS updated_at
			FROM send_counters GROUP BY number_id, day;
		DELETE FROM send_counters;
		INSERT INTO send_counters (number_id, day, sent, updated_at)
			SELECT number_id, day, sent, updated_at FROM _send_counters_merged;
		ALTER TABLE send_counters ADD CONSTRAINT "send_counters_number_id_day_pk" PRIMARY KEY (number_id, day);
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warmup_numbers" (
	"number_id" text PRIMARY KEY NOT NULL,
	"label" text,
	"paired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"daily_limit_override" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_resume_runs" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL;
