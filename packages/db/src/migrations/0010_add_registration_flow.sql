ALTER TABLE `tournament_participation`
ADD COLUMN `status` text NOT NULL DEFAULT 'IN_PROGRESS';

UPDATE `tournament_participation`
SET `status` = 'APPROVED'
WHERE `status` = 'IN_PROGRESS';

ALTER TABLE `tournament_participation`
ADD COLUMN `consent_accepted_at` integer;

ALTER TABLE `tournament_participation`
ADD COLUMN `consent_accepted_by` text REFERENCES `user`(`id`) ON DELETE SET NULL;

CREATE TABLE `tournament_registration_step` (
  `id` text PRIMARY KEY NOT NULL,
  `tournament_id` text NOT NULL REFERENCES `tournament`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `description` text,
  `step_type` text NOT NULL DEFAULT 'INFO',
  `is_required` integer NOT NULL DEFAULT 1,
  `step_order` integer NOT NULL DEFAULT 1,
  `metadata` text,
  `created_by` text REFERENCES `user`(`id`) ON DELETE SET NULL,
  `updated_by` text REFERENCES `user`(`id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch('now')),
  `updated_at` integer NOT NULL DEFAULT (unixepoch('now'))
);

CREATE TABLE `tournament_registration_submission` (
  `id` text PRIMARY KEY NOT NULL,
  `tournament_id` text NOT NULL REFERENCES `tournament`(`id`) ON DELETE CASCADE,
  `participation_id` text NOT NULL REFERENCES `tournament_participation`(`id`) ON DELETE CASCADE,
  `organization_id` text NOT NULL REFERENCES `organization`(`id`) ON DELETE CASCADE,
  `step_id` text NOT NULL REFERENCES `tournament_registration_step`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL DEFAULT 'PENDING',
  `payload` text,
  `submitted_at` integer,
  `submitted_by` text REFERENCES `user`(`id`) ON DELETE SET NULL,
  `reviewed_at` integer,
  `reviewed_by` text REFERENCES `user`(`id`) ON DELETE SET NULL,
  `review_notes` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch('now')),
  `updated_at` integer NOT NULL DEFAULT (unixepoch('now'))
);

CREATE UNIQUE INDEX `registration_submission_unique_idx`
ON `tournament_registration_submission` (`participation_id`, `step_id`);
