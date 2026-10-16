CREATE TABLE `student_class_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`class_group_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`removed_at` text,
	`roster_exported_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_group_id`) REFERENCES `class_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_student_class_membership_unique` ON `student_class_memberships` (`student_id`,`class_group_id`);--> statement-breakpoint
CREATE INDEX `idx_student_class_membership_class_status` ON `student_class_memberships` (`class_group_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_student_class_membership_student_status` ON `student_class_memberships` (`student_id`,`status`);