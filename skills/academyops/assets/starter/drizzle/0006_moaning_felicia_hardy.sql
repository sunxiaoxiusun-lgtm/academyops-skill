CREATE TABLE `class_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`classin_class_name` text DEFAULT '' NOT NULL,
	`teacher_name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`schedule_type` text DEFAULT 'weekly' NOT NULL,
	`class_time` text DEFAULT '' NOT NULL,
	`specific_dates` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_class_groups_course_status` ON `class_groups` (`course_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_class_groups_start_date` ON `class_groups` (`start_date`);--> statement-breakpoint
ALTER TABLE `enrollments` ADD `class_group_id` text REFERENCES class_groups(id);--> statement-breakpoint
ALTER TABLE `enrollments` ADD `roster_exported_at` text;--> statement-breakpoint
CREATE INDEX `idx_enrollments_class_status` ON `enrollments` (`class_group_id`,`status`);