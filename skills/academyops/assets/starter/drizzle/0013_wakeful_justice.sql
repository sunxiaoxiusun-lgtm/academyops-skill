ALTER TABLE `courses` ADD `created_by` text;--> statement-breakpoint
UPDATE `courses`
SET `created_by` = (
	SELECT `user_id` FROM `audit_logs`
	WHERE `entity_type` = 'course'
		AND `entity_id` = `courses`.`id`
		AND `action` = 'create'
	ORDER BY `created_at` ASC
	LIMIT 1
)
WHERE `created_by` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_courses_created_by` ON `courses` (`created_by`);--> statement-breakpoint
CREATE INDEX `idx_class_groups_created_by` ON `class_groups` (`created_by`);
