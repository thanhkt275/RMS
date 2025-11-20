import type { Context } from "hono";
import { Hono } from "hono";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";
import { prisma } from "../../lib/prisma";
import { getTournamentByIdentifier } from "./utils";

const eventsRoute = new Hono();

// GET /api/tournaments/:tournamentId/stages/:stageId/events - SSE stream for stage events
eventsRoute.get("/:tournamentId/stages/:stageId/events", async (c: Context) => {
  try {
    const { tournamentId, stageId } = c.req.param();

    if (!tournamentId) {
      return c.json({ error: "Tournament ID is required" }, 400);
    }
    if (!stageId) {
      return c.json({ error: "Stage ID is required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stage = await prisma.tournamentStage.findFirst({ where: { id: stageId } });

    if (!stage) {
      return c.json({ error: "Stage not found" }, 404);
    }

    return streamSSE(c, async (stream: SSEStreamingApi) => {
      try {
        // Send initial connection event
        await stream.writeSSE({
          event: "connected",
          data: JSON.stringify({
            stageId,
            stageName: stage.name,
            message: "Connected to stage events stream",
            timestamp: new Date().toISOString(),
          }),
        });

        // Send heartbeat every 30 seconds
        const heartbeatInterval = setInterval(async () => {
          try {
            await stream.writeSSE({
              event: "heartbeat",
              data: JSON.stringify({
                stageId,
                timestamp: new Date().toISOString(),
              }),
            });
          } catch (_error) {
            clearInterval(heartbeatInterval);
          }
        }, 30_000);

        // Handle client disconnect
        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(heartbeatInterval);
        });

        // TODO: Implement Redis pub/sub for real-time events
        // For now, the stream will only send heartbeats
      } catch (_error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: "Stream error occurred" }),
        });
      }
    });
  } catch (_error) {
    return c.json({ error: "Unable to setup SSE stream" }, 500);
  }
});

export { eventsRoute };
