import {
  type MatchStatus,
  matchStatuses,
  type TournamentFieldRole,
  type TournamentResourceType,
  type TournamentStageStatus,
  type TournamentStageType,
  type TournamentStatus,
  tournamentFieldRoles,
  tournamentResourceTypes,
  tournamentStageStatuses,
  tournamentStageTypes,
  tournamentStatuses,
} from "@rms-modern/db/schema/organization";
import { z } from "zod";

export const tournamentStatusSchema = z.enum([...tournamentStatuses] as [
  TournamentStatus,
  ...TournamentStatus[],
]);

export const tournamentResourceTypeSchema = z.enum([
  ...tournamentResourceTypes,
] as [TournamentResourceType, ...TournamentResourceType[]]);

export const isoDateSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid date format",
  });

export const scoreProfileIdSchema = z
  .string()
  .min(1)
  .max(128)
  .nullable()
  .optional();

export const tournamentResourceSchema = z.object({
  title: z.string().min(1).max(255),
  url: z.string().url(),
  type: tournamentResourceTypeSchema.default("DOCUMENT"),
  description: z.string().max(1000).optional(),
});

export type TournamentResourceInput = z.infer<typeof tournamentResourceSchema>;

export const tournamentPayloadSchema = z
  .object({
    name: z.string().min(3).max(180),
    description: z.string().max(5000).optional(),
    organizer: z.string().max(255).optional(),
    location: z.string().max(255).optional(),
    season: z.string().max(120).optional(),
    status: tournamentStatusSchema.default("UPCOMING"),
    startDate: isoDateSchema,
    endDate: isoDateSchema.optional(),
    registrationDeadline: isoDateSchema,
    announcement: z.string().max(5000).optional(),
    fieldCount: z.number().int().min(1).max(50).default(1),
    resources: z.array(tournamentResourceSchema).default([]),
    scoreProfileId: scoreProfileIdSchema,
    logo: z.string().url().optional().nullable(), // Added logo
    coverImage: z.string().url().optional().nullable(), // Added coverImage
  })
  .refine(
    (value) => {
      if (!value.endDate) {
        return true;
      }
      return (
        new Date(value.endDate).getTime() >= new Date(value.startDate).getTime()
      );
    },
    {
      message: "End date cannot be earlier than start date",
      path: ["endDate"],
    }
  );

export const tournamentUpdateSchema = tournamentPayloadSchema.partial().extend({
  resources: z.array(tournamentResourceSchema).optional(),
});

export const registrationSchema = z.object({
  organizationId: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export const stageStatusSchema = z.enum([...tournamentStageStatuses] as [
  TournamentStageStatus,
  ...TournamentStageStatus[],
]);

export const stageTypeSchema = z.enum([...tournamentStageTypes] as [
  TournamentStageType,
  ...TournamentStageType[],
]);

export const matchStatusSchema = z.enum([...matchStatuses] as [
  MatchStatus,
  ...MatchStatus[],
]);

export const stagePayloadSchema = z.object({
  name: z.string().min(3).max(180),
  type: stageTypeSchema,
  order: z.number().int().min(1).optional(), // Changed from stageOrder
  teamIds: z.array(z.string().min(1)).min(2, "At least two teams are required"),
  status: stageStatusSchema.optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  scoreProfileId: scoreProfileIdSchema, // Added scoreProfileId
  generateMatches: z.boolean().optional().default(true),
});

export const stageUpdateSchema = z.object({
  name: z.string().min(3).max(180).optional(),
  type: stageTypeSchema.optional(),
  order: z.number().int().min(1).optional(), // Changed from stageOrder
  status: stageStatusSchema.optional(),
  configuration: z.record(z.string(), z.unknown()).optional(), // Added configuration
  scoreProfileId: scoreProfileIdSchema.optional(), // Added scoreProfileId
  teamIds: z.array(z.string().min(1)).min(2).optional(),
  regenerateMatches: z.boolean().optional(),
});

export const matchGenerationSchema = z.object({
  format: z.enum(["ROUND_ROBIN", "DOUBLE_ELIMINATION"]),
  options: z
    .object({
      doubleRoundRobin: z.boolean().optional(),
    })
    .optional(),
  teamIds: z.array(z.string().min(1)).optional(),
});

export const matchUpdateSchema = z.object({
  status: matchStatusSchema.optional(),
  homeScore: z.number().int().min(0).nullable().optional(),
  awayScore: z.number().int().min(0).nullable().optional(),
  scheduledAt: isoDateSchema.optional(),
  homeTeamId: z.string().optional().nullable(), // Added
  awayTeamId: z.string().optional().nullable(), // Added
  metadata: z.record(z.string(), z.unknown()).optional().nullable(), // Added
});

export type MatchUpdateInput = z.infer<typeof matchUpdateSchema>;

const fieldRoleValueSchema = z.string().min(1).optional().nullable();

const fieldRoleShape = Object.fromEntries(
  tournamentFieldRoles.map((role) => [role, fieldRoleValueSchema])
) as Record<TournamentFieldRole, typeof fieldRoleValueSchema>;

export const fieldRoleAssignmentSchema = z.object({
  fieldNumber: z.number().int().min(1),
  roles: z.object(fieldRoleShape).partial().default({}),
});

export const fieldRoleUpdateSchema = z.object({
  assignments: z.array(fieldRoleAssignmentSchema).default([]),
});
