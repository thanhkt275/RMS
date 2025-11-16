CREATE TABLE IF NOT EXISTS `tournament_stage` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL DEFAULT 'FIRST_ROUND',
	`stage_order` integer NOT NULL DEFAULT 1,
	`status` text NOT NULL DEFAULT 'PENDING',
	`configuration` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL DEFAULT (unixepoch('now')),
	`updated_at` integer NOT NULL DEFAULT (unixepoch('now')),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournament`(`id`) ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `tournament_stage_team` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`seed` integer,
	`created_at` integer NOT NULL DEFAULT (unixepoch('now')),
	FOREIGN KEY (`stage_id`) REFERENCES `tournament_stage`(`id`) ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `tournament_stage_team_unique_idx`
ON `tournament_stage_team`(`stage_id`, `organization_id`);

ALTER TABLE `tournament_match`
ADD COLUMN `stage_id` text REFERENCES `tournament_stage`(`id`) ON DELETE set null;
