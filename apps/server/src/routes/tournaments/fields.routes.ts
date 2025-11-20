import crypto from "node:crypto";
import { auth } from "@rms-modern/auth";
import { prisma } from "../../lib/prisma";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { fieldRoleUpdateSchema } from "./schemas";
import type { FieldAssignmentRow } from "./types";
import {
  buildFieldRolesResponse,
  createEmptyFieldRoleIdState,
  getTournamentByIdentifier,
  normalizeFieldCount,
} from "./utils";

// Local enum mirror
const tournamentFieldRoles = ["TSO", "HEAD_REFEREE", "SCORE_KEEPER", "QUEUER"] as const;
type TournamentFieldRole = (typeof tournamentFieldRoles)[number];

const fieldsRoute = new Hono();

async function fetchTournamentFieldAssignments(
  tournamentId: string
): Promise<FieldAssignmentRow[]> {
  const assignments = await prisma.tournamentFieldAssignment.findMany({
    where: { tournamentId },
    include: { user: true },
  });
  return assignments.map((a) => ({
    id: a.id,
    fieldNumber: a.fieldNumber,
    role: a.role as TournamentFieldRole,
    userId: a.userId,
    userName: a.user?.name ?? null,
    userEmail: a.user?.email ?? null,
    userRole: a.user?.role ?? null,
  }));
}

function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>>
): void {
  if (!session) {
    throw new Error("Forbidden");
  }
  if ((session.user as { role?: string | null }).role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

fieldsRoute.get("/:identifier/field-roles", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const assignments = await fetchTournamentFieldAssignments(tournament.id);
    const fieldRolesData = buildFieldRolesResponse(tournament, assignments);

    return c.json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        fieldCount: fieldRolesData.fieldCount,
      },
      fields: fieldRolesData.fields,
      assignments: assignments.map((a) => ({
        id: a.id,
        fieldNumber: a.fieldNumber,
        role: a.role,
        user: a.userId
          ? {
              userId: a.userId,
              name: a.userName,
              email: a.userEmail,
              role: a.userRole,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch field roles", error);
    return c.json({ error: "Unable to fetch field roles" }, 500);
  }
});

function buildAssignmentMap(
  assignments: unknown,
  normalizedFieldCount: number
): Map<number, Record<TournamentFieldRole, string | null>> | { error: string } {
  const body = fieldRoleUpdateSchema.parse(assignments);
  const assignmentMap = new Map<
    number,
    Record<TournamentFieldRole, string | null>
  >();

  for (const assignment of body.assignments) {
    if (assignment.fieldNumber > normalizedFieldCount) {
      return {
        error: `Field ${assignment.fieldNumber} exceeds configured field count (${normalizedFieldCount}).`,
      };
    }
    const normalizedRoles = createEmptyFieldRoleIdState();
    for (const role of tournamentFieldRoles) {
      const rawValue = assignment.roles?.[role];
      if (typeof rawValue === "string" && rawValue.trim().length > 0) {
        normalizedRoles[role] = rawValue.trim();
      } else {
        normalizedRoles[role] = null;
      }
    }
    assignmentMap.set(assignment.fieldNumber, normalizedRoles);
  }

  return assignmentMap;
}

async function validateAssignedUsers(
  assignmentMap: Map<number, Record<TournamentFieldRole, string | null>>
): Promise<string | null> {
  const userIds = Array.from(
    new Set(
      [...assignmentMap.values()]
        .flatMap((roles) => tournamentFieldRoles.map((r) => roles[r]).filter(Boolean))
        .map((v) => v as string)
    )
  );

  if (!userIds.length) return null;

  const staffRows = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, type: true, role: true },
  });
  const staffMap = new Map(staffRows.map((s) => [s.id, s]));
  for (const id of userIds) {
    const staff = staffMap.get(id);
    if (!staff || staff.type !== "ORG" || !tournamentFieldRoles.includes(staff.role as TournamentFieldRole)) {
      return "Assignments must reference tournament staff accounts with eligible roles.";
    }
  }
  return null;
}

fieldsRoute.put("/:identifier/field-roles", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const normalizedFieldCount = normalizeFieldCount(tournament.fieldCount);
    const assignmentMapResult = buildAssignmentMap(
      await c.req.json(),
      normalizedFieldCount
    );

    if ("error" in assignmentMapResult) {
      return c.json({ error: assignmentMapResult.error }, 400);
    }

    const validationError = await validateAssignedUsers(assignmentMapResult);
    if (validationError) return c.json({ error: validationError }, 400);

    await prisma.$transaction(async (tx) => {
      await tx.tournamentFieldAssignment.deleteMany({ where: { tournamentId: tournament.id } });

      const toInsert: Array<{ id: string; tournamentId: string; fieldNumber: number; role: TournamentFieldRole; userId: string }> = [];
      for (const [fieldNumber, roles] of assignmentMapResult.entries()) {
        for (const role of tournamentFieldRoles) {
          const assignedUser = roles[role];
          if (assignedUser) {
            toInsert.push({
              id: crypto.randomUUID(),
              tournamentId: tournament.id,
              fieldNumber,
              role,
              userId: assignedUser,
            });
          }
        }
      }
      if (toInsert.length) {
        await tx.tournamentFieldAssignment.createMany({ data: toInsert });
      }
    });

    const assignments = await fetchTournamentFieldAssignments(tournament.id);
    const fieldRolesData = buildFieldRolesResponse(tournament, assignments);

    return c.json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        fieldCount: fieldRolesData.fieldCount,
      },
      fields: fieldRolesData.fields,
    });
  } catch (error) {
    console.error("Failed to update field roles", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to update field roles" }, 500);
  }
});

fieldsRoute.get("/:slug/field-roles/users", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true },
      orderBy: { name: "asc" },
    });

    return c.json({ users });
  } catch (error) {
    console.error("Failed to fetch users", error);
    return c.json({ error: "Unable to fetch users" }, 500);
  }
});

fieldsRoute.get("/:slug/field-roles", async (c: Context) => {
  try {
    const slug = c.req.param("slug");
    if (!slug) return c.json({ error: "Slug is required" }, 400);

    const tournament = await getTournamentByIdentifier(slug);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const tournamentId = tournament.id;
    const fieldCount = tournament.fieldCount;

    const assignments = await prisma.tournamentFieldAssignment.findMany({
      where: { tournamentId },
      include: { user: true },
    });

    return c.json({
      fieldCount,
      assignments: assignments.map((a) => ({
        id: a.id,
        fieldNumber: a.fieldNumber,
        role: a.role,
        user: a.user
          ? { id: a.userId, email: a.user.email, name: a.user.name }
          : null,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch field roles", error);
    return c.json({ error: "Unable to fetch field roles" }, 500);
  }
});

fieldsRoute.post("/:slug/field-roles", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const slug = c.req.param("slug");
    if (!slug) return c.json({ error: "Slug is required" }, 400);

    const body = await c.req.json();
    const schema = z.object({
      userId: z.string(),
      fieldNumber: z.number().int().positive(),
      role: z.enum(tournamentFieldRoles),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error }, 400);
    }

    const { userId, fieldNumber, role } = parsed.data;

    const tournament = await getTournamentByIdentifier(slug);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    if (fieldNumber > (tournament.fieldCount ?? 1)) {
      return c.json({ error: "Invalid field number" }, 400);
    }

    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) return c.json({ error: "User not found" }, 404);

    const existing = await prisma.tournamentFieldAssignment.findFirst({
      where: { tournamentId: tournament.id, fieldNumber, role },
    });

    if (existing) {
      await prisma.tournamentFieldAssignment.update({
        where: { id: existing.id },
        data: { userId, updatedAt: new Date() },
      });
      return c.json({ success: true, id: existing.id });
    }

    const assignmentId = crypto.randomUUID();
    await prisma.tournamentFieldAssignment.create({
      data: { id: assignmentId, tournamentId: tournament.id, userId, fieldNumber, role },
    });

    return c.json({ success: true, id: assignmentId }, 201);
  } catch (error) {
    console.error("Failed to assign field role", error);
    return c.json({ error: "Unable to assign field role" }, 500);
  }
});

fieldsRoute.delete("/:slug/field-roles/:assignmentId", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const assignmentId = c.req.param("assignmentId");
    if (!assignmentId) return c.json({ error: "Assignment ID is required" }, 400);

    await prisma.tournamentFieldAssignment.delete({ where: { id: assignmentId } });
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to delete field role assignment", error);
    return c.json({ error: "Unable to delete assignment" }, 500);
  }
});

export { fieldsRoute };
