CREATE TABLE `tournament_match_new` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text,
	`stage_id` text,
	`round` text,
	`status` text NOT NULL DEFAULT 'SCHEDULED',
	`scheduled_at` integer,
	`home_team_id` text,
	`away_team_id` text,
	`home_placeholder` text,
	`away_placeholder` text,
	`home_score` integer,
	`away_score` integer,
	`created_at` integer NOT NULL DEFAULT (unixepoch('now')),
	`updated_at` integer NOT NULL DEFAULT (unixepoch('now')),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournament`(`id`) ON DELETE set null,
	FOREIGN KEY (`stage_id`) REFERENCES `tournament_stage`(`id`) ON DELETE set null,
	FOREIGN KEY (`home_team_id`) REFERENCES `organization`(`id`) ON DELETE cascade,
	FOREIGN KEY (`away_team_id`) REFERENCES `organization`(`id`) ON DELETE cascade
);

INSERT INTO `tournament_match_new` (
	`id`,
	`tournament_id`,
	`stage_id`,
	`round`,
	`status`,
	`scheduled_at`,
	`home_team_id`,
	`away_team_id`,
	`home_score`,
	`away_score`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`tournament_id`,
	`stage_id`,
	`round`,
	`status`,
	`scheduled_at`,
	`home_team_id`,
	`away_team_id`,
	`home_score`,
	`away_score`,
	`created_at`,
	`updated_at`
FROM `tournament_match`;

DROP TABLE `tournament_match`;
ALTER TABLE `tournament_match_new` RENAME TO `tournament_match`;
