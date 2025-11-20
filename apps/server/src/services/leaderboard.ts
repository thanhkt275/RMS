import { prisma } from "../lib/prisma";
import { parseScoreData, recalculateStageRankings } from "../routes/tournaments/utils";

/**
 * Fetches all matches for a given stage and returns them as a map for quick lookup.
 */
export async function fetchStageMatchesMap(stageId: string) {
  const matches = await prisma.tournamentMatch.findMany({ where: { stageId } });
  return new Map(matches.map((m) => [m.id, m]));
}

/**
 * Fetches all teams for a given stage and returns them as a map for quick lookup.
 */
export async function fetchStageTeamsMap(stageId: string) {
  const teams = await prisma.tournamentStageTeam.findMany({
    where: { stageId },
    include: { organization: true },
  });

  return new Map(
    teams.map((team) => [
        team.organizationId,
        {
          id: team.organizationId,
          name: team.organization.name,
          logo: team.organization.logo,
        seed: team.seed ?? null,
        },
    ])
  );
}

/**
 * Fetches leaderboard rows for a specific stage.
 */
export async function fetchStageLeaderboardRows(stageId: string) {
  const rankings = await prisma.tournamentStageRanking.findMany({
    where: { stageId },
    include: { organization: true },
    orderBy: { rank: "asc" },
  });

  return rankings.map((ranking) => ({
    organizationId: ranking.organizationId,
    rank: ranking.rank,
    score: ranking.totalScore,
    tieBreaker: ranking.loseRate,
    wins: ranking.wins,
    losses: ranking.losses,
    draws: ranking.ties,
    matchesPlayed: ranking.gamesPlayed,
    scoreData: parseScoreData(ranking.scoreData as unknown as string | null),
    teamName: ranking.organization?.name ?? null,
    teamLogo: ranking.organization?.logo ?? null,
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
  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) return;

  await prisma.$transaction(async (tx) => {
    await recalculateStageRankings(tx, stage.id);
  });
}
