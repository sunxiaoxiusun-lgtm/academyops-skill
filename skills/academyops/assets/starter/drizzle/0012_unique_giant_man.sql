CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`requested_at` text NOT NULL,
	`refunded_at` text,
	`last_lesson_date` text NOT NULL,
	`method` text DEFAULT '银行转账' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`proof_object_key` text,
	`proof_file_name` text,
	`proof_content_type` text,
	`created_by` text NOT NULL,
	`confirmed_by` text,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_refunds_enrollment_status` ON `refunds` (`enrollment_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_refunds_refunded_at` ON `refunds` (`refunded_at`);