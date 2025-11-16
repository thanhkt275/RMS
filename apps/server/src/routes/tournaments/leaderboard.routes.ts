import { Hono } from "hono";
import {
  getTournamentByIdentifier,
  getStageRecord,
  parseScoreData,
  fetchStageRankingsMap,
} from "./utils";
import {
  readStageLeaderboardOrder,
  fetchStageLeaderboardRows,
} from "../../services/leaderboard";
import type { StageRankingRow } from "./types";

const leaderboardRoute = new Hono();

leaderboardRoute.get(
  "/:identifier/stages/:stageId/leaderboard",
  async (c) => {
    try {
      const identifier = c.req.param("identifier");
      const stageId = c.req.param("stageId");
      const tournament = await getTournamentByIdentifier(identifier);

      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const stage = await getStageRecord(tournament.id, stageId);
      if (!stage) {
        return c.json({ error: "Stage not found" }, 404);
      }

      const url = new URL(c.req.url, "http://localhost");
      const limitParam = Number.parseInt(
        url.searchParams.get("limit") ?? "25",
        10
      );
      const limit = Number.isFinite(limitParam)
        ? Math.min(Math.max(limitParam, 1), 200)
        : 25;

      const orderedIds = await readStageLeaderboardOrder(stage.id, limit);
      let leaderboardRows: StageRankingRow[] = [];

      if (orderedIds.length) {
        const fetchedRows = await fetchStageLeaderboardRows(
          stage.id,
          orderedIds
        );
        const rowMap = new Map(
          fetchedRows.map((row) => [row.organizationId, row])
        );
        leaderboardRows = orderedIds
          .map((organizationId) => rowMap.get(organizationId))
          .filter((row): row is StageRankingRow => Boolean(row));

        if (leaderboardRows.length < limit) {
          const fallback =
            (await fetchStageRankingsMap([stage.id])).get(stage.id) ?? [];
          const existingIds = new Set(
            leaderboardRows.map((row) => row.organizationId)
          );
          for (const entry of fallback) {
            if (existingIds.has(entry.organizationId)) {
              continue;
            }
            leaderboardRows.push(entry);
            if (leaderboardRows.length >= limit) {
              break;
            }
          }
        }
      } else {
        const fallback =
          (await fetchStageRankingsMap([stage.id])).get(stage.id) ?? [];
        leaderboardRows = fallback.slice(0, limit);
      }

      const leaderboard = leaderboardRows.map((ranking) => ({
        teamId: ranking.organizationId,
        name: ranking.teamName,
        slug: ranking.teamSlug,
        logo: ranking.teamLogo,
        location: ranking.teamLocation,
        seed: ranking.seed ?? null,
        rank: ranking.rank,
        gamesPlayed: ranking.gamesPlayed,
        wins: ranking.wins,
        losses: ranking.losses,
        ties: ranking.ties,
        rankingPoints: ranking.rankingPoints,
        autonomousPoints: ranking.autonomousPoints,
        strengthPoints: ranking.strengthPoints,
        totalScore: ranking.totalScore,
        loseRate: ranking.loseRate,
        scoreData: parseScoreData(ranking.scoreData),
      }));

      return c.json({ stageId: stage.id, leaderboard });
    } catch (error) {
      console.error("Failed to load leaderboard", error);
      return c.json({ error: "Unable to load leaderboard" }, 500);
    }
  }
);

export { leaderboardRoute };
