import z from "zod";
import type {
  BooleanScoreProfilePart,
  NumberScoreProfilePart,
  ScoreProfileDefinition,
  ScoreProfileModel,
  ScoreProfilePartDefinition,
  ScoreProfilePenaltyRule,
} from "@/utils/score-profiles";
import {
  SCORE_PROFILE_COOP_APPLIES_TO,
  SCORE_PROFILE_PENALTY_DIRECTIONS,
  SCORE_PROFILE_PENALTY_TARGETS,
} from "@/utils/score-profiles";

export type ScoreProfileFormValues = {
  name: string;
  description: string;
  version: number;
  totalFormula: string;
  notes: string;
  parts: ScoreProfilePartDefinition[];
  penalties: ScoreProfilePenaltyRule[];
};

const coopApplyEnum = z.enum([...SCORE_PROFILE_COOP_APPLIES_TO] as [
  (typeof SCORE_PROFILE_COOP_APPLIES_TO)[number],
  ...(typeof SCORE_PROFILE_COOP_APPLIES_TO)[number][],
]);

const penaltyTargetEnum = z.enum([...SCORE_PROFILE_PENALTY_TARGETS] as [
  (typeof SCORE_PROFILE_PENALTY_TARGETS)[number],
  ...(typeof SCORE_PROFILE_PENALTY_TARGETS)[number][],
]);

const penaltyDirectionEnum = z.enum([...SCORE_PROFILE_PENALTY_DIRECTIONS] as [
  (typeof SCORE_PROFILE_PENALTY_DIRECTIONS)[number],
  ...(typeof SCORE_PROFILE_PENALTY_DIRECTIONS)[number][],
]);

const cooperativeBonusSchema = z
  .object({
    requiredTeamCount: z.union([z.literal(2), z.literal(4)]),
    bonusPoints: z.number().int().min(1),
    appliesTo: coopApplyEnum,
    description: z.string().max(500).optional(),
  })
  .optional();

const numberPartSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(3).max(180),
  description: z.string().max(500).optional(),
  type: z.literal("NUMBER"),
  pointsPerUnit: z.number().min(0),
  maxValue: z.number().int().min(0).nullable().optional(),
  cooperativeBonus: cooperativeBonusSchema,
});

const booleanPartSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(3).max(180),
  description: z.string().max(500).optional(),
  type: z.literal("BOOLEAN"),
  truePoints: z.number().min(0),
  cooperativeBonus: cooperativeBonusSchema,
});

const partSchema = z.discriminatedUnion("type", [
  numberPartSchema,
  booleanPartSchema,
]);

const penaltySchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(3).max(180),
  description: z.string().max(500).optional(),
  points: z.number().int().min(0),
  target: penaltyTargetEnum,
  direction: penaltyDirectionEnum,
});

export const scoreProfileFormSchema = z
  .object({
    name: z.string().min(3).max(180),
    description: z.string().max(2000).optional().default(""),
    version: z.number().int().min(1).default(1),
    totalFormula: z.string().min(1).max(2000),
    notes: z.string().max(1000).optional().default(""),
    parts: z.array(partSchema).min(1),
    penalties: z.array(penaltySchema).default([]),
  })
  .refine((value) => value.parts.every((part) => part.id.trim().length), {
    message: "Each part needs an ID to be referenced by formulas.",
    path: ["parts"],
  })
  .refine(
    (value) => {
      const ids = value.parts.map((part) => part.id.trim().toLowerCase());
      return new Set(ids).size === ids.length;
    },
    {
      message: "Part IDs must be unique.",
      path: ["parts"],
    }
  ) satisfies z.ZodType<ScoreProfileFormValues>;

function generateId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 6)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createNumberPart(
  overrides?: Partial<NumberScoreProfilePart>
): NumberScoreProfilePart {
  return {
    id: generateId("part"),
    label: "New numeric challenge",
    type: "NUMBER",
    pointsPerUnit: 1,
    maxValue: null,
    description: "",
    cooperativeBonus: undefined,
    ...overrides,
  };
}

export function createBooleanPart(
  overrides?: Partial<BooleanScoreProfilePart>
): BooleanScoreProfilePart {
  return {
    id: generateId("bonus"),
    label: "New boolean challenge",
    type: "BOOLEAN",
    truePoints: 10,
    description: "",
    cooperativeBonus: undefined,
    ...overrides,
  };
}

export function createPenaltyRule(
  overrides?: Partial<ScoreProfilePenaltyRule>
): ScoreProfilePenaltyRule {
  return {
    id: generateId("penalty"),
    label: "New penalty",
    points: 5,
    direction: "SUBTRACT",
    target: "SELF",
    description: "",
    ...overrides,
  };
}

function sanitizePart(part: ScoreProfilePartDefinition) {
  if (part.type === "NUMBER") {
    const result: NumberScoreProfilePart = {
      ...part,
      id: part.id.trim(),
      label: part.label.trim(),
      description: part.description?.trim() || "",
      cooperativeBonus: part.cooperativeBonus
        ? {
            ...part.cooperativeBonus,
            description: part.cooperativeBonus.description?.trim() || undefined,
          }
        : undefined,
    };
    return result;
  }
  const result: BooleanScoreProfilePart = {
    ...part,
    id: part.id.trim(),
    label: part.label.trim(),
    description: part.description?.trim() || "",
    cooperativeBonus: part.cooperativeBonus
      ? {
          ...part.cooperativeBonus,
          description: part.cooperativeBonus.description?.trim() || undefined,
        }
      : undefined,
  };
  return result;
}

function sanitizePenalty(penalty: ScoreProfilePenaltyRule) {
  return {
    ...penalty,
    id: penalty.id.trim(),
    label: penalty.label.trim(),
    description: penalty.description?.trim() || undefined,
  };
}

export function mapFormValuesToPayload(value: ScoreProfileFormValues) {
  const definition: ScoreProfileDefinition = {
    version: value.version,
    totalFormula: value.totalFormula.trim(),
    notes: value.notes?.trim() || undefined,
    parts: value.parts.map(sanitizePart),
    penalties: value.penalties.map(sanitizePenalty),
  };

  return {
    name: value.name.trim(),
    description: value.description?.trim() || undefined,
    definition,
  };
}

export function toFormValuesFromModel(
  profile: ScoreProfileModel
): ScoreProfileFormValues {
  return {
    name: profile.name,
    description: profile.description ?? "",
    version: profile.definition.version,
    totalFormula: profile.definition.totalFormula,
    notes: profile.definition.notes ?? "",
    parts: profile.definition.parts,
    penalties: profile.definition.penalties ?? [],
  };
}

export function createEmptyScoreProfileValues(
  overrides?: Partial<ScoreProfileFormValues>
): ScoreProfileFormValues {
  return {
    name: "",
    description: "",
    version: 1,
    totalFormula: "",
    notes: "",
    parts: [createNumberPart({ label: "Autonomous task", id: "auto-task" })],
    penalties: [],
    ...overrides,
  };
}
