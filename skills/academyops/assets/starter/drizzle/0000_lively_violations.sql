CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`commission_type` text DEFAULT 'percent' NOT NULL,
	`commission_value` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agents_name` ON `agents` (`name`);--> statement-breakpoint
CREATE INDEX `idx_agents_active` ON `agents` (`active`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_user_date` ON `audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `commissions` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`basis_cents` integer NOT NULL,
	`rate_bps` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`settled_month` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_commissions_enrollment` ON `commissions` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `idx_commissions_agent_status` ON `commissions` (`agent_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_commissions_settled_month` ON `commissions` (`settled_month`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '常规课程' NOT NULL,
	`standard_price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`unit_label` text DEFAULT '课时' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_courses_name_currency` ON `courses` (`name`,`currency`);--> statement-breakpoint
CREATE INDEX `idx_courses_active` ON `courses` (`active`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`student_id` text NOT NULL,
	`course_id` text NOT NULL,
	`salesperson_user_id` text NOT NULL,
	`agent_id` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`list_amount_cents` integer NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`net_amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`registered_at` text NOT NULL,
	`start_date` text,
	`expected_end_date` text,
	`actual_end_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_enrollments_number` ON `enrollments` (`number`);--> statement-breakpoint
CREATE INDEX `idx_enrollments_student` ON `enrollments` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_enrollments_salesperson_date` ON `enrollments` (`salesperson_user_id`,`registered_at`);--> statement-breakpoint
CREATE INDEX `idx_enrollments_agent_date` ON `enrollments` (`agent_id`,`registered_at`);--> statement-breakpoint
CREATE INDEX `idx_enrollments_end_date` ON `enrollments` (`expected_end_date`);--> statement-breakpoint
CREATE TABLE `guardians` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`relationship` text DEFAULT '家长' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_guardians_phone` ON `guardians` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_guardians_email` ON `guardians` (`email`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`type` text DEFAULT 'customer' NOT NULL,
	`enrollment_id` text,
	`agent_id` text,
	`period` text,
	`currency` text NOT NULL,
	`total_cents` integer NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`snapshot_json` text NOT NULL,
	`object_key` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invoices_number` ON `invoices` (`number`);--> statement-breakpoint
CREATE INDEX `idx_invoices_enrollment` ON `invoices` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_agent_period` ON `invoices` (`agent_id`,`period`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'pending' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_user_id` ON `members` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_members_role_status` ON `members` (`role`,`status`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`paid_at` text NOT NULL,
	`method` text DEFAULT '银行转账' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_payments_enrollment` ON `payments` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_paid_at` ON `payments` (`paid_at`);--> statement-breakpoint
CREATE INDEX `idx_payments_status` ON `payments` (`status`);--> statement-breakpoint
CREATE TABLE `student_guardians` (
	`student_id` text NOT NULL,
	`guardian_id` text NOT NULL,
	`is_primary` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guardian_id`) REFERENCES `guardians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_student_guardian_unique` ON `student_guardians` (`student_id`,`guardian_id`);--> statement-breakpoint
CREATE INDEX `idx_student_guardians_guardian` ON `student_guardians` (`guardian_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`full_name` text NOT NULL,
	`english_name` text DEFAULT '' NOT NULL,
	`date_of_birth` text,
	`school` text DEFAULT '' NOT NULL,
	`grade` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`owner_user_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_students_code` ON `students` (`code`);--> statement-breakpoint
CREATE INDEX `idx_students_name` ON `students` (`full_name`);--> statement-breakpoint
CREATE INDEX `idx_students_owner` ON `students` (`owner_user_id`);