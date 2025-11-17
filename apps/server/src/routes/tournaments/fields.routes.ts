import crypto from "node:crypto";
import { auth } from "@rms-modern/auth";
import { type AppDB, db } from "@rms-modern/db";
import { user } from "@rms-modern/db/schema/auth";
import {
  type TournamentFieldRole,
  tournamentFieldAssignments,
  tournamentFieldRoles,
} from "@rms-modern/db/schema/organization";
import { and, asc, eq, inArray } from "drizzle-orm";
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

const fieldsRoute = new Hono();

async function fetchTournamentFieldAssignments(
  tournamentId: string
): Promise<FieldAssignmentRow[]> {
  const assignmentsRows = await (db as AppDB)
    .select({
      id: tournamentFieldAssignments.id,
      fieldNumber: tournamentFieldAssignments.fieldNumber,
      role: tournamentFieldAssignments.role,
      userId: tournamentFieldAssignments.userId,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
    })
    .from(tournamentFieldAssignments)
    .leftJoin(user, eq(user.id, tournamentFieldAssignments.userId))
    .where(eq(tournamentFieldAssignments.tournamentId, tournamentId));
  return assignmentsRows;
}

function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>>
): void {
  if (!session) {
    throw new Error("Forbidden");
  }
  if (session.user.role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

fieldsRoute.get("/:identifier/field-roles", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      await ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

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
        .flatMap((roles) =>
          tournamentFieldRoles.map((role) => roles[role]).filter(Boolean)
        )
        .map((value) => value as string)
    )
  );

  if (!userIds.length) {
    return null;
  }

  const staffRows = await (db as AppDB)
    .select({
      id: user.id,
      type: user.type,
      role: user.role,
    })
    .from(user)
    .where(inArray(user.id, userIds));

  const staffMap = new Map(staffRows.map((staff) => [staff.id, staff]));
  for (const userId of userIds) {
    const staff = staffMap.get(userId);
    if (
      !staff ||
      staff.type !== "ORG" ||
      !tournamentFieldRoles.includes(staff.role as TournamentFieldRole)
    ) {
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

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const normalizedFieldCount = normalizeFieldCount(tournament.fieldCount);
    const assignmentMapResult = buildAssignmentMap(
      await c.req.json(),
      normalizedFieldCount
    );

    if ("error" in assignmentMapResult) {
      return c.json({ error: assignmentMapResult.error }, 400);
    }

    const validationError = await validateAssignedUsers(assignmentMapResult);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    await (db as AppDB).transaction(async (tx) => {
      await tx
        .delete(tournamentFieldAssignments)
        .where(eq(tournamentFieldAssignments.tournamentId, tournament.id));

      const insertValues: Array<{
        id: string;
        tournamentId: string;
        fieldNumber: number;
        role: TournamentFieldRole;
        userId: string;
      }> = [];

      for (const [fieldNumber, roles] of assignmentMapResult.entries()) {
        for (const role of tournamentFieldRoles) {
          const assignedUser = roles[role];
          if (assignedUser) {
            insertValues.push({
              id: crypto.randomUUID(),
              tournamentId: tournament.id,
              fieldNumber,
              role,
              userId: assignedUser,
            });
          }
        }
      }

      if (insertValues.length) {
        await tx.insert(tournamentFieldAssignments).values(insertValues);
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
      await ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const users = await (db as AppDB)
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      })
      .from(user)
      .orderBy(asc(user.name));

    return c.json({ users });
  } catch (error) {
    console.error("Failed to fetch users", error);
    return c.json({ error: "Unable to fetch users" }, 500);
  }
});

fieldsRoute.get("/:slug/field-roles", async (c: Context) => {
  try {
    const { slug } = c.req.param();

    const tournament = await getTournamentByIdentifier(slug);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const tournamentId = tournament.id;
    const fieldCount = tournament.fieldCount;

    const assignments = await (db as AppDB)
      .select({
        id: tournamentFieldAssignments.id,
        fieldNumber: tournamentFieldAssignments.fieldNumber,
        role: tournamentFieldAssignments.role,
        userId: tournamentFieldAssignments.userId,
        userEmail: user.email,
        userName: user.name,
      })
      .from(tournamentFieldAssignments)
      .leftJoin(user, eq(tournamentFieldAssignments.userId, user.id))
      .where(eq(tournamentFieldAssignments.tournamentId, tournamentId));

    return c.json({
      fieldCount,
      assignments: assignments.map((a) => ({
        id: a.id,
        fieldNumber: a.fieldNumber,
        role: a.role,
        user: {
          id: a.userId,
          email: a.userEmail,
          name: a.userName,
        },
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
      await ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { slug } = c.req.param();
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

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const tournamentId = tournament.id;

    if (fieldNumber > tournament.fieldCount) {
      return c.json({ error: "Invalid field number" }, 400);
    }

    // Check if user exists
    const userExists = await (db as AppDB)
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (userExists.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if assignment already exists
    const existing = await (db as AppDB)
      .select()
      .from(tournamentFieldAssignments)
      .where(
        and(
          eq(tournamentFieldAssignments.tournamentId, tournamentId),
          eq(tournamentFieldAssignments.fieldNumber, fieldNumber),
          eq(tournamentFieldAssignments.role, role)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const existingAssignment = existing[0];
      if (!existingAssignment) {
        return c.json({ error: "Existing assignment not found" }, 500);
      }
      // Update existing assignment
      await (db as AppDB)
        .update(tournamentFieldAssignments)
        .set({
          userId,
          updatedAt: new Date(),
        })
        .where(eq(tournamentFieldAssignments.id, existingAssignment.id));

      return c.json({ success: true, id: existingAssignment.id });
    }

    // Create new assignment
    const assignmentId = crypto.randomUUID();
    await (db as AppDB).insert(tournamentFieldAssignments).values({
      id: assignmentId,
      tournamentId,
      userId,
      fieldNumber,
      role,
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
      await ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { assignmentId } = c.req.param();

    await (db as AppDB)
      .delete(tournamentFieldAssignments)
      .where(eq(tournamentFieldAssignments.id, assignmentId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to delete field role assignment", error);
    return c.json({ error: "Unable to delete assignment" }, 500);
  }
});

export { fieldsRoute };
