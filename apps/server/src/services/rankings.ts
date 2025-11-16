import crypto from "node:crypto";
import { db } from "@rms-modern/db";
import {
  tournamentStageRankings,
} from "@rms-modern/db/schema/organization";
import { eq } from "drizzle-orm";
import {
  fetchStageMatchesMap,
  fetchStageTeamsMap,
} from "../routes/tournaments/utils";
import type { StageRankingMatchSummary } from "../routes/tournaments/types";
import { syncStageLeaderboard } from "./leaderboard";
import { publishStageEvent } from "./stage-events";

const RANKING_WIN_POINTS = 2;
const RANKING_TIE_POINTS = 1;

type RankingAccumulator = {
  organizationId: string;
  seed: number | null;
  teamName: string | null;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  totalScore: number;
  totalAgainst: number;
  autonomousPoints: number;
  strengthPoints: number;
  matchHistory: StageRankingMatchSummary[];
};

export async function recalculateStageRankings(stageId: string) {
  const [teamsMap, matchesMap] = await Promise.all([
    fetchStageTeamsMap([stageId]),
    fetchStageMatchesMap([stageId]),
  ]);
  const teams = teamsMap.get(stageId) ?? [];
  const teamInfoMap = new Map(teams.map((team) => [team.organizationId, team]));
  const resolveOpponentName = (
    id: string | null,
    placeholder: string | null
  ) => {
    if (id) {
      return teamInfoMap.get(id)?.teamName ?? placeholder ?? null;
    }
    return placeholder ?? null;
  };

  if (!teams.length) {
    await db
      .delete(tournamentStageRankings)
      .where(eq(tournamentStageRankings.stageId, stageId));
    await syncStageLeaderboard(stageId, []);
    await publishStageEvent(stageId, "leaderboard.updated");
    return;
  }

  const rankingMap = new Map<string, RankingAccumulator>();
  for (const team of teams) {
    rankingMap.set(team.organizationId, {
      organizationId: team.organizationId,
      seed: team.seed,
      teamName: team.teamName,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      totalScore: 0,
      totalAgainst: 0,
      autonomousPoints: 0,
      strengthPoints: 0,
      matchHistory: [],
    });
  }

  const matches = matchesMap.get(stageId) ?? [];
  for (const match of matches) {
    if (
      match.status !== "COMPLETED" ||
      typeof match.homeScore !== "number" ||
      typeof match.awayScore !== "number" ||
      match.homeTeamId === null ||
      match.awayTeamId === null
    ) {
      continue;
    }
    const home = rankingMap.get(match.homeTeamId);
    const away = rankingMap.get(match.awayTeamId);
    if (!(home && away)) {
      continue;
    }
    home.gamesPlayed += 1;
    away.gamesPlayed += 1;
    home.totalScore += match.homeScore;
    away.totalScore += match.awayScore;

    home.totalAgainst += match.awayScore;
    away.totalAgainst += match.homeScore;

    const homeOutcome: StageRankingMatchSummary["outcome"] =
      match.homeScore > match.awayScore
        ? "WIN"
        : match.homeScore < match.awayScore
          ? "LOSS"
          : "TIE";
    const awayOutcome: StageRankingMatchSummary["outcome"] =
      homeOutcome === "WIN" ? "LOSS" : homeOutcome === "LOSS" ? "WIN" : "TIE";

    home.matchHistory.push({
      matchId: match.id,
      opponentId: match.awayTeamId,
      opponentName: resolveOpponentName(
        match.awayTeamId,
        match.awayPlaceholder
      ),
      scored: match.homeScore,
      conceded: match.awayScore,
      status: match.status,
      outcome: homeOutcome,
    });
    away.matchHistory.push({
      matchId: match.id,
      opponentId: match.homeTeamId,
      opponentName: resolveOpponentName(
        match.homeTeamId,
        match.homePlaceholder
      ),
      scored: match.awayScore,
      conceded: match.homeScore,
      status: match.status,
      outcome: awayOutcome,
    });

    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (match.awayScore > match.homeScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }

    home.strengthPoints += match.awayScore;
    away.strengthPoints += match.homeScore;
  }

  const rankings = Array.from(rankingMap.values()).map((entry) => {
    const rankingPoints =
      entry.wins * RANKING_WIN_POINTS + entry.ties * RANKING_TIE_POINTS;
    const loseRate =
      entry.gamesPlayed === 0 ? 0 : entry.losses / entry.gamesPlayed;
    return {
      ...entry,
      rankingPoints,
      loseRate,
    };
  });

  rankings.sort((a, b) => {
    if (b.rankingPoints !== a.rankingPoints) {
      return b.rankingPoints - a.rankingPoints;
    }
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (a.loseRate !== b.loseRate) {
      return a.loseRate - b.loseRate;
    }
    if (
      typeof a.seed === "number" &&
      typeof b.seed === "number" &&
      a.seed !== b.seed
    ) {
      return a.seed - b.seed;
    }
    const nameA = a.teamName ?? "";
    const nameB = b.teamName ?? "";
    return nameA.localeCompare(nameB);
  });

  await db
    .delete(tournamentStageRankings)
    .where(eq(tournamentStageRankings.stageId, stageId));

  if (!rankings.length) {
    await syncStageLeaderboard(stageId, []);
    await publishStageEvent(stageId, "leaderboard.updated");
    return;
  }

  const rankingRecords = rankings.map((entry, index) => ({
    id: crypto.randomUUID(),
    stageId,
    organizationId: entry.organizationId,
    rank: index + 1,
    gamesPlayed: entry.gamesPlayed,
    wins: entry.wins,
    losses: entry.losses,
    ties: entry.ties,
    rankingPoints: entry.rankingPoints,
    autonomousPoints: entry.autonomousPoints,
    strengthPoints: entry.strengthPoints,
    totalScore: entry.totalScore,
    scoreData: JSON.stringify({
      totalFor: entry.totalScore,
      totalAgainst: entry.totalAgainst,
      matches: entry.matchHistory,
    }),
    loseRate: entry.loseRate,
  }));

  await db.insert(tournamentStageRankings).values(rankingRecords);
  await syncStageLeaderboard(
    stageId,
    rankingRecords.map((record) => ({
      organizationId: record.organizationId,
      rank: record.rank,
    }))
  );
  await publishStageEvent(stageId, "leaderboard.updated");
}
