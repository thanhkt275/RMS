import z from "zod";
import {
  TOURNAMENT_STAGE_STATUSES,
  TOURNAMENT_STAGE_TYPES,
  type TournamentStageStatus,
  type TournamentStageType,
} from "@/utils/stages";

export type StageCreateFormValues = {
  name: string;
  status: TournamentStageStatus;
  type: TournamentStageType;
  stageOrder: number;
  teamOrder: string[];
  generateMatches: boolean;
};

export type StageUpdateFormValues = {
  name: string;
  status: TournamentStageStatus;
  type: TournamentStageType;
  stageOrder: number;
  teamOrder: string[];
  regenerateMatches: boolean;
};

const statusSchema = z.enum([...TOURNAMENT_STAGE_STATUSES] as [
  TournamentStageStatus,
  ...TournamentStageStatus[],
]);
const typeSchema = z.enum([...TOURNAMENT_STAGE_TYPES] as [
  TournamentStageType,
  ...TournamentStageType[],
]);

const teamOrderSchema = z
  .array(z.string().min(1))
  .min(2, "Select at least two teams");

export const stageCreateFormSchema = z.object({
  name: z.string().min(3).max(180),
  status: statusSchema.default("PENDING"),
  type: typeSchema.default("FIRST_ROUND"),
  stageOrder: z.coerce.number().int().positive().default(1),
  teamOrder: teamOrderSchema,
  generateMatches: z.boolean().default(true),
});

export const stageUpdateFormSchema = z.object({
  name: z.string().min(3).max(180),
  status: statusSchema.default("PENDING"),
  type: typeSchema.default("FIRST_ROUND"),
  stageOrder: z.coerce.number().int().positive().default(1),
  teamOrder: teamOrderSchema,
  regenerateMatches: z.boolean().default(false),
});
