ALTER TABLE `students` ADD `source_kind` text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `referral_parent_wechat` text DEFAULT '' NOT NULL;