import crypto from "node:crypto";
import { type AppDB, db } from "@rms-modern/db";
import type { TournamentStageStatus } from "@rms-modern/db/schema/organization";
import {
  type ScoreProfileConfiguration,
  scoreProfiles,
  type TournamentFieldRole,
  tournamentFieldRoles,
  tournamentMatches,
  tournamentStageRankings,
  tournamentStages,
  tournamentStageTeams,
  tournaments,
} from "@rms-modern/db/schema/organization";
import { and, eq, not, or } from "drizzle-orm";
import type { z } from "zod";
import type {
  FieldAssignmentRow,
  FieldRoleField,
  MatchMetadata,
  ScoreData,
  StageConfiguration,
  StageMatchDependency,
  StageMatchRow,
  StageMatchSeed,
  StageRecord,
  StageResponse,
} from "./types";

// Outcome points used for ranking calculations
type OutcomePoints = {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
};

const DEFAULT_OUTCOME_POINTS: OutcomePoints = {
  winPoints: 2,
  drawPoints: 1,
  lossPoints: 0,
};

/**
 * Retrieves a tournament by its ID or slug.
 * @param identifier Tournament ID or slug.
 * @returns The tournament record or null if not found.
 */
export async function getTournamentByIdentifier(identifier: string) {
  const tournament = await db.query.tournaments.findFirst({
    where: or(eq(tournaments.id, identifier), eq(tournaments.slug, identifier)),
  });
  return tournament;
}

/**
 * Parses the score data from a JSON string.
 * @param scoreDataJson JSON string containing score data.
 * @returns Parsed ScoreData object or null.
 */
export function parseScoreData(scoreDataJson: string | null): ScoreData | null {
  if (!scoreDataJson) {
    return null;
  }
  try {
    return JSON.parse(scoreDataJson) as ScoreData;
  } catch (error) {
    console.error("Error parsing score data:", error);
    return null;
  }
}

/**
 * Parses match metadata from a JSON string.
 * @param metadataJson JSON string containing match metadata.
 * @returns Parsed MatchMetadata object or null.
 */
export function parseMatchMetadata(
  metadataJson: string | null
): MatchMetadata | null {
  if (!metadataJson) {
    return null;
  }
  try {
    return JSON.parse(metadataJson) as MatchMetadata;
  } catch (error) {
    console.error("Error parsing match metadata:", error);
    return null;
  }
}

/**
 * Parses a specific value from stage configuration.
 * @param configuration Stage configuration object.
 * @param key Key to retrieve.
 * @param defaultValue Default value if key is not found.
 * @returns Parsed value or default value.
 */
export function parseStageConfigurationValue<T>(
  configuration: StageConfiguration,
  key: keyof StageConfiguration,
  defaultValue: T
): T {
  if (
    configuration &&
    typeof configuration === "object" &&
    key in configuration
  ) {
    return configuration[key] as T;
  }
  return defaultValue;
}

/**
 * Formats team data for match responses.
 */
export function formatMatchTeam(
  teamId: string | null,
  teamName: string | null,
  teamLogo: string | null,
  placeholder: string | null
) {
  return {
    id: teamId,
    name: teamName ?? placeholder ?? "TBD",
    logo: teamLogo,
  };
}

/**
 * Builds a structured response for stages, including teams.
 */
export function buildStageResponses(
  stages: (typeof tournamentStages.$inferSelect & {
    teams?: Array<{
      organizationId: string;
      seed: number | null;
      organization: {
        name: string;
        slug: string;
        logo: string | null;
        location: string | null;
      };
    }>;
  })[]
): StageResponse[] {
  return stages.map((stage) => ({
    id: stage.id,
    tournamentId: stage.tournamentId,
    name: stage.name,
    type: stage.type,
    status: stage.status,
    order: stage.stageOrder,
    configuration: JSON.parse(
      stage.configuration || "{}"
    ) as StageConfiguration,
    scoreProfileId:
      "scoreProfileId" in stage
        ? (stage as unknown as { scoreProfileId: string | null }).scoreProfileId
        : null,
    startedAt: stage.startedAt?.toISOString() ?? null,
    completedAt: stage.completedAt?.toISOString() ?? null,
    createdAt: stage.createdAt.toISOString(),
    updatedAt: stage.updatedAt.toISOString(),
    teams: stage.teams
      ? stage.teams.map((st) => ({
          id: st.organizationId,
          name: st.organization.name,
          slug: st.organization.slug,
          logo: st.organization.logo,
          location: st.organization.location,
          seed: st.seed,
        }))
      : [],
    warnings: [],
  }));
}

/**
 * Creates a new stage entity with default values.
 */
export function createStageEntity(
  tournamentId: string,
  payload: z.infer<typeof import("./schemas").stagePayloadSchema>
): StageRecord {
  const stageId = crypto.randomUUID();
  const now = new Date();
  return {
    id: stageId,
    tournamentId,
    name: payload.name,
    type: payload.type,
    status: "PENDING" as TournamentStageStatus,
    stageOrder: payload.order ?? 0,
    configuration: JSON.stringify(payload.configuration || {}),
    scoreProfileId: payload.scoreProfileId || null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Resolves the order of stages.
 */
export function resolveStageOrder(
  stages: { id: string; order: number }[]
): { id: string; order: number }[] {
  return stages.sort((a, b) => a.order - b.order);
}

/**
 * Assigns teams to a stage.
 */
export async function assignStageTeams(stage: StageRecord, teamIds: string[]) {
  await db.transaction(async (tx) => {
    // Clear existing teams
    await tx
      .delete(tournamentStageTeams)
      .where(eq(tournamentStageTeams.stageId, stage.id));

    // Insert new teams
    if (teamIds.length > 0) {
      const insertValues = teamIds.map((teamId) => ({
        id: crypto.randomUUID(),
        stageId: stage.id,
        organizationId: teamId,
      }));
      await tx.insert(tournamentStageTeams).values(insertValues);
    }
  });
}

function deriveOutcomePoints(
  definition: ScoreProfileConfiguration | null | undefined
): OutcomePoints {
  const overrides = (
    definition as {
      outcomePoints?: Partial<OutcomePoints>;
    } | null
  )?.outcomePoints;

  if (!overrides) {
    return DEFAULT_OUTCOME_POINTS;
  }

  return {
    winPoints: overrides.winPoints ?? DEFAULT_OUTCOME_POINTS.winPoints,
    drawPoints: overrides.drawPoints ?? DEFAULT_OUTCOME_POINTS.drawPoints,
    lossPoints: overrides.lossPoints ?? DEFAULT_OUTCOME_POINTS.lossPoints,
  };
}

async function resolveOutcomePointsForStage(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  stage:
    | (StageRecord & {
        scoreProfileId: string | null;
      })
    | null
): Promise<OutcomePoints> {
  if (!stage) {
    return DEFAULT_OUTCOME_POINTS;
  }

  const tournamentScoreProfileId = await tx
    .select({ scoreProfileId: tournaments.scoreProfileId })
    .from(tournaments)
    .where(eq(tournaments.id, stage.tournamentId))
    .limit(1)
    .then((rows) => rows[0]?.scoreProfileId ?? null);

  const scoreProfileId = stage.scoreProfileId ?? tournamentScoreProfileId;
  if (!scoreProfileId) {
    return DEFAULT_OUTCOME_POINTS;
  }

  const profile = await (tx as AppDB).query.scoreProfiles.findFirst({
    where: eq(scoreProfiles.id, scoreProfileId),
  });

  if (!profile) {
    return DEFAULT_OUTCOME_POINTS;
  }

  return deriveOutcomePoints(profile.definition);
}

/**
 * Recalculates stage rankings based on match outcomes.
 * Supports both legacy raw scores and new score profile calculations.
 * The homeScore/awayScore fields contain the final calculated totals,
 * while homeScoreBreakdown/awayScoreBreakdown contain detailed part-by-part data.
 */
export async function recalculateStageRankings(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  stageId: string
) {
  // Fetch all matches for the stage
  const matches = await tx
    .select()
    .from(tournamentMatches)
    .where(eq(tournamentMatches.stageId, stageId));

  // Fetch stage configuration to get score profile
  const stageRow = await tx
    .select()
    .from(tournamentStages)
    .where(eq(tournamentStages.id, stageId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!stageRow) {
    console.warn(`Stage ${stageId} not found.`);
    return;
  }

  const stage = stageRow as typeof stageRow & { scoreProfileId: string | null };

  const outcomePoints = await resolveOutcomePointsForStage(tx, stage);

  type TeamStats = {
    wins: number;
    losses: number;
    draws: number;
    rankingPoints: number;
    tieBreaker: number;
    matchesPlayed: number;
    totalFor: number;
    totalAgainst: number;
  };

  const teamStats = new Map<string, TeamStats>();

  for (const match of matches) {
    if (
      match.status === "COMPLETED" &&
      match.homeScore !== null &&
      match.homeScore !== undefined &&
      match.awayScore !== null &&
      match.awayScore !== undefined
    ) {
      const homeTeamId = match.homeTeamId;
      const awayTeamId = match.awayTeamId;

      if (!(homeTeamId && awayTeamId)) {
        continue;
      }

      const outcome = determineMatchOutcome(
        match.homeScore,
        match.awayScore,
        outcomePoints
      );

      const homeStats = teamStats.get(homeTeamId) || {
        wins: 0,
        losses: 0,
        draws: 0,
        rankingPoints: 0,
        tieBreaker: 0,
        matchesPlayed: 0,
        totalFor: 0,
        totalAgainst: 0,
      };
      homeStats.matchesPlayed += 1;
      homeStats.rankingPoints += outcome.homeTeamPoints;
      homeStats.tieBreaker += match.homeScore - match.awayScore;
      homeStats.totalFor += match.homeScore;
      homeStats.totalAgainst += match.awayScore;
      if (outcome.result === "HOME_WIN") {
        homeStats.wins += 1;
      } else if (outcome.result === "AWAY_WIN") {
        homeStats.losses += 1;
      } else {
        homeStats.draws += 1;
      }
      teamStats.set(homeTeamId, homeStats);

      const awayStats = teamStats.get(awayTeamId) || {
        wins: 0,
        losses: 0,
        draws: 0,
        rankingPoints: 0,
        tieBreaker: 0,
        matchesPlayed: 0,
        totalFor: 0,
        totalAgainst: 0,
      };
      awayStats.matchesPlayed += 1;
      awayStats.rankingPoints += outcome.awayTeamPoints;
      awayStats.tieBreaker += match.awayScore - match.homeScore;
      awayStats.totalFor += match.awayScore;
      awayStats.totalAgainst += match.homeScore;
      if (outcome.result === "AWAY_WIN") {
        awayStats.wins += 1;
      } else if (outcome.result === "HOME_WIN") {
        awayStats.losses += 1;
      } else {
        awayStats.draws += 1;
      }
      teamStats.set(awayTeamId, awayStats);
    }
  }

  const rankedTeams = Array.from(teamStats.entries())
    .map(([teamId, stats]) => ({ teamId, ...stats }))
    .sort((a, b) => {
      if (b.rankingPoints !== a.rankingPoints) {
        return b.rankingPoints - a.rankingPoints;
      }
      if (b.tieBreaker !== a.tieBreaker) {
        return b.tieBreaker - a.tieBreaker;
      }
      return b.totalFor - a.totalFor;
    });

  const rankingInserts = rankedTeams.map((team, index) => ({
    id: crypto.randomUUID(),
    stageId,
    organizationId: team.teamId,
    rank: index + 1,
    gamesPlayed: team.matchesPlayed,
    wins: team.wins,
    losses: team.losses,
    ties: team.draws,
    rankingPoints: team.rankingPoints,
    totalScore: team.totalFor,
    loseRate: team.matchesPlayed ? team.losses / team.matchesPlayed : 0,
    scoreData: JSON.stringify({
      totalFor: team.totalFor,
      totalAgainst: team.totalAgainst,
      matches: [],
    }),
  }));

  // Clear existing rankings and insert new ones
  await tx
    .delete(tournamentStageRankings)
    .where(eq(tournamentStageRankings.stageId, stageId));
  if (rankingInserts.length > 0) {
    await tx.insert(tournamentStageRankings).values(rankingInserts);
  }
}

/**
 * Handles match preparation before a stage starts.
 */
export async function handleStageMatchPreparation(
  stage: StageRecord,
  warnings: string[]
) {
  // Example: Check if all teams are assigned, matches generated, etc.
  const assignedTeams = await (db as AppDB)
    .select()
    .from(tournamentStageTeams)
    .where(eq(tournamentStageTeams.stageId, stage.id));

  if (assignedTeams.length < 2) {
    warnings.push("Not enough teams assigned to the stage.");
  }

  const generatedMatches = await (db as AppDB)
    .select()
    .from(tournamentMatches)
    .where(eq(tournamentMatches.stageId, stage.id));

  if (generatedMatches.length === 0) {
    warnings.push("No matches have been generated for this stage.");
  }
}

/**
 * Ensures a stage is completable.
 */
export async function ensureStageIsCompletable(
  stage: StageRecord,
  warnings: string[]
) {
  const incompleteMatches = await (db as AppDB)
    .select()
    .from(tournamentMatches)
    .where(
      and(
        eq(tournamentMatches.stageId, stage.id),
        not(eq(tournamentMatches.status, "COMPLETED"))
      )
    );

  if (incompleteMatches.length > 0) {
    warnings.push(
      `There are ${incompleteMatches.length} incomplete matches in this stage.`
    );
  }
}

/**
 * Enforces team regeneration policy for a stage.
 */
export function enforceTeamRegenerationPolicy(
  stage: StageRecord,
  warnings: string[]
) {
  // Example: If stage is already in progress, warn about regenerating teams
  if (stage.status === "ACTIVE" || stage.status === "COMPLETED") {
    warnings.push(
      "Regenerating teams for a stage that has started or completed may lead to unexpected results."
    );
  }
}

/**
 * Generates round-robin matches.
 */
export function generateRoundRobinMatches(
  teamIds: string[],
  doubleRoundRobin: boolean
): {
  generatedMatches: StageMatchSeed[];
  matchDependencies: StageMatchDependency[];
} {
  const generatedMatches: StageMatchSeed[] = [];
  const matchDependencies: StageMatchDependency[] = []; // Round robin usually has no dependencies

  if (teamIds.length < 2) {
    return { generatedMatches, matchDependencies };
  }

  const rounds = doubleRoundRobin
    ? (teamIds.length - 1) * 2
    : teamIds.length - 1;
  const numTeams = teamIds.length;

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < numTeams / 2; i++) {
      const homeTeamId = teamIds[i];
      const awayTeamId = teamIds[numTeams - 1 - i];

      if (homeTeamId && awayTeamId) {
        generatedMatches.push({
          id: crypto.randomUUID(),
          round: `Round ${round + 1}`,
          homeTeamId,
          awayTeamId,
          homePlaceholder: null,
          awayPlaceholder: null,
          metadata: { format: "ROUND_ROBIN" },
          status: "SCHEDULED", // Default status
          matchType: "NORMAL",
          format: "ROUND_ROBIN",
        });
      }
    }

    // Rotate teams (except the first one)
    const lastTeam = teamIds.pop();
    if (lastTeam) {
      teamIds.splice(1, 0, lastTeam);
    }
  }

  return { generatedMatches, matchDependencies };
}

/**
 * Generates double-elimination matches.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Match generation requires complex branching logic
export function generateDoubleEliminationMatches(teamIds: string[]): {
  generatedMatches: StageMatchSeed[];
  matchDependencies: StageMatchDependency[];
} {
  const generatedMatches: StageMatchSeed[] = [];
  const matchDependencies: StageMatchDependency[] = [];
  const baseMatchProps = {
    matchType: "NORMAL" as const,
    format: "DOUBLE_ELIMINATION" as const,
  };

  if (teamIds.length < 2) {
    return { generatedMatches, matchDependencies };
  }

  const numTeams = teamIds.length;
  // const numWinnersBracketRounds = Math.ceil(Math.log2(numTeams)); // Unused
  // const numLosersBracketRounds = numWinnersBracketRounds * 2 - 1; // Unused

  const matchLabels = new Map<string, string>();
  const matchIds: string[] = [];

  // Winners Bracket - Round 1 (initial matches)
  for (let i = 0; i < numTeams / 2; i++) {
    const matchId = crypto.randomUUID();
    matchIds.push(matchId);
    matchLabels.set(matchId, `WB R1 M${i + 1}`);
    const homeTeam = teamIds[i] ?? null;
    const awayTeam = teamIds[numTeams - 1 - i] ?? null;
    generatedMatches.push({
      id: matchId,
      round: "Winners Bracket Round 1",
      homeTeamId: homeTeam,
      awayTeamId: awayTeam,
      homePlaceholder: null,
      awayPlaceholder: null,
      metadata: { format: "DOUBLE_ELIMINATION" } as MatchMetadata,
      status: "SCHEDULED",
      ...baseMatchProps,
    });
  }

  // Simplified structure for demonstration. A full double-elimination bracket
  // generation is complex and would involve many more loops and conditional logic
  // to correctly seed and link matches.

  // For now, let's create a minimal structure:
  // WB Semi-finals, WB Final
  // LB Round 1, LB Final
  // Grand Final

  // Placeholder IDs for key matches
  const winnersSemiOne = crypto.randomUUID();
  const winnersSemiTwo = crypto.randomUUID();
  const winnersFinal = crypto.randomUUID();
  const losersRoundOne = crypto.randomUUID();
  const losersFinal = crypto.randomUUID();
  const grandFinal = crypto.randomUUID();

  matchLabels.set(winnersSemiOne, "Winners Bracket Semi-final 1");
  matchLabels.set(winnersSemiTwo, "Winners Bracket Semi-final 2");
  matchLabels.set(winnersFinal, "Winners Bracket Final");
  matchLabels.set(losersRoundOne, "Losers Bracket Round 1");
  matchLabels.set(losersFinal, "Losers Bracket Final");
  matchLabels.set(grandFinal, "Grand Final");

  // Winners Bracket Semi-finals
  const match0 = matchIds[0];
  const match1 = matchIds[1];
  const label0 = match0 ? matchLabels.get(match0) || "TBD" : "TBD";
  const label1 = match1 ? matchLabels.get(match1) || "TBD" : "TBD";

  generatedMatches.push({
    id: winnersSemiOne,
    round: "Winners Bracket Semi-final",
    homeTeamId: null,
    awayTeamId: null,
    homePlaceholder: `Winner of ${label0}`,
    awayPlaceholder: `Winner of ${label1}`,
    metadata: { format: "DOUBLE_ELIMINATION" },
    status: "SCHEDULED", // Default status
    ...baseMatchProps,
  });

  if (match0) {
    matchDependencies.push({
      targetMatchId: winnersSemiOne,
      targetSide: "home",
      source: { matchId: match0, outcome: "WINNER" },
      placeholder: `Winner of ${label0}`,
    });
  }
  if (match1) {
    matchDependencies.push({
      targetMatchId: winnersSemiOne,
      targetSide: "away",
      source: { matchId: match1, outcome: "WINNER" },
      placeholder: `Winner of ${label1}`,
    });
  }

  const match2 = matchIds[2];
  const match3 = matchIds[3];
  const label2 = match2 ? matchLabels.get(match2) || "TBD" : "TBD";
  const label3 = match3 ? matchLabels.get(match3) || "TBD" : "TBD";

  generatedMatches.push({
    id: winnersSemiTwo,
    round: "Winners Bracket Semi-final",
    homeTeamId: null,
    awayTeamId: null,
    homePlaceholder: `Winner of ${label2}`,
    awayPlaceholder: `Winner of ${label3}`,
    metadata: { format: "DOUBLE_ELIMINATION" },
    status: "SCHEDULED", // Default status
    ...baseMatchProps,
  });

  if (match2) {
    matchDependencies.push({
      targetMatchId: winnersSemiTwo,
      targetSide: "home",
      source: { matchId: match2, outcome: "WINNER" },
      placeholder: `Winner of ${label2}`,
    });
  }
  if (match3) {
    matchDependencies.push({
      targetMatchId: winnersSemiTwo,
      targetSide: "away",
      source: { matchId: match3, outcome: "WINNER" },
      placeholder: `Winner of ${label3}`,
    });
  }

  // Winners Bracket Final
  const labelWS1 = matchLabels.get(winnersSemiOne) || "TBD";
  const labelWS2 = matchLabels.get(winnersSemiTwo) || "TBD";

  generatedMatches.push({
    id: winnersFinal,
    round: "Winners Bracket Final",
    homeTeamId: null,
    awayTeamId: null,
    homePlaceholder: `Winner of ${labelWS1}`,
    awayPlaceholder: `Winner of ${labelWS2}`,
    metadata: { format: "DOUBLE_ELIMINATION" },
    status: "SCHEDULED", // Default status
    ...baseMatchProps,
  });
  matchDependencies.push({
    targetMatchId: winnersFinal,
    targetSide: "home",
    source: { matchId: winnersSemiOne, outcome: "WINNER" },
    placeholder: `Winner of ${labelWS1}`,
  });
  matchDependencies.push({
    targetMatchId: winnersFinal,
    targetSide: "away",
    source: { matchId: winnersSemiTwo, outcome: "WINNER" },
    placeholder: `Winner of ${labelWS2}`,
  });

  // Losers Bracket Round 1 (losers from WB R1)
  generatedMatches.push({
    id: losersRoundOne,
    round: "Losers Bracket Round 1",
    homeTeamId: null,
    awayTeamId: null,
    homePlaceholder: `Loser of ${label0}`,
    awayPlaceholder: `Loser of ${label1}`,
    metadata: { format: "DOUBLE_ELIMINATION" },
    status: "SCHEDULED", // Default status
    ...baseMatchProps,
  });

  if (match0) {
    matchDependencies.push({
      targetMatchId: losersRoundOne,
      targetSide: "home",
      source: { matchId: match0, outcome: "LOSER" },
      placeholder: `Loser of ${label0}`,
    });
  }
  if (match1) {
    matchDependencies.push({
      targetMatchId: losersRoundOne,
      targetSide: "away",
      source: { matchId: match1, outcome: "LOSER" },
      placeholder: `Loser of ${label1}`,
    });
  }

  // Losers Bracket Final (winner of LB R1 vs loser of WB Final)
  const labelWF = matchLabels.get(winnersFinal) || "TBD";
  const labelLR1 = matchLabels.get(losersRoundOne) || "TBD";

  generatedMatches.push({
    id: losersFinal,
    round: "Losers Bracket Final",
    homeTeamId: null,
    awayTeamId: null,
    homePlaceholder: `Loser of ${labelWF}`,
    awayPlaceholder: `Winner of ${labelLR1}`,
    metadata: { format: "DOUBLE_ELIMINATION" },
    status: "SCHEDULED", // Default status
    ...baseMatchProps,
  });
  matchDependencies.push({
    targetMatchId: losersFinal,
    targetSide: "home",
    source: { matchId: winnersFinal, outcome: "LOSER" },
    placeholder: `Loser of ${labelWF}`,
  });
  matchDependencies.push({
    targetMatchId: losersFinal,
    targetSide: "away",
    source: { matchId: losersRoundOne, outcome: "WINNER" },
    placeholder: `Winner of ${labelLR1}`,
  });

  // Grand Final (winner of WB Final vs winner of LB Final)
  const labelLF = matchLabels.get(losersFinal) || "TBD";

  generatedMatches.push({
    id: grandFinal,
    round: "Grand Final",
    homeTeamId: null,
    awayTeamId: null,
    homePlaceholder: `Winner of ${labelWF}`,
    awayPlaceholder: `Winner of ${labelLF}`,
    metadata: { format: "DOUBLE_ELIMINATION" },
    status: "SCHEDULED", // Default status
    ...baseMatchProps,
  });
  matchDependencies.push({
    targetMatchId: grandFinal,
    targetSide: "home",
    source: { matchId: winnersFinal, outcome: "WINNER" },
    placeholder: `Winner of ${labelWF}`,
  });
  matchDependencies.push({
    targetMatchId: grandFinal,
    targetSide: "away",
    source: { matchId: losersFinal, outcome: "WINNER" },
    placeholder: `Winner of ${labelLF}`,
  });

  return { generatedMatches, matchDependencies };
}

/**
 * Determines the outcome of a match based on scores and score profile.
 */
export function determineMatchOutcome(
  homeScore: number,
  awayScore: number,
  outcomePoints: OutcomePoints
) {
  let result: "HOME_WIN" | "AWAY_WIN" | "DRAW";
  let homeTeamPoints = 0;
  let awayTeamPoints = 0;

  if (homeScore > awayScore) {
    result = "HOME_WIN";
    homeTeamPoints = outcomePoints.winPoints;
    awayTeamPoints = outcomePoints.lossPoints;
  } else if (awayScore > homeScore) {
    result = "AWAY_WIN";
    homeTeamPoints = outcomePoints.lossPoints;
    awayTeamPoints = outcomePoints.winPoints;
  } else {
    result = "DRAW";
    homeTeamPoints = outcomePoints.drawPoints;
    awayTeamPoints = outcomePoints.drawPoints;
  }

  return { result, homeTeamPoints, awayTeamPoints };
}

/**
 * Ensures scores are present for match completion.
 */
export function ensureScoresForCompletion(
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
  homeTeamId: string | null | undefined,
  awayTeamId: string | null | undefined
): string[] {
  const errors: string[] = [];
  if (homeScore === null || homeScore === undefined) {
    errors.push("Home team score is required to complete match.");
  }
  if (awayScore === null || awayScore === undefined) {
    errors.push("Away team score is required to complete match.");
  }
  if (homeTeamId === null || homeTeamId === undefined) {
    errors.push("Home team is required to complete match.");
  }
  if (awayTeamId === null || awayTeamId === undefined) {
    errors.push("Away team is required to complete match.");
  }
  return errors;
}

/**
 * Propagates match outcome to dependent matches.
 * TODO: Implement this once tournamentStageMatchDependencies table is created in the schema
 */
export async function propagateMatchOutcome(
  _tx: unknown,
  _completedMatch: StageMatchRow
) {
  // This function is not yet implemented because the tournamentStageMatchDependencies
  // table doesn't exist in the database schema yet.
  // Once the table is created, uncomment and implement the dependency propagation logic.
  /* 
  const dependencies = await tx
    .select()
    .from(tournamentStageMatchDependencies)
    .where(
      eq(tournamentStageMatchDependencies.sourceMatchId, completedMatch.id)
    );

  for (const dep of dependencies) {
    const targetMatch = await (tx as AppDB).query.tournamentMatches.findFirst({
      where: eq(tournamentMatches.id, dep.targetMatchId),
    });

    if (!targetMatch) {
      console.warn(
        `Target match ${dep.targetMatchId} not found for dependency.`
      );
      continue;
    }

    const winningTeamId =
      completedMatch.homeScore! > completedMatch.awayScore!
        ? completedMatch.homeTeamId
        : completedMatch.awayTeamId;
    const losingTeamId =
      completedMatch.homeScore! > completedMatch.awayScore!
        ? completedMatch.awayTeamId
        : completedMatch.homeTeamId;

    const teamToPropagate =
      dep.source.outcome === "WINNER" ? winningTeamId : losingTeamId;

    if (!teamToPropagate) {
      console.warn(
        `Could not determine team to propagate for match ${completedMatch.id}, outcome ${dep.source.outcome}`
      );
      continue;
    }

    const updateData: Partial<typeof tournamentMatches.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dep.targetSide === "home") {
      updateData.homeTeamId = teamToPropagate;
      updateData.homePlaceholder = null;
    } else if (dep.targetSide === "away") {
      updateData.awayTeamId = teamToPropagate;
      updateData.awayPlaceholder = null;
    }

    if (Object.keys(updateData).length > 1) {
      // Only update if there's actual data to change beyond updatedAt
      await tx
        .update(tournamentMatches)
        .set(updateData)
        .where(eq(tournamentMatches.id, targetMatch.id));
    }
  }
  */
}

/**
 * Normalizes the field count for a tournament.
 */
export function normalizeFieldCount(fieldCount: number | null): number {
  return fieldCount && fieldCount > 0 ? fieldCount : 1;
}

/**
 * Applies a WHERE clause to a Drizzle query.
 * This is a generic helper to allow dynamic WHERE clauses.
 */
export function applyWhereClause<
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle ORM requires flexible typing for dynamic queries
  TQuery extends { where: (clause: any) => TQuery },
>(
  query: TQuery,
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle ORM requires flexible typing for dynamic queries
  whereClause: any[]
): TQuery {
  if (whereClause.length > 0) {
    return query.where(and(...whereClause)) as TQuery;
  }
  return query;
}

/**
 * Creates an empty field role state object with all roles set to null.
 */
export function createEmptyFieldRoleState(): Record<
  TournamentFieldRole,
  {
    userId: string;
    name: string | null;
    email: string | null;
    role: string | null;
  } | null
> {
  const state: Record<
    string,
    {
      userId: string;
      name: string | null;
      email: string | null;
      role: string | null;
    } | null
  > = {};
  for (const role of tournamentFieldRoles) {
    state[role] = null;
  }
  return state as Record<
    TournamentFieldRole,
    {
      userId: string;
      name: string | null;
      email: string | null;
      role: string | null;
    } | null
  >;
}

/**
 * Creates an empty field role ID state object with all roles set to null.
 */
export function createEmptyFieldRoleIdState(): Record<
  TournamentFieldRole,
  string | null
> {
  const state: Record<string, string | null> = {};
  for (const role of tournamentFieldRoles) {
    state[role] = null;
  }
  return state as Record<TournamentFieldRole, string | null>;
}

/**
 * Builds a field roles response for a tournament.
 */
export function buildFieldRolesResponse(
  tournament: { id: string; fieldCount: number | null },
  assignments: FieldAssignmentRow[]
): {
  fieldCount: number;
  fields: FieldRoleField[];
} {
  const fieldCount = normalizeFieldCount(tournament.fieldCount);
  const fields: FieldRoleField[] = [];

  // Create a map of field number to roles
  const fieldMap = new Map<
    number,
    Record<TournamentFieldRole, FieldAssignmentRow | null>
  >();

  for (let i = 1; i <= fieldCount; i++) {
    const emptyRoles: Record<string, FieldAssignmentRow | null> = {};
    for (const role of tournamentFieldRoles) {
      emptyRoles[role] = null;
    }
    fieldMap.set(
      i,
      emptyRoles as Record<TournamentFieldRole, FieldAssignmentRow | null>
    );
  }

  // Fill in the assignments
  for (const assignment of assignments) {
    const fieldRoles = fieldMap.get(assignment.fieldNumber);
    if (fieldRoles) {
      fieldRoles[assignment.role] = assignment;
    }
  }

  // Convert to array format
  for (const [fieldNumber, roles] of fieldMap.entries()) {
    const fieldRoleField: FieldRoleField = {
      fieldNumber,
      roles: {} as Record<
        TournamentFieldRole,
        {
          userId: string;
          name: string | null;
          email: string | null;
          role: string | null;
        } | null
      >,
    };

    for (const role of tournamentFieldRoles) {
      const assignment = roles[role];
      if (assignment) {
        fieldRoleField.roles[role] = {
          userId: assignment.userId,
          name: assignment.userName,
          email: assignment.userEmail,
          role: assignment.userRole,
        };
      } else {
        fieldRoleField.roles[role] = null;
      }
    }

    fields.push(fieldRoleField);
  }

  return {
    fieldCount,
    fields,
  };
}
