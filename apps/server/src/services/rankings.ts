import { type AppDB, db } from "@rms-modern/db";
import {
  type organizations,
  tournamentMatches,
  tournamentStageRankings,
  tournamentStages,
  tournamentStageTeams,
} from "@rms-modern/db/schema/organization";
import { eq } from "drizzle-orm";
import {
  parseScoreData,
  recalculateStageRankings, // Exported from utils.ts
} from "../routes/tournaments/utils";

/**
 * Fetches all matches for a given stage and returns them as a map for quick lookup.
 */
export async function fetchStageMatchesMap(stageId: string) {
  const matches = await (db as AppDB)
    .select()
    .from(tournamentMatches)
    .where(eq(tournamentMatches.stageId, stageId));

  return new Map(
    matches.map((match: typeof tournamentMatches.$inferSelect) => [
      match.id,
      match,
    ])
  );
}

/**
 * Fetches all teams for a given stage and returns them as a map for quick lookup.
 */
export async function fetchStageTeamsMap(stageId: string) {
  const teams = await (db as AppDB).query.tournamentStageTeams.findMany({
    where: eq(tournamentStageTeams.stageId, stageId), // Corrected table reference
    with: {
      organization: true,
    },
  });

  return new Map(
    teams.map(
      (
        team: typeof tournamentStageTeams.$inferSelect & {
          organization: typeof organizations.$inferSelect;
        }
      ) => [
        team.organizationId,
        {
          id: team.organizationId,
          name: team.organization.name,
          logo: team.organization.logo,
          seed: team.seed,
        },
      ]
    )
  );
}

/**
 * Fetches leaderboard rows for a specific stage.
 */
export async function fetchStageLeaderboardRows(stageId: string) {
  const rankings = await (db as AppDB).query.tournamentStageRankings.findMany({
    where: eq(tournamentStageRankings.stageId, stageId),
    with: {
      organization: true,
    },
    orderBy: (table, { asc }) => [asc(table.rank)],
  });

  return rankings.map((ranking) => ({
    teamId: ranking.organizationId,
    rank: ranking.rank,
    score: ranking.totalScore,
    tieBreaker: ranking.loseRate,
    wins: ranking.wins,
    losses: ranking.losses,
    draws: ranking.ties,
    matchesPlayed: ranking.gamesPlayed,
    scoreData: parseScoreData(ranking.scoreData),
    teamName: ranking.organization.name,
    teamLogo: ranking.organization.logo,
  }));
}

/**
 * Reads the leaderboard order from stage configuration.
 */
export function readStageLeaderboardOrder(
  stageConfiguration: string | null
): string[] {
  if (!stageConfiguration) {
    return ["rank", "score", "tieBreaker", "wins", "losses", "draws"];
  }
  try {
    const config = JSON.parse(stageConfiguration);
    return (
      config.leaderboardOrder || [
        "rank",
        "score",
        "tieBreaker",
        "wins",
        "losses",
        "draws",
      ]
    );
  } catch {
    return ["rank", "score", "tieBreaker", "wins", "losses", "draws"];
  }
}

/**
 * Synchronizes the stage leaderboard by recalculating rankings.
 */
export async function syncStageLeaderboard(stageId: string) {
  const stage = await db.query.tournamentStages.findFirst({
    where: eq(tournamentStages.id, stageId),
  });

  if (!stage) {
    return;
  }

  await db.transaction(async (tx) => {
    await recalculateStageRankings(tx, stage.id);
  });
}
