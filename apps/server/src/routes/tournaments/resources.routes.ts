import crypto from "node:crypto";
import { auth } from "@rms-modern/auth";
import { type AppDB, db } from "@rms-modern/db";
import {
  tournamentResources,
  tournamentResourceTypes,
} from "@rms-modern/db/schema/organization";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";

import { tournamentResourceSchema } from "./schemas";
import { getTournamentByIdentifier } from "./utils";

const resourcesRoute = new Hono();

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

resourcesRoute.get("/:tournamentId/resources", async (c: Context) => {
  try {
    const { tournamentId } = c.req.param() as { tournamentId: string };

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const resources = await (db as AppDB)
      .select()
      .from(tournamentResources)
      .where(eq(tournamentResources.tournamentId, tournament.id));

    return c.json(resources);
  } catch (error) {
    console.error("Failed to fetch resources:", error);
    return c.json({ error: "Unable to fetch resources" }, 500);
  }
});

resourcesRoute.post("/:tournamentId/resources", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { tournamentId } = c.req.param() as { tournamentId: string };
    const body = tournamentResourceSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const newResource = {
      id: crypto.randomUUID(),
      tournamentId: tournament.id,
      type: body.type,
      title: body.title, // Changed from name to title
      url: body.url,
      description: body.description,
    };

    await (db as AppDB).insert(tournamentResources).values(newResource);

    return c.json(newResource, 201);
  } catch (error) {
    console.error("Failed to create resource:", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to create resource" }, 500);
  }
});

resourcesRoute.patch(
  "/:tournamentId/resources/:resourceId",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, resourceId } = c.req.param() as {
        tournamentId: string;
        resourceId: string;
      };
      const body = tournamentResourceSchema.partial().parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const existingResource = await (db as AppDB)
        .select()
        .from(tournamentResources)
        .where(
          and(
            eq(tournamentResources.tournamentId, tournament.id),
            eq(tournamentResources.id, resourceId)
          )
        )
        .limit(1);

      if (!existingResource.length) {
        return c.json({ error: "Resource not found" }, 404);
      }

      await (db as AppDB)
        .update(tournamentResources)
        .set(body)
        .where(eq(tournamentResources.id, resourceId));

      const updatedResource = await (db as AppDB)
        .select()
        .from(tournamentResources)
        .where(eq(tournamentResources.id, resourceId))
        .limit(1);

      return c.json(updatedResource[0]);
    } catch (error) {
      console.error("Failed to update resource:", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      return c.json({ error: "Unable to update resource" }, 500);
    }
  }
);

resourcesRoute.delete(
  "/:tournamentId/resources/:resourceId",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, resourceId } = c.req.param() as {
        tournamentId: string;
        resourceId: string;
      };

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      await (db as AppDB)
        .delete(tournamentResources)
        .where(
          and(
            eq(tournamentResources.tournamentId, tournament.id),
            eq(tournamentResources.id, resourceId)
          )
        );

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to delete resource:", error);
      return c.json({ error: "Unable to delete resource" }, 500);
    }
  }
);

resourcesRoute.get("/resource-types", (c: Context) => {
  try {
    // tournamentResourceTypes is an array of strings, not a Drizzle table
    return c.json(tournamentResourceTypes);
  } catch (error) {
    console.error("Failed to fetch resource types:", error);
    return c.json({ error: "Unable to fetch resource types" }, 500);
  }
});

export { resourcesRoute };
