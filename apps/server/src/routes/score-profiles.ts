import crypto from "node:crypto";
import { type AuthUser, auth } from "@rms-modern/auth";
import { db } from "@rms-modern/db";
import {
  scoreProfilePenaltyDirections,
  scoreProfilePenaltyTargets,
  scoreProfiles,
  tournaments,
} from "@rms-modern/db/schema/organization";
import { desc, eq, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";

const scoreProfilesRoute = new Hono();

const cooperativeBonusSchema = z
  .object({
    requiredTeamCount: z.union([z.literal(2), z.literal(4)]),
    bonusPoints: z.number().int().min(1),
    appliesTo: z.enum(["ALL_TEAMS", "PER_TEAM"]),
    description: z.string().max(500).optional(),
  })
  .optional();

const numberPartSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(3).max(180),
  description: z.string().max(500).optional(),
  type: z.literal("NUMBER"),
  pointsPerUnit: z.number().min(0),
  maxValue: z.number().int().min(0).nullable().optional(),
  cooperativeBonus: cooperativeBonusSchema,
});

const booleanPartSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(3).max(180),
  description: z.string().max(500).optional(),
  type: z.literal("BOOLEAN"),
  truePoints: z.number().min(0),
  cooperativeBonus: cooperativeBonusSchema,
});

const partSchema = z.discriminatedUnion("type", [
  numberPartSchema,
  booleanPartSchema,
]);

const penaltySchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(3).max(180),
  description: z.string().max(500).optional(),
  points: z.number().int().min(0),
  target: z.enum(scoreProfilePenaltyTargets),
  direction: z.enum(scoreProfilePenaltyDirections),
});

const scoreProfileDefinitionSchema = z.object({
  version: z.number().int().min(1).default(1),
  parts: z.array(partSchema).min(1),
  penalties: z.array(penaltySchema).default([]),
  totalFormula: z.string().min(1).max(2000),
  notes: z.string().max(1000).optional(),
});

const scoreProfilePayloadSchema = z.object({
  name: z.string().min(3).max(180),
  description: z.string().max(2000).optional(),
  definition: scoreProfileDefinitionSchema,
});

const scoreProfileUpdateSchema = scoreProfilePayloadSchema.partial();

type ScoreProfileDefinition = (typeof scoreProfiles.$inferSelect)["definition"];
type ScoreProfileRow = {
  id: string;
  name: string;
  description: string | null;
  definition: ScoreProfileDefinition;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
};

async function fetchScoreProfileById(
  profileId: string
): Promise<ScoreProfileRow | null> {
  const rows = await db
    .select({
      id: scoreProfiles.id,
      name: scoreProfiles.name,
      description: scoreProfiles.description,
      definition: scoreProfiles.definition,
      createdAt: scoreProfiles.createdAt,
      updatedAt: scoreProfiles.updatedAt,
      usageCount: sql<number>`count(${tournaments.id})`.as("usageCount"),
    })
    .from(scoreProfiles)
    .leftJoin(tournaments, eq(tournaments.scoreProfileId, scoreProfiles.id))
    .where(eq(scoreProfiles.id, profileId))
    .groupBy(scoreProfiles.id)
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],
    usageCount: rows[0].usageCount ?? 0,
  } as ScoreProfileRow;
}

async function fetchScoreProfiles(search?: string): Promise<ScoreProfileRow[]> {
  const baseQuery = db
    .select({
      id: scoreProfiles.id,
      name: scoreProfiles.name,
      description: scoreProfiles.description,
      definition: scoreProfiles.definition,
      createdAt: scoreProfiles.createdAt,
      updatedAt: scoreProfiles.updatedAt,
      usageCount: sql<number>`count(${tournaments.id})`.as("usageCount"),
    })
    .from(scoreProfiles)
    .leftJoin(tournaments, eq(tournaments.scoreProfileId, scoreProfiles.id));

  let finalQuery = baseQuery.$dynamic();

  if (search) {
    const value = `%${search}%`;
    finalQuery = finalQuery.where(
      sql`lower(${scoreProfiles.name}) like ${value} or lower(${scoreProfiles.description}) like ${value}`
    );
  }

  const rows = await finalQuery
    .groupBy(scoreProfiles.id)
    .orderBy(desc(scoreProfiles.updatedAt));

  return rows.map((row: (typeof rows)[0]) => ({
    ...row,
    usageCount: row.usageCount ?? 0,
  })) as ScoreProfileRow[];
}

function serializeScoreProfile(profile: ScoreProfileRow) {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    definition: profile.definition,
    usageCount: profile.usageCount,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

async function requireAdminSession(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return null;
  }
  const user = session.user as AuthUser;
  if (user.role !== "ADMIN") {
    return null;
  }
  return session;
}

scoreProfilesRoute.get("/", async (c: Context) => {
  try {
    const session = await requireAdminSession(c);
    if (!session) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const url = new URL(c.req.url, "http://localhost");
    const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

    const profiles = await fetchScoreProfiles(search || undefined);
    return c.json({
      items: profiles.map(serializeScoreProfile),
    });
  } catch (error) {
    console.error("Failed to list score profiles", error);
    return c.json({ error: "Unable to load score profiles" }, 500);
  }
});

scoreProfilesRoute.post("/", async (c: Context) => {
  try {
    const session = await requireAdminSession(c);
    if (!session) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const payload = scoreProfilePayloadSchema.parse(await c.req.json());
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(scoreProfiles).values({
      id,
      name: payload.name.trim(),
      description: payload.description?.trim(),
      definition: payload.definition,
      createdBy: session.user.id,
      updatedBy: session.user.id,
      createdAt: now,
      updatedAt: now,
    });

    const profile = await fetchScoreProfileById(id);
    return c.json(profile ? serializeScoreProfile(profile) : { id }, 201);
  } catch (error) {
    console.error("Failed to create score profile", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Unable to create score profile" }, 500);
  }
});

scoreProfilesRoute.get("/:id", async (c: Context) => {
  try {
    const session = await requireAdminSession(c);
    if (!session) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const id = c.req.param("id");
    const profile = await fetchScoreProfileById(id);
    if (!profile) {
      return c.json({ error: "Score profile not found" }, 404);
    }
    return c.json(serializeScoreProfile(profile));
  } catch (error) {
    console.error("Failed to fetch score profile", error);
    return c.json({ error: "Unable to fetch score profile" }, 500);
  }
});

scoreProfilesRoute.patch("/:id", async (c: Context) => {
  try {
    const session = await requireAdminSession(c);
    if (!session) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const id = c.req.param("id");
    const existing = await fetchScoreProfileById(id);
    if (!existing) {
      return c.json({ error: "Score profile not found" }, 404);
    }

    const payload = scoreProfileUpdateSchema.parse(await c.req.json());
    const updates: Record<string, unknown> = {
      updatedBy: session.user.id,
      updatedAt: new Date(),
    };

    if (payload.name) {
      updates.name = payload.name.trim();
    }
    if (payload.description !== undefined) {
      updates.description = payload.description?.trim() ?? null;
    }
    if (payload.definition) {
      updates.definition = payload.definition;
    }

    await db.update(scoreProfiles).set(updates).where(eq(scoreProfiles.id, id));

    const refreshed = await fetchScoreProfileById(id);
    return c.json(
      refreshed
        ? serializeScoreProfile(refreshed)
        : serializeScoreProfile(existing)
    );
  } catch (error) {
    console.error("Failed to update score profile", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Unable to update score profile" }, 500);
  }
});

scoreProfilesRoute.delete("/:id", async (c: Context) => {
  try {
    const session = await requireAdminSession(c);
    if (!session) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const id = c.req.param("id");
    const profile = await fetchScoreProfileById(id);
    if (!profile) {
      return c.json({ error: "Score profile not found" }, 404);
    }

    if ((profile.usageCount ?? 0) > 0) {
      return c.json(
        { error: "Score profile is assigned to active tournaments." },
        400
      );
    }

    await db.delete(scoreProfiles).where(eq(scoreProfiles.id, id));
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to delete score profile", error);
    return c.json({ error: "Unable to delete score profile" }, 500);
  }
});

export { scoreProfilesRoute };
