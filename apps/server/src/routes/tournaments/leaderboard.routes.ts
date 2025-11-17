import { type Context, Hono } from "hono";
import { getTournamentByIdentifier } from "./utils";

const leaderboardRoute = new Hono();

// GET /api/tournaments/:tournamentId/leaderboard - Get overall tournament leaderboard
leaderboardRoute.get("/:tournamentId/leaderboard", async (c: Context) => {
  try {
    const { tournamentId } = c.req.param();

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    // TODO: Implement overall tournament leaderboard logic
    return c.json({ message: "Overall leaderboard not yet implemented" }, 501);
  } catch (error) {
    console.error("Failed to fetch overall leaderboard:", error);
    return c.json({ error: "Unable to fetch overall leaderboard" }, 500);
  }
});

export { leaderboardRoute };
