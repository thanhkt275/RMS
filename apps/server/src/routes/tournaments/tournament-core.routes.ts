import crypto from "node:crypto";
import { auth } from "@rms-modern/auth";
import { type AppDB, db } from "@rms-modern/db";
import { user } from "@rms-modern/db/schema/auth";
import type { TournamentStatus } from "@rms-modern/db/schema/organization";
import {
  tournamentParticipations,
  tournamentResources,
  tournamentStages,
  tournaments,
} from "@rms-modern/db/schema/organization";
import { and, asc, count, desc, eq, inArray, like, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { tournamentPayloadSchema, tournamentUpdateSchema } from "./schemas";
import { applyWhereClause, getTournamentByIdentifier } from "./utils";

const tournamentCoreRoute = new Hono();

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

function buildTournamentSortClause(sortBy: string, sortDirection: string) {
  const isDesc = sortDirection === "desc";
  switch (sortBy) {
    case "name":
      return isDesc ? desc(tournaments.name) : asc(tournaments.name);
    case "startDate":
      return isDesc ? desc(tournaments.startDate) : asc(tournaments.startDate);
    default:
      return isDesc ? desc(tournaments.createdAt) : asc(tournaments.createdAt);
  }
}

tournamentCoreRoute.get("/", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const {
      page = 1,
      pageSize = 20,
      search,
      statuses,
      sortBy = "createdAt",
      sortDirection = "desc",
    } = c.req.query();

    const offset = (Number(page) - 1) * Number(pageSize);

    const whereClause: Parameters<typeof applyWhereClause>[1] = [];
    if (search) {
      whereClause.push(like(tournaments.name, `%${search}%`));
    }
    if (statuses) {
      const statusArray = statuses.split(",") as TournamentStatus[];
      whereClause.push(inArray(tournaments.status, statusArray));
    }

    let listQuery = (db as AppDB)
      .select({
        id: tournaments.id,
        name: tournaments.name,
        slug: tournaments.slug,
        status: tournaments.status,
        location: tournaments.location,
        startDate: tournaments.startDate,
        endDate: tournaments.endDate,
        season: tournaments.season,
        registeredTeams: sql<number>`count(${tournamentParticipations.id})`,
        createdAt: tournaments.createdAt,
      })
      .from(tournaments)
      .leftJoin(
        tournamentParticipations,
        eq(tournaments.id, tournamentParticipations.tournamentId)
      )
      .groupBy(tournaments.id)
      .$dynamic();

    listQuery = applyWhereClause(listQuery, whereClause);
    listQuery = listQuery.orderBy(
      buildTournamentSortClause(sortBy, sortDirection)
    );

    const items = await listQuery.limit(Number(pageSize)).offset(offset);

    let countQuery = (db as AppDB)
      .select({ count: count(tournaments.id) })
      .from(tournaments)
      .$dynamic();

    countQuery = applyWhereClause(countQuery, whereClause);

    const totalItemsResult = await countQuery;
    const totalItems = totalItemsResult[0]?.count ?? 0;

    return c.json({
      items: items.map((item: (typeof items)[0]) => ({
        ...item,
        startDate: item.startDate?.toISOString() ?? null,
        endDate: item.endDate?.toISOString() ?? null,
      })),
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        totalItems,
        totalPages: Math.ceil(totalItems / Number(pageSize)),
        hasMore: Number(page) * Number(pageSize) < totalItems,
      },
      appliedFilters: {
        search: search || null,
        statuses: statuses ? statuses.split(",") : [],
      },
      sort: {
        field: sortBy,
        direction: sortDirection,
      },
    });
  } catch (error) {
    console.error("Failed to fetch tournaments:", error);
    return c.json({ error: "Unable to fetch tournaments" }, 500);
  }
});

tournamentCoreRoute.get("/admin/overview", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const totalTournaments = await (db as AppDB)
      .select({ count: count(tournaments.id) })
      .from(tournaments);
    const upcomingTournaments = await (db as AppDB)
      .select({ count: count(tournaments.id) })
      .from(tournaments)
      .where(eq(tournaments.status, "UPCOMING"));
    const ongoingTournaments = await (db as AppDB)
      .select({ count: count(tournaments.id) })
      .from(tournaments)
      .where(eq(tournaments.status, "ONGOING"));
    const completedTournaments = await (db as AppDB)
      .select({ count: count(tournaments.id) })
      .from(tournaments)
      .where(eq(tournaments.status, "COMPLETED"));

    // Get total registrations (organizations registered for tournaments)
    const totalRegistrations = await (db as AppDB)
      .select({ count: count(tournamentParticipations.id) })
      .from(tournamentParticipations);

    // Get recent tournaments with registration counts
    const recentTournaments = await (db as AppDB)
      .select({
        id: tournaments.id,
        name: tournaments.name,
        status: tournaments.status,
        startDate: tournaments.startDate,
        fieldCount: tournaments.fieldCount,
        registeredTeams: count(tournamentParticipations.organizationId),
      })
      .from(tournaments)
      .leftJoin(
        tournamentParticipations,
        eq(tournaments.id, tournamentParticipations.tournamentId)
      )
      .groupBy(tournaments.id)
      .orderBy(desc(tournaments.createdAt))
      .limit(10);

    return c.json({
      stats: {
        totalTournaments: totalTournaments[0]?.count ?? 0,
        upcoming: upcomingTournaments[0]?.count ?? 0,
        ongoing: ongoingTournaments[0]?.count ?? 0,
        completed: completedTournaments[0]?.count ?? 0,
        totalRegistrations: totalRegistrations[0]?.count ?? 0,
      },
      recentTournaments: recentTournaments.map(
        (t: (typeof recentTournaments)[0]) => ({
          id: t.id,
          name: t.name,
          status: t.status as TournamentStatus,
          startDate: t.startDate?.toISOString() ?? null,
          fieldCount: t.fieldCount ?? 1,
          registeredTeams: Number(t.registeredTeams) ?? 0,
        })
      ),
    });
  } catch (error) {
    console.error("Failed to fetch admin overview:", error);
    return c.json({ error: "Unable to fetch admin overview" }, 500);
  }
});

tournamentCoreRoute.get("/admin/staff", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const allUserRoles = [
      "TEAM_MENTOR",
      "TEAM_LEADER",
      "TEAM_MEMBER",
      "COMMON",
      "ADMIN",
      "TSO",
      "HEAD_REFEREE",
      "SCORE_KEEPER",
      "QUEUER",
    ] as const;

    const staffUsers = await (db as AppDB)
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        type: user.type,
      })
      .from(user)
      .where(
        and(
          eq(user.type, "ORG"),
          inArray(
            user.role,
            allUserRoles.filter(
              (
                role
              ): role is
                | "ADMIN"
                | "TSO"
                | "HEAD_REFEREE"
                | "SCORE_KEEPER"
                | "QUEUER" =>
                role === "ADMIN" ||
                role === "TSO" ||
                role === "HEAD_REFEREE" ||
                role === "SCORE_KEEPER" ||
                role === "QUEUER"
            )
          )
        )
      )
      .orderBy(asc(user.name));

    return c.json({ staff: staffUsers });
  } catch (error) {
    console.error("Failed to fetch staff users:", error);
    return c.json({ error: "Unable to fetch staff users" }, 500);
  }
});

tournamentCoreRoute.post("/", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const body = tournamentPayloadSchema.parse(await c.req.json());

    const tournamentId = crypto.randomUUID();
    const slug = `${body.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

    await (db as AppDB).insert(tournaments).values({
      id: tournamentId,
      name: body.name,
      slug,
      status: body.status,
      location: body.location,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      season: body.season,
      logo: body.logo,
      coverImage: body.coverImage,
      description: body.description,
      fieldCount: body.fieldCount,
      createdBy: session.user.id,
    });

    return c.json({ id: tournamentId, slug, name: body.name }, 201);
  } catch (error) {
    console.error("Failed to create tournament:", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to create tournament" }, 500);
  }
});

tournamentCoreRoute.get("/:identifier", async (c: Context) => {
  try {
    const { identifier } = c.req.param();

    if (!identifier) {
      return c.json({ error: "Tournament identifier is required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    // Fetch stages for this tournament
    const stages = await (db as AppDB).query.tournamentStages.findMany({
      where: eq(tournamentStages.tournamentId, tournament.id),
      orderBy: asc(tournamentStages.stageOrder),
    });

    // Fetch registered teams (participations)
    const participations = await (
      db as AppDB
    ).query.tournamentParticipations.findMany({
      where: eq(tournamentParticipations.tournamentId, tournament.id),
      with: {
        organization: true,
      },
    });

    // Fetch resources
    const resources = await (db as AppDB).query.tournamentResources.findMany({
      where: eq(tournamentResources.tournamentId, tournament.id),
    });

    return c.json({
      ...tournament,
      startDate: tournament.startDate?.toISOString() ?? null,
      endDate: tournament.endDate?.toISOString() ?? null,
      registrationDeadline:
        tournament.registrationDeadline?.toISOString() ?? null,
      stages: stages.map((stage: (typeof stages)[0]) => ({
        id: stage.id,
        name: stage.name,
        type: stage.type,
        status: stage.status,
        order: stage.stageOrder,
      })),
      participants: participations.map((p: (typeof participations)[0]) => ({
        id: p.id,
        teamId: p.organizationId,
        teamName: p.organization.name,
        teamSlug: p.organization.slug,
        teamLogo: p.organization.logo,
        teamLocation: p.organization.location,
        status: p.status,
        seed: p.seed,
        placement: p.placement,
        result: p.result,
        record: p.record,
        notes: p.notes,
      })),
      resources: resources.map((r: (typeof resources)[0]) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        type: r.type,
        description: r.description,
        createdAt: r.createdAt.toISOString(),
      })),
      registeredTeams: participations.length,
    });
  } catch (error) {
    console.error("Failed to fetch tournament:", error);
    return c.json({ error: "Unable to fetch tournament" }, 500);
  }
});

tournamentCoreRoute.patch("/:identifier", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { identifier } = c.req.param();

    if (!identifier) {
      return c.json({ error: "Tournament identifier is required" }, 400);
    }

    const body = tournamentUpdateSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    await (db as AppDB)
      .update(tournaments)
      .set({
        name: body.name,
        status: body.status,
        location: body.location,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        season: body.season,
        logo: body.logo,
        coverImage: body.coverImage,
        description: body.description,
        fieldCount: body.fieldCount,
        updatedAt: new Date(),
        updatedBy: session.user.id,
      })
      .where(eq(tournaments.id, tournament.id));

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to update tournament:", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to update tournament" }, 500);
  }
});

export { tournamentCoreRoute };
