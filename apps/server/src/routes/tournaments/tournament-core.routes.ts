import crypto from "node:crypto";
import { auth } from "@rms-modern/auth";
import { prisma } from "../../lib/prisma";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { tournamentPayloadSchema, tournamentUpdateSchema } from "./schemas";
import { getTournamentByIdentifier } from "./utils";

const tournamentCoreRoute = new Hono();

type AccessResult = {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  isAnonymous: boolean;
};

function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null
): asserts session is NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
> & {
  user: { role: string };
} {
  if (!session) throw new Error("Forbidden");
  if ((session.user as { role?: string }).role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

async function getAccess(
  c: Context,
  allowAnonymous = false
): Promise<AccessResult | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  const isAnonymous = Boolean(
    (session.user as { isAnonymous?: boolean }).isAnonymous
  );
  if (isAnonymous && !allowAnonymous) return null;
  return { session, isAnonymous };
}

function buildOrder(sortBy?: string, sortDirection?: string) {
  const dir = sortDirection === "asc" ? "asc" : "desc";
  switch (sortBy) {
    case "name":
      return { name: dir as "asc" | "desc" };
    case "startDate":
      return { startDate: dir as "asc" | "desc" };
    default:
      return { createdAt: dir as "asc" | "desc" };
  }
}

tournamentCoreRoute.get("/", async (c: Context) => {
  try {
    const access = await getAccess(c, true);
    if (!access) return c.json({ error: "Unauthorized" }, 401);

    const {
      page = 1,
      pageSize = 20,
      search,
      statuses,
      sortBy = "createdAt",
      sortDirection = "desc",
    } = c.req.query();

    const pageNum = Number(page) || 1;
    const sizeNum = Number(pageSize) || 20;

    type TournamentFindManyArgs = NonNullable<
      Parameters<typeof prisma.tournament.findMany>[0]
    >;
    const where: TournamentFindManyArgs["where"] = {};
    if (search?.trim()) {
      (where as any).name = { contains: search.trim(), mode: "insensitive" };
    }
    if (statuses?.trim()) {
      (where as any).status = { in: statuses.split(",") };
    }

    const [items, totalItems] = await Promise.all([
      prisma.tournament.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          location: true,
          startDate: true,
          endDate: true,
          season: true,
          createdAt: true,
          _count: { select: { participations: true } },
        },
        orderBy: buildOrder(sortBy, sortDirection) as any,
        take: sizeNum,
        skip: (pageNum - 1) * sizeNum,
      }),
      prisma.tournament.count({ where }),
    ]);

    return c.json({
      items: items.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        location: t.location,
        startDate: t.startDate?.toISOString() ?? null,
        endDate: t.endDate?.toISOString() ?? null,
        season: t.season,
        registeredTeams: t._count.participations,
        createdAt: t.createdAt,
      })),
      pagination: {
        page: pageNum,
        pageSize: sizeNum,
        totalItems,
        totalPages: Math.ceil(totalItems / sizeNum),
        hasMore: pageNum * sizeNum < totalItems,
      },
      appliedFilters: {
        search: search || null,
        statuses: statuses ? statuses.split(",") : [],
      },
      sort: { field: sortBy, direction: sortDirection },
    });
  } catch (error) {
    console.error("Failed to fetch tournaments:", error);
    return c.json({ error: "Unable to fetch tournaments" }, 500);
  }
});

// Admin overview
tournamentCoreRoute.get("/admin/overview", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

    const [totalTournaments, upcoming, ongoing, completed, totalRegistrations, recent] =
      await Promise.all([
        prisma.tournament.count(),
        prisma.tournament.count({ where: { status: "UPCOMING" } }),
        prisma.tournament.count({ where: { status: "ONGOING" } }),
        prisma.tournament.count({ where: { status: "COMPLETED" } }),
        prisma.tournamentParticipation.count(),
        prisma.tournament.findMany({
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            fieldCount: true,
            createdAt: true,
            _count: { select: { participations: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    return c.json({
      stats: {
        totalTournaments,
        upcoming,
        ongoing,
        completed,
        totalRegistrations,
      },
      recentTournaments: recent.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status as any,
        startDate: t.startDate?.toISOString() ?? null,
        fieldCount: t.fieldCount ?? 1,
        registeredTeams: t._count.participations ?? 0,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch admin overview:", error);
    return c.json({ error: "Unable to fetch admin overview" }, 500);
  }
});

// Admin staff listing
tournamentCoreRoute.get("/admin/staff", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

    const staff = await prisma.user.findMany({
      where: {
        type: "ORG",
        role: { in: ["ADMIN", "TSO", "HEAD_REFEREE", "SCORE_KEEPER", "QUEUER"] },
      },
      select: { id: true, name: true, email: true, role: true, type: true },
      orderBy: { name: "asc" },
    });

    return c.json({ staff });
  } catch (error) {
    console.error("Failed to fetch staff users:", error);
    return c.json({ error: "Unable to fetch staff users" }, 500);
  }
});

// Create tournament
tournamentCoreRoute.post("/", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

    const body = tournamentPayloadSchema.parse(await c.req.json());
    const tournamentId = crypto.randomUUID();
    const slug = `${body.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

    const now = new Date();
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        name: body.name,
        slug,
        status: body.status,
        location: body.location,
        organizer: body.organizer ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        season: body.season ?? null,
        logo: body.logo ?? null,
        coverImage: body.coverImage ?? null,
        description: body.description ?? null,
        announcement: body.announcement ?? null,
        fieldCount: body.fieldCount,
        registrationDeadline: body.registrationDeadline ? new Date(body.registrationDeadline) : null,
        scoreProfileId: body.scoreProfileId ?? null,
        metadata: body.resources && body.resources.length > 0 ? { resources: body.resources } : undefined,
        createdBy: session.user.id,
        updatedBy: session.user.id,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Create tournament resources if provided
    if (body.resources && body.resources.length > 0) {
      await prisma.tournamentResource.createMany({
        data: body.resources.map((resource) => ({
          id: crypto.randomUUID(),
          tournamentId,
          title: resource.title,
          url: resource.url,
          type: resource.type,
          description: resource.description ?? null,
        })),
      });
    }

    return c.json({ id: tournamentId, slug, name: body.name }, 201);
  } catch (error) {
    console.error("Failed to create tournament:", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to create tournament" }, 500);
  }
});

// Tournament detail
tournamentCoreRoute.get("/:identifier", async (c: Context) => {
  try {
    const access = await getAccess(c, true);
    if (!access) return c.json({ error: "Unauthorized" }, 401);

    const { identifier } = c.req.param();
    if (!identifier) return c.json({ error: "Tournament identifier is required" }, 400);

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const [stages, participations, resources] = await Promise.all([
      prisma.tournamentStage.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { stageOrder: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          stageOrder: true,
        },
      }),
      prisma.tournamentParticipation.findMany({
        where: { tournamentId: tournament.id },
        select: {
          id: true,
          status: true,
          seed: true,
          placement: true,
          result: true,
          record: true,
          notes: true,
          organization: {
            select: { id: true, name: true, slug: true, logo: true, location: true },
          },
        },
      }),
      prisma.tournamentResource.findMany({
        where: { tournamentId: tournament.id },
        select: { id: true, title: true, url: true, type: true, description: true, createdAt: true },
      }),
    ]);

    return c.json({
      ...tournament,
      startDate: tournament.startDate?.toISOString() ?? null,
      endDate: tournament.endDate?.toISOString() ?? null,
      registrationDeadline: tournament.registrationDeadline?.toISOString() ?? null,
      stages: stages.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        status: s.status,
        order: s.stageOrder,
      })),
      participants: participations.map((p) => ({
        id: p.id,
        teamId: p.organization.id,
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
      resources: resources.map((r) => ({
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

// Update tournament
tournamentCoreRoute.patch("/:identifier", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    try { ensureAdmin(session); } catch { return c.json({ error: "Forbidden" }, 403); }

    const { identifier } = c.req.param();
    if (!identifier) return c.json({ error: "Tournament identifier is required" }, 400);

    const body = tournamentUpdateSchema.parse(await c.req.json());
    const t = await getTournamentByIdentifier(identifier);
    if (!t) return c.json({ error: "Tournament not found" }, 404);

    await prisma.tournament.update({
      where: { id: t.id },
      data: {
        name: body.name ?? undefined,
        status: body.status ?? undefined,
        location: body.location ?? undefined,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        season: body.season ?? undefined,
        logo: body.logo ?? undefined,
        coverImage: body.coverImage ?? undefined,
        description: body.description ?? undefined,
        fieldCount: body.fieldCount ?? undefined,
        updatedAt: new Date(),
        updatedBy: session.user.id,
      },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to update tournament:", error);
    if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
    return c.json({ error: "Unable to update tournament" }, 500);
  }
});

export { tournamentCoreRoute };
