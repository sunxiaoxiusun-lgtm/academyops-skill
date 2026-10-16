CREATE TABLE `enrollment_class_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`class_group_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`removed_at` text,
	`roster_exported_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_group_id`) REFERENCES `class_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_enrollment_class_membership_unique` ON `enrollment_class_memberships` (`enrollment_id`,`class_group_id`);--> statement-breakpoint
CREATE INDEX `idx_enrollment_class_membership_class_status` ON `enrollment_class_memberships` (`class_group_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_enrollment_class_membership_enrollment_status` ON `enrollment_class_memberships` (`enrollment_id`,`status`);