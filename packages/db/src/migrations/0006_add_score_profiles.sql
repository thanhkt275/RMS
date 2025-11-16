CREATE TABLE `score_profile` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `definition` text NOT NULL,
  `created_by` text,
  `updated_by` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch('now')),
  `updated_at` integer NOT NULL DEFAULT (unixepoch('now')),
  FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);

ALTER TABLE `tournament`
ADD COLUMN `score_profile_id` text REFERENCES `score_profile`(`id`) ON DELETE SET NULL;
