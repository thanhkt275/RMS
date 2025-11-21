import type { scoreProfiles } from "@rms-modern/db/schema/organization";

type ScoreProfileDefinition = (typeof scoreProfiles.$inferSelect)["definition"];

type NumberPart = {
  id: string;
  label: string;
  description?: string;
  type: "NUMBER";
  pointsPerUnit: number;
  maxValue?: number | null;
  cooperativeBonus?: CooperativeBonus;
};

type BooleanPart = {
  id: string;
  label: string;
  description?: string;
  type: "BOOLEAN";
  truePoints: number;
  cooperativeBonus?: CooperativeBonus;
};

type CooperativeBonus = {
  requiredTeamCount: 2 | 4;
  bonusPoints: number;
  appliesTo: "ALL_TEAMS" | "PER_TEAM";
  description?: string;
};

type ScorePart = NumberPart | BooleanPart;

type Penalty = {
  id: string;
  label: string;
  description?: string;
  points: number;
  target: "SELF" | "OPPONENT";
  direction: "ADD" | "SUBTRACT";
};

type ScoreProfileConfig = {
  version: number;
  parts: ScorePart[];
  penalties: Penalty[];
  totalFormula: string;
  notes?: string;
};

export type PartValue = {
  partId: string;
  value: number | boolean;
};

export type PenaltyApplication = {
  penaltyId: string;
  count: number;
};

export type ScoreInput = {
  parts: PartValue[];
  penalties?: PenaltyApplication[];
};

export type ScoreBreakdown = {
  parts: Record<string, { value: number | boolean; points: number }>;
  penalties: Record<string, { count: number; totalPoints: number }>;
  partTotals: Record<string, number>;
  penaltyTotal: number;
  opponentPenaltyAdjustment: number;
  finalScore: number;
  calculatedAt: string;
  profileVersion: number;
};

export type CalculationResult =
  | {
      success: true;
      score: number;
      breakdown: ScoreBreakdown;
      opponentScoreAdjustment: number;
    }
  | {
      success: false;
      error: string;
      errors?: string[];
    };

/**
 * Validates that all required parts are present in the input
 */
function validatePartInputs(
  profile: ScoreProfileConfig,
  input: ScoreInput
): string[] {
  const errors: string[] = [];
  const providedPartIds = new Set(input.parts.map((p) => p.partId));

  for (const part of profile.parts) {
    if (!providedPartIds.has(part.id)) {
      errors.push(`Missing required part: ${part.id} (${part.label})`);
    }
  }

  return errors;
}

function validateNumberPart(part: NumberPart, value: unknown): string | null {
  if (typeof value !== "number") {
    return `Part ${part.id} (${part.label}) must be a number, got ${typeof value}`;
  }

  if (value < 0) {
    return `Part ${part.id} (${part.label}) cannot be negative`;
  }

  if (
    part.maxValue !== null &&
    part.maxValue !== undefined &&
    value > part.maxValue
  ) {
    return `Part ${part.id} (${part.label}) exceeds maximum value of ${part.maxValue}`;
  }

  return null;
}

function validateBooleanPart(part: BooleanPart, value: unknown): string | null {
  if (typeof value !== "boolean") {
    return `Part ${part.id} (${part.label}) must be a boolean, got ${typeof value}`;
  }
  return null;
}

/**
 * Validates that part values meet constraints (type, maxValue, etc.)
 */
function validatePartValues(
  profile: ScoreProfileConfig,
  input: ScoreInput
): string[] {
  const errors: string[] = [];
  const partMap = new Map(profile.parts.map((p) => [p.id, p]));

  for (const partValue of input.parts) {
    const part = partMap.get(partValue.partId);

    if (!part) {
      errors.push(`Unknown part ID: ${partValue.partId}`);
      continue;
    }

    let error: string | null = null;
    if (part.type === "NUMBER") {
      error = validateNumberPart(part, partValue.value);
    } else if (part.type === "BOOLEAN") {
      error = validateBooleanPart(part, partValue.value);
    }

    if (error) {
      errors.push(error);
    }
  }

  return errors;
}

/**
 * Validates that penalty IDs exist in the profile
 */
function validatePenalties(
  profile: ScoreProfileConfig,
  input: ScoreInput
): string[] {
  const errors: string[] = [];
  const penaltyMap = new Map(profile.penalties.map((p) => [p.id, p]));

  for (const penaltyApp of input.penalties ?? []) {
    if (!penaltyMap.has(penaltyApp.penaltyId)) {
      errors.push(`Unknown penalty ID: ${penaltyApp.penaltyId}`);
    }

    if (penaltyApp.count < 0) {
      errors.push(`Penalty ${penaltyApp.penaltyId} count cannot be negative`);
    }
  }

  return errors;
}

/**
 * Calculates points for each part based on the input values
 */
function calculatePartPoints(
  profile: ScoreProfileConfig,
  input: ScoreInput
): Record<string, { value: number | boolean; points: number }> {
  const partMap = new Map(profile.parts.map((p) => [p.id, p]));
  const result: Record<string, { value: number | boolean; points: number }> =
    {};

  for (const partValue of input.parts) {
    const part = partMap.get(partValue.partId);
    if (!part) {
      continue;
    }

    let points = 0;

    if (part.type === "NUMBER" && typeof partValue.value === "number") {
      points = partValue.value * part.pointsPerUnit;
    } else if (part.type === "BOOLEAN" && partValue.value === true) {
      points = part.truePoints;
    }

    result[part.id] = {
      value: partValue.value,
      points,
    };
  }

  return result;
}

/**
 * Calculates total penalty points to be applied
 * Returns both SELF penalties and OPPONENT penalties separately
 */
function calculatePenaltyPoints(
  profile: ScoreProfileConfig,
  input: ScoreInput
): {
  selfPenalties: Record<string, { count: number; totalPoints: number }>;
  opponentAdjustment: number;
} {
  const penaltyMap = new Map(profile.penalties.map((p) => [p.id, p]));
  const selfPenalties: Record<string, { count: number; totalPoints: number }> =
    {};
  let opponentAdjustment = 0;

  for (const penaltyApp of input.penalties ?? []) {
    const penalty = penaltyMap.get(penaltyApp.penaltyId);
    if (!penalty) {
      continue;
    }

    const totalPoints =
      penalty.direction === "SUBTRACT"
        ? -(penalty.points * penaltyApp.count)
        : penalty.points * penaltyApp.count;

    if (penalty.target === "SELF") {
      selfPenalties[penalty.id] = {
        count: penaltyApp.count,
        totalPoints,
      };
    } else if (penalty.target === "OPPONENT") {
      // Opponent penalties adjust the opponent's score
      // If direction is SUBTRACT, we subtract from opponent (negative adjustment)
      // If direction is ADD, we add to opponent (positive adjustment)
      opponentAdjustment += totalPoints;
    }
  }

  return { selfPenalties, opponentAdjustment };
}

const SAFE_EXPRESSION_PATTERN = /^[\d+\-*/().\s]+$/;

/**
 * Evaluates a simple formula string using a safe context
 * Supports: +, -, *, /, (), and variable references
 */
function evaluateFormula(
  formula: string,
  context: Record<string, number>
): number {
  // Create a safe evaluation context by replacing variables with their values
  let expression = formula;

  // Sort keys by length (descending) to avoid partial replacements
  const sortedKeys = Object.keys(context).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const value = context[key];
    if (value === undefined) {
      throw new Error(`Missing value for variable: ${key}`);
    }
    // Replace all occurrences of the variable with its value
    expression = expression.replace(
      new RegExp(`\\b${key}\\b`, "g"),
      value.toString()
    );
  }

  // Validate that the expression only contains safe characters
  if (!SAFE_EXPRESSION_PATTERN.test(expression)) {
    throw new Error(`Formula contains invalid characters: ${expression}`);
  }

  try {
    // Use Function constructor for safe evaluation (no access to scope)
    const evaluator = new Function(
      `"use strict"; return (${expression})`
    ) as () => number;
    return evaluator();
  } catch (error) {
    throw new Error(
      `Failed to evaluate formula: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Main function to calculate match score based on score profile definition
 */
export function calculateMatchScore(
  profileDefinition: ScoreProfileDefinition,
  input: ScoreInput
): CalculationResult {
  try {
    const profile = profileDefinition as ScoreProfileConfig;

    // Validate inputs
    const partErrors = validatePartInputs(profile, input);
    const valueErrors = validatePartValues(profile, input);
    const penaltyErrors = validatePenalties(profile, input);

    const allErrors = [...partErrors, ...valueErrors, ...penaltyErrors];

    if (allErrors.length > 0) {
      return {
        success: false,
        error: "Validation failed",
        errors: allErrors,
      };
    }

    // Calculate part points
    const partBreakdown = calculatePartPoints(profile, input);

    // Calculate penalty points (both self and opponent)
    const { selfPenalties, opponentAdjustment } = calculatePenaltyPoints(
      profile,
      input
    );

    // Build context for formula evaluation
    const context: Record<string, number> = {};

    // Add individual part points to context
    for (const [partId, data] of Object.entries(partBreakdown)) {
      context[partId] = data.points;
    }

    // Calculate totals for common aggregations
    const totalPartPoints = Object.values(partBreakdown).reduce(
      (sum, data) => sum + data.points,
      0
    );
    const totalSelfPenaltyPoints = Object.values(selfPenalties).reduce(
      (sum, data) => sum + data.totalPoints,
      0
    );

    context.TOTAL_PARTS = totalPartPoints;
    context.TOTAL_PENALTIES_SELF = Math.abs(totalSelfPenaltyPoints);
    context.TOTAL = totalPartPoints + totalSelfPenaltyPoints;

    // Evaluate the formula
    const finalScore = Math.max(
      0,
      Math.round(evaluateFormula(profile.totalFormula, context))
    );

    return {
      success: true,
      score: finalScore,
      breakdown: {
        parts: partBreakdown,
        penalties: selfPenalties,
        partTotals: context,
        penaltyTotal: totalSelfPenaltyPoints,
        opponentPenaltyAdjustment: opponentAdjustment,
        finalScore,
        calculatedAt: new Date().toISOString(),
        profileVersion: profile.version,
      },
      opponentScoreAdjustment: opponentAdjustment,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown calculation error",
    };
  }
}

/**
 * Validates that a raw score input matches the score profile structure
 * without calculating the final score
 */
export function validateScoreInput(
  profileDefinition: ScoreProfileDefinition,
  input: ScoreInput
): { valid: true } | { valid: false; errors: string[] } {
  const profile = profileDefinition as ScoreProfileConfig;

  const partErrors = validatePartInputs(profile, input);
  const valueErrors = validatePartValues(profile, input);
  const penaltyErrors = validatePenalties(profile, input);

  const allErrors = [...partErrors, ...valueErrors, ...penaltyErrors];

  if (allErrors.length > 0) {
    return {
      valid: false,
      errors: allErrors,
    };
  }

  return { valid: true };
}
