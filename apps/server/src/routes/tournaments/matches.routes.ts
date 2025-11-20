import { auth } from "@rms-modern/auth";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import {
  checkRobotPassStatus,
  getMatchesReadyForQueuing,
  rescheduleCanceledMatch,
  storeMatchRobotStatus,
  updateMatchStatusBasedOnRobotCheck,
} from "../../services/match-queuer";
import {
  type MatchUpdateInput,
  matchGenerationSchema,
  matchQueuerUpdateSchema,
  matchUpdateSchema,
  reschedulMatchSchema,
} from "./schemas";
import type { StageMatchSeed } from "./types";
import {
  ensureScoresForCompletion,
  formatMatchTeam,
  generateDoubleEliminationMatches,
  generateRoundRobinMatches,
  getTournamentByIdentifier,
  parseMatchMetadata,
  propagateMatchOutcome,
} from "./utils";
import { Prisma } from "@rms-modern/prisma";

const matchesRoute = new Hono<{ Bindings: Record<string, string> }>();

function generateMatchesByFormat(
  format: string,
  teamIds: string[],
  options?: { doubleRoundRobin?: boolean }
): StageMatchSeed[] {
  if (format === "ROUND_ROBIN") {
    const result = generateRoundRobinMatches(
      teamIds,
      options?.doubleRoundRobin ?? false
    );
    return result.generatedMatches;
  }
  if (format === "DOUBLE_ELIMINATION") {
    const result = generateDoubleEliminationMatches(teamIds);
    return result.generatedMatches;
  }
  throw new Error("Unsupported match format");
}

function buildMatchUpdateData(
  body: MatchUpdateInput
): Prisma.TournamentMatchUncheckedUpdateInput {
  const updateData: Prisma.TournamentMatchUncheckedUpdateInput = {
    updatedAt: new Date(),
  };

  if (body.status !== undefined) updateData.status = body.status as any;
  if (body.scheduledAt !== undefined)
    updateData.scheduledAt = body.scheduledAt
      ? new Date(body.scheduledAt)
      : null;
  if (body.homeScore !== undefined) updateData.homeScore = body.homeScore;
  if (body.awayScore !== undefined) updateData.awayScore = body.awayScore;
  if (body.homeTeamId !== undefined)
    updateData.homeTeamId = body.homeTeamId ?? null;
  if (body.awayTeamId !== undefined)
    updateData.awayTeamId = body.awayTeamId ?? null;
  if (body.metadata !== undefined) {
    updateData.metadata =
      body.metadata === null
        ? Prisma.JsonNull
        : (body.metadata as Prisma.InputJsonValue);
  }
  if (body.robotStatus !== undefined)
    updateData.robotStatus = body.robotStatus as any;
  if (body.matchType !== undefined) updateData.matchType = body.matchType as any;
  if (body.format !== undefined) updateData.format = (body.format ?? null) as any;

  return updateData;
}

async function handleMatchUpdateTransaction(
  tx: Prisma.TransactionClient,
  options: {
    matchId: string;
    updateData: Prisma.TournamentMatchUncheckedUpdateInput;
    body: MatchUpdateInput;
    match: NonNullable<Awaited<ReturnType<typeof prisma.tournamentMatch.findUnique>>>;
  }
): Promise<void> {
  const { matchId, updateData, body, match } = options;

  await tx.tournamentMatch.update({ where: { id: matchId }, data: updateData });

  if (body.status !== "COMPLETED" || !match) return;

  const homeScore =
    updateData.homeScore !== undefined ? (updateData.homeScore as number | null) : match.homeScore;
  const awayScore =
    updateData.awayScore !== undefined ? (updateData.awayScore as number | null) : match.awayScore;

  if (
    homeScore === null ||
    homeScore === undefined ||
    awayScore === null ||
    awayScore === undefined
  ) {
    throw new Error("Scores cannot be null for a completed match.");
  }

  await propagateMatchOutcome(tx, {
    id: match.id,
    stageId: (updateData.stageId as string | undefined) ?? match.stageId,
    round: (updateData.round as string | undefined) ?? match.round,
    status: "COMPLETED",
    matchType: (updateData.matchType as any) ?? match.matchType,
    format: (updateData.format as any) ?? match.format,
    scheduledAt: (updateData.scheduledAt as Date | null | undefined) ?? match.scheduledAt,
    homeTeamId: (updateData.homeTeamId as string | null | undefined) ?? match.homeTeamId,
    awayTeamId: (updateData.awayTeamId as string | null | undefined) ?? match.awayTeamId,
    homePlaceholder: match.homePlaceholder,
    awayPlaceholder: match.awayPlaceholder,
    homeScore,
    awayScore,
    metadata: (updateData.metadata as any) ?? match.metadata,
    robotStatus: (updateData.robotStatus as any) ?? match.robotStatus,
    homeTeamName: null,
    homeTeamSlug: null,
    homeTeamLogo: null,
    awayTeamName: null,
    awayTeamSlug: null,
    awayTeamLogo: null,
  });
}

function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null
): asserts session is NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
> & {
  user: { role: string };
} {
  if (!session) throw new Error("Forbidden");
  if ((session.user as { role?: string }).role !== "ADMIN") throw new Error("Forbidden");
}

function ensureQueuerOrAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null
): asserts session is NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
> & {
  user: { role: string };
} {
  if (!session) throw new Error("Forbidden");
  const role = (session.user as { role?: string }).role;
  if (role !== "QUEUER" && role !== "ADMIN") throw new Error("Forbidden");
}

matchesRoute.get(
  "/:tournamentId/stages/:stageId/matches",
  async (c: Context) => {
    try {
      const { tournamentId, stageId } = c.req.param() as {
        tournamentId: string;
        stageId: string;
      };

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const matches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: tournament.id, stageId },
        include: {
          homeTeam: { select: { name: true, logo: true } },
          awayTeam: { select: { name: true, logo: true } },
        },
        orderBy: [{ round: "asc" }, { createdAt: "asc" }],
      });

      return c.json(
        matches.map((match) => ({
          id: match.id,
          tournamentId: match.tournamentId,
          stageId: match.stageId,
          round: match.round,
          status: match.status,
          scheduledAt: match.scheduledAt?.toISOString() ?? null,
          homeTeam: formatMatchTeam(
            match.homeTeamId,
            match.homeTeam?.name ?? null,
            match.homeTeam?.logo ?? null,
            match.homePlaceholder
          ),
          awayTeam: formatMatchTeam(
            match.awayTeamId,
            match.awayTeam?.name ?? null,
            match.awayTeam?.logo ?? null,
            match.awayPlaceholder
          ),
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          metadata: parseMatchMetadata(match.metadata as any),
          matchType: match.matchType,
          format: match.format,
          robotStatus: match.robotStatus,
        }))
      );
    } catch (error) {
      console.error("Failed to fetch matches:", error);
      return c.json({ error: "Unable to fetch matches" }, 500);
    }
  }
);

matchesRoute.post(
  "/:tournamentId/stages/:stageId/generate-matches",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId } = c.req.param() as {
        tournamentId: string;
        stageId: string;
      };
      const body = matchGenerationSchema.parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const stageTeams = await prisma.tournamentStageTeam.findMany({
        where: { stageId },
        include: { organization: { select: { id: true } } },
      });
      const teamIds = stageTeams.map((t) => t.organizationId);
      const generatedMatches = generateMatchesByFormat(
        body.format,
        teamIds,
        body.options
      );

      await prisma.$transaction(async (tx) => {
        await tx.tournamentMatch.deleteMany({ where: { tournamentId: tournament.id, stageId } });
        if (generatedMatches.length > 0) {
          const now = new Date();
          await tx.tournamentMatch.createMany({
            data: generatedMatches.map((m) => ({
              id: m.id,
              tournamentId: tournament.id,
              stageId,
              round: m.round,
              status: "SCHEDULED",
              scheduledAt: null,
              matchType: m.matchType,
              format: m.format,
              homeTeamId: m.homeTeamId,
              awayTeamId: m.awayTeamId,
              homePlaceholder: m.homePlaceholder,
              awayPlaceholder: m.awayPlaceholder,
              metadata: m.metadata as any,
              robotStatus: null,
              homeRobotStatus: null,
              homeRobotNotes: null,
              awayRobotStatus: null,
              awayRobotNotes: null,
              homeScore: null,
              awayScore: null,
              createdAt: now,
              updatedAt: now,
            })),
          });
        }
      });

      return c.json({ success: true, count: generatedMatches.length });
    } catch (error) {
      console.error("Failed to generate matches:", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 500);
      }
      return c.json({ error: "Unable to generate matches" }, 500);
    }
  }
);

matchesRoute.patch(
  "/:tournamentId/stages/:stageId/matches/:matchId",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId, matchId } = c.req.param() as {
        tournamentId: string;
        stageId: string;
        matchId: string;
      };
      const body = matchUpdateSchema.parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const match = await prisma.tournamentMatch.findFirst({
        where: { id: matchId, tournamentId: tournament.id, stageId },
      });
      if (!match) return c.json({ error: "Match not found" }, 404);

      const updateData = buildMatchUpdateData(body);

      if (body.status === "COMPLETED") {
        const errors = ensureScoresForCompletion(
          body.homeScore,
          body.awayScore,
          body.homeTeamId,
          body.awayTeamId
        );
        if (errors.length > 0) return c.json({ error: errors.join(", ") }, 400);
      }

      await prisma.$transaction(async (tx) => {
        await handleMatchUpdateTransaction(tx, { matchId, updateData, body, match });
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to update match:", error);
      if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
      if (error instanceof Error) return c.json({ error: error.message }, 500);
      return c.json({ error: "Unable to update match" }, 500);
    }
  }
);

matchesRoute.patch(
  "/:tournamentId/stages/:stageId/matches/:matchId/inspection",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureQueuerOrAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId, matchId } = c.req.param() as {
        tournamentId: string;
        stageId: string;
        matchId: string;
      };
      const body = matchQueuerUpdateSchema.parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const match = await prisma.tournamentMatch.findFirst({
        where: { id: matchId, tournamentId: tournament.id, stageId },
      });
      if (!match) return c.json({ error: "Match not found" }, 404);

      await prisma.tournamentMatch.update({
        where: { id: matchId },
        data: { robotStatus: body.robotStatus as any, status: (body.status as any) ?? undefined, updatedAt: new Date() },
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to update inspection:", error);
      if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
      if (error instanceof Error) return c.json({ error: error.message }, 500);
      return c.json({ error: "Unable to update inspection" }, 500);
    }
  }
);

matchesRoute.get("/matches/:matchId", async (c: Context) => {
  try {
    const { matchId } = c.req.param() as { matchId: string };

    const match = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
    });
    if (!match) return c.json({ error: "Match not found" }, 404);

    const [tournamentData, stageData, homeTeamData, awayTeamData] = await Promise.all([
      match.tournamentId
        ? prisma.tournament.findUnique({ where: { id: match.tournamentId } })
        : Promise.resolve(null),
      match.stageId
        ? prisma.tournamentStage.findUnique({ where: { id: match.stageId } })
        : Promise.resolve(null),
      match.homeTeamId
        ? prisma.organization.findUnique({ where: { id: match.homeTeamId } })
        : Promise.resolve(null),
      match.awayTeamId
        ? prisma.organization.findUnique({ where: { id: match.awayTeamId } })
        : Promise.resolve(null),
    ]);

    if (!(tournamentData && stageData)) return c.json({ error: "Match not found" }, 404);

    return c.json({
      id: match.id,
      round: match.round,
      status: match.status,
      matchType: match.matchType,
      format: match.format,
      robotStatus: match.robotStatus,
      scheduledAt: match.scheduledAt?.toISOString() ?? null,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      metadata: parseMatchMetadata(match.metadata as any),
      home: {
        id: match.homeTeamId,
        name: homeTeamData?.name ?? null,
        slug: homeTeamData?.slug ?? null,
        placeholder: match.homePlaceholder,
      },
      away: {
        id: match.awayTeamId,
        name: awayTeamData?.name ?? null,
        slug: awayTeamData?.slug ?? null,
        placeholder: match.awayPlaceholder,
      },
      tournament: {
        id: tournamentData.id,
        name: tournamentData.name,
        slug: tournamentData.slug,
        location: tournamentData.location,
      },
      stage: {
        id: stageData.id,
        name: stageData.name,
        type: stageData.type,
      },
    });
  } catch (error) {
    console.error("Failed to fetch match:", error);
    return c.json({ error: "Unable to fetch match" }, 500);
  }
});

// Queuer endpoints
matchesRoute.post(
  "/:tournamentId/stages/:stageId/matches/:matchId/robot-check",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureQueuerOrAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId, matchId } = c.req.param() as {
        tournamentId: string;
        stageId: string;
        matchId: string;
      };
      const body = matchQueuerUpdateSchema.parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const match = await prisma.tournamentMatch.findFirst({
        where: { id: matchId, tournamentId: tournament.id, stageId },
      });
      if (!match) return c.json({ error: "Match not found" }, 404);

      const robotCheck = await checkRobotPassStatus(matchId, "", {
        passed: body.robotStatus === "PASS",
        notes: body.robotStatus === "FAIL" ? "Robot inspection failed" : undefined,
      });

      await storeMatchRobotStatus(matchId, robotCheck.status);
      await updateMatchStatusBasedOnRobotCheck(matchId, robotCheck.status);

      return c.json({ success: true, robotStatus: robotCheck.status });
    } catch (error) {
      console.error("Failed to check robot status:", error);
      if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
      if (error instanceof Error) return c.json({ error: error.message }, 500);
      return c.json({ error: "Unable to check robot status" }, 500);
    }
  }
);

matchesRoute.get(
  "/:tournamentId/stages/:stageId/matches-ready-for-queue",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureQueuerOrAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId } = c.req.param() as {
        tournamentId: string;
        stageId: string;
      };

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const matches = await getMatchesReadyForQueuing(tournament.id, stageId);

      return c.json({
        matches: matches.map((match) => ({
          id: match.id,
          round: match.round,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          scheduledAt: match.scheduledAt?.toISOString() ?? null,
          status: match.status,
        })),
        count: matches.length,
      });
    } catch (error) {
      console.error("Failed to fetch matches ready for queue:", error);
      return c.json({ error: "Unable to fetch matches" }, 500);
    }
  }
);

matchesRoute.patch(
  "/:tournamentId/stages/:stageId/matches/:matchId/reschedule",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId, matchId } = c.req.param() as {
        tournamentId: string;
        stageId: string;
        matchId: string;
      };
      const body = reschedulMatchSchema.parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const match = await prisma.tournamentMatch.findFirst({
        where: { id: matchId, tournamentId: tournament.id, stageId },
      });
      if (!match) return c.json({ error: "Match not found" }, 404);
      if (match.status !== "CANCELED") return c.json({ error: "Only canceled matches can be rescheduled" }, 400);

      await rescheduleCanceledMatch(matchId, new Date(body.scheduledAt));

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to reschedule match:", error);
      if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
      if (error instanceof Error) return c.json({ error: error.message }, 500);
      return c.json({ error: "Unable to reschedule match" }, 500);
    }
  }
);

export { matchesRoute };
