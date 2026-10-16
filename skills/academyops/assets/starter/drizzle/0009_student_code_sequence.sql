CREATE TABLE `student_code_counters` (
	`year` integer PRIMARY KEY NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
UPDATE `students` SET `code` = 'LEGACY-' || `id`;
--> statement-breakpoint
WITH `ranked_students` AS (
	SELECT
		`id`,
		CAST(strftime('%Y', `created_at`) AS INTEGER) AS `code_year`,
		ROW_NUMBER() OVER (
			PARTITION BY strftime('%Y', `created_at`)
			ORDER BY datetime(`created_at`), `id`
		) AS `sequence_number`
	FROM `students`
)
UPDATE `students`
SET `code` = (
	SELECT
		'STU-' || substr(CAST(`code_year` AS TEXT), 3, 2) || '-' || printf('%04d', `sequence_number`)
	FROM `ranked_students`
	WHERE `ranked_students`.`id` = `students`.`id`
);
--> statement-breakpoint
INSERT INTO `student_code_counters` (`year`, `last_number`)
SELECT
	CAST(strftime('%Y', `created_at`) AS INTEGER),
	COUNT(*)
FROM `students`
GROUP BY strftime('%Y', `created_at`);
