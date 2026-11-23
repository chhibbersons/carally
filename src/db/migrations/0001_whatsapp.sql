CREATE TYPE "public"."cost_category" AS ENUM('service', 'utility', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."message_sender" AS ENUM('buyer', 'ai', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"name" text,
	"language_pref" text,
	"opted_out" boolean DEFAULT false NOT NULL,
	"opted_out_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_dealer_phone_unique" UNIQUE("dealer_id","phone_e164")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"ai_paused" boolean DEFAULT false NOT NULL,
	"paused_by" uuid,
	"paused_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_dealer_contact_unique" UNIQUE("dealer_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"sender" "message_sender" NOT NULL,
	"type" text NOT NULL,
	"body" text,
	"media" jsonb,
	"wa_message_id" text,
	"template_name" text,
	"status" "message_status",
	"error" text,
	"cost_category" "cost_category",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_updated_at" timestamp with time zone,
	CONSTRAINT "messages_dealer_wa_message_id_unique" UNIQUE("dealer_id","wa_message_id")
);
--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "wa_access_token_enc" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_paused_by_users_id_fk" FOREIGN KEY ("paused_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_dealer_conversation_created_idx" ON "messages" USING btree ("dealer_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_dealer_created_idx" ON "messages" USING btree ("dealer_id","created_at");--> statement-breakpoint
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_wa_phone_number_id_unique" UNIQUE("whatsapp_phone_number_id");