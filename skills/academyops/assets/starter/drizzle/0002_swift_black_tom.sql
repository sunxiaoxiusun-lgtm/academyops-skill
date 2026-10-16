CREATE TABLE `ai_import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_text` text DEFAULT '' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`mime_type` text DEFAULT '' NOT NULL,
	`object_key` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`extracted_json` text DEFAULT '{}' NOT NULL,
	`error_message` text DEFAULT '' NOT NULL,
	`imported_ids_json` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_import_jobs_user_date` ON `ai_import_jobs` (`created_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_import_jobs_status` ON `ai_import_jobs` (`status`);