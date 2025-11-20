import { auth } from "@rms-modern/auth";
import { prisma } from "../../lib/prisma";
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
  if (!session) throw new Error("Forbidden");
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

stagesRoute.get("/:tournamentId/stages", async (c: Context) => {
  try {
    const { tournamentId } = c.req.param();
    if (typeof tournamentId !== "string") {
      return c.json({ error: "Tournament ID is required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const stages = await prisma.tournamentStage.findMany({
      where: { tournamentId: tournament.id },
      include: { teams: { include: { organization: true } } },
      orderBy: { stageOrder: "asc" },
    });

    const stagesWithDetails = await Promise.all(
      stages.map(async (stage) => {
        const [matches, rankings] = await Promise.all([
          prisma.tournamentMatch.findMany({
            where: { stageId: stage.id },
            include: {
              homeTeam: true,
              awayTeam: true,
            },
          }),
          prisma.tournamentStageRanking.findMany({
            where: { stageId: stage.id },
            include: { organization: true },
          }),
        ]);

        const baseStage = buildStageResponses([
          {
            id: stage.id,
            tournamentId: stage.tournamentId,
            name: stage.name,
            type: stage.type,
            status: stage.status,
            stageOrder: stage.stageOrder,
            configuration: stage.configuration ?? null,
            scoreProfileId: stage.scoreProfileId ?? null,
            startedAt: stage.startedAt,
            completedAt: stage.completedAt,
            createdAt: stage.createdAt,
            updatedAt: stage.updatedAt,
            teams: stage.teams?.map((st) => ({
              organizationId: st.organizationId,
              seed: st.seed ?? null,
              organization: st.organization,
            })),
          },
        ])[0];

        return {
          ...baseStage,
          fieldCount: tournament.fieldCount ?? 1,
          matches: matches.map((match) => ({
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
            score: { home: match.homeScore, away: match.awayScore },
            metadata: match.metadata as any,
          })),
          rankings: rankings.map((ranking) => ({
            teamId: ranking.organizationId,
            name: ranking.organization?.name ?? null,
            slug: ranking.organization?.slug ?? null,
            logo: ranking.organization?.logo ?? null,
            location: ranking.organization?.location ?? null,
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
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const stage = await prisma.tournamentStage.findFirst({
      where: { id: stageId, tournamentId: tournament.id },
      include: { teams: { include: { organization: true } } },
    });

    if (!stage) return c.json({ error: "Stage not found" }, 404);

    const response = buildStageResponses([
      {
        id: stage.id,
        tournamentId: stage.tournamentId,
        name: stage.name,
        type: stage.type,
        status: stage.status,
        stageOrder: stage.stageOrder,
        configuration: stage.configuration ?? null,
        scoreProfileId: stage.scoreProfileId ?? null,
        startedAt: stage.startedAt,
        completedAt: stage.completedAt,
        createdAt: stage.createdAt,
        updatedAt: stage.updatedAt,
        teams: stage.teams?.map((st) => ({
          organizationId: st.organizationId,
          seed: st.seed ?? null,
          organization: st.organization,
        })),
      },
    ])[0];

    return c.json({ stage: response });
  } catch (error) {
    console.error("Failed to fetch stage:", error);
    return c.json({ error: "Unable to fetch stage" }, 500);
  }
});

stagesRoute.post("/:tournamentId/stages", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

    const { tournamentId } = c.req.param();
    if (typeof tournamentId !== "string") return c.json({ error: "Tournament ID is required" }, 400);

    const body = stagePayloadSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const newStage = createStageEntity(tournament.id, body);

    await prisma.tournamentStage.create({
      data: {
        id: newStage.id,
        tournamentId: newStage.tournamentId,
        name: newStage.name,
        type: newStage.type,
        status: newStage.status,
        stageOrder: newStage.stageOrder,
        configuration: newStage.configuration,
        scoreProfileId: newStage.scoreProfileId,
        startedAt: newStage.startedAt,
        completedAt: newStage.completedAt,
        createdAt: newStage.createdAt,
        updatedAt: newStage.updatedAt,
      },
    });

    return c.json(buildStageResponses([newStage])[0], 201);
  } catch (error) {
    console.error("Failed to create stage:", error);
    if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
    return c.json({ error: "Unable to create stage" }, 500);
  }
});

stagesRoute.patch("/:tournamentId/stages/:stageId", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

    const { tournamentId, stageId } = c.req.param();
    if (typeof tournamentId !== "string" || typeof stageId !== "string") {
      return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
    }

    const body = stageUpdateSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const existingStage = await prisma.tournamentStage.findFirst({
      where: { id: stageId, tournamentId: tournament.id },
    });
    if (!existingStage) return c.json({ error: "Stage not found" }, 404);

    await prisma.tournamentStage.update({
      where: { id: stageId },
      data: {
        name: body.name ?? undefined,
        type: body.type ?? undefined,
        status: body.status ?? undefined,
        stageOrder: body.order ?? undefined,
        configuration:
          body.configuration !== undefined
            ? JSON.stringify(body.configuration)
            : undefined,
        scoreProfileId: body.scoreProfileId ?? undefined,
      updatedAt: new Date(),
      },
    });

    const updatedStage = await prisma.tournamentStage.findUnique({
      where: { id: stageId },
      include: { teams: { include: { organization: true } } },
    });

    if (!updatedStage) return c.json({ error: "Stage not found after update" }, 404);

    return c.json(
      buildStageResponses([
        {
          id: updatedStage.id,
          tournamentId: updatedStage.tournamentId,
          name: updatedStage.name,
          type: updatedStage.type,
          status: updatedStage.status,
          stageOrder: updatedStage.stageOrder,
          configuration: updatedStage.configuration ?? null,
          scoreProfileId: updatedStage.scoreProfileId ?? null,
          startedAt: updatedStage.startedAt,
          completedAt: updatedStage.completedAt,
          createdAt: updatedStage.createdAt,
          updatedAt: updatedStage.updatedAt,
          teams: updatedStage.teams?.map((st) => ({
            organizationId: st.organizationId,
            seed: st.seed ?? null,
            organization: st.organization,
          })),
        },
      ])[0]
    );
  } catch (error) {
    console.error("Failed to update stage:", error);
    if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
    return c.json({ error: "Unable to update stage" }, 500);
  }
});

stagesRoute.delete("/:tournamentId/stages/:stageId", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

    const { tournamentId, stageId } = c.req.param();
    if (typeof tournamentId !== "string" || typeof stageId !== "string") {
      return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    await prisma.tournamentStage.deleteMany({ where: { id: stageId, tournamentId: tournament.id } });
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
      try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

      const { tournamentId, stageId } = c.req.param();
      if (typeof tournamentId !== "string" || typeof stageId !== "string") {
        return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
      }

      const { teamIds } = await c.req.json();
      if (!Array.isArray(teamIds)) return c.json({ error: "teamIds must be an array" }, 400);

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const stage = await prisma.tournamentStage.findFirst({ where: { id: stageId, tournamentId: tournament.id } });
      if (!stage) return c.json({ error: "Stage not found" }, 404);

      await assignStageTeams(
        {
          id: stage.id,
          tournamentId: stage.tournamentId,
          name: stage.name,
          type: stage.type,
          status: stage.status as any,
          stageOrder: stage.stageOrder,
          configuration: stage.configuration ?? null,
          scoreProfileId: stage.scoreProfileId ?? null,
          startedAt: stage.startedAt,
          completedAt: stage.completedAt,
          createdAt: stage.createdAt,
          updatedAt: stage.updatedAt,
        },
        teamIds
      );

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
      try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

      const { tournamentId, stageId } = c.req.param();
      if (typeof tournamentId !== "string" || typeof stageId !== "string") {
        return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
      }

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const stageWithTeams = await prisma.tournamentStage.findFirst({
        where: { id: stageId, tournamentId: tournament.id },
        include: { teams: true },
      });
      if (!stageWithTeams) return c.json({ error: "Stage not found" }, 404);

      const warnings: string[] = [];
      enforceTeamRegenerationPolicy(stageWithTeams as any, warnings);

      const teamIds = stageWithTeams.teams.map((st) => st.organizationId);

      let generatedMatches: StageMatchSeed[];
      const format = parseStageConfigurationValue(
        JSON.parse(stageWithTeams.configuration || "{}"),
        "format",
        "ROUND_ROBIN"
      );

      if (format === "ROUND_ROBIN") {
        const doubleRoundRobin = parseStageConfigurationValue(
          JSON.parse(stageWithTeams.configuration || "{}"),
          "doubleRoundRobin",
          false
        );
        ({ generatedMatches } = generateRoundRobinMatches(teamIds, doubleRoundRobin));
      } else if (format === "DOUBLE_ELIMINATION") {
        ({ generatedMatches } = generateDoubleEliminationMatches(teamIds));
      } else {
        return c.json({ error: "Unsupported match format" }, 400);
      }

      await prisma.$transaction(async (tx) => {
        await tx.tournamentMatch.deleteMany({ where: { tournamentId: tournament.id, stageId } });
          if (generatedMatches.length > 0) {
          const now = new Date();
          await tx.tournamentMatch.createMany({
            data: generatedMatches.map((match) => ({
                id: match.id,
                tournamentId: tournament.id,
                stageId,
                round: match.round,
              status: (match.status as any) || "SCHEDULED",
              scheduledAt: null,
              matchType: match.matchType as any,
              format: match.format as any,
                homeTeamId: match.homeTeamId,
                awayTeamId: match.awayTeamId,
                homePlaceholder: match.homePlaceholder,
                awayPlaceholder: match.awayPlaceholder,
              metadata: match.metadata as any,
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

      const updatedStage = await prisma.tournamentStage.findUnique({
        where: { id: stageId },
        include: { teams: { include: { organization: true } } },
      });

      const response = updatedStage
        ? buildStageResponses([
            {
              id: updatedStage.id,
              tournamentId: updatedStage.tournamentId,
              name: updatedStage.name,
              type: updatedStage.type,
              status: updatedStage.status,
              stageOrder: updatedStage.stageOrder,
              configuration: updatedStage.configuration ?? null,
              scoreProfileId: updatedStage.scoreProfileId ?? null,
              startedAt: updatedStage.startedAt,
              completedAt: updatedStage.completedAt,
              createdAt: updatedStage.createdAt,
              updatedAt: updatedStage.updatedAt,
              teams: updatedStage.teams?.map((st) => ({
                organizationId: st.organizationId,
                seed: st.seed ?? null,
                organization: st.organization,
              })),
            },
          ])
        : [];

      return c.json(finalizeStageResponse(response, warnings), 201);
    } catch (error) {
      console.error("Failed to generate matches:", error);
      return c.json({ error: "Unable to generate matches" }, 500);
    }
  }
);

stagesRoute.post("/:tournamentId/stages/:stageId/start", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

    const { tournamentId, stageId } = c.req.param();
    if (typeof tournamentId !== "string" || typeof stageId !== "string") {
      return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const stageWithTeams = await prisma.tournamentStage.findFirst({
      where: { id: stageId, tournamentId: tournament.id },
      include: { teams: true },
    });
    if (!stageWithTeams) return c.json({ error: "Stage not found" }, 404);

    const warnings: string[] = [];
    await handleStageMatchPreparation(stageWithTeams as any, warnings);

    await prisma.tournamentStage.update({
      where: { id: stageId },
      data: { status: "ACTIVE", startedAt: new Date() },
    });

    const updatedStage = await prisma.tournamentStage.findUnique({
      where: { id: stageId },
      include: { teams: { include: { organization: true } } },
    });

    const response = updatedStage
      ? buildStageResponses([
          {
            id: updatedStage.id,
            tournamentId: updatedStage.tournamentId,
            name: updatedStage.name,
            type: updatedStage.type,
            status: updatedStage.status,
            stageOrder: updatedStage.stageOrder,
            configuration: updatedStage.configuration ?? null,
            scoreProfileId: updatedStage.scoreProfileId ?? null,
            startedAt: updatedStage.startedAt,
            completedAt: updatedStage.completedAt,
            createdAt: updatedStage.createdAt,
            updatedAt: updatedStage.updatedAt,
            teams: updatedStage.teams?.map((st) => ({
              organizationId: st.organizationId,
              seed: st.seed ?? null,
              organization: st.organization,
            })),
      },
        ])
      : [];

    return c.json(finalizeStageResponse(response, warnings));
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
      try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

      const { tournamentId, stageId } = c.req.param();
      if (typeof tournamentId !== "string" || typeof stageId !== "string") {
        return c.json({ error: "Tournament ID and Stage ID are required" }, 400);
      }

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const stage = await prisma.tournamentStage.findFirst({
        where: { id: stageId, tournamentId: tournament.id },
      });
      if (!stage) return c.json({ error: "Stage not found" }, 404);

      const warnings: string[] = [];
      await ensureStageIsCompletable(stage as any, warnings);

      await prisma.$transaction(async (tx) => {
        await tx.tournamentStage.update({
          where: { id: stageId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
          await recalculateStageRankings(tx, stage.id);
      });

      const updatedStage = await prisma.tournamentStage.findUnique({
        where: { id: stageId },
        include: { teams: { include: { organization: true } } },
      });

      const response = updatedStage
        ? buildStageResponses([
            {
              id: updatedStage.id,
              tournamentId: updatedStage.tournamentId,
              name: updatedStage.name,
              type: updatedStage.type,
              status: updatedStage.status,
              stageOrder: updatedStage.stageOrder,
              configuration: updatedStage.configuration ?? null,
              scoreProfileId: updatedStage.scoreProfileId ?? null,
              startedAt: updatedStage.startedAt,
              completedAt: updatedStage.completedAt,
              createdAt: updatedStage.createdAt,
              updatedAt: updatedStage.updatedAt,
              teams: updatedStage.teams?.map((st) => ({
                organizationId: st.organizationId,
                seed: st.seed ?? null,
                organization: st.organization,
              })),
            },
          ])
        : [];

      return c.json(finalizeStageResponse(response, warnings));
    } catch (error) {
      console.error("Failed to complete stage:", error);
      return c.json({ error: "Unable to complete stage" }, 500);
    }
  }
);

export { stagesRoute };
