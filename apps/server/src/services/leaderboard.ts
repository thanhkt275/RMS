import { db } from "@rms-modern/db";
import {
  organizations,
  tournamentStageRankings,
  tournamentStageTeams,
} from "@rms-modern/db/schema/organization";
import { and, eq, inArray } from "drizzle-orm";
import { getRedisClient } from "../lib/redis";

const STAGE_LEADERBOARD_PREFIX = "leaderboard:stage";

export type LeaderboardSyncEntry = {
  organizationId: string;
  rank: number;
};

export function getStageLeaderboardKey(stageId: string) {
  return `${STAGE_LEADERBOARD_PREFIX}:${stageId}`;
}

export async function syncStageLeaderboard(
  stageId: string,
  entries: LeaderboardSyncEntry[]
) {
  try {
    const redis = await getRedisClient();
    const leaderboardKey = getStageLeaderboardKey(stageId);

    if (!entries.length) {
      await redis.del(leaderboardKey);
      return;
    }

    const totalEntries = entries.length + 1;
    const serialized: Array<string | number> = [];
    for (const entry of entries) {
      const normalizedRank = entry.rank > 0 ? entry.rank : totalEntries;
      const score = Math.max(totalEntries - normalizedRank, 0) + 1;
      serialized.push(score.toString(), entry.organizationId);
    }

    await redis.del(leaderboardKey);
    await redis.zadd(leaderboardKey, ...serialized);
  } catch (error) {
    console.error("Failed to sync stage leaderboard cache", error);
  }
}

export async function readStageLeaderboardOrder(
  stageId: string,
  limit: number
) {
  try {
    const redis = await getRedisClient();
    const leaderboardKey = getStageLeaderboardKey(stageId);
    const stop = limit > 0 ? limit - 1 : -1;

    const members = await redis.zrevrange(leaderboardKey, 0, stop);
    return members;
  } catch (error) {
    console.error("Failed to read stage leaderboard order", error);
    return [];
  }
}

export async function fetchStageLeaderboardRows(
  stageId: string,
  ids: string[]
) {
  if (!ids.length) {
    return [];
  }

  const rows = await db
    .select({
      organizationId: tournamentStageRankings.organizationId,
      stageId: tournamentStageRankings.stageId,
      rank: tournamentStageRankings.rank,
      gamesPlayed: tournamentStageRankings.gamesPlayed,
      wins: tournamentStageRankings.wins,
      losses: tournamentStageRankings.losses,
      ties: tournamentStageRankings.ties,
      rankingPoints: tournamentStageRankings.rankingPoints,
      autonomousPoints: tournamentStageRankings.autonomousPoints,
      strengthPoints: tournamentStageRankings.strengthPoints,
      totalScore: tournamentStageRankings.totalScore,
      scoreData: tournamentStageRankings.scoreData,
      loseRate: tournamentStageRankings.loseRate,
      teamName: organizations.name,
      teamSlug: organizations.slug,
      teamLogo: organizations.logo,
      teamLocation: organizations.location,
      seed: tournamentStageTeams.seed,
    })
    .from(tournamentStageRankings)
    .leftJoin(
      tournamentStageTeams,
      and(
        eq(tournamentStageTeams.stageId, tournamentStageRankings.stageId),
        eq(
          tournamentStageTeams.organizationId,
          tournamentStageRankings.organizationId
        )
      )
    )
    .leftJoin(
      organizations,
      eq(tournamentStageRankings.organizationId, organizations.id)
    )
    .where(
      and(
        eq(tournamentStageRankings.stageId, stageId),
        inArray(tournamentStageRankings.organizationId, ids)
      )
    );

  return rows;
}
