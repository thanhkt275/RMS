import { auth } from "@rms-modern/auth";
import { type AppDB, db } from "@rms-modern/db";
import {
  tournamentMatches,
  tournamentStageRankings,
  tournamentStages,
  scoreProfiles,
  type tournamentStageTeams,
} from "@rms-modern/db/schema/organization";
import { and, asc, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { stagePayloadSchema, stageUpdateSchema } from "./schemas";
import type { StageMatchSeed, StageResponse } from "./types";
import {
  assignStageTeams,
  buildStageResponses,
  createStageEntity,
  enforceTeamRegenerationPolicy,
  ensureStageIsCompletable,
  generateDoubleEliminationMatches,
  generateRoundRobinMatches,
  getTournamentByIdentifier,
  handleStageMatchPreparation,
  parseStageConfigurationValue,
  recalculateStageRankings,
} from "./utils";

const stagesRoute = new Hono();

function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null
): void {
  if (!session) {
    throw new Error("Forbidden");
  }
  if ((session.user as { role?: string }).role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

function finalizeStageResponse(
  stageResponse: StageResponse[],
  warnings: string[]
): StageResponse[] {
  if (stageResponse.length > 0 && stageResponse[0]) {
    stageResponse[0].warnings = warnings;
  }
  return stageResponse;
}

async function validateScoreProfileId(
  scoreProfileId: string | null | undefined
): Promise<string | null> {
  if (!scoreProfileId) {
    return null;
  }
  const profile = await (db as AppDB).query.scoreProfiles.findFirst({
    where: eq(scoreProfiles.id, scoreProfileId),
  });
  if (!profile) {
    throw new Error("Score profile not found");
  }
  return profile.id;
}

stagesRoute.get("/:tournamentId/stages", async (c: Context) => {
  try {
    const { tournamentId } = c.req.param();

    if (typeof tournamentId !== "string") {
      return c.json({ error: "Tournament ID is required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stages = await (db as AppDB).query.tournamentStages.findMany({
      where: eq(tournamentStages.tournamentId, tournament.id),
      with: {
        teams: {
          with: {
            organization: true,
          },
        },
      },
      orderBy: asc(tournamentStages.stageOrder),
    });

    // Fetch matches and rankings for each stage
    const stagesWithDetails = await Promise.all(
      stages.map(async (stage: (typeof stages)[0]) => {
        const [matches, rankings] = await Promise.all([
          (db as AppDB).query.tournamentMatches.findMany({
            where: eq(tournamentMatches.stageId, stage.id),
            with: {
              homeTeam: true,
              awayTeam: true,
            },
          }),
          (db as AppDB).query.tournamentStageRankings.findMany({
            where: eq(tournamentStageRankings.stageId, stage.id),
            with: {
              organization: true,
            },
          }),
        ]);

        const baseStage = buildStageResponses([stage])[0];

        return {
          ...baseStage,
          fieldCount: tournament.fieldCount ?? 1,
          matches: matches.map((match: (typeof matches)[0]) => ({
            id: match.id,
            round: match.round,
            status: match.status,
            matchType: match.matchType,
            format: match.format,
            robotStatus: match.robotStatus,
            scheduledAt: match.scheduledAt?.toISOString() ?? null,
            home: {
              id: match.homeTeamId,
              name: match.homeTeam?.name ?? match.homePlaceholder ?? "TBD",
              slug: match.homeTeam?.slug ?? null,
              placeholder: match.homePlaceholder,
              logo: match.homeTeam?.logo ?? null,
            },
            away: {
              id: match.awayTeamId,
              name: match.awayTeam?.name ?? match.awayPlaceholder ?? "TBD",
              slug: match.awayTeam?.slug ?? null,
              placeholder: match.awayPlaceholder,
              logo: match.awayTeam?.logo ?? null,
            },
            score: {
              home: match.homeScore,
              away: match.awayScore,
            },
            metadata: match.metadata ? JSON.parse(match.metadata) : null,
          })),
          rankings: rankings.map((ranking: (typeof rankings)[0]) => ({
            teamId: ranking.organizationId,
            name: ranking.organization.name,
            slug: ranking.organization.slug,
            logo: ranking.organization.logo,
            location: ranking.organization.location,
            rank: ranking.rank,
            rankingPoints: ranking.rankingPoints,
            wins: ranking.wins,
            losses: ranking.losses,
            ties: ranking.ties,
            gamesPlayed: ranking.gamesPlayed,
          })),
        };
      })
    );

    return c.json({ stages: stagesWithDetails });
  } catch (error) {
    console.error("Failed to fetch stages:", error);
    return c.json({ error: "Unable to fetch stages" }, 500);
  }
});

stagesRoute.get("/:tournamentId/stages/:stageId", async (c: Context) => {
  try {
    const { tournamentId, stageId } = c.req.param();

    if (typeof tournamentId !== "string" || typeof stageId !== "string") {
      return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stage = await (db as AppDB).query.tournamentStages.findFirst({
      where: and(
        eq(tournamentStages.tournamentId, tournament.id),
        eq(tournamentStages.id, stageId)
      ),
      with: {
        teams: {
          with: {
            organization: true,
          },
        },
      },
    });

    if (!stage) {
      return c.json({ error: "Stage not found" }, 404);
    }

    return c.json({ stage: buildStageResponses([stage])[0] });
  } catch (error) {
    console.error("Failed to fetch stage:", error);
    return c.json({ error: "Unable to fetch stage" }, 500);
  }
});

stagesRoute.post("/:tournamentId/stages", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      await ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { tournamentId } = c.req.param();

    if (typeof tournamentId !== "string") {
      return c.json({ error: "Tournament ID is required" }, 400);
    }

    const body = stagePayloadSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const resolvedScoreProfileId =
      body.scoreProfileId ?? tournament.scoreProfileId ?? null;
    try {
      body.scoreProfileId = await validateScoreProfileId(resolvedScoreProfileId);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Score profile not found",
        },
        400
      );
    }

    const newStage = createStageEntity(tournament.id, body);

    await (db as AppDB).insert(tournamentStages).values(newStage);

    return c.json(buildStageResponses([newStage])[0], 201);
  } catch (error) {
    console.error("Failed to create stage:", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to create stage" }, 500);
  }
});

stagesRoute.patch("/:tournamentId/stages/:stageId", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      await ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { tournamentId, stageId } = c.req.param();

    if (typeof tournamentId !== "string" || typeof stageId !== "string") {
      return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
    }

    const body = stageUpdateSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const existingStage = await (db as AppDB).query.tournamentStages.findFirst({
      where: and(
        eq(tournamentStages.tournamentId, tournament.id),
        eq(tournamentStages.id, stageId)
      ),
    });

    if (!existingStage) {
      return c.json({ error: "Stage not found" }, 404);
    }

    const updateData: Partial<typeof tournamentStages.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.name) {
      updateData.name = body.name;
    }
    if (body.type) {
      updateData.type = body.type;
    }
    if (body.status) {
      updateData.status = body.status;
    }
    if (body.order !== undefined) {
      updateData.stageOrder = body.order;
    }
    if (body.configuration) {
      updateData.configuration = JSON.stringify(body.configuration);
    }
    if (body.scoreProfileId !== undefined) {
      try {
        updateData.scoreProfileId = await validateScoreProfileId(
          body.scoreProfileId
        );
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof Error ? error.message : "Score profile not found",
          },
          400
        );
      }
    }

    await (db as AppDB)
      .update(tournamentStages)
      .set(updateData)
      .where(eq(tournamentStages.id, stageId));

    const updatedStage = await (db as AppDB).query.tournamentStages.findFirst({
      where: eq(tournamentStages.id, stageId),
      with: {
        teams: {
          with: {
            organization: true,
          },
        },
      },
    });

    if (!updatedStage) {
      return c.json({ error: "Stage not found after update" }, 404);
    }

    return c.json(buildStageResponses([updatedStage])[0]);
  } catch (error) {
    console.error("Failed to update stage:", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to update stage" }, 500);
  }
});

stagesRoute.delete("/:tournamentId/stages/:stageId", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      await ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { tournamentId, stageId } = c.req.param();

    if (typeof tournamentId !== "string" || typeof stageId !== "string") {
      return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    await (db as AppDB)
      .delete(tournamentStages)
      .where(
        and(
          eq(tournamentStages.tournamentId, tournament.id),
          eq(tournamentStages.id, stageId)
        )
      );

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to delete stage:", error);
    return c.json({ error: "Unable to delete stage" }, 500);
  }
});

stagesRoute.post(
  "/:tournamentId/stages/:stageId/assign-teams",
  async (c: Context): Promise<Response> => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        await ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId } = c.req.param();

      if (typeof tournamentId !== "string" || typeof stageId !== "string") {
        return c.json(
          { error: "Tournament ID and Stage ID are required" },
          400
        );
      }

      const { teamIds } = await c.req.json();

      if (!Array.isArray(teamIds)) {
        return c.json({ error: "teamIds must be an array" }, 400);
      }

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const stage = await (db as AppDB).query.tournamentStages.findFirst({
        where: and(
          eq(tournamentStages.tournamentId, tournament.id),
          eq(tournamentStages.id, stageId)
        ),
      });

      if (!stage) {
        return c.json({ error: "Stage not found" }, 404);
      }

      await assignStageTeams(stage, teamIds);

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to assign teams to stage:", error);
      return c.json({ error: "Unable to assign teams to stage" }, 500);
    }
  }
);

stagesRoute.post(
  "/:tournamentId/stages/:stageId/generate-matches",
  async (c: Context): Promise<Response> => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId } = c.req.param();

      if (typeof tournamentId !== "string" || typeof stageId !== "string") {
        return c.json(
          { error: "Tournament ID and Stage ID are required" },
          400
        );
      }

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const stageWithTeams = await (
        db as AppDB
      ).query.tournamentStages.findFirst({
        where: and(
          eq(tournamentStages.tournamentId, tournament.id),
          eq(tournamentStages.id, stageId)
        ),
        with: {
          teams: true,
        },
      });

      if (!stageWithTeams) {
        return c.json({ error: "Stage not found" }, 404);
      }

      const warnings: string[] = [];
      enforceTeamRegenerationPolicy(stageWithTeams, warnings);

      const teamIds = stageWithTeams.teams.map(
        (st: typeof tournamentStageTeams.$inferSelect) => st.organizationId
      );

      const stage = stageWithTeams;

      let generatedMatches: StageMatchSeed[];

      const format = parseStageConfigurationValue(
        JSON.parse(stage.configuration || "{}"),
        "format",
        "ROUND_ROBIN"
      );

      if (format === "ROUND_ROBIN") {
        const doubleRoundRobin = parseStageConfigurationValue(
          JSON.parse(stage.configuration || "{}"),
          "doubleRoundRobin",
          false
        );
        ({ generatedMatches } = generateRoundRobinMatches(
          teamIds,
          doubleRoundRobin
        ));
      } else if (format === "DOUBLE_ELIMINATION") {
        ({ generatedMatches } = generateDoubleEliminationMatches(teamIds));
      } else {
        return c.json({ error: "Unsupported match format" }, 400);
      }

      await db.transaction(
        async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
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
              generatedMatches.map((match: (typeof generatedMatches)[0]) => ({
                id: match.id,
                tournamentId: tournament.id,
                stageId,
                round: match.round,
                status: match.status || "SCHEDULED", // Use status from metadata or default
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
        }
      );

      const updatedStage = await (db as AppDB).query.tournamentStages.findFirst(
        {
          where: eq(tournamentStages.id, stageId),
          with: {
            teams: {
              with: {
                organization: true,
              },
            },
          },
        }
      );

      return c.json(
        finalizeStageResponse(
          buildStageResponses(updatedStage ? [updatedStage] : []),
          warnings
        ),
        201
      );
    } catch (error) {
      console.error("Failed to generate matches:", error);
      return c.json({ error: "Unable to generate matches" }, 500);
    }
  }
);

stagesRoute.post("/:tournamentId/stages/:stageId/start", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { tournamentId, stageId } = c.req.param();

    if (typeof tournamentId !== "string" || typeof stageId !== "string") {
      return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stageWithTeams = await (db as AppDB).query.tournamentStages.findFirst(
      {
        where: and(
          eq(tournamentStages.tournamentId, tournament.id),
          eq(tournamentStages.id, stageId)
        ),
        with: {
          teams: true,
        },
      }
    );

    if (!stageWithTeams) {
      return c.json({ error: "Stage not found" }, 404);
    }

    const warnings: string[] = [];
    await handleStageMatchPreparation(stageWithTeams, warnings);

    await (db as AppDB)
      .update(tournamentStages)
      .set({ status: "ACTIVE", startedAt: new Date() })
      .where(eq(tournamentStages.id, stageId));

    const updatedStage = await (db as AppDB).query.tournamentStages.findFirst({
      where: eq(tournamentStages.id, stageId),
      with: {
        teams: {
          with: {
            organization: true,
          },
        },
      },
    });

    return c.json(
      finalizeStageResponse(
        buildStageResponses(updatedStage ? [updatedStage] : []),
        warnings
      )
    );
  } catch (error) {
    console.error("Failed to start stage:", error);
    return c.json({ error: "Unable to start stage" }, 500);
  }
});

stagesRoute.post(
  "/:tournamentId/stages/:stageId/complete",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, stageId } = c.req.param();

      if (typeof tournamentId !== "string" || typeof stageId !== "string") {
        return c.json(
          { error: "Tournament ID and Stage ID are required" },
          400
        );
      }

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const stage = await (db as AppDB).query.tournamentStages.findFirst({
        where: and(
          eq(tournamentStages.tournamentId, tournament.id),
          eq(tournamentStages.id, stageId)
        ),
      });

      if (!stage) {
        return c.json({ error: "Stage not found" }, 404);
      }

      const warnings: string[] = [];
      await ensureStageIsCompletable(stage, warnings);

      await (db as AppDB).transaction(
        async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
          await tx
            .update(tournamentStages)
            .set({ status: "COMPLETED", completedAt: new Date() })
            .where(eq(tournamentStages.id, stageId));

          await recalculateStageRankings(tx, stage.id);
        }
      );

      const updatedStage = await (db as AppDB).query.tournamentStages.findFirst(
        {
          where: eq(tournamentStages.id, stageId),
          with: {
            teams: {
              with: {
                organization: true,
              },
            },
          },
        }
      );

      return c.json(
        finalizeStageResponse(
          buildStageResponses(updatedStage ? [updatedStage] : []),
          warnings
        )
      );
    } catch (error) {
      console.error("Failed to complete stage:", error);
      return c.json({ error: "Unable to complete stage" }, 500);
    }
  }
);

export { stagesRoute };
