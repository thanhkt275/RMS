import { auth } from "@rms-modern/auth";
import { type AppDB, db } from "@rms-modern/db";
import {
  organizations,
  tournamentMatches,
  tournamentStages,
  tournamentStageTeams,
  tournaments,
} from "@rms-modern/db/schema/organization";
import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
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

const matchesRoute = new Hono<{ Bindings: Record<string, string> }>();

const homeTeamAlias = alias(organizations, "home_team");
const awayTeamAlias = alias(organizations, "away_team");

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
): Partial<typeof tournamentMatches.$inferInsert> {
  const updateData: Partial<typeof tournamentMatches.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.status) {
    updateData.status = body.status;
  }
  if (body.scheduledAt) {
    updateData.scheduledAt = new Date(body.scheduledAt);
  }
  if (body.homeScore !== undefined) {
    updateData.homeScore = body.homeScore;
  }
  if (body.awayScore !== undefined) {
    updateData.awayScore = body.awayScore;
  }
  if (body.homeTeamId !== undefined) {
    updateData.homeTeamId = body.homeTeamId;
  }
  if (body.awayTeamId !== undefined) {
    updateData.awayTeamId = body.awayTeamId;
  }
  if (body.metadata !== undefined) {
    updateData.metadata = body.metadata ? JSON.stringify(body.metadata) : null;
  }
  if (body.robotStatus !== undefined) {
    updateData.robotStatus = body.robotStatus;
  }
  if (body.matchType !== undefined) {
    updateData.matchType = body.matchType;
  }
  if (body.format !== undefined) {
    updateData.format = body.format ?? null;
  }

  return updateData;
}

async function handleMatchUpdateTransaction(
  typedTx: typeof db,
  options: {
    matchId: string;
    updateData: Partial<typeof tournamentMatches.$inferInsert>;
    body: MatchUpdateInput;
    match: typeof tournamentMatches.$inferSelect;
  }
): Promise<void> {
  const { matchId, updateData, body, match } = options;

  await typedTx
    .update(tournamentMatches)
    .set(updateData)
    .where(eq(tournamentMatches.id, matchId));

  if (body.status !== "COMPLETED" || !match) {
    return;
  }

  const homeScore =
    updateData.homeScore !== undefined ? updateData.homeScore : match.homeScore;
  const awayScore =
    updateData.awayScore !== undefined ? updateData.awayScore : match.awayScore;

  if (
    homeScore === null ||
    homeScore === undefined ||
    awayScore === null ||
    awayScore === undefined
  ) {
    throw new Error("Scores cannot be null for a completed match.");
  }

  await propagateMatchOutcome(typedTx, {
    id: match.id,
    stageId: match.stageId,
    round: match.round,
    status: "COMPLETED",
    matchType:
      updateData.matchType !== undefined
        ? updateData.matchType
        : match.matchType,
    format: updateData.format !== undefined ? updateData.format : match.format,
    scheduledAt: updateData.scheduledAt ?? match.scheduledAt,
    homeTeamId:
      updateData.homeTeamId !== undefined
        ? updateData.homeTeamId
        : match.homeTeamId,
    awayTeamId:
      updateData.awayTeamId !== undefined
        ? updateData.awayTeamId
        : match.awayTeamId,
    homePlaceholder: match.homePlaceholder,
    awayPlaceholder: match.awayPlaceholder,
    homeScore,
    awayScore,
    metadata:
      updateData.metadata !== undefined ? updateData.metadata : match.metadata,
    robotStatus:
      updateData.robotStatus !== undefined
        ? updateData.robotStatus
        : match.robotStatus,
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
  if (!session) {
    throw new Error("Forbidden");
  }
  if ((session.user as { role?: string }).role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

function ensureQueuerOrAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null
): asserts session is NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
> & {
  user: { role: string };
} {
  if (!session) {
    throw new Error("Forbidden");
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "QUEUER" && role !== "ADMIN") {
    throw new Error("Forbidden");
  }
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
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const matches = await (db as AppDB)
        .select({
          id: tournamentMatches.id,
          tournamentId: tournamentMatches.tournamentId,
          stageId: tournamentMatches.stageId,
          round: tournamentMatches.round,
          status: tournamentMatches.status,
          matchType: tournamentMatches.matchType,
          format: tournamentMatches.format,
          scheduledAt: tournamentMatches.scheduledAt,
          homeTeamId: tournamentMatches.homeTeamId,
          awayTeamId: tournamentMatches.awayTeamId,
          homePlaceholder: tournamentMatches.homePlaceholder,
          awayPlaceholder: tournamentMatches.awayPlaceholder,
          homeScore: tournamentMatches.homeScore,
          awayScore: tournamentMatches.awayScore,
          metadata: tournamentMatches.metadata,
          robotStatus: tournamentMatches.robotStatus,
          homeTeamName: homeTeamAlias.name,
          homeTeamLogo: homeTeamAlias.logo,
          awayTeamName: awayTeamAlias.name,
          awayTeamLogo: awayTeamAlias.logo,
        })
        .from(tournamentMatches)
        .leftJoin(
          homeTeamAlias,
          eq(tournamentMatches.homeTeamId, homeTeamAlias.id)
        )
        .leftJoin(
          awayTeamAlias,
          eq(tournamentMatches.awayTeamId, awayTeamAlias.id)
        )
        .where(
          and(
            eq(tournamentMatches.tournamentId, tournament.id),
            eq(tournamentMatches.stageId, stageId)
          )
        )
        .orderBy(
          asc(tournamentMatches.round),
          asc(tournamentMatches.createdAt)
        );

      return c.json(
        matches.map((match: (typeof matches)[0]) => ({
          id: match.id,
          tournamentId: match.tournamentId,
          stageId: match.stageId,
          round: match.round,
          status: match.status,
          scheduledAt: match.scheduledAt?.toISOString() ?? null,
          homeTeam: formatMatchTeam(
            match.homeTeamId,
            match.homeTeamName,
            match.homeTeamLogo,
            match.homePlaceholder
          ),
          awayTeam: formatMatchTeam(
            match.awayTeamId,
            match.awayTeamName,
            match.awayTeamLogo,
            match.awayPlaceholder
          ),
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          metadata: parseMatchMetadata(match.metadata),
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
        await ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId } = c.req.param() as {
        tournamentId: string;
        stageId: string;
      };
      const body = matchGenerationSchema.parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      // Fetch stage teams
      const stageTeams = await (db as AppDB)
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .innerJoin(
          tournamentStageTeams,
          eq(organizations.id, tournamentStageTeams.organizationId)
        )
        .where(eq(tournamentStageTeams.stageId, stageId));

      const teamIds = stageTeams.map((t: { id: string; name: string }) => t.id);
      const generatedMatches = generateMatchesByFormat(
        body.format,
        teamIds,
        body.options
      );

      await (db as AppDB).transaction(async (tx: unknown) => {
        const typedTx = tx as typeof db;
        // Delete existing matches for the stage
        await typedTx
          .delete(tournamentMatches)
          .where(
            and(
              eq(tournamentMatches.tournamentId, tournament.id),
              eq(tournamentMatches.stageId, stageId)
            )
          );

        // Insert new matches
        if (generatedMatches.length > 0) {
          await typedTx.insert(tournamentMatches).values(
            generatedMatches.map((match: (typeof generatedMatches)[0]) => ({
              id: match.id,
              tournamentId: tournament.id,
              stageId,
              round: match.round,
              status: "SCHEDULED" as const,
              matchType: match.matchType,
              format: match.format,
              homeTeamId: match.homeTeamId,
              awayTeamId: match.awayTeamId,
              homePlaceholder: match.homePlaceholder,
              awayPlaceholder: match.awayPlaceholder,
              metadata: JSON.stringify(match.metadata),
            }))
          );
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
        await ensureAdmin(session);
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
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const existingMatches = await (db as AppDB)
        .select()
        .from(tournamentMatches)
        .where(
          and(
            eq(tournamentMatches.id, matchId),
            eq(tournamentMatches.tournamentId, tournament.id),
            eq(tournamentMatches.stageId, stageId)
          )
        )
        .limit(1);

      if (!existingMatches.length) {
        return c.json({ error: "Match not found" }, 404);
      }

      const match = existingMatches[0] as (typeof existingMatches)[0];
      const updateData = buildMatchUpdateData(body);

      // If status is COMPLETED, ensure scores are present
      if (body.status === "COMPLETED") {
        const errors = ensureScoresForCompletion(
          body.homeScore,
          body.awayScore,
          body.homeTeamId,
          body.awayTeamId
        );
        if (errors.length > 0) {
          return c.json({ error: errors.join(", ") }, 400);
        }
      }

      await (db as AppDB).transaction(async (tx: unknown) => {
        const typedTx = tx as typeof db;
        await handleMatchUpdateTransaction(typedTx, {
          matchId,
          updateData,
          body,
          match,
        });
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to update match:", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 500);
      }
      return c.json({ error: "Unable to update match" }, 500);
    }
  }
);

matchesRoute.patch(
  "/:tournamentId/stages/:stageId/matches/:matchId/inspection",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
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
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const existingMatches = await (db as AppDB)
        .select()
        .from(tournamentMatches)
        .where(
          and(
            eq(tournamentMatches.id, matchId),
            eq(tournamentMatches.tournamentId, tournament.id),
            eq(tournamentMatches.stageId, stageId)
          )
        )
        .limit(1);

      if (!existingMatches.length) {
        return c.json({ error: "Match not found" }, 404);
      }

      const updateData: Partial<typeof tournamentMatches.$inferInsert> = {
        robotStatus: body.robotStatus,
        updatedAt: new Date(),
      };

      if (body.status) {
        updateData.status = body.status;
      }

      await (db as AppDB)
        .update(tournamentMatches)
        .set(updateData)
        .where(eq(tournamentMatches.id, matchId));

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to update inspection:", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 500);
      }
      return c.json({ error: "Unable to update inspection" }, 500);
    }
  }
);

matchesRoute.get("/matches/:matchId", async (c: Context) => {
  try {
    const { matchId } = c.req.param() as { matchId: string };

    const match = await (db as AppDB).query.tournamentMatches.findFirst({
      where: eq(tournamentMatches.id, matchId),
    });

    if (!match) {
      return c.json({ error: "Match not found" }, 404);
    }

    // Fetch tournament and stage data
    const tournamentData = match.tournamentId
      ? await (db as AppDB).query.tournaments.findFirst({
          where: eq(tournaments.id, match.tournamentId),
        })
      : null;

    const stageData = match.stageId
      ? await (db as AppDB).query.tournamentStages.findFirst({
          where: eq(tournamentStages.id, match.stageId),
        })
      : null;

    const homeTeamData = match.homeTeamId
      ? await (db as AppDB).query.organizations.findFirst({
          where: eq(organizations.id, match.homeTeamId),
        })
      : null;

    const awayTeamData = match.awayTeamId
      ? await (db as AppDB).query.organizations.findFirst({
          where: eq(organizations.id, match.awayTeamId),
        })
      : null;

    const isMissingData = !(tournamentData && stageData);
    if (isMissingData) {
      return c.json({ error: "Match not found" }, 404);
    }

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
      metadata: parseMatchMetadata(match.metadata),
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
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
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
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const existingMatches = await (db as AppDB)
        .select()
        .from(tournamentMatches)
        .where(
          and(
            eq(tournamentMatches.id, matchId),
            eq(tournamentMatches.tournamentId, tournament.id),
            eq(tournamentMatches.stageId, stageId)
          )
        )
        .limit(1);

      if (!existingMatches.length) {
        return c.json({ error: "Match not found" }, 404);
      }

      // Check robot pass status
      const robotCheck = await checkRobotPassStatus(matchId, "", {
        passed: body.robotStatus === "PASS",
        notes:
          body.robotStatus === "FAIL" ? "Robot inspection failed" : undefined,
      });

      // Store robot status
      await storeMatchRobotStatus(matchId, robotCheck.status);

      // Update match status based on robot check
      await updateMatchStatusBasedOnRobotCheck(matchId, robotCheck.status);

      return c.json({
        success: true,
        robotStatus: robotCheck.status,
      });
    } catch (error) {
      console.error("Failed to check robot status:", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 500);
      }
      return c.json({ error: "Unable to check robot status" }, 500);
    }
  }
);

matchesRoute.get(
  "/:tournamentId/stages/:stageId/matches-ready-for-queue",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
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
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

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
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
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
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const existingMatches = await (db as AppDB)
        .select()
        .from(tournamentMatches)
        .where(
          and(
            eq(tournamentMatches.id, matchId),
            eq(tournamentMatches.tournamentId, tournament.id),
            eq(tournamentMatches.stageId, stageId)
          )
        )
        .limit(1);

      if (!existingMatches.length) {
        return c.json({ error: "Match not found" }, 404);
      }

      const match = existingMatches[0] as (typeof existingMatches)[0];
      if (match.status !== "CANCELED") {
        return c.json(
          { error: "Only canceled matches can be rescheduled" },
          400
        );
      }

      await rescheduleCanceledMatch(matchId, new Date(body.scheduledAt));

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to reschedule match:", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 500);
      }
      return c.json({ error: "Unable to reschedule match" }, 500);
    }
  }
);

export { matchesRoute };
