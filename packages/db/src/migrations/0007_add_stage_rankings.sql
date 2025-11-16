CREATE TABLE `tournament_stage_ranking` (
  `id` text PRIMARY KEY NOT NULL,
  `stage_id` text NOT NULL,
  `organization_id` text NOT NULL,
  `rank` integer NOT NULL DEFAULT 0,
  `games_played` integer NOT NULL DEFAULT 0,
  `wins` integer NOT NULL DEFAULT 0,
  `losses` integer NOT NULL DEFAULT 0,
  `ties` integer NOT NULL DEFAULT 0,
  `ranking_points` integer NOT NULL DEFAULT 0,
  `autonomous_points` integer NOT NULL DEFAULT 0,
  `strength_points` integer NOT NULL DEFAULT 0,
  `total_score` integer NOT NULL DEFAULT 0,
  `lose_rate` real NOT NULL DEFAULT 0,
  `score_data` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch('now')),
  `updated_at` integer NOT NULL DEFAULT (unixepoch('now')),
  FOREIGN KEY (`stage_id`) REFERENCES `tournament_stage`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX `stage_ranking_stage_team_idx`
  ON `tournament_stage_ranking` (`stage_id`, `organization_id`);
