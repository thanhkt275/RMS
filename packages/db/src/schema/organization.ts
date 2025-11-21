import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const organizationStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type OrganizationStatus = (typeof organizationStatuses)[number];

export const organizationMemberRoles = [
  "TEAM_MENTOR",
  "TEAM_LEADER",
  "TEAM_MEMBER",
] as const;
export type OrganizationMemberRole = (typeof organizationMemberRoles)[number];

export const organizationInvitationStatuses = [
  "pending",
  "accepted",
  "rejected",
  "canceled",
] as const;
export type OrganizationInvitationStatus =
  (typeof organizationInvitationStatuses)[number];

export const organizations = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  coverImage: text("cover_image"),
  description: text("description"),
  location: text("location"),
  teamNumber: text("team_number"),
  status: text("status")
    .$type<OrganizationStatus>()
    .notNull()
    .default("ACTIVE"),
  metadata: text("metadata"),
  createdBy: text("created_by").references(() => user.id),
  updatedBy: text("updated_by").references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
});

export const organizationMembers = sqliteTable(
  "organization_member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role")
      .$type<OrganizationMemberRole>()
      .notNull()
      .default("TEAM_MEMBER"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
  },
  (table) => ({
    uniqueOrganizationMember: uniqueIndex(
      "organization_member_org_user_idx"
    ).on(table.organizationId, table.userId),
  })
);

export const organizationInvitations = sqliteTable("organization_invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role")
    .$type<OrganizationMemberRole>()
    .notNull()
    .default("TEAM_MEMBER"),
  status: text("status")
    .$type<OrganizationInvitationStatus>()
    .notNull()
    .default("pending"),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
});

export const scoreProfilePartTypes = ["NUMBER", "BOOLEAN"] as const;
export type ScoreProfilePartType = (typeof scoreProfilePartTypes)[number];

export type ScoreProfileCooperativeBonus = {
  requiredTeamCount: 2 | 4 | 6;
  bonusPoints: number;
  appliesTo: "ALL_TEAMS" | "PER_TEAM";
  description?: string;
};

export const scoreProfilePenaltyTargets = ["SELF", "OPPONENT"] as const;
export type ScoreProfilePenaltyTarget =
  (typeof scoreProfilePenaltyTargets)[number];

export const scoreProfilePenaltyDirections = ["ADD", "SUBTRACT"] as const;
export type ScoreProfilePenaltyDirection =
  (typeof scoreProfilePenaltyDirections)[number];

export type ScoreProfilePenaltyRule = {
  id: string;
  label: string;
  description?: string;
  points: number;
  target: ScoreProfilePenaltyTarget;
  direction: ScoreProfilePenaltyDirection;
};

export type NumberScoreProfilePart = {
  id: string;
  label: string;
  description?: string;
  type: "NUMBER";
  pointsPerUnit: number;
  maxValue?: number | null;
  cooperativeBonus?: ScoreProfileCooperativeBonus | null;
};

export type BooleanScoreProfilePart = {
  id: string;
  label: string;
  description?: string;
  type: "BOOLEAN";
  truePoints: number;
  cooperativeBonus?: ScoreProfileCooperativeBonus | null;
};

export type ScoreProfilePartDefinition =
  | NumberScoreProfilePart
  | BooleanScoreProfilePart;

export type ScoreProfileConfiguration = {
  version: number;
  parts: ScoreProfilePartDefinition[];
  penalties: ScoreProfilePenaltyRule[];
  totalFormula: string;
  notes?: string;
};

export const scoreProfiles = sqliteTable("score_profile", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  definition: text("definition", { mode: "json" })
    .$type<ScoreProfileConfiguration>()
    .notNull(),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
});

export const tournamentStatuses = ["UPCOMING", "ONGOING", "COMPLETED"] as const;
export type TournamentStatus = (typeof tournamentStatuses)[number];

export const tournamentStageStatuses = [
  "PENDING",
  "ACTIVE",
  "COMPLETED",
] as const;
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

export const matchFormats = [
  "ROUND_ROBIN",
  "DOUBLE_ELIMINATION",
  "CUSTOM",
] as const;
export type MatchFormat = (typeof matchFormats)[number];

export const tournamentFieldRoles = [
  "TSO",
  "HEAD_REFEREE",
  "SCORE_KEEPER",
  "QUEUER",
] as const;
export type TournamentFieldRole = (typeof tournamentFieldRoles)[number];

export const tournamentRegistrationStatuses = [
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;
export type TournamentRegistrationStatus =
  (typeof tournamentRegistrationStatuses)[number];

export const tournamentRegistrationStepTypes = [
  "INFO",
  "FILE_UPLOAD",
  "CONSENT",
] as const;
export type TournamentRegistrationStepType =
  (typeof tournamentRegistrationStepTypes)[number];

export const tournamentRegistrationSubmissionStatuses = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export type TournamentRegistrationSubmissionStatus =
  (typeof tournamentRegistrationSubmissionStatuses)[number];

export const tournaments = sqliteTable("tournament", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status")
    .$type<TournamentStatus>()
    .notNull()
    .default("UPCOMING"),
  season: text("season"),
  location: text("location"),
  organizer: text("organizer"),
  logo: text("logo"),
  coverImage: text("cover_image"),
  description: text("description"),
  announcement: text("announcement"),
  fieldCount: integer("field_count").notNull().default(1),
  registrationDeadline: integer("registration_deadline", {
    mode: "timestamp",
  }),
  startDate: integer("start_date", { mode: "timestamp" }),
  endDate: integer("end_date", { mode: "timestamp" }),
  metadata: text("metadata"),
  scoreProfileId: text("score_profile_id").references(() => scoreProfiles.id, {
    onDelete: "set null",
  }),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
});

export const tournamentFieldAssignments = sqliteTable(
  "tournament_field_assignment",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    fieldNumber: integer("field_number").notNull(),
    role: text("role").$type<TournamentFieldRole>().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
  },
  (table) => ({
    uniqueAssignment: uniqueIndex("tournament_field_assignment_unique_idx").on(
      table.tournamentId,
      table.fieldNumber,
      table.role
    ),
  })
);

export const tournamentResourceTypes = [
  "DOCUMENT",
  "LAW",
  "MANUAL",
  "TUTORIAL",
  "OTHER",
] as const;
export type TournamentResourceType = (typeof tournamentResourceTypes)[number];

export const tournamentResources = sqliteTable("tournament_resource", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  type: text("type")
    .$type<TournamentResourceType>()
    .notNull()
    .default("DOCUMENT"),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
});

export const tournamentParticipations = sqliteTable(
  "tournament_participation",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    registeredBy: text("registered_by").references(() => user.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<TournamentRegistrationStatus>()
      .notNull()
      .default("IN_PROGRESS"),
    consentAcceptedAt: integer("consent_accepted_at", { mode: "timestamp" }),
    consentAcceptedBy: text("consent_accepted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    seed: integer("seed"),
    placement: text("placement"),
    result: text("result"),
    record: text("record"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
  },
  (table) => ({
    uniqueTournamentEntry: uniqueIndex(
      "tournament_participation_unique_idx"
    ).on(table.tournamentId, table.organizationId),
  })
);

export const tournamentStages = sqliteTable("tournament_stage", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type")
    .$type<TournamentStageType>()
    .notNull()
    .default("FIRST_ROUND"),
  stageOrder: integer("stage_order").notNull().default(1),
  status: text("status")
    .$type<TournamentStageStatus>()
    .notNull()
    .default("PENDING"),
  configuration: text("configuration"),
  scoreProfileId: text("score_profile_id").references(() => scoreProfiles.id, {
    onDelete: "set null",
  }),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
});

export const tournamentStageTeams = sqliteTable(
  "tournament_stage_team",
  {
    id: text("id").primaryKey(),
    stageId: text("stage_id")
      .notNull()
      .references(() => tournamentStages.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    seed: integer("seed"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
  },
  (table) => ({
    uniqueStageTeam: uniqueIndex("tournament_stage_team_unique_idx").on(
      table.stageId,
      table.organizationId
    ),
  })
);

export const tournamentRegistrationSteps = sqliteTable(
  "tournament_registration_step",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    stepType: text("step_type")
      .$type<TournamentRegistrationStepType>()
      .notNull()
      .default("INFO"),
    isRequired: integer("is_required", { mode: "boolean" })
      .notNull()
      .default(true),
    stepOrder: integer("step_order").notNull().default(1),
    metadata: text("metadata"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
  }
);

export const tournamentRegistrationSubmissions = sqliteTable(
  "tournament_registration_submission",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    participationId: text("participation_id")
      .notNull()
      .references(() => tournamentParticipations.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stepId: text("step_id")
      .notNull()
      .references(() => tournamentRegistrationSteps.id, {
        onDelete: "cascade",
      }),
    status: text("status")
      .$type<TournamentRegistrationSubmissionStatus>()
      .notNull()
      .default("PENDING"),
    payload: text("payload"),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    submittedBy: text("submitted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewNotes: text("review_notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
  },
  (table) => ({
    uniqueSubmission: uniqueIndex("registration_submission_unique_idx").on(
      table.participationId,
      table.stepId
    ),
  })
);

export const tournamentStageRankings = sqliteTable(
  "tournament_stage_ranking",
  {
    id: text("id").primaryKey(),
    stageId: text("stage_id")
      .notNull()
      .references(() => tournamentStages.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull().default(0),
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    ties: integer("ties").notNull().default(0),
    rankingPoints: integer("ranking_points").notNull().default(0),
    autonomousPoints: integer("autonomous_points").notNull().default(0),
    strengthPoints: integer("strength_points").notNull().default(0),
    totalScore: integer("total_score").notNull().default(0),
    scoreData: text("score_data"),
    loseRate: real("lose_rate").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch('now'))`),
  },
  (table) => ({
    uniqueTeamRanking: uniqueIndex("stage_ranking_stage_team_idx").on(
      table.stageId,
      table.organizationId
    ),
  })
);

export const tournamentMatches = sqliteTable("tournament_match", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").references(() => tournaments.id, {
    onDelete: "set null",
  }),
  stageId: text("stage_id").references(() => tournamentStages.id, {
    onDelete: "set null",
  }),
  round: text("round"),
  status: text("status").$type<MatchStatus>().notNull().default("SCHEDULED"),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  homeTeamId: text("home_team_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  awayTeamId: text("away_team_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  homePlaceholder: text("home_placeholder"),
  awayPlaceholder: text("away_placeholder"),
  metadata: text("metadata"),
  robotStatus: text("robot_status").$type<MatchRobotStatus | null>(),
  homeRobotStatus: text("home_robot_status").$type<MatchRobotStatus | null>(),
  homeRobotNotes: text("home_robot_notes"),
  awayRobotStatus: text("away_robot_status").$type<MatchRobotStatus | null>(),
  awayRobotNotes: text("away_robot_notes"),
  matchType: text("match_type").$type<MatchType>().notNull().default("NORMAL"),
  format: text("format").$type<MatchFormat | null>(),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  homeScoreBreakdown: text("home_score_breakdown", { mode: "json" }),
  awayScoreBreakdown: text("away_score_breakdown", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
});

export const tournamentAchievements = sqliteTable("tournament_achievement", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  tournamentId: text("tournament_id").references(() => tournaments.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description"),
  position: integer("position"),
  awardedAt: integer("awarded_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
});

// Relations
import { relations } from "drizzle-orm";

export const tournamentStagesRelations = relations(
  tournamentStages,
  ({ one, many }) => ({
    tournament: one(tournaments, {
      fields: [tournamentStages.tournamentId],
      references: [tournaments.id],
    }),
    teams: many(tournamentStageTeams),
    matches: many(tournamentMatches),
    rankings: many(tournamentStageRankings),
  })
);

export const tournamentStageTeamsRelations = relations(
  tournamentStageTeams,
  ({ one }) => ({
    stage: one(tournamentStages, {
      fields: [tournamentStageTeams.stageId],
      references: [tournamentStages.id],
    }),
    organization: one(organizations, {
      fields: [tournamentStageTeams.organizationId],
      references: [organizations.id],
    }),
  })
);

export const tournamentMatchesRelations = relations(
  tournamentMatches,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentMatches.tournamentId],
      references: [tournaments.id],
    }),
    stage: one(tournamentStages, {
      fields: [tournamentMatches.stageId],
      references: [tournamentStages.id],
    }),
    homeTeam: one(organizations, {
      fields: [tournamentMatches.homeTeamId],
      references: [organizations.id],
      relationName: "homeTeam",
    }),
    awayTeam: one(organizations, {
      fields: [tournamentMatches.awayTeamId],
      references: [organizations.id],
      relationName: "awayTeam",
    }),
  })
);

export const tournamentsRelations = relations(tournaments, ({ many }) => ({
  stages: many(tournamentStages),
  participations: many(tournamentParticipations),
  resources: many(tournamentResources),
  fieldAssignments: many(tournamentFieldAssignments),
  matches: many(tournamentMatches),
  registrationSteps: many(tournamentRegistrationSteps),
  registrationSubmissions: many(tournamentRegistrationSubmissions),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers, { relationName: "organization" }),
  invitations: many(organizationInvitations, { relationName: "organization" }),
  tournamentParticipations: many(tournamentParticipations),
  stageTeams: many(tournamentStageTeams),
  achievements: many(tournamentAchievements),
}));

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
      relationName: "organization",
    }),
  })
);

export const organizationInvitationsRelations = relations(
  organizationInvitations,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationInvitations.organizationId],
      references: [organizations.id],
      relationName: "organization",
    }),
  })
);

export const tournamentAchievementsRelations = relations(
  tournamentAchievements,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [tournamentAchievements.organizationId],
      references: [organizations.id],
    }),
    tournament: one(tournaments, {
      fields: [tournamentAchievements.tournamentId],
      references: [tournaments.id],
    }),
  })
);

export const tournamentFieldAssignmentsRelations = relations(
  tournamentFieldAssignments,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentFieldAssignments.tournamentId],
      references: [tournaments.id],
    }),
  })
);

export const tournamentParticipationsRelations = relations(
  tournamentParticipations,
  ({ one, many }) => ({
    tournament: one(tournaments, {
      fields: [tournamentParticipations.tournamentId],
      references: [tournaments.id],
    }),
    organization: one(organizations, {
      fields: [tournamentParticipations.organizationId],
      references: [organizations.id],
    }),
    submissions: many(tournamentRegistrationSubmissions),
  })
);

export const tournamentResourcesRelations = relations(
  tournamentResources,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentResources.tournamentId],
      references: [tournaments.id],
    }),
  })
);

export const tournamentStageRankingsRelations = relations(
  tournamentStageRankings,
  ({ one }) => ({
    stage: one(tournamentStages, {
      fields: [tournamentStageRankings.stageId],
      references: [tournamentStages.id],
    }),
    organization: one(organizations, {
      fields: [tournamentStageRankings.organizationId],
      references: [organizations.id],
    }),
  })
);

export const tournamentRegistrationStepsRelations = relations(
  tournamentRegistrationSteps,
  ({ one, many }) => ({
    tournament: one(tournaments, {
      fields: [tournamentRegistrationSteps.tournamentId],
      references: [tournaments.id],
    }),
    submissions: many(tournamentRegistrationSubmissions),
  })
);

export const tournamentRegistrationSubmissionsRelations = relations(
  tournamentRegistrationSubmissions,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentRegistrationSubmissions.tournamentId],
      references: [tournaments.id],
    }),
    participation: one(tournamentParticipations, {
      fields: [tournamentRegistrationSubmissions.participationId],
      references: [tournamentParticipations.id],
    }),
    organization: one(organizations, {
      fields: [tournamentRegistrationSubmissions.organizationId],
      references: [organizations.id],
    }),
    step: one(tournamentRegistrationSteps, {
      fields: [tournamentRegistrationSubmissions.stepId],
      references: [tournamentRegistrationSteps.id],
    }),
  })
);
