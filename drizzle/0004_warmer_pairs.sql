CREATE TABLE "warmer_pairs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_a" text NOT NULL,
	"session_b" text NOT NULL,
	"interval_min_minutes" integer DEFAULT 30 NOT NULL,
	"interval_max_minutes" integer DEFAULT 180 NOT NULL,
	"active_hour_start" integer DEFAULT 8 NOT NULL,
	"active_hour_end" integer DEFAULT 21 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_turn" text DEFAULT 'a' NOT NULL,
	"last_message_at" timestamp with time zone,
	"next_due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"messages_sent" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
