import { type Context, Hono } from "hono";
import { prisma } from "../../lib/prisma";
import {
  fetchStageLeaderboardRows,
  readStageLeaderboardOrder,
  syncStageLeaderboard,
} from "../../services/leaderboard";
import { getTournamentByIdentifier } from "./utils";

const rankingsRoute = new Hono();

rankingsRoute.get(
  "/:tournamentId/stages/:stageId/leaderboard",
  async (c: Context) => {
    try {
      const { tournamentId, stageId } = c.req.param();
      if (!(tournamentId && stageId)) return c.json({ error: "Missing required parameters" }, 400);

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const stage = await prisma.tournamentStage.findFirst({
        where: { id: stageId, tournamentId: tournament.id },
      });
      if (!stage) return c.json({ error: "Stage not found" }, 404);

      const leaderboardRows = await fetchStageLeaderboardRows(stage.id);
      const leaderboardOrder = readStageLeaderboardOrder(stage.configuration ?? null);

      return c.json({
        stageId: stage.id,
        stageName: stage.name,
        leaderboard: leaderboardRows.map((row) => ({
          teamId: row.organizationId,
          teamName: row.teamName,
          teamLogo: row.teamLogo,
          rank: row.rank,
          score: row.score,
          tieBreaker: row.tieBreaker,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          matchesPlayed: row.matchesPlayed,
          scoreData: row.scoreData,
        })),
        order: leaderboardOrder,
      });
    } catch (error) {
      console.error("Failed to fetch stage leaderboard:", error);
      return c.json({ error: "Unable to fetch stage leaderboard" }, 500);
    }
  }
);

rankingsRoute.post(
  "/:tournamentId/stages/:stageId/sync-leaderboard",
  async (c: Context) => {
    try {
      const { tournamentId, stageId } = c.req.param();
      if (!(tournamentId && stageId)) return c.json({ error: "Missing required parameters" }, 400);

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const stage = await prisma.tournamentStage.findFirst({
        where: { id: stageId, tournamentId: tournament.id },
      });
      if (!stage) return c.json({ error: "Stage not found" }, 404);

      await syncStageLeaderboard(stage.id);
      return c.json({ success: true, message: "Leaderboard sync initiated" });
    } catch (error) {
      console.error("Failed to sync stage leaderboard:", error);
      return c.json({ error: "Unable to sync stage leaderboard" }, 500);
    }
  }
);

export { rankingsRoute };
