CREATE TABLE `tournament_field_assignment` (
  `id` text PRIMARY KEY NOT NULL,
  `tournament_id` text NOT NULL,
  `field_number` integer NOT NULL,
  `role` text NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch('now')),
  `updated_at` integer NOT NULL DEFAULT (unixepoch('now')),
  FOREIGN KEY (`tournament_id`) REFERENCES `tournament`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX `tournament_field_assignment_unique_idx`
ON `tournament_field_assignment` (`tournament_id`, `field_number`, `role`);
