import { Hono } from "hono";
import { auth } from "@rms-modern/auth";
import { db } from "@rms-modern/db";
import {
  type TournamentStatus,
  tournamentParticipations,
  tournaments,
  tournamentStatuses,
  tournamentResources,
  organizations,
  scoreProfiles,
  tournamentFieldAssignments,
  organizationMembers,
} from "@rms-modern/db/schema/organization";
import { and, asc, desc, eq, or, type SQL, sql, gt } from "drizzle-orm";
import {
  ensureAdmin,
  getTournamentByIdentifier,
  buildSlug,
  parseDate,
  normalizeFieldCount,
} from "./utils";
import { getStagesResponse } from "../tournaments";
import type { ScoreProfileSummary } from "./types";
import {
  tournamentPayloadSchema,
  tournamentUpdateSchema,
  registrationSchema,
} from "./schemas";
import type { TournamentResourceInput } from "./schemas";
import crypto from "node:crypto";
import { z } from "zod";

const tournamentCoreRoute = new Hono();

const DEFAULT_PAGE_SIZE = 10;

const sortColumnMap = {
  name: tournaments.name,
  startDate: tournaments.startDate,
  registrationDeadline: tournaments.registrationDeadline,
  createdAt: tournaments.createdAt,
} as const;

const sortableFields = Object.keys(sortColumnMap) as Array<
  keyof typeof sortColumnMap
>;

type FilterResult = {
  whereClause?: SQL;
  normalizedStatus?: TournamentStatus;
};

function resolveSortField(sortField?: string | null) {
  return sortableFields.includes(sortField as keyof typeof sortColumnMap)
    ? (sortField as keyof typeof sortColumnMap)
    : "createdAt";
}

function buildFilterClause(
  statusParam?: TournamentStatus,
  search?: string
): FilterResult {
  const expressions: SQL[] = [];
  let normalizedStatus: TournamentStatus | undefined;

  if (statusParam && tournamentStatuses.includes(statusParam)) {
    expressions.push(eq(tournaments.status, statusParam));
    normalizedStatus = statusParam;
  }

  if (search) {
    const likeValue = `%${search.toLowerCase()}%`;
    expressions.push(
      or(
        sql`lower(${tournaments.name}) like ${likeValue}`,
        sql`lower(${tournaments.description}) like ${likeValue}`,
        sql`lower(${tournaments.location}) like ${likeValue}`
      )
    );
  }

  let whereClause: SQL | undefined;
  if (expressions.length === 1) {
    whereClause = expressions[0];
  } else if (expressions.length > 1) {
    whereClause = and(...expressions);
  }

  return { whereClause, normalizedStatus };
}

function applyWhereClause<TQuery extends { where: (expr: SQL) => TQuery }>(
  query: TQuery,
  whereClause?: SQL
) {
  return whereClause ? query.where(whereClause) : query;
}

async function resolveScoreProfileId(rawId?: string | null) {
  if (typeof rawId !== "string") {
    return null;
  }
  const trimmed = rawId.trim();
  if (!trimmed.length) {
    return null;
  }
  const rows = await db
    .select({ id: scoreProfiles.id })
    .from(scoreProfiles)
    .where(eq(scoreProfiles.id, trimmed))
    .limit(1);
  if (!rows.length) {
    throw new Error("Score profile not found.");
  }
  return trimmed;
}

async function getScoreProfileSummary(
  scoreProfileId: string
): Promise<ScoreProfileSummary | null> {
  const rows = await db
    .select({
      id: scoreProfiles.id,
      name: scoreProfiles.name,
      description: scoreProfiles.description,
      definition: scoreProfiles.definition,
    })
    .from(scoreProfiles)
    .where(eq(scoreProfiles.id, scoreProfileId))
    .limit(1);
  return rows[0] ?? null;
}

type UpdateInput = z.infer<typeof tournamentUpdateSchema>;

function buildUpdatePayload(
  body: UpdateInput,
  overrides?: { scoreProfileId?: string | null }
) {
  const updatePayload: Record<string, unknown> = {};
  applyBasicFieldUpdates(updatePayload, body);
  applyDateFieldUpdates(updatePayload, body);
  applyAnnouncementUpdate(updatePayload, body);
  applyFieldCountUpdate(updatePayload, body);
  applyScoreProfileUpdate(updatePayload, overrides?.scoreProfileId);
  return updatePayload;
}

function applyBasicFieldUpdates(
  updatePayload: Record<string, unknown>,
  body: UpdateInput
) {
  if (body.name) {
    updatePayload.name = body.name.trim();
  }
  if (body.description !== undefined) {
    updatePayload.description = body.description?.trim() || null;
  }
  if (body.organizer !== undefined) {
    updatePayload.organizer = body.organizer?.trim() || null;
  }
  if (body.location !== undefined) {
    updatePayload.location = body.location?.trim() || null;
  }
  if (body.season !== undefined) {
    updatePayload.season = body.season?.trim() || null;
  }
  if (body.status) {
    updatePayload.status = body.status;
  }
}

function applyDateFieldUpdates(
  updatePayload: Record<string, unknown>,
  body: UpdateInput
) {
  if (body.startDate) {
    updatePayload.startDate = parseDate(body.startDate);
  }
  if (body.endDate !== undefined) {
    updatePayload.endDate = parseDate(body.endDate);
  }
  if (body.registrationDeadline) {
    updatePayload.registrationDeadline = parseDate(body.registrationDeadline);
  }
}

function applyAnnouncementUpdate(
  updatePayload: Record<string, unknown>,
  body: UpdateInput
) {
  if (body.announcement !== undefined) {
    updatePayload.announcement = body.announcement?.trim() || null;
  }
}

function applyFieldCountUpdate(
  updatePayload: Record<string, unknown>,
  body: UpdateInput
) {
  if (body.fieldCount !== undefined) {
    updatePayload.fieldCount = normalizeFieldCount(body.fieldCount);
  }
}

function applyScoreProfileUpdate(
  updatePayload: Record<string, unknown>,
  scoreProfileId: string | null | undefined
) {
  if (scoreProfileId !== undefined) {
    updatePayload.scoreProfileId = scoreProfileId;
  }
}

async function replaceTournamentResources(
  tournamentId: string,
  resources?: TournamentResourceInput[]
) {
  if (resources === undefined) {
    return;
  }

  await db
    .delete(tournamentResources)
    .where(eq(tournamentResources.tournamentId, tournamentId));

  if (!resources.length) {
    return;
  }

  await db.insert(tournamentResources).values(
    resources.map((resource) => ({
      id: crypto.randomUUID(),
      tournamentId,
      title: resource.title.trim(),
      url: resource.url,
      type: resource.type,
      description: resource.description?.trim(),
    }))
  );
}

tournamentCoreRoute.get("/", async (c) => {
  try {
    const url = new URL(c.req.url, "http://localhost");
    const page = Math.max(
      1,
      Number.parseInt(url.searchParams.get("page") ?? "1", 10)
    );
    const search = url.searchParams.get("search")?.trim() ?? "";
    const statusParam = url.searchParams.get("status")?.toUpperCase() as
      | TournamentStatus
      | undefined;
    const sortDirection =
      url.searchParams.get("sortDirection") === "asc" ? "asc" : "desc";
    const selectedSortField = resolveSortField(
      url.searchParams.get("sortField")
    );

    const { whereClause, normalizedStatus } = buildFilterClause(
      statusParam,
      search
    );
    const offset = (page - 1) * DEFAULT_PAGE_SIZE;

    const listQuery = db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        slug: tournaments.slug,
        status: tournaments.status,
        description: tournaments.description,
        startDate: tournaments.startDate,
        registrationDeadline: tournaments.registrationDeadline,
        organizer: tournaments.organizer,
        location: tournaments.location,
        season: tournaments.season,
        announcement: tournaments.announcement,
        scoreProfileId: tournaments.scoreProfileId,
        fieldCount: tournaments.fieldCount,
        registeredTeams: sql<number>`count(${tournamentParticipations.id})`,
      })
      .from(tournaments)
      .leftJoin(
        tournamentParticipations,
        eq(tournamentParticipations.tournamentId, tournaments.id)
      )
      .groupBy(tournaments.id);

    const orderedListQuery = applyWhereClause(listQuery, whereClause)
      .orderBy(
        sortDirection === "asc"
          ? asc(sortColumnMap[selectedSortField])
          : desc(sortColumnMap[selectedSortField])
      )
      .limit(DEFAULT_PAGE_SIZE)
      .offset(offset);

    let countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(tournaments);
    countQuery = applyWhereClause(countQuery, whereClause);

    const [items, total] = await Promise.all([orderedListQuery, countQuery]);

    const totalItems = total[0]?.count ?? 0;

    return c.json({
      items,
      pagination: {
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        totalItems,
        totalPages: Math.ceil(totalItems / DEFAULT_PAGE_SIZE) || 1,
        hasMore: page * DEFAULT_PAGE_SIZE < totalItems,
      },
      filters: {
        status: normalizedStatus ?? null,
        search,
      },
      sort: {
        field: selectedSortField,
        direction: sortDirection,
      },
      meta: {
        availableStatuses: tournamentStatuses,
      },
    });
  } catch (error) {
    console.error("Failed to list tournaments", error);
    return c.json({ error: "Unable to fetch tournaments" }, 500);
  }
});

tournamentCoreRoute.get("/admin/overview", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const [statusCounts, registrationCounts, recentTournaments] =
      await Promise.all([
        db
          .select({
            total: sql<number>`count(*)`,
            upcoming: sql<number>`sum(case when ${tournaments.status} = 'UPCOMING' then 1 else 0 end)`,
            ongoing: sql<number>`sum(case when ${tournaments.status} = 'ONGOING' then 1 else 0 end)`,
            completed: sql<number>`sum(case when ${tournaments.status} = 'COMPLETED' then 1 else 0 end)`,
          })
          .from(tournaments),
        db
          .select({
            total: sql<number>`count(*)`,
          })
          .from(tournamentParticipations),
        db
          .select({
            id: tournaments.id,
            name: tournaments.name,
            status: tournaments.status,
            startDate: tournaments.startDate,
            fieldCount: tournaments.fieldCount,
            registeredTeams: sql<number>`count(${tournamentParticipations.id})`,
          })
          .from(tournaments)
          .leftJoin(
            tournamentParticipations,
            eq(tournamentParticipations.tournamentId, tournaments.id)
          )
          .groupBy(tournaments.id)
          .orderBy(desc(tournaments.createdAt))
          .limit(5),
      ]);

    const statsRow = statusCounts[0];
    const totalRegistrations = registrationCounts[0]?.total ?? 0;

    return c.json({
      stats: {
        totalTournaments: statsRow?.total ?? 0,
        upcoming: statsRow?.upcoming ?? 0,
        ongoing: statsRow?.ongoing ?? 0,
        completed: statsRow?.completed ?? 0,
        totalRegistrations,
      },
      recentTournaments: recentTournaments.map((tournament) => ({
        ...tournament,
        startDate: tournament.startDate?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("Failed to load admin overview", error);
    return c.json({ error: "Unable to load admin overview" }, 500);
  }
});

tournamentCoreRoute.get("/:identifier", async (c) => {
  try {
    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const [resources, participants, stages, scoreProfile] = await Promise.all([
      db
        .select({
          id: tournamentResources.id,
          title: tournamentResources.title,
          url: tournamentResources.url,
          type: tournamentResources.type,
          description: tournamentResources.description,
        })
        .from(tournamentResources)
        .where(eq(tournamentResources.tournamentId, tournament.id))
        .orderBy(asc(tournamentResources.createdAt)),
      db
        .select({
          id: tournamentParticipations.id,
          notes: tournamentParticipations.notes,
          organizationId: tournamentParticipations.organizationId,
          placement: tournamentParticipations.placement,
          result: tournamentParticipations.result,
          teamName: organizations.name,
          teamSlug: organizations.slug,
          teamLocation: organizations.location,
        })
        .from(tournamentParticipations)
        .leftJoin(
          organizations,
          eq(tournamentParticipations.organizationId, organizations.id)
        )
        .where(eq(tournamentParticipations.tournamentId, tournament.id))
        .orderBy(asc(organizations.name)),
      getStagesResponse(tournament.id),
      tournament.scoreProfileId
        ? getScoreProfileSummary(tournament.scoreProfileId)
        : Promise.resolve<ScoreProfileSummary | null>(null),
    ]);

    const normalizedStages = (stages ?? []).map((stage) => ({
      ...stage,
      matchCount: stage.matches.length,
    }));

    return c.json({
      ...tournament,
      registeredTeams: participants.length,
      participants,
      resources,
      stages: normalizedStages,
      scoreProfile: scoreProfile
        ? {
            id: scoreProfile.id,
            name: scoreProfile.name,
            description: scoreProfile.description,
            definition: scoreProfile.definition,
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to fetch tournament", error);
    return c.json({ error: "Unable to fetch tournament" }, 500);
  }
});

tournamentCoreRoute.post("/", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const rawBody = await c.req.json();
    const body = tournamentPayloadSchema.parse(rawBody);
    const resolvedScoreProfileId = await resolveScoreProfileId(
      body.scoreProfileId
    );

    const id = crypto.randomUUID();
    const slug = buildSlug(body.name);

    await db.insert(tournaments).values({
      id,
      name: body.name.trim(),
      slug,
      description: body.description?.trim(),
      organizer: body.organizer?.trim(),
      location: body.location?.trim(),
      season: body.season?.trim(),
      status: body.status,
      startDate: parseDate(body.startDate),
      endDate: parseDate(body.endDate),
      registrationDeadline: parseDate(body.registrationDeadline),
      announcement: body.announcement?.trim(),
      fieldCount: normalizeFieldCount(body.fieldCount),
      scoreProfileId: resolvedScoreProfileId,
    });

    if (body.resources.length) {
      await db.insert(tournamentResources).values(
        body.resources.map((resource) => ({
          id: crypto.randomUUID(),
          tournamentId: id,
          title: resource.title.trim(),
          url: resource.url,
          type: resource.type,
          description: resource.description?.trim(),
        }))
      );
    }

    return c.json({
      id,
      slug,
      name: body.name,
      status: body.status,
    });
  } catch (error) {
    console.error("Failed to create tournament", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Unable to create tournament" }, 500);
  }
});

tournamentCoreRoute.patch("/:identifier", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session || session.user.role !== "ADMIN") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const body = tournamentUpdateSchema.parse(await c.req.json());
    let resolvedScoreProfileId: string | null | undefined;
    if (body.scoreProfileId !== undefined) {
      resolvedScoreProfileId = await resolveScoreProfileId(body.scoreProfileId);
    }
    const updatePayload = buildUpdatePayload(body, {
      scoreProfileId: resolvedScoreProfileId,
    });

    if (Object.keys(updatePayload).length > 0) {
      await db
        .update(tournaments)
        .set(updatePayload)
        .where(eq(tournaments.id, tournament.id));
    }

    await replaceTournamentResources(tournament.id, body.resources);

    if (body.fieldCount !== undefined) {
      const normalizedFieldCount = normalizeFieldCount(body.fieldCount);
      await db
        .delete(tournamentFieldAssignments)
        .where(
          and(
            eq(tournamentFieldAssignments.tournamentId, tournament.id),
            gt(tournamentFieldAssignments.fieldNumber, normalizedFieldCount)
          )
        );
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to update tournament", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Unable to update tournament" }, 500);
  }
});

tournamentCoreRoute.post("/:identifier/register", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const rawBody = await c.req.json();
    const body = registrationSchema.parse(rawBody);

    const membership = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, body.organizationId),
          eq(organizationMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (!membership.length) {
      return c.json(
        { error: "You must belong to this team to register it." },
        403
      );
    }

    const existing = await db
      .select({ id: tournamentParticipations.id })
      .from(tournamentParticipations)
      .where(
        and(
          eq(tournamentParticipations.tournamentId, tournament.id),
          eq(tournamentParticipations.organizationId, body.organizationId)
        )
      )
      .limit(1);

    if (existing.length) {
      return c.json({ error: "Team already registered" }, 409);
    }

    const participationId = crypto.randomUUID();

    await db.insert(tournamentParticipations).values({
      id: participationId,
      tournamentId: tournament.id,
      organizationId: body.organizationId,
      notes: body.notes?.trim(),
    });

    return c.json({ success: true, id: participationId });
  } catch (error) {
    console.error("Failed to register team", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to register team" }, 500);
  }
});

export { tournamentCoreRoute };
