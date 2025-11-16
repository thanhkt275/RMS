import { Hono } from "hono";
import { z } from "zod";
import { auth } from "@rms-modern/auth";
import { db } from "@rms-modern/db";
import { user } from "@rms-modern/db/schema/auth";
import {
  type TournamentFieldRole,
  tournamentFieldAssignments,
  tournamentFieldRoles,
} from "@rms-modern/db/schema/organization";
import { inArray, eq } from "drizzle-orm";
import crypto from "node:crypto";
import {
  buildFieldRolesResponse,
  createEmptyFieldRoleIdState,
  ensureAdmin,
  fetchTournamentFieldAssignments,
  getTournamentByIdentifier,
  normalizeFieldCount,
} from "./utils";
import { fieldRoleUpdateSchema } from "./schemas";

const fieldsRoute = new Hono();

async function getFieldRoles(c: any) {
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

    const assignments = await fetchTournamentFieldAssignments(tournament.id);

    return c.json(buildFieldRolesResponse(tournament, assignments));
  } catch (error) {
    console.error("Failed to fetch field roles", error);
    return c.json({ error: "Unable to fetch field roles" }, 500);
  }
}

async function updateFieldRoles(c: any) {
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

    const body = fieldRoleUpdateSchema.parse(await c.req.json());
    const normalizedFieldCount = normalizeFieldCount(tournament.fieldCount);

    const assignmentMap = new Map<
      number,
      Record<TournamentFieldRole, string | null>
    >();

    for (const assignment of body.assignments) {
      if (assignment.fieldNumber > normalizedFieldCount) {
        return c.json(
          {
            error: `Field ${assignment.fieldNumber} exceeds configured field count (${normalizedFieldCount}).`,
          },
          400
        );
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

    const userIds = Array.from(
      new Set(
        [...assignmentMap.values()]
          .flatMap((roles) =>
            tournamentFieldRoles.map((role) => roles[role]).filter(Boolean)
          )
          .map((value) => value as string)
      )
    );

    if (userIds.length) {
      const staffRows = await db
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
          return c.json(
            {
              error:
                "Assignments must reference tournament staff accounts with eligible roles.",
            },
            400
          );
        }
      }
    }

    await db.transaction(async (tx) => {
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

      for (const [fieldNumber, roles] of assignmentMap.entries()) {
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

    return c.json(buildFieldRolesResponse(tournament, assignments));
  } catch (error) {
    console.error("Failed to update field roles", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to update field roles" }, 500);
  }
}

fieldsRoute.get("/:identifier/field-roles", getFieldRoles);
fieldsRoute.put("/:identifier/field-roles", updateFieldRoles);

export { fieldsRoute };