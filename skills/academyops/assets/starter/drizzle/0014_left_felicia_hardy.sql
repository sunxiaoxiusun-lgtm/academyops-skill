CREATE TABLE `writing_assessment_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `writing_assessments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_writing_assessment_messages_session_date` ON `writing_assessment_messages` (`assessment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `writing_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`student_name` text DEFAULT '待补充' NOT NULL,
	`school_system` text DEFAULT '' NOT NULL,
	`school_name` text DEFAULT '' NOT NULL,
	`grade` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`recommended_cw_level` text DEFAULT '' NOT NULL,
	`recommended_gw_level` text DEFAULT '' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`parent_message` text DEFAULT '' NOT NULL,
	`recommendation_json` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_writing_assessments_user_date` ON `writing_assessments` (`created_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_writing_assessments_status` ON `writing_assessments` (`status`);