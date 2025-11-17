import { auth } from "@rms-modern/auth";
import { type AppDB, db } from "@rms-modern/db";
import {
  organizations,
  tournamentMatches,
  tournamentStageTeams,
} from "@rms-modern/db/schema/organization";
import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { matchGenerationSchema, matchUpdateSchema } from "./schemas";
import type { MatchMetadata } from "./types";
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

async function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>>
) {
  if (!session) {
    throw new Error("Forbidden");
  }
  const userRecord = await auth.api.getUser(session.user.id);
  if (userRecord?.role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

matchesRoute.get(
  "/:tournamentId/stages/:stageId/matches",
  async (c: Context) => {
    try {
      const { tournamentId, stageId } = c.req.param();

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
          scheduledAt: tournamentMatches.scheduledAt,
          homeTeamId: tournamentMatches.homeTeamId,
          awayTeamId: tournamentMatches.awayTeamId,
          homePlaceholder: tournamentMatches.homePlaceholder,
          awayPlaceholder: tournamentMatches.awayPlaceholder,
          homeScore: tournamentMatches.homeScore,
          awayScore: tournamentMatches.awayScore,
          metadata: tournamentMatches.metadata,
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
        matches.map((match) => ({
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

      const { tournamentId, stageId } = c.req.param();
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

      let generatedMatches: {
        id: string;
        round: string;
        homeTeamId: string | null;
        awayTeamId: string | null;
        homePlaceholder: string | null;
        awayPlaceholder: string | null;
        metadata: MatchMetadata;
      }[];

      if (body.format === "ROUND_ROBIN") {
        const result = generateRoundRobinMatches(
          stageTeams.map((t) => t.id),
          body.options?.doubleRoundRobin ?? false
        );
        generatedMatches = result.generatedMatches;
      } else if (body.format === "DOUBLE_ELIMINATION") {
        const result = generateDoubleEliminationMatches(
          stageTeams.map((t) => t.id)
        );
        generatedMatches = result.generatedMatches;
      } else {
        return c.json({ error: "Unsupported match format" }, 400);
      }

      await (db as AppDB).transaction(async (tx) => {
        // Delete existing matches for the stage
        await tx
          .delete(tournamentMatches)
          .where(
            and(
              eq(tournamentMatches.tournamentId, tournament.id),
              eq(tournamentMatches.stageId, stageId)
            )
          );

        // Insert new matches
        if (generatedMatches.length > 0) {
          await tx.insert(tournamentMatches).values(
            generatedMatches.map((match) => ({
              id: match.id,
              tournamentId: tournament.id,
              stageId,
              round: match.round,
              status: "SCHEDULED" as const,
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

      const { tournamentId, stageId, matchId } = c.req.param();
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
        updateData.metadata = body.metadata
          ? JSON.stringify(body.metadata)
          : null;
      }

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

      await (db as AppDB).transaction(async (tx) => {
        await tx
          .update(tournamentMatches)
          .set(updateData)
          .where(eq(tournamentMatches.id, matchId));

        // If match is completed, propagate outcome to dependent matches
        if (body.status === "COMPLETED" && match) {
          const homeScoreValue =
            updateData.homeScore !== undefined
              ? updateData.homeScore
              : match.homeScore;
          const awayScoreValue =
            updateData.awayScore !== undefined
              ? updateData.awayScore
              : match.awayScore;

          // `ensureScoresForCompletion` should prevent this, but this satisfies TS
          if (
            homeScoreValue === null ||
            homeScoreValue === undefined ||
            awayScoreValue === null ||
            awayScoreValue === undefined
          ) {
            throw new Error("Scores cannot be null for a completed match.");
          }

          await propagateMatchOutcome(tx, {
            id: match.id,
            stageId: match.stageId,
            round: match.round,
            status: "COMPLETED",
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
            homeScore: homeScoreValue,
            awayScore: awayScoreValue,
            metadata:
              updateData.metadata !== undefined
                ? updateData.metadata
                : match.metadata,
            homeTeamName: null,
            homeTeamSlug: null,
            homeTeamLogo: null,
            awayTeamName: null,
            awayTeamSlug: null,
            awayTeamLogo: null,
          });
        }
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to update match:", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      return c.json({ error: "Unable to update match" }, 500);
    }
  }
);

matchesRoute.get("/matches/:matchId", async (c: Context) => {
  try {
    const { matchId } = c.req.param();

    const match = await (db as AppDB).query.tournamentMatches.findFirst({
      where: eq(tournamentMatches.id, matchId),
      with: {
        tournament: true,
        stage: true,
        homeTeam: true,
        awayTeam: true,
      },
    });

    // biome-ignore lint/complexity/useSimplifiedLogicExpression: Type narrowing requires explicit checks
    if (!match || !match.tournament || !match.stage) {
      return c.json({ error: "Match not found" }, 404);
    }

    const tournament = match.tournament;
    const stage = match.stage;

    return c.json({
      id: match.id,
      round: match.round,
      status: match.status,
      scheduledAt: match.scheduledAt?.toISOString() ?? null,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      metadata: parseMatchMetadata(match.metadata),
      home: {
        id: match.homeTeamId,
        name: match.homeTeam?.name ?? null,
        slug: match.homeTeam?.slug ?? null,
        placeholder: match.homePlaceholder,
      },
      away: {
        id: match.awayTeamId,
        name: match.awayTeam?.name ?? null,
        slug: match.awayTeam?.slug ?? null,
        placeholder: match.awayPlaceholder,
      },
      tournament: {
        id: tournament.id,
        name: tournament.name,
        slug: tournament.slug,
        location: tournament.location,
      },
      stage: {
        id: stage.id,
        name: stage.name,
        type: stage.type,
      },
    });
  } catch (error) {
    console.error("Failed to fetch match:", error);
    return c.json({ error: "Unable to fetch match" }, 500);
  }
});

export { matchesRoute };
