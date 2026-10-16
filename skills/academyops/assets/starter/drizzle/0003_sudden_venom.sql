CREATE TABLE `student_followups` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`salesperson_user_id` text NOT NULL,
	`followed_at` text NOT NULL,
	`method` text DEFAULT '微信' NOT NULL,
	`note` text NOT NULL,
	`next_follow_up_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_student_followups_student_date` ON `student_followups` (`student_id`,`followed_at`);--> statement-breakpoint
CREATE INDEX `idx_student_followups_sales_date` ON `student_followups` (`salesperson_user_id`,`followed_at`);--> statement-breakpoint
CREATE INDEX `idx_student_followups_next_date` ON `student_followups` (`next_follow_up_at`);--> statement-breakpoint
ALTER TABLE `enrollments` ADD `registration_type` text DEFAULT 'new' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_enrollments_type_currency_date` ON `enrollments` (`registration_type`,`currency`,`registered_at`);--> statement-breakpoint
ALTER TABLE `guardians` ADD `wechat_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `classin_account` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `first_registered_at` text;--> statement-breakpoint
CREATE INDEX `idx_students_classin` ON `students` (`classin_account`);--> statement-breakpoint
CREATE INDEX `idx_students_first_registered` ON `students` (`first_registered_at`);