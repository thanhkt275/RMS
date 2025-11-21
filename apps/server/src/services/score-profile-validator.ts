import { type AppDB, db } from "@rms-modern/db";
import {
  scoreProfiles,
  tournamentStages,
  tournaments,
} from "@rms-modern/db/schema/organization";
import { eq } from "drizzle-orm";
import {
  calculateMatchScore,
  type ScoreBreakdown,
  type ScoreInput,
} from "../services/score-calculator";

/**
 * Fetches the applicable score profile for a given stage
 * Falls back to tournament-level profile if stage doesn't have one
 */
export async function getScoreProfileForStage(
  stageId: string
): Promise<typeof scoreProfiles.$inferSelect | null> {
  const stageRows = await (db as AppDB)
    .select()
    .from(tournamentStages)
    // @ts-expect-error - Bun drizzle-orm type issue with duplicate module resolution
    .where(eq(tournamentStages.id, stageId))
    .limit(1);

  const stage = stageRows[0];

  if (!stage) {
    return null;
  }

  // If stage has a score profile, use it
  if (stage.scoreProfileId) {
    const profileRows = await (db as AppDB)
      .select()
      .from(scoreProfiles)
      // @ts-expect-error - Bun drizzle-orm type issue with duplicate module resolution
      .where(eq(scoreProfiles.id, stage.scoreProfileId))
      .limit(1);

    return profileRows[0] ?? null;
  }

  // Otherwise, fallback to tournament-level profile
  if (stage.tournamentId) {
    const tournamentRows = await (db as AppDB)
      .select()
      .from(tournaments)
      // @ts-expect-error - Bun drizzle-orm type issue with duplicate module resolution
      .where(eq(tournaments.id, stage.tournamentId))
      .limit(1);

    const tournament = tournamentRows[0];

    if (tournament?.scoreProfileId) {
      const profileRows = await (db as AppDB)
        .select()
        .from(scoreProfiles)
        // @ts-expect-error - Bun drizzle-orm type issue with duplicate module resolution
        .where(eq(scoreProfiles.id, tournament.scoreProfileId))
        .limit(1);

      return profileRows[0] ?? null;
    }
  }

  return null;
}

/**
 * Calculates score using the applicable score profile
 * Returns the total score and detailed breakdown
 */
export async function calculateScoreForMatch(
  stageId: string,
  scoreInput: ScoreInput
): Promise<
  | { success: true; score: number; breakdown: ScoreBreakdown }
  | { success: false; error: string; errors?: string[] }
> {
  const profile = await getScoreProfileForStage(stageId);

  if (!profile) {
    // No score profile assigned - accept raw score if provided as legacy behavior
    return {
      success: false,
      error:
        "No score profile assigned to this stage or tournament. Score profiles must be configured before entering detailed scores.",
    };
  }

  return calculateMatchScore(profile.definition, scoreInput);
}

/**
 * Validates whether a score input is compatible with the stage's score profile
 */
export async function validateScoreForStage(
  stageId: string,
  scoreInput: ScoreInput
): Promise<{ valid: true } | { valid: false; errors: string[] }> {
  const profile = await getScoreProfileForStage(stageId);

  if (!profile) {
    return {
      valid: false,
      errors: [
        "No score profile assigned to this stage or tournament. Cannot validate score input.",
      ],
    };
  }

  const result = calculateMatchScore(profile.definition, scoreInput);

  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: result.errors ?? [result.error],
  };
}
