export const SCORE_PROFILE_PART_TYPES = ["NUMBER", "BOOLEAN"] as const;
export const SCORE_PROFILE_COOP_APPLIES_TO = ["ALL_TEAMS", "PER_TEAM"] as const;
export const SCORE_PROFILE_PENALTY_TARGETS = ["SELF", "OPPONENT"] as const;
export const SCORE_PROFILE_PENALTY_DIRECTIONS = ["ADD", "SUBTRACT"] as const;

export type ScoreProfilePartType = (typeof SCORE_PROFILE_PART_TYPES)[number];

export type ScoreProfileCooperativeBonus = {
  requiredTeamCount: 2 | 4;
  bonusPoints: number;
  appliesTo: (typeof SCORE_PROFILE_COOP_APPLIES_TO)[number];
  description?: string;
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

export type ScoreProfilePenaltyRule = {
  id: string;
  label: string;
  description?: string;
  points: number;
  target: (typeof SCORE_PROFILE_PENALTY_TARGETS)[number];
  direction: (typeof SCORE_PROFILE_PENALTY_DIRECTIONS)[number];
};

export type ScoreProfileDefinition = {
  version: number;
  parts: ScoreProfilePartDefinition[];
  penalties: ScoreProfilePenaltyRule[];
  totalFormula: string;
  notes?: string;
};

export type ScoreProfileModel = {
  id: string;
  name: string;
  description?: string | null;
  definition: ScoreProfileDefinition;
  usageCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ScoreProfilesResponse = {
  items: ScoreProfileModel[];
};
