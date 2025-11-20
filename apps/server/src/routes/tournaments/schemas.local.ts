// Local schema constants and types migrated from Drizzle definitions

export const tournamentStatuses = ["UPCOMING", "ONGOING", "COMPLETED"] as const;
export type TournamentStatus = (typeof tournamentStatuses)[number];

export const tournamentStageStatuses = ["PENDING", "ACTIVE", "COMPLETED"] as const;
export type TournamentStageStatus = (typeof tournamentStageStatuses)[number];

export const tournamentStageTypes = [
  "FIRST_ROUND",
  "SEMI_FINAL_ROUND_ROBIN",
  "FINAL_DOUBLE_ELIMINATION",
] as const;
export type TournamentStageType = (typeof tournamentStageTypes)[number];

export const matchStatuses = [
  "SCHEDULED",
  "READY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
] as const;
export type MatchStatus = (typeof matchStatuses)[number];

export const matchRobotStatuses = ["PASS", "FAIL"] as const;
export type MatchRobotStatus = (typeof matchRobotStatuses)[number];

export const matchTypes = ["NORMAL", "SURROGATE"] as const;
export type MatchType = (typeof matchTypes)[number];

export const matchFormats = ["ROUND_ROBIN", "DOUBLE_ELIMINATION", "CUSTOM"] as const;
export type MatchFormat = (typeof matchFormats)[number];

export const tournamentFieldRoles = ["TSO", "HEAD_REFEREE", "SCORE_KEEPER", "QUEUER"] as const;
export type TournamentFieldRole = (typeof tournamentFieldRoles)[number];

export const tournamentRegistrationStatuses = [
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;
export type TournamentRegistrationStatus = (typeof tournamentRegistrationStatuses)[number];

export const tournamentRegistrationStepTypes = ["INFO", "FILE_UPLOAD", "CONSENT"] as const;
export type TournamentRegistrationStepType = (typeof tournamentRegistrationStepTypes)[number];

export const tournamentRegistrationSubmissionStatuses = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

export const tournamentResourceTypes = ["DOCUMENT", "LAW", "MANUAL", "TUTORIAL", "OTHER"] as const;
export type TournamentResourceType = (typeof tournamentResourceTypes)[number];

